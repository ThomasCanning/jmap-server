import { APIGatewayProxyEventV2 } from "aws-lambda"
import {
  getHeader,
  jsonResponseHeaders,
  corsOnlyHeaders,
  parseBasicAuth,
} from "../../../../src/lib/auth/headers"
import { createBaseEvent } from "./__setup__"
import { StatusCodes } from "http-status-codes"

describe("headers", () => {
  describe("getHeader", () => {
    it("retrieves header by exact case", () => {
      const event = createBaseEvent({ headers: { "Content-Type": "application/json" } })
      expect(getHeader(event, "Content-Type")).toBe("application/json")
    })

    it("retrieves header by lowercase", () => {
      const event = createBaseEvent({ headers: { "content-type": "application/json" } })
      expect(getHeader(event, "Content-Type")).toBe("application/json")
    })

    it("retrieves header by uppercase", () => {
      const event = createBaseEvent({ headers: { "CONTENT-TYPE": "application/json" } })
      expect(getHeader(event, "Content-Type")).toBe("application/json")
    })

    it("returns undefined for missing header", () => {
      const event = createBaseEvent({ headers: {} })
      expect(getHeader(event, "Authorization")).toBeUndefined()
    })

    it("returns undefined when headers object is missing", () => {
      const event = createBaseEvent()
      delete (event as Partial<APIGatewayProxyEventV2>).headers
      expect(getHeader(event, "Authorization")).toBeUndefined()
    })
  })

  describe("jsonResponseHeaders", () => {
    it("includes Content-Type header", () => {
      const event = createBaseEvent()
      const headers = jsonResponseHeaders(event)
      expect(headers["Content-Type"]).toBe("application/json")
    })

    it("sets Content-Type to application/problem+json when isError is true", () => {
      const event = createBaseEvent()
      const headers = jsonResponseHeaders(event, true)
      expect(headers["Content-Type"]).toBe("application/problem+json")
    })

    it("includes CORS headers when origin is provided and allowed", () => {
      process.env.ALLOWED_ORIGINS = "https://example.com"
      const event = createBaseEvent({ headers: { origin: "https://example.com" } })
      const headers = jsonResponseHeaders(event)
      expect(headers["Access-Control-Allow-Origin"]).toBe("https://example.com")
      expect(headers["Access-Control-Allow-Credentials"]).toBe("true")
      delete process.env.ALLOWED_ORIGINS
    })

    it("excludes CORS headers when origin is not allowed", () => {
      process.env.ALLOWED_ORIGINS = "https://example.com"
      const event = createBaseEvent({ headers: { origin: "https://evil.com" } })
      const headers = jsonResponseHeaders(event)
      expect(headers["Access-Control-Allow-Origin"]).toBeUndefined()
      delete process.env.ALLOWED_ORIGINS
    })

    it("excludes CORS headers when no origin is provided", () => {
      const event = createBaseEvent()
      const headers = jsonResponseHeaders(event)
      expect(headers["Access-Control-Allow-Origin"]).toBeUndefined()
    })
  })

  describe("corsOnlyHeaders", () => {
    it("does not include Content-Type header", () => {
      const event = createBaseEvent()
      const headers = corsOnlyHeaders(event)
      expect(headers["Content-Type"]).toBeUndefined()
    })

    it("includes CORS headers when origin is provided and allowed", () => {
      process.env.ALLOWED_ORIGINS = "https://example.com"
      const event = createBaseEvent({ headers: { origin: "https://example.com" } })
      const headers = corsOnlyHeaders(event)
      expect(headers["Access-Control-Allow-Origin"]).toBe("https://example.com")
      delete process.env.ALLOWED_ORIGINS
    })
  })

  describe("parseBasicAuth", () => {
    it("parses valid Basic auth header", () => {
      const authHeader = "Basic " + Buffer.from("user@example.com:password123").toString("base64")
      const result = parseBasicAuth(authHeader)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.username).toBe("user@example.com")
        expect(result.password).toBe("password123")
      }
    })

    it("returns error when Authorization header is missing", () => {
      const result = parseBasicAuth(undefined)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(StatusCodes.UNAUTHORIZED)
        expect(result.message).toBe("Missing Basic auth")
      }
    })

    it("returns error when Authorization header is not Basic", () => {
      const result = parseBasicAuth("Bearer token123")
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(StatusCodes.UNAUTHORIZED)
        expect(result.message).toBe("Missing Basic auth")
      }
    })

    it("returns error on invalid Base64 characters", () => {
      const result = parseBasicAuth("Basic !!!invalid!!!")
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(StatusCodes.UNAUTHORIZED)
        expect(result.message).toBe("Invalid Base64")
      }
    })

    it("returns error when credentials lack colon separator", () => {
      const authHeader = "Basic " + Buffer.from("usernameonly").toString("base64")
      const result = parseBasicAuth(authHeader)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(StatusCodes.UNAUTHORIZED)
        expect(result.message).toBe("Invalid Basic format")
      }
    })

    it("handles username with colon in password", () => {
      const authHeader = "Basic " + Buffer.from("user:pass:word:123").toString("base64")
      const result = parseBasicAuth(authHeader)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.username).toBe("user")
        expect(result.password).toBe("pass:word:123")
      }
    })

    it("handles empty username", () => {
      const authHeader = "Basic " + Buffer.from(":password").toString("base64")
      const result = parseBasicAuth(authHeader)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.username).toBe("")
        expect(result.password).toBe("password")
      }
    })

    it("handles empty password", () => {
      const authHeader = "Basic " + Buffer.from("username:").toString("base64")
      const result = parseBasicAuth(authHeader)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.username).toBe("username")
        expect(result.password).toBe("")
      }
    })
  })
})
