# OptiPackAI Mobile (Flutter)

App cho nhân viên vận hành: nhận việc, quét ô kệ / SKU để **lấy hàng**, nhập/kiểm kê kho, đóng gói, giao hàng — lấy hàng dùng được cả khi mất mạng ở cuối kho.

Việc cần làm và quy ước nối BE nằm ở [`GUIDE_DOC/MOBILE_UPDATE_CHECKLIST.md`](../GUIDE_DOC/MOBILE_UPDATE_CHECKLIST.md). Route thật ở [`GUIDE_DOC/API_LIST.md`](../GUIDE_DOC/API_LIST.md).

## Chạy thử

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000     # Android emulator
flutter run --dart-define=API_BASE_URL=http://192.168.1.10:3000 # máy thật: IP LAN của máy chạy BE
```

- Mặc định `API_BASE_URL` là `http://10.0.2.2:3000` (địa chỉ máy chủ nhìn từ Android emulator). Máy thật **không** dùng `localhost`.
- Bản debug cho gọi `http://`. Bản release phải dùng `https://`.
- Lần đầu build Android, chấp nhận giấy phép SDK: `flutter doctor --android-licenses`.
- Đăng nhập bằng tài khoản theo vai trò; mỗi vai trò thấy bộ tab riêng (xem bảng bên dưới).

## Kiểm tra

```bash
flutter analyze
flutter test
```

## Cấu trúc

```
lib/
  main.dart            mở SQLite rồi chạy app
  app/
    theme.dart, router.dart (go_router), providers.dart (Riverpod, phần nối BE thật)
    mock_providers.dart   <- TOÀN BỘ chỗ dùng dữ liệu giả nằm ở đây
  core/
    network/           ApiClient (tự refresh token, chỉ 1 lần refresh cùng lúc), ApiException
    storage/           token (Keystore/Keychain), SQLite, bộ nhớ đệm JSON
    format/            đơn vị cm/kg (dấu phẩy), đếm ngược hạn
  shared/              thành phần dùng chung (biểu ngữ "Dữ liệu mẫu", nút chờ BE, hộp thoại)
  features/
    auth/              đăng nhập (giống trang web: cú OptiPack, ghi nhớ email, MFA mã 6 số/mã dự phòng,
                       màn khóa 72 giờ, màn chào mừng), quên mật khẩu (chờ 60 giây mới gửi lại).
                       Chưa có: đăng nhập Google (chờ BE chuyển hướng về app), đăng ký (cấp tài khoản do Admin),
                       nút "Mở ứng dụng Email"
    offline/           hàng đợi thao tác + bộ gửi lại + thanh trạng thái
    home/              khung điều hướng theo vai trò, "Việc của tôi"
    warehouse/         lấy hàng, quét
    stock/ returns/ packing/ shipping/ overview/ notifications/   màn hình đang dùng dữ liệu giả
test/                  logic thuần, luật nghiệp vụ của repository giả, dựng thật từng màn hình
```

## Quy tắc quan trọng (đừng phá)

1. **Chỉ 5 route có `client_event_id` mới vào hàng đợi ngoại tuyến**: `pick-item`, quét món đóng gói, `restock`, `adjust`, `transfer`. Nút dùng `expected_version` (hoàn tất lấy hàng, báo thiếu, niêm phong…) chỉ gửi khi có mạng, **không** đưa vào hàng đợi.
2. **`client_event_id` sinh lúc người dùng bấm** (chính là `PendingAction.id`) và giữ nguyên qua mọi lần gửi lại — BE dựa vào đó để không trừ kho hai lần.
3. **Chỉ thử lại lỗi mạng / 408 / 429 / 5xx.** Lỗi nghiệp vụ (400, 404, 409, 422) thì dừng, giữ lại kèm `message` thật của BE.
4. **Refresh token có xoay vòng**: dùng lại token cũ làm BE thu hồi cả phiên. Mất mạng lúc refresh thì **không** đăng xuất; refresh bị từ chối thì về màn đăng nhập nhưng **giữ hàng đợi**.
5. **Quyền thật do BE kiểm.** Ẩn menu theo role chỉ để gọn; 403 thì hiện thông báo.
6. Token nằm trong kho bảo mật của máy, không lưu file thường.
7. Mã quét là **mã ô kệ + `seller_sku`**: sàn không có mã vạch sản phẩm.
8. Khi sửa file tiếng Việt bằng PowerShell 5.1, **không** dùng `Get-Content` / `Set-Content` mặc định (làm hỏng dấu). Dùng công cụ sửa file, hoặc `[IO.File]::ReadAllText(path, [Text.Encoding]::UTF8)`.

## Màn hình theo vai trò

