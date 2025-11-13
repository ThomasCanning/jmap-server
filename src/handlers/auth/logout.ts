import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { clearAccessTokenCookie, clearRefreshTokenCookie, corsOnlyHeaders } from '../../lib/auth'

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  return {
    statusCode: 204,
    headers: corsOnlyHeaders(event),
    cookies: [
      clearAccessTokenCookie(),
      clearRefreshTokenCookie(),
    ],
    body: ''
  }
}

