import { Invocation, JmapRequest, JmapResponse, ResultReference } from "./types"
import { evaluateJsonPointer } from "./json-pointer"
import { JsonValue } from "./types"
import { methodErrors } from "./errors"

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
        const errorResponse: Invocation = [
          "error",
          {
            type: methodErrors.invalidArguments,
          },
          methodCallId,
        ]
        methodResponses.push(errorResponse)
        return {
          methodResponses: methodResponses,
          createdIds: request.createdIds,
          sessionState: "todo",
        }
      }
      seenKeys.add(strippedKey)

      // Resolve result references
      if (key.startsWith("#")) {
        const resultReference = value as ResultReference
        try {
          const resolvedValue = resolveResultReference(resultReference, methodResponses)
          methodArguments[key] = resolvedValue
        } catch {
          // If result reference invalid, add method error to responses and return
          const errorResponse: Invocation = [
            "error",
            {
              type: methodErrors.invalidResultReference,
            },
            methodCallId,
          ]
          methodResponses.push(errorResponse)
          return {
            methodResponses: methodResponses,
            createdIds: request.createdIds,
            sessionState: "todo",
          }
        }
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
    return evaluateJsonPointer(resultReference.path, args)
  }
  throw null
}
