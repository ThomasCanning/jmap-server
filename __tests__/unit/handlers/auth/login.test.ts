import { StatusCodes } from "http-status-codes"
import { handler as loginHandler } from "../../../../src/handlers/auth/login"
import { handler as logoutHandler } from "../../../../src/handlers/auth/logout"
import { handler as tokenHandler } from "../../../../src/handlers/auth/token"
import { createBaseEvent, TEST_CLIENT_ID, cleanupMocks } from "../../lib/auth/__setup__"
import { AuthResult } from "../../../../src/lib/auth/types"
import { createProblemDetails, errorTypes } from "../../../../src/lib/errors"

// Mock auth functions
const mockAuthenticateRequest = jest.fn()
const mockSetAuthCookies = jest.fn()
const mockGetTokenFromCookies = jest.fn()
const mockRevokeToken = jest.fn()
const mockJsonResponseHeaders = jest.fn()
const mockClearAccessTokenCookie = jest.fn()
const mockClearRefreshTokenCookie = jest.fn()

jest.mock("../../../../src/lib/auth", () => {
  const actual = jest.requireActual("../../../../src/lib/auth")
  return {
    ...actual,
    authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
    setAuthCookies: (...args: unknown[]) => mockSetAuthCookies(...args),
    getTokenFromCookies: (...args: unknown[]) => mockGetTokenFromCookies(...args),
    revokeToken: (...args: unknown[]) => mockRevokeToken(...args),
    jsonResponseHeaders: (...args: unknown[]) => mockJsonResponseHeaders(...args),
    clearAccessTokenCookie: (...args: unknown[]) => mockClearAccessTokenCookie(...args),
    clearRefreshTokenCookie: (...args: unknown[]) => mockClearRefreshTokenCookie(...args),
  }
})

