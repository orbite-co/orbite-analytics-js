import {
  CoreContext,
  ContextCancelation,
  ContextFailedDelivery,
  SerializedContext,
  CancelationOptions,
} from '@orbite/analytics-core'
import { OrbiteEvent } from '../events/interfaces'
import { Stats } from '../stats'

export class Context extends CoreContext<OrbiteEvent> {
  static override system() {
    return new this({ type: 'track', event: 'system' })
  }
  constructor(event: OrbiteEvent, id?: string) {
    super(event, id, new Stats())
  }
}

export { ContextCancelation }
export type { ContextFailedDelivery, SerializedContext, CancelationOptions }
