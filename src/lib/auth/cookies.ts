export function accessTokenCookie(token: string, maxAgeSeconds: number): string {
  const attrs = [
    `access_token=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ]
  return attrs.join('; ')
}

export function clearAccessTokenCookie(): string {
  return 'access_token=deleted; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
}

export function refreshTokenCookie(token: string, maxAgeSeconds: number): string {
  const attrs = [
    `refresh_token=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ]
  return attrs.join('; ')
}

export function clearRefreshTokenCookie(): string {
  return 'refresh_token=deleted; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
}

