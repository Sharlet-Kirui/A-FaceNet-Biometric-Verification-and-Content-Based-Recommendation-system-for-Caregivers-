/// Where the app finds the Node.js API.
///
/// Default `http://localhost:3000` works on a physical phone when you run
///   adb reverse tcp:3000 tcp:3000
/// once per session (it forwards the phone's port 3000 to your laptop).
///
/// To use your laptop's Wi-Fi address instead, run:
///   flutter run --dart-define=API_BASE_URL=http://192.168.x.x:3000
class ApiConfig {
  ApiConfig._();

  static const baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  /// Normal requests.
  static const requestTimeout = Duration(seconds: 30);

  /// Selfie upload runs face matching on the server; the first call after the
  /// ML service starts can take a minute while the model loads.
  static const verificationTimeout = Duration(seconds: 150);
}
