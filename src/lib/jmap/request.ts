import { Invocation, JmapRequest, JmapResponse, ResultReference } from "./types"
import { evaluateJsonPointer } from "./json-pointer"
import { JsonValue } from "./types"
import { methodErrors, requestErrors } from "./errors"
import { StatusCodes } from "http-status-codes"

export function processRequest(request: JmapRequest): JmapResponse {
  // Track the responses for each method call
  const methodResponses: Invocation[] = []

  // Process each method call
  for (const methodCall of request.methodCalls as Invocation[]) {
    const methodName = methodCall[0]
    const methodArguments = methodCall[1]
    const methodCallId = methodCall[2]

    // Don't allow same argument name in normal and referenced form
    const seenKeys = new Set<string>()

    // Process each argument
    for (const [key, value] of Object.entries(methodArguments)) {
      const strippedKey = key.startsWith("#") ? key.slice(1) : key

      // Check for duplicate argument names (normal and referenced form)
      if (seenKeys.has(strippedKey)) {
        throw {
          type: methodErrors.invalidArguments,
          status: StatusCodes.BAD_REQUEST,
          detail: `Arguements object contains the same argument name in normal and referenced form`,
        }
      }
      seenKeys.add(strippedKey)

      // Resolve result references
      if (key.startsWith("#")) {
        const resultReference = value as ResultReference
        const resolvedValue = resolveResultReference(resultReference, methodResponses)
        methodArguments[key] = resolvedValue
      }
    }

    // TODO Actually process the method here

    methodResponses.push([methodName, {}, methodCallId])
  }

  return {
    methodResponses: methodResponses,
    createdIds: request.createdIds,
    sessionState: "todo",
  }
}

function resolveResultReference(
  resultReference: ResultReference,
  methodResponses: Invocation[]
): JsonValue {
  for (const response of methodResponses) {
    const [name, args, methodCallId] = response

    if (methodCallId !== resultReference.resultOf) continue
    if (name !== resultReference.name) continue

    try {
      // Apply JSON Pointer algorithm to extract value
      return evaluateJsonPointer(resultReference.path, args)
    } catch {
      throw {
        type: methodErrors.invalidResultReference,
        status: StatusCodes.BAD_REQUEST,
        detail: `Invalid result reference: failed to resolve JSON Pointer for method call ID '${resultReference.resultOf}'`,
      }
    }
  }

  // If no matching methodCallId found
  throw {
    type: requestErrors.notRequest,
    status: StatusCodes.BAD_REQUEST,
    detail: `Invalid result reference: method call ID '${resultReference.resultOf}' not found in previous responses`,
  }
}
