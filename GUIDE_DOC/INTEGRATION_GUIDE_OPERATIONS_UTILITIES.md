# OptiPackAI — Hướng dẫn tích hợp: Tiện ích vận hành (Giao hàng · Trả hàng · Vật liệu đóng gói)

| Thông tin | Giá trị |
|---|---|
| Phiên bản | 1.1 (07/10/2026 — mục 3 và 4: id điều hướng của thông báo, nhập lại hàng cách ly vào ô mới) |
| Ngày | 27/09/2026 |
| Đối tượng | Frontend, QA, người trình diễn |
| Phụ thuộc | `INTEGRATION_GUIDE_SHIPPING.md` (G1, G3), `INTEGRATION_GUIDE_PACKAGING_MATERIALS.md` (G4), `INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md` (K5) |
| Tương thích ngược | Có. Mọi thay đổi là bổ sung trường tùy chọn hoặc route mới; request/response hiện có giữ nguyên |

Tài liệu mô tả 6 tiện ích bổ sung cho các luồng đã có:

| # | Tiện ích | Luồng liên quan |
|---|---|---|
| 1 | Khoảng cách tối thiểu giữa 2 lần giao, giờ hẹn giao lại | Giao hàng |
| 2 | Cảnh báo vận đơn quá hạn giao | Giao hàng |
| 3 | Thông báo cho Store Owner | Giao hàng, Trả hàng, Tồn kho |
| 4 | Xử lý hàng cách ly | Trả hàng |
| 5 | Đổi hàng | Trả hàng → Lấy hàng → Đóng gói → Giao hàng |
| 6 | Đóng gói: trừ vật liệu trong cùng giao dịch, khai vật liệu thực tế, kho vật liệu nội bộ | Đóng gói, Trả hàng |

---

## 1. Khoảng cách tối thiểu giữa 2 lần giao

### 1.1. Mục đích

Quy tắc "tối đa 2 lần giao rồi hoàn về kho" chỉ có ý nghĩa khi 2 lần giao cách nhau hợp lý. Trước đây có thể bấm *Giao thất bại → Giao lại → Giao thất bại* liên tiếp trong 1 phút để kết thúc đơn. Hệ thống nay ghi lại **thời điểm sớm nhất được giao lại** cho mỗi lần thất bại.

### 1.2. Quy tắc

| Tình huống khi bấm "Giao thất bại" | Thời điểm sớm nhất được giao lại |
|---|---|
| Không gửi `reschedule_at` | Thời điểm thất bại + `SHIPMENT_MIN_RETRY_GAP_MINUTES` (mặc định 120 phút) |
| Gửi `reschedule_at` (giờ khách hẹn) | Đúng giờ hẹn; phải ở tương lai |
| Lần thất bại thứ 2, hoặc khách từ chối nhận | Không áp dụng — hệ thống tự chuyển hoàn về kho |

Khi bấm "Giao lại" trước thời điểm cho phép, hệ thống từ chối, **trừ khi** người thao tác nêu lý do giao sớm (`override_reason`). Lý do được ghi vào lịch sử vận đơn.

### 1.3. API

**Giao thất bại** — `POST /shipments/:id/fail`
```json
{
  "expected_version": 0,
  "reason_code": "customer_rescheduled",
  "note": "Khách hẹn giao sau 17h",
  "reschedule_at": "2026-09-27T17:00:00+07:00"
}
```
Response có thêm `nextAttemptNotBefore`.

**Giao lại** — `POST /shipments/:id/retry`
```json
{ "expected_version": 1 }
{ "expected_version": 1, "override_reason": "Khách gọi lại, đang có nhà" }
```

| Mã lỗi | HTTP | Nguyên nhân | Xử lý trên FE |
|---|---|---|---|
| `SHP_RETRY_TOO_EARLY` | 409 | Chưa tới `nextAttemptNotBefore`, không có `override_reason` | Hiện giờ được phép giao lại; mở hộp thoại nhập lý do nếu cần giao sớm |
| `SHP_INVALID_RESCHEDULE` | 400 | `reschedule_at` ở quá khứ | Kiểm tra ô chọn giờ |

### 1.4. Giao diện

- Form "Giao thất bại": khi chọn lý do *Khách hẹn giao lại*, hiện thêm ô chọn ngày giờ.
- Nút "Giao lại": vô hiệu hóa kèm đếm ngược tới `nextAttemptNotBefore`; có liên kết "Giao sớm (cần lý do)".

---

## 2. Cảnh báo vận đơn quá hạn giao

### 2.1. Quy tắc

