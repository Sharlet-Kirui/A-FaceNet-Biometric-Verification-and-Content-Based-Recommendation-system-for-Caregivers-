import { useState } from 'react'
import { api, errorMessage } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { useApi } from '../hooks/useApi'
import { APPLICANT, JOB_STATUS, ONBOARDING, SHIFT, SUBMISSION, date, label, pct } from '../utils/format'
import { Badge, Drawer, Empty, ErrorBox, Facts, Loading, Section } from './ui'

export function CaregiverDrawer({ caregiverId, onClose, onOpenSubmission, onDeleted }) {
  const { isSuperAdmin } = useAuth()
  const { data: c, error, loading, reload } = useApi(
    () => api.get(`/admin/caregivers/${caregiverId}`).then((r) => r.data), caregiverId)
  const [deleting, setDeleting] = useState(null) // null | { reason, busy, error }

  async function deleteAccount() {
    setDeleting((d) => ({ ...d, busy: true, error: null }))
    try {
      await api.delete(`/admin/caregivers/${caregiverId}`, { data: { reason: deleting.reason } })
      onDeleted?.()
      onClose()
    } catch (err) {
      setDeleting((d) => ({ ...d, busy: false, error: errorMessage(err) }))
    }
  }

  const groups = {}
  for (const s of c?.skills || []) (groups[s.category] ||= []).push(s)

  return (
    <Drawer title={c ? `${c.firstName} ${c.lastName}` : 'Caregiver'} subtitle={c?.email} onClose={onClose}>
      {loading && !c && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {c && (
        <>
          <div className="row gap wrap">
            <Badge value={c.onboardingStatus}>{label(ONBOARDING, c.onboardingStatus)}</Badge>
            {c.trust && (
              <Badge tone={c.trust.isVerified ? 'green' : 'grey'}>
                Trust score {pct(c.trust.score)}/100{c.trust.isVerified ? ` · valid to ${date(c.trust.validUntil)}` : ''}
              </Badge>
            )}
          </div>
          <Section title="Profile">
            <Facts items={[
              ['Phone', c.phone], ['Date of birth', c.dateOfBirth], ['Gender', c.gender], ['Nationality', c.nationality],
              ['Location', [c.town, c.county].filter(Boolean).join(', ')],
              ['Experience', c.experienceYears != null ? `${c.experienceYears} years` : null],
              ['Shifts', c.shifts.map((s) => label(SHIFT, s)).join(', ') || null],
              ['Joined', date(c.createdAt)],
            ]} />
          </Section>
          <Section title="Skills">
            {Object.keys(groups).length === 0 ? <Empty>No skills listed.</Empty> : Object.entries(groups).map(([cat, list]) => (
              <div key={cat} className="chip-group">
                <span className="muted small cap">{cat}</span>
                <div className="chips">{list.map((s) => <span key={s.name} className="chip">{s.name} · {s.proficiency}/5</span>)}</div>
              </div>
            ))}
          </Section>
          <Section title="Verification attempts">
            {c.submissions.length === 0 ? <Empty>No submissions yet.</Empty> : (
              <table className="table compact">
                <tbody>
                  {c.submissions.map((s) => (
                    <tr key={s.submissionId} className="clickable" onClick={() => onOpenSubmission(s.submissionId)}>
                      <td>#{s.attemptNumber}</td>
                      <td>{date(s.submittedAt)}</td>
                      <td><Badge value={s.status}>{label(SUBMISSION, s.status)}</Badge></td>
                      <td className="num">{pct(s.trustScore)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
          <Section title="Jobs of interest">
            {c.interests.length === 0 ? <Empty>No interest expressed yet.</Empty> : (
              <table className="table compact">
                <tbody>
                  {c.interests.map((i) => (
                    <tr key={i.jobId}>
                      <td>{i.title}</td>
                      <td><Badge value={i.jobStatus}>{label(JOB_STATUS, i.jobStatus)}</Badge></td>
                      <td><Badge value={i.applicantStatus}>{label(APPLICANT, i.applicantStatus)}</Badge></td>
                      <td className="num">{pct(i.matchScore)}% match</td>
                      <td>{date(i.interestedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
          {(c.credentials.length > 0 || c.workHistory.length > 0) && (
            <Section title="Credentials and work history (self-declared)">
              {c.credentials.map((x) => (
                <p key={x.credential_type} className="small">
                  <strong>{x.credential_type.replace('_', ' ')}</strong> · {x.reference_number || '–'} · expires {x.expiry_date || '–'}{' '}
                  <Badge value={x.status} />
                </p>
              ))}
              {c.workHistory.map((w) => (
                <p key={`${w.employer}-${w.from_year}`} className="small">
                  <strong>{w.role}</strong>, {w.employer} ({w.from_year}–{w.to_year ?? 'now'})
                </p>
              ))}
            </Section>
          )}
          {isSuperAdmin && (
            <Section title="Delete account">
              <p className="small muted">
                For deletion requests under the Privacy Notice. Removes the account, documents, photos, face data,
                reports and applications, and the uploaded files. This cannot be undone; the audit log keeps the reason.
              </p>
              {deleting == null ? (
                <button className="btn danger" onClick={() => setDeleting({ reason: '', busy: false, error: null })}>Delete this account…</button>
              ) : (
                <div className="form">
                  <input placeholder="Reason, e.g. Deletion requested by the caregiver by email on 14 Nov"
                    value={deleting.reason} onChange={(e) => setDeleting({ ...deleting, reason: e.target.value })} />
                  {deleting.error && <p className="error-text small">{deleting.error}</p>}
                  <div className="row gap">
                    <button className="btn" onClick={() => setDeleting(null)}>Cancel</button>
                    <button className="btn danger" disabled={deleting.busy || deleting.reason.trim().length < 5} onClick={deleteAccount}>
                      {deleting.busy ? 'Deleting…' : 'Delete permanently'}
                    </button>
                  </div>
                </div>
              )}
            </Section>
          )}
        </>
      )}
    </Drawer>
  )
}
