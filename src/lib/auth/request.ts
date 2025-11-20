import { APIGatewayProxyEventV2 } from "aws-lambda"
import { StatusCodes } from "http-status-codes"
import { getHeader, parseBasicAuth } from "./headers"
import { authenticate, refresh } from "./cognito"
import { AuthResult } from "./types"
import { ProblemDetails } from "../errors"

interface CredentialsRequestBody {
  username?: string
  password?: string
  refreshToken?: string
}

export function extractCredentialsFromEvent(
  event: APIGatewayProxyEventV2
):
  | { ok: true; username: string; password: string }
  | { ok: false; statusCode: number; message: string } {
  if (event.body) {
    try {
      const body = JSON.parse(event.body) as CredentialsRequestBody
      // Check for refresh token first (takes priority)
      if (body.refreshToken) {
        return {
          ok: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: "Use refreshToken field for token refresh, not credentials",
        }
      }
      if (body.username && body.password) {
        return { ok: true, username: body.username, password: body.password }
      }
    } catch {
      return {
        ok: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Invalid JSON in request body",
      }
    }
  }

  const authzHeader = getHeader(event, "authorization")
  if (!authzHeader && !event.body) {
    return {
      ok: false,
      statusCode: StatusCodes.UNAUTHORIZED,
      message:
        'Missing username and password. Provide credentials in the request body as JSON: {"username": "user@example.com", "password": "password"}, or use Basic auth with the Authorization header.',
    }
  }

  const basicAuth = parseBasicAuth(authzHeader)
  if (basicAuth.ok) {
    return basicAuth
  }

  if (basicAuth.message === "Missing Basic auth" && !event.body) {
    return {
      ok: false,
      statusCode: StatusCodes.UNAUTHORIZED,
      message:
        'Missing username and password. Provide credentials in the request body as JSON: {"username": "user@example.com", "password": "password"}, or use Basic auth with the Authorization header.',
    }
  }

  return basicAuth
}

export function extractRefreshTokenFromEvent(
  event: APIGatewayProxyEventV2
): { ok: true; refreshToken: string } | { ok: false; statusCode: number; message: string } {
  if (!event.body) {
    return {
      ok: false,
      statusCode: StatusCodes.UNAUTHORIZED,
      message:
        'Missing refresh token. Provide refresh token in request body as JSON: {"refreshToken": "..."}',
    }
  }

  try {
    const body = JSON.parse(event.body) as CredentialsRequestBody
    if (
      body.refreshToken &&
      typeof body.refreshToken === "string" &&
      body.refreshToken.trim().length > 0
    ) {
      return { ok: true, refreshToken: body.refreshToken.trim() }
    }
    return {
      ok: false,
      statusCode: StatusCodes.UNAUTHORIZED,
      message:
        'Missing or invalid refreshToken field. Provide refresh token in request body as JSON: {"refreshToken": "..."}',
    }
  } catch {
    return {
      ok: false,
      statusCode: StatusCodes.BAD_REQUEST,
      message: "Invalid JSON in request body",
    }
  }
}

export async function authenticateRequest(event: APIGatewayProxyEventV2): Promise<AuthResult> {
  const clientId = process.env.USER_POOL_CLIENT_ID
  if (!clientId || clientId.trim().length === 0) {
    const problemDetails: ProblemDetails = {
      type: "about:blank",
      status: StatusCodes.INTERNAL_SERVER_ERROR,
      detail: "Internal server error",
      title: "Server misconfiguration",
    }
    throw problemDetails
  }

  // Check if this is a refresh token request
  const refreshTokenResult = extractRefreshTokenFromEvent(event)
  if (refreshTokenResult.ok) {
    return await refresh(refreshTokenResult.refreshToken, clientId)
  }

  // Otherwise, treat as credentials-based authentication
  const credentials = extractCredentialsFromEvent(event)
  if (!credentials.ok) {
    return credentials
  }

  return await authenticate(credentials.username, credentials.password, clientId)
}
