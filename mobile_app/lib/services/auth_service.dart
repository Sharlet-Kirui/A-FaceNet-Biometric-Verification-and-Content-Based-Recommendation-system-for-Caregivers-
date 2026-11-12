import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'models.dart';

abstract class AuthService {
  /// Throws [ApiException] with reason `email_not_verified` when the account
  /// exists but the email code was never confirmed.
  Future<LoginResult> login({required String email, required String password});

  Future<void> logout();

  /// Emails a reset code (same answer whether or not the account exists).
  Future<void> requestPasswordReset(String email);

  Future<void> resetPassword({required String email, required String code, required String newPassword});
}

/// Calls POST /auth/login and keeps the JWT in secure storage.
class ApiAuthService implements AuthService {
  ApiAuthService(this._api);
  final ApiClient _api;

  @override
  Future<LoginResult> login({required String email, required String password}) async {
    final body = await _api.post('/auth/login', {'email': email, 'password': password});
    await _api.saveToken(body['token'] as String);
    final caregiver = (body['caregiver'] as Map<String, dynamic>?) ?? const {};
    return LoginResult(
      firstName: (caregiver['firstName'] as String?) ?? '',
      onboardingStatus: (caregiver['onboardingStatus'] as String?) ?? 'registered',
    );
  }

  @override
  Future<void> logout() => _api.clearToken();

  @override
  Future<void> requestPasswordReset(String email) async {
    final body = await _api.post('/auth/password/forgot', {'email': email});
    if (kDebugMode && body['devOtp'] != null) debugPrint('[dev] reset code: ${body['devOtp']}');
  }

  @override
  Future<void> resetPassword({required String email, required String code, required String newPassword}) =>
      _api.post('/auth/password/reset', {'email': email, 'code': code, 'newPassword': newPassword});
}

/// Offline stand-in for UI work without the backend (flutter run --dart-define=USE_MOCK=true).
class MockAuthService implements AuthService {
  @override
  Future<LoginResult> login({required String email, required String password}) async {
    await Future.delayed(const Duration(milliseconds: 600));
    return const LoginResult(firstName: 'Grace', onboardingStatus: 'email_verified');
  }

  @override
  Future<void> logout() async {}

  @override
  Future<void> requestPasswordReset(String email) => Future.delayed(const Duration(milliseconds: 400));

  @override
  Future<void> resetPassword({required String email, required String code, required String newPassword}) =>
      Future.delayed(const Duration(milliseconds: 400));
}
