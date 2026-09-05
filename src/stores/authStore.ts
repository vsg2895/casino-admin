import { ref, computed, onScopeDispose } from 'vue'
import { defineStore } from 'pinia'
import * as authApi from '@/api/auth'
import type { AuthUser, LoginCredentials } from '@/types/auth'

const TOKEN_KEY = 'auth_token'
const EXPIRES_KEY = 'auth_expires_at'

/**
 * Sign out this many milliseconds BEFORE the token actually dies.
 *
 * Without the margin, a save started in the last second of the session is
 * rejected mid-flight and the work in the form is lost to a redirect. Ending the
 * session a minute early makes the sign-out land between actions instead.
 */
const EXPIRY_MARGIN_MS = 60_000

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const expiresAt = ref<string | null>(localStorage.getItem(EXPIRES_KEY))
  const user = ref<AuthUser | null>(null)

  const isAuthenticated = computed(() => token.value !== null)

  let expiryTimer: ReturnType<typeof setTimeout> | null = null

  function clearExpiryTimer(): void {
    if (expiryTimer !== null) {
      clearTimeout(expiryTimer)
      expiryTimer = null
    }
  }

  /**
   * Arrange to sign out when the session ends.
   *
   * setTimeout is capped at ~24.8 days and the session is hours, so a single
   * timer is safe here. It is a convenience, not the enforcement: the API
   * rejects an expired token regardless, and a laptop asleep through the expiry
   * never fires this — the next request's 401 is what catches that case.
   */
  function scheduleExpiry(): void {
    clearExpiryTimer()

    if (expiresAt.value === null) return

    const msLeft = new Date(expiresAt.value).getTime() - Date.now() - EXPIRY_MARGIN_MS

    if (Number.isNaN(msLeft)) return

    if (msLeft <= 0) {
      expire()
      return
    }

    expiryTimer = setTimeout(expire, msLeft)
  }

  /** Local sign-out for an expired session — no API call, the token is already dead. */
  function expire(): void {
    clearSession()
    try {
      sessionStorage.setItem('auth_logout_reason', 'expired')
    } catch {
      // Non-fatal.
    }
    if (window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
  }

  function clearSession(): void {
    clearExpiryTimer()
    token.value = null
    expiresAt.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRES_KEY)
  }

  async function login(credentials: LoginCredentials): Promise<number> {
    const response = await authApi.login(credentials)

    token.value = response.token
    expiresAt.value = response.expires_at
    user.value = response.user

    localStorage.setItem(TOKEN_KEY, response.token)
    if (response.expires_at) {
      localStorage.setItem(EXPIRES_KEY, response.expires_at)
    } else {
      localStorage.removeItem(EXPIRES_KEY)
    }

    scheduleExpiry()

    // Signing in is exclusive — the API revokes every other session. Returned so
    // the caller can say so; a silent sign-out elsewhere reads as a bug.
    return response.revoked_sessions
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } finally {
      clearSession()
    }
  }

  /** Ends every session but this one. Leaves the current one signed in. */
  async function logoutOtherDevices(): Promise<number> {
    const { revoked_sessions } = await authApi.logoutOtherDevices()
    return revoked_sessions
  }

  // A session restored from localStorage on a page load still needs its timer.
  scheduleExpiry()

  onScopeDispose(clearExpiryTimer)

  return {
    token,
    user,
    expiresAt,
    isAuthenticated,
    login,
    logout,
    logoutOtherDevices,
  }
})
