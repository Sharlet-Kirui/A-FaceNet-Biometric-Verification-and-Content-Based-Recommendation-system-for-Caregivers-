import 'package:flutter/foundation.dart';

import '../core/api_config.dart';
import 'api_client.dart';
import 'models.dart';

abstract class OnboardingService {
  Future<void> registerAccount({
    required String fullName,
    required String email,
    required String password,
  });

  Future<void> verifyEmail({required String email, required String code});

  Future<void> resendVerificationCode(String email);

  /// Personal info, address, credentials (reference/licence numbers, issuing
  /// authority, expiry dates) and work history.
  Future<void> submitDetails(Map<String, dynamic> details);

  /// Skill options from the platform vocabulary, keyed by
  /// 'specialization', 'technical' and 'language'.
  Future<Map<String, List<String>>> loadSkillOptions();

  /// Skill vector inputs: specializations, technical skills, languages,
  /// availability (including user-added entries).
  Future<void> submitSpecialties(Map<String, List<String>> specialties);

  /// Records consent and uploads documents. File paths keyed by document type:
  /// idFront, idBack, passport, goodConduct, tvetCdacc, license, cv, other.
  Future<void> submitKyc(Map<String, String> documentPaths);

  /// Asks the server for a random head-turn direction and a single-use nonce.
  Future<LivenessChallenge> startLivenessChallenge();

  /// Uploads the frontal frame and the turn frame(s); the server verifies and
  /// returns the decision.
  Future<VerificationResult> submitSelfie({
    required String centrePath,
    required List<String> turnPaths,
    required String nonce,
  });

  /// Current state of the caregiver's latest submission.
  Future<VerificationResult> checkVerification();

  /// 'National ID' or 'Passport', as chosen on the Details screen.
  String get idType;
}

/// Real implementation against the Node.js API.
class ApiOnboardingService implements OnboardingService {
  ApiOnboardingService(this._api);

  final ApiClient _api;
  static const _submissionKey = 'kyc_submission_id';

  String _idType = 'National ID';

  @override
  String get idType => _idType;

  Future<String?> _currentSubmissionId() => _api.read(_submissionKey);

  Future<void> _rememberSubmission(String id) => _api.write(_submissionKey, id);

  // ------------------------------------------------------------- account
  @override
  Future<void> registerAccount({
    required String fullName,
    required String email,
    required String password,
  }) async {
    final body = await _api.post('/auth/register', {
      'fullName': fullName,
      'email': email,
      'password': password,
    });
    _logDevCode(body);
  }

  @override
  Future<void> verifyEmail({required String email, required String code}) async {
    final body = await _api.post('/auth/otp/verify', {'email': email, 'code': code});
    await _api.saveToken(body['token'] as String);
  }

  @override
  Future<void> resendVerificationCode(String email) async {
    final body = await _api.post('/auth/otp/send', {'email': email});
    _logDevCode(body);
  }

  /// Email sending is not wired yet: in development the API returns the code,
  /// which is printed to the flutter run console (and the Node console).
  void _logDevCode(Map<String, dynamic> body) {
    if (kDebugMode && body['devOtp'] != null) debugPrint('[dev] email code: ${body['devOtp']}');
  }

  // ------------------------------------------------------------- profile
  @override
  Future<void> submitDetails(Map<String, dynamic> details) async {
    await _api.put('/caregivers/me/details', details);
    _idType = (details['idType'] as String?) ?? _idType;
  }

  @override
  Future<Map<String, List<String>>> loadSkillOptions() async {
    final body = await _api.get('/skill-tags');
    List<String> names(String category) => [
          for (final t in (body[category] as List? ?? const []))
            ((t as Map<String, dynamic>)['name'] as String),
        ];
    return {
      'specialization': names('specialization'),
      'technical': names('technical'),
      'language': names('language'),
    };
  }

  @override
  Future<void> submitSpecialties(Map<String, List<String>> specialties) =>
      _api.put('/caregivers/me/specialties', specialties);

