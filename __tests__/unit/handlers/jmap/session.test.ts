import { APIGatewayProxyEventV2 } from "aws-lambda"
import { sessionHandler } from "../../../../src/handlers/jmap/session"
import { createBaseEvent } from "../../lib/auth/__setup__"
import { HandlerFunction } from "../../../../src/lib/auth/types"
import { StatusCodes } from "http-status-codes"

// Mock withAuth to bypass authentication
jest.mock("../../../../src/lib/auth", () => {
  const actual = jest.requireActual("../../../../src/lib/auth")
  return {
    ...actual,
    withAuth: (handler: HandlerFunction) => {
      // Bypass auth and call handler directly with mock auth context
      return async (event: APIGatewayProxyEventV2) => {
        const mockAuth = {
          ok: true as const,
          username: "testuser",
          bearerToken: "test-bearer-token",
          claims: { sub: "user123", username: "testuser" },
        }
        return await handler(event, mockAuth)
      }
    },
  }
})

describe("sessionHandler", () => {
  const ORIGINAL_API_URL = process.env.API_URL

  beforeEach(() => {
    process.env.API_URL = "https://jmap.example.com/"
  })

  afterEach(() => {
    process.env.API_URL = ORIGINAL_API_URL
  })

  it("returns 200 and JSON payload on GET", async () => {
    const event = createBaseEvent({
      headers: { authorization: "Bearer test-token" },
    })

    const res = await sessionHandler(event)

    expect(res.statusCode).toBe(StatusCodes.OK)
    expect(res.headers?.["Content-Type"]).toBe("application/json")
    const body = JSON.parse(res.body!)
    expect(body).toEqual({
      capabilities: {
        "urn:ietf:params:jmap:core": {
          maxSizeUpload: 50000000,
          maxConcurrentUpload: 4,
          maxSizeRequest: 10000000,
          maxConcurrentRequests: 4,
          maxCallsInRequest: 16,
          maxObjectsInGet: 500,
          maxObjectsInSet: 500,
          collationAlgorithms: ["i;ascii-numeric", "i;ascii-casemap", "i;unicode-casemap"],
        },
      },
      accounts: {
        account1: {
          name: "Test Account",
          isPersonal: true,
          isReadOnly: false,
          accountCapabilities: {},
        },
      },
      primaryAccounts: {
        account1: "account1",
      },
      username: "testuser",
      apiUrl: "https://jmap.example.com/",
      downloadUrl: "https://jmap.example.com/download/{accountId}/{blobId}?type={type}&name={name}",
      uploadUrl: "https://jmap.example.com/upload/{accountId}",
      eventSourceUrl:
        "https://jmap.example.com/events?types={types}&closeafter={closeafter}&ping={ping}",
      state: "todo",
    })
  })

  it("should include Cache-Control header per RFC 8620 Section 2", async () => {
    const event = createBaseEvent({
      headers: { authorization: "Bearer test-token" },
    })

    const res = await sessionHandler(event)

    expect(res.statusCode).toBe(StatusCodes.OK)
    expect(res.headers?.["Cache-Control"]).toBe("no-cache, no-store, must-revalidate")
  })

  it("should return valid Session object structure per RFC 8620", async () => {
    const event = createBaseEvent({
      headers: { authorization: "Bearer test-token" },
    })

    const res = await sessionHandler(event)

    const body = JSON.parse(res.body!)
    // RFC 8620 Section 2: Session object must have these properties
    expect(body).toHaveProperty("capabilities")
    expect(body).toHaveProperty("accounts")
    expect(body).toHaveProperty("primaryAccounts")
    expect(body).toHaveProperty("username")
    expect(body).toHaveProperty("apiUrl")
    expect(body).toHaveProperty("downloadUrl")
    expect(body).toHaveProperty("uploadUrl")
    expect(body).toHaveProperty("eventSourceUrl")
    expect(body).toHaveProperty("state")
  })

  it("should include core capability with all required properties", async () => {
    const event = createBaseEvent({
      headers: { authorization: "Bearer test-token" },
    })

    const res = await sessionHandler(event)

    const body = JSON.parse(res.body!)
    const coreCapability = body.capabilities["urn:ietf:params:jmap:core"]
    expect(coreCapability).toBeDefined()
    // RFC 8620 Section 2: Core capability must include these properties
    expect(coreCapability).toHaveProperty("maxSizeUpload")
    expect(coreCapability).toHaveProperty("maxConcurrentUpload")
    expect(coreCapability).toHaveProperty("maxSizeRequest")
    expect(coreCapability).toHaveProperty("maxConcurrentRequests")
    expect(coreCapability).toHaveProperty("maxCallsInRequest")
    expect(coreCapability).toHaveProperty("maxObjectsInGet")
    expect(coreCapability).toHaveProperty("maxObjectsInSet")
    expect(coreCapability).toHaveProperty("collationAlgorithms")
    expect(Array.isArray(coreCapability.collationAlgorithms)).toBe(true)
  })

  it("should include valid Account structure", async () => {
    const event = createBaseEvent({
      headers: { authorization: "Bearer test-token" },
    })

    const res = await sessionHandler(event)

    const body = JSON.parse(res.body!)
    const account = body.accounts.account1
    expect(account).toBeDefined()
    // RFC 8620 Section 2: Account must have these properties
    expect(account).toHaveProperty("name")
    expect(account).toHaveProperty("isPersonal")
    expect(account).toHaveProperty("isReadOnly")
    expect(account).toHaveProperty("accountCapabilities")
    expect(typeof account.name).toBe("string")
    expect(typeof account.isPersonal).toBe("boolean")
    expect(typeof account.isReadOnly).toBe("boolean")
    expect(typeof account.accountCapabilities).toBe("object")
  })

  it("should normalize API_URL by removing trailing slash", async () => {
    process.env.API_URL = "https://jmap.example.com/"

    const event = createBaseEvent({
      headers: { authorization: "Bearer test-token" },
    })

    const res = await sessionHandler(event)

    const body = JSON.parse(res.body!)
    expect(body.apiUrl).toBe("https://jmap.example.com/")
    expect(body.downloadUrl).toContain("https://jmap.example.com/download")
  })

  it("should handle API_URL without trailing slash", async () => {
    process.env.API_URL = "https://jmap.example.com"

    const event = createBaseEvent({
      headers: { authorization: "Bearer test-token" },
    })

    const res = await sessionHandler(event)

    const body = JSON.parse(res.body!)
    expect(body.apiUrl).toBe("https://jmap.example.com")
    expect(body.downloadUrl).toContain("https://jmap.example.com/download")
  })

  it("should format downloadUrl with template variables", async () => {
    const event = createBaseEvent({
      headers: { authorization: "Bearer test-token" },
    })

    const res = await sessionHandler(event)

    const body = JSON.parse(res.body!)
    // RFC 8620 Section 2: downloadUrl should include template variables
    expect(body.downloadUrl).toContain("{accountId}")
    expect(body.downloadUrl).toContain("{blobId}")
    expect(body.downloadUrl).toContain("{type}")
    expect(body.downloadUrl).toContain("{name}")
  })

  it("should format uploadUrl with template variables", async () => {
    const event = createBaseEvent({
      headers: { authorization: "Bearer test-token" },
    })

    const res = await sessionHandler(event)

    const body = JSON.parse(res.body!)
    // RFC 8620 Section 2: uploadUrl should include template variables
    expect(body.uploadUrl).toContain("{accountId}")
  })

  it("should format eventSourceUrl with template variables", async () => {
    const event = createBaseEvent({
      headers: { authorization: "Bearer test-token" },
    })

    const res = await sessionHandler(event)

    const body = JSON.parse(res.body!)
    // RFC 8620 Section 2: eventSourceUrl should include template variables
    expect(body.eventSourceUrl).toContain("{types}")
    expect(body.eventSourceUrl).toContain("{closeafter}")
    expect(body.eventSourceUrl).toContain("{ping}")
  })

  it("should include primaryAccounts mapping", async () => {
    const event = createBaseEvent({
      headers: { authorization: "Bearer test-token" },
    })

    const res = await sessionHandler(event)

    const body = JSON.parse(res.body!)
    // RFC 8620 Section 2: primaryAccounts maps capability to account ID
    expect(body.primaryAccounts).toBeDefined()
    expect(typeof body.primaryAccounts).toBe("object")
    expect(body.primaryAccounts.account1).toBe("account1")
  })

  it("returns 500 when API_URL is missing", async () => {
    delete process.env.API_URL

    const event = createBaseEvent({
      headers: { authorization: "Bearer test-token" },
    })

    const res = await sessionHandler(event)

    expect(res.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    const body = JSON.parse(res.body!)
    expect(body.error).toContain("API_URL")
  })

  it("should return JSON content type", async () => {
    const event = createBaseEvent({
      headers: { authorization: "Bearer test-token" },
    })

    const res = await sessionHandler(event)

    expect(res.headers?.["Content-Type"]).toBe("application/json")
  })

  it("should return valid JSON that can be parsed", async () => {
    const event = createBaseEvent({
      headers: { authorization: "Bearer test-token" },
    })

    const res = await sessionHandler(event)

    expect(() => JSON.parse(res.body!)).not.toThrow()
    const body = JSON.parse(res.body!)
    expect(body).toBeDefined()
  })
})
