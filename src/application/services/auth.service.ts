import { v4 as uuid } from 'uuid'
import type { Knex } from 'knex'
import type { Env } from '../../config/env.js'
import { decideOAuthLinking, displayNameFromEmail } from '../../domain/auth/oauth-linking.js'
import type { OAuthProvider } from '../../domain/auth/oauth-linking.js'
import type { DiaryMode, ThemePreference } from '../../domain/sleep/types.js'
import { hashPassword, verifyPassword } from '../../infrastructure/auth/password.js'
import {
  createOAuthTokenVerifier,
  type OAuthTokenVerifier,
  type VerifiedOAuthIdentity,
} from '../../infrastructure/auth/oauth-tokens.js'
import { createRefreshToken, hashToken, signAccessToken } from '../../infrastructure/auth/tokens.js'
import { badRequest, conflict, unauthorized } from '../../shared/errors.js'

export interface AuthIdentities {
  password: boolean
  google: boolean
  apple: boolean
}

export interface PublicUser {
  id: string
  email: string
  displayName: string
  timeZone: string
  theme: ThemePreference
  diaryMode: DiaryMode
  healthSyncEnabled: boolean
  identities: AuthIdentities
}

export interface AuthSession {
  user: PublicUser
  accessToken: string
  refreshToken: string
}

interface UserRow {
  id: string
  email: string
  password_hash: string | null
  display_name: string
  time_zone: string
  theme: ThemePreference
  diary_mode: DiaryMode
  health_sync_enabled: boolean
  email_verified_at: Date | string | null
}

interface AuthIdentityRow {
  id: string
  user_id: string
  provider: OAuthProvider
  provider_subject: string
  email: string | null
}

export interface OAuthSignInInput {
  provider: OAuthProvider
  idToken: string
  nonce?: string
  displayName?: string
  timeZone?: string
  password?: string
}

export class AuthService {
  private readonly oauthVerifier: OAuthTokenVerifier

  constructor(
    private readonly db: Knex,
    private readonly env: Env,
    oauthVerifier?: OAuthTokenVerifier,
  ) {
    this.oauthVerifier =
      oauthVerifier ??
      createOAuthTokenVerifier({
        google: env.GOOGLE_CLIENT_IDS,
        apple: env.APPLE_CLIENT_IDS,
      })
  }

  async register(input: {
    email: string
    password: string
    displayName: string
    timeZone: string
  }): Promise<AuthSession> {
    if (input.password.length < 12) {
      throw badRequest('Password must be at least 12 characters')
    }

    const existing = await this.db<UserRow>('users').where({ email: input.email }).first()
    if (existing !== undefined) {
      throw await this.existingEmailConflict(existing)
    }

    const id = uuid()
    const passwordHash = await hashPassword(input.password)
    try {
      await this.db('users').insert({
        id,
        email: input.email,
        password_hash: passwordHash,
        display_name: input.displayName,
        time_zone: input.timeZone,
      })
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error
      }
      const raced = await this.db<UserRow>('users').where({ email: input.email }).first()
      if (raced !== undefined) {
        throw await this.existingEmailConflict(raced)
      }
      throw conflict('An account with that email already exists', 'account_exists')
    }

