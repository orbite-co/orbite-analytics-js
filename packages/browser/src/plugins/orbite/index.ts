/**
 * Orbite destination plugin.
 *
 * Expected behavior: in the browser, Orbite is the only tracker that publishes
 * events. Every event is sent to the Orbite API (`cdp.orbite.co` by default), and
 * every downstream platform (ad networks, analytics tools, CRMs, ...) receives its
 * data server-side from Orbite, never directly from the page. Device-mode
 * (client-side) destinations are therefore not part of the Orbite setup, which is
 * why first-party context such as cookies (see env-enrichment) is collected
 * here and forwarded to Orbite for server-side delivery.
 */
import { Facade } from '@segment/facade'
import { Analytics } from '../../core/analytics'
import { CDNSettings } from '../../browser'
import { isOffline } from '../../core/connection'
import { Context } from '../../core/context'
import { Plugin } from '../../core/plugin'
import { PriorityQueue } from '../../lib/priority-queue'
import { PersistedPriorityQueue } from '../../lib/priority-queue/persisted'
import { toFacade } from '../../lib/to-facade'
import batch from './batched-dispatcher'
import standard from './fetch-dispatcher'
import { normalize } from './normalize'
import { scheduleFlush } from './schedule-flush'
import { ORBITE_API_HOST } from '../../core/constants'
import { DeliveryStrategy, kilobytes } from './shared-dispatcher'

export type OrbiteSettings = {
  apiKey: string
  apiHost?: string
  protocol?: 'http' | 'https'

  addBundledMetadata?: boolean
  unbundledIntegrations?: string[]
  bundledConfigIds?: string[]
  unbundledConfigIds?: string[]

  maybeBundledConfigIds?: Record<string, string[]>

  deliveryStrategy?: DeliveryStrategy
}

type JSON = ReturnType<Facade['json']>

/**
 * Size above which a single event payload is flagged as oversized. Large payloads
 * (usually driven by `context.cookies`) risk being rejected by the API, and requests
 * over 64KB cannot be sent with `keepalive` (e.g. on page unload).
 * Oversized events are still sent; this is only a warning.
 */
export const MAX_EVENT_SIZE_KB = 32

let warnedOversizedPayload = false

function flagOversizedPayload(ctx: Context, payload: object): void {
  const size = kilobytes(payload)
  if (size <= MAX_EVENT_SIZE_KB) return

  const cookiesSize = kilobytes((payload as JSON).context?.cookies ?? {})
  const message = `Orbite event payload is ${size.toFixed(
    1
  )}KB (limit ${MAX_EVENT_SIZE_KB}KB), of which context.cookies is ${cookiesSize.toFixed(
    1
  )}KB.`
  ctx.log('warn', message, { size, cookiesSize })
  ctx.stats.increment('orbite.payload_oversized')
  if (!warnedOversizedPayload) {
    warnedOversizedPayload = true
    console.warn(message)
  }
}

function onAlias(analytics: Analytics, json: JSON): JSON {
  const user = analytics.user()
  json.previousId =
    json.previousId ?? json.from ?? user.id() ?? user.anonymousId()
  json.userId = json.userId ?? json.to
  delete json.from
  delete json.to
  return json
}

export type OrbitePluginMetadata = {
  writeKey: string
  apiHost: string
  protocol: string
}
export interface OrbiteDestinationPlugin extends Plugin {
  metadata: OrbitePluginMetadata
}

export const isOrbitePlugin = (
  plugin: Plugin
): plugin is OrbiteDestinationPlugin => {
  return plugin.name === 'Orbite'
}

export function orbite(
  analytics: Analytics,
  settings?: OrbiteSettings,
  integrations?: CDNSettings['integrations']
): Plugin {
  // Attach `pagehide` before buffer is created so that inflight events are added
  // to the buffer before the buffer persists events in its own `pagehide` handler.
  window.addEventListener('pagehide', () => {
    buffer.push(...Array.from(inflightEvents))
    inflightEvents.clear()
  })

  const writeKey = settings?.apiKey ?? ''

  const apiHost = settings?.apiHost ?? ORBITE_API_HOST
  const protocol = settings?.protocol ?? 'https'
  const remote = `${protocol}://${apiHost}`

  // Also created before the buffer: the batching dispatcher's unload handler must run
  // before the buffer persists, so events it hands back are saved for the next page load.
  const deliveryStrategy = settings?.deliveryStrategy
  const client =
    deliveryStrategy &&
    'strategy' in deliveryStrategy &&
    deliveryStrategy.strategy === 'batching'
      ? batch(apiHost, deliveryStrategy.config, {
          protocol,
          onUndelivered: (ctxs) => {
            ctxs.forEach((ctx) => buffer.pushWithBackoff(ctx))
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            scheduleFlush(flushing, buffer, orbite, scheduleFlush)
          },
        })
      : standard(deliveryStrategy?.config)

  const buffer = analytics.options.disableClientPersistence
    ? new PriorityQueue<Context>(analytics.queue.queue.maxAttempts, [])
    : new PersistedPriorityQueue(
        analytics.queue.queue.maxAttempts,
        `${writeKey}:dest-Orbite`
      )

  const inflightEvents = new Set<Context>()
  const flushing = false

  async function send(ctx: Context): Promise<Context> {
    if (isOffline()) {
      buffer.push(ctx)
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      scheduleFlush(flushing, buffer, orbite, scheduleFlush)
      return ctx
    }

    inflightEvents.add(ctx)

    const path = ctx.event.type.charAt(0)

    let json = toFacade(ctx.event).json()

    if (ctx.event.type === 'track') {
      delete json.traits
    }

    if (ctx.event.type === 'alias') {
      json = onAlias(analytics, json)
    }

    if (buffer.getAttempts(ctx) >= buffer.maxAttempts) {
      inflightEvents.delete(ctx)
      return ctx
    }

    const payload = normalize(analytics, json, settings, integrations, ctx)
    flagOversizedPayload(ctx, payload)

    return client
      .dispatch(`${remote}/${path}`, payload, ctx)
      .then(() => ctx)
      .catch((error) => {
        ctx.log('error', 'Error sending event', error)
        if (error.name === 'RateLimitError') {
          const timeout = error.retryTimeout
          buffer.pushWithBackoff(ctx, timeout)
        } else {
          buffer.pushWithBackoff(ctx)
        }
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        scheduleFlush(flushing, buffer, orbite, scheduleFlush)
        return ctx
      })
      .finally(() => {
        inflightEvents.delete(ctx)
      })
  }

  const orbite: OrbiteDestinationPlugin = {
    metadata: {
      writeKey,
      apiHost,
      protocol,
    },
    name: 'Orbite',
    type: 'destination',
    version: '0.1.0',
    isLoaded: (): boolean => true,
    load: (): Promise<void> => Promise.resolve(),
    track: send,
    identify: send,
    page: send,
    alias: send,
    group: send,
    screen: send,
  }

  // Buffer may already have items if they were previously stored in localStorage.
  // Start flushing them immediately.
  if (buffer.todo) {
    scheduleFlush(flushing, buffer, orbite, scheduleFlush)
  }

  return orbite
}
