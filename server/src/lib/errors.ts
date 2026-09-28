export class ApiError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }

  static badRequest(message = 'Invalid request', code = 'bad_request', details?: unknown) {
    return new ApiError(400, message, code, details)
  }
  static unauthorized(message = 'You need to sign in to continue', code = 'unauthorized') {
    return new ApiError(401, message, code)
  }
  static forbidden(message = 'You do not have access to this resource', code = 'forbidden') {
    return new ApiError(403, message, code)
  }
  static notFound(message = 'Not found', code = 'not_found') {
    return new ApiError(404, message, code)
  }
  static conflict(message = 'Resource already exists', code = 'conflict') {
    return new ApiError(409, message, code)
  }
  static tooLarge(message = 'File is too large', code = 'payload_too_large') {
    return new ApiError(413, message, code)
  }
  static upstream(message = 'Upstream service failed', code = 'upstream_error', details?: unknown) {
    return new ApiError(502, message, code, details)
  }
  static internal(message = 'Something went wrong on our side', code = 'internal_error') {
    return new ApiError(500, message, code)
  }
}

/** Wraps an async express handler so rejected promises reach the error middleware. */
export function asyncHandler<T extends (...args: any[]) => any>(fn: T) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
