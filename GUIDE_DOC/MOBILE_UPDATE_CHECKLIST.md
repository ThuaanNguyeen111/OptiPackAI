# Mobile (Flutter) — Việc phải làm để nối Backend

> **Phiên bản 1.0 — 09/11/2026.** Dành cho người làm app mobile (Flutter, BM04 RF-07). Viết theo cùng khuôn `FE_UPDATE_CHECKLIST.md` (file đó là của web). Nguồn: đề xuất chức năng mobile theo role (08/11/2026, mục "📱 Nhật ký 08/11/2026" trong `CLAUDE.md`) và route thật trong `API_LIST.md`.

**Quy ước chung (giống web):**
- Mọi request cần đăng nhập gửi `Authorization: Bearer <access_token>`.
- Lỗi luôn có dạng `{ error_code, message, details }`: hiện `message` cho người dùng, rẽ nhánh xử lý theo `error_code`.
- Mọi nút đổi trạng thái gửi `expected_version` = `version` đọc lần gần nhất. Gặp `409 *_CONFLICT` thì tải lại dữ liệu rồi cho bấm lại, **không tự gửi lại**.
- Hiển thị: kích thước cm (tối đa 1 chữ số lẻ), khối lượng kg (tối đa 2 chữ số lẻ), kiểu số Việt Nam (`0,15 kg`, `125.000 đ`), giờ Việt Nam. Cùng quy tắc với web (`FE_UPDATE_CHECKLIST.md` mục 11).
- **Mã quét = mã ô kệ (`bin_code`) + `seller_sku`** đối chiếu với danh sách lấy hàng. Sàn không trả mã vạch sản phẩm, nên app không đòi quét mã vạch trên sản phẩm.

**Không đưa xuống mobile (để trên web):** cấu hình kho / khu / kệ, quản lý user, kết nối sàn, sửa catalog, cấu hình thuật toán đóng gói, xem 3D chi tiết, báo cáo và xuất file.

---

## 0. Việc mobile phải làm

Đợt = thứ tự đề xuất. Làm xong đợt nào thì thử ở khu sóng yếu nhất của kho và trên một máy Android cấu hình thấp rồi mới sang đợt sau.

| # | Việc | Mục | Đợt | Trạng thái |
|---|---|---|---|---|
| 1 | Đăng nhập, MFA, tự refresh token, đăng xuất, ẩn menu theo role | 1 | 1 | ☐ Chưa làm |
| 2 | Hàng đợi ngoại tuyến: lưu thao tác trên máy, mỗi thao tác 1 `client_event_id`, gửi lại khi có mạng, thanh trạng thái đồng bộ | 2 | 1 | ☐ Chưa làm |
| 3 | Xử lý lỗi: chỉ thử lại lỗi mạng / 408 / 429 / 5xx; lỗi nghiệp vụ thì dừng và giữ lại; 409 thì tải lại | 3 | 1 | ☐ Chưa làm |
| 4 | Warehouse Staff — "Việc của tôi": nhóm đơn được giao, Hỏa Tốc lên đầu, đếm ngược hạn | 4.1 | 1 | ☐ Chưa làm |
| 5 | Warehouse Staff — Lấy hàng: danh sách theo đường đi kho, quét ô + xác nhận SKU / số lượng, nhập tay, xác nhận lấy xong | 4.2 | 1 | ☐ Chưa làm |
| 6 | Warehouse Staff — Báo thiếu hàng | 4.3 | 1 | ☐ Chưa làm |
| 7 | Warehouse Staff — Nhập thêm / kiểm kê / chuyển ô (bắt buộc gửi `client_event_id`) | 4.4 | 1 | ☐ Chưa làm |
| 8 | Warehouse Staff — Nhận kiện hoàn, kiểm hàng hoàn | 4.5 | 2 | ☐ Chưa làm |
| 9 | Packaging Staff — Hàng đợi, xem kế hoạch (2D theo lớp), chấp nhận / từ chối | 5.1 | 2 | ☐ Chưa làm |
| 10 | Packaging Staff — Phiên đóng gói: quét món, niêm phong + nhập cân, báo lỗi kiện | 5.2 | 2 | ☐ Chưa làm |
| 11 | Thông báo: chuông + số chưa đọc (gọi khi mở app / quay lại app, chưa có push) | 6 | 2 | ☐ Chưa làm |
| 12 | Shipping Coordinator — Kiện đã đóng, tạo vận đơn, mở nhãn PDF, giao thành công / thất bại / giao lại | 7 | 4 | ☐ Chưa làm |
| 13 | Store Owner — Tổng quan, đánh dấu Hỏa Tốc, duyệt hàng hoàn, tra cứu đơn | 8 | 4 | ☐ Chưa làm |
| 14 | Hỗ trợ máy quét cầm tay / Bluetooth (nhận mã như bàn phím) bên cạnh camera | 4.2 | 1 | ☐ Chưa làm |

