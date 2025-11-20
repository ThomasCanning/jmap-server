import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { StatusCodes } from "http-status-codes"
import { AuthenticatedContext, HandlerFunction, AuthResult } from "./types"
import { getHeader, jsonResponseHeaders, parseBasicAuth } from "./headers"
import { getTokenFromCookies } from "./cookies"
import { setAuthCookies } from "./cookies"
import { verifyBearerFromEvent } from "./verification"
import { authenticate, refresh } from "./cognito"
import { createAuthErrorResponse } from "./responses"
import { decodeJwt } from "jose"

function extractUsernameFromToken(token: string): string | undefined {
  try {
    const decoded = decodeJwt(token)
    return (decoded.username || decoded["cognito:username"] || decoded.sub) as string | undefined
  } catch {
    return undefined
  }
}

function ensureUsername(auth: AuthenticatedContext): AuthenticatedContext {
  if (!auth.username && auth.bearerToken) {
    const username = extractUsernameFromToken(auth.bearerToken)
    return { ...auth, username }
  }
  return auth
}

function buildResponseWithCookies(
  handlerResponse: APIGatewayProxyStructuredResultV2,
  event: APIGatewayProxyEventV2,
  bearerToken?: string,
  refreshToken?: string
): APIGatewayProxyStructuredResultV2 {
  const cookieHeaders = setAuthCookies(bearerToken, refreshToken)
  return {
    ...handlerResponse,
    headers: {
      ...jsonResponseHeaders(event),
      ...handlerResponse.headers,
    },
    cookies: cookieHeaders,
  }
}

async function tryRefreshToken(
  event: APIGatewayProxyEventV2,
  clientId: string
): Promise<AuthResult | null> {
  const refreshToken = getTokenFromCookies(event, "refresh_token")
  if (!refreshToken) {
    return null
  }

  const refreshed = await refresh(refreshToken, clientId)
  if (refreshed.ok && refreshed.bearerToken) {
    return refreshed
  }

  return null
}

type BasicAuthResult =
  | AuthResult
  | { ok: false; statusCode: StatusCodes.UNAUTHORIZED; message: string; skipBasicAuth: true }

async function tryBasicAuth(
  event: APIGatewayProxyEventV2,
  clientId: string
): Promise<BasicAuthResult> {
  const authzHeader = getHeader(event, "authorization")

  if (authzHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      statusCode: StatusCodes.UNAUTHORIZED,
      message: "Bearer token provided",
      skipBasicAuth: true,
    }
  }

  const basicAuth = parseBasicAuth(authzHeader)
  if (!basicAuth.ok) {
    return basicAuth
  }

  return await authenticate(basicAuth.username, basicAuth.password, clientId)
}

function isNoAuthProvided(
  authResult: AuthResult,
  basicResult: BasicAuthResult,
  authzHeader: string | undefined
): boolean {
  return (
    !authResult.ok &&
    authResult.message === "Missing Bearer token" &&
    !basicResult.ok &&
    basicResult.message === "Missing Basic auth" &&
    !authzHeader
  )
}

async function handleRefreshFlow(
  event: APIGatewayProxyEventV2,
  clientId: string,
  handler: HandlerFunction
): Promise<APIGatewayProxyStructuredResultV2 | null> {
  const tokenSourceWasCookie = !!getTokenFromCookies(event, "access_token")
  const hasRefreshToken = !!getTokenFromCookies(event, "refresh_token")

  if (!tokenSourceWasCookie && !hasRefreshToken) {
    return null
  }

  const refreshed = await tryRefreshToken(event, clientId)
  if (refreshed && refreshed.ok) {
    const authWithUsername = ensureUsername(refreshed)
    const handlerResponse = await handler(event, authWithUsername)
    return buildResponseWithCookies(
      handlerResponse,
      event,
      refreshed.bearerToken,
      refreshed.refreshToken
    )
  }

  return null
}

async function handleBasicAuthFlow(
  event: APIGatewayProxyEventV2,
  clientId: string,
  bearerAuthResult: AuthResult,
  handler: HandlerFunction
): Promise<APIGatewayProxyStructuredResultV2 | null> {
  const basic = await tryBasicAuth(event, clientId)

  if (basic.ok === false && "skipBasicAuth" in basic && basic.skipBasicAuth) {
    // Bearer token was provided but invalid - return the Bearer error message
    if (!bearerAuthResult.ok) {
      return createAuthErrorResponse(event, bearerAuthResult.statusCode, bearerAuthResult.message)
    }
    return null
  }

  if (basic.ok && basic.bearerToken) {
    const authWithUsername = ensureUsername(basic)
    const handlerResponse = await handler(event, authWithUsername)
    return buildResponseWithCookies(handlerResponse, event, basic.bearerToken, basic.refreshToken)
  }

  const authzHeader = getHeader(event, "authorization")
  if (isNoAuthProvided(bearerAuthResult, basic, authzHeader)) {
    return createAuthErrorResponse(
      event,
      StatusCodes.UNAUTHORIZED,
      "No authentication method provided. Call /auth/login with username and password to get an access token, or use Basic auth with the Authorization header."
    )
  }

  if (!basic.ok) {
    return createAuthErrorResponse(event, basic.statusCode, basic.message)
  }

  if (authzHeader?.startsWith("Bearer ") && !bearerAuthResult.ok) {
    return createAuthErrorResponse(event, bearerAuthResult.statusCode, bearerAuthResult.message)
  }

  return null
}

async function handleBearerSuccess(
  event: APIGatewayProxyEventV2,
  authResult: AuthenticatedContext,
  handler: HandlerFunction
): Promise<APIGatewayProxyStructuredResultV2> {
  const handlerResponse = await handler(event, authResult)
  return {
    ...handlerResponse,
    headers: {
      ...jsonResponseHeaders(event),
      ...handlerResponse.headers,
    },
  }
}

export function withAuth(
  handler: HandlerFunction
): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyStructuredResultV2> {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
      const clientId = process.env.USER_POOL_CLIENT_ID
      if (!clientId || clientId.trim().length === 0) {
        return createAuthErrorResponse(
          event,
          StatusCodes.INTERNAL_SERVER_ERROR,
          "Server misconfiguration (USER_POOL_CLIENT_ID missing)"
        )
      }

      // Try Bearer token first
      const bearerAuthResult = await verifyBearerFromEvent(event, clientId)

      if (bearerAuthResult.ok) {
        return await handleBearerSuccess(event, bearerAuthResult, handler)
      }

      // Try refresh token if Bearer failed and we have cookies
      const refreshResponse = await handleRefreshFlow(event, clientId, handler)
      if (refreshResponse) {
        return refreshResponse
      }

      // Try Basic auth if Bearer failed
      const basicResponse = await handleBasicAuthFlow(event, clientId, bearerAuthResult, handler)
      if (basicResponse) {
        return basicResponse
      }

      // Fallback: unexpected state
      console.error("[auth] Unexpected auth state in withAuth", {
        path: event.requestContext?.http?.path,
        method: event.requestContext?.http?.method,
        authResultOk: bearerAuthResult.ok,
      })
      return createAuthErrorResponse(event, StatusCodes.UNAUTHORIZED, "Unauthorized")
    } catch (error) {
      const err = error as Error
      console.error("[auth] Handler error", {
        path: event.requestContext?.http?.path,
        method: event.requestContext?.http?.method,
        error: err.message,
        errorName: err.name,
        stack: err.stack,
      })
      return createAuthErrorResponse(
        event,
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Internal server error"
      )
    }
  }
}
