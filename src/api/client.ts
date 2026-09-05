import axios from 'axios'
import { API_BASE_URL } from '@/config/urls'

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: { Accept: 'application/json' },
})

/**
 * Why the last redirect to /login happened, read once by the login screen.
 *
 * sessionStorage, not the Pinia store: a 401 sends the browser to /login with a
 * full page load, which throws the store away. It is cleared on read so the
 * message shows once and does not reappear on every later visit to /login.
 */
export const LOGOUT_REASON_KEY = 'auth_logout_reason'

export type LogoutReason = 'expired'

export function takeLogoutReason(): LogoutReason | null {
  try {
    const reason = sessionStorage.getItem(LOGOUT_REASON_KEY)
    sessionStorage.removeItem(LOGOUT_REASON_KEY)
    return reason === 'expired' ? 'expired' : null
  } catch {
    // Private mode and blocked site data both throw here. The reason is a nicety;
    // losing it must never stop the redirect.
    return null
  }
}

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      window.location.pathname !== '/login'
    ) {
      // A 401 on a request we DID send a token with means that token is no
      // longer good — expired, or revoked because this account signed in
      // somewhere else. Either way the person needs to be told why they are
      // suddenly at the login screen, rather than assuming they were logged out
      // at random.
      try {
        sessionStorage.setItem(LOGOUT_REASON_KEY, 'expired')
      } catch {
        // Non-fatal; see takeLogoutReason().
      }

      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_expires_at')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default client
