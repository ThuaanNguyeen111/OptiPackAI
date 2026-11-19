# Mobile (Flutter) — Việc phải làm để nối Backend

> **Phiên bản 1.3 — 15/11/2026** (1.0 — 09/11/2026; 1.1: BE đã có upload ảnh bằng chứng, mục 9; 1.2: BE đã có push FCM mục 9b và lọc vận đơn theo shipper mục 7; **1.3: cột Trạng thái ở bảng mục 0 đã đối chiếu lại với code trong `mobile/lib`, thêm mục 9h**). Dành cho người làm app mobile (Flutter, BM04 RF-07). Viết theo cùng khuôn `FE_UPDATE_CHECKLIST.md` (file đó là của web). Nguồn: đề xuất chức năng mobile theo role (08/11/2026, mục "📱 Nhật ký 08/11/2026" trong `CLAUDE.md`) và route thật trong `API_LIST.md`.

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
| 1 | Đăng nhập, MFA, tự refresh token, đăng xuất, ẩn menu theo role | 1 | 1 | ✅ Đã làm trong code (13/11) — đăng nhập, MFA, tự refresh, đăng xuất, kho bảo mật, tab theo vai trò (mục 9e); chưa thử trên máy thật |
| 2 | Hàng đợi ngoại tuyến: lưu thao tác trên máy, mỗi thao tác 1 `client_event_id`, gửi lại khi có mạng, thanh trạng thái đồng bộ | 2 | 🟡 **Làm một phần** — hàng đợi SQLite, `SyncController`, thanh trạng thái; **quét lấy hàng, quét món khi đóng gói, nhập thêm / kiểm kê tồn** vào hàng đợi khi mất mạng (15/11); **chưa**: ảnh bằng chứng, niêm phong kiện (cần cân + kiểm tra ngay); chuyển ô cố ý không xếp hàng đợi (phải tra ô đích) | 🟡 **Làm một phần** — có hàng đợi SQLite, `SyncController`, thanh trạng thái, thử lại; nhưng **chỉ lấy hàng (`pick-item`) vào hàng đợi**. Quét món đóng gói và nhập thêm / kiểm kê / chuyển ô gọi thẳng BE (có gửi `client_event_id`), mất mạng thì báo lỗi chứ không tự gửi lại |
| 3 | Xử lý lỗi: chỉ thử lại lỗi mạng / 408 / 429 / 5xx; lỗi nghiệp vụ thì dừng và giữ lại; 409 thì tải lại | 3 | 1 | ✅ Đã làm — chờ tăng dần, dừng khi lỗi nghiệp vụ, 409 tải lại; màn tải dữ liệu có "Thử lại" |
| 4 | Warehouse Staff — "Việc của tôi": nhóm đơn được giao, Hỏa Tốc lên đầu, đếm ngược hạn | 4.1 | 1 | ✅ Đã làm — "Việc của tôi", Hỏa Tốc lên đầu, đếm ngược hạn |
| 5 | Warehouse Staff — Lấy hàng: danh sách theo đường đi kho, quét ô + xác nhận SKU / số lượng, nhập tay, xác nhận lấy xong | 4.2 | 1 | ✅ Đã làm — danh sách theo đường đi kho, quét ô + SKU, nhập tay, xác nhận lấy xong (qua hàng đợi) |
| 6 | Warehouse Staff — Báo thiếu hàng | 4.3 | 1 | ✅ Đã làm — báo thiếu từ màn lấy hàng |
| 7 | Warehouse Staff — Nhập thêm / kiểm kê / chuyển ô (bắt buộc gửi `client_event_id`) | 4.4 | 1 | ✅ Đã làm — quét ô (`bins/by-code`), nhập thêm / kiểm kê / chuyển ô, có `client_event_id` (chưa vào hàng đợi, xem dòng 2) |
| 8 | Warehouse Staff — Nhận kiện hoàn, kiểm hàng hoàn | 4.5 | ✅ **Đã làm** (15/11) — hàng khách trả (`/returns/:id/receive` + `/inspect`, có ảnh) và nhận kiện giao thất bại (`POST /shipments/:id/receive-return`, tab "Kiện về kho") | 🟡 **Làm một phần** — hàng khách trả (`/returns/:id/receive` + `/inspect`, có ảnh) đã có; **nhận kiện giao thất bại quay về (`POST /shipments/:id/receive-return`) chưa có** |
| 9 | Packaging Staff — Hàng đợi, xem kế hoạch (2D theo lớp), chấp nhận / từ chối | 5.1 | 2 | ✅ Đã làm — hàng đợi, kế hoạch 2D theo lớp, chấp nhận / từ chối. Có thêm nút xem 3D bằng WebView (mục 9h, ngoài phạm vi ban đầu) |
| 10 | Packaging Staff — Phiên đóng gói: quét món, niêm phong + nhập cân, báo lỗi kiện | 5.2 | 2 | ✅ Đã làm — quét, gỡ quét, niêm phong + cân, báo lỗi kiện (mới có hướng xử lý "lấy món thay", chưa có "trả về lấy hàng"). 13/11: niêm phong gửi **ảnh niêm phong** (`photo_urls`, theo cài đặt `require_seal_photo`) |
| 11 | Thông báo: chuông + số chưa đọc + push FCM (đăng ký máy, mở đúng màn khi bấm) | 6, 9b | ✅ **Đã làm** (15/11) — chuông, số chưa đọc, danh sách, đánh dấu đã đọc, push FCM, tự làm mới số chưa đọc khi mở lại app | 🟡 **Gần xong** — chuông, số chưa đọc, danh sách, đánh dấu đã đọc, push FCM (mục 9b); **chưa làm mới số chưa đọc khi quay lại app từ nền** |
| 12 | Shipping Coordinator — Kiện đã đóng, tạo vận đơn, mở nhãn PDF, giao thành công / thất bại / giao lại | 7 | ✅ **Đã làm** (15/11) — hàng chờ, báo giá, tạo vận đơn, giao thành công / thất bại / giao lại, mở nhãn PDF (in qua gói `printing`) | 🟡 **Làm một phần** — hàng chờ, báo giá, tạo vận đơn, giao thành công / thất bại / giao lại, lý do thất bại đã có; **mở nhãn PDF chưa có** |
| 13 | Store Owner — Tổng quan, đánh dấu Hỏa Tốc, duyệt hàng hoàn, tra cứu đơn | 8 | ✅ **Đã làm** (15/11) — tổng quan, duyệt / từ chối hoàn, tra cứu đơn, chi tiết đơn, bật / tắt Hỏa Tốc (`PATCH /order-groups/:id/priority`) | 🟡 **Làm một phần** — tổng quan, duyệt / từ chối hoàn (màn Hoàn hàng), tìm đơn (danh sách) đã có; **chưa có đánh dấu Hỏa Tốc (`PATCH /order-groups/:id/priority`)** và **chưa có xem chi tiết đơn (`GET /orders/:id`)** |
| 14 | Hỗ trợ máy quét cầm tay / Bluetooth (nhận mã như bàn phím) bên cạnh camera | 4.2 | 🟡 **Làm một phần** — màn lấy hàng và phiên đóng gói đã có ô nhập luôn được focus cho máy quét; màn nhập kho cũng đã thêm (15/11); màn hoàn hàng chưa | ☐ **Chưa làm** — chỉ có camera và ô nhập tay, chưa có ô nhập luôn được focus cho máy quét cầm tay / Bluetooth |

