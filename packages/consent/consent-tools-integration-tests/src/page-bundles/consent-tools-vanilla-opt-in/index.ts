import { AnalyticsBrowser } from '@orbite/analytics-js'
import { initMockConsentManager } from '../helpers/mock-cmp'
import { withMockCMP } from '../helpers/mock-cmp-wrapper'

initMockConsentManager({ consentModel: 'opt-in' })

const analytics = new AnalyticsBrowser()

// for testing
;(window as any).analytics = analytics

withMockCMP(analytics).load({
  writeKey: 'foo',
})