describe("auth handlers", () => {
  beforeEach(() => {
    cleanupMocks()
    mockJsonResponseHeaders.mockReturnValue({ "Content-Type": "application/json" })
    mockSetAuthCookies.mockReturnValue(["access_token=...", "refresh_token=..."])
    mockClearAccessTokenCookie.mockReturnValue("access_token=deleted; ...")
    mockClearRefreshTokenCookie.mockReturnValue("refresh_token=deleted; ...")
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe("login handler", () => {
    const mockAuthResult: AuthResult = {
      username: "testuser",
      bearerToken: "test-access-token",
      refreshToken: "test-refresh-token",
    }

    it("should succeed with username/password in body", async () => {
      mockAuthenticateRequest.mockResolvedValue(mockAuthResult)

      const event = createBaseEvent({
        body: JSON.stringify({ username: "testuser", password: "password123" }),
        headers: { "content-type": "application/json" },
      })

      const response = await loginHandler(event)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(mockAuthenticateRequest).toHaveBeenCalledWith(event)
      expect(mockSetAuthCookies).toHaveBeenCalledWith("test-access-token", "test-refresh-token")
      expect(response.cookies).toEqual(["access_token=...", "refresh_token=..."])
      const body = JSON.parse(response.body!)
      expect(body).toEqual({ success: true })
    })

    it("should succeed with Basic Auth header (no body)", async () => {
      mockAuthenticateRequest.mockResolvedValue(mockAuthResult)

      const event = createBaseEvent({
        headers: { authorization: "Basic dGVzdHVzZXI6cGFzc3dvcmQxMjM=" },
      })

      const response = await loginHandler(event)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(mockAuthenticateRequest).toHaveBeenCalledWith(event)
      expect(mockSetAuthCookies).toHaveBeenCalledWith("test-access-token", "test-refresh-token")
    })

    it("should succeed with refresh token in body", async () => {
      mockAuthenticateRequest.mockResolvedValue(mockAuthResult)

      const event = createBaseEvent({
        body: JSON.stringify({ refreshToken: "refresh-token-123" }),
        headers: { "content-type": "application/json" },
      })

      const response = await loginHandler(event)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(mockAuthenticateRequest).toHaveBeenCalledWith(event)
    })

    it("should return 401 for invalid credentials", async () => {
      const error = createProblemDetails({
        type: errorTypes.unauthorized,
        status: StatusCodes.UNAUTHORIZED,
        detail: "Invalid username or password",
        title: "Unauthorized",
      })
      mockAuthenticateRequest.mockRejectedValue(error)

      const event = createBaseEvent({
        body: JSON.stringify({ username: "wronguser", password: "wrongpass" }),
        headers: { "content-type": "application/json" },
      })

      const response = await loginHandler(event)

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      expect(mockSetAuthCookies).not.toHaveBeenCalled()
      const body = JSON.parse(response.body!)
      expect(body.detail).toBe("Invalid username or password")
    })

    it("should return 400 for missing auth method", async () => {
      const error = createProblemDetails({
        type: errorTypes.badRequest,
        status: StatusCodes.BAD_REQUEST,
        detail: "No authentication method provided",
        title: "Bad Request",
      })
      mockAuthenticateRequest.mockRejectedValue(error)

      const event = createBaseEvent({})

      const response = await loginHandler(event)

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.body!)
      expect(body.detail).toBe("No authentication method provided")
    })

    it("should return 500 for unexpected errors", async () => {
      mockAuthenticateRequest.mockRejectedValue(new Error("Unexpected error"))

      const event = createBaseEvent({
        body: JSON.stringify({ username: "testuser", password: "password123" }),
        headers: { "content-type": "application/json" },
      })

      const response = await loginHandler(event)

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      const body = JSON.parse(response.body!)
      expect(body.detail).toBe("Failed to login due to internal server error")
    })

    it("should set cookies on successful login", async () => {
      mockAuthenticateRequest.mockResolvedValue(mockAuthResult)

      const event = createBaseEvent({
        body: JSON.stringify({ username: "testuser", password: "password123" }),
        headers: { "content-type": "application/json" },
      })

      const response = await loginHandler(event)

      expect(response.cookies).toBeDefined()
      expect(response.cookies?.length).toBe(2)
      expect(mockSetAuthCookies).toHaveBeenCalledWith("test-access-token", "test-refresh-token")
    })
  })

  describe("logout handler", () => {
    it("should succeed and clear cookies", async () => {
      mockGetTokenFromCookies.mockReturnValue("refresh-token-123")
      mockRevokeToken.mockResolvedValue(undefined)

      const event = createBaseEvent({
        cookies: ["refresh_token=refresh-token-123"],
      })

      const response = await logoutHandler(event)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(mockGetTokenFromCookies).toHaveBeenCalledWith(event, "refresh_token")
      expect(mockRevokeToken).toHaveBeenCalledWith("refresh-token-123", TEST_CLIENT_ID)
      expect(response.cookies).toEqual(["access_token=deleted; ...", "refresh_token=deleted; ..."])
      const body = JSON.parse(response.body!)
      expect(body).toEqual({ success: true })
    })

    it("should succeed even without refresh token", async () => {
      mockGetTokenFromCookies.mockReturnValue("")

      const event = createBaseEvent({})

      const response = await logoutHandler(event)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(mockRevokeToken).not.toHaveBeenCalled()
      expect(response.cookies).toEqual(["access_token=deleted; ...", "refresh_token=deleted; ..."])
    })

    it("should succeed even if revokeToken fails", async () => {
      mockGetTokenFromCookies.mockReturnValue("refresh-token-123")
      mockRevokeToken.mockRejectedValue(new Error("Revoke failed"))

      const event = createBaseEvent({
        cookies: ["refresh_token=refresh-token-123"],
      })

      const response = await logoutHandler(event)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(response.cookies).toBeDefined()
    })

    it("should return 500 for unexpected errors", async () => {
      mockGetTokenFromCookies.mockImplementation(() => {
        throw new Error("Unexpected error")
      })

      const event = createBaseEvent({})

      const response = await logoutHandler(event)

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      const body = JSON.parse(response.body!)
      expect(body.detail).toBe("Failed to logout due to internal server error")
    })

    it("should clear cookies even when clientId is missing", async () => {
      delete process.env.USER_POOL_CLIENT_ID
      mockGetTokenFromCookies.mockReturnValue("refresh-token-123")

      const event = createBaseEvent({
        cookies: ["refresh_token=refresh-token-123"],
      })

      const response = await logoutHandler(event)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(mockRevokeToken).not.toHaveBeenCalled()
      expect(response.cookies).toBeDefined()
    })
  })

  describe("token handler", () => {
    const mockAuthResult: AuthResult = {
      username: "testuser",
      bearerToken: "test-access-token",
      refreshToken: "test-refresh-token",
    }

    it("should return tokens with username/password in body", async () => {
      mockAuthenticateRequest.mockResolvedValue(mockAuthResult)

      const event = createBaseEvent({
        body: JSON.stringify({ username: "testuser", password: "password123" }),
        headers: { "content-type": "application/json" },
      })

      const response = await tokenHandler(event)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(mockAuthenticateRequest).toHaveBeenCalledWith(event)
      const body = JSON.parse(response.body!)
      expect(body).toEqual({
        accessToken: "test-access-token",
        refreshToken: "test-refresh-token",
      })
    })

    it("should return tokens with refresh token in body", async () => {
      mockAuthenticateRequest.mockResolvedValue(mockAuthResult)

      const event = createBaseEvent({
        body: JSON.stringify({ refreshToken: "refresh-token-123" }),
        headers: { "content-type": "application/json" },
      })

      const response = await tokenHandler(event)

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.body!)
      expect(body).toEqual({
        accessToken: "test-access-token",
        refreshToken: "test-refresh-token",
      })
    })

    it("should return 400 for missing body", async () => {
      const event = createBaseEvent({})

      const response = await tokenHandler(event)

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      expect(mockAuthenticateRequest).not.toHaveBeenCalled()
      const body = JSON.parse(response.body!)
      expect(body.detail).toBe("Missing request body")
    })

    it("should return 401 for invalid credentials", async () => {
      const error = createProblemDetails({
        type: errorTypes.unauthorized,
        status: StatusCodes.UNAUTHORIZED,
        detail: "Invalid username or password",
        title: "Unauthorized",
      })
      mockAuthenticateRequest.mockRejectedValue(error)

      const event = createBaseEvent({
        body: JSON.stringify({ username: "wronguser", password: "wrongpass" }),
        headers: { "content-type": "application/json" },
      })

      const response = await tokenHandler(event)

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      const body = JSON.parse(response.body!)
      expect(body.detail).toBe("Invalid username or password")
    })

    it("should return 400 for invalid JSON", async () => {
      const error = createProblemDetails({
        type: errorTypes.badRequest,
        status: StatusCodes.BAD_REQUEST,
        detail: "Invalid JSON in request body",
        title: "Bad Request",
      })
      mockAuthenticateRequest.mockRejectedValue(error)

      const event = createBaseEvent({
        body: "invalid json{",
        headers: { "content-type": "application/json" },
      })

      const response = await tokenHandler(event)

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.body!)
      expect(body.detail).toBe("Invalid JSON in request body")
    })

    it("should return 500 for unexpected errors", async () => {
      mockAuthenticateRequest.mockRejectedValue(new Error("Unexpected error"))

      const event = createBaseEvent({
        body: JSON.stringify({ username: "testuser", password: "password123" }),
        headers: { "content-type": "application/json" },
      })

      const response = await tokenHandler(event)

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      const body = JSON.parse(response.body!)
      expect(body.detail).toBe("Failed to get token due to internal server error")
    })

    it("should not set cookies (returns JSON only)", async () => {
      mockAuthenticateRequest.mockResolvedValue(mockAuthResult)

      const event = createBaseEvent({
        body: JSON.stringify({ username: "testuser", password: "password123" }),
        headers: { "content-type": "application/json" },
      })

      const response = await tokenHandler(event)

      expect(response.cookies).toBeUndefined()
    })
  })
})
