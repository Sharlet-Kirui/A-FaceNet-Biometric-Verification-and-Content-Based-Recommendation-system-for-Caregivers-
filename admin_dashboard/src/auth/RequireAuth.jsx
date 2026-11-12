import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'

export function RequireAuth({ children }) {
  const { admin } = useAuth()
  const location = useLocation()
  if (!admin) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}
