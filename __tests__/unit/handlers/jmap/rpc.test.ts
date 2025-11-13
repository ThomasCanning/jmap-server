import { jmapHandler } from '../../../../src/handlers/jmap/rpc'
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
import * as jose from 'jose'

// Mock AWS SDK
jest.mock('@aws-sdk/client-cognito-identity-provider')
const mockSend = jest.fn()
CognitoIdentityProviderClient.prototype.send = mockSend

// Mock jose
jest.mock('jose')
const mockJwtVerify = jose.jwtVerify as jest.MockedFunction<typeof jose.jwtVerify>
const mockCreateRemoteJWKSet = jose.createRemoteJWKSet as jest.MockedFunction<typeof jose.createRemoteJWKSet>

const baseEvent = (overrides: any = {}) =>
  ({
    requestContext: {
      http: {
        method: 'POST',
      },
    },
    path: '/jmap',
    headers: {},
    body: '{"methodCalls": []}',
    ...overrides,
  } as any)

describe('jmapHandler', () => {
  const ORIGINAL_USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID
  const ORIGINAL_AWS_REGION = process.env.AWS_REGION
  const TEST_CLIENT_ID = 'test-client-id'
  const TEST_ACCESS_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2NvZ25pdG8taWRwLnVzLWVhc3QtMS5hbWF6b25hd3MuY29tL3VzLWVhc3QtMV90ZXN0Iiwic3ViIjoidXNlcjEyMyIsInRva2VuX3VzZSI6ImFjY2VzcyIsImNsaWVudF9pZCI6InRlc3QtY2xpZW50LWlkIiwidXNlcm5hbWUiOiJ0ZXN0dXNlciJ9.signature'

  beforeEach(() => {
    process.env.USER_POOL_CLIENT_ID = TEST_CLIENT_ID
    process.env.AWS_REGION = 'us-east-1'
    jest.clearAllMocks()

    // Setup default mocks
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

  afterEach(() => {
    process.env.USER_POOL_CLIENT_ID = ORIGINAL_USER_POOL_CLIENT_ID
    process.env.AWS_REGION = ORIGINAL_AWS_REGION
  })

  it('returns 200 and JSON payload on POST with valid Bearer token', async () => {
    const event = baseEvent({
      headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
    })
    const res = await jmapHandler(event)
    expect(res.statusCode).toBe(200)
    expect(res.headers?.['Content-Type']).toBe('application/json')
    const body = JSON.parse(res.body!)
    expect(body).toEqual({ methodResponses: [] })
  })

  it('returns 200 with cookie on POST with valid Basic auth', async () => {
    mockSend.mockResolvedValue({
      AuthenticationResult: {
        AccessToken: 'new-bearer-token',
        RefreshToken: 'new-refresh-token',
      },
    })

    const event = baseEvent({
      headers: { authorization: 'Basic dXNlckBleGFtcGxlLmNvbTpwYXNzd29yZA==' },
    })
    const res = await jmapHandler(event)
    expect(res.statusCode).toBe(200)
    expect(res.headers?.['Content-Type']).toBe('application/json')
    expect(res.cookies).toBeDefined()
    expect(res.cookies?.[0]).toContain('access_token=')
    const body = JSON.parse(res.body!)
    expect(body).toEqual({ methodResponses: [] })
  })

  it('returns 401 when Basic auth fails', async () => {
    mockSend.mockRejectedValue(new Error('Invalid credentials'))

    const event = baseEvent({
      headers: { authorization: 'Basic dXNlckBleGFtcGxlLmNvbTpwYXNzd29yZA==' },
    })
    const res = await jmapHandler(event)
    expect(res.statusCode).toBe(401)
    const body = JSON.parse(res.body!)
    expect(body.error).toBe('Invalid credentials')
  })

  it('returns 401 when no auth provided', async () => {
    const event = baseEvent()
    const res = await jmapHandler(event)
    expect(res.statusCode).toBe(401)
    const body = JSON.parse(res.body!)
    expect(body.error).toBe('No authentication method provided. Call /auth/login with username and password to get an access token, or use Basic auth with the Authorization header.')
  })
})

