import { createHash } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import type { OAuthProvider } from '../../domain/auth/oauth-linking.js'
import { unauthorized } from '../../shared/errors.js'

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const
const APPLE_ISSUER = 'https://appleid.apple.com'
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))

export interface VerifiedOAuthIdentity {
  provider: OAuthProvider
  subject: string
  email: string | null
  emailVerified: boolean
  displayName: string | null
}

export interface OAuthTokenVerifier {
  verify(
    provider: OAuthProvider,
    idToken: string,
    nonce: string | undefined,
  ): Promise<VerifiedOAuthIdentity>
}

export function createOAuthTokenVerifier(audiences: {
  google: string[]
  apple: string[]
}): OAuthTokenVerifier {
  return {
    async verify(provider, idToken, nonce) {
      if (provider === 'google') {
        return verifyGoogleIdToken(idToken, audiences.google)
      }
      return verifyAppleIdentityToken(idToken, audiences.apple, nonce)
    },
  }
}

export async function verifyGoogleIdToken(
  idToken: string,
  audiences: string[],
): Promise<VerifiedOAuthIdentity> {
  if (audiences.length === 0) {
    throw unauthorized('Google sign-in is not configured', 'oauth_not_configured')
  }

  let payload: JWTPayload
  try {
    const verified = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: [...GOOGLE_ISSUERS],
      audience: audiences,
      clockTolerance: 60,
    })
    payload = verified.payload
  } catch {
    throw unauthorized('Google sign-in could not be verified', 'oauth_invalid_token')
  }

  return mapGooglePayload(payload)
}

export async function verifyAppleIdentityToken(
  idToken: string,
  audiences: string[],
  nonce: string | undefined,
): Promise<VerifiedOAuthIdentity> {
  if (audiences.length === 0) {
    throw unauthorized('Apple sign-in is not configured', 'oauth_not_configured')
  }

  let payload: JWTPayload
  try {
    const verified = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience: audiences,
      clockTolerance: 60,
    })
    payload = verified.payload
  } catch {
    throw unauthorized('Apple sign-in could not be verified', 'oauth_invalid_token')
  }

  assertOidcNonce(payload.nonce, nonce)
  return mapApplePayload(payload)
}

export function mapGooglePayload(payload: JWTPayload): VerifiedOAuthIdentity {
  const subject = payload.sub
  if (typeof subject !== 'string' || subject.length === 0) {
    throw unauthorized('Google sign-in could not be verified', 'oauth_invalid_token')
  }

  const email = readOptionalEmail(payload.email)
  return {
    provider: 'google',
    subject,
    email,
    emailVerified: payload.email_verified === true,
    displayName: readOptionalName(payload.name),
  }
}

export function mapApplePayload(payload: JWTPayload): VerifiedOAuthIdentity {
  const subject = payload.sub
  if (typeof subject !== 'string' || subject.length === 0) {
    throw unauthorized('Apple sign-in could not be verified', 'oauth_invalid_token')
  }

  return {
    provider: 'apple',
    subject,
    email: readOptionalEmail(payload.email),
    emailVerified: isAppleEmailVerified(payload.email_verified),
    displayName: null,
  }
}

export function assertOidcNonce(tokenNonce: unknown, rawNonce: string | undefined): void {
  if (rawNonce === undefined || rawNonce.length === 0) {
    return
  }
  if (typeof tokenNonce !== 'string' || tokenNonce.length === 0) {
    throw unauthorized('Apple sign-in could not be verified', 'oauth_invalid_token')
  }
  const hashed = createHash('sha256').update(rawNonce).digest('hex')
  if (tokenNonce !== hashed && tokenNonce !== rawNonce) {
    throw unauthorized('Apple sign-in could not be verified', 'oauth_invalid_token')
  }
}

function readOptionalEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const email = value.trim()
  if (email.length === 0 || !email.includes('@')) {
    return null
  }
  return email
}

function readOptionalName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const name = value.trim()
  if (name.length === 0) {
    return null
  }
  return name
}

function isAppleEmailVerified(value: unknown): boolean {
  return value === true || value === 'true'
}
