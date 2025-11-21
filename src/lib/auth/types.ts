import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { JWTPayload } from "jose"

export interface CognitoJWTClaims extends JWTPayload {
  token_use?: "access" | "id" | "refresh"
  client_id?: string
  username?: string
  "cognito:username"?: string
}

export type AuthResult = {
  username: string
  bearerToken?: string
  refreshToken?: string
  claims?: CognitoJWTClaims
}

export type HandlerFunction = (
  event: APIGatewayProxyEventV2,
  auth: AuthResult
) => Promise<APIGatewayProxyStructuredResultV2>

export interface CredentialsRequestBody {
  username?: string
  password?: string
  refreshToken?: string
}

export type BasicAuthResult = {
  username?: string
  password?: string
}
