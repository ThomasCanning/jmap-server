import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { withAuth, jsonResponseHeaders } from '../../lib/auth'

export const jmapHandler = withAuth(async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  // TODO: implement JMAP method processing. For now, echo an empty response shape
  return {
    statusCode: 200,
    headers: jsonResponseHeaders(event),
    body: JSON.stringify({ methodResponses: [] }),
  }
})

