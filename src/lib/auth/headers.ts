import { APIGatewayProxyEventV2 } from "aws-lambda"
import { StatusCodes } from "http-status-codes"
import { selectLanguage } from "../jmap/language"

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

export function jsonResponseHeaders(event: APIGatewayProxyEventV2): Record<string, string> {
  const language = selectLanguage(event)
  return {
    ...getCorsHeaders(event),
    "Content-Language": language,
    "Content-Type": "application/json",
  }
}

export function corsOnlyHeaders(event: APIGatewayProxyEventV2): Record<string, string> {
  return getCorsHeaders(event)
}

export function parseBasicAuth(
  authorizationHeader: string | undefined
):
  | { ok: true; username: string; password: string }
  | { ok: false; statusCode: number; message: string } {
  if (!authorizationHeader?.startsWith("Basic ")) {
    return { ok: false, statusCode: StatusCodes.UNAUTHORIZED, message: "Missing Basic auth" }
  }

  const base64Part = authorizationHeader.slice(6)
  // Validate base64 characters (A-Z, a-z, 0-9, +, /, =)
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Part)) {
    return { ok: false, statusCode: StatusCodes.UNAUTHORIZED, message: "Invalid Base64" }
  }

  let decoded: string
  try {
    decoded = Buffer.from(base64Part, "base64").toString("utf8")
  } catch {
    return { ok: false, statusCode: StatusCodes.UNAUTHORIZED, message: "Invalid Base64" }
  }

  const sep = decoded.indexOf(":")
  if (sep < 0) {
    return { ok: false, statusCode: StatusCodes.UNAUTHORIZED, message: "Invalid Basic format" }
  }

  const username = decoded.slice(0, sep)
  const password = decoded.slice(sep + 1)

  return { ok: true, username, password }
}
