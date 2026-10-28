import 'auth_service.dart';
import 'onboarding_service.dart';

/// Screens read their services from here. When the backend is ready, swap
/// the mocks for the API-backed versions in this one file.
final OnboardingService onboardingService = MockOnboardingService();
final AuthService authService = MockAuthService();
