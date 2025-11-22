import * as crypto from "crypto"
import { Id } from "./types"

// Generates a always unique ID
export function newId(): Id {
  return crypto.randomUUID() as Id
}

// Generates a ID that is the same for the same content
export function newBlobId(data: Buffer | string): Id {
  const hash = crypto.createHash("sha256")
  hash.update(data)
  const digest = hash.digest("hex")
  return `b-${digest}` as Id
}
