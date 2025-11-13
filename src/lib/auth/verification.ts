import { APIGatewayProxyEventV2 } from 'aws-lambda'
import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose'
import { AuthResult } from './types'
import { getHeader, parseCookies } from './headers'

/**
 * Verifies a Bearer token from the request.
 * Checks cookies first (for browser clients), then Authorization header (for API clients).
 * 
 * @param event - API Gateway event
 * @param userPoolClientId - Cognito User Pool Client ID for validation
 * @returns AuthResult with verified token and claims, or error
 */
export async function verifyBearerFromEvent(
  event: APIGatewayProxyEventV2,
  userPoolClientId: string
): Promise<AuthResult> {
  let token: string | undefined

  // 1) Check cookies first (browser-based auth)
  // API Gateway V2 provides cookies as an array
  const cookiesArray = event.cookies || []
  for (const cookie of cookiesArray) {
    if (cookie.startsWith('access_token=')) {
      token = cookie.substring('access_token='.length)
      break
    }
  }
  
  // Fallback: check Cookie header for compatibility
  if (!token) {
    const cookieHeader = getHeader(event, 'cookie')
    if (cookieHeader) {
      const cookies = parseCookies(cookieHeader)
      token = cookies['access_token']
    }
  }

  // 2) If no token in cookies, check Authorization header for Bearer token
  if (!token) {
    const authz = getHeader(event, 'authorization')
    if (authz?.startsWith('Bearer ')) {
      token = authz.slice(7)
    }
  }

  if (!token) {
    return { ok: false, statusCode: 401, message: 'Missing Bearer token' }
  }

  try {
    // Parse JWT to get issuer (without verifying signature yet)
    const parts = token.split('.')
    if (parts.length < 2) {
      return { ok: false, statusCode: 400, message: 'Invalid JWT' }
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) as JWTPayload
    const iss = payload.iss as string | undefined
    if (!iss) {
      return { ok: false, statusCode: 400, message: 'Missing iss' }
    }

    // Fetch JWKS and verify signature
    const JWKS = createRemoteJWKSet(new URL(`${iss}/.well-known/jwks.json`))
    const { payload: claims } = await jwtVerify(token, JWKS, {
      issuer: iss,
    })

    // Post-verification: validate token type and client ID
    // Cognito AccessTokens use 'client_id', not 'aud' claim
    const tokenUse = (claims as any).token_use as string | undefined
    const clientIdClaim = (claims as any).client_id as string | undefined
    const audienceClaim = claims.aud as string | string[] | undefined

    if (tokenUse === 'access') {
      if (clientIdClaim !== userPoolClientId) {
        return { ok: false, statusCode: 401, message: 'Invalid token' }
      }
    } else if (tokenUse === 'id' || audienceClaim) {
      // ID tokens use 'aud' claim
      const audOk = Array.isArray(audienceClaim)
        ? audienceClaim.includes(userPoolClientId)
        : audienceClaim === userPoolClientId
      if (!audOk) {
        return { ok: false, statusCode: 401, message: 'Invalid token' }
      }
    } else {
      return { ok: false, statusCode: 401, message: 'Invalid token' }
    }

    return { ok: true, claims, bearerToken: token }
  } catch (e) {
    const err = e as Error
    console.error('[auth] Token verification failed', {
      error: err.message,
      errorName: err.name,
    })
    return { ok: false, statusCode: 401, message: 'Invalid token' }
  }
}

