import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { StatusCodes } from "http-status-codes"
import {
  clearAccessTokenCookie,
  clearRefreshTokenCookie,
  getTokenFromCookies,
  jsonResponseHeaders,
  revokeToken,
} from "../../lib/auth"
import { createProblemDetails, errorTypes, isProblemDetails } from "../../lib/errors"

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const clientId = process.env.USER_POOL_CLIENT_ID
    const refreshToken = getTokenFromCookies(event, "refresh_token")

    // Revoke refresh token server-side if present and clientId is valid
    // Note: revokeToken handles its own errors and won't throw, but we catch
    // any unexpected errors to ensure logout always succeeds
    if (refreshToken.trim().length > 0 && clientId && clientId.trim().length > 0) {
      try {
        await revokeToken(refreshToken, clientId)
      } catch {
        // Ignore errors - logout should succeed even if token revocation fails
      }
    }

    return {
      statusCode: StatusCodes.OK,
      headers: jsonResponseHeaders(event),
      cookies: [clearAccessTokenCookie(), clearRefreshTokenCookie()],
      body: JSON.stringify({ success: true }),
    }
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
            detail: "Failed to logout due to internal server error",
            title: "Internal Server Error",
          })
        ),
      }
    }
  }
}
