/**
 * Error type used across the application. `code` is a stable machine-readable
 * identifier; `status` maps to the HTTP status used by the API layer.
 */
export class CoworkError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(code: string, message: string, options?: { status?: number; details?: unknown }) {
    super(message)
    this.name = "CoworkError"
    this.code = code
    this.status = options?.status ?? 400
    this.details = options?.details
  }
}

export function isCoworkError(error: unknown): error is CoworkError {
  return error instanceof CoworkError
}

export function toPublicError(error: unknown): {
  code: string
  message: string
  details?: unknown
} {
  if (isCoworkError(error)) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    }
  }

  if (error instanceof Error) {
    // Never surface arbitrary internal messages through the API; they may
    // contain filesystem paths, SQL fragments or upstream credentials.
    return { code: "internal_error", message: "Unexpected internal error" }
  }

  return { code: "internal_error", message: "Unexpected error" }
}
