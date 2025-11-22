import { Id } from "../types"

export async function download(_accountId: Id, _blobId: Id): Promise<Buffer> {
  //TODO download blob from storage
  //return ProblemDetails error if failed

  // Mock data for now
  return Buffer.from("blob data", "utf-8")
}
