/// The server the app talks to. Set it at build time:
///   flutter run --dart-define=API_URL=https://pms.example.com
/// The Android emulator reaches the Mac at 10.0.2.2, not localhost.
const String apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://localhost:3001');

/// Must match the server's API version (src/lib/mobile/api.ts).
const int apiVersion = 1;