**Chờ BE làm trước (mobile chưa làm được, đừng tự chế):** push FCM (đợt 3), upload ảnh bằng chứng cho giao Hỏa Tốc / kiểm hàng hoàn / báo lỗi kiện (đợt 4), giới hạn gọi API theo user thay vì theo IP, `GET /app/version`. Xem mục 9.

---

## 1. Đăng nhập và phiên làm việc (dòng 1)

- `POST /auth/login` → `{ access_token, refresh_token, ... }`. Có thể trả `mfa_required` nếu tài khoản bật MFA: hiện ô nhập mã 6 số rồi gọi bước xác minh MFA như web (`INTEGRATION_GUIDE.md`).
- `POST /auth/refresh` body `{ refresh_token }` → cặp token mới. Access token sống 24 giờ, refresh token 30 ngày, **có xoay vòng**: refresh xong phải lưu cả refresh token mới, dùng lại token cũ sẽ bị thu hồi cả phiên.
- Chỉ cho **một** lần refresh chạy cùng lúc; các request khác chờ token mới (web đã làm đúng trong `fe/src/lib/api.ts`, xem để làm theo).
- Trước khi gửi hàng đợi ngoại tuyến thì refresh trước nếu token sắp hết hạn. Phải đăng nhập lại thì **không được xóa** hàng đợi.
- `POST /auth/logout` khi đăng xuất. Lưu token trong kho bảo mật của máy (Keystore / Keychain, ví dụ `flutter_secure_storage`), không lưu file thường.
- `GET /users/me` lấy tên + role. Ẩn menu theo role, nhưng **không dựa vào việc ẩn để bảo mật**: gặp 403 thì hiện "Bạn không có quyền thực hiện thao tác này".

## 2. Hàng đợi ngoại tuyến (dòng 2)

Mục đích: mất mạng ở cuối kho thì nhân viên vẫn quét tiếp được, có mạng lại thì app tự gửi.

- Mọi thao tác **ghi** khi quét được đưa vào hàng đợi lưu trên máy (SQLite / Hive), không giữ trong RAM.
- Mỗi thao tác sinh **1 `client_event_id`** (UUID) **lúc người dùng bấm**, gửi lại bao nhiêu lần vẫn giữ nguyên mã đó. BE dùng mã này để không ghi trùng: gửi lại cùng mã thì BE trả đúng kết quả lần trước, không trừ / cộng kho lần 2.
- Route **có** `client_event_id`: `pick-item`, quét món khi đóng gói (`parcels/:parcelNo/scan`), `restock`, `adjust`, `transfer`.
- Route **không có** `client_event_id` mà dùng `expected_version` (niêm phong, báo lỗi kiện, chấp nhận kế hoạch, vận đơn, hàng hoàn): **không đưa vào hàng đợi ngoại tuyến**. Chỉ cho bấm khi có mạng. Nếu gửi lại sau lỗi mạng mà nhận 409, coi là "có thể đã xong": tải lại để kiểm tra, không báo lỗi ngay.
- Gửi theo đúng thứ tự đã thao tác, từng cái một.
- Thanh trạng thái luôn hiện ở đầu màn hình: "Đã đồng bộ" / "Ngoại tuyến — 3 thao tác chờ gửi" / "1 thao tác lỗi, bấm để xem".
- Khi ngoại tuyến, hiện chú thích "số trên máy có thể cũ". Server là nguồn đúng cuối cùng; mở lại màn hình thì tải lại.

## 3. Xử lý lỗi và thử lại (dòng 3)

| Kết quả | App làm gì |
|---|---|
| Mất mạng, timeout, 408, 429, 5xx | Thử lại, chờ tăng dần (ví dụ 2 s → 4 s → 8 s…, tối đa vài phút) |
| 400, 404, 422 (lỗi nghiệp vụ) | **Dừng**, không thử lại. Giữ thao tác trong mục "Thao tác lỗi" kèm `message` thật của BE, không tự xóa |
| 401 | Refresh token một lần rồi gửi lại; refresh cũng lỗi thì về màn đăng nhập (giữ hàng đợi) |
| 403 | "Bạn không có quyền thực hiện thao tác này", không thử lại |
| 409 `*_CONFLICT` | Tải lại dữ liệu, báo "Nhóm này vừa được người khác cập nhật", không tự gửi lại |
| 409 `WH_CLIENT_EVENT_REUSED` | Mã thao tác bị dùng cho thao tác khác: tạo mã mới, cho người dùng bấm lại |
| 409 `ORD_GROUP_INSUFFICIENT_STOCK` | Ô không đủ hàng: gợi ý "Báo thiếu" (mục 4.3) |

