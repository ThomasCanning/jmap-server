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
    instance: options.instance,
  }
}
