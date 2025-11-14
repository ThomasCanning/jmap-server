import { APIGatewayProxyEventV2 } from 'aws-lambda'
import { getHeader, parseBasicAuth } from './headers'
import { authenticate } from './cognito'
import { AuthResult } from './types'
import { validateEnvVar } from '../env'

interface CredentialsRequestBody {
  username?: string
  password?: string
}

export function extractCredentialsFromEvent(
  event: APIGatewayProxyEventV2
): { ok: true; username: string; password: string } | { ok: false; statusCode: number; message: string } {
  if (event.body) {
    try {
      const body = JSON.parse(event.body) as CredentialsRequestBody
      if (body.username && body.password) {
        return { ok: true, username: body.username, password: body.password }
      }
    } catch (e) {
      return { ok: false, statusCode: 400, message: 'Invalid JSON in request body' }
    }
  }

  const authzHeader = getHeader(event, 'authorization')
  if (!authzHeader && !event.body) {
    return {
      ok: false,
      statusCode: 400,
      message: 'Missing username and password. Provide credentials in the request body as JSON: {"username": "user@example.com", "password": "password"}, or use Basic auth with the Authorization header.'
    }
  }

  const basicAuth = parseBasicAuth(authzHeader)
  if (basicAuth.ok) {
    return basicAuth
  }

  if (basicAuth.message === 'Missing Basic auth' && !event.body) {
    return {
      ok: false,
      statusCode: 400,
      message: 'Missing username and password. Provide credentials in the request body as JSON: {"username": "user@example.com", "password": "password"}, or use Basic auth with the Authorization header.'
    }
  }

  return basicAuth
}

export async function authenticateRequest(
  event: APIGatewayProxyEventV2
): Promise<AuthResult> {
  const clientIdResult = validateEnvVar('USER_POOL_CLIENT_ID', process.env.USER_POOL_CLIENT_ID)
  if (!clientIdResult.ok) {
    return clientIdResult
  }

  const credentials = extractCredentialsFromEvent(event)
  if (!credentials.ok) {
    return credentials
  }

  return await authenticate(credentials.username, credentials.password, clientIdResult.value)
}

