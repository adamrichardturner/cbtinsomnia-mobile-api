import type { NextFunction, Request, Response } from 'express'
import type { Env } from '../../../config/env.js'
import { unauthorized } from '../../../shared/errors.js'
import { verifyAccessToken } from '../../../infrastructure/auth/tokens.js'

export function authenticate(env: Env) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.header('authorization')
    if (header === undefined || !header.startsWith('Bearer ')) {
      next(unauthorized())
      return
    }
    try {
      const claims = await verifyAccessToken(env, header.slice(7))
      req.userId = claims.sub
      next()
    } catch {
      next(unauthorized('Session expired'))
    }
  }
}
