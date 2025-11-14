import { APIGatewayProxyEventV2 } from 'aws-lambda'

export function getHeader(event: APIGatewayProxyEventV2, name: string): string | undefined {
  const h = event.headers
  if (!h) return undefined
  return h[name.toLowerCase()] as string | undefined
}

function getAllowedOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS
  if (!origins) {
    return []
  }
  return origins.split(',').map(o => o.trim()).filter(o => o.length > 0)
}

function getCorsHeaders(event: APIGatewayProxyEventV2): Record<string, string> {
  const origin = getHeader(event, 'origin')
  if (!origin) {
    return {}
  }

  const allowedOrigins = getAllowedOrigins()
  if (allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
    // Origin not allowed, return empty headers (no CORS)
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

function responseHeaders(
  event: APIGatewayProxyEventV2,
  includeContentType: boolean = true
): Record<string, string> {
  const headers: Record<string, string> = {}
  if (includeContentType) {
    headers['Content-Type'] = 'application/json'
  }
  return {
    ...headers,
    ...getCorsHeaders(event),
  }
}

export function jsonResponseHeaders(event: APIGatewayProxyEventV2): Record<string, string> {
  return responseHeaders(event, true)
}

export function corsOnlyHeaders(event: APIGatewayProxyEventV2): Record<string, string> {
  return responseHeaders(event, false)
}

export function parseBasicAuth(
  authorizationHeader: string | undefined
): { ok: true; username: string; password: string } | { ok: false; statusCode: number; message: string } {
  if (!authorizationHeader?.startsWith('Basic ')) {
    return { ok: false, statusCode: 401, message: 'Missing Basic auth' }
  }

  let decoded: string
  try {
    decoded = Buffer.from(authorizationHeader.slice(6), 'base64').toString('utf8')
  } catch {
    return { ok: false, statusCode: 400, message: 'Invalid Base64' }
  }

  const sep = decoded.indexOf(':')
  if (sep < 0) {
    return { ok: false, statusCode: 400, message: 'Invalid Basic format' }
  }
  
  const username = decoded.slice(0, sep)
  const password = decoded.slice(sep + 1)
  
  return { ok: true, username, password }
}

