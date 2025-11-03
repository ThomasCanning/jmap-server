import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { verifyBearerFromEvent, verifyBasicWithCognito, unauthorizedHeadersFor, unauthorizedStatusFor, accessTokenCookie, corsHeaders } from '../lib/auth'

export const jmapHandler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  if (event.requestContext.http.method !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const clientId = process.env.USER_POOL_CLIENT_ID!

  // 1) Try Bearer fast path
  const bearer = await verifyBearerFromEvent(event, clientId)
  if (!bearer.ok) {
    // 2) Try Basic and set cookie on success
    const basic = await verifyBasicWithCognito(
      (event.headers?.authorization as string) ?? (event.headers?.Authorization as string),
      clientId
    )
    if (!basic.ok || !basic.bearerToken) {
      return {
        statusCode: basic.ok ? unauthorizedStatusFor(event) : basic.statusCode,
        headers: unauthorizedHeadersFor(event),
        body: JSON.stringify({ error: basic.ok ? 'Unauthorized' : basic.message }),
      }
    }
    // Set cookie and continue
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': accessTokenCookie(basic.bearerToken, 600),
        ...corsHeaders(event),
      },
      // TODO: implement JMAP method processing. For now, echo an empty response shape
      body: JSON.stringify({ methodResponses: [] }),
    }
  }

  // Bearer valid: process request
  // TODO: implement full JMAP logic; placeholder empty response
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ methodResponses: [] }),
  }
}