**Đối chiếu code 15/11/2026:** 14 dòng trên đã so với `mobile/lib` (không chỉ đọc ghi chú). Việc ngoài bảng đã làm: đăng nhập Google (mục 9d), ảnh bằng chứng (9a), push (9b), quyền trang theo vai trò (9e), nối BE thật (9f), 3D bằng WebView (9h). **Còn thiếu so với tài liệu:** dòng 2 (đưa quét đóng gói và nhập kho vào hàng đợi, ảnh vào hàng đợi), 8 (nhận kiện hoàn), 11 (làm mới khi quay lại app), 12 (nhãn PDF), 13 (Hỏa Tốc, chi tiết đơn), 14 (máy quét Bluetooth), phân trang `before` (app đang tải một lần 50–100 dòng, tài liệu mục 3 dặn `limit` 20–30 + `before`), mục 9g (chờ BE của Thi).

**Chờ BE làm trước (mobile chưa làm được, đừng tự chế):** 🔄 11/11/2026: đăng nhập Google cho mobile **đã có** (mục 9d). Xem mục 9. 🔄 10/11/2026: upload ảnh bằng chứng **đã có** (mục 9a); push FCM **đã có** (mục 9b, cần project Firebase để chạy thật); `GET /app/version` **bỏ** (app không đưa lên store, demo chạy `flutter run` nên luôn là bản mới).

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
| 🆕 409 `ORD_GROUP_STOCK_RESERVED_BY_OTHER` (AOFP-327) | Hàng trên kệ đang giữ cho nhóm khác — **không** gợi ý "Báo thiếu" ngay; hiện thông điệp BE |

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
- Quét mã ô → `GET /warehouse/warehouses/:warehouseId/bins/by-code/:binCode` (🆕 09/11) trả ô + các SKU và tồn trên ô; 404 `WH_BIN_NOT_FOUND` = kho không có ô này.
- Luồng: quét mã ô → chọn SKU trên ô → nhập số → xác nhận lại ("Nhập thêm 12 cái vào ô A-03-02-01?") → gửi.
- Kiểm kê bắt nhập lý do. Chuyển ô quét cả ô nguồn và ô đích.

### 4.5 Nhận kiện hoàn, kiểm hàng hoàn (dòng 8)

- Kiện giao thất bại quay về: `POST /shipments/:id/receive-return`.
- Hàng khách trả: `POST /returns/:id/receive`, sau đó `POST /returns/:id/inspect` (kết quả restock / quarantine / discard).
- Chụp ảnh tình trạng hàng (không bắt buộc): gửi ảnh lên `POST /proof-photos` rồi gửi `photo_urls` kèm `POST /returns/:id/inspect` (mục 9a).

## 5. Packaging Staff (đợt 2)

### 5.1 Hàng đợi, xem và chấp nhận kế hoạch (dòng 9)

- `GET /order-groups?fulfillment_status=pending_approval` và `?fulfillment_status=approved_for_packing`.
- `GET /order-groups/:groupId/packing-plan` → `{ plan }`: thùng gợi ý, kích thước cm, khối lượng kg. Trên điện thoại vẽ **2D theo lớp** đơn giản; 3D để web hoặc tablet.
- `POST /order-groups/:groupId/packing-plan/approve` (chấp nhận và bắt đầu đóng) · `.../reject` (bắt chọn lý do). Body có `expected_version`.

### 5.2 Phiên đóng gói (dòng 10)

- Quét món vào kiện: `POST /order-groups/:groupId/packing-plan/parcels/:parcelNo/scan` body `{ code, quantity?, scan_method, client_event_id }` — không cần `expected_version`, được đưa vào hàng đợi ngoại tuyến.
- Gỡ món quét nhầm: `.../parcels/:parcelNo/unscan`.
- Niêm phong + nhập cân thực tế: `.../parcels/:parcelNo/seal` body `{ expected_version, weight_kg }`. Lệch cân thì kiện chuyển `held`, chờ người khác xem lại.
- Báo lỗi kiện (hỏng, thiếu, nhầm món): `.../report-issue`. Có thể kèm ảnh món lỗi (`photo_urls`, không bắt buộc, mục 9a).
- Đủ chi tiết body và mã lỗi ở `API_LIST.md` mục 8a.

