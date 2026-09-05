import client from './client'
import type { LoginCredentials, LoginResponse, ResetPasswordPayload } from '@/types/auth'

export function login(credentials: LoginCredentials): Promise<LoginResponse> {
  return client
    .post<LoginResponse>('/admin/auth/login', credentials)
    .then((r) => r.data)
}

export function logout(): Promise<void> {
  return client.post('/admin/auth/logout').then(() => undefined)
}

/** Ends every session except this one. Login already does it implicitly. */
export function logoutOtherDevices(): Promise<{ revoked_sessions: number; message: string }> {
  return client
    .post<{ revoked_sessions: number; message: string }>('/admin/auth/logout-other-devices')
    .then((r) => r.data)
}

/**
 * Request a reset link.
 *
 * Resolves the same way for a registered address and an unknown one — the API
 * will not confirm which emails have accounts, so the UI must not imply it did.
 */
export function forgotPassword(email: string): Promise<{ message: string }> {
  return client
    .post<{ message: string }>('/admin/auth/forgot-password', { email })
    .then((r) => r.data)
}

export function resetPassword(payload: ResetPasswordPayload): Promise<{ message: string }> {
  return client
    .post<{ message: string }>('/admin/auth/reset-password', payload)
    .then((r) => r.data)
}
