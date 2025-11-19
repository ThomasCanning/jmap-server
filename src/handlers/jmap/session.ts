import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { StatusCodes } from "http-status-codes"
import { withAuth, jsonResponseHeaders, createAuthErrorResponse } from "../../lib/auth"
import { validateEnvVar } from "../../lib/env"
import { getSession } from "../../lib/jmap/session"

export const sessionHandler = withAuth(
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const apiUrlResult = validateEnvVar("API_URL", process.env.API_URL)
    if (!apiUrlResult.ok) {
      return createAuthErrorResponse(event, apiUrlResult.statusCode, apiUrlResult.message)
    }
    const apiUrl = apiUrlResult.value
    const session = getSession(apiUrl)

    return {
      statusCode: StatusCodes.OK,
      headers: {
        ...jsonResponseHeaders(event),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
      body: JSON.stringify(session),
    }
  }
)
