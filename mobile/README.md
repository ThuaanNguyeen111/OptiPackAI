# OptiPackAI Mobile (Flutter)

App cho nhân viên vận hành: nhận việc, quét ô kệ / SKU để **lấy hàng**, nhập/kiểm kê kho, đóng gói, giao hàng — lấy hàng dùng được cả khi mất mạng ở cuối kho.

Việc cần làm và quy ước nối BE nằm ở [`GUIDE_DOC/MOBILE_UPDATE_CHECKLIST.md`](../GUIDE_DOC/MOBILE_UPDATE_CHECKLIST.md). Route thật ở [`GUIDE_DOC/API_LIST.md`](../GUIDE_DOC/API_LIST.md).

## Chạy thử

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api     # Android emulator
flutter run --dart-define=API_BASE_URL=http://192.168.1.10:3000/api # máy thật: IP LAN của máy chạy BE
```

- Mặc định `API_BASE_URL` là `http://10.0.2.2:3000/api` (BE đặt tiền tố `/api` cho mọi route; địa chỉ máy chủ nhìn từ Android emulator). Máy thật **không** dùng `localhost`.
- Nút **Tiếp tục với Google** cần thêm `--dart-define=GOOGLE_SERVER_CLIENT_ID=<GOOGLE_CLIENT_ID của BE>.apps.googleusercontent.com` và OAuth client Android (package + SHA-1) — xem `MOBILE_UPDATE_CHECKLIST.md` mục 9d. Thiếu thì bấm nút sẽ báo chưa cấu hình, đăng nhập email + mật khẩu vẫn dùng bình thường.
- Trình diễn giao diện không cần BE: thêm `--dart-define=USE_MOCK_DATA=true` (các màn dùng dữ liệu giả, có biểu ngữ vàng "Dữ liệu mẫu"). Đăng nhập và lấy hàng vẫn gọi BE thật.
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
    mock_providers.dart   <- chọn nguồn dữ liệu từng màn: Api*Repository (mặc định) hoặc Mock*Repository (USE_MOCK_DATA / test)
  core/
    network/           ApiClient (tự refresh token, chỉ 1 lần refresh cùng lúc), ApiException
    storage/           token (Keystore/Keychain), SQLite, bộ nhớ đệm JSON
    format/            đơn vị cm/kg (dấu phẩy), đếm ngược hạn
  shared/              thành phần dùng chung (biểu ngữ "Dữ liệu mẫu", màn lỗi có nút Thử lại, hộp thoại)
  features/
    auth/              đăng nhập (giống trang web: cú OptiPack, ghi nhớ email, MFA mã 6 số/mã dự phòng,
                       màn khóa 72 giờ, màn chào mừng), quên mật khẩu (chờ 60 giây mới gửi lại).
                       Đăng nhập Google (google_sign_in → POST /auth/google/mobile; cần `--dart-define=GOOGLE_SERVER_CLIENT_ID`, xem checklist 9d).
                       Chưa có: đăng ký (cấp tài khoản do Admin),
                       nút "Mở ứng dụng Email"
    offline/           hàng đợi thao tác + bộ gửi lại + thanh trạng thái
    home/              khung điều hướng theo vai trò, "Việc của tôi"
    warehouse/         lấy hàng, quét
    stock/ returns/ packing/ shipping/ overview/ notifications/   mỗi thư mục có *_repository.dart (interface + bản giả) và api_*_repository.dart (gọi BE)
    proof/             chụp / chọn ảnh bằng chứng, tải lên POST /proof-photos
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

Bảng trên là quyền mặc định. Admin bật / tắt trang cho từng vai trò trên web thì app đọc `GET /role-permissions/me` lúc đăng nhập và đổi tab theo (tối đa 4 tab + Thông báo).

## Dữ liệu thật và dữ liệu giả

**Từ 13/11/2026 mọi màn gọi BE thật.** Nguồn dữ liệu chọn ở [`lib/app/mock_providers.dart`](lib/app/mock_providers.dart): mặc định `Api*Repository`;
chạy với `--dart-define=USE_MOCK_DATA=true` (hoặc trong test, qua `mockDataOverrides`) thì dùng `Mock*Repository` và hiện biểu ngữ "Dữ liệu mẫu".
Bản giả vẫn giữ để trình diễn khi không có BE và để kiểm thử luật nghiệp vụ (`test/mock_features_test.dart`).

| Tính năng | Repository thật | Route BE |
|---|---|---|
| Thông báo | `ApiNotificationsRepository` | `GET /notifications`, `/unread-count`, `PATCH /:id/read`, `/read-all` |
| Nhập / kiểm kê / chuyển ô | `ApiStockRepository` | `GET /warehouse/warehouses/:wid/bins/by-code/:code`, `POST …/sku-bin-assignments/:aid/restock`, `adjust`, `transfer` (kèm `client_event_id`) |
| Hàng hoàn (kho) + duyệt hoàn (chủ shop) | `ApiReturnsRepository` | `GET /returns?status=`, `POST /returns/:id/receive`, `inspect` (ô nhập lại + mã thùng thu hồi + ảnh), `approve`, `reject` (gửi `expected_version`) |
| Đóng gói | `ApiPackingRepository` | `GET /order-groups?fulfillment_status=&assigned_packer_id=`, `GET …/packing-plan`, `POST …/approve`, `reject`, `…/parcels/:no/scan`, `unscan`, `seal`, `…/report-issue` |
| Giao hàng | `ApiShippingRepository` | `GET /order-groups?fulfillment_status=packed`, `/packing-plans/summary`, `/shipping/quote/:groupId`, `POST /shipments` (hãng hoặc shop tự giao + `shipper_id`), `/shipments/:id/deliver`, `fail`, `retry` |
| Tổng quan / tra cứu đơn | `ApiOverviewRepository` | `GET /dashboard/summary` (hôm nay), `GET /order-groups?order_priority=express`, `GET /orders` (lọc trên máy) |
| Ảnh bằng chứng | `ProofPhotoRepository` | `POST /proof-photos` |

## Đã làm / chưa làm

| | |
|---|---|
| ✅ | Đăng nhập, MFA, refresh token, đăng xuất, thanh trạng thái đồng bộ |
| ✅ | Hàng đợi ngoại tuyến cho `pick-item`, tự gửi khi có mạng, mỗi 20 giây và sau khi thêm thao tác |
| ✅ | **Nối BE thật:** Việc của tôi (Hỏa Tốc lên đầu, đếm ngược hạn), lấy hàng, quét, báo thiếu, hoàn tất |
| ✅ | **Nối BE thật (13/11/2026):** Kho, Hoàn hàng, Duyệt hoàn, Đóng gói, Giao hàng, Tổng quan, Thông báo (mục trên) |
| ✅ | Ảnh bằng chứng (giao thành công, giao thất bại, kiểm hàng hoàn, báo lỗi kiện), tab theo quyền Admin cấu hình, push FCM |
| ☐ | Đưa nhập/kiểm kê/chuyển ô, quét món đóng gói và ảnh vào hàng đợi ngoại tuyến (hiện gửi ngay, mất mạng thì báo lỗi) |
| ☐ | Tìm đơn theo chữ ở BE (hiện lọc 100 đơn mới nhất trên máy); tên người nhận trên thẻ vận đơn (BE chưa trả) |
| ☐ | Đổi mật khẩu bắt buộc trong app (hiện báo đổi trên web) |
| ⚠️ | **Chưa chạy trên thiết bị hay emulator.** Mới có phân tích tĩnh và kiểm thử (logic và dựng màn hình) |