## 6. Thông báo (dòng 11)

- `GET /notifications/unread-count` khi mở app và khi quay lại app (không gọi liên tục ở nền, tốn pin).
- `GET /notifications?before=&limit=` danh sách; `PATCH /notifications/:id/read` đánh dấu đã đọc.
- Bấm thông báo mở thẳng màn liên quan (`related_entity_type` + `related_entity_id`).
- Push (FCM): **BE đã có** (mục 9b). Có push rồi vẫn gọi `unread-count` khi mở app (push có thể đến trễ hoặc người dùng tắt quyền thông báo).

## 7. Shipping Coordinator (đợt 4, dòng 12)

- Kiện đã đóng: `GET /order-groups?fulfillment_status=packed`.
- 🆕 "Việc của tôi" của shipper: `GET /shipments?shipper_id=me&status=out_for_delivery&limit=20`; trang kế: thêm `before=<updatedAt của vận đơn cuối>` (BE xong 10/11/2026).
- Tạo vận đơn: `POST /shipments`. Nhãn PDF: mở link nhãn để in bằng máy in Bluetooth hoặc gửi sang máy tính.
- Giao Hỏa Tốc: `POST /shipments/:id/deliver` · `/fail` (chọn lý do từ `GET /shipments/reason-codes`) · `/retry`. Vận đơn có shipper thì chỉ shipper đó (hoặc Admin) bấm được (403 `SHP_NOT_ASSIGNED_SHIPPER`).
- Ảnh bằng chứng giao hàng (mục 9a): vận đơn **shop tự giao** (không có hãng, gồm Hỏa Tốc) bấm "Giao thành công" **bắt buộc chụp ≥ 1 ảnh** (thiếu → 400 `SHP_PROOF_PHOTO_REQUIRED`). Giao thất bại: bắt chọn lý do, ảnh không bắt buộc.
- **Không gọi** các route cũ `/order-groups/:id/fulfillment/ship|deliver|return` (đã đánh dấu LEGACY).

## 8. Store Owner (đợt 4, dòng 13)

- Tổng quan: `GET /dashboard/summary` → 4–6 thẻ số to (đơn hôm nay, chờ xử lý, quá hạn, hàng hoàn), bấm thẻ mở danh sách đã lọc. Không vẽ biểu đồ nhiều lớp trên điện thoại.
- Đánh dấu Hỏa Tốc: `PATCH /order-groups/:id/priority`.
- Duyệt hàng hoàn: `GET /returns`, `POST /returns/:id/approve` · `/reject` (bắt lý do). Người tạo phiếu không tự duyệt được.
- Tra cứu đơn (chỉ đọc): `GET /orders`, `GET /orders/:id`.

## 9. Việc BE chưa có — mobile chờ, không tự chế

| Việc | Ảnh hưởng mobile | Trạng thái |
|---|---|---|
| Đăng ký thiết bị + push FCM trong `NotificationsService.notify()` | Báo đẩy cho mọi role | ☑ BE xong 10/11/2026 (mục 9b) — chạy thật khi có project Firebase |
| Lọc vận đơn theo shipper | "Việc của tôi" của shipper (mục 7) | ☑ BE xong 10/11/2026 |
| Đăng nhập Google cho mobile (`POST /auth/google/mobile` nhận `id_token`) | Nút Google trên màn đăng nhập | ☑ BE xong 11/11/2026 (mục 9d) — cần OAuth client Android + SHA-1 |
| Upload ảnh bằng chứng (giao Hỏa Tốc, kiểm hàng hoàn, báo lỗi kiện) | Các nút chụp ảnh ở mục 4.5, 5.2, 7 | ☑ BE xong 10/11/2026 (mục 9a) |
| Giới hạn gọi API theo user thay vì theo IP | Mỗi người đăng nhập có 600 lần/phút riêng | ☑ BE xong 09/11/2026 |
| `GET /health` | App kiểm tra server sống / MongoDB, Redis lỗi (200 hoặc 503) | ☑ BE xong 09/11/2026 |
| Tìm đơn theo mã / tên người nhận | Bỏ tải 100 đơn rồi lọc trên máy: gọi `GET /orders?q=<chuỗi>` (mã đơn sàn / số đơn khớp từ đầu, tên người nhận chứa chuỗi, không phân biệt hoa thường; phải gõ đúng dấu tiếng Việt; dùng chung `before`/`limit`) | ☑ BE xong 16/11/2026 |
| Danh sách Hỏa Tốc ở Tổng quan lọc theo sàn + khoảng ngày | `GET /order-groups?order_priority=express&platform=<sàn>&from=<ISO>&to=<ISO>` — lọc theo ngày tạo nhóm, `from` tính cả mốc, `to` không tính (`platform` đã có từ trước) | ☑ BE xong 16/11/2026 |
| Ảnh phiếu NCC chống gian lận, nhập không đối chiếu, quét nhãn khi giao (handoff OCR bản 1.1, R1–R9) | Màn nhập kho có phiếu, giao thành công (mục 9g) | ☐ Thi đang làm (giao 14/11/2026) |
| `GET /app/version` (phiên bản app tối thiểu) | Bắt cập nhật app cũ; không cần khi chỉ demo trên máy nhóm | ✖ Bỏ 10/11/2026 (app không đưa lên store) |

