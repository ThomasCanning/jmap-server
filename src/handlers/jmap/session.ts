import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { createAuthHandler } from '../../lib/auth'

export const sessionHandler = createAuthHandler(async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      capabilities: {},
      apiUrl: process.env.API_URL || '',
      primaryAccounts: {},
    }),
  }
})

