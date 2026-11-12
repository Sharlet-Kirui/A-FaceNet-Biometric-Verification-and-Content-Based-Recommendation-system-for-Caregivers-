import { useState } from 'react'
import { api } from '../api/client'
import { useApi } from '../hooks/useApi'
import { JOB_STATUS, SHIFT, date, kes, label } from '../utils/format'
import { CaregiverDrawer } from '../components/CaregiverDrawer'
import { CategoriesDialog } from '../components/CategoriesDialog'
import { JobDetailDrawer } from '../components/JobDetailDrawer'
import { JobFormDrawer } from '../components/JobFormDrawer'
import { Badge, Empty, ErrorBox, Loading, Pager, Tabs } from '../components/ui'

const LIMIT = 25

export function JobsPage() {
  const [status, setStatus] = useState('open')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  // one panel at a time: { kind: 'detail' | 'form' | 'caregiver' | 'categories', ... }
  const [panel, setPanel] = useState(null)
  const { data, error, loading, reload } = useApi(
    () => api.get('/admin/jobs', { params: { status: status || undefined, search: search || undefined, limit: LIMIT, offset } }).then((r) => r.data),
    `${status}|${search}|${offset}`)

  const tabs = [
    { value: 'open', label: 'Open' }, { value: 'draft', label: 'Draft' }, { value: 'filled', label: 'Filled' },
    { value: 'closed', label: 'Closed' }, { value: '', label: 'All' },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <h1>Jobs</h1>
        <div className="row gap">
          <input className="search" type="search" placeholder="Search title or county" value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0) }} />
          <button className="btn" onClick={() => setPanel({ kind: 'categories' })}>Categories</button>
          <button className="btn primary" onClick={() => setPanel({ kind: 'form', job: null })}>+ New job</button>
        </div>
      </div>
      <Tabs tabs={tabs} value={status} onChange={(v) => { setStatus(v); setOffset(0) }} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && data.jobs.length === 0 && <Empty>No jobs here.</Empty>}
      {data && data.jobs.length > 0 && (
        <table className={`table ${loading ? 'stale' : ''}`}>
          <thead><tr><th>Title</th><th>Category</th><th>County</th><th>Shift</th><th>Pay</th><th className="num">Skills</th><th className="num">Interested</th><th>Status</th><th>Posted</th></tr></thead>
          <tbody>
            {data.jobs.map((j) => (
              <tr key={j.jobId} className="clickable" onClick={() => setPanel({ kind: 'detail', jobId: j.jobId })}>
                <td><strong>{j.title}</strong></td>
                <td>{j.categoryName}</td>
                <td>{j.county}</td>
                <td>{label(SHIFT, j.shift)}</td>
                <td className="nowrap small">{kes(j.salaryMinKes, j.salaryMaxKes)}</td>
                <td className="num">{j.requirementCount}</td>
                <td className="num">{j.interestedCount > 0 ? <strong>{j.interestedCount}</strong> : 0}</td>
                <td><Badge value={j.status}>{label(JOB_STATUS, j.status)}</Badge></td>
                <td className="nowrap">{date(j.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && <Pager total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />}

      {panel?.kind === 'detail' && (
        <JobDetailDrawer jobId={panel.jobId} onClose={() => setPanel(null)} onChanged={reload}
          onEdit={(job) => setPanel({ kind: 'form', job })}
          onOpenCaregiver={(caregiverId) => setPanel({ kind: 'caregiver', caregiverId, back: panel })} />
      )}
      {panel?.kind === 'form' && (
        <JobFormDrawer job={panel.job} onClose={() => setPanel(null)}
          onSaved={(job) => { reload(); setPanel({ kind: 'detail', jobId: job.jobId }) }} />
      )}
      {panel?.kind === 'caregiver' && (
        <CaregiverDrawer caregiverId={panel.caregiverId} onClose={() => setPanel(panel.back)} onOpenSubmission={() => {}} />
      )}
      {panel?.kind === 'categories' && <CategoriesDialog onClose={() => setPanel(null)} onChanged={reload} />}
    </div>
  )
}
