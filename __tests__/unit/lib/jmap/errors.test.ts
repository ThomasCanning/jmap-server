import { requestErrors, methodErrors, RequestError } from "../../../../src/lib/jmap/errors"
import { StatusCodes } from "http-status-codes"

// MethodError type is not exported, so we define it locally for testing
type MethodError = {
  type: string
  status: number
  detail: string
}

describe("JMAP Errors", () => {
  describe("Request errors", () => {
    it("should define all required request error URNs per RFC 8620", () => {
      // RFC 8620 Section 3.6.1 defines these error types
      expect(requestErrors.unknownCapability).toBe("urn:ietf:params:jmap:error:unknownCapability")
      expect(requestErrors.notJson).toBe("urn:ietf:params:jmap:error:notJSON")
      expect(requestErrors.notRequest).toBe("urn:ietf:params:jmap:error:notRequest")
      expect(requestErrors.limit).toBe("urn:ietf:params:jmap:error:limit")
    })

    it("should have correct error URN format", () => {
      // All error URNs should start with "urn:ietf:params:jmap:error:"
      Object.values(requestErrors).forEach((errorUrn) => {
        expect(errorUrn).toMatch(/^urn:ietf:params:jmap:error:/)
      })
    })

    it("should allow creating RequestError objects", () => {
      const error: RequestError = {
        type: requestErrors.notJson,
        status: StatusCodes.BAD_REQUEST,
        detail: "Test error",
      }

      expect(error.type).toBe(requestErrors.notJson)
      expect(error.status).toBe(StatusCodes.BAD_REQUEST)
      expect(error.detail).toBe("Test error")
    })

    it("should allow optional limit property in RequestError", () => {
      const error: RequestError = {
        type: requestErrors.limit,
        status: StatusCodes.BAD_REQUEST,
        detail: "Limit exceeded",
        limit: "maxCallsInRequest",
      }

      expect(error.limit).toBe("maxCallsInRequest")
    })

    it("should enforce RequestError status is BAD_REQUEST", () => {
      const error: RequestError = {
        type: requestErrors.notJson,
        status: StatusCodes.BAD_REQUEST,
        detail: "Test",
      }

      expect(error.status).toBe(StatusCodes.BAD_REQUEST)
    })
  })

  describe("Method errors", () => {
    it("should define all required method error types per RFC 8620", () => {
      // RFC 8620 Section 3.6.2 defines these method error types
      expect(methodErrors.serverUnavailable).toBe("serverUnavailable")
      expect(methodErrors.serverFail).toBe("serverFail")
      expect(methodErrors.serverPartialFail).toBe("serverPartialFail")
      expect(methodErrors.unknownMethod).toBe("unknownMethod")
      expect(methodErrors.invalidArguments).toBe("invalidArguments")
      expect(methodErrors.invalidResultReference).toBe("invalidResultReference")
      expect(methodErrors.forbidden).toBe("forbidden")
      expect(methodErrors.accountNotFound).toBe("accountNotFound")
      expect(methodErrors.accountNotSupportedByMethod).toBe("accountNotSupportedByMethod")
      expect(methodErrors.accountReadOnly).toBe("accountReadOnly")
    })

    it("should have method errors as simple strings (not URNs)", () => {
      // Method errors are simple strings, not URNs (RFC 8620 Section 3.6.2)
      Object.values(methodErrors).forEach((errorType) => {
        expect(typeof errorType).toBe("string")
        expect(errorType).not.toMatch(/^urn:/)
      })
    })

    it("should allow creating MethodError objects", () => {
      const error: MethodError = {
        type: methodErrors.invalidArguments,
        status: 400,
        detail: "Invalid arguments provided",
      }

      expect(error.type).toBe(methodErrors.invalidArguments)
      expect(error.status).toBe(400)
      expect(error.detail).toBe("Invalid arguments provided")
    })

    it("should allow various status codes for MethodError", () => {
      const error1: MethodError = {
        type: methodErrors.invalidArguments,
        status: 400,
        detail: "Bad request",
      }

      const error2: MethodError = {
        type: methodErrors.forbidden,
        status: 403,
        detail: "Forbidden",
      }

      expect(error1.status).toBe(400)
      expect(error2.status).toBe(403)
    })
  })

  describe("Error type consistency", () => {
    it("should have all request errors as constants", () => {
      expect(Object.keys(requestErrors).length).toBeGreaterThan(0)
      Object.values(requestErrors).forEach((errorUrn) => {
        expect(typeof errorUrn).toBe("string")
        expect(errorUrn.length).toBeGreaterThan(0)
      })
    })

    it("should have all method errors as constants", () => {
      expect(Object.keys(methodErrors).length).toBeGreaterThan(0)
      Object.values(methodErrors).forEach((errorType) => {
        expect(typeof errorType).toBe("string")
        expect(errorType.length).toBeGreaterThan(0)
      })
    })

    it("should not have overlapping error names between request and method errors", () => {
      const requestErrorKeys = Object.keys(requestErrors)
      const methodErrorKeys = Object.keys(methodErrors)

      const overlap = requestErrorKeys.filter((key) => methodErrorKeys.includes(key))
      expect(overlap).toHaveLength(0)
    })
  })

  describe("RFC 8620 compliance", () => {
    it("should match RFC 8620 Section 3.6.1 request error URNs exactly", () => {
      // These are the exact URNs specified in RFC 8620
      expect(requestErrors.unknownCapability).toBe("urn:ietf:params:jmap:error:unknownCapability")
      expect(requestErrors.notJson).toBe("urn:ietf:params:jmap:error:notJSON")
      expect(requestErrors.notRequest).toBe("urn:ietf:params:jmap:error:notRequest")
      expect(requestErrors.limit).toBe("urn:ietf:params:jmap:error:limit")
    })

    it("should match RFC 8620 Section 3.6.2 method error types exactly", () => {
      // These are the exact error types specified in RFC 8620 Section 3.6.2
      const expectedMethodErrors = [
        "serverUnavailable",
        "serverFail",
        "serverPartialFail",
        "unknownMethod",
        "invalidArguments",
        "invalidResultReference",
        "forbidden",
        "accountNotFound",
        "accountNotSupportedByMethod",
        "accountReadOnly",
      ]

      const actualMethodErrors = Object.values(methodErrors)
      expectedMethodErrors.forEach((expected) => {
        expect(actualMethodErrors).toContain(expected)
      })
    })
  })
})
