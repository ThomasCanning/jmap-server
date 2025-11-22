import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { StatusCodes } from "http-status-codes"
import { authenticateRequest, AuthResult, jsonResponseHeaders } from "../../lib/auth"
import { createProblemDetails, errorTypes, isProblemDetails } from "../../lib/errors"

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  if (!event.body) {
    return {
      statusCode: StatusCodes.BAD_REQUEST,
      headers: jsonResponseHeaders(event, true),
      body: JSON.stringify(
        createProblemDetails({
          type: errorTypes.badRequest,
          status: StatusCodes.BAD_REQUEST,
          detail: "Missing request body",
          title: "Bad Request",
        })
      ),
    }
  }

  let result: AuthResult
  try {
    result = await authenticateRequest(event)
  } catch (error) {
    if (isProblemDetails(error)) {
      return {
        statusCode: error.status,
        headers: jsonResponseHeaders(event, true),
        body: JSON.stringify(error),
      }
    } else {
      return {
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        headers: jsonResponseHeaders(event, true),
        body: JSON.stringify(
          createProblemDetails({
            type: errorTypes.internalServerError,
            status: StatusCodes.INTERNAL_SERVER_ERROR,
            detail: "Failed to get token due to internal server error",
            title: "Internal Server Error",
          })
        ),
      }
    }
  }

  return {
    statusCode: StatusCodes.OK,
    headers: jsonResponseHeaders(event),
    body: JSON.stringify({
      accessToken: result.bearerToken,
      refreshToken: result.refreshToken,
    }),
  }
}
