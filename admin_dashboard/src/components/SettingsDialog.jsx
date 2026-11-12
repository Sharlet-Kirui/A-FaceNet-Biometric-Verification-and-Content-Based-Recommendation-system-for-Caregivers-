import { useState } from 'react'
import { api, errorMessage } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { useApi } from '../hooks/useApi'
import { SETTING, dateTime, label } from '../utils/format'
import { ErrorBox, Loading, Modal } from './ui'

const WEIGHTS = ['weight_face', 'weight_ocr', 'weight_iprs']

export function SettingsDialog({ onClose }) {
  const { isSuperAdmin } = useAuth()
  const { data, error, loading, reload } = useApi(() => api.get('/admin/settings').then((r) => r.data.settings), 'settings')
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const value = (s) => (draft[s.key] ?? s.value)
  const changed = Object.entries(draft).filter(([k, v]) => data?.find((s) => s.key === k)?.value !== Number(v))
  const weightSum = data ? WEIGHTS.reduce((sum, k) => sum + Number(value(data.find((s) => s.key === k) || { value: 0 })), 0) : 1

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      await api.put('/admin/settings', { settings: Object.fromEntries(changed.map(([k, v]) => [k, Number(v)])) })
      setDraft({})
      setMessage({ ok: true, text: 'Saved. New verifications use these values.' })
      reload()
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      wide
      title="Verification settings"
      onClose={onClose}
      footer={isSuperAdmin && (
        <div className="row gap spread">
          <span className={Math.abs(weightSum - 1) > 0.001 ? 'error-text small' : 'muted small'}>
            Weights add up to {weightSum.toFixed(2)} (must be 1.00)
          </span>
          <button className="btn primary" disabled={saving || changed.length === 0} onClick={save}>
            {saving ? 'Saving…' : `Save ${changed.length || ''} change${changed.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    >
      {!isSuperAdmin && <p className="note">Read only: only a super administrator can change settings.</p>}
      <p className="muted small">Changes apply to verifications run after saving. Thresholds such as τ come from the evaluation; change them only with new measurements.</p>
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {message && (message.ok ? <p className="ok-text">{message.text}</p> : <ErrorBox message={message.text} />)}
      {data && (
        <table className="table compact">
          <thead><tr><th>Setting</th><th>Value</th><th>Last changed</th></tr></thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.key}>
                <td>
                  <strong>{label(SETTING, s.key)}</strong>
                  <div className="muted small">{s.description}</div>
                </td>
                <td>
                  {isSuperAdmin && s.editable ? (
                    <input type="number" className="num-input" step="any" min={s.range[0]} max={s.range[1]}
                      value={value(s)} onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))} />
                  ) : <span>{s.value}</span>}
                  {s.range && <div className="muted small">{s.range[0]}–{s.range[1]}</div>}
                </td>
                <td className="small muted">{dateTime(s.updatedAt)}{s.updatedBy ? ` · ${s.updatedBy}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
