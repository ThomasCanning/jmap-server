import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { jsonResponseHeaders } from './headers'
import { AuthResult } from './types'

export function createAuthErrorResponse(
  event: APIGatewayProxyEventV2,
  statusCode: number,
  message: string
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: jsonResponseHeaders(event),
    body: JSON.stringify({ error: message }),
  }
}

export function handleAuthError(
  event: APIGatewayProxyEventV2,
  result: AuthResult
): APIGatewayProxyStructuredResultV2 {
  if (!result.ok) {
    return createAuthErrorResponse(event, result.statusCode, result.message)
  }
  throw new Error('handleAuthError called with success result')
}