    const user = await this.requireUser(id)
    return this.issue(user)
  }

  async login(email: string, password: string): Promise<AuthSession> {
    const row = await this.db<UserRow>('users').where({ email }).first()
    if (row === undefined) {
      throw unauthorized('Email or password is incorrect')
    }
    if (row.password_hash === null) {
      const identities = await this.identityFlags(row.id)
      const providers = listedOAuthProviders(identities)
      throw unauthorized(
        oauthOnlyMessage(providers),
        'oauth_only',
        providers.length === 0 ? undefined : { providers },
      )
    }
    const ok = await verifyPassword(row.password_hash, password)
    if (!ok) {
      throw unauthorized('Email or password is incorrect')
    }
    return this.issue(await this.toPublic(row))
  }

  async oauth(input: OAuthSignInInput): Promise<AuthSession> {
    if (input.provider === 'google' && this.env.GOOGLE_CLIENT_IDS.length === 0) {
      throw unauthorized('Google sign-in is not configured', 'oauth_not_configured')
    }
    if (input.provider === 'apple' && this.env.APPLE_CLIENT_IDS.length === 0) {
      throw unauthorized('Apple sign-in is not configured', 'oauth_not_configured')
    }

    const optionalPassword = normalizeOptionalPassword(input.password)
    if (optionalPassword !== undefined && optionalPassword.length < 12) {
      throw badRequest('Password must be at least 12 characters')
    }

    const identity = await this.oauthVerifier.verify(input.provider, input.idToken, input.nonce)
    const subjectRow = await this.db<AuthIdentityRow>('auth_identities')
      .where({
        provider: identity.provider,
        provider_subject: identity.subject,
      })
      .first()
    const emailRow =
      identity.email === null
        ? undefined
        : await this.db<UserRow>('users').where({ email: identity.email }).first()

    const decision = decideOAuthLinking({
      subjectUserId: subjectRow?.user_id,
      emailUserId: emailRow?.id,
      emailVerified: identity.emailVerified,
      hasEmail: identity.email !== null,
    })

    if (decision.kind === 'identity_conflict') {
      throw conflict(
        'This sign-in method is already linked to a different Sleep Coach account.',
        'identity_conflict',
      )
    }
    if (decision.kind === 'cannot_link_unverified') {
      throw unauthorized(
        'That email is already in use. Verify it with Google or Apple before continuing.',
        'oauth_email_unverified',
      )
    }
    if (decision.kind === 'email_required') {
      throw badRequest(
        'Apple did not share an email. Use the same Apple ID as before, or share your email and try again.',
        'oauth_email_missing',
      )
    }

    const userId =
      decision.kind === 'create' ? await this.createOAuthUser(identity, input) : decision.userId

    if (decision.kind === 'link_and_login' || decision.kind === 'create') {
      await this.ensureIdentity(userId, identity)
    }

    if (identity.emailVerified && identity.email !== null) {
      await this.db('users')
        .where({ id: userId })
        .whereNull('email_verified_at')
        .update({ email_verified_at: new Date(), updated_at: new Date() })
    }

    if (optionalPassword !== undefined) {
      await this.attachPasswordIfMissing(userId, optionalPassword)
    }

    const user = await this.requireUser(userId)
    return this.issue(user)
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const hash = hashToken(refreshToken)
    const row = await this.db('refresh_tokens').where({ token_hash: hash }).first()
    if (row === undefined || new Date(row.expires_at) < new Date()) {
      throw unauthorized('Session expired')
    }
    await this.db('refresh_tokens').where({ id: row.id }).delete()
    const user = await this.requireUser(row.user_id)
    return this.issue(user)
  }

  async logout(refreshToken: string): Promise<void> {
    await this.db('refresh_tokens')
      .where({ token_hash: hashToken(refreshToken) })
      .delete()
  }

  async getUser(userId: string): Promise<PublicUser> {
    return this.requireUser(userId)
  }

  async updateUser(
    userId: string,
    patch: Partial<{
      displayName: string
      timeZone: string
      theme: ThemePreference
      diaryMode: DiaryMode
      healthSyncEnabled: boolean
    }>,
  ): Promise<PublicUser> {
    const updates: Record<string, unknown> = { updated_at: new Date() }
    if (patch.displayName !== undefined) {
      updates.display_name = patch.displayName
    }
    if (patch.timeZone !== undefined) {
      updates.time_zone = patch.timeZone
    }
    if (patch.theme !== undefined) {
      updates.theme = patch.theme
    }
    if (patch.diaryMode !== undefined) {
      updates.diary_mode = patch.diaryMode
    }
    if (patch.healthSyncEnabled !== undefined) {
      updates.health_sync_enabled = patch.healthSyncEnabled
    }
    await this.db('users').where({ id: userId }).update(updates)
    return this.requireUser(userId)
  }

  private async createOAuthUser(
    identity: VerifiedOAuthIdentity,
    input: OAuthSignInInput,
  ): Promise<string> {
    if (identity.email === null) {
      throw badRequest(
        'Apple did not share an email. Share your email and try again.',
        'oauth_email_missing',
      )
    }

    const id = uuid()
    const displayName =
      normalizeOptionalName(input.displayName) ??
      identity.displayName ??
      displayNameFromEmail(identity.email)
    const timeZone = input.timeZone ?? 'Europe/London'

    try {
      await this.db.transaction(async (trx) => {
        await trx('users').insert({
          id,
          email: identity.email,
          password_hash: null,
          display_name: displayName,
          time_zone: timeZone,
          email_verified_at: identity.emailVerified ? new Date() : null,
        })
        await trx('auth_identities').insert({
          user_id: id,
          provider: identity.provider,
          provider_subject: identity.subject,
          email: identity.email,
        })
      })
      return id
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error
      }
      const raced = await this.db<UserRow>('users').where({ email: identity.email }).first()
      if (raced === undefined) {
        throw conflict('An account with that email already exists', 'account_exists')
      }
      await this.ensureIdentity(raced.id, identity)
      return raced.id
    }
  }

  private async ensureIdentity(userId: string, identity: VerifiedOAuthIdentity): Promise<void> {
    const existing = await this.db<AuthIdentityRow>('auth_identities')
      .where({
        provider: identity.provider,
        provider_subject: identity.subject,
      })
      .first()
    if (existing !== undefined && existing.user_id !== userId) {
      throw conflict(
        'This sign-in method is already linked to a different Sleep Coach account.',
        'identity_conflict',
      )
    }
    if (existing !== undefined) {
      return
    }

    try {
      await this.db('auth_identities').insert({
        user_id: userId,
        provider: identity.provider,
        provider_subject: identity.subject,
        email: identity.email,
      })
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error
      }
      const raced = await this.db<AuthIdentityRow>('auth_identities')
        .where({
          provider: identity.provider,
          provider_subject: identity.subject,
        })
        .first()
      if (raced !== undefined && raced.user_id !== userId) {
        throw conflict(
          'This sign-in method is already linked to a different Sleep Coach account.',
          'identity_conflict',
        )
      }
    }
  }

  private async attachPasswordIfMissing(userId: string, password: string): Promise<void> {
    const row = await this.db<UserRow>('users').where({ id: userId }).first()
    if (row === undefined || row.password_hash !== null) {
      return
    }
    const passwordHash = await hashPassword(password)
    await this.db('users').where({ id: userId, password_hash: null }).update({
      password_hash: passwordHash,
      updated_at: new Date(),
    })
  }

  private async existingEmailConflict(existing: UserRow): Promise<HttpErrorLike> {
    const identities = await this.identityFlags(existing.id)
    const providers = listedOAuthProviders(identities)
    if (existing.password_hash === null && providers.length > 0) {
      return conflict(
        `An account already exists for this email. Continue with ${joinProviders(providers)} to sign in. If you set a password here, it will be added after you continue.`,
        'account_exists_oauth',
        { providers },
      )
    }
    return conflict('An account with that email already exists', 'account_exists')
  }

  private async issue(user: PublicUser): Promise<AuthSession> {
    const accessToken = await signAccessToken(this.env, { sub: user.id, email: user.email })
    const refresh = createRefreshToken()
    const expires = new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_SECONDS * 1000)
    await this.db('refresh_tokens').insert({
      user_id: user.id,
      token_hash: refresh.hash,
      expires_at: expires,
    })
    return { user, accessToken, refreshToken: refresh.token }
  }

  private async requireUser(id: string): Promise<PublicUser> {
    const row = await this.db<UserRow>('users').where({ id }).first()
    if (row === undefined) {
      throw unauthorized()
    }
    return this.toPublic(row)
  }

  private async toPublic(row: UserRow): Promise<PublicUser> {
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      timeZone: row.time_zone,
      theme: row.theme,
      diaryMode: row.diary_mode,
      healthSyncEnabled: row.health_sync_enabled,
      identities: await this.identityFlags(row.id, row.password_hash !== null),
    }
  }

  private async identityFlags(userId: string, hasPassword?: boolean): Promise<AuthIdentities> {
    const rows = await this.db<AuthIdentityRow>('auth_identities').where({ user_id: userId })
    let google = false
    let apple = false
    for (const row of rows) {
      if (row.provider === 'google') {
        google = true
      }
      if (row.provider === 'apple') {
        apple = true
      }
    }
    if (hasPassword !== undefined) {
      return { password: hasPassword, google, apple }
    }
    const user = await this.db<UserRow>('users').where({ id: userId }).first()
    return { password: user !== undefined && user.password_hash !== null, google, apple }
  }
}

type HttpErrorLike = ReturnType<typeof conflict>

function listedOAuthProviders(identities: AuthIdentities): OAuthProvider[] {
  const providers: OAuthProvider[] = []
  if (identities.google) {
    providers.push('google')
  }
  if (identities.apple) {
    providers.push('apple')
  }
  return providers
}

function oauthOnlyMessage(providers: OAuthProvider[]): string {
  if (providers.length === 0) {
    return 'This account uses Sign in with Apple or Google'
  }
  return `This account uses ${joinProviders(providers)}. Continue with that instead.`
}

function joinProviders(providers: OAuthProvider[]): string {
  if (providers.length === 2) {
    return 'Apple or Google'
  }
  if (providers[0] === 'apple') {
    return 'Apple'
  }
  return 'Google'
}

function normalizeOptionalPassword(password: string | undefined): string | undefined {
  if (password === undefined) {
    return undefined
  }
  const trimmed = password.trim()
  if (trimmed.length === 0) {
    return undefined
  }
  return trimmed
}

function normalizeOptionalName(name: string | undefined): string | undefined {
  if (name === undefined) {
    return undefined
  }
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    return undefined
  }
  return trimmed
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false
  }
  return error.code === '23505'
}
