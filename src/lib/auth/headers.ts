import { APIGatewayProxyEventV2 } from 'aws-lambda'

export function getHeader(event: APIGatewayProxyEventV2, name: string): string | undefined {
  const h = event.headers
  if (!h) return undefined
  // Check exact match, lowercase, uppercase, and title case (e.g., "Authorization")
  const titleCase = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
  return (h[name] ?? h[name.toLowerCase()] ?? h[name.toUpperCase()] ?? h[titleCase]) as string | undefined
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  const out: Record<string, string> = {}
  header.split(';').forEach((part) => {
    const [k, ...rest] = part.trim().split('=')
    if (!k) return
    const key = k.trim()
    const value = rest.join('=').trim()
    out[key] = decodeURIComponent(value)
  })
  return out
}

export function unauthorizedHeadersFor(_event: APIGatewayProxyEventV2): Record<string, string> {
  return { 'Content-Type': 'application/json' }
}

/**
 * Returns the HTTP status code for unauthorized requests.
 * Always returns 401 (Unauthorized) - semantically correct for missing authentication.
 * Modern browsers don't show native prompts for 401 on fetch/XHR requests.
 */
export function unauthorizedStatusFor(_event: APIGatewayProxyEventV2): number {
  return 401
}

/**
 * Returns CORS headers. Always included (harmless if no Origin present).
 * If Origin is present, echoes it back; otherwise returns empty CORS headers.
 */
function getCorsHeaders(event: APIGatewayProxyEventV2): Record<string, string> {
  const origin = getHeader(event, 'origin')
  if (!origin) {
    // No Origin - return empty (CORS headers not needed, but harmless if included)
    return {}
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  }
}

/**
 * Returns standard headers for JSON responses, including Content-Type and CORS headers.
 * Use this for all JSON API responses to avoid repetitive header setup.
 */
export function jsonResponseHeaders(event: APIGatewayProxyEventV2): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...getCorsHeaders(event),
  }
}

/**
 * Returns CORS headers only (no Content-Type).
 * Use this for non-JSON responses like 204 No Content.
 */
export function corsOnlyHeaders(event: APIGatewayProxyEventV2): Record<string, string> {
  return getCorsHeaders(event)
}

