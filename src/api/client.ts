import axios from 'axios'
import { API_BASE_URL } from '@/config/urls'

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: { Accept: 'application/json' },
})

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
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default client
