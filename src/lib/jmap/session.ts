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
import { createProblemDetails, errorTypes } from "../errors"
import { StatusCodes } from "http-status-codes"
import { AuthenticatedContext } from "../auth/types"

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
export function getSession(auth?: AuthenticatedContext): Session {
  const sessionUrls = getSessionUrls()

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
    username: auth?.username || "testuser",
    apiUrl: sessionUrls.apiUrl,
    downloadUrl: sessionUrls.downloadUrl,
    uploadUrl: sessionUrls.uploadUrl,
    eventSourceUrl: sessionUrls.eventSourceUrl,
    state: "todo",
  }

  return session
}

function getSessionUrls(): SessionUrls {
  const apiUrl = process.env.API_URL
  if (!apiUrl || apiUrl.trim().length === 0) {
    throw createProblemDetails({
      type: errorTypes.internalServerError,
      status: StatusCodes.INTERNAL_SERVER_ERROR,
      detail: "API_URL environment variable is missing",
    })
  }

  const downloadUrl = process.env.DOWNLOAD_URL
  if (!downloadUrl || downloadUrl.trim().length === 0) {
    throw createProblemDetails({
      type: errorTypes.internalServerError,
      status: StatusCodes.INTERNAL_SERVER_ERROR,
      detail: "DOWNLOAD_URL environment variable is missing",
    })
  }
  const eventSourceUrl = process.env.EVENT_SOURCE_URL
  if (!eventSourceUrl || eventSourceUrl.trim().length === 0) {
    throw createProblemDetails({
      type: errorTypes.internalServerError,
      status: StatusCodes.INTERNAL_SERVER_ERROR,
      detail: "EVENT_SOURCE_URL environment variable is missing",
    })
  }
  const uploadUrl = process.env.UPLOAD_URL
  if (!uploadUrl || uploadUrl.trim().length === 0) {
    throw createProblemDetails({
      type: errorTypes.internalServerError,
      status: StatusCodes.INTERNAL_SERVER_ERROR,
      detail: "UPLOAD_URL environment variable is missing",
    })
  }

  return {
    apiUrl: apiUrl,
    downloadUrl: downloadUrl,
    uploadUrl: uploadUrl,
    eventSourceUrl: eventSourceUrl,
  }
}
