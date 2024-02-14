import { mergedOptions } from '../merged-options'

describe(mergedOptions, () => {
  it('merges options', () => {
    const merged = mergedOptions(
      {
        integrations: {
          CustomerIO: {},
          Amplitude: {
            apiKey: '🍌',
          },
        },
      },
      {
        integrations: {
          CustomerIO: {
            ghost: '👻',
          },
        },
      }
    )

    expect(merged).toMatchInlineSnapshot(`
      {
        "Amplitude": {
          "apiKey": "🍌",
        },
        "CustomerIO": {
          "ghost": "👻",
        },
      }
    `)
  })

  it('ignores options for integrations that arent returned by CDN', () => {
    const merged = mergedOptions(
      {
        integrations: {
          Amplitude: {
            apiKey: '🍌',
          },
        },
      },
      {
        integrations: {
          // not in CDN
          CustomerIO: {
            ghost: '👻',
          },
        },
      }
    )

    expect(merged).toMatchInlineSnapshot(`
      {
        "Amplitude": {
          "apiKey": "🍌",
        },
      }
    `)
  })

  it('does not attempt to merge non objects', () => {
    const merged = mergedOptions(
      {
        integrations: {
          CustomerIO: {
            ghost: '👻',
          },
          Amplitude: {
            apiKey: '🍌',
          },
        },
      },
      {
        integrations: {
          // disabling customerIO as an integration override
          CustomerIO: false,
        },
      }
    )

    expect(merged).toMatchInlineSnapshot(`
      {
        "Amplitude": {
          "apiKey": "🍌",
        },
        "CustomerIO": {
          "ghost": "👻",
        },
      }
    `)
  })

  it('works with boolean overrides', () => {
    const cdn = {
      integrations: {
        'Orbite': { apiHost: 'cdp.orbite.co' },
        'Google Tag Manager': {
          ghost: '👻',
        },
      },
    }
    const overrides = {
      integrations: {
        All: false,
        'Orbite': { apiHost: 'mgs.instacart.com/v2' },
        'Google Tag Manager': true,
      },
    }

    expect(mergedOptions(cdn, overrides)).toMatchInlineSnapshot(`
      {
        "Google Tag Manager": {
          "ghost": "👻",
        },
        "Orbite": {
          "apiHost": "mgs.instacart.com/v2",
        },
      }
    `)
  })
})
