import { Invocation, JmapRequest, JmapResponse, ResultReference } from "./types"
import { evaluateJsonPointer } from "../json-pointer"
import { JsonValue } from "./types"
import { methodErrors } from "./errors"
import { coreEcho } from "./core/echo"
import { blobCopy } from "./blob/copy"

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
    let hasError = false
    for (const [key, value] of Object.entries(methodArguments)) {
      const strippedKey = key.startsWith("#") ? key.slice(1) : key

      // Check for duplicate argument names (normal and referenced form)
      if (seenKeys.has(strippedKey)) {
        const errorResponse: Invocation = [
          "error",
          {
            type: methodErrors.invalidArguments,
          },
          methodCallId,
        ]
        methodResponses.push(errorResponse)
        hasError = true
        break
      }
      seenKeys.add(strippedKey)

      // Resolve result references
      if (key.startsWith("#")) {
        const resultReference = value as ResultReference
        try {
          const resolvedValue = resolveResultReference(resultReference, methodResponses)
          methodArguments[key] = resolvedValue
        } catch {
          // If result reference invalid, add method error to responses
          const errorResponse: Invocation = [
            "error",
            {
              type: methodErrors.invalidResultReference,
            },
            methodCallId,
          ]
          methodResponses.push(errorResponse)
          hasError = true
          break
        }
      }
    }

    if (hasError) {
      continue
    }

    let methodResponse: Invocation
    switch (methodName) {
      case "Core/echo":
        methodResponse = coreEcho(methodCall)
        break
      case "Blob/copy":
        methodResponse = await blobCopy(methodCall, accounts)
        break
      default:
        methodResponse = [
          "error",
          {
            type: methodErrors.unknownMethod,
          },
          methodCallId,
        ]
    }

    methodResponses.push(methodResponse)
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

    if (methodCallId === resultReference.resultOf) {
      if (name !== resultReference.name) {
        throw null
      }
      return evaluateJsonPointer(resultReference.path, args)
    }
  }
  // No response found with matching method call id
  throw null
}
