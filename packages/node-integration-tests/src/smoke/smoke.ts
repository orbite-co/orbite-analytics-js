import { default as AnalyticsDefaultImport } from '@orbite/analytics-node'
import { Analytics as AnalyticsNamedImport } from '@orbite/analytics-node'

{
  // test named imports vs default imports
  new AnalyticsNamedImport({ writeKey: 'hello world' })
  new AnalyticsDefaultImport({ writeKey: 'hello world' })
}
