import { Invocation, SetError, Accounts, Id } from "../types"
import { CopyRequestArgs, CopyResponseArgs } from "./types"
import { methodErrors, MethodError, createMethodError } from "../errors"
import { StatusCodes } from "http-status-codes"
import { setErrors } from "../types"
import { download } from "./download"
import { upload } from "./upload"

export async function blobCopy(methodCall: Invocation, accounts: Accounts): Promise<Invocation> {
  const args = methodCall[1] as CopyRequestArgs
  const methodCallId = methodCall[2]

  // Validate required arguments
  if (!args.fromAccountId || !args.accountId || !args.blobIds) {
    const errorResponse: MethodError = {
      type: methodErrors.invalidArguments,
      status: StatusCodes.BAD_REQUEST,
      detail: "Invalid arguments provided",
    }
    return createMethodError(errorResponse, methodCallId)
  }

  if (!accounts[args.fromAccountId]) {
    const errorResponse: MethodError = {
      type: methodErrors.fromAccountNotFound,
      status: StatusCodes.BAD_REQUEST,
      detail: "The fromAccountId does not correspond to a valid account",
    }
    return createMethodError(errorResponse, methodCallId)
  }

  // Validate accountId exists
  if (!accounts[args.accountId]) {
    const errorResponse: MethodError = {
      type: methodErrors.accountNotFound,
      status: StatusCodes.BAD_REQUEST,
      detail: "The accountId does not correspond to a valid account",
    }
    return createMethodError(errorResponse, methodCallId)
  }

  const copied: Record<string, string> = {}
  const notCopied: Record<string, SetError> = {}

  // Process each blob to copy
  for (const blobId of args.blobIds) {
    try {
      // Download blob from source account
      // TODO: Get blob metadata (type, size) from storage
      const blobData = await download(args.fromAccountId, blobId)

      // TODO: Get actual content type from blob metadata
      // For now, use a default content type
      const contentType = "application/octet-stream"

      // Upload blob to target account
      // The upload function generates a blobId based on content hash,
      // so the same blob will have the same ID in both accounts
      const uploadResponse = await upload(args.accountId, contentType, blobData)

      // Map original blobId to the blobId in the target account
      // RFC 8620: "A map of the blobId in the fromAccount to the id for the blob in the account it was copied to"
      copied[blobId] = uploadResponse.blobId
    } catch {
      // Handle errors during copy (e.g., blob not found, storage errors)
      // RFC 8620: "The SetError may be any of the standard set errors that may be returned for a create,
      // as defined in Section 5.3. In addition, the 'notFound' SetError error may be returned if the
      // blobId to be copied cannot be found."
      // TODO: Handle specific error types (forbidden, overQuota, tooLarge, etc.) based on error details
      notCopied[blobId] = {
        type: setErrors.notFound,
        description: "The blobId to be copied cannot be found",
      }
    }
  }

  const response: CopyResponseArgs = {
    fromAccountId: args.fromAccountId,
    accountId: args.accountId,
    copied: Object.keys(copied).length > 0 ? (copied as Record<Id, Id>) : null,
    notCopied: Object.keys(notCopied).length > 0 ? notCopied : null,
  }

  return ["Blob/copy", response, methodCallId]
}
