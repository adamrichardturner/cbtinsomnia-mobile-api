import { v4 as uuid } from 'uuid'
import type { Knex } from 'knex'
import type { Env } from '../../config/env.js'
import { badRequest, conflict, unauthorized } from '../../shared/errors.js'
import { hashPassword, verifyPassword } from '../../infrastructure/auth/password.js'
import { createRefreshToken, hashToken, signAccessToken } from '../../infrastructure/auth/tokens.js'
import type { DiaryMode, ThemePreference } from '../../domain/sleep/types.js'

export interface PublicUser {
  id: string
  email: string
  displayName: string
  timeZone: string
  theme: ThemePreference
  diaryMode: DiaryMode
  healthSyncEnabled: boolean
}

interface UserRow {
  id: string
  email: string
  password_hash: string
  display_name: string
  time_zone: string
  theme: ThemePreference
  diary_mode: DiaryMode
  health_sync_enabled: boolean
}

export class AuthService {
  constructor(
    private readonly db: Knex,
    private readonly env: Env,
  ) {}

  async register(input: {
    email: string
    password: string
    displayName: string
    timeZone: string
  }): Promise<{ user: PublicUser; accessToken: string; refreshToken: string }> {
    if (input.password.length < 12) {
      throw badRequest('Password must be at least 12 characters')
    }

    const existing = await this.db<UserRow>('users').where({ email: input.email }).first()
    if (existing !== undefined) {
      throw conflict('An account with that email already exists')
    }

    const id = uuid()
    const passwordHash = await hashPassword(input.password)
    await this.db('users').insert({
      id,
      email: input.email,
      password_hash: passwordHash,
      display_name: input.displayName,
      time_zone: input.timeZone,
    })

    const user = await this.requireUser(id)
    return this.issue(user)
  }

  async login(
    email: string,
    password: string,
  ): Promise<{
    user: PublicUser
    accessToken: string
    refreshToken: string
  }> {
    const row = await this.db<UserRow>('users').where({ email }).first()
    if (row === undefined) {
      throw unauthorized('Email or password is incorrect')
    }
    const ok = await verifyPassword(row.password_hash, password)
    if (!ok) {
      throw unauthorized('Email or password is incorrect')
    }
    return this.issue(this.toPublic(row))
  }

  async refresh(refreshToken: string): Promise<{
    user: PublicUser
    accessToken: string
    refreshToken: string
  }> {
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

  private async issue(user: PublicUser): Promise<{
    user: PublicUser
    accessToken: string
    refreshToken: string
  }> {
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

  private toPublic(row: UserRow): PublicUser {
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      timeZone: row.time_zone,
      theme: row.theme,
      diaryMode: row.diary_mode,
      healthSyncEnabled: row.health_sync_enabled,
    }
  }
}
