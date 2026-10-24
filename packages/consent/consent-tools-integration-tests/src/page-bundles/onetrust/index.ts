import { AnalyticsBrowser } from '@orbite/analytics-js'
import { withOneTrust } from '@segment/analytics-consent-wrapper-onetrust'

const analytics = new AnalyticsBrowser()

withOneTrust(analytics).load(
  {
    writeKey: 'foo',
  },
  { initialPageview: true }
)
;(window as any).analytics = analytics
