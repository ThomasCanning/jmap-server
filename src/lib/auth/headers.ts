import { APIGatewayProxyEventV2 } from "aws-lambda"
import { StatusCodes } from "http-status-codes"
import { selectLanguage } from "../jmap/language"
import { BasicAuthResult } from "./types"
import { createProblemDetails, errorTypes } from "../errors"

export function getHeader(event: APIGatewayProxyEventV2, name: string): string | undefined {
  const h = event.headers
  if (!h) return undefined
  // Try exact case first, then lowercase, then uppercase (API Gateway v2 normalizes to lowercase)
  return (h[name] || h[name.toLowerCase()] || h[name.toUpperCase()]) as string | undefined
}

function getAllowedOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS
  if (!origins) {
    return []
  }
  return origins
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0)
}

function getCorsHeaders(event: APIGatewayProxyEventV2): Record<string, string> {
  const origin = getHeader(event, "origin")
  if (!origin) {
    return {}
  }

  const allowedOrigins = getAllowedOrigins()
  if (allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
    // Origin not allowed, return empty headers (no CORS)
    return {}
  }

  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  }
}

export function jsonResponseHeaders(
  event: APIGatewayProxyEventV2,
  isError?: boolean
): Record<string, string> {
  const language = selectLanguage(event)
  return {
    ...getCorsHeaders(event),
    "Content-Language": language,
    "Content-Type": isError ? "application/problem+json" : "application/json",
  }
}

export function corsOnlyHeaders(event: APIGatewayProxyEventV2): Record<string, string> {
  return getCorsHeaders(event)
}

export function parseBasicAuth(authorizationHeader: string | undefined): BasicAuthResult {
  if (!authorizationHeader) {
    throw createProblemDetails({
      type: errorTypes.badRequest,
      status: StatusCodes.BAD_REQUEST,
      detail:
        "Missing Basic auth header. Must be in the format 'Basic <base64 encoded username:password>'",
      title: "Unauthorized",
    })
  }

  if (!authorizationHeader?.startsWith("Basic ")) {
    throw createProblemDetails({
      type: errorTypes.badRequest,
      status: StatusCodes.BAD_REQUEST,
      detail:
        "Invalid Basic auth header. Must be in the format 'Basic <base64 encoded username:password>'",
      title: "Unauthorized",
    })
  }

  const base64Part = authorizationHeader.slice(6)
  // Validate base64 characters (A-Z, a-z, 0-9, +, /, =)
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Part)) {
    throw createProblemDetails({
      type: errorTypes.badRequest,
      status: StatusCodes.BAD_REQUEST,
      detail: "Basic auth header contains invalid Base64 characters",
      title: "Unauthorized",
    })
  }

  let decoded: string
  try {
    decoded = Buffer.from(base64Part, "base64").toString("utf8")
  } catch {
    throw createProblemDetails({
      type: errorTypes.badRequest,
      status: StatusCodes.BAD_REQUEST,
      detail: "Basic auth header contains invalid Base64 characters",
      title: "Unauthorized",
    })
  }

  const sep = decoded.indexOf(":")
  if (sep < 0) {
    throw createProblemDetails({
      type: errorTypes.badRequest,
      status: StatusCodes.BAD_REQUEST,
      detail:
        "Basic auth header contains invalid format. Must be in the format 'Basic <base64 encoded username:password>'",
      title: "Unauthorized",
    })
  }

  const username = decoded.slice(0, sep)
  const password = decoded.slice(sep + 1)

  return { username, password }
}