### 9a. Ảnh bằng chứng (BE xong 10/11/2026)

🟡 **App đã nối 13/11/2026 (chưa thử trên máy thật):** `features/proof/` (`ProofPhotoField` chụp / chọn ≤ 3 ảnh, thu nhỏ 1600 px, JPG 80; `ProofPhotoRepository.upload` gọi `POST /proof-photos`), `ApiClient.upload` (multipart, gửi tối đa 60 giây). Đã gắn: giao thành công (shop tự giao bắt buộc ≥ 1 ảnh, nút xác nhận khoá tới khi có ảnh), giao thất bại, kiểm hàng hoàn, báo lỗi kiện (không bắt buộc). Ảnh tải lên lúc bấm xác nhận, **chưa** vào hàng đợi ngoại tuyến (bước 4 dưới chưa làm): mất mạng thì báo lỗi, người dùng bấm lại. Repository giao hàng / hoàn hàng / đóng gói vẫn là dữ liệu giả, nên `photo_urls` mới chỉ kiểm ở mock; riêng tải ảnh gọi BE thật.

1. Chụp ảnh (tối đa 3), **nén trước khi gửi** (VD cạnh dài ~1600 px, JPG chất lượng ~80) để gửi nhanh và đỡ tốn dung lượng. BE nhận JPG / PNG / WebP / HEIC, mỗi ảnh ≤ 10 MB.
2. `POST /proof-photos` (`multipart/form-data`, field `files`) → `{ photos: [{ url, ... }] }`.
3. Gửi `photo_urls: [url, ...]` kèm thao tác: `POST /shipments/:id/deliver` (shop tự giao: bắt buộc ≥ 1), `/shipments/:id/fail`, `POST /returns/:id/inspect`, `.../packing-plan/report-issue` (không bắt buộc).
4. Mất mạng: giữ ảnh trong hàng đợi ngoại tuyến cùng thao tác, có mạng thì gửi ảnh trước rồi mới gửi thao tác (các route này dùng `expected_version`, 409 → tải lại). Lỗi `PROOF_PHOTO_UPLOAD_FAILED` (502) → cho thử lại; `PROOF_PHOTO_NOT_CONFIGURED` (503) → server chưa cấu hình, báo Admin.
5. Xem lại ảnh: `GET /shipments/:id/events` (`photoUrls`), phiếu trả `inspectionPhotoUrls`, kế hoạch đóng gói `issues[].photoUrls`.

Chi tiết và mã lỗi: `API_LIST.md` mục 30. Link ảnh là link Cloudinary công khai (ngẫu nhiên, khó đoán), không hết hạn — hiện thẳng bằng `Image.network`.

### 9f. Các màn nối BE thật (13/11/2026)

🟡 **App đã nối, chưa chạy với BE thật trên máy:** mỗi tính năng có `api_*_repository.dart` (thông báo, tồn kho, hoàn hàng, đóng gói, giao hàng, tổng quan); `lib/app/mock_providers.dart` chọn bản thật làm mặc định, `--dart-define=USE_MOCK_DATA=true` hoặc `mockDataOverrides` (test) thì dùng bản giả. Ghi chú khi thử:
- Kho / hoàn hàng / đóng gói dùng kho đầu tiên đang hoạt động (`GET /warehouse/warehouses`), giống màn lấy hàng.
- Kiểm hàng hoàn: dòng "Nhập lại kho" phải nhập / quét **ô nhập lại**; thu hồi thùng phải nhập **mã thùng** (BE bắt buộc cả hai).
- Báo lỗi kiện gửi `resolution: replace` (lấy món thay trên kệ); chưa có lựa chọn "trả về lấy hàng".
- Giao hàng: đơn Hỏa Tốc chỉ có "Shop tự giao" (người tạo vận đơn là shipper); vận đơn GHN chỉ xem, trạng thái do hãng cập nhật.
- Tra cứu đơn của chủ shop lọc 100 đơn mới nhất trên máy (BE chưa có tìm kiếm theo chữ).
- Lỗi tải hiện câu của BE + nút "Thử lại" (mất mạng / không có quyền có biểu tượng riêng).

### 9g. Phiếu NCC khi nhập kho + quét nhãn khi giao (14/11/2026)

☐ **Chưa làm.** BE ảnh phiếu + AI đọc phiếu đã có (`API_LIST.md` mục 33, web làm ở `FE_UPDATE_CHECKLIST.md` mục 18); việc BE mới do **Thi** làm theo `STOCK_RECEIPT_OCR_HANDOFF.md` bản 1.1 (mã R ở cuối mỗi dòng). Làm theo đúng luật web mục 20, app chỉ khác cách chụp:

