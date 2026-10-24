import assert from 'assert'
import unfetch from 'unfetch'
import { orbite, OrbiteSettings, MAX_EVENT_SIZE_KB } from '..'
import { Analytics } from '../../../core/analytics'
import { Plugin } from '../../../core/plugin'
import { envEnrichment } from '../../env-enrichment'
import cookie from 'js-cookie'
import { cdnSettingsMinimal } from '../../../test-helpers/fixtures'

jest.mock('unfetch', () => {
  return jest.fn()
})

describe('Orbite', () => {
  let options: OrbiteSettings
  let analytics: Analytics
  let segment: Plugin
  let spyMock: jest.SpyInstance

  beforeEach(async () => {
    jest.resetAllMocks()
    jest.restoreAllMocks()

    options = { apiKey: 'foo' }
    analytics = new Analytics({ writeKey: options.apiKey })
    segment = await orbite(analytics, options, cdnSettingsMinimal.integrations)

    await analytics.register(segment, envEnrichment)

    window.localStorage.clear()

    spyMock = jest.mocked(unfetch).mockResolvedValue({
      ok: true,
    } as Response)
  })

  function resetCookies(): void {
    Object.keys(cookie.get()).map((key) => cookie.remove(key))
  }

  afterEach(async () => {
    analytics.reset()
    resetCookies()

    window.localStorage.clear()
  })

  describe('using a custom protocol', () => {
    it('should be able to send http requests', async () => {
      const options: {
        apiKey: string
        protocol: 'http' | 'https'
      } = {
        apiKey: 'foo',
        protocol: 'http',
      }
      const analytics = new Analytics({ writeKey: options.apiKey })
      const segment = await orbite(
        analytics,
        options,
        cdnSettingsMinimal.integrations
      )
      await analytics.register(segment, envEnrichment)

      // @ts-ignore test a valid ajsc page call
      await analytics.page(null, { foo: 'bar' })

      const [url] = spyMock.mock.calls[0]
      expect(url).toMatchInlineSnapshot(`"http://cdp.orbite.co/v1/p"`)
    })

    it('should use the protocol when batching', async () => {
      const analytics = new Analytics({ writeKey: 'foo' })
      const plugin = await orbite(
        analytics,
        {
          apiKey: 'foo',
          protocol: 'http',
          deliveryStrategy: { strategy: 'batching', config: { size: 1 } },
        },
        cdnSettingsMinimal.integrations
      )
      await analytics.register(plugin, envEnrichment)

      await analytics.track('event')

      const [url] = spyMock.mock.calls[0]
      expect(url).toBe('http://cdp.orbite.co/v1/b')
    })
  })

  describe('configuring fetch credentials', () => {
    it('should accept fetch credentials configuration', async () => {
      const analytics = new Analytics({ writeKey: 'foo' })

      await analytics.register(
        await orbite(analytics, {
          apiKey: '',
          deliveryStrategy: {
            config: {
              credentials: 'include',
            },
          },
        })
      )

      await analytics.track('foo')
      const [_, params] = spyMock.mock.lastCall
      expect(params.credentials).toBe('include')
    })
  })

  describe('configuring headers', () => {
    it('should accept additional headers', async () => {
      const analytics = new Analytics({ writeKey: 'foo' })

      await analytics.register(
        await orbite(analytics, {
          apiKey: '',
          deliveryStrategy: {
            config: {
              headers: {
                'X-My-Header': 'foo',
              },
            },
          },
        })
      )

      await analytics.track('foo')
      const [_, params] = spyMock.mock.lastCall
      expect(params.headers['X-My-Header']).toBe('foo')
      expect(params.headers['Content-Type']).toBe('text/plain')
    })

    it('should allow additional headers to be a function', async () => {
      const analytics = new Analytics({ writeKey: 'foo' })

      await analytics.register(
        await orbite(analytics, {
          apiKey: '',
          deliveryStrategy: {
            config: {
              headers: () => ({
                'X-My-Header': 'foo',
              }),
            },
          },
        })
      )

      await analytics.track('foo')
      const [_, params] = spyMock.mock.lastCall
      expect(params.headers['X-My-Header']).toBe('foo')
      expect(params.headers['Content-Type']).toBe('text/plain')
    })

    it('should allow content type to be overridden', async () => {
      const analytics = new Analytics({ writeKey: 'foo' })

      await analytics.register(
        await orbite(analytics, {
          apiKey: '',
          deliveryStrategy: {
            config: {
              headers: () => ({
                'Content-Type': 'bar',
              }),
            },
          },
        })
      )

      await analytics.track('foo')
      const [_, params] = spyMock.mock.lastCall
      expect(params.headers['Content-Type']).toBe('bar')
    })
  })

  describe('configuring fetch priority', () => {
    it('should accept fetch priority configuration', async () => {
      const analytics = new Analytics({ writeKey: 'foo' })

      await analytics.register(
        await orbite(analytics, {
          apiKey: '',
          deliveryStrategy: {
            config: {
              priority: 'high',
            },
          },
        })
      )

      await analytics.track('foo')
      const [_, params] = spyMock.mock.lastCall
      expect(params.priority).toBe('high')
    })
  })

  describe('configuring keepalive', () => {
    it('should accept keepalive configuration', async () => {
      const analytics = new Analytics({ writeKey: 'foo' })

      await analytics.register(
        await orbite(analytics, {
          apiKey: '',
          deliveryStrategy: {
            config: {
              keepalive: true,
            },
          },
        })
      )

      await analytics.track('foo')
      const [_, params] = spyMock.mock.lastCall
      expect(params.keepalive).toBe(true)
    })

    it('should default to no keepalive', async () => {
      const analytics = new Analytics({ writeKey: 'foo' })

      const segment = await orbite(analytics, {
        apiKey: '',
      })
      await analytics.register(await segment)
      await analytics.track('foo')

      const [_, params] = spyMock.mock.lastCall
      expect(params.keepalive).toBeUndefined()
    })
  })

  describe('#page', () => {
    it('should enqueue section, name and properties', async () => {
      await analytics.page('section', 'name', { property: true }, { opt: true })

      const [url, params] = spyMock.mock.calls[0]
      expect(url).toMatchInlineSnapshot(`"https://cdp.orbite.co/v1/p"`)

      const body = JSON.parse(params.body)

      assert(body.name === 'name')
      assert(body.category === 'section')
      assert(body.properties.property === true)
      assert(body.context.opt === true)
      assert(body.timestamp)
    })

    it('sets properties when name and category are null', async () => {
      // @ts-ignore test a valid ajsc page call
      await analytics.page(null, { foo: 'bar' })

      const [url, params] = spyMock.mock.calls[0]
      expect(url).toMatchInlineSnapshot(`"https://cdp.orbite.co/v1/p"`)

      const body = JSON.parse(params.body)

      assert(body.properties.foo === 'bar')
    })
  })

  describe('#identify', () => {
    it('should enqueue an id and traits', async () => {
      await analytics.identify('id', { trait: true }, { opt: true })

      const [url, params] = spyMock.mock.calls[0]
      expect(url).toMatchInlineSnapshot(`"https://cdp.orbite.co/v1/i"`)

      const body = JSON.parse(params.body)
      assert(body.userId === 'id')
      assert(body.traits.trait === true)
      assert(body.context.opt === true)
      assert(body.timestamp)
    })

    it('should set traits with null id', async () => {
      await analytics.identify(null, { trait: true }, { opt: true })

      const [url, params] = spyMock.mock.calls[0]
      expect(url).toMatchInlineSnapshot(`"https://cdp.orbite.co/v1/i"`)

      const body = JSON.parse(params.body)
      assert(body.userId === null)
      assert(body.traits.trait === true)
      assert(!body.context.trait)
      assert(body.context.opt === true)
      assert(body.timestamp)
    })
  })

  describe('#track', () => {
    it('should enqueue an event and properties', async () => {
      await analytics.track('event', { prop: true }, { opt: true })
      const [url, params] = spyMock.mock.calls[0]
      expect(url).toMatchInlineSnapshot(`"https://cdp.orbite.co/v1/t"`)

      const body = JSON.parse(params.body)

      assert(body.event === 'event')
      assert(body.context.opt === true)
      assert(body.properties.prop === true)
      assert(body.traits == null)
      assert(body.timestamp)
    })
  })

  describe('#group', () => {
    it('should enqueue groupId and traits', async () => {
      await analytics.group('id', { trait: true }, { opt: true })

      const [url, params] = spyMock.mock.calls[0]
      expect(url).toMatchInlineSnapshot(`"https://cdp.orbite.co/v1/g"`)

      const body = JSON.parse(params.body)

      assert(body.groupId === 'id')
      assert(body.context.opt === true)
      assert(body.traits.trait === true)
      assert(body.timestamp)
    })

    it('should set traits with null id', async () => {
      await analytics.group(null, { trait: true }, { opt: true })

      const [url, params] = spyMock.mock.calls[0]
      expect(url).toMatchInlineSnapshot(`"https://cdp.orbite.co/v1/g"`)

      const body = JSON.parse(params.body)

      assert(body.groupId === null)
      assert(body.context.opt === true)
      assert(body.traits.trait === true)
      assert(!body.context.trait)
      assert(body.timestamp)
    })
  })

  describe('#alias', () => {
    it('should enqueue .userId and .previousId', async () => {
      await analytics.alias('to', 'from')
      const [url, params] = spyMock.mock.calls[0]
      expect(url).toMatchInlineSnapshot(`"https://cdp.orbite.co/v1/a"`)

      const body = JSON.parse(params.body)
      assert(body.previousId === 'from')
      assert(body.userId === 'to')
      assert(body.timestamp)
    })

    it('should fallback to user.anonymousId if .previousId is omitted', async () => {
      analytics.user().anonymousId('anon-id')
      await analytics.alias('to')

      const [url, params] = spyMock.mock.calls[0]
      expect(url).toMatchInlineSnapshot(`"https://cdp.orbite.co/v1/a"`)

      const body = JSON.parse(params.body)
      assert(body.previousId === 'anon-id')
      assert(body.userId === 'to')
      assert(body.timestamp)
    })

    it('should fallback to user.anonymousId if .previousId and user.id are falsey', async () => {
      await analytics.alias('to')
      const [url, params] = spyMock.mock.calls[0]
      expect(url).toMatchInlineSnapshot(`"https://cdp.orbite.co/v1/a"`)

      const body = JSON.parse(params.body)
      assert(body.previousId)
      assert(body.previousId.length === 36)
      assert(body.userId === 'to')
    })

    it('should rename `.from` and `.to` to `.previousId` and `.userId`', async () => {
      await analytics.alias('user-id', 'previous-id')
      const [url, params] = spyMock.mock.calls[0]
      expect(url).toMatchInlineSnapshot(`"https://cdp.orbite.co/v1/a"`)

      const body = JSON.parse(params.body)
      assert(body.previousId === 'previous-id')
      assert(body.userId === 'user-id')
      assert(body.from == null)
      assert(body.to == null)
    })
  })

  describe('#screen', () => {
    it('should enqueue section, name and properties', async () => {
      await analytics.screen(
        'section',
        'name',
        { property: true },
        { opt: true }
      )

      const [url, params] = spyMock.mock.calls[0]
      expect(url).toMatchInlineSnapshot(`"https://cdp.orbite.co/v1/s"`)

      const body = JSON.parse(params.body)

      assert(body.name === 'name')
      assert(body.category === 'section')
      assert(body.properties.property === true)
      assert(body.context.opt === true)
      assert(body.timestamp)
    })

    it('sets properties when name and category are null', async () => {
      // @ts-ignore test a valid ajsc page call
      await analytics.screen(null, { foo: 'bar' })

      const [url, params] = spyMock.mock.calls[0]
      expect(url).toMatchInlineSnapshot(`"https://cdp.orbite.co/v1/s"`)

      const body = JSON.parse(params.body)

      assert(body.properties.foo === 'bar')
    })
  })

  describe('payload size', () => {
    it('flags payloads above MAX_EVENT_SIZE_KB but still sends them', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      cookie.set('big_cookie', 'x'.repeat(3000))
      const ctx = await analytics.track('event', {
        blob: 'y'.repeat(MAX_EVENT_SIZE_KB * 1024),
      })

      expect(spyMock).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Orbite event payload is')
      )
      expect(ctx.logs().some((l) => l.level === 'warn')).toBe(true)
    })

    it('does not flag regular payloads', async () => {
      const ctx = await analytics.track('event', { small: true })
      expect(spyMock).toHaveBeenCalledTimes(1)
      expect(
        ctx
          .logs()
          .some((l) => String(l.message).includes('Orbite event payload'))
      ).toBe(false)
    })
  })
})
