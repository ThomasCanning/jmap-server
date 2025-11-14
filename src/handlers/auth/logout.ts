import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { clearAccessTokenCookie, clearRefreshTokenCookie, corsOnlyHeaders, getTokenFromCookies, revokeToken, validateEnvVar } from '../../lib/auth'

/**
 * Logout endpoint that revokes refresh token server-side and clears cookies.
 * Revokes the refresh token via Cognito to ensure it cannot be reused.
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const clientIdResult = validateEnvVar('USER_POOL_CLIENT_ID', process.env.USER_POOL_CLIENT_ID)
  const refreshToken = getTokenFromCookies(event, 'refresh_token')

  // Revoke refresh token server-side if present and clientId is valid
  if (refreshToken && clientIdResult.ok) {
    const revokeResult = await revokeToken(refreshToken, clientIdResult.value)
    if (!revokeResult.ok) {
      // Log but continue - we still want to clear cookies even if revocation fails
      console.error('[auth] Failed to revoke token during logout', {
        statusCode: revokeResult.statusCode,
        message: revokeResult.message,
      })
    }
  }

  // Clear cookies regardless of revocation result
  return {
    statusCode: 204,
    headers: corsOnlyHeaders(event),
    cookies: [
      clearAccessTokenCookie(),
      clearRefreshTokenCookie(),
    ],
    body: ''
  }
}

