import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { clearAccessTokenCookie, corsHeaders } from '../lib/auth'

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  if (event.requestContext.http.method !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }
  return {
    statusCode: 204,
    headers: {
      'Set-Cookie': clearAccessTokenCookie(),
      ...corsHeaders(event),
    },
    body: ''
  }
}


