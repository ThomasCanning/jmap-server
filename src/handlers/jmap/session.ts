import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda"
import { StatusCodes } from "http-status-codes"
import { withAuth, jsonResponseHeaders, createAuthErrorResponse } from "../../lib/auth"
import { validateEnvVar } from "../../lib/env"
import {
  Id,
  Account,
  Accounts,
  CapabilityJmapCore,
  UnsignedInt,
  Session,
  capabilities,
} from "../../lib/jmap/types"

export const sessionHandler = withAuth(
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const apiUrlResult = validateEnvVar("API_URL", process.env.API_URL)
    if (!apiUrlResult.ok) {
      return createAuthErrorResponse(event, apiUrlResult.statusCode, apiUrlResult.message)
    }
    const apiUrl = apiUrlResult.value

    const baseUrl = apiUrl.replace(/\/$/, "")
    const downloadUrl = `${baseUrl}/download/{accountId}/{blobId}?type={type}&name={name}` as string
    const uploadUrl = `${baseUrl}/upload/{accountId}`
    const eventSourceUrl = `${baseUrl}/events?types={types}&closeafter={closeafter}&ping={ping}`

    // Create a mock account with proper Account structure
    const accountId = "account1" as Id
    const mockAccount: Account = {
      name: "Test Account",
      isPersonal: true,
      isReadOnly: false,
      accountCapabilities: {},
    }

    const accounts: Accounts = {
      [accountId]: mockAccount,
    }

    const capabilityJmapCore: CapabilityJmapCore = {
      maxSizeUpload: 50000000 as UnsignedInt,
      maxConcurrentUpload: 4 as UnsignedInt,
      maxSizeRequest: 10000000 as UnsignedInt,
      maxConcurrentRequests: 4 as UnsignedInt,
      maxCallsInRequest: 16 as UnsignedInt,
      maxObjectsInGet: 500 as UnsignedInt,
      maxObjectsInSet: 500 as UnsignedInt,
      collationAlgorithms: ["i;ascii-numeric", "i;ascii-casemap", "i;unicode-casemap"],
    }

    const session: Session = {
      capabilities: {
        [capabilities.core]: capabilityJmapCore,
      },
      accounts: accounts,
      primaryAccounts: {
        [accountId]: accountId,
      },
      username: "testuser",
      apiUrl: apiUrl,
      downloadUrl: downloadUrl,
      uploadUrl: uploadUrl,
      eventSourceUrl: eventSourceUrl,
      state: "todo",
    }

    //TODO check this and make dynamic
    return {
      statusCode: StatusCodes.OK,
      headers: {
        ...jsonResponseHeaders(event),
        "Cache-Control": "no-cache, no-store, must-revalidate", // RFC 8620 Section 2
      },
      body: JSON.stringify(session),
    }
  }
)