1. **Màn nhập kho có ảnh phiếu** (Warehouse Staff, tab Kho; hiện app chưa có): chọn ô / SKU → chụp 1–3 ảnh phiếu → `POST /proof-photos?purpose=receipt` → `POST /receipt-ocr` → nhân viên **tự đếm và nhập số** (nhập mù: không điền số từ phiếu, không hiện số trên phiếu trước khi nhập) → hiện Theo phiếu – Đã nhập – Lệch, lệch bắt lý do → lưu phiếu nhập (`document_photo_urls`, `ocr_scan_id`, `ocr_line_index`, `mismatch_reason`).
2. **Chỉ chụp bằng camera** ở màn nhập kho và giao thành công: `ProofPhotoField` thêm tuỳ chọn ẩn nút thư viện ảnh (`ImageSource.gallery`); các màn khác giữ nguyên. Gửi `source=camera` (R7).
3. Lỗi `RECEIPT_OCR_NOT_A_SLIP` → "Ảnh không giống phiếu giao hàng, chụp lại" (R1). Dòng không khớp → chọn dòng trên phiếu hoặc "Không có trên phiếu" + lý do (R2). `WH_RECEIPT_PHOTO_REUSED` → "Ảnh này đã dùng cho phiếu khác" (R6).
4. **Dự phòng:** quét lỗi ≥ 2 lần hoặc AI không khả dụng → nút "Nhập không đối chiếu" + lý do (BE tự điền khi AI hỏng) (R4). Mất mạng: không cho lưu phiếu nhập ngoại tuyến (phải có ảnh lên Cloudinary và đọc phiếu trước), báo "Cần có mạng để nhập kho có phiếu".
5. **Giao thành công (shop tự giao):** trước khi chụp ảnh, mở `ScannerScreen` có sẵn quét QR trên nhãn kiện → gửi `scanned_code` cùng `POST /shipments/:id/deliver`. Lỗi `SHIP_LABEL_SCAN_MISMATCH` → "Mã nhãn không phải kiện này". Nút "Nhãn hỏng, không quét được" + lý do (`scan_skipped_reason`) (R9).
6. Thông báo mới `stock_receipt_unchecked` ("Nhập hàng chưa đối chiếu phiếu") cho Store Owner: thêm nhãn vào danh sách loại thông báo (R4).

### 9e. Quyền trang theo vai trò (BE AOFP-283)

🟡 **App đã nối 13/11/2026:** `features/auth/role_permissions.dart` gọi `GET /role-permissions/me` sau khi đăng nhập; thanh tab chỉ hiện trang Admin bật cho vai trò (`picking` → Việc của tôi, `inventory` → Kho, `picking`/`inventory` → Hoàn hàng, `packing`, `shipping`, `dashboard` → Tổng quan, `returns` → Duyệt hoàn; tối đa 4 tab + Thông báo). Lỗi / mất mạng → dùng quyền mặc định của vai trò (bản sao `DEFAULT_ROLE_FEATURES`). Admin đổi quyền thì người dùng phải đăng nhập lại mới thấy tab mới. 403 vẫn hiện câu báo của BE.

### 9b. Push FCM (BE xong 10/11/2026)

🟡 **App đã nối 10/11/2026 tối (chưa build / chạy thử):** `lib/core/push/push_service.dart` (xin quyền, tạo kênh, gửi / gỡ token, hiện push khi app mở, bấm push → `/pick/:groupId` với loại lấy hàng, còn lại về `/`), `main.dart` (`Firebase.initializeApp`, handler chạy nền), `AuthController` (`start()` khi vào app / mở lại phiên, `stop()` trước khi đăng xuất), `ApiClient.delete`, Gradle (`com.google.gms.google-services` 4.4.2, desugaring), Manifest (`POST_NOTIFICATIONS`, kênh mặc định), `pubspec.yaml` (`firebase_core ^4.0.0`, `firebase_messaging ^16.0.0`, `flutter_local_notifications ^20.1.0`), `android/app/google-services.json` (project `optipack-f6d4a`). Việc còn lại: `flutter pub get`, `flutter test`, chạy trên máy thật và thử theo bước dưới.

1. Thêm `firebase_core` + `firebase_messaging`, đặt `google-services.json` (project Firebase của nhóm, package `vn.optipack.optipack_mobile`) vào `android/app/`. Web không dùng Firebase.
2. Tạo kênh thông báo Android id **`optipack_alerts`** (độ quan trọng cao) lúc mở app — BE gửi push vào kênh này.
3. Sau khi đăng nhập (và khi `onTokenRefresh`): `POST /notifications/devices` body `{ token, platform: 'android', app_version }` → `{ registered, push_enabled }`. Gọi trực tiếp, **không** đưa vào hàng đợi ngoại tuyến (mất mạng thì gửi lại lần mở app sau).
4. Đăng xuất: `DELETE /notifications/devices/<token>` trước khi xoá access token.
5. Bấm push: đọc `data.related_entity_type` + `data.related_entity_id` để mở đúng màn (như bấm thông báo trong chuông); có `data.notification_id` thì `PATCH /notifications/:id/read`. `data.type` để chọn icon/màu.
6. Loại có push (còn lại chỉ hiện trong chuông): `API_LIST.md` mục 31. Mới: `picking_assigned` (Warehouse Staff được giao lấy hàng một nhóm) → mở màn lấy hàng của nhóm đó.

### 9c. Thử push FCM (cho người test: Việt, Phượng, Thi)

**Khoá Firebase của BE dùng chung cả nhóm** (Thuận chốt 10/11/2026): Thuận gửi file khoá qua Zalo, mỗi người tự chạy BE + FE + mobile trên máy mình. App dùng `mobile/android/app/google-services.json` (đã có trong repo, project `optipack-f6d4a`).

**Cài khoá trên máy mình (1 lần, ~2 phút)**
1. `git pull` (lấy code push + `google-services.json`).
2. Tải file khoá Thuận gửi trên Zalo, **giữ nguyên tên** `optipack-f6d4a-firebase-adminsdk-fbsvc-bc48e12379.json`.
3. Tạo thư mục **`mobile/keys/`** trong repo rồi đặt file vào: `mobile/keys/optipack-f6d4a-firebase-adminsdk-fbsvc-bc48e12379.json`. Thư mục này đã nằm trong `.gitignore` → `git status` không hiện file, không lỡ commit.
4. Trong `be/.env` của mình thêm (hoặc sửa) đúng 1 dòng:
   ```
   FCM_SERVICE_ACCOUNT_FILE=../mobile/keys/optipack-f6d4a-firebase-adminsdk-fbsvc-bc48e12379.json
   ```
   `../` = đi ra khỏi `be/` sang `mobile/` — luôn chạy BE bằng `npm run start:dev` **trong `be/`**.
