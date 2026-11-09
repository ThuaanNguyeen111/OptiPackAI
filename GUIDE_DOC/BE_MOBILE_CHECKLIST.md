# BE — Việc phải làm để app mobile chạy được

> **Phiên bản 1.0 — 09/11/2026.** Danh sách việc phía **backend** (`be/`) để app mobile (Flutter, BM04 RF-07) dùng được. Việc phía app nằm ở `MOBILE_UPDATE_CHECKLIST.md`; việc phía web nằm ở `FE_UPDATE_CHECKLIST.md`.
> Làm xong mục nào thì đổi `- [ ]` thành `- [x]` và ghi ngày + mã commit vào cột Ghi chú. Mỗi mục là chức năng mới: hỏi Thuận chốt trước khi code.

---

## A. Chặn mobile — làm trước khi làm app

- [x] **1. Tra ô kệ theo mã quét**
  - Route mới `GET /warehouse/warehouses/:warehouseId/bins/by-code/:binCode` (Admin, Warehouse Staff): trả ô kèm các SKU đang gán và tồn trên ô.
  - Vì sao: màn nhập thêm / kiểm kê / chuyển ô bắt đầu bằng quét mã ô. Hiện chỉ có `GET .../sku-bin-assignments` trả toàn bộ SKU của kho, không lọc theo mã ô.
  - Độ lớn: nhỏ. Ghi chú: xong 09/11/2026 (AOFP-251). Response `{ bin, zoneCode, zoneName, assignments[] }`; 404 `WH_BIN_NOT_FOUND`. Mã quét được bỏ khoảng trắng, thử cả bản viết hoa. Thêm index `{ warehouse_id, bin_location_id }`.

- [x] **2. Giới hạn gọi API theo user thay vì theo IP**
  - Đổi khóa đếm của throttler sang `user id` khi đã đăng nhập (chưa đăng nhập thì vẫn theo IP).
  - Vì sao: cả kho chung một wifi (một IP), 600 lần/phút (`THROTTLE_LIMIT_PER_MINUTE`) bị chia cho mọi máy, dễ bị 429.
  - Độ lớn: nhỏ. Ghi chú: xong 09/11/2026 (AOFP-252). `common/throttle/throttle-tracker.ts`: token hợp lệ (đúng chữ ký, còn hạn) → `user:<id>`; không có / sai → `ip:<ip>`.

- [ ] **3. Push thông báo (FCM)**
  - Route đăng ký / gỡ token thiết bị (`POST /notifications/devices`, `DELETE /notifications/devices/:token`), collection lưu token theo user, gửi push trong `NotificationsService.notify()` cùng lúc với in-app và email; token hết hạn thì tự xóa.
  - Vì sao: báo đơn mới, Hỏa Tốc, thiếu hàng, tồn vật liệu thấp mà không phải hỏi liên tục (tốn pin).
  - Cần trước: tạo project Firebase và file service account (để ngoài repo, đọc qua biến môi trường).
  - Độ lớn: vừa. Ghi chú: _

- [ ] **4. Upload ảnh bằng chứng**
  - Route upload ảnh (giới hạn dung lượng và loại file), thêm `photo_urls` cho: giao thành công / thất bại (`/shipments/:id/deliver`, `/fail`), kiểm hàng hoàn (`/returns/:id/inspect`), báo lỗi kiện (`packing-plan/report-issue`).
  - Vì sao: màn giao Hỏa Tốc, nhận hàng hoàn, báo lỗi kiện có nút chụp ảnh.
  - Dùng lại cách làm của `storefront-images.controller.ts`; `shipment-event.schema.ts` đã chừa chỗ `proof{photo_urls}`.
  - Độ lớn: vừa. Ghi chú: _

## B. Nên làm thêm — không chặn

- [x] **5. `GET /health`** kiểm tra kết nối MongoDB + Redis (app biết server sống hay lỗi). Nhỏ. Ghi chú: xong 09/11/2026 (AOFP-252). Công khai, không tính giới hạn gọi; 200 `{ status: 'ok', mongo: 'up', redis: 'up', uptime_s, time }`, có cái lỗi thì 503 `status: 'degraded'`.
- [ ] **6. `GET /app/version`** trả phiên bản app tối thiểu, app cũ hơn thì bắt cập nhật. Chỉ cần khi phát app ra ngoài nhóm. Nhỏ. Ghi chú: _
- [ ] **7. Tắt Swagger khi production; bật `enableShutdownHooks()`** trong `main.ts`. Nhỏ. Ghi chú: _
- [ ] **8. Cache `GET /dashboard/summary` 30–60 giây bằng Redis** (hiện đếm lại toàn bộ mỗi lần Store Owner mở app). Nhỏ. Ghi chú: _
- [ ] **9. Tìm nhóm đơn theo đuôi mã không quét cả bảng**: lưu mã ngắn có index, hoặc chỉ cho tìm đủ 24 ký tự (hiện dùng `$expr` + `$toString` `_id`). Nhỏ. Ghi chú: _
- [ ] **10. Sửa mock trong test cũ thiếu hàm mới** (log `clearPackingBlocked is not a function`, `scheduleShortageRecheck is not a function`, `autoCreateFromSellerSkus is not a function`) để test kiểm tra thật nhánh đó. Nhỏ. Ghi chú: _

---

## Thứ tự đề xuất

1 → 2 → 5 (nhỏ, không đổi API cũ, mở khóa đợt 1 của app: Warehouse Staff) → 3 (đợt 2–3) → 4 (đợt 4) → các mục còn lại khi còn thời gian.

## Đã có sẵn — mobile dùng được ngay (không cần làm)

- Đăng nhập, MFA, refresh token trả trong body (có xoay vòng), phân quyền theo role.
- `client_event_id` chống ghi trùng: `pick-item`, quét món khi đóng gói, `restock`, `adjust`, `transfer`.
- `expected_version` + 409 cho các thao tác ghi khác.
- Phân trang `before` + `limit`, lọc "việc của tôi" theo `assigned_staff_id`.
- Danh sách lấy hàng sắp theo đường đi trong kho; báo thiếu hàng; đơn Hỏa Tốc; thông báo in-app; dashboard; nhãn PDF.
