import type { CoreOrbiteEvent } from '@orbite/analytics-core'

type OrbiteEventType = 'track' | 'page' | 'identify' | 'alias' | 'screen'

export interface OrbiteEvent extends CoreOrbiteEvent {
  type: OrbiteEventType
}
