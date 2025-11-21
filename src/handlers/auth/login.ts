import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { StatusCodes } from "http-status-codes"
import { authenticateRequest, setAuthCookies, jsonResponseHeaders } from "../../lib/auth"
import { createProblemDetails, errorTypes, isProblemDetails } from "../../lib/errors"
import { AuthResult } from "../../lib/auth/types"

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  let result: AuthResult
  try {
    result = await authenticateRequest(event)
  } catch (error) {
    //If an appropriate problem details object is returned, return it
    if (isProblemDetails(error)) {
      return {
        statusCode: error.status,
        headers: jsonResponseHeaders(event, true),
        body: JSON.stringify(error),
      }
    } else {
      //If an unexpected error is thrown, return a generic internal server error
      return {
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        headers: jsonResponseHeaders(event, true),
        body: JSON.stringify(
          createProblemDetails({
            type: errorTypes.internalServerError,
            status: StatusCodes.INTERNAL_SERVER_ERROR,
            detail: "Failed to login due to internal server error",
            title: "Internal Server Error",
          })
        ),
      }
    }
  }

  const cookieHeaders = setAuthCookies(result.bearerToken, result.refreshToken)
  return {
    statusCode: StatusCodes.OK,
    headers: jsonResponseHeaders(event),
    cookies: cookieHeaders,
    body: JSON.stringify({ success: true }),
  }
}
