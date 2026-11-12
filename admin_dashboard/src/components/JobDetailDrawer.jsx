import { useState } from 'react'
import { api, errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import { APPLICANT, JOB_STATUS, JOB_TYPE, SHIFT, date, kes, label, pct } from '../utils/format'
import { Badge, Drawer, Empty, ErrorBox, Facts, Loading, Section } from './ui'

export function JobDetailDrawer({ jobId, onClose, onEdit, onChanged, onOpenCaregiver }) {
  const { data: job, error, loading, reload } = useApi(() => api.get(`/admin/jobs/${jobId}`).then((r) => r.data), jobId)
  const [statusError, setStatusError] = useState(null)

  const [busyApplicant, setBusyApplicant] = useState(null)

  async function setApplicant(caregiverId, status) {
    setStatusError(null)
    setBusyApplicant(caregiverId)
    try {
      await api.patch(`/admin/jobs/${jobId}/applicants/${caregiverId}`, { status })
      reload()
      onChanged()
    } catch (err) {
      setStatusError(errorMessage(err))
    } finally {
      setBusyApplicant(null)
    }
  }

  /** Opens the CV in a new tab (fetched with the admin token). */
  async function openCv(documentId) {
    const tab = window.open('', '_blank') // opened now, while the click still counts, so it is not blocked
    try {
      const res = await api.get(`/admin/documents/${documentId}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      if (tab) tab.location.href = url
      else window.location.assign(url)
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      if (tab) tab.close()
      setStatusError(errorMessage(err))
    }
  }

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
      wide
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
            <Badge tone="blue">{job.interested.length} applicant{job.interested.length === 1 ? '' : 's'}</Badge>
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
          <Section title="Applicants" aside={<span className="muted small">Shortlisting notifies the caregiver in the app</span>}>
            {job.interested.length === 0 ? <Empty>No caregiver has expressed interest yet.</Empty> : (
              <table className="table compact">
                <thead><tr><th>Name</th><th className="num">Exp.</th><th className="num">Match</th><th className="num">Trust</th><th>Contact</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {job.interested.map((i) => (
                    <tr key={i.caregiverId}>
                      <td>
                        <button className="link-btn" onClick={() => onOpenCaregiver(i.caregiverId)}>{i.name}</button>
                        <div className="muted small">{i.county}</div>
                      </td>
                      <td className="num">{i.experienceYears}</td>
                      <td className="num">{pct(i.matchScore)}%</td>
                      <td className="num">{pct(i.trustScore)} {i.isVerified && <span title="verified">✓</span>}</td>
                      <td className="small">{i.phone || i.email}</td>
                      <td><Badge value={i.status}>{label(APPLICANT, i.status)}</Badge></td>
                      <td className="actions">
                        {i.cvDocumentId
                          ? <button className="btn small" onClick={() => openCv(i.cvDocumentId)}>CV</button>
                          : <span className="muted small" title="No CV uploaded">no CV</span>}
                        {i.status !== 'shortlisted' && (
                          <button className="btn small" disabled={busyApplicant === i.caregiverId}
                            onClick={() => setApplicant(i.caregiverId, 'shortlisted')}>Shortlist</button>
                        )}
                        {i.status !== 'declined' && (
                          <button className="btn small danger" disabled={busyApplicant === i.caregiverId}
                            onClick={() => setApplicant(i.caregiverId, 'declined')}>Decline</button>
                        )}
                        {i.status !== 'interested' && (
                          <button className="btn small" disabled={busyApplicant === i.caregiverId} title="Back to waiting"
                            onClick={() => setApplicant(i.caregiverId, 'interested')}>Undo</button>
                        )}
                      </td>
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
