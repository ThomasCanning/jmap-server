import { AuthResult } from "../../../../src/lib/auth/types"

describe("types", () => {
  describe("AuthResult", () => {
    it("can have bearerToken", () => {
      const result: AuthResult = { username: "testuser", bearerToken: "token" }
      expect(result.bearerToken).toBe("token")
      expect(result.username).toBe("testuser")
    })

    it("can have username", () => {
      const result: AuthResult = { username: "testuser", bearerToken: "token" }
      expect(result.username).toBe("testuser")
      expect(result.bearerToken).toBe("token")
    })

    it("can have refreshToken", () => {
      const result: AuthResult = {
        username: "testuser",
        bearerToken: "token",
        refreshToken: "refresh",
      }
      expect(result.refreshToken).toBe("refresh")
      expect(result.username).toBe("testuser")
    })

    it("can have claims", () => {
      const result: AuthResult = {
        username: "testuser",
        bearerToken: "token",
        claims: { sub: "user123", username: "testuser" },
      }
      expect(result.claims?.sub).toBe("user123")
      expect(result.claims?.username).toBe("testuser")
      expect(result.username).toBe("testuser")
    })

    it("username is required", () => {
      const result: AuthResult = { username: "testuser" }
      expect(result.username).toBe("testuser")
    })
  })
})
