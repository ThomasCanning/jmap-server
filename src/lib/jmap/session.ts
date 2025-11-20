import {
  Account,
  Accounts,
  capabilities,
  CapabilityJmapCore,
  Id,
  Session,
  SessionUrls,
  UnsignedInt,
} from "./types"

export const capabilityJmapCore: CapabilityJmapCore = {
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
export function getSession(sessionUrls: SessionUrls): Session {
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
    apiUrl: sessionUrls.apiUrl,
    downloadUrl: sessionUrls.downloadUrl,
    uploadUrl: sessionUrls.uploadUrl,
    eventSourceUrl: sessionUrls.eventSourceUrl,
    state: "todo",
  }

  return session
}
