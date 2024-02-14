import type { CoreEmitterContract } from '@orbite/analytics-core'
import { Emitter } from '@segment/analytics-generic-utils'
import { Context } from './context'
import type { AnalyticsSettings } from './settings'
import { OrbiteEvent } from './types'

/**
 * Map of emitter event names to method args.
 */
export type NodeEmitterEvents = CoreEmitterContract<Context> & {
  initialize: [AnalyticsSettings]
  call_after_close: [OrbiteEvent] // any event that did not get dispatched due to close
  http_request: [
    {
      url: string
      method: string
      headers: Record<string, string>
      body: string
    }
  ]
  drained: []
}

export class NodeEmitter extends Emitter<NodeEmitterEvents> {}
