import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { StatusCodes } from "http-status-codes"
import { withAuth, jsonResponseHeaders } from "../../lib/auth"
import { AuthResult } from "../../lib/auth/types"
import { getSession } from "../../lib/jmap/session"
import { ProblemDetails } from "../../lib/errors"

export const sessionHandler = withAuth(
  async (
    event: APIGatewayProxyEventV2,
    auth: AuthResult
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
      const session = getSession(auth)
      return {
        statusCode: StatusCodes.OK,
        headers: {
          ...jsonResponseHeaders(event),
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
        body: JSON.stringify(session),
      }
    } catch (error) {
      return {
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        headers: jsonResponseHeaders(event, true),
        body: JSON.stringify(error as ProblemDetails),
      }
    }
  }
)
