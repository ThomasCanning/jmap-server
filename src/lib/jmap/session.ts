import {
  Account,
  Accounts,
  capabilities,
  CapabilityJmapCore,
  Id,
  Session,
  UnsignedInt,
} from "./types"

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

// TODO get real account
export function getSession(apiUrl: string): Session {
  const baseUrl = apiUrl.replace(/\/$/, "")
  const downloadUrl = `${baseUrl}/download/{accountId}/{blobId}/{name}?type={type}` as string
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

  return session
}