5. Khởi động lại BE (`Ctrl + C` → `npm run start:dev`).
6. Chạy app trên điện thoại thật — làm theo phần ngay dưới.

Không có file khoá thì BE vẫn chạy, thông báo vẫn hiện trong chuông; chỉ không gửi push (`push_enabled: false`). Không đưa file khoá vào commit / file zip nộp bài.

**Chạy app trên máy ảo Android (không cần điện thoại) — nhận push được**

Chỉ chạy được trên **máy ảo Android** (Android Emulator). `flutter run -d windows` / `-d chrome` **không** nhận push (Firebase Messaging của nhóm chỉ cấu hình cho Android).

1. Mở **Android Studio** → **Device Manager** → **+ (Create Virtual Device)** → chọn máy có biểu tượng **Play Store** ở cột Play Store (VD **Pixel 8**) → Next.
2. Chọn bản hệ điều hành có chữ **Google Play** (VD API 35 "Google Play"), bấm tải nếu chưa có → Next → Finish. Không chọn bản "AOSP" / không có Google (không nhận push).
3. Bấm ▶ để bật máy ảo. Đăng nhập tài khoản Google trong máy ảo **không bắt buộc**; push không đến thì đăng nhập rồi mở CH Play cho Google Play services tự cập nhật.
4. Ở thư mục `mobile/`: `flutter pub get` rồi **`flutter run`** (không cần `--dart-define`: mặc định app gọi `http://10.0.2.2:3000` = BE trên chính máy tính; không cần mở tường lửa). Nhiều máy thì thêm `-d emulator-5554` (xem `flutter devices`).
5. Làm tiếp bước 8 phần điện thoại thật (đăng nhập Warehouse Staff → Cho phép thông báo) rồi bảng **Các bước thử**. Push hiện ở thanh thông báo của máy ảo (kéo từ trên xuống).

**App sập ngay khi mở trên máy ảo (log `SIGSEGV` ở luồng `1.raster`, `Requested texture size ... exceeds maximum supported size of (0, 0)`):** máy ảo đang tắt GPU. Mở `~/.android/avd/<tên máy ảo>.avd/config.ini`, đặt `hw.gpu.enabled=yes` và `hw.gpu.mode=host`, rồi **Cold Boot** máy ảo (Device Manager → mũi tên cạnh máy → Cold Boot Now). Gặp tạm thì chạy `flutter run --no-enable-impeller`.

Giới hạn máy ảo: quét mã bằng camera chỉ là camera giả → dùng ô **nhập tay** mã ô / SKU; máy cần RAM ≥ 8 GB (máy ảo chiếm ~2–3 GB). Demo trước hội đồng nên dùng điện thoại thật.

**Chạy app trên điện thoại thật (Android)**

Cần: điện thoại Android có **CH Play / Google Play** (Huawei đời mới không có → không nhận push), máy tính đã cài Flutter + Android SDK (`flutter doctor` không báo lỗi mục Android), điện thoại và máy tính **chung một wifi**.

1. **Bật chế độ nhà phát triển trên điện thoại:** Cài đặt → Thông tin điện thoại → bấm **Số hiệu bản tạo (Build number)** 7 lần (Xiaomi: bấm **Phiên bản MIUI / HyperOS**; Samsung: Thông tin phần mềm → Số hiệu bản tạo) → nhập mã khoá máy.
2. **Bật gỡ lỗi:** Cài đặt → Hệ thống → **Tuỳ chọn nhà phát triển** → bật **Gỡ lỗi USB**. Xiaomi bật thêm **Cài đặt qua USB** và **Gỡ lỗi USB (cài đặt bảo mật)**.
3. **Kết nối máy — chọn 1:**
   - **Cáp USB (dễ nhất):** cắm cáp → điện thoại hỏi "Cho phép gỡ lỗi USB?" → tick "Luôn cho phép" → **Cho phép**.
   - **Không dây (Android 11+):** Tuỳ chọn nhà phát triển → **Gỡ lỗi không dây** → bật → **Ghép nối thiết bị bằng mã QR** → trong Android Studio: Device Manager → **Pair Devices Using Wi‑Fi** → quét mã QR hiện trên máy tính. Hoặc dùng mã 6 số: chạy `adb pair <IP:cổng ghép nối>` rồi `adb connect <IP:cổng>` (2 cổng khác nhau, xem trên màn Gỡ lỗi không dây).
4. **Kiểm tra máy đã nhận:** `flutter devices` → phải thấy tên điện thoại (không chỉ Windows / Chrome / Edge).
5. **Lấy IP máy chạy BE:** `ipconfig` → dòng **IPv4 Address** của card wifi (VD `192.168.1.10`). **Không** dùng `localhost` hay `10.0.2.2` (2 địa chỉ đó chỉ đúng với máy ảo).
6. **Mở cổng 3000 trên Windows** (1 lần, PowerShell **Run as administrator**):
   ```powershell
   New-NetFirewallRule -DisplayName "OptiPack BE 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
   ```
   Wifi phải đặt là **Private network** (Cài đặt → Mạng → wifi đang dùng → Private). Kiểm tra: mở trình duyệt **trên điện thoại** vào `http://192.168.1.10:3000/health` → thấy `"status":"ok"` là điện thoại gọi được BE.
7. **Chạy app:** ở thư mục `mobile/`:
   ```
   flutter pub get
   flutter run --dart-define=API_BASE_URL=http://192.168.1.10:3000
   ```
   Có nhiều máy thì thêm `-d <id máy>` (lấy ở `flutter devices`). Lần đầu build mất vài phút; app tự cài lên điện thoại (icon OptiPackAI).
