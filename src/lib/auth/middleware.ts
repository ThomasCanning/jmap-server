import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { AuthenticatedContext, HandlerFunction, AuthOptions, AuthResult } from './types'
import { getHeader, parseCookies, unauthorizedHeadersFor, unauthorizedStatusFor, jsonResponseHeaders } from './headers'
import { accessTokenCookie, refreshTokenCookie } from './cookies'
import { verifyBearerFromEvent } from './verification'
import { verifyBasicWithCognito, refreshAccessToken } from './cognito'

// Cookie configuration constants
const DEFAULT_COOKIE_MAX_AGE = 3600 // 1 hour (matches Cognito access token lifetime)
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

/**
 * Wraps a handler function with centralized authentication logic.
 * 
 * Authentication flow:
 * 1. Check cookies for Bearer token (browser-based auth)
 * 2. Check Authorization header for Bearer token (API clients)
 * 3. If Bearer fails and token was from cookie, try refresh token (automatic refresh)
 * 4. If Bearer fails and no Bearer header present, try Basic auth
 * 
 * Automatic Token Refresh:
 * - If access token is expired/invalid and came from a cookie, automatically attempts refresh
 * - Uses refresh_token cookie if available
 * - Updates both access_token and refresh_token cookies on successful refresh
 * - Transparent to client - no error is returned, request continues normally
 * 
 * Note: Cookies are always set when Basic auth succeeds (for browser session management).
 * 
 * @param handler - The handler function to wrap. Receives event and authenticated context.
 * @param options - Configuration options
 *   - requireAuth: If true, returns 401 if auth fails. Default: true.
 */