Danh sách nhóm đơn và thông báo gọi `limit` 20–30, cuộn thêm bằng `before` (con trỏ `created_at` của dòng cuối trang trước).

## 4. Warehouse Staff (đợt 1, ưu tiên cao nhất)

### 4.1 Việc của tôi (dòng 4)

- `GET /order-groups?assigned_staff_id=<id của mình>&fulfillment_status=picking&limit=30` — nhóm đơn giao cho mình. Thêm `order_priority=express` nếu muốn tab riêng cho Hỏa Tốc.
- Hỏa Tốc xếp lên đầu, hiện đếm ngược từ `packagingDeadline` ("còn 45 phút"), đỏ khi `isOverdue`.
- Bấm vào nhóm → `GET /order-groups/:id` (đọc `version` để dùng cho các nút ghi).

### 4.2 Lấy hàng (dòng 5, 14)

- `GET /warehouse/:warehouseId/picking-list/:groupId` — danh sách món **đã sắp theo đường đi trong kho** (khu → ô), có `bin_code`. Mỗi dòng có `quantity` (số đặt) và `picked_quantity` (đã quét).
- Luồng mỗi món: quét mã ô (`bin_code`) → kiểm ô đúng với dòng đang lấy → xác nhận SKU + số lượng → `POST /order-groups/:id/fulfillment/pick-item` body `{ sku, scanned_quantity, scan_method: 'barcode' | 'manual', warehouse_id, client_event_id, bin_location_id? }`.
- Quét sai ô / SKU không thuộc nhóm: báo ngay trên máy, không gửi.
- Luôn có nút **Nhập tay** (`scan_method: 'manual'`) cho trường hợp tem rách, camera lỗi, ánh sáng yếu, và nút **Báo thiếu**.
- Nhận mã từ camera **và** từ máy quét cầm tay / Bluetooth (máy quét gõ mã như bàn phím: để 1 ô nhập luôn được focus).
- Lấy đủ mọi món → `POST /order-groups/:id/fulfillment/pick` body `{ expected_version }` (chỉ gửi khi có mạng). Còn món chưa quét đủ → 409 `ORD_GROUP_PICK_INCOMPLETE` kèm danh sách món thiếu: hiện danh sách đó.
- Rung + tiếng khi quét đúng / sai. Nút to ở nửa dưới màn hình, dùng được một tay.

### 4.3 Báo thiếu hàng (dòng 6)

- `POST /order-groups/:id/fulfillment/report-missing` — chọn món thiếu, chọn lý do có sẵn, gửi. Nhóm chuyển `partial_needs_review`; Store Owner và Packaging Staff nhận thông báo. Chi tiết body ở `API_LIST.md` mục 6.

### 4.4 Nhập thêm / kiểm kê / chuyển ô (dòng 7)

- `POST /warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock` · `.../adjust` · `.../transfer`.
- **Bắt buộc gửi `client_event_id`** (chuỗi ≤ 100 ký tự). Gửi lại cùng mã → BE trả đúng kết quả lần trước (200), không cộng / trừ lần 2.
- Luồng: quét mã ô → chọn SKU trên ô → nhập số → xác nhận lại ("Nhập thêm 12 cái vào ô A-03-02-01?") → gửi.
- Kiểm kê bắt nhập lý do. Chuyển ô quét cả ô nguồn và ô đích.

### 4.5 Nhận kiện hoàn, kiểm hàng hoàn (dòng 8)

- Kiện giao thất bại quay về: `POST /shipments/:id/receive-return`.
- Hàng khách trả: `POST /returns/:id/receive`, sau đó `POST /returns/:id/inspect` (kết quả restock / quarantine / discard).
- Chụp ảnh tình trạng hàng: **chờ BE có API upload ảnh** (mục 9). Trước khi có, chỉ ghi chú bằng chữ.

## 5. Packaging Staff (đợt 2)

### 5.1 Hàng đợi, xem và chấp nhận kế hoạch (dòng 9)

- `GET /order-groups?fulfillment_status=pending_approval` và `?fulfillment_status=approved_for_packing`.
- `GET /order-groups/:groupId/packing-plan` → `{ plan }`: thùng gợi ý, kích thước cm, khối lượng kg. Trên điện thoại vẽ **2D theo lớp** đơn giản; 3D để web hoặc tablet.
- `POST /order-groups/:groupId/packing-plan/approve` (chấp nhận và bắt đầu đóng) · `.../reject` (bắt chọn lý do). Body có `expected_version`.

### 5.2 Phiên đóng gói (dòng 10)

