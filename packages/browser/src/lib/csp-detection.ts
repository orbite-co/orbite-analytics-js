import { loadScript } from './load-script'
import { getLegacyAJSPath } from './parse-cdn'

type CSPErrorEvent = SecurityPolicyViolationEvent & {
  disposition?: 'enforce' | 'report'
}
export const isAnalyticsCSPError = (e: CSPErrorEvent) => {
  return e.disposition !== 'report' && e.blockedURI.includes('cdp.orbite')
}

export async function loadAjsClassicFallback(): Promise<void> {
  console.warn(
    'Your CSP policy is missing permissions required in order to run Analytics.js 2.0'
  )
  console.warn('Reverting to Analytics.js 1.0')

  const classicPath = getLegacyAJSPath()
  await loadScript(classicPath)
}
