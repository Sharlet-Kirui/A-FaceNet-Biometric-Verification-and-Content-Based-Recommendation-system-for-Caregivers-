// In-app notifications for caregivers (GET /notifications). `c` is a pool or a transaction client.
async function notify(c, caregiverId, type, title, body = null, data = {}) {
  await c.query(
    `INSERT INTO notifications (caregiver_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5)`,
    [caregiverId, type, title, body, JSON.stringify(data)]);
}

/** Message for the outcome of a verification (automatic or by an administrator). */
function verificationMessage(approved, { byAdmin = false, reason = null } = {}) {
  if (approved) {
    return ['verification_approved', 'You are verified',
      'Your identity has been verified. Your job matches are ready on the Home screen.'];
  }
  if (byAdmin) {
    return ['verification_rejected', 'Your application was not approved',
      reason ? `Reason: ${reason}. You can start a new application from the status screen.`
        : 'You can start a new application from the status screen.'];
  }
  return ['verification_review', 'Your application is being reviewed',
    'Some checks need a closer look, so an administrator will review your application.'];
}

module.exports = { notify, verificationMessage };