- Quét món vào kiện: `POST /order-groups/:groupId/packing-plan/parcels/:parcelNo/scan` body `{ code, quantity?, scan_method, client_event_id }` — không cần `expected_version`, được đưa vào hàng đợi ngoại tuyến.
- Gỡ món quét nhầm: `.../parcels/:parcelNo/unscan`.
- Niêm phong + nhập cân thực tế: `.../parcels/:parcelNo/seal` body `{ expected_version, weight_kg }`. Lệch cân thì kiện chuyển `held`, chờ người khác xem lại.
- Báo lỗi kiện (hỏng, thiếu, nhầm món): `.../report-issue`.
- Đủ chi tiết body và mã lỗi ở `API_LIST.md` mục 8a.

## 6. Thông báo (dòng 11)

- `GET /notifications/unread-count` khi mở app và khi quay lại app (không gọi liên tục ở nền, tốn pin).
- `GET /notifications?before=&limit=` danh sách; `PATCH /notifications/:id/read` đánh dấu đã đọc.
- Bấm thông báo mở thẳng màn liên quan (`related_entity_type` + `related_entity_id`).
- Push (FCM): **chờ BE** (mục 9). Khi có push thì bỏ việc gọi `unread-count` khi quay lại app.

## 7. Shipping Coordinator (đợt 4, dòng 12)

- Kiện đã đóng: `GET /order-groups?fulfillment_status=packed`.
- Tạo vận đơn: `POST /shipments`. Nhãn PDF: mở link nhãn để in bằng máy in Bluetooth hoặc gửi sang máy tính.
- Giao Hỏa Tốc: `POST /shipments/:id/deliver` · `/fail` (chọn lý do từ `GET /shipments/reason-codes`) · `/retry`. Vận đơn có shipper thì chỉ shipper đó (hoặc Admin) bấm được (403 `SHP_NOT_ASSIGNED_SHIPPER`).
- Ảnh bằng chứng giao hàng: **chờ BE** (mục 9).
- **Không gọi** các route cũ `/order-groups/:id/fulfillment/ship|deliver|return` (đã đánh dấu LEGACY).

## 8. Store Owner (đợt 4, dòng 13)

- Tổng quan: `GET /dashboard/summary` → 4–6 thẻ số to (đơn hôm nay, chờ xử lý, quá hạn, hàng hoàn), bấm thẻ mở danh sách đã lọc. Không vẽ biểu đồ nhiều lớp trên điện thoại.
- Đánh dấu Hỏa Tốc: `PATCH /order-groups/:id/priority`.
- Duyệt hàng hoàn: `GET /returns`, `POST /returns/:id/approve` · `/reject` (bắt lý do). Người tạo phiếu không tự duyệt được.
- Tra cứu đơn (chỉ đọc): `GET /orders`, `GET /orders/:id`.

## 9. Việc BE chưa có — mobile chờ, không tự chế

| Việc | Ảnh hưởng mobile | Trạng thái |
|---|---|---|
| Đăng ký thiết bị + push FCM trong `NotificationsService.notify()` | Báo đẩy cho mọi role, cảnh báo tồn vật liệu | ☐ BE chưa làm |
| Upload ảnh bằng chứng (giao Hỏa Tốc, kiểm hàng hoàn, báo lỗi kiện) | Các nút chụp ảnh ở mục 4.5, 5.2, 7 | ☐ BE chưa làm |
| Giới hạn gọi API theo user thay vì theo IP | Hiện 600 lần/phút **chung cho cả kho** (chung 1 IP): app đừng gọi dồn dập | ☐ BE chưa làm |
| `GET /app/version` (phiên bản app tối thiểu) | Bắt cập nhật app cũ; không cần khi chỉ demo trên máy nhóm | ☐ BE chưa làm |

Đã có, mobile dùng được ngay: refresh token trả trong body, phân quyền theo role, `client_event_id` cho `pick-item` / quét món đóng gói / `restock` / `adjust` / `transfer`, `expected_version` + 409, phân trang `before` + `limit` và lọc `assigned_staff_id`, báo thiếu hàng, đơn Hỏa Tốc, thông báo in-app có phân trang, dashboard.

---

**Nghiệm thu chung:**
- Tắt mạng, quét 5 món, bật mạng lại → 5 thao tác tự gửi, tồn kho trừ đúng 5 lần (không trùng).
- Gửi lại cùng một thao tác 2 lần (giả lập timeout) → tồn chỉ đổi 1 lần.
- 2 máy cùng sửa một nhóm → máy sau nhận 409, tự tải lại, không ghi đè.
- Token hết hạn giữa ca → app tự refresh, hàng đợi không mất.
- Chạy được trên máy Android cấu hình thấp và với máy quét Bluetooth.
