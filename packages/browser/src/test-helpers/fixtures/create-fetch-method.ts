import { CDNSettings } from '../..'
import { createSuccess } from '../factories'
import { cdnSettingsMinimal } from './cdn-settings'

export const createMockFetchImplementation = (
  cdnSettings: Partial<CDNSettings> = cdnSettingsMinimal
) => {
  return (...[url, req]: Parameters<typeof fetch>) => {
    const reqUrl = url.toString()
    const reqMethod = req?.method?.toLowerCase()
    if (!req || (reqMethod === 'get' && reqUrl.includes('cdp.orbite.co'))) {
      // GET https://cdp.orbite.co/v1/projects/{writeKey}
      return createSuccess({ ...cdnSettingsMinimal, ...cdnSettings })
    }

    if (reqMethod === 'post' && reqUrl.includes('cdp.orbite.co')) {
      // POST https://cdp.orbite.co/v1/{event.type}
      return createSuccess({ success: true }, { status: 201 })
    }

    if (reqMethod === 'post' && reqUrl.endsWith('/m')) {
      // POST https://cdp.orbite.co/m
      return createSuccess({ success: true })
    }

    throw new Error(
      `no match found for request (url:${url}, req:${JSON.stringify(req)})`
    )
  }
}
