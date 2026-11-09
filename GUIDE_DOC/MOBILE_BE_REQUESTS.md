# Yêu cầu backend cho app mobile (Flutter)

> **Phiên bản 1.0 — 09/11/2026.** Người gửi: người làm mobile. Người nhận: người phụ trách backend (Thuận).
> Nguồn: `MOBILE_UPDATE_CHECKLIST.md` mục 9 và phần đối chiếu route thật trong `be/src` (đã đọc controller, chưa gọi thử).
> Mobile đã dựng sẵn giao diện cho mọi vai trò bằng dữ liệu giả; các việc dưới đây là phần mobile **không tự làm được**.

**Quyết định mới (09/11/2026):** app sẽ phát cho người dùng thật, nên `GET /app/version` và Google cho mobile không còn là tuỳ chọn.

## Tóm tắt theo mức ưu tiên

| # | Việc | Chặn mobile ở đâu | Ưu tiên |
|---|---|---|---|
| 1 | Upload ảnh bằng chứng | Giao Hỏa Tốc, kiểm hàng hoàn, báo lỗi kiện | Cao |
| 2 | Lọc vận đơn theo shipper | Màn "Việc của tôi" của shipper | Cao |
| 3 | Push FCM | Mọi cảnh báo khi app đóng | Trung bình |
| 4 | `GET /app/version` | Bắt cập nhật app cũ | Trung bình |
| 5 | Giới hạn gọi API theo user | Cả kho dùng chung 1 IP, 600 lần/phút | Trung bình |
| 6 | Đăng nhập Google cho mobile | Nút Google đang khoá | Thấp |

---

## 1. Upload ảnh bằng chứng

**Vì sao:** mobile có nút chụp ảnh ở 3 chỗ nhưng đang khoá "(chờ BE)". Hiện chỉ có upload ảnh cho website AURELLE, không dùng chung được. `shipment-event.schema.ts` đã có ghi chú chừa chỗ `proof{photo_urls}`.

**Đề xuất:**
- `POST /uploads/proof` (multipart, 1 ảnh/lần, trường `file`, tối đa 5 MB, chỉ JPEG/PNG/WebP). Mọi role vận hành gọi được. Trả `{ url, id }`.
- Nhận thêm `photo_urls?: string[]` (tối đa 3) ở các body sau, lưu vào sự kiện tương ứng:
  - `POST /shipments/:id/deliver` và `/fail`.
  - `POST /returns/:id/inspect` (theo từng dòng kiểm).
  - `POST /order-groups/:groupId/packing-plan/report-issue`.
- Đường dẫn ảnh nên ký hạn hoặc cần đăng nhập để xem (ảnh có địa chỉ, người nhận).

**Mobile cần biết:** nơi lưu file (cùng máy chủ hay dịch vụ ngoài), giới hạn dung lượng, ảnh nén phía máy trước khi gửi hay không. Tải ảnh là thao tác chỉ gửi khi có mạng, không vào hàng đợi ngoại tuyến.

## 2. Lọc vận đơn theo shipper

**Vì sao:** đơn Hỏa Tốc chỉ shipper được gán mới bấm giao được (`403 SHP_NOT_ASSIGNED_SHIPPER`). Nhưng `GET /shipments` chưa có tham số lọc theo shipper (chỉ thấy `shipper_id` trong body tạo vận đơn). App không có cách lấy "việc của tôi" cho shipper.

**Đề xuất:** `GET /shipments?shipper_id=me&status=out_for_delivery` (chấp nhận `me` hoặc id người dùng), có `limit` và `before` như các danh sách khác. Mở cho Shipping Coordinator (chỉ thấy của mình) và Admin.

## 3. Push FCM

**Vì sao:** hiện thông báo chỉ có trong app (chuông), nên shipper hoặc nhân viên kho không biết có việc mới, cảnh báo tồn vật liệu, hoặc đơn Hỏa Tốc sắp trễ khi app đóng.

