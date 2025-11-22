import { APIGatewayProxyEventV2 } from "aws-lambda"
import { StatusCodes } from "http-status-codes"
import { getHeader, parseBasicAuth } from "./headers"
import { authenticate, refresh } from "./cognito"
import { AuthResult, CredentialsRequestBody } from "./types"
import { createProblemDetails, errorTypes, isProblemDetails } from "../errors"

export async function authenticateRequest(event: APIGatewayProxyEventV2): Promise<AuthResult> {
  const clientId = process.env.USER_POOL_CLIENT_ID
  if (!clientId || clientId.trim().length === 0) {
    throw createProblemDetails({
      type: errorTypes.internalServerError,
      status: StatusCodes.INTERNAL_SERVER_ERROR,
      detail: "Server misconfiguration. (USER_POOL_CLIENT_ID missing from env vars)",
      title: "Internal Server Error",
    })
  }

  let bodyError: ReturnType<typeof JSON.parse>

  // 1. Priority: Request Body (JSON)
  if (event.body) {
    try {
      const body = JSON.parse(event.body) as CredentialsRequestBody

      // If we have a request body, try to auth with refresh token if provided, if not username and password
      if (
        body.refreshToken &&
        typeof body.refreshToken === "string" &&
        body.refreshToken.trim().length > 0
      ) {
        try {
          return await refresh(body.refreshToken.trim(), clientId)
        } catch (error) {
          // If refresh token fails and we also have username/password, try that instead
          // Otherwise, re-throw the error
          if (!body.username || !body.password) {
            throw error
          }
          // Fall through to try username/password authentication
        }
      }

      if (body.username && body.password) {
        return await authenticate(body.username, body.password, clientId)
      }
    } catch (error) {
      // If JSON parsing fails or other error, store it and try fallback
      bodyError = error
    }
  }

  // 2. Fallback: Basic Auth Header
  const authzHeader = getHeader(event, "authorization")
  if (authzHeader?.startsWith("Basic ")) {
    const basicAuth = parseBasicAuth(authzHeader)
    if (!basicAuth.username || !basicAuth.password) {
      throw createProblemDetails({
        type: errorTypes.badRequest,
        status: StatusCodes.BAD_REQUEST,
        detail: "Basic auth missing username or password",
        title: "Bad Request",
      })
    }
    try {
      return await authenticate(basicAuth.username, basicAuth.password, clientId)
    } catch (error) {
      // If it's already a ProblemDetails error, re-throw it (preserve the specific error)
      if (isProblemDetails(error)) {
        throw error
      }
      // Wrap unexpected errors with a context-specific message for basic auth
      throw createProblemDetails({
        type: errorTypes.unauthorized,
        status: StatusCodes.UNAUTHORIZED,
        detail: "Basic authentication failed. Invalid username or password",
        title: "Unauthorized",
      })
    }
  }

  // 3. No auth method worked
  if (bodyError) {
    if (bodyError instanceof SyntaxError) {
      throw createProblemDetails({
        type: errorTypes.badRequest,
        status: StatusCodes.BAD_REQUEST,
        detail: "Invalid JSON in request body",
        title: "Bad Request",
      })
    }
    // If we had a specific error from the body attempt (e.g. invalid refresh token), throw that
    if (isProblemDetails(bodyError)) {
      throw bodyError
    }
  }

  throw createProblemDetails({
    type: errorTypes.badRequest,
    status: StatusCodes.BAD_REQUEST,
    detail:
      "No authentication method provided. Either provide username and password in request body or use basic auth",
    title: "Bad Request",
  })
}
