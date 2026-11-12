// Labels and number formatting shared by every page.

export const pct = (score) => (score == null ? '–' : `${Math.round(Number(score) * 100)}`)
export const fixed = (n, d = 2) => (n == null ? '–' : Number(n).toFixed(d))

export function date(value) {
  if (!value) return '–'
  return new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
}
export function dateTime(value) {
  if (!value) return '–'
  return new Date(value).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
export function kes(min, max) {
  const f = (n) => Number(n).toLocaleString('en-KE')
  if (min == null && max == null) return '–'
  if (max == null || max === min) return `KES ${f(min)}`
  if (min == null) return `up to KES ${f(max)}`
  return `KES ${f(min)} – ${f(max)}`
}

export const label = (map, key) => map[key] || String(key ?? '–').replaceAll('_', ' ')

export const ONBOARDING = {
  registered: 'Registered', email_verified: 'Email verified', details_submitted: 'Details submitted',
  documents_uploaded: 'Documents uploaded', liveness_done: 'Selfie done', under_review: 'Under review',
  verified: 'Verified', rejected: 'Rejected',
}
export const ONBOARDING_ORDER = Object.keys(ONBOARDING)

export const SUBMISSION = { pending: 'Pending', processing: 'Processing', flagged: 'Needs review', approved: 'Approved', rejected: 'Rejected' }
export const JOB_STATUS = { draft: 'Draft', open: 'Open', filled: 'Filled', closed: 'Closed' }
export const JOB_TYPE = { full_time: 'Full-time', part_time: 'Part-time', live_in: 'Live-in', temporary: 'Temporary' }
export const APPLICANT = { interested: 'Waiting', shortlisted: 'Shortlisted', declined: 'Declined' }

export const SHIFT = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night', live_in: 'Live-in' }

export const DOC_TYPE = {
  id_front: 'National ID (front)', id_back: 'National ID (back)', passport: 'Passport', good_conduct: 'Good conduct certificate',
  tvet_cdacc: 'TVET CDACC / NITA', license: 'Professional licence', cv: 'CV', other: 'Other document',
  selfie_center: 'Selfie (front)', selfie_turn: 'Selfie (head turn)', selfie_blink: 'Selfie (blink)',
}

// Gate failures and notes written by the trust engine (api_backend/services/trustScore.js)
export const REASON = {
  no_face_on_id: 'No face found on the ID photo',
  no_face_on_selfie: 'No face found in the selfie',
  id_image_blurry: 'ID photo too blurred',
  selfie_blurry: 'Selfie too blurred',
  face_mismatch: 'Selfie does not match the ID photo',
  liveness_failed: 'Head-turn check failed',
  liveness_unavailable: 'Head-turn check could not run',
  liveness_not_enforced: 'Head-turn check switched off',
  iprs_mismatch: 'Details do not match the registry',
  iprs_unavailable: 'Registry could not be reached',
  ocr_not_run: 'OCR did not run (left out of the score)',
  iprs_not_checked: 'Registry check switched off (left out of the score)',
  ocr_low: 'ID text barely matches the typed details',
  score_below_threshold: 'Trust score below the approval threshold',
}

export const ACTION = {
  auto_trust_decision: 'Automatic decision', admin_approve: 'Approved by admin', admin_reject: 'Rejected by admin',
  job_created: 'Job created', job_updated: 'Job updated', job_status_changed: 'Job status changed',
  category_created: 'Category created', category_updated: 'Category updated', category_deleted: 'Category deleted',
  settings_updated: 'Settings changed',
  applicant_shortlisted: 'Applicant shortlisted', applicant_declined: 'Applicant declined',
  applicant_interested: 'Applicant moved back to waiting', caregiver_deleted: 'Caregiver account deleted',
}

export const SETTING = {
  weight_face: 'Weight: face match', weight_ocr: 'Weight: OCR', weight_iprs: 'Weight: registry (IPRS)',
  trust_threshold: 'Approval threshold (trust score)', face_distance_threshold: 'Face distance threshold (τ)',
  blur_threshold: 'Minimum sharpness (blur)', liveness_min_turn_ratio: 'Liveness: minimum head turn',
  liveness_same_person_threshold: 'Liveness: same-person distance', liveness_nonce_ttl_seconds: 'Liveness: challenge time (s)',
  liveness_enforced: 'Liveness required (1 = yes)',
  iprs_enforced: 'Registry check required (1 = yes)',
}
