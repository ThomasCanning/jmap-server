import {
  parseCookies,
  getTokenFromCookies,
  accessTokenCookie,
  clearAccessTokenCookie,
  refreshTokenCookie,
  clearRefreshTokenCookie,
  setAuthCookies,
} from "../../../../src/lib/auth/cookies"
import { createBaseEvent } from "./__setup__"

describe("cookies", () => {
  describe("parseCookies", () => {
    it("parses simple cookie string", () => {
      const cookies = parseCookies("key=value")
      expect(cookies).toEqual({ key: "value" })
    })

    it("parses multiple cookies", () => {
      const cookies = parseCookies("key1=value1; key2=value2")
      expect(cookies).toEqual({ key1: "value1", key2: "value2" })
    })

    it("handles URL-encoded values", () => {
      const cookies = parseCookies("key=value%20with%20spaces")
      expect(cookies).toEqual({ key: "value with spaces" })
    })

    it("handles empty cookie string", () => {
      const cookies = parseCookies("")
      expect(cookies).toEqual({})
    })

    it("handles undefined cookie string", () => {
      const cookies = parseCookies(undefined)
      expect(cookies).toEqual({})
    })

    it("skips invalid URL encoding", () => {
      const cookies = parseCookies("key=value%zz")
      expect(cookies).toEqual({})
    })

    it("handles cookies with equals sign in value", () => {
      const cookies = parseCookies("key=value=with=equals")
      expect(cookies).toEqual({ key: "value=with=equals" })
    })
  })

  describe("getTokenFromCookies", () => {
    it("extracts token from cookies array", () => {
      const event = createBaseEvent({
        cookies: ["access_token=token123", "other=value"],
      })
      expect(getTokenFromCookies(event, "access_token")).toBe("token123")
    })

    it("extracts token from Cookie header", () => {
      const event = createBaseEvent({
        headers: {
          cookie: "access_token=token456; other=value",
        },
      })
      expect(getTokenFromCookies(event, "access_token")).toBe("token456")
    })

    it("prioritizes cookies array over Cookie header", () => {
      const event = createBaseEvent({
        cookies: ["access_token=array-token"],
        headers: {
          cookie: "access_token=header-token",
        },
      })
      expect(getTokenFromCookies(event, "access_token")).toBe("array-token")
    })

    it("returns empty string when token is missing", () => {
      const event = createBaseEvent({
        cookies: ["other=value"],
      })
      expect(getTokenFromCookies(event, "access_token")).toBe("")
    })

    it("returns empty string for empty token value", () => {
      const event = createBaseEvent({
        cookies: ["access_token="],
      })
      expect(getTokenFromCookies(event, "access_token")).toBe("")
    })

    it("handles URL-encoded token values", () => {
      const event = createBaseEvent({
        cookies: ["access_token=token%20with%20spaces"],
      })
      expect(getTokenFromCookies(event, "access_token")).toBe("token with spaces")
    })

    it("rejects tokens exceeding maximum length", () => {
      const longToken = "a".repeat(8193) // Exceeds MAX_TOKEN_LENGTH
      const event = createBaseEvent({
        cookies: [`access_token=${longToken}`],
      })
      expect(getTokenFromCookies(event, "access_token")).toBe("")
    })
  })

  describe("accessTokenCookie", () => {
    it("creates cookie with correct attributes", () => {
      const cookie = accessTokenCookie("test-token")
      expect(cookie).toContain("access_token=")
      expect(cookie).toContain("HttpOnly")
      expect(cookie).toContain("Secure")
      expect(cookie).toContain("SameSite=None")
      expect(cookie).toContain("Path=/")
      expect(cookie).toContain("Max-Age=3600")
    })

    it("URL-encodes token value", () => {
      const cookie = accessTokenCookie("token with spaces")
      expect(cookie).toContain("access_token=token%20with%20spaces")
    })
  })

  describe("clearAccessTokenCookie", () => {
    it("creates deletion cookie", () => {
      const cookie = clearAccessTokenCookie()
      expect(cookie).toContain("access_token=deleted")
      expect(cookie).toContain("Max-Age=0")
    })
  })

  describe("refreshTokenCookie", () => {
    it("creates cookie with correct attributes", () => {
      const cookie = refreshTokenCookie("test-refresh-token")
      expect(cookie).toContain("refresh_token=")
      expect(cookie).toContain("HttpOnly")
      expect(cookie).toContain("Secure")
      expect(cookie).toContain("SameSite=None")
      expect(cookie).toContain("Path=/")
      expect(cookie).toContain("Max-Age=2592000") // 30 days
    })
  })

  describe("clearRefreshTokenCookie", () => {
    it("creates deletion cookie", () => {
      const cookie = clearRefreshTokenCookie()
      expect(cookie).toContain("refresh_token=deleted")
      expect(cookie).toContain("Max-Age=0")
    })
  })

  describe("setAuthCookies", () => {
    it("returns array with access token cookie when only access token provided", () => {
      const cookies = setAuthCookies("access-token", undefined)
      expect(cookies).toHaveLength(1)
      expect(cookies[0]).toContain("access_token=")
    })

    it("returns array with refresh token cookie when only refresh token provided", () => {
      const cookies = setAuthCookies(undefined, "refresh-token")
      expect(cookies).toHaveLength(1)
      expect(cookies[0]).toContain("refresh_token=")
    })

    it("returns array with both cookies when both tokens provided", () => {
      const cookies = setAuthCookies("access-token", "refresh-token")
      expect(cookies).toHaveLength(2)
      expect(cookies[0]).toContain("access_token=")
      expect(cookies[1]).toContain("refresh_token=")
    })

    it("returns empty array when no tokens provided", () => {
      const cookies = setAuthCookies(undefined, undefined)
      expect(cookies).toHaveLength(0)
    })
  })
})