  // ------------------------------------------------------------- KYC
  @override
  Future<void> submitKyc(Map<String, String> documentPaths) async {
    // Reuse the open submission (e.g. when retaking a blurred photo);
    // start a new attempt when there is none or the last one was rejected.
    var id = await _currentSubmissionId();
    if (id != null) {
      try {
        final current = await _api.get('/kyc/submissions/$id');
        if (current['status'] == 'rejected' || current['status'] == 'approved') id = null;
      } on ApiException catch (e) {
        if (e.statusCode == 404) {
          id = null;
        } else {
          rethrow;
        }
      }
    }
    if (id == null) {
      final created = await _api.post('/kyc/submissions', {
        'biometricConsent': true, // the KYC screen will not continue without the consent box
        'iprsConsent': true,
      });
      id = created['submission_id'] as String;
      await _rememberSubmission(id);
    }
    await _api.upload(
      '/kyc/submissions/$id/documents',
      files: [for (final e in documentPaths.entries) (e.key, e.value)],
    );
  }

  @override
  Future<LivenessChallenge> startLivenessChallenge() async {
    final id = await _requireSubmission();
    final body = await _api.post('/kyc/submissions/$id/liveness-challenge');
    return LivenessChallenge.fromJson(body);
  }

  @override
  Future<VerificationResult> submitSelfie({
    required String centrePath,
    required List<String> turnPaths,
    required String nonce,
  }) async {
    final id = await _requireSubmission();
    final body = await _api.upload(
      '/kyc/submissions/$id/selfie',
      fields: {'nonce': nonce},
      files: [('selfie_center', centrePath), for (final p in turnPaths) ('selfie_turn', p)],
      timeout: ApiConfig.verificationTimeout,
    );
    return VerificationResult.fromDecision(body);
  }

  @override
  Future<VerificationResult> checkVerification() async {
    final id = await _currentSubmissionId();
    Map<String, dynamic> body;
    try {
      body = await _api.get(id == null ? '/kyc/submissions/latest' : '/kyc/submissions/$id');
    } on ApiException catch (e) {
      // The saved id no longer exists (e.g. the database was reseeded):
      // forget it and ask for the newest submission instead.
      if (id == null || e.statusCode != 404) rethrow;
      await _api.remove(_submissionKey);
      body = await _api.get('/kyc/submissions/latest');
    }
    if (body['submission_id'] is String) await _rememberSubmission(body['submission_id'] as String);
    // After a fresh login the Details screen was skipped, so restore the ID
    // type (needed if the caregiver has to retake their documents).
    final me = await _api.get('/caregivers/me');
    if (me['id_type'] == 'passport') _idType = 'Passport';
    if (me['id_type'] == 'national_id') _idType = 'National ID';
    return VerificationResult.fromStatus(body);
  }

  Future<String> _requireSubmission() async {
    final id = await _currentSubmissionId();
    if (id == null) {
      throw const ApiException('Upload your documents first.');
    }
    return id;
  }
}

/// Offline stand-in for UI work without the backend (flutter run --dart-define=USE_MOCK=true).
class MockOnboardingService implements OnboardingService {
  Future<void> _delay([int ms = 600]) => Future.delayed(Duration(milliseconds: ms));

  @override
  String get idType => 'National ID';

  @override
  Future<void> registerAccount({
    required String fullName,
    required String email,
    required String password,
  }) =>
      _delay();

  @override
  Future<void> verifyEmail({required String email, required String code}) => _delay();

  @override
  Future<void> resendVerificationCode(String email) => _delay();

  @override
  Future<void> submitDetails(Map<String, dynamic> details) => _delay();

  @override
  Future<Map<String, List<String>>> loadSkillOptions() async {
    await _delay(300);
    return const {
      'specialization': ['Elderly Care', "Dementia & Alzheimer's Care", 'Child & Newborn Care'],
      'technical': ['Wound Dressing', 'Medication Administration', 'Vital Signs Monitoring'],
      'language': ['English', 'Kiswahili'],
    };
  }

  @override
  Future<void> submitSpecialties(Map<String, List<String>> specialties) => _delay();

  @override
  Future<void> submitKyc(Map<String, String> documentPaths) => _delay();

  @override
  Future<LivenessChallenge> startLivenessChallenge() async {
    await _delay(300);
    return const LivenessChallenge(nonce: 'mock', direction: 'turn_left', expiresInSeconds: 120);
  }

  @override
  Future<VerificationResult> submitSelfie({
    required String centrePath,
    required List<String> turnPaths,
    required String nonce,
  }) async {
    await _delay(2000);
    return const VerificationResult(status: 'approved', trustScore: 0.86);
  }

  @override
  Future<VerificationResult> checkVerification() async {
    await _delay(800);
    return const VerificationResult(status: 'approved', trustScore: 0.86);
  }
}