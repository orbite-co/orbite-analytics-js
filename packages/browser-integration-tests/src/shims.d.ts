import type { AnalyticsSnippet } from '@orbite/analytics-js'

declare global {
  interface Window {
    analytics: AnalyticsSnippet
  }
}
