import { useState } from 'react'
import { api } from '../api/client'
import { useApi } from '../hooks/useApi'
import { REASON, SUBMISSION, date, fixed, label, pct } from '../utils/format'
import { SubmissionDrawer } from '../components/SubmissionDrawer'
import { Badge, Empty, ErrorBox, Loading, Pager, Tabs } from '../components/ui'

const LIMIT = 25

export function ReviewsPage() {
  const [status, setStatus] = useState('flagged')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [openId, setOpenId] = useState(null)
  const { data, error, loading, reload } = useApi(
    () => api.get('/admin/submissions', { params: { status, search: search || undefined, limit: LIMIT, offset } }).then((r) => r.data),
    `${status}|${search}|${offset}`)

  const counts = data?.counts || {}
  const tabs = [
    { value: 'flagged', label: 'Needs review', count: counts.flagged ?? 0 },
    { value: 'pending', label: 'Pending', count: (counts.pending ?? 0) },
    { value: 'approved', label: 'Approved', count: counts.approved ?? 0 },
    { value: 'rejected', label: 'Rejected', count: counts.rejected ?? 0 },
    { value: 'all', label: 'All' },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <h1>Verification queue</h1>
        <input className="search" type="search" placeholder="Search name or email" value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0) }} />
      </div>
      <p className="muted">Submissions the system did not approve automatically. Open one to see the checks, documents and selfie, then approve or reject it.</p>
      <Tabs tabs={tabs} value={status} onChange={(v) => { setStatus(v); setOffset(0) }} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && data.submissions.length === 0 && <Empty>Nothing here.</Empty>}
      {data && data.submissions.length > 0 && (
        <table className={`table ${loading ? 'stale' : ''}`}>
          <thead>
            <tr><th>Caregiver</th><th>County</th><th>Submitted</th><th className="num">Trust</th><th className="num">Face dist.</th><th>Registry</th><th>Why it needs review</th><th>Status</th></tr>
          </thead>
          <tbody>
            {data.submissions.map((s) => (
              <tr key={s.submissionId} className="clickable" onClick={() => setOpenId(s.submissionId)}>
                <td><strong>{s.caregiver.name}</strong><div className="muted small">{s.caregiver.email}</div></td>
                <td>{s.caregiver.county || '–'}</td>
                <td className="nowrap">{date(s.submittedAt)}</td>
                <td className="num">{pct(s.trustScore)}</td>
                <td className="num">{fixed(s.faceDistance, 3)}</td>
                <td>{s.iprsStatus ? <Badge tone={s.iprsStatus === 'verified' ? 'green' : 'red'}>{s.iprsStatus}</Badge> : '–'}</td>
                <td className="small">{(s.failedGates.length ? s.failedGates : s.reasons.filter((r) => r === 'score_below_threshold'))
                  .map((g) => label(REASON, g)).join('; ') || '–'}</td>
                <td><Badge value={s.status}>{label(SUBMISSION, s.status)}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && <Pager total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />}
      {openId && (
        <SubmissionDrawer submissionId={openId} onClose={() => setOpenId(null)}
          onDecided={() => { setOpenId(null); reload() }} />
      )}
    </div>
  )
}
