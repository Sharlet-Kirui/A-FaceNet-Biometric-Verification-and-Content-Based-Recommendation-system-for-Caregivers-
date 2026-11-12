import { useState } from 'react'
import { api, errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import { JOB_STATUS, JOB_TYPE, SHIFT, date, kes, label, pct } from '../utils/format'
import { Badge, Drawer, Empty, ErrorBox, Facts, Loading, Section } from './ui'

export function JobDetailDrawer({ jobId, onClose, onEdit, onChanged, onOpenCaregiver }) {
  const { data: job, error, loading, reload } = useApi(() => api.get(`/admin/jobs/${jobId}`).then((r) => r.data), jobId)
  const [statusError, setStatusError] = useState(null)

  async function setStatus(status) {
    setStatusError(null)
    try {
      await api.patch(`/admin/jobs/${jobId}/status`, { status })
      reload()
      onChanged()
    } catch (err) {
      setStatusError(errorMessage(err))
    }
  }

  return (
    <Drawer
      title={job?.title || 'Job'}
      subtitle={job && `${job.categoryName} · posted ${date(job.createdAt)}`}
      onClose={onClose}
      footer={job && (
        <div className="row gap spread">
          <label className="row gap small">
            Status
            <select value={job.status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(JOB_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button className="btn primary" onClick={() => onEdit(job)}>Edit job</button>
        </div>
      )}
    >
      {loading && !job && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {statusError && <ErrorBox message={statusError} />}
      {job && (
        <>
          <div className="row gap wrap">
            <Badge value={job.status}>{label(JOB_STATUS, job.status)}</Badge>
            <Badge tone="blue">{job.interested.length} interested</Badge>
          </div>
          <Section title="Details">
            <Facts items={[
              ['Location', [job.locationDetail, job.county].filter(Boolean).join(', ')],
              ['Type', label(JOB_TYPE, job.jobType)], ['Shift', label(SHIFT, job.shift)],
              ['Minimum experience', `${job.minExperienceYears} years`], ['Pay (per month)', kes(job.salaryMinKes, job.salaryMaxKes)],
            ]} />
            {job.description && <p className="prose">{job.description}</p>}
          </Section>
          <Section title="Required skills">
            {job.requirements.length === 0 ? <Empty>No skills set: nobody can be matched to this job.</Empty> : (
              <table className="table compact">
                <thead><tr><th>Skill</th><th>Type</th><th className="num">Importance</th><th className="num">Min. level</th></tr></thead>
                <tbody>
                  {job.requirements.map((r) => (
                    <tr key={r.skillTagId}>
                      <td>{r.skillName}</td><td className="muted">{r.category}</td>
                      <td className="num">{r.importance.toFixed(2)}</td><td className="num">{r.requiredProficiency}/5</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
          <Section title="Interested caregivers">
            {job.interested.length === 0 ? <Empty>No caregiver has expressed interest yet.</Empty> : (
              <table className="table compact">
                <thead><tr><th>Name</th><th>County</th><th className="num">Exp.</th><th className="num">Match</th><th className="num">Trust</th><th>Contact</th></tr></thead>
                <tbody>
                  {job.interested.map((i) => (
                    <tr key={i.caregiverId} className="clickable" onClick={() => onOpenCaregiver(i.caregiverId)}>
                      <td>{i.name}</td><td>{i.county}</td><td className="num">{i.experienceYears}</td>
                      <td className="num">{pct(i.matchScore)}%</td>
                      <td className="num">{pct(i.trustScore)} {i.isVerified && <span title="verified">✓</span>}</td>
                      <td className="small">{i.phone || i.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}
    </Drawer>
  )
}
