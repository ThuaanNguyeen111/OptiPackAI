/// Cấu hình lúc build: `flutter run --dart-define=API_BASE_URL=http://192.168.1.10:3000/api`.
///
/// BE đặt tiền tố `/api` cho mọi route (`app.setGlobalPrefix('api')`), nên địa chỉ phải kết thúc bằng `/api`.
/// Mặc định trỏ tới máy dev khi chạy trên **Android emulator** (`10.0.2.2` là máy chủ của emulator).
/// Máy thật phải dùng IP LAN của máy chạy backend, không dùng `localhost`.
class Env {
  const Env._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/api',
  );

  /// `--dart-define=USE_MOCK_DATA=true`: các màn dùng dữ liệu giả, không cần BE (trình diễn giao diện).
  /// Đăng nhập và "Việc của tôi" của kho vẫn gọi BE thật.
  /// Client **Web** của BE (`GOOGLE_CLIENT_ID`), làm `serverClientId` cho đăng nhập Google.
  /// `flutter run --dart-define=GOOGLE_SERVER_CLIENT_ID=xxxx.apps.googleusercontent.com`. Để trống thì nút Google báo chưa cấu hình.
  static const String googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');

  static const bool useMockData = bool.fromEnvironment('USE_MOCK_DATA');
}
