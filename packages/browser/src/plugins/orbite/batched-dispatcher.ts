import { OrbiteEvent } from '../../core/events'
import { fetch } from '../../lib/fetch'
import { onPageChange } from '../../lib/on-page-change'
import { OrbiteFacade } from '../../lib/to-facade'
import { RateLimitError } from './ratelimit-error'
import { Context } from '../../core/context'
import {
  BatchingDispatchConfig,
  createHeaders,
  kilobytes,
} from './shared-dispatcher'

const MAX_PAYLOAD_SIZE = 500
const MAX_KEEPALIVE_SIZE = 64

/**
 * Checks if the payload is over or close to
 * the maximum payload size allowed by tracking
 * API.
 */
function approachingTrackingAPILimit(buffer: unknown): boolean {
  return kilobytes(buffer) >= MAX_PAYLOAD_SIZE - 50
}

/**
 * Checks if payload is over or approaching the limit for keepalive
 * requests. If keepalive is enabled we want to avoid
 * going over this to prevent data loss.
 */
function passedKeepaliveLimit(buffer: unknown): boolean {
  return kilobytes(buffer) >= MAX_KEEPALIVE_SIZE - 10
}

/**
 * Splits events into chunks that each stay under the keepalive size limit.
 * (A single event larger than the limit still gets its own chunk.)
 */
function chunks(batch: object[]): Array<object[]> {
  const result: object[][] = []
  let current: object[] = []

  batch.forEach((item) => {
    if (current.length && kilobytes([...current, item]) >= MAX_KEEPALIVE_SIZE) {
      result.push(current)
      current = []
    }
    current.push(item)
  })

  if (current.length) {
    result.push(current)
  }

  return result
}

export type BatchingDispatchOptions = {
  /**
   * @default 'https'
   */
  protocol?: string
  /**
   * Called with the contexts of events this dispatcher gave up on (retries exhausted, or
   * not sendable during page unload), so the caller can persist and retry them.
   */
  onUndelivered?: (ctxs: Context[]) => void
}

export default function batch(
  apiHost: string,
  config?: BatchingDispatchConfig,
  options?: BatchingDispatchOptions
) {
  let buffer: object[] = []
  let pageUnloaded = false
  const url = `${options?.protocol ?? 'https'}://${apiHost}/b`
  const contexts = new WeakMap<object, Context>()

  function handOff(events: object[]): void {
    const ctxs = events
      .map((event) => contexts.get(event))
      .filter((ctx): ctx is Context => ctx !== undefined)
    if (ctxs.length) {
      options?.onUndelivered?.(ctxs)
    }
  }

  const limit = config?.size ?? 10
  const timeout = config?.timeout ?? 5000
  let rateLimitTimeout = 0

  function sendBatch(batch: object[]) {
    if (batch.length === 0) {
      return
    }

    const writeKey = (batch[0] as OrbiteEvent)?.writeKey

    // Remove sentAt from every event as batching only needs a single timestamp
    const updatedBatch = batch.map((event) => {
      const { sentAt, ...newEvent } = event as OrbiteEvent
      return newEvent
    })

    return fetch(url, {
      credentials: config?.credentials,
      keepalive: config?.keepalive || pageUnloaded,
      headers: createHeaders(config?.headers),
      method: 'post',
      body: JSON.stringify({
        writeKey,
        batch: updatedBatch,
        sentAt: new Date().toISOString(),
      }),
      // @ts-ignore - not in the ts lib yet
      priority: config?.priority,
    }).then((res) => {
      if (res.status >= 500) {
        throw new Error(`Bad response from server: ${res.status}`)
      }
      if (res.status === 429) {
        const retryTimeoutStringSecs = res.headers?.get('x-ratelimit-reset')
        const retryTimeoutMS =
          typeof retryTimeoutStringSecs == 'string'
            ? parseInt(retryTimeoutStringSecs) * 1000
            : timeout
        throw new RateLimitError(
          `Rate limit exceeded: ${res.status}`,
          retryTimeoutMS
        )
      }
    })
  }

  async function flush(attempt = 1): Promise<unknown> {
    if (buffer.length) {
      const batch = buffer
      buffer = []
      return sendBatch(batch)?.catch((error) => {
        const ctx = Context.system()
        ctx.log('error', 'Error sending batch', error)
        if (attempt <= (config?.maxRetries ?? 10)) {
          if (error.name === 'RateLimitError') {
            rateLimitTimeout = error.retryTimeout
          }
          buffer.push(...batch)
          buffer.map((event) => {
            if ('_metadata' in event) {
              const orbiteEvent = event as ReturnType<OrbiteFacade['json']>
              orbiteEvent._metadata = {
                ...orbiteEvent._metadata,
                retryCount: attempt,
              }
            }
          })
          scheduleFlush(attempt + 1)
        } else {
          handOff(batch)
        }
      })
    }
  }

  let schedule: NodeJS.Timeout | undefined

  function scheduleFlush(attempt = 1): void {
    if (schedule) {
      return
    }

    schedule = setTimeout(
      () => {
        schedule = undefined
        flush(attempt).catch(console.error)
      },
      rateLimitTimeout ? rateLimitTimeout : timeout
    )
    rateLimitTimeout = 0
  }

  onPageChange((unloaded) => {
    pageUnloaded = unloaded

    if (pageUnloaded && buffer.length) {
      const pending = chunks(buffer)
      buffer = []

      if (!options?.onUndelivered) {
        Promise.all(pending.map(sendBatch)).catch(console.error)
        return
      }

      // The keepalive budget (64KB) is shared by all in-flight requests, so only the
      // first chunk can reliably go out now. The rest are handed back to be persisted
      // and sent on the next page load (or when the page becomes visible again).
      const [first, ...rest] = pending
      rest.forEach(handOff)
      sendBatch(first)?.catch((error) => {
        console.error(error)
        handOff(first)
      })
    }
  })

  async function dispatch(
    _url: string,
    body: object,
    ctx?: Context
  ): Promise<unknown> {
    if (ctx) {
      contexts.set(body, ctx)
    }
    buffer.push(body)

    const bufferOverflow =
      buffer.length >= limit ||
      approachingTrackingAPILimit(buffer) ||
      (config?.keepalive && passedKeepaliveLimit(buffer))

    return bufferOverflow || pageUnloaded ? flush() : scheduleFlush()
  }

  return {
    dispatch,
  }
}
