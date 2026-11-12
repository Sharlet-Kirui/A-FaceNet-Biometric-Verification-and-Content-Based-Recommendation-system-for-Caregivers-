// One axios instance for the whole dashboard: base URL, admin token, readable errors.
import axios from 'axios'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// sessionStorage: the admin is logged out when the browser tab is closed
const TOKEN_KEY = 'admin_token'
export const tokenStore = {
  get() {
    try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null }
  },
  set(token) {
    try { sessionStorage.setItem(TOKEN_KEY, token) } catch { /* private mode: token lives in memory only */ }
  },
  clear() {
    try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
  },
}

export const api = axios.create({ baseURL: API_URL, timeout: 30000 })

api.interceptors.request.use((config) => {
  const token = tokenStore.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let onUnauthorized = null
/** Called by the auth provider so an expired token logs the admin out. */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLogin = error.config?.url?.includes('/admin/auth/login')
    if (error.response?.status === 401 && !isLogin && onUnauthorized) onUnauthorized()
    return Promise.reject(error)
  },
)

/** A message an admin can read, from any axios error. */
export function errorMessage(error, fallback = 'Something went wrong.') {
  const data = error?.response?.data
  if (data?.error) {
    const fields = data.fields ? Object.entries(data.fields).map(([k, v]) => `${k}: ${v}`).join('; ') : ''
    return fields ? `${data.error} (${fields})` : data.error
  }
  if (error?.code === 'ERR_NETWORK') return `Cannot reach the API at ${API_URL}. Is it running?`
  return error?.message || fallback
}