- Khi bắt đầu giao, hệ thống tính **hạn giao** `dueAt` = thời điểm bắt đầu + `SHIPMENT_DUE_BUSINESS_HOURS` giờ làm việc (mặc định 40 giờ, tương đương 5 ngày làm việc; tính theo cùng lịch giờ làm việc của đơn hỏa tốc).
- Tác vụ định kỳ chạy **15 phút/lần**: vận đơn đang giao hoặc đang chờ giao lại mà quá `dueAt` được gắn `isOverdue: true` và gửi thông báo mức *critical* cho Store Owner. Mỗi vận đơn chỉ được gắn cờ và thông báo một lần.

### 2.2. API

| Method | Route | Role | Mô tả |
|---|---|---|---|
| GET | `/shipments?overdue=true` | Admin, Coordinator, Store Owner, Warehouse | Danh sách vận đơn quá hạn |
| POST | `/shipments/overdue-scan` | Admin | Chạy quét ngay (cùng logic tác vụ định kỳ) → `{ "flagged": 2 }` |

Response vận đơn có `dueAt`, `isOverdue`.

### 2.3. Giao diện

- Danh sách vận đơn: nhãn đỏ **"Quá hạn"** khi `isOverdue: true`; bộ lọc "Chỉ quá hạn".
- Chi tiết vận đơn: hiển thị hạn giao và thời gian còn lại.

---

## 3. Thông báo cho Store Owner

Dùng hệ thống thông báo hiện có (`GET /notifications`, `GET /notifications/unread-count`). Không có route mới.

| Loại (`type`) | Mức độ | Thời điểm phát sinh |
|---|---|---|
| `delivery_failed` | warning | Giao thất bại, còn lượt giao lại |
| `delivery_returning` | critical | Hệ thống tự chuyển vận đơn hoàn về kho |
| `delivery_overdue` | critical | Vận đơn quá hạn giao |
| `return_requested` | warning | Có yêu cầu trả hàng / đổi hàng mới |
| `stock_shortage` | warning | Nhóm đơn thiếu hàng ngay khi giữ chỗ (K5) |

Việc gửi thông báo không ảnh hưởng thao tác chính: nếu gửi lỗi, thao tác vẫn hoàn tất và lỗi được ghi log.

**Giao diện:** bổ sung biểu tượng và màu theo `type`; khi bấm thông báo, điều hướng tới vận đơn / phiếu trả hàng / nhóm đơn tương ứng (`related_entity_type`, `related_entity_id`).

🔄 **07/10/2026:** `related_entity_id` luôn là id (ObjectId) hoặc `null`. Thông báo `sync_failed` mang id của shop đã kết nối (trước là mã shop Lazada). Thông báo đích danh tạo trước ngày này chỉ hiện lại cho người nhận sau khi chạy `scripts/migrate-objectid-fields.ts --apply` (xem `INTEGRATION_GUIDE_WAREHOUSE.md` PHẦN B6).

---

## 4. Xử lý hàng cách ly

### 4.1. Bối cảnh

Khi kiểm hàng hoàn, dòng hàng nghi lỗi được xếp `quarantine`: không cộng vào tồn bán, nằm chờ kiểm lại. Tiện ích này bổ sung danh sách tập trung và thao tác xử lý.

### 4.2. API

**Danh sách** — `GET /returns/quarantine` (Admin, Store Owner, Warehouse Staff). 🔄 (09/10/2026) Đọc tối đa **200 phiếu cũ nhất** mỗi lần (trước đây không giới hạn); cũ nhất trước.
```json
[
  { "returnId": "66f7...", "rmaCode": "RMA-260927-4B1D22", "lineIndex": 1,
    "sellerSku": "ATD-M-01", "quantity": 1, "note": "Nghi lỗi chỉ may", "since": "2026-09-27T09:12:00Z" }
]
```

**Xử lý** — `POST /returns/:id/quarantine/:lineIndex/resolve`
```json
{ "action": "restock", "warehouse_id": "66e1...", "bin_location_id": "66e9...", "note": "Kiểm lại, hàng đạt" }
{ "action": "discard", "note": "Lỗi đường may, không bán được" }
```

| `action` | Kết quả |
|---|---|
| `restock` | Cộng vào ô đã chọn, ghi sổ cái `return_restock` (K3); tuân theo SKU nội bộ nếu đã nối (K4b). Ô chưa có dòng tồn của SKU → tạo dòng mới mang đúng `masterSku` / `sellerSku` (🔄 sửa 07/10/2026) |
| `discard` | Ghi nhận loại bỏ, không cộng tồn |

| Mã lỗi | HTTP | Nguyên nhân |
|---|---|---|
| `RMA_QUARANTINE_LINE_NOT_FOUND` | 404 | Dòng không tồn tại hoặc không phải hàng cách ly |
| `RMA_QUARANTINE_ALREADY_RESOLVED` | 409 | Dòng đã được xử lý |
| `RMA_BIN_REQUIRED` | 400 | `restock` thiếu kho hoặc ô |

