import { describe, expect, it } from 'vitest'
import { HttpError } from '../../shared/errors.js'
import { assertOidcNonce, mapApplePayload, mapGooglePayload } from './oauth-tokens.js'

describe('mapGooglePayload', () => {
  it('maps a verified Google identity', () => {
    expect(
      mapGooglePayload({
        sub: 'google-sub',
        email: 'ada@example.com',
        email_verified: true,
        name: 'Ada Lovelace',
      }),
    ).toEqual({
      provider: 'google',
      subject: 'google-sub',
      email: 'ada@example.com',
      emailVerified: true,
      displayName: 'Ada Lovelace',
    })
  })

  it('does not treat an unverified Google email as verified', () => {
    expect(mapGooglePayload({ sub: 'google-sub', email: 'ada@example.com' }).emailVerified).toBe(
      false,
    )
  })
})

describe('mapApplePayload', () => {
  it('accepts Apple email_verified as a string', () => {
    expect(
      mapApplePayload({
        sub: 'apple-sub',
        email: 'hidden@privaterelay.appleid.com',
        email_verified: 'true',
      }),
    ).toEqual({
      provider: 'apple',
      subject: 'apple-sub',
      email: 'hidden@privaterelay.appleid.com',
      emailVerified: true,
      displayName: null,
    })
  })

  it('allows a later Apple sign-in without email', () => {
    expect(mapApplePayload({ sub: 'apple-sub' })).toEqual({
      provider: 'apple',
      subject: 'apple-sub',
      email: null,
      emailVerified: false,
      displayName: null,
    })
  })
})

describe('assertOidcNonce', () => {
  it('accepts a SHA-256 hex nonce', () => {
    expect(() => {
      assertOidcNonce(
        '18720d3fd6296cd04d1ee76981969261a6ca5f34af0ca82a912cd0b38d5d2e8a',
        'apple-nonce',
      )
    }).not.toThrow()
  })

  it('rejects a mismatched nonce', () => {
    expect(() => {
      assertOidcNonce('other', 'apple-nonce')
    }).toThrow(HttpError)
  })
})
