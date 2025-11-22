import { APIGatewayProxyEventV2 } from "aws-lambda"
import { getHeader } from "./headers"

// Cookie configuration constants
const ACCESS_TOKEN_MAX_AGE = 3600 // 1 hour (matches Cognito access token lifetime)
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds
const MAX_TOKEN_LENGTH = 8192

/**
 * Determines if we're running in local development mode.
 * Checks the IS_LOCAL_DEV environment variable.
 */
function isLocalDevelopment(): boolean {
  return process.env.IS_LOCAL_DEV === "true"
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  const out: Record<string, string> = {}
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=")
    if (!k) continue
    const key = k.trim()
    const value = rest.join("=").trim()
    try {
      out[key] = decodeURIComponent(value)
    } catch (error) {
      // decodeURIComponent only throws URIError for invalid encoding
      // Skip cookies with invalid URL encoding
      if (error instanceof URIError) {
        continue
      }
      // Re-throw any unexpected errors (shouldn't happen)
      throw error
    }
  }
  return out
}

export function getTokenFromCookies(event: APIGatewayProxyEventV2, tokenName: string): string {
  const cookiesArray = event.cookies || []
  for (const cookie of cookiesArray) {
    if (cookie.startsWith(`${tokenName}=`)) {
      const value = cookie.substring(`${tokenName}=`.length)
      if (value && value.trim().length > 0 && value.length <= MAX_TOKEN_LENGTH) {
        try {
          return decodeURIComponent(value)
        } catch (error) {
          // decodeURIComponent only throws URIError for invalid encoding
          // Skip cookies with invalid URL encoding
          if (error instanceof URIError) {
            continue
          }
          // Re-throw any unexpected errors (shouldn't happen)
          throw error
        }
      }
    }
  }

  const cookieHeader = getHeader(event, "cookie")
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader)
    const value = cookies[tokenName]
    if (value && value.trim().length > 0 && value.length <= MAX_TOKEN_LENGTH) {
      return value
    }
  }

  return ""
}

export function accessTokenCookie(token: string): string {
  const sameSite = isLocalDevelopment() ? "SameSite=Lax" : "SameSite=None"
  const attrs = [
    `access_token=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Secure",
    sameSite,
    "Path=/",
    `Max-Age=${ACCESS_TOKEN_MAX_AGE}`,
  ]
  return attrs.join("; ")
}

export function clearAccessTokenCookie(): string {
  const sameSite = isLocalDevelopment() ? "SameSite=Lax" : "SameSite=None"
  return `access_token=deleted; HttpOnly; Secure; ${sameSite}; Path=/; Max-Age=0`
}

export function refreshTokenCookie(token: string): string {
  const sameSite = isLocalDevelopment() ? "SameSite=Lax" : "SameSite=None"
  const attrs = [
    `refresh_token=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Secure",
    sameSite,
    "Path=/",
    `Max-Age=${REFRESH_TOKEN_MAX_AGE}`,
  ]
  return attrs.join("; ")
}

export function clearRefreshTokenCookie(): string {
  const sameSite = isLocalDevelopment() ? "SameSite=Lax" : "SameSite=None"
  return `refresh_token=deleted; HttpOnly; Secure; ${sameSite}; Path=/; Max-Age=0`
}

export function setAuthCookies(accessToken?: string, refreshToken?: string): string[] {
  const cookies: string[] = []
  if (accessToken) {
    cookies.push(accessTokenCookie(accessToken))
  }
  if (refreshToken) {
    cookies.push(refreshTokenCookie(refreshToken))
  }
  return cookies
}
