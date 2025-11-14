import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { withAuth, jsonResponseHeaders, createAuthErrorResponse } from '../../lib/auth'
import { validateEnvVar } from '../../lib/env'

export const sessionHandler = withAuth(async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const apiUrlResult = validateEnvVar('API_URL', process.env.API_URL)
  if (!apiUrlResult.ok) {
    return createAuthErrorResponse(event, apiUrlResult.statusCode, apiUrlResult.message)
  }

  return {
    statusCode: 200,
    headers: jsonResponseHeaders(event),
    body: JSON.stringify({
      capabilities: {},
      apiUrl: apiUrlResult.value,
      primaryAccounts: {},
    }),
  }
})

