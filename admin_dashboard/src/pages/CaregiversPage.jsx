import { useState } from 'react'
import { api } from '../api/client'
import { useApi } from '../hooks/useApi'
import { ONBOARDING, date, label, pct } from '../utils/format'
import { CaregiverDrawer } from '../components/CaregiverDrawer'
import { SubmissionDrawer } from '../components/SubmissionDrawer'
import { Badge, Empty, ErrorBox, Loading, Pager } from '../components/ui'

const LIMIT = 25

export function CaregiversPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [openId, setOpenId] = useState(null)
  const [submissionId, setSubmissionId] = useState(null)
  const { data, error, loading, reload } = useApi(
    () => api.get('/admin/caregivers', { params: { search: search || undefined, status: status || undefined, limit: LIMIT, offset } }).then((r) => r.data),
    `${search}|${status}|${offset}`)

  return (
    <div className="page">
      <div className="page-head">
        <h1>Caregivers</h1>
        <div className="row gap">
          <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0) }}>
            <option value="">All stages</option>
            {Object.entries(ONBOARDING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input className="search" type="search" placeholder="Search name or email" value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0) }} />
        </div>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && data.caregivers.length === 0 && <Empty>No caregivers match.</Empty>}
      {data && data.caregivers.length > 0 && (
        <table className={`table ${loading ? 'stale' : ''}`}>
          <thead><tr><th>Name</th><th>County</th><th className="num">Experience</th><th className="num">Skills</th><th className="num">Trust</th><th>Stage</th><th>Joined</th></tr></thead>
          <tbody>
            {data.caregivers.map((c) => (
              <tr key={c.caregiverId} className="clickable" onClick={() => setOpenId(c.caregiverId)}>
                <td><strong>{c.name}</strong><div className="muted small">{c.email}</div></td>
                <td>{c.county || '–'}</td>
                <td className="num">{c.experienceYears ?? '–'}</td>
                <td className="num">{c.skillCount}</td>
                <td className="num">{pct(c.trustScore)} {c.isVerified && <span className="ok-text" title="verified">✓</span>}</td>
                <td><Badge value={c.onboardingStatus}>{label(ONBOARDING, c.onboardingStatus)}</Badge></td>
                <td className="nowrap">{date(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && <Pager total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />}
      {openId && !submissionId && (
        <CaregiverDrawer caregiverId={openId} onClose={() => setOpenId(null)} onOpenSubmission={setSubmissionId} onDeleted={reload} />
      )}
      {submissionId && (
        <SubmissionDrawer submissionId={submissionId} onClose={() => setSubmissionId(null)}
          onDecided={() => { setSubmissionId(null); reload() }} />
      )}
    </div>
  )
}
