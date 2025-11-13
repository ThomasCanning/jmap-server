import { handler } from '../../../../src/handlers/auth/logout'
import * as auth from '../../../../src/lib/auth'

jest.mock('../../../../src/lib/auth', () => ({
  ...jest.requireActual('../../../../src/lib/auth'),
  clearAccessTokenCookie: jest.fn(),
  clearRefreshTokenCookie: jest.fn(),
}))

const mockClearAccessTokenCookie = auth.clearAccessTokenCookie as jest.MockedFunction<typeof auth.clearAccessTokenCookie>
const mockClearRefreshTokenCookie = auth.clearRefreshTokenCookie as jest.MockedFunction<typeof auth.clearRefreshTokenCookie>

const baseEvent = (overrides: any = {}) =>
  ({
    requestContext: {
      http: {
        method: 'POST',
      },
    },
    path: '/auth/logout',
    headers: {},
    ...overrides,
  } as any)

describe('auth-logout handler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockClearAccessTokenCookie.mockReturnValue('access_token=deleted; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0')
    mockClearRefreshTokenCookie.mockReturnValue('refresh_token=deleted; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0')
  })

  it('returns 204 and clears cookies on POST', async () => {
    const event = baseEvent()
    const res = await handler(event)
    expect(res.statusCode).toBe(204)
    expect(res.cookies).toBeDefined()
    expect(res.cookies).toHaveLength(2)
    expect(res.cookies?.[0]).toContain('access_token=deleted')
    expect(res.cookies?.[0]).toContain('Max-Age=0')
    expect(res.cookies?.[1]).toContain('refresh_token=deleted')
    expect(res.cookies?.[1]).toContain('Max-Age=0')
    expect(res.body).toBe('')
    expect(mockClearAccessTokenCookie).toHaveBeenCalled()
    expect(mockClearRefreshTokenCookie).toHaveBeenCalled()
  })

  it('includes CORS headers when origin is present', async () => {
    const event = baseEvent({
      headers: { origin: 'https://example.com' },
    })
    const res = await handler(event)
    expect(res.statusCode).toBe(204)
    expect(res.headers?.['Access-Control-Allow-Origin']).toBe('https://example.com')
  })
})

