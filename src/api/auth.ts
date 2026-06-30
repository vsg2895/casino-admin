import client from './client'
import type { LoginCredentials, LoginResponse } from '@/types/auth'

export function login(credentials: LoginCredentials): Promise<LoginResponse> {
  return client
    .post<LoginResponse>('/admin/auth/login', credentials)
    .then((r) => r.data)
}

export function logout(): Promise<void> {
  return client.post('/admin/auth/logout').then(() => undefined)
}
