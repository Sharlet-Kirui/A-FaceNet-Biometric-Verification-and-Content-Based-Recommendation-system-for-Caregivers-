abstract class AuthService {
  Future<void> login({required String email, required String password});
}

/// Always succeeds after a short delay. Replace with an API-backed
/// implementation when the backend login endpoint exists.
class MockAuthService implements AuthService {
  @override
  Future<void> login({required String email, required String password}) {
    return Future.delayed(const Duration(milliseconds: 600));
  }
}
