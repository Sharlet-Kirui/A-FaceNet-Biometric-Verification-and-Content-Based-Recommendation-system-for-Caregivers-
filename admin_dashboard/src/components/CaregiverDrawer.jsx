import { api } from '../api/client'
import { useApi } from '../hooks/useApi'
import { JOB_STATUS, ONBOARDING, SHIFT, SUBMISSION, date, label, pct } from '../utils/format'
import { Badge, Drawer, Empty, ErrorBox, Facts, Loading, Section } from './ui'

export function CaregiverDrawer({ caregiverId, onClose, onOpenSubmission }) {
  const { data: c, error, loading, reload } = useApi(
    () => api.get(`/admin/caregivers/${caregiverId}`).then((r) => r.data), caregiverId)

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
        </>
      )}
    </Drawer>
  )
}