export function withAuth(
  handler: HandlerFunction,
  options: AuthOptions = {}
): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyStructuredResultV2> {
  const {
    requireAuth = true,
  } = options

  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
      const clientId = process.env.USER_POOL_CLIENT_ID
      if (!clientId) {
        console.error('Missing USER_POOL_CLIENT_ID env var')
        return {
          statusCode: 500,
          headers: jsonResponseHeaders(event),
          body: JSON.stringify({ error: 'Server misconfiguration (USER_POOL_CLIENT_ID missing)' }),
        }
      }

      // 1) Try Bearer token, extracting it from cookies
      // Track if token came from cookie (for auto-refresh) BEFORE verification
      const cookiesArray = event.cookies || []
      const cookieHeader = getHeader(event, 'cookie')
      const cookies = cookieHeader ? parseCookies(cookieHeader) : {}
      const tokenSourceWasCookie = cookiesArray.some(c => c.startsWith('access_token=')) || 
                                   !!cookies['access_token']
      
      // Check if refresh token is present (even if access token has expired and wasn't sent)
      const hasRefreshToken = cookiesArray.some(c => c.startsWith('refresh_token=')) || 
                             !!cookies['refresh_token']
      // Verify bearer, check cookies first, then Authorization header
      let authResult = await verifyBearerFromEvent(event, clientId)

      // 2) If Bearer fails and we have a refresh token (even if access token expired), try refresh
      // This handles the case where the access_token cookie expired so browser didn't send it
      if (!authResult.ok && (tokenSourceWasCookie || hasRefreshToken)) {
        // Extract refresh token from cookie (reuse parsed cookies)
        let refreshToken: string | undefined
        for (const cookie of cookiesArray) {
          if (cookie.startsWith('refresh_token=')) {
            refreshToken = cookie.substring('refresh_token='.length)
            break
          }
        }
        if (!refreshToken && cookies['refresh_token']) {
          refreshToken = cookies['refresh_token']
        }

        // If refresh token exists, try to refresh
        if (refreshToken) {
          const refreshed = await refreshAccessToken(refreshToken, clientId)
          if (refreshed.ok && refreshed.bearerToken) {
            authResult = refreshed
            
            // Update cookies with new tokens
            const handlerResponse = await handler(event, authResult as AuthenticatedContext)
            const cookieHeaders: string[] = []
            cookieHeaders.push(accessTokenCookie(refreshed.bearerToken, DEFAULT_COOKIE_MAX_AGE))
            if (refreshed.refreshToken) {
              cookieHeaders.push(refreshTokenCookie(refreshed.refreshToken, REFRESH_TOKEN_MAX_AGE))
            }
            
            return {
              ...handlerResponse,
              headers: {
                ...jsonResponseHeaders(event),
                ...handlerResponse.headers, // Allow handler to override headers if needed
              },
              cookies: cookieHeaders,
            }
          }
          // If refresh failed, continue to Basic auth fallback
        }
      }

      // 3) If Bearer fails, try Basic auth (only if Authorization header doesn't have Bearer)
      if (!authResult.ok) {
        const authzHeader =
          (event.headers?.authorization as string) ?? (event.headers?.Authorization as string)

        // Only try Basic if there's no Bearer token in the header
        // (if Bearer was present but invalid, return that error instead)
        if (!authzHeader?.startsWith('Bearer ')) {
          const basic = await verifyBasicWithCognito(authzHeader, clientId)

          if (basic.ok && basic.bearerToken) {
            authResult = basic

            // Always set cookies when Basic auth succeeds (for browser session management)
            const handlerResponse = await handler(event, authResult as AuthenticatedContext)
            const cookieHeaders: string[] = []
            cookieHeaders.push(accessTokenCookie(basic.bearerToken, DEFAULT_COOKIE_MAX_AGE))
            if (basic.refreshToken) {
              cookieHeaders.push(refreshTokenCookie(basic.refreshToken, REFRESH_TOKEN_MAX_AGE))
            }
            
            return {
              ...handlerResponse,
              headers: {
                ...jsonResponseHeaders(event),
                ...handlerResponse.headers, // Allow handler to override headers if needed
              },
              cookies: cookieHeaders,
            }
          } else if (requireAuth) {
            // Check if no authentication method was provided at all
            const noAuthProvided = 
              !authResult.ok && 
              authResult.message === 'Missing Bearer token' && 
              !basic.ok &&
              basic.message === 'Missing Basic auth' &&
              !authzHeader

            if (noAuthProvided) {
              return {
                statusCode: 401,
                headers: jsonResponseHeaders(event),
                body: JSON.stringify({ 
                  error: 'No authentication method provided. Call /auth/login with username and password to get an access token, or use Basic auth with the Authorization header.' 
                }),
              }
            }

            // Auth required but both Bearer and Basic failed
            return {
              statusCode: basic.ok ? unauthorizedStatusFor(event) : basic.statusCode,
              headers: jsonResponseHeaders(event),
              body: JSON.stringify({ error: basic.ok ? 'Unauthorized' : basic.message }),
            }
          }
        } else if (requireAuth) {
          // Bearer token was present but invalid - return Bearer error
          return {
            statusCode: authResult.statusCode,
            headers: jsonResponseHeaders(event),
            body: JSON.stringify({ error: authResult.message }),
          }
        }
      }

      // If auth succeeded, call handler with auth context
      if (authResult.ok) {
        const handlerResponse = await handler(event, authResult as AuthenticatedContext)
        return {
          ...handlerResponse,
          headers: {
            ...jsonResponseHeaders(event),
            ...handlerResponse.headers, // Allow handler to override headers if needed
          },
        }
      }

      // If auth not required and failed, we still need to provide auth context
      // But since auth failed, we can't call the handler (it requires auth)
      // This case shouldn't happen if requireAuth is false
      if (!requireAuth) {
        // For optional auth handlers, create a wrapper that makes auth optional
        // But since we're requiring it in the type, this shouldn't be reached
        throw new Error('Handler requires auth but requireAuth is false')
      }

      // Should not reach here, but TypeScript needs this
      return {
        statusCode: 401,
        headers: unauthorizedHeadersFor(event),
        body: JSON.stringify({ error: 'Unauthorized' }),
      }
    } catch (error) {
      console.error('Handler error:', error)
      return {
        statusCode: 500,
        headers: jsonResponseHeaders(event),
        body: JSON.stringify({ error: 'Internal server error' }),
      }
    }
  }
}

export function createAuthHandler(
  handler: HandlerFunction
): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyStructuredResultV2> {
  return withAuth(handler, { requireAuth: true })
}

