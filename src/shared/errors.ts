export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown> | undefined

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function badRequest(message: string, code = 'bad_request'): HttpError {
  return new HttpError(400, code, message)
}

export function unauthorized(
  message = 'Sign in required',
  code = 'unauthorized',
  details?: Record<string, unknown>,
): HttpError {
  return new HttpError(401, code, message, details)
}

export function forbidden(message = 'Not allowed'): HttpError {
  return new HttpError(403, 'forbidden', message)
}

export function notFound(message = 'Not found'): HttpError {
  return new HttpError(404, 'not_found', message)
}

export function conflict(
  message: string,
  code = 'conflict',
  details?: Record<string, unknown>,
): HttpError {
  return new HttpError(409, code, message, details)
}
