import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { HttpError } from '../../../shared/errors.js'

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ?? {}),
      },
    })
    return
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'validation_error',
        message: error.issues[0]?.message ?? 'Invalid request',
      },
    })
    return
  }
  console.error(error)
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } })
}
