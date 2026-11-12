import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from '../api/client'
import { AuthContext } from './AuthContext'

const PROFILE_KEY = 'admin_profile'

function readProfile() {
  try {
    const raw = sessionStorage.getItem(PROFILE_KEY)
    return raw && tokenStore.get() ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(readProfile)

  const logout = useCallback(() => {
    tokenStore.clear()
    try { sessionStorage.removeItem(PROFILE_KEY) } catch { /* ignore */ }
    setAdmin(null)
  }, [])

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/admin/auth/login', { email, password })
    tokenStore.set(data.token)
    try { sessionStorage.setItem(PROFILE_KEY, JSON.stringify(data.admin)) } catch { /* ignore */ }
    setAdmin(data.admin)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  const value = useMemo(
    () => ({ admin, isSuperAdmin: admin?.roleLevel === 'super_admin', login, logout }),
    [admin, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
