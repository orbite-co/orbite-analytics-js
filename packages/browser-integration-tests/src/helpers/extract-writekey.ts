export function extractWriteKeyFromUrl(url: string): string | undefined {
  const matches = url.match(
    /https:\/\/cdp.orbite.co\/v1\/projects\/(.+)\/settings/
  )

  if (matches) {
    return matches[1]
  }
}
