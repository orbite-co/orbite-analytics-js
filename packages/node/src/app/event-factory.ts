import { assertUserIdentity, CoreEventFactory } from '@orbite/analytics-core'
import { createMessageId } from '../lib/get-message-id'
import { OrbiteEvent } from './types'

// use declaration merging to downcast CoreOrbiteEvent without adding any runtime code.
// if/when we decide to add an actual implementation to NodeEventFactory that actually changes the event shape, we can remove this.
export interface NodeEventFactory {
  alias(...args: Parameters<CoreEventFactory['alias']>): OrbiteEvent
  group(...args: Parameters<CoreEventFactory['group']>): OrbiteEvent
  identify(...args: Parameters<CoreEventFactory['identify']>): OrbiteEvent
  track(...args: Parameters<CoreEventFactory['track']>): OrbiteEvent
  page(...args: Parameters<CoreEventFactory['page']>): OrbiteEvent
  screen(...args: Parameters<CoreEventFactory['screen']>): OrbiteEvent
}

export class NodeEventFactory extends CoreEventFactory {
  constructor() {
    super({
      createMessageId,
      onFinishedEvent: (event) => {
        assertUserIdentity(event)
      },
    })
  }
}
