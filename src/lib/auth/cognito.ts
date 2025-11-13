import { CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { AuthResult } from './types'

const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
  maxAttempts: 2,
  requestHandler: new NodeHttpHandler({
    requestTimeout: 3000,
    connectionTimeout: 1000,
  }),
})

/**
 * Verifies Basic authentication credentials against Cognito User Pool.
 * 
 * @param authorizationHeader - Authorization header value (expected: "Basic <base64>")
 * @param userPoolClientId - Cognito User Pool Client ID
 * @returns AuthResult with access token on success
 */
export async function verifyBasicWithCognito(
  authorizationHeader: string | undefined,
  userPoolClientId: string
): Promise<AuthResult> {
  if (!authorizationHeader?.startsWith('Basic ')) {
    // Return a specific message that middleware can detect to provide better error
    return { ok: false, statusCode: 401, message: 'Missing Basic auth' }
  }

  // Decode Base64 credentials
  let decoded: string
  try {
    decoded = Buffer.from(authorizationHeader.slice(6), 'base64').toString('utf8')
  } catch {
    return { ok: false, statusCode: 400, message: 'Invalid Base64' }
  }

  // Parse username:password
  const sep = decoded.indexOf(':')
  if (sep < 0) return { ok: false, statusCode: 400, message: 'Invalid Basic format' }
  const username = decoded.slice(0, sep)
  const password = decoded.slice(sep + 1)

  // Authenticate with Cognito
  try {
    const cmd = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: userPoolClientId,
      AuthParameters: { USERNAME: username, PASSWORD: password },
    })
    const res = await cognito.send(cmd)
    const token = res.AuthenticationResult?.AccessToken
    const refreshToken = res.AuthenticationResult?.RefreshToken
    if (!token) {
      return { ok: false, statusCode: 502, message: 'No access token from Cognito' }
    }
    return { ok: true, username, bearerToken: token, refreshToken }
  } catch (e) {
    const err = e as Error
    console.error('[auth] InitiateAuth error', { message: err.message })
    return { ok: false, statusCode: 401, message: 'Invalid credentials' }
  }
}

/**
 * Authenticates a user with username and password directly.
 * 
 * @param username - Username (email) for authentication
 * @param password - Password for authentication
 * @param userPoolClientId - Cognito User Pool Client ID
 * @returns AuthResult with access token and refresh token on success
 */
export async function authenticateWithCredentials(
  username: string,
  password: string,
  userPoolClientId: string
): Promise<AuthResult> {
  try {
    const cmd = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: userPoolClientId,
      AuthParameters: { USERNAME: username, PASSWORD: password },
    })
    const res = await cognito.send(cmd)
    const token = res.AuthenticationResult?.AccessToken
    const refreshToken = res.AuthenticationResult?.RefreshToken
    if (!token) {
      return { ok: false, statusCode: 502, message: 'No access token from Cognito' }
    }
    return { ok: true, username, bearerToken: token, refreshToken }
  } catch (e) {
    const err = e as Error
    console.error('[auth] InitiateAuth error', { message: err.message })
    return { ok: false, statusCode: 401, message: 'Invalid credentials' }
  }
}

/**
 * Refreshes an access token using a refresh token.
 * 
 * @param refreshToken - The refresh token from Cognito
 * @param userPoolClientId - Cognito User Pool Client ID
 * @returns AuthResult with new access token and refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  userPoolClientId: string
): Promise<AuthResult> {
  try {
    const cmd = new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: userPoolClientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    })
    const res = await cognito.send(cmd)
    const token = res.AuthenticationResult?.AccessToken
    const newRefreshToken = res.AuthenticationResult?.RefreshToken || refreshToken // Cognito may return new refresh token
    
    if (!token) {
      return { ok: false, statusCode: 502, message: 'No access token from Cognito' }
    }
    return { ok: true, bearerToken: token, refreshToken: newRefreshToken }
  } catch (e) {
    const err = e as Error
    console.error('[auth] RefreshToken error', { message: err.message })
    return { ok: false, statusCode: 401, message: 'Invalid or expired refresh token' }
  }
}

