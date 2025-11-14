export function validateEnvVar(
  varName: string,
  value: string | undefined
): { ok: true; value: string } | { ok: false; statusCode: number; message: string } {
  if (!value || value.trim().length === 0) {
    return { ok: false, statusCode: 500, message: `Server misconfiguration (${varName} missing)` }
  }
  return { ok: true, value: value.trim() }
}

