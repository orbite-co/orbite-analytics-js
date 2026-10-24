import { validateSettings } from '../app/settings'

describe('validateSettings', () => {
  it('should throw an error if no write key', () => {
    expect(() => validateSettings({ writeKey: undefined as any })).toThrowError(
      /writeKey/i
    )
  })

  it('should throw an error if oauth is enabled without an authServer', () => {
    expect(() =>
      validateSettings({
        writeKey: 'foo',
        oauthSettings: {
          clientId: 'id',
          clientKey: 'key',
          keyId: 'kid',
        } as any,
      })
    ).toThrowError(/authServer/i)
  })
})
