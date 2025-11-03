import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { verifyBearerFromEvent, verifyBasicWithCognito, unauthorizedHeadersFor, unauthorizedStatusFor, accessTokenCookie, corsHeaders } from '../lib/auth'

export const wellKnownJmapHandler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    if (event.requestContext.http.method !== 'GET') {
      return { statusCode: 405, body: 'Method Not Allowed' }
    }

    const clientId = process.env.USER_POOL_CLIENT_ID
    if (!clientId) {
      console.error('Missing USER_POOL_CLIENT_ID env var')
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
        body: JSON.stringify({ error: 'Server misconfiguration (USER_POOL_CLIENT_ID missing)' }),
      }
    }

    // 1) Try Bearer fast path
    const bearer = await verifyBearerFromEvent(event, clientId)
    if (bearer.ok) {
      return jmapSessionResponse(event)
    }

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

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': accessTokenCookie(basic.bearerToken, 600),
        ...corsHeaders(event),
      },
      body: JSON.stringify(sessionBody()),
    }
  } catch (error) {
    console.error('wellKnownJmapHandler error:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
      body: JSON.stringify({ error: 'Internal server error' }),
    }
  }
}

function sessionBody() {
  return {
    capabilities: {},
    apiUrl: process.env.API_URL || '',
    primaryAccounts: {},
  }
}

function jmapSessionResponse(event: APIGatewayProxyEventV2): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify(sessionBody()),
  }
}

