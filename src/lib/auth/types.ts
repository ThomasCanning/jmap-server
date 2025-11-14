import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { JWTPayload } from 'jose'

export interface CognitoJWTClaims extends JWTPayload {
  token_use?: 'access' | 'id' | 'refresh'
  client_id?: string
  username?: string
  'cognito:username'?: string
}

export type AuthResult =
  | { ok: true; username?: string; bearerToken?: string; refreshToken?: string; claims?: CognitoJWTClaims }
  | { ok: false; statusCode: number; message: string }

export type AuthenticatedContext = AuthResult & { ok: true }

export type HandlerFunction = (
  event: APIGatewayProxyEventV2,
  auth: AuthenticatedContext
) => Promise<APIGatewayProxyStructuredResultV2>

export function isAuthenticatedContext(result: AuthResult): result is AuthenticatedContext {
  return result.ok === true
}

