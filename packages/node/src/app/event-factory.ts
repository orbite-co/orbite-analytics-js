import { EventFactory } from '@orbite/analytics-core'
import { createMessageId } from '../lib/get-message-id'
import { OrbiteEvent } from './types'

// use declaration merging to downcast CoreOrbiteEvent without adding any runtime code.
// if/when we decide to add an actual implementation to NodeEventFactory that actually changes the event shape, we can remove this.
export interface NodeEventFactory {
  alias(...args: Parameters<EventFactory['alias']>): OrbiteEvent
  group(...args: Parameters<EventFactory['group']>): OrbiteEvent
  identify(...args: Parameters<EventFactory['identify']>): OrbiteEvent
  track(...args: Parameters<EventFactory['track']>): OrbiteEvent
  page(...args: Parameters<EventFactory['page']>): OrbiteEvent
  screen(...args: Parameters<EventFactory['screen']>): OrbiteEvent
}

export class NodeEventFactory extends EventFactory {
  constructor() {
    super({ createMessageId })
  }
}
