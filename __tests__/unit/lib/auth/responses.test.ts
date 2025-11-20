import { createAuthErrorResponse, handleAuthError } from "../../../../src/lib/auth/responses"
import { createBaseEvent } from "./__setup__"
import { StatusCodes } from "http-status-codes"

describe("responses", () => {
  describe("createAuthErrorResponse", () => {
    it("creates error response with status code and message", () => {
      const event = createBaseEvent()
      const response = createAuthErrorResponse(event, StatusCodes.UNAUTHORIZED, "Unauthorized")

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      expect(response.body).toBe(JSON.stringify({ error: "Unauthorized" }))
      expect(response.headers).toBeDefined()
      expect(response.headers?.["Content-Type"]).toBe("application/problem+json")
    })

    it("includes CORS headers when origin is provided", () => {
      process.env.ALLOWED_ORIGINS = "https://example.com"
      const event = createBaseEvent({
        headers: { origin: "https://example.com" },
      })
      const response = createAuthErrorResponse(event, 401, "Unauthorized")

      expect(response.headers?.["Access-Control-Allow-Origin"]).toBe("https://example.com")
      delete process.env.ALLOWED_ORIGINS
    })
  })

  describe("handleAuthError", () => {
    it("creates error response from AuthResult", () => {
      const event = createBaseEvent()
      const authResult = {
        ok: false,
        statusCode: StatusCodes.UNAUTHORIZED,
        message: "Invalid token",
      }
      const response = handleAuthError(event, authResult)

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      expect(response.body).toBe(JSON.stringify({ error: "Invalid token" }))
    })

    it("throws error when called with success result", () => {
      const event = createBaseEvent()
      const authResult = { ok: true as const, bearerToken: "token" }

      expect(() => handleAuthError(event, authResult)).toThrow(
        "handleAuthError called with success result"
      )
    })
  })
})