**Đề xuất:**
- `POST /notifications/devices` body `{ token, platform: 'android' | 'ios', app_version }` đăng ký thiết bị; `DELETE /notifications/devices/:token` khi đăng xuất. Một người dùng có nhiều thiết bị.
- Trong `NotificationsService.notify()`: ngoài ghi in-app và gửi email, gửi push tới thiết bị của người nhận (đích danh hoặc theo role).
- Nội dung push: `title`, `message`, `related_entity_type`, `related_entity_id` (để bấm vào mở đúng màn), `severity`.
- Xoá token khi FCM trả lỗi token không còn hợp lệ.

**Mobile cần biết:** project Firebase dùng chung hay tách; mobile sẽ thêm `firebase_messaging` và gửi token ngay sau khi đăng nhập.

## 4. `GET /app/version`

**Vì sao:** app phát cho người dùng thật, cần bắt cập nhật khi bản cũ không còn tương thích với API.

**Đề xuất:** `GET /app/version` (không cần đăng nhập) trả `{ min_version, latest_version, update_url }`. Mobile so sánh khi mở app; thấp hơn `min_version` thì chặn và hướng dẫn cập nhật, thấp hơn `latest_version` thì chỉ nhắc.

## 5. Giới hạn gọi API theo user

**Vì sao:** giới hạn hiện là 600 lần/phút **theo IP**. Cả kho dùng chung một IP, nhiều máy quét và polling có thể làm cả kho nhận `429`.

**Đề xuất:** khoá giới hạn theo `user id` khi đã đăng nhập (giữ theo IP cho route chưa đăng nhập như đăng nhập, quên mật khẩu). Nếu chưa làm được ngay thì cho biết giới hạn riêng của các route quét (`pick-item`, `parcels/:no/scan`, `restock`, `adjust`, `transfer`) để mobile tính nhịp gửi hàng đợi.

## 6. Đăng nhập Google cho mobile

**Hiện trạng:** `GET /auth/google` → Google → `GET /auth/google/callback` rồi chuyển hướng về `CLIENT_REDIRECT_CALLBACK` (mặc định `http://localhost:5173/oauth-success`) kèm `access_token`, `refresh_token`, `role`, `must_change_password` **trên đường dẫn**. Địa chỉ này là trang web, app không nhận được; token trên đường dẫn cũng dễ lộ.

**Đề xuất (ưu tiên cách 1):**
1. `POST /auth/google/mobile` body `{ id_token }`: backend kiểm tra `id_token` với Google, áp dụng đúng luật của web (chỉ đăng nhập tài khoản đã có, báo `ACCOUNT_NOT_REGISTERED`, `ACCOUNT_INACTIVE`, `ACCOUNT_LOCKED`, `EMAIL_NOT_VERIFIED`), trả cùng dạng như `POST /auth/login` (kể cả `must_change_password`).
2. Hoặc cho `GET /auth/google` nhận `client=mobile` và chuyển hướng về địa chỉ riêng của app (`optipackai://auth`), kiểm trong danh sách cho phép.
3. Đăng ký client OAuth cho Android (cần SHA-1 của app) và thêm vào cấu hình Google của backend.

---

## Đã có sẵn, mobile dùng được ngay (không cần làm gì)

Refresh token trong body (có xoay vòng), phân quyền theo role, `client_event_id` cho `pick-item` / quét món đóng gói / `restock` / `adjust` / `transfer`, `expected_version` + 409, phân trang `before` + `limit`, lọc `assigned_staff_id` và `assigned_packer_id`, báo thiếu hàng, đơn Hỏa Tốc, thông báo in-app, dashboard.

## Câu hỏi cần backend trả lời

1. Ảnh lưu ở đâu, thời hạn lưu bao lâu?
2. Có dùng chung project Firebase với web không?
3. Có kế hoạch nâng giới hạn gọi API cho vai trò kho không?
4. Phiên bản app tối thiểu do ai quản lý (biến môi trường hay bảng cấu hình)?
