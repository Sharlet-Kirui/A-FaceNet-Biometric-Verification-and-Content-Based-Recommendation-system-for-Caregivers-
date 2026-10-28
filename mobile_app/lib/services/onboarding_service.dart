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

  /// Skill vector inputs: specializations, technical skills, languages,
  /// availability (including user-added entries).
  Future<void> submitSpecialties(Map<String, List<String>> specialties);

  /// File paths keyed by document type: idFront, idBack, passport,
  /// goodConduct, tvetCdacc, license, other.
  Future<void> submitKyc(Map<String, String> documentPaths);

  Future<void> submitSelfie(String selfiePath);

  /// Resolves true once face-to-ID matching and document checks pass.
  Future<bool> checkVerification();
}

class MockOnboardingService implements OnboardingService {
  Future<void> _delay([int ms = 600]) =>
      Future.delayed(Duration(milliseconds: ms));

  @override
  Future<void> registerAccount({
    required String fullName,
    required String email,
    required String password,
  }) => _delay();

  @override
  Future<void> verifyEmail({required String email, required String code}) =>
      _delay();

  @override
  Future<void> resendVerificationCode(String email) => _delay();

  @override
  Future<void> submitDetails(Map<String, dynamic> details) => _delay();

  @override
  Future<void> submitSpecialties(Map<String, List<String>> specialties) =>
      _delay();

  @override
  Future<void> submitKyc(Map<String, String> documentPaths) => _delay();

  @override
  Future<void> submitSelfie(String selfiePath) => _delay();

  @override
  Future<bool> checkVerification() async {
    await _delay(3500);
    return true;
  }
}
