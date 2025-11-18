import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { withAuth, jsonResponseHeaders } from "../../lib/auth"
import { requestErrors, RequestError } from "../../lib/jmap/errors"
import { StatusCodes } from "http-status-codes"
import { z } from "zod"
import { processRequest } from "../../lib/jmap/request"
import { capabilities, JmapRequest } from "../../lib/jmap/types"

export const apiHandler = withAuth(
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    // Validate the request
    if (!event.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
      const requestError: RequestError = {
        type: requestErrors.notJson,
        status: StatusCodes.BAD_REQUEST,
        detail: "Content type of the request was not application/json",
      }
      return {
        statusCode: StatusCodes.BAD_REQUEST,
        headers: jsonResponseHeaders(event),
        body: JSON.stringify(requestError),
      }
    }

    if (!event.body) {
      const requestError: RequestError = {
        type: requestErrors.notRequest,
        status: StatusCodes.BAD_REQUEST,
        detail: "Request body is missing",
      }
      return {
        statusCode: StatusCodes.BAD_REQUEST,
        headers: jsonResponseHeaders(event),
        body: JSON.stringify(requestError),
      }
    }

    let jmapRequest: JmapRequest
    try {
      //TODO ensure IJSON
      jmapRequest = JSON.parse(event.body)
    } catch {
      const requestError: RequestError = {
        type: requestErrors.notJson,
        status: StatusCodes.BAD_REQUEST,
        detail: "Request did not parse as I-JSON",
      }
      return {
        statusCode: StatusCodes.BAD_REQUEST,
        headers: jsonResponseHeaders(event),
        body: JSON.stringify(requestError),
      }
    }

    const requestAsSchema = requestSchema.safeParse(jmapRequest)

    if (!requestAsSchema.success) {
      const requestError: RequestError = {
        type: requestErrors.notRequest,
        status: StatusCodes.BAD_REQUEST,
        detail: "Request did not match the type signature of the Request object",
      }
      return {
        statusCode: StatusCodes.BAD_REQUEST,
        headers: jsonResponseHeaders(event),
        body: JSON.stringify(requestError),
      }
    }

    // Check client is not using unknown capabilities
    for (const capability of requestAsSchema.data.using) {
      // check capability is in capabilities object
      if (!(capability in capabilities)) {
        const requestError: RequestError = {
          type: requestErrors.unknownCapability,
          status: StatusCodes.BAD_REQUEST,
          detail: `Unknown capability: ${capability}`,
        }
        return {
          statusCode: StatusCodes.BAD_REQUEST,
          headers: jsonResponseHeaders(event),
          body: JSON.stringify(requestError),
        }
      }
    }

    // Process the request
    try {
      const response = processRequest(requestAsSchema.data as JmapRequest)
      return {
        statusCode: StatusCodes.OK,
        headers: jsonResponseHeaders(event),
        body: JSON.stringify(response),
      }
    } catch (error) {
      return {
        statusCode: StatusCodes.BAD_REQUEST,
        headers: jsonResponseHeaders(event),
        body: JSON.stringify(error as RequestError),
      }
    }
  }
)

const requestSchema = z.object({
  using: z.array(z.string()),
  methodCalls: z.array(z.tuple([z.string(), z.record(z.string(), z.unknown()), z.string()])).min(1),
  createdIds: z.record(z.string(), z.string()).optional(),
})