**Giao diện:** màn hình "Hàng cách ly" gồm bảng danh sách, mỗi dòng có 2 nút *Nhập lại kho* (mở hộp chọn ô) và *Loại bỏ*.

---

## 5. Đổi hàng

### 5.1. Luồng

```
[Admin — giả lập khách] Tạo yêu cầu ĐỔI HÀNG (hàng trả + hàng đổi sang)
        │
[Store Owner] Duyệt ─────────────── (Từ chối → kết thúc)
        │
[Warehouse] Nhận hàng trả → Kiểm hàng
        │
Hệ thống TỰ TẠO đơn thay thế EXC-<mã phiếu> + nhóm đơn thay thế
        │
Nhóm đơn thay thế đi lại luồng chuẩn: giữ chỗ tồn (K5) → lấy hàng → gợi ý & duyệt đóng gói → giao hàng
```

### 5.2. Tạo yêu cầu

`POST /returns` (Admin)
```json
{
  "order_group_id": "66f0...",
  "type": "exchange",
  "items":          [ { "seller_sku": "ATD-L-01", "quantity": 1, "reason_code": "size_not_fit" } ],
  "exchange_items": [ { "seller_sku": "ATD-M-01", "quantity": 1 } ],
  "customer_note": "Áo rộng, xin đổi size M"
}
```
- `items`: hàng khách gửi trả. `exchange_items`: hàng giao sang cho khách.
- Hàng đổi sang phải có trong danh mục sản phẩm đã đồng bộ của shop.
- Các quy tắc của trả hàng vẫn áp dụng: nhóm đơn đã giao, trong 15 ngày, không vượt số đã mua, người tạo không tự duyệt. 🔄 (09/10/2026) "Không vượt số đã mua" giờ tính **số còn được trả** = đã mua − đã khai ở các phiếu trước (trừ phiếu `rejected`/`canceled`).
- 🆕 (09/10/2026) Phiếu đã duyệt mà khách không gửi hàng về: Store Owner/Admin hủy bằng `POST /returns/:id/cancel` `{ expected_version, note }` (`note` bắt buộc) → `canceled`, nhóm đơn mở lại được phiếu mới.

### 5.3. Tạo đơn thay thế

- Sau khi kiểm hàng xong, hệ thống tự tạo đơn thay thế. Phiếu trả về `replacementStatus: "created"` cùng `replacementGroupId`.
- Nếu bước tạo tự động lỗi, phiếu vẫn đóng với `replacementStatus: "failed"` và `replacementError`; Store Owner hoặc Admin bấm tạo lại: `POST /returns/:id/create-replacement` (🔄 09/10: sửa role — trước ghi chỉ Admin).
- Đơn thay thế có mã `EXC-<mã phiếu>`, giá trị 0, dùng lại thông tin người nhận của đơn gốc. Mã này không tồn tại trên Lazada nên không bị đồng bộ ghi đè; khóa gộp riêng đảm bảo **không bị gộp** với đơn Lazada khác của cùng khách.
- Nhóm đơn thay thế có `origin: "replacement"` và `sourceReturnId`.

| Mã lỗi | HTTP | Nguyên nhân |
|---|---|---|
| `RMA_EXCHANGE_ITEMS_REQUIRED` | 400 | Phiếu đổi hàng thiếu `exchange_items` |
| `RMA_INVALID_EXCHANGE_ITEMS` | 400 | Hàng đổi sang không có trong danh mục của shop |
| `RMA_NOT_EXCHANGE` | 409 | Tạo đơn thay thế cho phiếu không phải đổi hàng hoặc chưa kiểm hàng xong |
| `RMA_REPLACEMENT_EXISTS` | 409 | Phiếu đã có đơn thay thế |

**Giao diện:** form yêu cầu trả hàng thêm lựa chọn *Đổi hàng* với bảng "Hàng đổi sang"; danh sách nhóm đơn hiển thị nhãn **"Đơn đổi hàng"** khi `origin = replacement`, liên kết về phiếu gốc.

---

## 6. Đóng gói và vật liệu

> 🔄 **ĐÃ ĐỔI (sửa tài liệu 09/10/2026)** — mục 6.1–6.2 bản cũ mô tả `POST /order-groups/:id/fulfillment/pack` kèm `materials_used`. Route này **đã gỡ khi gộp 04/10/2026** (gọi → 404). Luồng hiện hành bên dưới; chi tiết: `INTEGRATION_GUIDE_PACKING.md`.

### 6.1. Trừ thùng + vật tư theo từng kiện lúc niêm phong

Đóng gói theo **kế hoạch đóng gói** (`/order-groups/:groupId/packing-plan`):

