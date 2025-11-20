import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { StatusCodes } from "http-status-codes"
import { withAuth, jsonResponseHeaders } from "../../lib/auth"
import { getSession } from "../../lib/jmap/session"
import { SessionUrls } from "../../lib/jmap/types"
import { errorTypes, createProblemDetails, ProblemDetails } from "../../lib/errors"

export const sessionHandler = withAuth(
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    try {
      const sessionUrls = getSessionUrls()
      const session = getSession(sessionUrls)
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

function getSessionUrls(): SessionUrls {
  const apiUrl = process.env.API_URL
  if (!apiUrl || apiUrl.trim().length === 0) {
    throw createProblemDetails({
      type: errorTypes.internalServerError,
      status: StatusCodes.INTERNAL_SERVER_ERROR,
      detail: "API_URL environment variable is missing",
    })
  }
  // Normalize base URL for constructing other URLs (remove trailing slash)
  const baseUrl = apiUrl.replace(/\/$/, "")
  return {
    apiUrl: apiUrl, // Keep original apiUrl with trailing slash if present
    downloadUrl: `${baseUrl}/download/{accountId}/{blobId}?type={type}&name={name}`,
    uploadUrl: `${baseUrl}/upload/{accountId}`,
    eventSourceUrl: `${baseUrl}/events?types={types}&closeafter={closeafter}&ping={ping}`,
  }
}