Thanh tab dưới đổi theo role. Ẩn tab chỉ để gọn, quyền thật do BE kiểm.

| Role | Tab |
|---|---|
| Nhân viên kho | Việc của tôi · Kho · Hoàn hàng · Thông báo |
| Nhân viên đóng gói | Đóng gói · Thông báo |
| Điều phối giao hàng | Giao hàng · Thông báo |
| Chủ shop | Tổng quan · Duyệt hoàn · Thông báo |
| Admin | Tổng quan · Việc của tôi · Đóng gói · Giao hàng · Thông báo |

## Dữ liệu thật và dữ liệu giả

**Chỉ "Việc của tôi" và màn lấy hàng đã nối BE thật.** Mọi màn còn lại đang chạy bằng **dữ liệu giả** để hoàn thiện giao diện trước,
và mỗi màn có biểu ngữ vàng *"Dữ liệu mẫu — chưa nối BE"* để không ai nhầm với dữ liệu thật.

Toàn bộ chỗ dùng dữ liệu giả nằm trong **một file**: [`lib/app/mock_providers.dart`](lib/app/mock_providers.dart).
Mỗi tính năng có interface `*Repository` mô phỏng đúng route BE. Khi nối thật chỉ cần viết `Api*Repository` (xem `warehouse_repository.dart` làm mẫu)
rồi thay một dòng `Mock*Repository()`; **màn hình không phải sửa**.

| Tính năng | Màn | Route BE đã có (nối được ngay) | BE chưa có |
|---|---|---|---|
| Thông báo | `notifications_screen` | `GET /notifications`, `/unread-count`, `PATCH /:id/read`, `/read-all` | **Push FCM** (đăng ký thiết bị + gửi) |
| Nhập / kiểm kê / chuyển ô | `stock_screen` | `POST /warehouse/warehouses/:wid/sku-bin-assignments/:aid/restock`, `adjust`, `transfer` (có `client_event_id` nên đưa vào hàng đợi ngoại tuyến) | — |
| Hàng hoàn (kho) | `returns_screens` | `GET /returns`, `POST /returns/:id/receive`, `inspect`, `POST /shipments/:id/receive-return` | **Upload ảnh** tình trạng hàng |
| Duyệt hoàn (chủ shop) | `returns_screens` | `POST /returns/:id/approve`, `reject` | — |
| Đóng gói | `packing_screens` | `GET /order-groups?assigned_packer_id=`, `GET …/packing-plan`, `POST …/approve`, `reject`, `…/parcels/:no/scan`, `seal`, `…/report-issue` (`scan` có `client_event_id`) | **Upload ảnh** báo lỗi kiện |
| Giao hàng | `shipping_screen` | `GET /shipping/quote/:groupId`, `POST /shipments`, `POST /shipments/:id/deliver`, `fail`, `retry` | **Upload ảnh** bằng chứng giao hàng |
| Tổng quan / tra cứu đơn | `overview_screen` | `GET /dashboard/summary`, `GET /orders` | — |
| Phiên bản app tối thiểu | — | — | `GET /app/version` |

Các nút ảnh bị khoá và ghi "(chờ BE)". Các luật nghiệp vụ trong repository giả (chống ghi trùng `client_event_id`, cân lệch hơn 20% thì giữ kiện,
giao thất bại lần 2 tự hoàn kho, thùng hạng A phải gỡ nhãn cũ…) đều **mô phỏng đúng BE** và có kiểm thử trong `test/mock_features_test.dart`.

## Đã làm / chưa làm

| | |
|---|---|
| ✅ | Đăng nhập, MFA, refresh token, đăng xuất, thanh trạng thái đồng bộ |
| ✅ | Hàng đợi ngoại tuyến cho `pick-item`, tự gửi khi có mạng, mỗi 20 giây và sau khi thêm thao tác |
| ✅ | **Nối BE thật:** Việc của tôi (Hỏa Tốc lên đầu, đếm ngược hạn), lấy hàng, quét, báo thiếu, hoàn tất |
| 🟡 | **Giao diện xong, dữ liệu giả:** Kho, Hoàn hàng, Duyệt hoàn, Đóng gói, Giao hàng, Tổng quan, Thông báo |
| ☐ | Nối thật các màn trên (xem bảng), đưa nhập/kiểm kê/chuyển ô và quét món đóng gói vào hàng đợi ngoại tuyến |
| ☐ | Push FCM, chụp và gửi ảnh bằng chứng (chờ BE) |
| ☐ | Đổi mật khẩu bắt buộc trong app (hiện báo đổi trên web) |
| ⚠️ | **Chưa chạy trên thiết bị hay emulator.** Mới có phân tích tĩnh và kiểm thử (logic và dựng màn hình) |
