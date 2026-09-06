import { describe, expect, it } from 'vitest'
import { decideOAuthLinking, displayNameFromEmail } from './oauth-linking.js'

describe('decideOAuthLinking', () => {
  it('logs in when the provider subject already exists', () => {
    expect(
      decideOAuthLinking({
        subjectUserId: 'user-a',
        emailUserId: undefined,
        emailVerified: true,
        hasEmail: true,
      }),
    ).toEqual({ kind: 'login', userId: 'user-a' })
  })

  it('logs in when subject and email resolve to the same user', () => {
    expect(
      decideOAuthLinking({
        subjectUserId: 'user-a',
        emailUserId: 'user-a',
        emailVerified: true,
        hasEmail: true,
      }),
    ).toEqual({ kind: 'login', userId: 'user-a' })
  })

  it('links a preexisting password account with a verified provider email', () => {
    expect(
      decideOAuthLinking({
        subjectUserId: undefined,
        emailUserId: 'user-b',
        emailVerified: true,
        hasEmail: true,
      }),
    ).toEqual({ kind: 'link_and_login', userId: 'user-b' })
  })

  it('links a second provider onto an existing OAuth account with the same email', () => {
    expect(
      decideOAuthLinking({
        subjectUserId: undefined,
        emailUserId: 'user-oauth',
        emailVerified: true,
        hasEmail: true,
      }),
    ).toEqual({ kind: 'link_and_login', userId: 'user-oauth' })
  })

  it('refuses to link an unverified provider email onto an existing account', () => {
    expect(
      decideOAuthLinking({
        subjectUserId: undefined,
        emailUserId: 'user-b',
        emailVerified: false,
        hasEmail: true,
      }),
    ).toEqual({ kind: 'cannot_link_unverified' })
  })

  it('conflicts when the provider subject and email belong to different users', () => {
    expect(
      decideOAuthLinking({
        subjectUserId: 'user-a',
        emailUserId: 'user-b',
        emailVerified: true,
        hasEmail: true,
      }),
    ).toEqual({ kind: 'identity_conflict' })
  })

  it('creates a brand-new user when nothing matches', () => {
    expect(
      decideOAuthLinking({
        subjectUserId: undefined,
        emailUserId: undefined,
        emailVerified: true,
        hasEmail: true,
      }),
    ).toEqual({ kind: 'create' })
  })

  it('requires an email when Apple hides it and no subject exists yet', () => {
    expect(
      decideOAuthLinking({
        subjectUserId: undefined,
        emailUserId: undefined,
        emailVerified: false,
        hasEmail: false,
      }),
    ).toEqual({ kind: 'email_required' })
  })

  it('still logs in an existing Apple subject when later sign-ins omit email', () => {
    expect(
      decideOAuthLinking({
        subjectUserId: 'user-apple',
        emailUserId: undefined,
        emailVerified: false,
        hasEmail: false,
      }),
    ).toEqual({ kind: 'login', userId: 'user-apple' })
  })
})

describe('displayNameFromEmail', () => {
  it('uses the local part of the email', () => {
    expect(displayNameFromEmail('ada@example.com')).toBe('ada')
  })
})
