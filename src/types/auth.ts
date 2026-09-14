export interface AuthUser {
  id: number
  name: string
  email: string
  roles?: string[]
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  /** ISO-8601 instant the session ends, or null when expiry is disabled. */
  expires_at: string | null
  /**
   * Other devices signed out by this login. Signing in is exclusive: the API
   * revokes every existing token before issuing the new one.
   */
  revoked_sessions: number
  user: AuthUser
}

export interface ResetPasswordPayload {
  token: string
  email: string
  password: string
  password_confirmation: string
}

export interface ChangePasswordPayload {
  current_password: string
  password: string
  password_confirmation: string
}

export interface ChangePasswordResponse {
  message: string
  /**
   * A REPLACEMENT token. Changing the password revokes every token on the
   * account including the one that made the request, so this must be stored or
   * the very next call 401s.
   */
  token: string
  expires_at: string | null
  /** Sessions ended besides this one. */
  revoked_sessions: number
}
