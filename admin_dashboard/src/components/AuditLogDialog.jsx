import { useState } from 'react'
import { api } from '../api/client'
import { useApi } from '../hooks/useApi'
import { ACTION, REASON, dateTime, label, pct } from '../utils/format'
import { Empty, ErrorBox, Loading, Modal, Pager } from './ui'

const LIMIT = 25

/** One-line summary of an audit entry's details. */
function summary(log) {
  const d = log.details || {}
  switch (log.actionType) {
    case 'auto_trust_decision':
      return `${d.decision} · score ${pct(d.score)}${d.reasons?.length ? ` · ${d.reasons.map((r) => label(REASON, r)).join(', ')}` : ''}`
    case 'admin_approve':
    case 'admin_reject':
      return `${d.automaticDecision ? `system said ${d.automaticDecision}` : ''}${d.reason ? ` · “${d.reason}”` : ''}`
    case 'settings_updated':
      return Object.entries(d.changed || {}).map(([k, v]) => `${k}: ${v.from} → ${v.to}`).join(', ')
    default:
      return [d.title || d.name, d.status].filter(Boolean).join(' · ')
  }
}

export function AuditLogDialog({ onClose }) {
  const [actionType, setActionType] = useState('')
  const [offset, setOffset] = useState(0)
  const { data, error, loading, reload } = useApi(
    () => api.get('/admin/audit-logs', { params: { actionType: actionType || undefined, limit: LIMIT, offset } }).then((r) => r.data),
    `${actionType}|${offset}`)

  return (
    <Modal wide title="Audit log" onClose={onClose}>
      <div className="row gap toolbar">
        <select value={actionType} onChange={(e) => { setActionType(e.target.value); setOffset(0) }}>
          <option value="">All actions</option>
          {(data?.actionTypes || []).map((t) => <option key={t} value={t}>{label(ACTION, t)}</option>)}
        </select>
        {loading && <span className="muted small">Loading…</span>}
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && loading && <Loading />}
      {data && data.logs.length === 0 && <Empty>No entries.</Empty>}
      {data && data.logs.length > 0 && (
        <table className="table compact">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>
            {data.logs.map((l) => (
              <tr key={l.logId}>
                <td className="nowrap small">{dateTime(l.at)}</td>
                <td className="small">{l.adminName}</td>
                <td className="small"><strong>{label(ACTION, l.actionType)}</strong></td>
                <td className="small">{summary(l)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && <Pager total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />}
    </Modal>
  )
}
