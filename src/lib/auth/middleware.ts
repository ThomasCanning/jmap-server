import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { StatusCodes } from "http-status-codes"
import { HandlerFunction, AuthResult } from "./types"
import { getHeader, jsonResponseHeaders, parseBasicAuth } from "./headers"
import { getTokenFromCookies } from "./cookies"
import { setAuthCookies } from "./cookies"
import { verifyBearerFromEvent } from "./verification"
import { authenticate, refresh } from "./cognito"
import { createProblemDetails, errorTypes, isProblemDetails } from "../errors"

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

  return await refresh(refreshToken, clientId)
}

async function tryBasicAuth(event: APIGatewayProxyEventV2, clientId: string): Promise<AuthResult> {
  const authzHeader = getHeader(event, "authorization")

  // If Bearer token is present, skip Basic auth (Bearer takes precedence)
  if (authzHeader?.startsWith("Bearer ")) {
    throw createProblemDetails({
      type: errorTypes.unauthorized,
      status: StatusCodes.UNAUTHORIZED,
      detail: "Bearer token authentication failed",
      title: "Unauthorized",
    })
  }

  // parseBasicAuth() and authenticate() already throw ProblemDetails errors
  const basicAuth = parseBasicAuth(authzHeader)
  if (!basicAuth.username || !basicAuth.password) {
    throw createProblemDetails({
      type: errorTypes.unauthorized,
      status: StatusCodes.UNAUTHORIZED,
      detail: "Missing Basic auth credentials",
      title: "Unauthorized",
    })
  }
  return await authenticate(basicAuth.username, basicAuth.password, clientId)
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

  try {
    const refreshed = await tryRefreshToken(event, clientId)
    if (refreshed) {
      const handlerResponse = await handler(event, refreshed)
      return buildResponseWithCookies(
        handlerResponse,
        event,
        refreshed.bearerToken,
        refreshed.refreshToken
      )
    }
  } catch (_error) {
    // If refresh fails, return null to try other auth methods
    // The error will be handled by the main catch block if no other method succeeds
    return null
  }

  return null
}

async function handleBasicAuthFlow(
  event: APIGatewayProxyEventV2,
  clientId: string,
  handler: HandlerFunction
): Promise<APIGatewayProxyStructuredResultV2 | null> {
  // tryBasicAuth() already throws ProblemDetails errors
  const basic = await tryBasicAuth(event, clientId)
  const handlerResponse = await handler(event, basic)
  return buildResponseWithCookies(handlerResponse, event, basic.bearerToken, basic.refreshToken)
}

// Helper to consolidate the auth strategy chain
async function resolveAuth(
  event: APIGatewayProxyEventV2,
  clientId: string,
  handler: HandlerFunction
): Promise<APIGatewayProxyStructuredResultV2 | { auth: AuthResult }> {
  // 1. Try Bearer
  try {
    const auth = await verifyBearerFromEvent(event, clientId)
    return { auth }
  } catch (bearerError) {
    if (!isProblemDetails(bearerError)) throw bearerError

    // 2. Try Refresh
    const refreshResponse = await handleRefreshFlow(event, clientId, handler)
    if (refreshResponse) return refreshResponse

    // 3. Try Basic
    try {
      const basicResponse = await handleBasicAuthFlow(event, clientId, handler)
      if (basicResponse) return basicResponse
    } catch (basicError) {
      // If basic auth was explicitly attempted (header present) and failed, prefer that error
      const authzHeader = getHeader(event, "authorization")
      if (authzHeader?.startsWith("Basic ") && isProblemDetails(basicError)) {
        throw basicError
      }
    }

    throw bearerError
  }
}

export function withAuth(
  handler: HandlerFunction
): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyStructuredResultV2> {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
      const clientId = process.env.USER_POOL_CLIENT_ID
      if (!clientId || clientId.trim().length === 0) {
        throw createProblemDetails({
          type: errorTypes.internalServerError,
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          detail: "Server misconfiguration. (USER_POOL_CLIENT_ID missing from env vars)",
          title: "Internal Server Error",
        })
      }

      const result = await resolveAuth(event, clientId, handler)

      // If result is a Response (from Refresh/Basic flow), return it
      if ("statusCode" in result) return result as APIGatewayProxyStructuredResultV2

      // Otherwise it's the Auth object, proceed to handler
      return await handler(event, (result as { auth: AuthResult }).auth)
    } catch (error) {
      // If an appropriate problem details object is returned, return it
      if (isProblemDetails(error)) {
        return {
          statusCode: error.status,
          headers: jsonResponseHeaders(event, true),
          body: JSON.stringify(error),
        }
      } else {
        // If an unexpected error is thrown, return a generic internal server error
        return {
          statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
          headers: jsonResponseHeaders(event, true),
          body: JSON.stringify(
            createProblemDetails({
              type: errorTypes.internalServerError,
              status: StatusCodes.INTERNAL_SERVER_ERROR,
              detail: "Failed to authenticate request",
              title: "Internal Server Error",
            })
          ),
        }
      }
    }
  }
}
