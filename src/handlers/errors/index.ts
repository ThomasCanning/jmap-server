import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { StatusCodes } from "http-status-codes"
import { corsOnlyHeaders } from "../../lib/auth/headers"

// @ts-expect-error: HTML import handled by esbuild loader
import internalServerError from "./pages/internalServerError.html"
// @ts-expect-error: HTML import handled by esbuild loader
import unauthorized from "./pages/unauthorized.html"
// @ts-expect-error: HTML import handled by esbuild loader
import badRequest from "./pages/badRequest.html"

const errorPages: Record<string, string> = {
  internalServerError,
  unauthorized,
  badRequest,
}

function getHtmlContent(errorCode: string): string | null {
  return errorPages[errorCode] || null
}

export const errorHandler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const errorCode = event.pathParameters?.errorCode

  if (!errorCode) {
    return {
      statusCode: StatusCodes.BAD_REQUEST,
      headers: {
        ...corsOnlyHeaders(event),
        "Content-Type": "text/html",
      },
      body: "<html><body><h1>400 Bad Request</h1><p>Error code is required.</p></body></html>",
    }
  }

  const htmlContent = getHtmlContent(errorCode)

  if (!htmlContent) {
    return {
      statusCode: StatusCodes.NOT_FOUND,
      headers: {
        ...corsOnlyHeaders(event),
        "Content-Type": "text/html",
      },
      body: "<html><body><h1>404 Not Found</h1><p>The requested error page does not exist.</p></body></html>",
    }
  }

  return {
    statusCode: StatusCodes.OK,
    headers: {
      ...corsOnlyHeaders(event),
      "Content-Type": "text/html",
      "Cache-Control": "public, max-age=3600",
    },
    body: htmlContent,
  }
}
