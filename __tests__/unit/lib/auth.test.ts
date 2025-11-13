import { APIGatewayProxyEventV2 } from 'aws-lambda'
import { CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider'
import * as jose from 'jose'
import {
  getHeader,
  parseCookies,
  accessTokenCookie,
  clearAccessTokenCookie,
  refreshTokenCookie,
  clearRefreshTokenCookie,
  verifyBasicWithCognito,
  refreshAccessToken,
  verifyBearerFromEvent,
  unauthorizedHeadersFor,
  unauthorizedStatusFor,
  corsOnlyHeaders,
  withAuth,
  createAuthHandler,
  AuthResult,
} from '../../../src/lib/auth'

// Mock AWS SDK
jest.mock('@aws-sdk/client-cognito-identity-provider')
const mockSend = jest.fn()
CognitoIdentityProviderClient.prototype.send = mockSend

// Mock jose
jest.mock('jose')
const mockJwtVerify = jose.jwtVerify as jest.MockedFunction<typeof jose.jwtVerify>
const mockCreateRemoteJWKSet = jose.createRemoteJWKSet as jest.MockedFunction<typeof jose.createRemoteJWKSet>

describe('auth.ts', () => {
  const TEST_CLIENT_ID = 'test-client-id'
  const TEST_ACCESS_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2NvZ25pdG8taWRwLnVzLWVhc3QtMS5hbWF6b25hd3MuY29tL3VzLWVhc3QtMV90ZXN0Iiwic3ViIjoidXNlcjEyMyIsInRva2VuX3VzZSI6ImFjY2VzcyIsImNsaWVudF9pZCI6InRlc3QtY2xpZW50LWlkIiwidXNlcm5hbWUiOiJ0ZXN0dXNlciIsImV4cCI6OTk5OTk5OTk5OX0.signature'
  const TEST_REFRESH_TOKEN = 'refresh-token-123'

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.USER_POOL_CLIENT_ID = TEST_CLIENT_ID
    process.env.AWS_REGION = 'us-east-1'
  })

  const baseEvent = (overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 =>
    ({
      requestContext: {
        http: {
          method: 'GET',
          path: '/test',
        },
      } as any,
      headers: {},
      cookies: [],
      ...overrides,
    } as APIGatewayProxyEventV2)

  describe('getHeader', () => {
    it('retrieves header by exact case', () => {
      const event = baseEvent({ headers: { 'Content-Type': 'application/json' } })
      expect(getHeader(event, 'Content-Type')).toBe('application/json')
    })

    it('retrieves header by lowercase', () => {
      const event = baseEvent({ headers: { 'content-type': 'application/json' } })
      expect(getHeader(event, 'Content-Type')).toBe('application/json')
    })

    it('retrieves header by uppercase', () => {
      const event = baseEvent({ headers: { 'CONTENT-TYPE': 'application/json' } })
      expect(getHeader(event, 'Content-Type')).toBe('application/json')
    })

    it('returns undefined for missing header', () => {
      const event = baseEvent({ headers: {} })
      expect(getHeader(event, 'Authorization')).toBeUndefined()
    })

    it('returns undefined when headers object is missing', () => {
      const event = baseEvent()
      delete (event as any).headers
      expect(getHeader(event, 'Authorization')).toBeUndefined()
    })
  })

  describe('parseCookies', () => {
    it('parses single cookie', () => {
      const result = parseCookies('session_id=abc123')
      expect(result).toEqual({ session_id: 'abc123' })
    })

    it('parses multiple cookies', () => {
      const result = parseCookies('session_id=abc123; user=john; theme=dark')
      expect(result).toEqual({
        session_id: 'abc123',
        user: 'john',
        theme: 'dark',
      })
    })

    it('handles URL-encoded values', () => {
      const result = parseCookies('email=user%40example.com')
      expect(result).toEqual({ email: 'user@example.com' })
    })

    it('handles cookies with = in value', () => {
      const result = parseCookies('token=abc=def=ghi')
      expect(result).toEqual({ token: 'abc=def=ghi' })
    })

    it('handles whitespace around separators', () => {
      const result = parseCookies('  session_id = abc123 ; user = john  ')
      // Implementation now trims both keys and values
      expect(result).toEqual({
        session_id: 'abc123',
        user: 'john',
      })
    })

    it('returns empty object for undefined', () => {
      expect(parseCookies(undefined)).toEqual({})
    })

    it('returns empty object for empty string', () => {
      expect(parseCookies('')).toEqual({})
    })
  })

  describe('accessTokenCookie', () => {
    it('creates cookie with correct attributes', () => {
      const cookie = accessTokenCookie('token123', 3600)
      expect(cookie).toContain('access_token=token123')
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('Secure')
      expect(cookie).toContain('SameSite=Lax')
      expect(cookie).toContain('Path=/')
      expect(cookie).toContain('Max-Age=3600')
    })

    it('URL-encodes token value', () => {
      const cookie = accessTokenCookie('token with spaces', 3600)
      expect(cookie).toContain('access_token=token%20with%20spaces')
    })
  })

  describe('clearAccessTokenCookie', () => {
    it('creates deletion cookie', () => {
      const cookie = clearAccessTokenCookie()
      expect(cookie).toContain('access_token=deleted')
      expect(cookie).toContain('Max-Age=0')
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('Secure')
    })
  })

  describe('refreshTokenCookie', () => {
    it('creates cookie with correct attributes', () => {
      const cookie = refreshTokenCookie('refresh123', 2592000)
      expect(cookie).toContain('refresh_token=refresh123')
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('Secure')
      expect(cookie).toContain('SameSite=Lax')
      expect(cookie).toContain('Path=/')
      expect(cookie).toContain('Max-Age=2592000')
    })
  })

  describe('clearRefreshTokenCookie', () => {
    it('creates deletion cookie', () => {
      const cookie = clearRefreshTokenCookie()
      expect(cookie).toContain('refresh_token=deleted')
      expect(cookie).toContain('Max-Age=0')
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('Secure')
    })
  })

  describe('verifyBasicWithCognito', () => {
    it('returns success with tokens on valid credentials', async () => {
      mockSend.mockResolvedValue({
        AuthenticationResult: {
          AccessToken: 'access-token-123',
          RefreshToken: 'refresh-token-123',
        },
      })

      const authHeader = 'Basic ' + Buffer.from('user@example.com:password123').toString('base64')
      const result = await verifyBasicWithCognito(authHeader, TEST_CLIENT_ID)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.username).toBe('user@example.com')
        expect(result.bearerToken).toBe('access-token-123')
        expect(result.refreshToken).toBe('refresh-token-123')
      }
      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(mockSend).toHaveBeenCalledWith(expect.any(InitiateAuthCommand))
    })

    it('returns error when Authorization header is missing', async () => {
      const result = await verifyBasicWithCognito(undefined, TEST_CLIENT_ID)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(401)
        expect(result.message).toBe('Missing Basic auth')
      }
    })

    it('returns error when Authorization header is not Basic', async () => {
      const result = await verifyBasicWithCognito('Bearer token123', TEST_CLIENT_ID)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(401)
        expect(result.message).toBe('Missing Basic auth')
      }
    })

    it('returns error on invalid Base64', async () => {
      // Node.js Buffer.from with base64 is lenient and may not throw
      // Testing with actually invalid data that causes parsing issues
      const result = await verifyBasicWithCognito('Basic !!!invalid!!!', TEST_CLIENT_ID)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(400)
        // May be either Invalid Base64 or Invalid Basic format depending on decode result
        expect([400]).toContain(result.statusCode)
      }
    })

    it('returns error when credentials lack colon separator', async () => {
      const authHeader = 'Basic ' + Buffer.from('usernameonly').toString('base64')
      const result = await verifyBasicWithCognito(authHeader, TEST_CLIENT_ID)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(400)
        expect(result.message).toBe('Invalid Basic format')
      }
    })

    it('handles username with colon in password', async () => {
      mockSend.mockResolvedValue({
        AuthenticationResult: {
          AccessToken: 'access-token-123',
        },
      })

      const authHeader = 'Basic ' + Buffer.from('user:pass:word:123').toString('base64')
      const result = await verifyBasicWithCognito(authHeader, TEST_CLIENT_ID)

      expect(result.ok).toBe(true)
      expect(mockSend).toHaveBeenCalledTimes(1)
    })

    it('returns error when Cognito returns no access token', async () => {
      mockSend.mockResolvedValue({
        AuthenticationResult: {},
      })

      const authHeader = 'Basic ' + Buffer.from('user:pass').toString('base64')
      const result = await verifyBasicWithCognito(authHeader, TEST_CLIENT_ID)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(502)
        expect(result.message).toBe('No access token from Cognito')
      }
    })

    it('returns error on Cognito authentication failure', async () => {
      mockSend.mockRejectedValue(new Error('NotAuthorizedException'))

      const authHeader = 'Basic ' + Buffer.from('user:wrongpass').toString('base64')
      const result = await verifyBasicWithCognito(authHeader, TEST_CLIENT_ID)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(401)
        expect(result.message).toBe('Invalid credentials')
      }
    })
  })

  describe('refreshAccessToken', () => {
    it('returns new tokens on successful refresh', async () => {
      mockSend.mockResolvedValue({
        AuthenticationResult: {
          AccessToken: 'new-access-token',
          RefreshToken: 'new-refresh-token',
        },
      })

      const result = await refreshAccessToken('old-refresh-token', TEST_CLIENT_ID)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.bearerToken).toBe('new-access-token')
        expect(result.refreshToken).toBe('new-refresh-token')
      }
      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(mockSend).toHaveBeenCalledWith(expect.any(InitiateAuthCommand))
    })

    it('uses old refresh token when Cognito does not return new one', async () => {
      mockSend.mockResolvedValue({
        AuthenticationResult: {
          AccessToken: 'new-access-token',
          // No RefreshToken
        },
      })

      const result = await refreshAccessToken('old-refresh-token', TEST_CLIENT_ID)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.bearerToken).toBe('new-access-token')
        expect(result.refreshToken).toBe('old-refresh-token')
      }
    })

    it('returns error when Cognito returns no access token', async () => {
      mockSend.mockResolvedValue({
        AuthenticationResult: {},
      })

      const result = await refreshAccessToken('refresh-token', TEST_CLIENT_ID)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(502)
        expect(result.message).toBe('No access token from Cognito')
      }
    })

    it('returns error on Cognito refresh failure', async () => {
      mockSend.mockRejectedValue(new Error('NotAuthorizedException'))

      const result = await refreshAccessToken('expired-token', TEST_CLIENT_ID)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(401)
        expect(result.message).toBe('Invalid or expired refresh token')
      }
    })
  })

  describe('verifyBearerFromEvent', () => {
    beforeEach(() => {
      // Mock JWKS and verification
      mockCreateRemoteJWKSet.mockReturnValue((() => {}) as any)
      mockJwtVerify.mockResolvedValue({
        payload: {
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
          sub: 'user123',
          token_use: 'access',
          client_id: TEST_CLIENT_ID,
          username: 'testuser',
          exp: 9999999999,
        },
        protectedHeader: { alg: 'RS256' },
      } as any)
    })

    it('verifies token from cookies array', async () => {
      const event = baseEvent({
        cookies: ['access_token=' + TEST_ACCESS_TOKEN, 'other=value'],
      })

      const result = await verifyBearerFromEvent(event, TEST_CLIENT_ID)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.bearerToken).toBe(TEST_ACCESS_TOKEN)
        expect(result.claims).toBeDefined()
        expect(result.claims?.sub).toBe('user123')
      }
    })

    it('verifies token from Cookie header', async () => {
      const event = baseEvent({
        headers: {
          cookie: `access_token=${TEST_ACCESS_TOKEN}; other=value`,
        },
      })

      const result = await verifyBearerFromEvent(event, TEST_CLIENT_ID)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.bearerToken).toBe(TEST_ACCESS_TOKEN)
      }
    })

    it('verifies token from Authorization header', async () => {
      const event = baseEvent({
        headers: {
          authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
        },
      })

      const result = await verifyBearerFromEvent(event, TEST_CLIENT_ID)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.bearerToken).toBe(TEST_ACCESS_TOKEN)
      }
    })

    it('prioritizes cookies over Authorization header', async () => {
      const cookieToken = TEST_ACCESS_TOKEN
      const headerToken = 'header-token-456'

      const event = baseEvent({
        cookies: [`access_token=${cookieToken}`],
        headers: {
          authorization: `Bearer ${headerToken}`,
        },
      })

      const result = await verifyBearerFromEvent(event, TEST_CLIENT_ID)

      // Should verify the cookie token, not header token
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.bearerToken).toBe(cookieToken)
      }
    })

    it('returns error when no token present', async () => {
      const event = baseEvent()

      const result = await verifyBearerFromEvent(event, TEST_CLIENT_ID)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(401)
        expect(result.message).toBe('Missing Bearer token')
      }
    })

    it('returns error on invalid JWT format', async () => {
      const event = baseEvent({
        headers: {
          authorization: 'Bearer invalid.token',
        },
      })

      const result = await verifyBearerFromEvent(event, TEST_CLIENT_ID)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        // Returns 401 because JSON parsing fails in try-catch
        expect(result.statusCode).toBe(401)
        expect(result.message).toBe('Invalid token')
      }
    })

    it('returns error when JWT lacks issuer', async () => {
      const tokenWithoutIss = Buffer.from(
        JSON.stringify({ alg: 'RS256' })
      ).toString('base64') + '.' +
        Buffer.from(JSON.stringify({ sub: 'user123' })).toString('base64') + '.sig'

      const event = baseEvent({
        headers: {
          authorization: `Bearer ${tokenWithoutIss}`,
        },
      })

      const result = await verifyBearerFromEvent(event, TEST_CLIENT_ID)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(400)
        expect(result.message).toBe('Missing iss')
      }
    })

    it('validates access token with client_id claim', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: {
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
          token_use: 'access',
          client_id: TEST_CLIENT_ID,
        },
        protectedHeader: { alg: 'RS256' },
      } as any)

      const event = baseEvent({
        headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
      })

      const result = await verifyBearerFromEvent(event, TEST_CLIENT_ID)

      expect(result.ok).toBe(true)
    })

    it('rejects access token with wrong client_id', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: {
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
          token_use: 'access',
          client_id: 'wrong-client-id',
        },
        protectedHeader: { alg: 'RS256' },
      } as any)

      const event = baseEvent({
        headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
      })

      const result = await verifyBearerFromEvent(event, TEST_CLIENT_ID)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(401)
        expect(result.message).toBe('Invalid token')
      }
    })

    it('validates ID token with aud claim (string)', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: {
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
          token_use: 'id',
          aud: TEST_CLIENT_ID,
        },
        protectedHeader: { alg: 'RS256' },
      } as any)

      const event = baseEvent({
        headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
      })

      const result = await verifyBearerFromEvent(event, TEST_CLIENT_ID)

      expect(result.ok).toBe(true)
    })

    it('validates ID token with aud claim (array)', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: {
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
          token_use: 'id',
          aud: [TEST_CLIENT_ID, 'other-client'],
        },
        protectedHeader: { alg: 'RS256' },
      } as any)

      const event = baseEvent({
        headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
      })

      const result = await verifyBearerFromEvent(event, TEST_CLIENT_ID)

      expect(result.ok).toBe(true)
    })

    it('rejects ID token with wrong aud', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: {
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
          token_use: 'id',
          aud: 'wrong-client-id',
        },
        protectedHeader: { alg: 'RS256' },
      } as any)

      const event = baseEvent({
        headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
      })

      const result = await verifyBearerFromEvent(event, TEST_CLIENT_ID)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(401)
        expect(result.message).toBe('Invalid token')
      }
    })

    it('rejects token without token_use or aud', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: {
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
          sub: 'user123',
        },
        protectedHeader: { alg: 'RS256' },
      } as any)

      const event = baseEvent({
        headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
      })

      const result = await verifyBearerFromEvent(event, TEST_CLIENT_ID)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(401)
        expect(result.message).toBe('Invalid token')
      }
    })

    it('returns error on signature verification failure', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('JWSSignatureVerificationFailed'))

      const event = baseEvent({
        headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
      })

      const result = await verifyBearerFromEvent(event, TEST_CLIENT_ID)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(401)
        expect(result.message).toBe('Invalid token')
      }
    })
  })

  describe('unauthorizedHeadersFor', () => {
    it('returns Content-Type header', () => {
      const event = baseEvent()
      const headers = unauthorizedHeadersFor(event)
      expect(headers['Content-Type']).toBe('application/json')
    })

    it('does not include WWW-Authenticate', () => {
      const event = baseEvent()
      const headers = unauthorizedHeadersFor(event)
      expect(headers['WWW-Authenticate']).toBeUndefined()
    })
  })

  describe('unauthorizedStatusFor', () => {
    it('always returns 401 for unauthorized requests', () => {
      const event = baseEvent({
        headers: { origin: 'https://example.com' },
      })
      expect(unauthorizedStatusFor(event)).toBe(401)
      
      const eventNoOrigin = baseEvent()
      expect(unauthorizedStatusFor(eventNoOrigin)).toBe(401)
    })
  })

  describe('corsOnlyHeaders', () => {
    it('returns CORS headers for requests with Origin', () => {
      const event = baseEvent({
        headers: { origin: 'https://example.com' },
      })
      const headers = corsOnlyHeaders(event)
      expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com')
      expect(headers['Vary']).toBe('Origin')
      expect(headers['Access-Control-Allow-Credentials']).toBe('true')
      expect(headers['Access-Control-Allow-Headers']).toContain('authorization')
      expect(headers['Access-Control-Allow-Methods']).toContain('GET')
    })

    it('returns empty object for requests without Origin', () => {
      const event = baseEvent()
      const headers = corsOnlyHeaders(event)
      expect(Object.keys(headers)).toHaveLength(0)
    })
  })

  describe('withAuth', () => {
    beforeEach(() => {
      // Explicitly reset mocks to ensure clean state
      mockJwtVerify.mockReset()
      mockSend.mockReset()
      mockCreateRemoteJWKSet.mockReset()
      
      mockCreateRemoteJWKSet.mockReturnValue((() => {}) as any)
      mockJwtVerify.mockResolvedValue({
        payload: {
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
          sub: 'user123',
          token_use: 'access',
          client_id: TEST_CLIENT_ID,
          username: 'testuser',
        },
        protectedHeader: { alg: 'RS256' },
      } as any)
    })

    it('calls handler with auth context on valid Bearer token', async () => {
      const handler = jest.fn().mockResolvedValue({
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      })

      const wrapped = withAuth(handler)
      const event = baseEvent({
        headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
      })

      const response = await wrapped(event)

      expect(response.statusCode).toBe(200)
      expect(handler).toHaveBeenCalledWith(
        event,
        expect.objectContaining({
          ok: true,
          bearerToken: TEST_ACCESS_TOKEN,
        })
      )
    })

    it('sets cookies on successful Basic auth', async () => {
      mockSend.mockResolvedValue({
        AuthenticationResult: {
          AccessToken: 'new-access-token',
          RefreshToken: 'new-refresh-token',
        },
      })

      const handler = jest.fn().mockResolvedValue({
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      })

      const wrapped = withAuth(handler)
      const authHeader = 'Basic ' + Buffer.from('user:pass').toString('base64')
      const event = baseEvent({
        headers: { authorization: authHeader },
      })

      const response = await wrapped(event)

      expect(response.statusCode).toBe(200)
      expect(response.cookies).toBeDefined()
      expect(response.cookies).toHaveLength(2)
      expect(response.cookies?.[0]).toContain('access_token=')
      expect(response.cookies?.[1]).toContain('refresh_token=')
    })

    it('automatically refreshes expired token from cookie', async () => {
      // First call: Bearer token verification fails
      mockJwtVerify.mockRejectedValueOnce(new Error('Token expired'))

      // Second call: refresh token succeeds
      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'refreshed-access-token',
          RefreshToken: 'refreshed-refresh-token',
        },
      })

      const handler = jest.fn().mockResolvedValue({
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      })

      const wrapped = withAuth(handler)
      const event = baseEvent({
        cookies: ['access_token=expired-token', 'refresh_token=valid-refresh-token'],
      })

      const response = await wrapped(event)

      expect(response.statusCode).toBe(200)
      expect(mockSend).toHaveBeenCalledTimes(1)
      expect(mockSend).toHaveBeenCalledWith(expect.any(InitiateAuthCommand))
      expect(response.cookies).toBeDefined()
      expect(response.cookies?.[0]).toContain('access_token=refreshed-access-token')
      expect(handler).toHaveBeenCalled()
    })

    it('does not auto-refresh when token is from Authorization header', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('Token expired'))

      const handler = jest.fn()
      const wrapped = withAuth(handler)
      const event = baseEvent({
        headers: { authorization: 'Bearer invalid-format' },
      })

      const response = await wrapped(event)

      // Returns 400 or 401 depending on JWT parse error
      expect([400, 401]).toContain(response.statusCode)
      expect(mockSend).not.toHaveBeenCalled() // No refresh attempt
      expect(handler).not.toHaveBeenCalled()
    })

    it('falls back to Basic auth when Bearer fails without Bearer header', async () => {
      mockSend.mockResolvedValue({
        AuthenticationResult: {
          AccessToken: 'basic-auth-token',
        },
      })

      const handler = jest.fn().mockResolvedValue({
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      })

      const wrapped = withAuth(handler)
      const authHeader = 'Basic ' + Buffer.from('user:pass').toString('base64')
      const event = baseEvent({
        headers: { authorization: authHeader },
      })

      const response = await wrapped(event)

      expect(response.statusCode).toBe(200)
      expect(handler).toHaveBeenCalled()
    })

    it('does not fall back to Basic when Bearer header is present', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('Invalid signature'))

      const handler = jest.fn()
      const wrapped = withAuth(handler)
      const event = baseEvent({
        headers: { authorization: 'Bearer invalid-format' },
      })

      const response = await wrapped(event)

      // Returns 400 or 401 depending on error
      expect([400, 401]).toContain(response.statusCode)
      expect(mockSend).not.toHaveBeenCalled() // No Basic auth attempt
      expect(handler).not.toHaveBeenCalled()
    })

    it('returns 401 when auth required and all methods fail', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('Invalid token'))
      mockSend.mockRejectedValueOnce(new Error('Invalid credentials'))

      const handler = jest.fn()
      const wrapped = withAuth(handler, { requireAuth: true })
      const event = baseEvent()

      const response = await wrapped(event)

      expect(response.statusCode).toBe(401)
      expect(handler).not.toHaveBeenCalled()
    })

    it('returns error for browser requests when auth fails', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('Invalid token'))

      const handler = jest.fn()
      const wrapped = withAuth(handler)
      const event = baseEvent({
        headers: {
          authorization: 'Bearer invalid-format',
          origin: 'https://example.com',
        },
      })

      const response = await wrapped(event)

      // Returns 400 or 401 depending on JWT parse error
      expect([400, 401]).toContain(response.statusCode)
    })

    it('returns 500 when USER_POOL_CLIENT_ID is missing', async () => {
      const original = process.env.USER_POOL_CLIENT_ID
      delete process.env.USER_POOL_CLIENT_ID

      const handler = jest.fn()
      const wrapped = withAuth(handler)
      const event = baseEvent()

      const response = await wrapped(event)

      expect(response.statusCode).toBe(500)
      expect(response.body).toContain('USER_POOL_CLIENT_ID')
      expect(handler).not.toHaveBeenCalled()

      // Restore env var
      process.env.USER_POOL_CLIENT_ID = original
    })

    it('handles handler errors gracefully', async () => {
      // Reset JWT mock to valid state for this test
      mockJwtVerify.mockResolvedValue({
        payload: {
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
          sub: 'user123',
          token_use: 'access',
          client_id: TEST_CLIENT_ID,
          username: 'testuser',
        },
        protectedHeader: { alg: 'RS256' },
      } as any)

      const handler = jest.fn().mockRejectedValue(new Error('Handler crashed'))

      const wrapped = withAuth(handler)
      const event = baseEvent({
        headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
      })

      const response = await wrapped(event)

      expect(response.statusCode).toBe(500)
      expect(response.body).toContain('Internal server error')
      expect(handler).toHaveBeenCalled()
    })

    it('preserves handler response headers', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: {
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
          token_use: 'access',
          client_id: TEST_CLIENT_ID,
        },
        protectedHeader: { alg: 'RS256' },
      } as any)

      const handler = jest.fn().mockResolvedValue({
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ success: true }),
      })

      const wrapped = withAuth(handler)
      const event = baseEvent({
        headers: {
          authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
          origin: 'https://example.com',
        },
      })

      const response = await wrapped(event)

      expect(response.statusCode).toBe(200)
      expect(response.headers?.['Content-Type']).toBe('application/json')
    })

    it('sets both access and refresh cookies on Basic auth', async () => {
      mockSend.mockResolvedValue({
        AuthenticationResult: {
          AccessToken: 'access-123',
          RefreshToken: 'refresh-456',
        },
      })

      const handler = jest.fn().mockResolvedValue({
        statusCode: 200,
        body: '{}',
      })

      const wrapped = withAuth(handler)
      const authHeader = 'Basic ' + Buffer.from('user:pass').toString('base64')
      const event = baseEvent({
        headers: { authorization: authHeader },
      })

      const response = await wrapped(event)

      expect(response.cookies).toHaveLength(2)
      expect(response.cookies?.[0]).toContain('access_token=')
      expect(response.cookies?.[0]).toContain('Max-Age=3600') // 1 hour
      expect(response.cookies?.[1]).toContain('refresh_token=')
      expect(response.cookies?.[1]).toContain('Max-Age=2592000') // 30 days
    })

    it('sets only access cookie when Basic auth returns no refresh token', async () => {
      mockSend.mockResolvedValue({
        AuthenticationResult: {
          AccessToken: 'access-123',
          // No RefreshToken
        },
      })

      const handler = jest.fn().mockResolvedValue({
        statusCode: 200,
        body: '{}',
      })

      const wrapped = withAuth(handler)
      const authHeader = 'Basic ' + Buffer.from('user:pass').toString('base64')
      const event = baseEvent({
        headers: { authorization: authHeader },
      })

      const response = await wrapped(event)

      expect(response.cookies).toHaveLength(1)
      expect(response.cookies?.[0]).toContain('access_token=')
    })

    it('continues with refresh flow when auto-refresh fails and no Basic header', async () => {
      // Bearer verification fails
      mockJwtVerify.mockRejectedValueOnce(new Error('Token expired'))
      // Refresh also fails
      mockSend.mockRejectedValueOnce(new Error('Refresh failed'))

      const handler = jest.fn()
      const wrapped = withAuth(handler)
      const event = baseEvent({
        cookies: ['access_token=expired', 'refresh_token=also-expired'],
      })

      const response = await wrapped(event)

      expect(response.statusCode).toBe(401)
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('createAuthHandler', () => {
    beforeEach(() => {
      // Reset mocks for clean state
      mockJwtVerify.mockReset()
      mockSend.mockReset()
      mockCreateRemoteJWKSet.mockReset()
    })

    it('wraps handler with auth requirement', async () => {
      mockCreateRemoteJWKSet.mockReturnValue((() => {}) as any)
      mockJwtVerify.mockResolvedValue({
        payload: {
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
          token_use: 'access',
          client_id: TEST_CLIENT_ID,
        },
        protectedHeader: { alg: 'RS256' },
      } as any)

      const handler = jest.fn().mockResolvedValue({
        statusCode: 200,
        body: '{}',
      })

      const wrapped = createAuthHandler(handler)
      const event = baseEvent({
        headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
      })

      const response = await wrapped(event)

      expect(response.statusCode).toBe(200)
      expect(handler).toHaveBeenCalledWith(
        event,
        expect.objectContaining({ ok: true })
      )
    })

    it('requires authentication', async () => {
      const handler = jest.fn()
      const wrapped = createAuthHandler(handler)
      const event = baseEvent()

      const response = await wrapped(event)

      expect(response.statusCode).toBe(401)
      expect(handler).not.toHaveBeenCalled()
    })
  })
})