- **Có quét** (khuyến nghị): `POST .../packing-plan/start` → `POST .../parcels/:parcelNo/scan` từng món → `POST .../parcels/:parcelNo/seal` `{ expected_version, weight_kg }`. Mỗi lần `seal` trừ 1 thùng + vật tư chèn + túi zip **của kiện đó** trong cùng giao dịch với việc niêm phong.
- **Lối tắt** (không quét): `POST .../packing-plan/pack` `{ expected_version, parcels: [{ parcel_no, weight_kg }] }` — trừ cho mọi kiện chưa niêm phong.

Thùng không đủ → 409 `PKG_BOX_OUT_OF_STOCK` (không niêm phong). Vật tư chèn / túi zip thiếu → **không chặn**, ghi `materialsShortfall` trên kiện và báo Admin + Store Owner. Thùng tái sử dụng (`qtyReused`) được ưu tiên; kiện có hàng dễ vỡ chỉ lấy thùng mới (trừ khi cài đặt `allow_reused_box_for_fragile = true`).

### 6.2. Dùng thùng khác gợi ý

Không còn khai `materials_used`. Đổi thùng trước khi duyệt: `POST .../parcels/:parcelNo/change-box`; đang đóng: `POST .../parcels/:parcelNo/change-box-in-session` (khai thùng cũ `unused` hoặc `damaged` — `damaged` ghi hao hụt). Thùng mới phải qua kiểm tra xếp vừa.

### 6.3. Kho vật liệu nội bộ

| Hạng khi kiểm hàng hoàn | Kết quả |
|---|---|
| A | Vào `qtyReused` — dùng lại để giao hàng |
| B | Vào `qtyInternal` — chỉ dùng nội bộ (đựng hàng, chia khu) |
| C | Ghi nhận loại bỏ/tái chế |

Xuất dùng nội bộ — `POST /packaging-materials/:code/internal-use` (Admin, Warehouse)
```json
{ "quantity": 5, "purpose": "Làm thùng chia hàng khu KA" }
```
Vượt tồn → `409 PKG_INSUFFICIENT_INTERNAL`. Thuật toán đóng gói không bao giờ lấy vật liệu từ `qtyInternal`.

`GET /packaging-materials/savings` bổ sung `unitsInternalUsed`, `unitsDiscarded`. Tiết kiệm khi giao hàng (hạng A) và tái dùng nội bộ (hạng B) được thống kê tách riêng.

---

## 7. Tác động tới dữ liệu và luồng hiện có

| Hạng mục | Tác động | Xử lý |
|---|---|---|
| Dữ liệu cũ | Vận đơn cũ không có `dueAt`, `nextAttemptNotBefore` | Coi như không giới hạn; không gắn cờ quá hạn, không chặn giao lại |
| Vật liệu cũ | Không có `qtyInternal` | Mặc định 0 |
| Đơn và nhóm đơn cũ | Không có `origin` | Mặc định `marketplace` |
| Request hiện có | Không thay đổi | Các trường mới đều tùy chọn |
| Response hiện có | Chỉ bổ sung trường | FE hiện tại không bị ảnh hưởng |
| Luồng không bị ảnh hưởng | Đồng bộ đơn, gộp đơn, gợi ý đóng gói | — |

Không có migration mới.

## 8. Cấu hình

| Biến môi trường | Mặc định | Ý nghĩa | Giá trị gợi ý khi trình diễn |
|---|---|---|---|
| `SHIPMENT_MIN_RETRY_GAP_MINUTES` | 120 | Khoảng cách tối thiểu giữa 2 lần giao (phút) | 1 |
| `SHIPMENT_DUE_BUSINESS_HOURS` | 40 | Hạn giao (giờ làm việc) | 0 (quá hạn ngay, dùng kèm `POST /shipments/overdue-scan`) |

## 9. Hạn chế hiện tại và hướng khắc phục

| Hạn chế | Ảnh hưởng | Hướng khắc phục |
|---|---|---|
| Đơn thay thế không có vận đơn thu hồi tận nhà khách | Coi như khách tự gửi hàng về | Bổ sung vận đơn chiều ngược khi mở rộng giao hàng |
| Chênh lệch giá khi đổi sang sản phẩm khác không được tính | Hệ thống chỉ quản lý hàng | Thuộc phạm vi sàn/thanh toán |
| Hạn giao dùng chung một giá trị cho mọi khu vực | Nội thành và ngoại tỉnh cùng hạn | Cấu hình theo khu vực |
| Thông báo chỉ gửi Store Owner | Coordinator phải tự theo dõi | Cho phép cấu hình người nhận theo loại |
| Tồn vật liệu tính chung toàn shop | Phù hợp mô hình 1 kho | Tách theo kho khi mở rộng |
