import { APIGatewayProxyEventV2 } from 'aws-lambda'
import { jwtVerify, createRemoteJWKSet, decodeJwt } from 'jose'
import { AuthResult, CognitoJWTClaims } from './types'
import { getHeader } from './headers'
import { getTokenFromCookies } from './cookies'

export async function verifyBearerFromEvent(
  event: APIGatewayProxyEventV2,
  userPoolClientId: string
): Promise<AuthResult> {
  let token = getTokenFromCookies(event, 'access_token')

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
    let iss: string
    try {
      const decoded = decodeJwt(token)
      
      const issuerClaim = decoded.iss
      if (!issuerClaim || typeof issuerClaim !== 'string') {
        return { ok: false, statusCode: 401, message: 'Invalid token: missing issuer' }
      }

      if (!issuerClaim.startsWith('https://cognito-idp.') || !issuerClaim.endsWith('.amazonaws.com')) {
        return { ok: false, statusCode: 401, message: 'Invalid token issuer' }
      }

      iss = issuerClaim
    } catch (e) {
      const err = e as Error
      console.error('[auth] JWT decode error', {
        error: err.message,
        errorName: err.name,
      })
      return { ok: false, statusCode: 401, message: 'Invalid token format' }
    }

    const JWKS = createRemoteJWKSet(new URL(`${iss}/.well-known/jwks.json`))
    const { payload: claims } = await jwtVerify(token, JWKS, {
      issuer: iss,
    })

    const tokenUse = claims.token_use
    const clientIdClaim = claims.client_id
    const audienceClaim = claims.aud

    if (tokenUse === 'access') {
      if (clientIdClaim !== userPoolClientId) {
        return { ok: false, statusCode: 401, message: 'Invalid token' }
      }
    } else if (tokenUse === 'id' || audienceClaim) {
      // ID tokens use 'aud' claim - handle string, array, or undefined
      if (typeof audienceClaim === 'string') {
        if (audienceClaim !== userPoolClientId) {
          return { ok: false, statusCode: 401, message: 'Invalid token' }
        }
      } else if (Array.isArray(audienceClaim)) {
        if (!audienceClaim.includes(userPoolClientId)) {
          return { ok: false, statusCode: 401, message: 'Invalid token' }
        }
      } else {
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
      path: event.requestContext?.http?.path,
      method: event.requestContext?.http?.method,
    })
    return { ok: false, statusCode: 401, message: 'Invalid token' }
  }
}

