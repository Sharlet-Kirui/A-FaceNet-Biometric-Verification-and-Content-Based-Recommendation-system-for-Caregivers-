import 'api_client.dart';
import 'auth_service.dart';
import 'jobs_service.dart';
import 'onboarding_service.dart';

/// Screens read their services from here.
///
/// The real API is used by default. For UI work without the backend running:
///   flutter run --dart-define=USE_MOCK=true
const bool _useMock = bool.fromEnvironment('USE_MOCK');

final ApiClient apiClient = ApiClient();

final OnboardingService onboardingService =
    _useMock ? MockOnboardingService() : ApiOnboardingService(apiClient);

final AuthService authService = _useMock ? MockAuthService() : ApiAuthService(apiClient);

final JobsService jobsService = _useMock ? MockJobsService() : ApiJobsService(apiClient);
