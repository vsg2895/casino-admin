import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import * as authApi from '@/api/auth'
import type { AuthUser, LoginCredentials } from '@/types/auth'

const TOKEN_KEY = 'auth_token'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<AuthUser | null>(null)

  const isAuthenticated = computed(() => token.value !== null)

  async function login(credentials: LoginCredentials): Promise<void> {
    const response = await authApi.login(credentials)
    token.value = response.token
    user.value = response.user
    localStorage.setItem(TOKEN_KEY, response.token)
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } finally {
      token.value = null
      user.value = null
      localStorage.removeItem(TOKEN_KEY)
    }
  }

  return { token, user, isAuthenticated, login, logout }
})
