/// Cấu hình lúc build: `flutter run --dart-define=API_BASE_URL=http://192.168.1.10:3000`.
///
/// Mặc định trỏ tới máy dev khi chạy trên **Android emulator** (`10.0.2.2` là máy chủ của emulator).
/// Máy thật phải dùng IP LAN của máy chạy backend, không dùng `localhost`.
class Env {
  const Env._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );
}
