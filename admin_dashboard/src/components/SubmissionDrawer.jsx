import { useState } from 'react'
import { api, errorMessage } from '../api/client'
import { useApi } from '../hooks/useApi'
import { ACTION, REASON, SUBMISSION, date, dateTime, fixed, label, pct } from '../utils/format'
import { DocumentPreview } from './DocumentPreview'
import { Badge, Drawer, ErrorBox, Facts, Loading, Section } from './ui'

/** Score row: value, what it is compared with, and whether it passed. */
function Check({ name, value, detail, ok }) {
  return (
    <div className={`check ${ok == null ? '' : ok ? 'pass' : 'fail'}`}>
      <span className="check-mark">{ok == null ? '•' : ok ? '✓' : '✕'}</span>
      <div>
        <strong>{name}</strong>
        <span className="muted small">{detail}</span>
      </div>
      <span className="check-value">{value}</span>
    </div>
  )
}

export function SubmissionDrawer({ submissionId, onClose, onDecided }) {
  const { data: s, error, loading, reload } = useApi(
    () => api.get(`/admin/submissions/${submissionId}`).then((r) => r.data), submissionId)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [decisionError, setDecisionError] = useState(null)

  async function decide(decision) {
    if (decision === 'reject' && reason.trim().length < 5) {
      setDecisionError('Write the reason for rejecting (the caregiver is told their application was not approved).')
      return
    }
    setBusy(true)
    setDecisionError(null)
    try {
      await api.post(`/admin/submissions/${submissionId}/decision`, { decision, reason: reason.trim() })
      onDecided()
    } catch (err) {
      setDecisionError(errorMessage(err))
      setBusy(false)
    }
  }

  const r = s?.report
  const d = r?.details || {}
  const failed = new Set(d.failedGates || [])
  const faceThreshold = d.faceThreshold ?? s?.currentThresholds?.faceDistance
  const trustThreshold = d.threshold ?? s?.currentThresholds?.trust ?? 0.75
  // live reports store { blur: { id, selfie } }; seeded ones store blurId / blurSelfie
  const blur = d.blur || (d.blurId != null ? { id: d.blurId, selfie: d.blurSelfie } : null)
  const ORDER = ['id_front', 'id_back', 'passport', 'selfie_center', 'selfie_turn', 'selfie_blink']
  const rank = (t) => (ORDER.includes(t) ? ORDER.indexOf(t) : ORDER.length)
  const docs = [...(s?.documents || [])].sort((a, b) => rank(a.docType) - rank(b.docType))
  const idDocs = docs.filter((x) => ['id_front', 'id_back', 'passport'].includes(x.docType))
  const selfies = docs.filter((x) => x.docType.startsWith('selfie'))
  const others = docs.filter((x) => !idDocs.includes(x) && !selfies.includes(x))
  const decidable = s && s.status !== 'processing' && r

  return (
    <Drawer
      wide
      title={s ? `${s.caregiver.firstName} ${s.caregiver.lastName}` : 'Submission'}
      subtitle={s && `Attempt ${s.attemptNumber} · submitted ${dateTime(s.submittedAt)}`}
      onClose={onClose}
      footer={decidable && (
        <div className="decision">
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Reason or note (required to reject), e.g. 'Face checked by hand: older ID photo, same person'" />
          {decisionError && <p className="error-text small">{decisionError}</p>}
          <div className="row gap">
            <button className="btn danger" disabled={busy} onClick={() => decide('reject')}>Reject</button>
            <button className="btn primary" disabled={busy} onClick={() => decide('approve')}>Approve</button>
          </div>
        </div>
      )}
    >
      {loading && !s && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {s && (
        <>
          <div className="row gap wrap">
            <Badge value={s.status}>{label(SUBMISSION, s.status)}</Badge>
            {r && <Badge tone={r.trustScore >= trustThreshold ? 'green' : 'amber'}>Trust score {pct(r.trustScore)}/100</Badge>}
            {d.decision && <Badge tone="grey">Automatic decision: {d.decision}</Badge>}
          </div>

          {r ? (
            <Section title="Checks">
              <Check name="Face match" ok={!failed.has('face_mismatch') && r.faceDistance != null}
                value={fixed(r.faceDistance, 3)}
                detail={`FaceNet distance, must be below τ = ${fixed(faceThreshold, 4)} · face score ${pct(r.faceMatchScore)}`} />
              <Check name="Liveness (head turn)" ok={failed.has('liveness_failed') || failed.has('liveness_unavailable') ? false : r.livenessScore != null ? true : null}
                value={r.livenessScore == null ? '–' : pct(r.livenessScore)}
                detail={`Challenge: ${s.livenessChallenge?.replace('_', ' ') || '–'}${d.liveness?.reason ? ` · ${d.liveness.reason}` : ''}`} />
              <Check name="Registry (IPRS)" ok={r.iprsStatus === 'verified'} value={r.iprsStatus}
                detail={d.iprs?.reason ? `${d.iprs.reason}${d.iprs.fields ? `: ${d.iprs.fields.join(', ')}` : ''}` : 'Typed details against the registry'} />
              <Check name="OCR (ID text)" ok={r.ocrScore == null ? null : r.ocrScore >= 0.5}
                value={r.ocrScore == null ? 'not run' : pct(r.ocrScore)}
                detail={d.ocr?.idNumber ? `Number read ${d.ocr.idNumber.found ?? '–'} · name score ${pct(d.ocr.names?.score)}` : 'ID number and name read from the ID front'} />
              <Check name="Image sharpness" ok={!failed.has('id_image_blurry') && !failed.has('selfie_blurry')}
                value={blur ? `${Math.round(blur.id ?? 0)} / ${Math.round(blur.selfie ?? 0)}` : '–'}
                detail={`Laplacian variance, ID / selfie (minimum ${s.currentThresholds?.blur ?? 100})`} />
              {(d.reasons || []).length > 0 && (
                <ul className="reasons">
                  {d.reasons.map((x) => <li key={x} className={failed.has(x) ? 'fail' : ''}>{label(REASON, x)}</li>)}
                </ul>
              )}
            </Section>
          ) : (
            <ErrorBox message="No verification report yet: the checks have not run for this submission." />
          )}

          <Section title="ID document and selfie">
            <div className="docs">{[...idDocs, ...selfies].map((x) => <DocumentPreview key={x.documentId} doc={x} />)}</div>
          </Section>

          <Section title="Typed details">
            <Facts items={[
              ['ID type', s.caregiver.idType?.replace('_', ' ')],
              ['ID number', s.caregiver.idNumber],
              ['Date of birth', s.caregiver.dateOfBirth],
              ['Nationality', s.caregiver.nationality],
              ['Gender', s.caregiver.gender],
              ['Phone', s.caregiver.phone],
              ['Email', s.caregiver.email],
              ['Address', [s.caregiver.street, s.caregiver.town, s.caregiver.county].filter(Boolean).join(', ')],
              ['Experience', s.caregiver.experienceYears != null ? `${s.caregiver.experienceYears} years` : null],
            ]} />
          </Section>

          {others.length > 0 && (
            <Section title="Supporting documents">
              <div className="docs">{others.map((x) => <DocumentPreview key={x.documentId} doc={x} />)}</div>
            </Section>
          )}

          {(s.credentials.length > 0 || s.workHistory.length > 0) && (
            <Section title="Credentials and work history (self-declared)">
              {s.credentials.map((c) => (
                <p key={c.credential_type} className="small">
                  <strong>{c.credential_type.replace('_', ' ')}</strong> · {c.reference_number || 'no reference'} ·{' '}
                  {c.issuing_authority || '–'} · expires {c.expiry_date || '–'} <Badge value={c.status} />
                </p>
              ))}
              {s.workHistory.map((w) => (
                <p key={`${w.employer}-${w.from_year}`} className="small">
                  <strong>{w.role}</strong>, {w.employer} ({w.from_year}–{w.to_year ?? 'now'})
                </p>
              ))}
            </Section>
          )}

          <Section title="History">
            {s.attempts.length > 1 && (
              <p className="small muted">
                Attempts: {s.attempts.map((a) => `#${a.attemptNumber} ${label(SUBMISSION, a.status)} (${date(a.submittedAt)})`).join(' · ')}
              </p>
            )}
            {s.history.length === 0 ? <p className="muted small">No decisions recorded yet.</p> : (
              <ul className="timeline">
                {s.history.map((h) => (
                  <li key={`${h.actionType}-${h.at}`}>
                    <strong>{label(ACTION, h.actionType)}</strong> · {h.adminName || 'System'} · {dateTime(h.at)}
                    {h.details?.reason && <div className="muted small">“{h.details.reason}”</div>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </Drawer>
  )
}
