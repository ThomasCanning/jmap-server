import { CognitoIdentityProviderClient, InitiateAuthCommand, RevokeTokenCommand } from '@aws-sdk/client-cognito-identity-provider'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { AuthResult } from './types'

let cognitoClient: CognitoIdentityProviderClient | null = null

function getCognitoClient(): CognitoIdentityProviderClient {
  if (!cognitoClient) {
    // AWS SDK will auto-detect region from AWS_REGION or AWS_DEFAULT_REGION env vars
    cognitoClient = new CognitoIdentityProviderClient({
      maxAttempts: 2,
      requestHandler: new NodeHttpHandler({
        requestTimeout: 3000,
        connectionTimeout: 1000,
      }),
    })
  }
  return cognitoClient
}

export async function authenticate(
  username: string,
  password: string,
  userPoolClientId: string
): Promise<AuthResult> {
  if (!username || username.trim().length === 0) {
    return { ok: false, statusCode: 400, message: 'Username is required' }
  }
  if (!password || password.length === 0) {
    return { ok: false, statusCode: 400, message: 'Password is required' }
  }

  try {
    const cmd = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: userPoolClientId,
      AuthParameters: { USERNAME: username, PASSWORD: password },
    })
    const res = await getCognitoClient().send(cmd)
    const token = res.AuthenticationResult?.AccessToken
    const refreshToken = res.AuthenticationResult?.RefreshToken
    if (!token) {
      return { ok: false, statusCode: 502, message: 'No access token from Cognito' }
    }
    return { ok: true, username, bearerToken: token, refreshToken }
  } catch (e) {
    const err = e as Error
    console.error('[auth] InitiateAuth error', { 
      error: err.name || 'UnknownError',
      usernameLength: username.length,
    })
    return { ok: false, statusCode: 401, message: 'Invalid credentials' }
  }
}

export async function refresh(
  refreshToken: string,
  userPoolClientId: string
): Promise<AuthResult> {
  if (!refreshToken || refreshToken.trim().length === 0) {
    return { ok: false, statusCode: 400, message: 'Refresh token is required' }
  }

  try {
    const cmd = new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: userPoolClientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    })
    const res = await getCognitoClient().send(cmd)
    const token = res.AuthenticationResult?.AccessToken
    const newRefreshToken = res.AuthenticationResult?.RefreshToken || refreshToken
    
    if (!token) {
      return { ok: false, statusCode: 502, message: 'No access token from Cognito' }
    }
    return { ok: true, bearerToken: token, refreshToken: newRefreshToken }
  } catch (e) {
    const err = e as Error
    console.error('[auth] RefreshToken error', { 
      error: err.name || 'UnknownError',
    })
    return { ok: false, statusCode: 401, message: 'Invalid or expired refresh token' }
  }
}

export async function revokeToken(
  refreshToken: string,
  userPoolClientId: string
): Promise<{ ok: true } | { ok: false; statusCode: number; message: string }> {
  try {
    const cmd = new RevokeTokenCommand({
      Token: refreshToken,
      ClientId: userPoolClientId,
    })
    await getCognitoClient().send(cmd)
    return { ok: true }
  } catch (e) {
    const err = e as Error
    console.error('[auth] RevokeToken error', { 
      error: err.name || 'UnknownError',
      errorMessage: err.message,
    })
    return { ok: false, statusCode: 500, message: 'Failed to revoke token' }
  }
}

