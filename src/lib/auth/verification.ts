import { APIGatewayProxyEventV2 } from "aws-lambda"
import { StatusCodes } from "http-status-codes"
import { CognitoJwtVerifier } from "aws-jwt-verify"
import { AuthResult } from "./types"
import { getHeader } from "./headers"
import { getTokenFromCookies } from "./cookies"
import { createProblemDetails, errorTypes, isProblemDetails } from "../errors"

// Cache verifier instances per userPoolId+clientId combination
const verifierCache = new Map<string, ReturnType<typeof CognitoJwtVerifier.create>>()

function getVerifier(userPoolId: string, userPoolClientId: string) {
  const cacheKey = `${userPoolId}:${userPoolClientId}`
  let verifier = verifierCache.get(cacheKey)
  if (!verifier) {
    // Create verifier that validates access tokens
    // It automatically handles JWKS fetching, signature verification, issuer validation, and expiration
    verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: "access",
      clientId: userPoolClientId,
    })
    verifierCache.set(cacheKey, verifier)
  }
  return verifier
}

export async function verifyBearerFromEvent(
  event: APIGatewayProxyEventV2,
  userPoolClientId: string
): Promise<AuthResult> {
  // 1. Get the User Pool ID from environment
  const userPoolId = process.env.USER_POOL_ID
  if (!userPoolId) {
    throw createProblemDetails({
      type: errorTypes.internalServerError,
      status: StatusCodes.INTERNAL_SERVER_ERROR,
      detail: "Server misconfiguration. (USER_POOL_ID missing from env vars)",
      title: "Internal Server Error",
    })
  }

  let token = getTokenFromCookies(event, "access_token")

  if (!token) {
    const authz = getHeader(event, "authorization")
    if (authz?.startsWith("Bearer ")) {
      token = authz.slice(7)
    }
  }

  if (!token) {
    throw createProblemDetails({
      type: errorTypes.unauthorized,
      status: StatusCodes.UNAUTHORIZED,
      detail: "Missing Bearer token",
      title: "Unauthorized",
    })
  }

  try {
    const verifier = getVerifier(userPoolId, userPoolClientId)
    // Verify token: checks signature, issuer, expiration, client ID, and token use
    const payload = await verifier.verify(token)

    const username = (payload.username || payload["cognito:username"] || payload.sub) as string

    return { username, claims: payload, bearerToken: token }
  } catch (error) {
    // If it's already a ProblemDetails error, re-throw it
    if (isProblemDetails(error)) {
      throw error
    }
    // Wrap verification errors
    throw createProblemDetails({
      type: errorTypes.unauthorized,
      status: StatusCodes.UNAUTHORIZED,
      detail: "Invalid token",
      title: "Unauthorized",
    })
  }
}
