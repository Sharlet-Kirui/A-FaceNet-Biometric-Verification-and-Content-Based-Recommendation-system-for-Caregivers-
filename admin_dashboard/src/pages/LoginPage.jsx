import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { useAuth } from '../auth/useAuth'

export function LoginPage() {
  const { admin, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (admin) return <Navigate to={location.state?.from || '/'} replace />

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email.trim(), password)
      navigate(location.state?.from || '/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand dark">CareMatch<span>Admin</span></div>
        <h1>Sign in</h1>
        <p className="muted">Review verifications, manage jobs and monitor the system.</p>
        <label>Email<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}
