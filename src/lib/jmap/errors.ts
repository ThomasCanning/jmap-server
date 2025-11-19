// Request level error urns
import { StatusCodes } from "http-status-codes"

export const requestErrors = {
  unknownCapability: "urn:ietf:params:jmap:error:unknownCapability",
  notJson: "urn:ietf:params:jmap:error:notJSON",
  notRequest: "urn:ietf:params:jmap:error:notRequest",
  limit: "urn:ietf:params:jmap:error:limit",
} as const

type RequestErrorType = (typeof requestErrors)[keyof typeof requestErrors]

export type RequestError = {
  type: RequestErrorType
  status: StatusCodes.BAD_REQUEST
  detail: string
  limit?: string
}

// Method errors must not generate a http level error

export const methodErrors = {
  serverUnavailable: "serverUnavailable",
  serverFail: "serverFail",
  serverPartialFail: "serverPartialFail",
  unknownMethod: "unknownMethod",
  invalidArguments: "invalidArguments",
  invalidResultReference: "invalidResultReference",
  forbidden: "forbidden",
  accountNotFound: "accountNotFound",
  accountNotSupportedByMethod: "accountNotSupportedByMethod",
  accountReadOnly: "accountReadOnly",
  //Set response errors
  requestTooLarge: "requestTooLarge",
  stateMismatch: "stateMismatch",
  //Copy response errors
  fromAccountNotFound: "fromAccountNotFound",
  fromAccountNotSupportedByMethod: "fromAccountNotSupportedByMethod",
  //Query response errors
  anchorNotFound: "anchorNotFound",
  unsupportedSort: "unsupportedSort",
  unsupportedFilter: "unsupportedFilter",
  //QuerySet response errors
  tooManyChanges: "tooManyChanges",
  cannotCalculateChanges: "cannotCalculateChanges",
} as const

export type MethodErrorType = (typeof methodErrors)[keyof typeof methodErrors]

export type MethodError = {
  type: MethodErrorType
  status: number
  detail: string
}
