import { createHash, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import type { Env } from '../../config/env.js'

export interface AccessClaims {
  sub: string
  email: string
}

export async function signAccessToken(env: Env, claims: AccessClaims): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET)
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret)
}

export async function verifyAccessToken(env: Env, token: string): Promise<AccessClaims> {
  const secret = new TextEncoder().encode(env.JWT_SECRET)
  const { payload } = await jwtVerify(token, secret)
  const sub = payload.sub
  const email = payload.email
  if (typeof sub !== 'string' || typeof email !== 'string') {
    throw new Error('Invalid access token')
  }
  return { sub, email }
}

export function createRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString('base64url')
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
