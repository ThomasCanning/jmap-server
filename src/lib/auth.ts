import { APIGatewayProxyEventV2 } from 'aws-lambda'
import { CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose'

const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
  maxAttempts: 2,
  requestHandler: new NodeHttpHandler({
    requestTimeout: 3000,
    connectionTimeout: 1000,
  }),
})

export type AuthResult =
  | { ok: true; username?: string; bearerToken?: string; claims?: JWTPayload }
  | { ok: false; statusCode: number; message: string }

export function getHeader(event: APIGatewayProxyEventV2, name: string): string | undefined {
  const h = event.headers
  if (!h) return undefined
  return (h[name] ?? h[name.toLowerCase()] ?? h[name.toUpperCase()]) as string | undefined
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  const out: Record<string, string> = {}
  header.split(';').forEach((part) => {
    const [k, ...rest] = part.trim().split('=')
    if (!k) return
    out[k] = decodeURIComponent(rest.join('='))
  })
  return out
}

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

export async function verifyBasicWithCognito(
  authorizationHeader: string | undefined,
  userPoolClientId: string
): Promise<AuthResult> {
  if (!authorizationHeader?.startsWith('Basic ')) {
    return { ok: false, statusCode: 401, message: 'Missing Basic auth' }
  }
  let decoded: string
  try {
    decoded = Buffer.from(authorizationHeader.slice(6), 'base64').toString('utf8')
  } catch {
    return { ok: false, statusCode: 400, message: 'Invalid Base64' }
  }
  const sep = decoded.indexOf(':')
  if (sep < 0) return { ok: false, statusCode: 400, message: 'Invalid Basic format' }
  const username = decoded.slice(0, sep)
  const password = decoded.slice(sep + 1)

  try {
    const start = Date.now()
    console.info('[auth] InitiateAuth USER_PASSWORD_AUTH start', {
      username,
      clientId: userPoolClientId,
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
    })
    const cmd = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: userPoolClientId,
      AuthParameters: { USERNAME: username, PASSWORD: password },
    })
    const res = await cognito.send(cmd)
    const ms = Date.now() - start
    console.info('[auth] InitiateAuth response', {
      durationMs: ms,
      challenge: res.ChallengeName ?? null,
      hasAuthenticationResult: !!res.AuthenticationResult,
    })
    const token = res.AuthenticationResult?.AccessToken
    if (!token) return { ok: false, statusCode: 502, message: 'No access token from Cognito' }
    return { ok: true, username, bearerToken: token }
  } catch (e) {
    const err = e as Error
    console.error('[auth] InitiateAuth error', { message: err.message })
    return { ok: false, statusCode: 401, message: 'Invalid credentials' }
  }
}

export async function verifyBearerFromEvent(
  event: APIGatewayProxyEventV2,
  userPoolClientId: string
): Promise<AuthResult> {
  const authz = getHeader(event, 'authorization')
  const cookieHeader = getHeader(event, 'cookie')
  let token: string | undefined
  if (authz?.startsWith('Bearer ')) token = authz.slice(7)
  if (!token) {
    const cookies = parseCookies(cookieHeader)
    if (cookies['access_token']) token = cookies['access_token']
  }
  if (!token) return { ok: false, statusCode: 401, message: 'Missing Bearer token' }

  try {
    // Decode header to get issuer without verifying
    const parts = token.split('.')
    if (parts.length < 2) return { ok: false, statusCode: 400, message: 'Invalid JWT' }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) as JWTPayload
    const iss = payload.iss as string | undefined
    if (!iss) return { ok: false, statusCode: 400, message: 'Missing iss' }
    const JWKS = createRemoteJWKSet(new URL(`${iss}/.well-known/jwks.json`))
    const { payload: claims } = await jwtVerify(token, JWKS, {
      audience: userPoolClientId,
      issuer: iss,
    })
    return { ok: true, claims, bearerToken: token }
  } catch (e) {
    return { ok: false, statusCode: 401, message: 'Invalid token' }
  }
}

// We avoid sending WWW-Authenticate entirely to prevent browser prompts.
export function unauthorizedHeadersFor(_event: APIGatewayProxyEventV2): Record<string, string> {
  return { 'Content-Type': 'application/json' }
}

// For browser requests (Origin present) use 403 to avoid native prompt behavior.
export function unauthorizedStatusFor(event: APIGatewayProxyEventV2): number {
  const origin = getHeader(event, 'origin')
  return origin ? 403 : 401
}

export function corsHeaders(event: APIGatewayProxyEventV2): Record<string, string> {
  const origin = getHeader(event, 'origin')
  const headers: Record<string, string> = {}
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Vary'] = 'Origin'
    headers['Access-Control-Allow-Credentials'] = 'true'
    headers['Access-Control-Allow-Headers'] = 'authorization, content-type'
    headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
  }
  return headers
}