8. **Đăng nhập:** tài khoản **Warehouse Staff** → "Vào trang làm việc" → điện thoại hỏi quyền thông báo → **Cho phép**. Terminal in `FCM token: …` (dùng ở bước thử 3). Lỡ bấm "Không cho phép": Cài đặt → Ứng dụng → OptiPackAI → Thông báo → bật.
9. **Máy Xiaomi / Oppo / Vivo / Realme:** Cài đặt → Ứng dụng → OptiPackAI → bật **Tự khởi chạy (Autostart)**, Tiết kiệm pin → **Không hạn chế**. Không bật thì push lúc app tắt có thể không đến.
10. Sửa code xong: trong terminal `flutter run` bấm `r` (tải lại nóng) hoặc `R` (khởi động lại); đổi Gradle / Manifest / `pubspec.yaml` thì dừng (`q`) và chạy lại bước 7.

**Các bước thử** (mỗi bước ghi Đạt / Không đạt vào sheet test)

| # | Thao tác | Kết quả đúng |
|---|---|---|
| 1 | Swagger (BE đang dùng) → `POST /notifications/devices` body `{ "token": "test-token-1234567890abcdef", "platform": "android" }` | `push_enabled: true` (máy BE đã có khoá) |
| 2 | Mở app trên **điện thoại thật** (có Google Play), đăng nhập **Warehouse Staff** → "Vào trang làm việc" | Điện thoại hỏi quyền thông báo → bấm **Cho phép**; terminal `flutter run` in `FCM token: …` |
| 3 | Firebase console → **Messaging → New campaign → Notifications** → nhập tiêu đề + nội dung → **Send test message** → dán token bước 2 → **Test** | Điện thoại hiện thông báo (thử cả lúc app mở và lúc app tắt) |
| 4 | Vuốt tắt app. Swagger đăng nhập **Admin** → `GET /order-groups/staff/search` lấy `staffId` → `POST /order-groups/{id}/assign` body `{ "staff_id": "<staffId>" }` (nhóm chưa giao cho người này) | Điện thoại hiện **"Bạn được giao lấy hàng một nhóm đơn"** |
| 5 | Bấm thông báo bước 4 | App mở màn **lấy hàng của đúng nhóm đó**; thông báo trong chuông chuyển đã đọc |
| 6 | Mở app, gán thêm 1 nhóm khác cho người đó (như bước 4) | Thông báo hiện ngay khi app đang mở |
| 7 | Gán lại **đúng người đang nhận** nhóm ở bước 4 | **Không** có thông báo mới |
| 8 | Đánh dấu Hỏa Tốc 1 nhóm (`PATCH /order-groups/{id}/priority`) rồi gán cho người đó | Tiêu đề "Đơn Hỏa Tốc: bạn được giao lấy hàng", có hạn đóng gói |
| 9 | Trên app bấm **Đăng xuất**, rồi gán 1 nhóm khác cho người đó | Điện thoại **không** nhận push (máy đã gỡ khỏi BE) |
| 10 | Loại chỉ trong app: làm 1 việc sinh `low_box_stock` hoặc `sync_failed` | Có trong chuông, **không** có push |

**Không nhận được push — kiểm tra theo thứ tự:** (1) bước 1 ra `push_enabled: false` → máy BE chưa có khoá / sai đường dẫn / chưa khởi động lại BE; (2) bước 3 không nhận → điện thoại chưa cho phép thông báo, không có Google Play, hoặc đang tiết kiệm pin (Xiaomi / Oppo: bật Tự khởi chạy); (3) bước 3 nhận mà bước 4 không → xem log BE dòng có `push` / `FCM` (`Không lấy được access token FCM` = khoá sai hoặc đã bị xoá); (4) app báo lỗi mạng → sai `API_BASE_URL` hoặc tường lửa máy BE.

### 9d. Đăng nhập Google trên app (BE xong 11/11/2026)

BE: `POST /auth/google/mobile` body `{ id_token }` → trả **cùng dạng `POST /auth/login`** (`access_token`, `refresh_token`, `must_change_password`, `role`); xử lý y như đăng nhập mật khẩu. Chỉ tài khoản **đã có** trong hệ thống (không tự đăng ký). Lỗi: `AUTH_GOOGLE_ACCOUNT_NOT_REGISTERED` → "Email chưa có tài khoản, liên hệ Admin"; `AUTH_GOOGLE_ID_TOKEN_INVALID` → "Đăng nhập Google thất bại, thử lại"; `AUTH_ACCOUNT_INACTIVE`, `AUTH_PASSWORD_DEADLINE_LOCKED` (403) giống đăng nhập thường. Đăng xuất: gửi thêm `push_token` (FCM token đang dùng) trong body `POST /auth/logout` → BE gỡ máy khỏi push (thay cho `DELETE /notifications/devices/:token`, dùng 1 trong 2).

