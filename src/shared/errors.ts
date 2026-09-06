export class HttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

export function badRequest(message: string, code = 'bad_request'): HttpError {
  return new HttpError(400, code, message)
}

export function unauthorized(message = 'Sign in required'): HttpError {
  return new HttpError(401, 'unauthorized', message)
}

export function forbidden(message = 'Not allowed'): HttpError {
  return new HttpError(403, 'forbidden', message)
}

export function notFound(message = 'Not found'): HttpError {
  return new HttpError(404, 'not_found', message)
}

export function conflict(message: string): HttpError {
  return new HttpError(409, 'conflict', message)
}
