import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { JWTPayload } from 'jose'

export type AuthResult =
  | { ok: true; username?: string; bearerToken?: string; refreshToken?: string; claims?: JWTPayload }
  | { ok: false; statusCode: number; message: string }

export type AuthenticatedContext = AuthResult & { ok: true }

export type HandlerFunction = (
  event: APIGatewayProxyEventV2,
  auth: AuthenticatedContext
) => Promise<APIGatewayProxyStructuredResultV2>

export interface AuthOptions {
  requireAuth?: boolean
}

