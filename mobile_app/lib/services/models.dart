/// Small data classes shared by the services and the screens.
library;

/// Result of a successful login.
class LoginResult {
  final String firstName;

  /// registered, email_verified, details_submitted, documents_uploaded,
  /// liveness_done, under_review, verified or rejected.
  final String onboardingStatus;

  const LoginResult({required this.firstName, required this.onboardingStatus});

  /// The caregiver already submitted KYC, so the status screen is the right
  /// place to land after login.
  bool get hasSubmittedKyc => const {
        'documents_uploaded',
        'liveness_done',
        'under_review',
        'verified',
        'rejected',
      }.contains(onboardingStatus);
}

/// Server-issued head-turn challenge.
class LivenessChallenge {
  final String nonce;
  final String direction; // turn_left | turn_right
  final int expiresInSeconds;

  const LivenessChallenge({
    required this.nonce,
    required this.direction,
    required this.expiresInSeconds,
  });

  factory LivenessChallenge.fromJson(Map<String, dynamic> j) => LivenessChallenge(
        nonce: j['nonce'] as String,
        direction: j['challenge'] as String,
        expiresInSeconds: (j['expiresInSeconds'] as num?)?.toInt() ?? 120,
      );

  String get label => direction == 'turn_left' ? 'LEFT' : 'RIGHT';
}

/// What a check failure means for the caregiver and what they can do.
enum FixAction { retakeDocuments, retakeSelfie, editDetails, waitForReview }

class Finding {
  final String message;
  final FixAction action;
  const Finding(this.message, this.action);
}

/// Outcome of a KYC submission, from either the selfie upload or a status check.
class VerificationResult {
  /// pending | processing | approved | flagged | rejected
  final String status;

  /// 0-1 from the API; shown as 0-100 in the app.
  final double? trustScore;

  /// Gate failures and notes, e.g. face_mismatch, ocr_not_run.
  final List<String> reasons;

  const VerificationResult({required this.status, this.trustScore, this.reasons = const []});

  bool get isApproved => status == 'approved';
  bool get isRejected => status == 'rejected';
  bool get isUnderReview => status == 'flagged';
  bool get isInProgress => status == 'pending' || status == 'processing';
  int? get trustScore100 => trustScore == null ? null : (trustScore! * 100).round();

  /// From POST /kyc/submissions/:id/selfie (the decision returned directly).
  factory VerificationResult.fromDecision(Map<String, dynamic> j) => VerificationResult(
        status: j['decision'] == 'approved' ? 'approved' : 'flagged',
        trustScore: _toDouble(j['score']),
        reasons: _toList(j['reasons']),
      );

  /// From GET /kyc/submissions/:id or /latest.
  factory VerificationResult.fromStatus(Map<String, dynamic> j) => VerificationResult(
        status: (j['status'] as String?) ?? 'pending',
        trustScore: _toDouble(j['trust_score']),
        reasons: _toList(j['reasons']),
      );

  static double? _toDouble(Object? v) =>
      v == null ? null : (v is num ? v.toDouble() : double.tryParse(v.toString()));

  static List<String> _toList(Object? v) =>
      v is List ? v.map((e) => e.toString()).toList() : const [];

  /// Plain-language findings for the caregiver (notes such as ocr_not_run are
  /// internal and not shown).
  List<Finding> get findings => [
        for (final r in reasons)
          if (_messages[r] != null) _messages[r]!,
      ];

  static const _messages = <String, Finding>{
    'no_face_on_id': Finding(
        'We could not find a face on your ID photo. Upload a clear photo of the front of your ID.',
        FixAction.retakeDocuments),
    'id_image_blurry': Finding(
        'Your ID photo is blurred. Upload a sharper photo in good light.', FixAction.retakeDocuments),
    'no_face_on_selfie': Finding(
        'We could not find your face in the selfie. Retake it facing the camera.', FixAction.retakeSelfie),
    'selfie_blurry': Finding(
        'Your selfie is blurred. Hold the phone still and retake it in good light.', FixAction.retakeSelfie),
    'face_mismatch': Finding(
        'Your selfie did not match the photo on your ID. Retake the selfie in good light, or upload a clearer ID photo.',
        FixAction.retakeSelfie),
    'liveness_failed': Finding(
        'The head-turn check did not pass. Retake the selfie and turn your head as instructed.',
        FixAction.retakeSelfie),
    'liveness_unavailable': Finding(
        'The head-turn check could not be completed, so an administrator will review your application.',
        FixAction.waitForReview),
    'iprs_mismatch': Finding(
        'Your details did not match the identity registry. Check your name, ID number and date of birth.',
        FixAction.editDetails),
    'iprs_unavailable': Finding(
        'The identity registry could not be reached, so an administrator will review your application.',
        FixAction.waitForReview),
    'ocr_low': Finding(
        'We could not read your name or ID number clearly on your ID photo. Upload a sharp, '
        'well-lit photo of the front of your ID, filling the frame.',
        FixAction.retakeDocuments),
    'score_below_threshold': Finding(
        'Your checks passed with low confidence, so an administrator will review your application.',
        FixAction.waitForReview),
  };
}
