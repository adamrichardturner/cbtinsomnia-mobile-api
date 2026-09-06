export type OAuthProvider = 'google' | 'apple'

export type OAuthLinkingDecision =
  | { kind: 'login'; userId: string }
  | { kind: 'link_and_login'; userId: string }
  | { kind: 'create' }
  | { kind: 'identity_conflict' }
  | { kind: 'cannot_link_unverified' }
  | { kind: 'email_required' }

export interface OAuthLinkingInput {
  subjectUserId: string | undefined
  emailUserId: string | undefined
  emailVerified: boolean
  hasEmail: boolean
}

/**
 * Account-linking matrix for native Apple / Google identity tokens.
 *
 * A verified provider email is treated as proof of ownership, so a password
 * account and an OAuth identity with the same email become one user.
 * An unverified provider email never attaches to an existing account.
 */
export function decideOAuthLinking(input: OAuthLinkingInput): OAuthLinkingDecision {
  if (
    input.subjectUserId !== undefined &&
    input.emailUserId !== undefined &&
    input.subjectUserId !== input.emailUserId
  ) {
    return { kind: 'identity_conflict' }
  }

  if (input.subjectUserId !== undefined) {
    return { kind: 'login', userId: input.subjectUserId }
  }

  if (input.emailUserId !== undefined && !input.emailVerified) {
    return { kind: 'cannot_link_unverified' }
  }

  if (input.emailUserId !== undefined) {
    return { kind: 'link_and_login', userId: input.emailUserId }
  }

  if (!input.hasEmail) {
    return { kind: 'email_required' }
  }

  return { kind: 'create' }
}

export function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0]
  if (local === undefined || local.length === 0) {
    return 'Sleep Coach user'
  }
  return local
}
