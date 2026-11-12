// Small building blocks used on every page.
import { useEffect } from 'react'

const BADGE_TONE = {
  verified: 'green', approved: 'green', open: 'green', true: 'green', shortlisted: 'green', interested: 'amber', declined: 'grey',
  flagged: 'amber', under_review: 'amber', pending: 'amber', processing: 'amber', draft: 'grey',
  rejected: 'red', closed: 'grey', filled: 'blue', false: 'grey',
}

export function Badge({ value, children, tone }) {
  return <span className={`badge badge-${tone || BADGE_TONE[value] || 'blue'}`}>{children ?? String(value)}</span>
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value}
          className={value === t.value ? 'tab active' : 'tab'} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

/** Panel sliding in from the right, for reviewing one record. */
export function Drawer({ title, subtitle, onClose, children, footer, wide }) {
  useEscape(onClose)
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside className={wide ? 'drawer wide' : 'drawer'} role="dialog" aria-label={title}>
        <header className="drawer-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </aside>
    </div>
  )
}

/** Centred dialog for settings, categories and the audit log. */
export function Modal({ title, onClose, children, footer, wide }) {
  useEscape(onClose)
  return (
    <div className="overlay center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={wide ? 'modal wide' : 'modal'} role="dialog" aria-label={title}>
        <header className="drawer-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </div>
    </div>
  )
}

export function Section({ title, children, aside }) {
  return (
    <section className="section">
      <div className="section-head">
        <h3>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Label / value grid. items: [[label, value], ...] */
export function Facts({ items }) {
  return (
    <dl className="facts">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v ?? '–'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Loading({ text = 'Loading…' }) {
  return <p className="muted pad">{text}</p>
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="error-box">
      <span>{message}</span>
      {onRetry && <button className="btn small" onClick={onRetry}>Retry</button>}
    </div>
  )
}

export function Empty({ children }) {
  return <p className="muted pad center-text">{children}</p>
}

export function Pager({ total, limit, offset, onChange }) {
  if (total <= limit) return null
  const from = offset + 1
  const to = Math.min(offset + limit, total)
  return (
    <div className="pager">
      <span className="muted">{from}–{to} of {total}</span>
      <button className="btn small" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</button>
      <button className="btn small" disabled={to >= total} onClick={() => onChange(offset + limit)}>Next</button>
    </div>
  )
}