**A. Google Cloud (Thuận làm 1 lần; mỗi bạn chạy `flutter run` gửi SHA-1 máy mình cho Thuận thêm vào):**
1. Mở [console.cloud.google.com](https://console.cloud.google.com) → chọn **đúng project đang chứa client Web** của BE (client có id = `GOOGLE_CLIENT_ID` trong `be/.env`).
2. Lấy SHA-1 khoá debug trên máy chạy `flutter run`: `cd mobile/android` rồi `.\gradlew signingReport` → dòng `SHA1:` ở mục `Variant: debug`. (Hoặc `keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android`.)
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → Application type **Android** → Package name `vn.optipack.optipack_mobile` → dán SHA-1 → Create. Mỗi máy (mỗi bạn chạy `flutter run`) có khoá debug riêng → tạo thêm 1 client Android cho mỗi SHA-1.
4. **OAuth consent screen**: nếu đang "Testing" thì thêm email Google của người test vào **Test users**.
5. BE **không** cần biến mới (id_token cấp cho client Web). `GOOGLE_EXTRA_AUDIENCES` để trống.

**B. App (Flutter) — nhóm mobile tự làm** (chi tiết từng bước + bảng thử: `FE_UPDATE_CHECKLIST.md` mục 16):
- [ ] `pubspec.yaml`: `google_sign_in: ^7.2.0`.
- [x] (app đã làm 13/11) Khởi tạo 1 lần: `await GoogleSignIn.instance.initialize(serverClientId: '<GOOGLE_CLIENT_ID của BE — client Web>')` (truyền qua `--dart-define=GOOGLE_SERVER_CLIENT_ID=...`, không ghi cứng secret — client id không phải secret).
- [x] (app đã làm 13/11) Bấm nút: `final user = await GoogleSignIn.instance.authenticate();` → `final idToken = user.authentication.idToken;` → `POST /auth/google/mobile { id_token }` → lưu token như đăng nhập thường (kể cả `must_change_password`).
- [x] (app đã làm 13/11) Bắt `GoogleSignInException` mã `canceled` → im lặng (người dùng tự đóng). Nếu vừa chọn tài khoản đã báo `canceled` → thường do **sai SHA-1 / package** ở bước A.3.
- [x] (app đã làm 13/11, gỡ push bằng DELETE) Đăng xuất: `GoogleSignIn.instance.signOut()` + gửi `push_token` trong `/auth/logout`.
- [x] (đã làm 13/11) Mở khoá nút "Tiếp tục với Google" ở `mobile/lib/features/auth/login_screen.dart`.

**Thử:** tài khoản Google trùng email 1 user đang hoạt động → vào đúng màn theo role; email lạ → báo chưa có tài khoản; Admin vô hiệu hoá user đó → `AUTH_ACCOUNT_INACTIVE`.

### 9h. Xem 3D và hướng dẫn đóng gói trong app (14/11/2026, ngoài phạm vi ban đầu)

🟡 **Đã làm, chưa commit.** Mục "Không đưa xuống mobile" ở đầu file ghi *xem 3D chi tiết* để trên web / tablet; đây là phần mở rộng, dùng lại đúng khung 3D của web thay vì viết lại. Cần **web chạy** (không chỉ BE).

- App: `features/packing/parcel_3d_screen.dart` — dưới mỗi kiện có hai nút **Xem 3D** và **Hướng dẫn**, mở WebView toàn màn hình; có nút chuyển qua lại, nút tải lại; tải lỗi thì hiện bản 2D theo lớp. Phiên đăng nhập đưa qua **fragment** của URL (`#t=…&r=…&a=…`), không lên máy chủ; thoát màn thì xoá localStorage và cache của WebView. `--dart-define=WEB_BASE_URL=<địa chỉ web>` (mặc định `http://10.0.2.2:5173` cho máy ảo; máy thật dùng IP LAN).
- Web (`fe/`): hai trang nhúng `/embed/packing/:groupId?parcel=N` (chỉ khung 3D) và `/embed/packing/:groupId/guide` (vật tư, các bước, so sánh thùng); `lib/embed-session.ts` nhận phiên (web không tự refresh trong chế độ này); `lib/rbac.ts` cho `/embed/packing/*` cùng quyền "Đóng gói"; `vite.config.ts` mở `host` và proxy `/api` sang BE để WebView gọi API **cùng origin** (không phải sửa CORS của BE).
- Cảnh 3D thêm bước **bọc xốp hơi** và **dán băng keo** cho phụ kiện, bày vật tư trên khu chuẩn bị, gối hơi lấp chỗ trống, tem dán lên nắp; 9 model `.glb` mới tự dựng bằng Blender ở `fe/public/models/materials/` (script `fe/blender/make_packing_materials.py`, nguồn ghi ở `fe/public/models/CREDITS.md`).
- Hạn chế: chỉ chạy khi máy ảo / điện thoại gọi được web; proxy `/api` của Vite chỉ có ở môi trường dev (triển khai thật cần web và BE cùng domain hoặc thêm origin vào `CORS_ORIGIN`); vật tư chỉ minh hoạ, không chiếm thể tích trong tính toán xếp hàng.

Đã có, mobile dùng được ngay: refresh token trả trong body, phân quyền theo role, `client_event_id` cho `pick-item` / quét món đóng gói / `restock` / `adjust` / `transfer`, `expected_version` + 409, phân trang `before` + `limit` và lọc `assigned_staff_id`, báo thiếu hàng, đơn Hỏa Tốc, thông báo in-app có phân trang, dashboard.

---

**Nghiệm thu chung:**
- Tắt mạng, quét 5 món, bật mạng lại → 5 thao tác tự gửi, tồn kho trừ đúng 5 lần (không trùng).
- Gửi lại cùng một thao tác 2 lần (giả lập timeout) → tồn chỉ đổi 1 lần.
- 2 máy cùng sửa một nhóm → máy sau nhận 409, tự tải lại, không ghi đè.
- Token hết hạn giữa ca → app tự refresh, hàng đợi không mất.
- Chạy được trên máy Android cấu hình thấp và với máy quét Bluetooth.

> 15/11/2026 bổ sung: báo lỗi khi đóng gói có lựa chọn "Trả cả nhóm về bước lấy hàng" (`resolution: back_to_picking`); thông báo phân trang 30/trang + "Xem thông báo cũ hơn" (`before`). Các danh sách khác (đơn, vận đơn, phiếu hoàn) giữ `limit` 50–100, chưa có nút tải thêm.
