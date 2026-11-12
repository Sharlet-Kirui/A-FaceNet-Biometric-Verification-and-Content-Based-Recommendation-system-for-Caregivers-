// Onboarding status only ever moves forward (a re-submitted step never moves it back),
// except 'rejected', which an admin can set at any time.
const ORDER = ['registered', 'email_verified', 'details_submitted', 'documents_uploaded',
  'liveness_done', 'under_review', 'verified'];

async function advanceStatus(db, caregiverId, target) {
  const { rows } = await db.query('SELECT onboarding_status FROM caregivers WHERE caregiver_id = $1', [caregiverId]);
  if (!rows[0]) return;
  const current = rows[0].onboarding_status;
  if (current === 'rejected' && target !== 'verified' && target !== 'under_review') return;
  if (current !== 'rejected' && ORDER.indexOf(target) <= ORDER.indexOf(current)) return;
  await db.query('UPDATE caregivers SET onboarding_status = $2 WHERE caregiver_id = $1', [caregiverId, target]);
}

module.exports = { advanceStatus, ORDER };
