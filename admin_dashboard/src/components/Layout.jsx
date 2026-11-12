import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { AuditLogDialog } from './AuditLogDialog'
import { SettingsDialog } from './SettingsDialog'

const NAV = [
  ['/', 'Dashboard', '▦'],
  ['/reviews', 'Verification queue', '✓'],
  ['/caregivers', 'Caregivers', '☺'],
  ['/jobs', 'Jobs', '▤'],
]

export function Layout() {
  const { admin, isSuperAdmin, logout } = useAuth()
  const [dialog, setDialog] = useState(null) // 'settings' | 'audit'

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">CareMatch<span>Admin</span></div>
        {NAV.map(([to, text, icon]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
            <span className="nav-icon" aria-hidden>{icon}</span>{text}
          </NavLink>
        ))}
        <div className="nav-sep" />
        <button className="nav" onClick={() => setDialog('settings')}><span className="nav-icon" aria-hidden>⚙</span>Settings</button>
        <button className="nav" onClick={() => setDialog('audit')}><span className="nav-icon" aria-hidden>☰</span>Audit log</button>
        <div className="sidebar-foot">
          <strong>{admin.firstName} {admin.lastName}</strong>
          <span>{isSuperAdmin ? 'Super administrator' : 'Reviewer'}</span>
          <button className="btn small" onClick={logout}>Log out</button>
        </div>
      </nav>
      <main className="main">
        <Outlet />
      </main>
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === 'audit' && <AuditLogDialog onClose={() => setDialog(null)} />}
    </div>
  )
}
