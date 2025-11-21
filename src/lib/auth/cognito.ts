import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RevokeTokenCommand,
} from "@aws-sdk/client-cognito-identity-provider"
import { NodeHttpHandler } from "@smithy/node-http-handler"
import { StatusCodes } from "http-status-codes"
import { decodeJwt } from "jose"
import { AuthResult } from "./types"
import { createProblemDetails, errorTypes, isProblemDetails } from "../errors"

let cognitoClient: CognitoIdentityProviderClient | null = null

function getCognitoClient(): CognitoIdentityProviderClient {
  if (!cognitoClient) {
    // AWS SDK will auto-detect region from AWS_REGION or AWS_DEFAULT_REGION env vars
    cognitoClient = new CognitoIdentityProviderClient({
      maxAttempts: 2,
      requestHandler: new NodeHttpHandler({
        requestTimeout: 3000,
        connectionTimeout: 1000,
      }),
    })
  }
  return cognitoClient
}

export async function authenticate(
  username: string,
  password: string,
  userPoolClientId: string
): Promise<AuthResult> {
  if (!username || username.trim().length === 0) {
    throw createProblemDetails({
      type: errorTypes.badRequest,
      status: StatusCodes.BAD_REQUEST,
      detail: "Username is required",
      title: "Bad Request",
    })
  }
  if (!password || password.length === 0) {
    throw createProblemDetails({
      type: errorTypes.badRequest,
      status: StatusCodes.BAD_REQUEST,
      detail: "Password is required",
      title: "Bad Request",
    })
  }

  try {
    const cmd = new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: userPoolClientId,
      AuthParameters: { USERNAME: username, PASSWORD: password },
    })
    const res = await getCognitoClient().send(cmd)
    const token = res.AuthenticationResult?.AccessToken
    const refreshToken = res.AuthenticationResult?.RefreshToken

    if (!token) {
      throw createProblemDetails({
        type: errorTypes.unauthorized,
        status: StatusCodes.UNAUTHORIZED,
        detail: "Authentication failed. Invalid username or password",
        title: "Unauthorized",
      })
    }

    return { username, bearerToken: token, refreshToken }
  } catch (error) {
    // If it's already a ProblemDetails error, re-throw it
    if (isProblemDetails(error)) {
      throw error
    }
    // Wrap AWS SDK errors
    throw createProblemDetails({
      type: errorTypes.unauthorized,
      status: StatusCodes.UNAUTHORIZED,
      detail: "Authentication failed. Invalid username or password",
      title: "Unauthorized",
    })
  }
}

export async function refresh(refreshToken: string, userPoolClientId: string): Promise<AuthResult> {
  if (!refreshToken || refreshToken.trim().length === 0) {
    throw createProblemDetails({
      type: errorTypes.badRequest,
      status: StatusCodes.BAD_REQUEST,
      detail: "Refresh token is required",
      title: "Bad Request",
    })
  }

  try {
    const cmd = new InitiateAuthCommand({
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: userPoolClientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    })
    const res = await getCognitoClient().send(cmd)
    const token = res.AuthenticationResult?.AccessToken
    const newRefreshToken = res.AuthenticationResult?.RefreshToken || refreshToken

    if (!token) {
      throw createProblemDetails({
        type: errorTypes.unauthorized,
        status: StatusCodes.UNAUTHORIZED,
        detail: "Refresh token authentication failed. Invalid or expired refresh token",
        title: "Unauthorized",
      })
    }

    const decoded = decodeJwt(token)
    const username =
      ((decoded.username || decoded["cognito:username"] || decoded.sub) as string) || ""

    return { username, bearerToken: token, refreshToken: newRefreshToken }
  } catch (error) {
    // If it's already a ProblemDetails error, re-throw it
    if (isProblemDetails(error)) {
      throw error
    }
    throw createProblemDetails({
      type: errorTypes.unauthorized,
      status: StatusCodes.UNAUTHORIZED,
      detail: "Refresh token authentication failed. Invalid or expired refresh token",
      title: "Unauthorized",
    })
  }
}

export async function revokeToken(refreshToken: string, userPoolClientId: string): Promise<void> {
  try {
    const cmd = new RevokeTokenCommand({
      Token: refreshToken,
      ClientId: userPoolClientId,
    })
    await getCognitoClient().send(cmd)
  } catch (error) {
    // If it's already a ProblemDetails error, re-throw it
    if (isProblemDetails(error)) {
      throw error
    }
    // Wrap AWS SDK errors - but don't fail logout if token revocation fails
    // Don't throw - logout should succeed even if revocation fails
  }
}
