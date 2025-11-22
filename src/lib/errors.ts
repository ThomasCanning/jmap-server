export interface ProblemDetails {
  type: string
  status: number
  detail: string
  title?: string
  instance?: string
}

export const errorTypes = {
  internalServerError: "errors/internalServerError",
  unauthorized: "errors/unauthorized",
  badRequest: "errors/badRequest",
} as const

export function createProblemDetails(options: ProblemDetails): ProblemDetails {
  const apiUrl = process.env.API_URL || ""
  return {
    type: `${apiUrl}/${options.type}`,
    status: options.status,
    detail: options.detail,
    title: options.title,
  }
}

export function isProblemDetails(error: unknown): error is ProblemDetails {
  if (typeof error !== "object" || error === null) return false
  const e = error as Record<string, unknown>
  return typeof e.type === "string" && typeof e.status === "number" && typeof e.detail === "string"
}
