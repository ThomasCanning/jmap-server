import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { authenticateWithCredentials, verifyBasicWithCognito } from '../../lib/auth/cognito'
import { accessTokenCookie, refreshTokenCookie } from '../../lib/auth/cookies'
import { jsonResponseHeaders, getHeader } from '../../lib/auth/headers'

// Cookie configuration constants
const DEFAULT_COOKIE_MAX_AGE = 3600 // 1 hour (matches Cognito access token lifetime)
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

interface LoginRequestBody {
  username?: string
  password?: string
}

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const clientId = process.env.USER_POOL_CLIENT_ID
  if (!clientId) {
    return {
      statusCode: 500,
      headers: jsonResponseHeaders(event),
      body: JSON.stringify({ error: 'Server misconfiguration (USER_POOL_CLIENT_ID missing)' }),
    }
  }

  let authResult: Awaited<ReturnType<typeof authenticateWithCredentials>>

  // Try to get credentials from request body first
  let username: string | undefined
  let password: string | undefined

  if (event.body) {
    try {
      const body = JSON.parse(event.body) as LoginRequestBody
      username = body.username
      password = body.password
    } catch (e) {
      // If body was provided but invalid JSON, return error
      return {
        statusCode: 400,
        headers: jsonResponseHeaders(event),
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      }
    }
  }

  if (username && password) {
    authResult = await authenticateWithCredentials(username, password, clientId)
  } else {
    // Fallback to Basic auth header as some jmap clients use basic auth
    const authzHeader = getHeader(event, 'authorization')
    
    // Check if no authentication method was provided at all
    if (!authzHeader && !event.body) {
      return {
        statusCode: 400,
        headers: jsonResponseHeaders(event),
        body: JSON.stringify({ 
          error: 'Missing username and password. Provide credentials in the request body as JSON: {"username": "user@example.com", "password": "password"}, or use Basic auth with the Authorization header.' 
        }),
      }
    }
    
    authResult = await verifyBasicWithCognito(authzHeader, clientId)
  }

  // Handle authentication failure
  if (!authResult.ok) {
    // If Basic auth failed because no header was provided, give a helpful message
    if (authResult.message === 'Missing Basic auth' && !event.body) {
      return {
        statusCode: 400,
        headers: jsonResponseHeaders(event),
        body: JSON.stringify({ 
          error: 'Missing username and password. Provide credentials in the request body as JSON: {"username": "user@example.com", "password": "password"}, or use Basic auth with the Authorization header.' 
        }),
      }
    }
    
    return {
      statusCode: authResult.statusCode,
      headers: jsonResponseHeaders(event),
      body: JSON.stringify({ error: authResult.message }),
    }
  }

  // Authentication succeeded - set cookies and return tokens
  const cookieHeaders: string[] = []
  if (authResult.bearerToken) {
    cookieHeaders.push(accessTokenCookie(authResult.bearerToken, DEFAULT_COOKIE_MAX_AGE))
  }
  if (authResult.refreshToken) {
    cookieHeaders.push(refreshTokenCookie(authResult.refreshToken, REFRESH_TOKEN_MAX_AGE))
  }

  return {
    statusCode: 200,
    headers: jsonResponseHeaders(event),
    cookies: cookieHeaders,
    body: JSON.stringify({
      accessToken: authResult.bearerToken,
      refreshToken: authResult.refreshToken,
    }),
  }
}
