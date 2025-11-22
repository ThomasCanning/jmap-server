import { Id, UnsignedInt, SetError } from "../types"

export type UploadResponse = {
  accountId: Id
  blobId: Id
  type: string
  size: UnsignedInt //in octets
}

export type DownloadRequest = {
  accountId: Id
  blobId: Id
  name: string
  type: string
}

export type CopyRequestArgs = {
  fromAccountId: Id
  accountId: Id
  blobIds: Id[]
}

export type CopyResponseArgs = {
  fromAccountId: Id
  accountId: Id
  copied: Record<Id, Id> | null
  notCopied: Record<Id, SetError> | null
}
