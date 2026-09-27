# OptiPackAI Backend — Integration Guide: Giao hàng & Trả hàng (Shipping & Returns)

**Phiên bản v1.1 — 27/09/2026 (G1 + G3; v1.1: G4 — kiểm vật liệu đóng gói khi kiểm hàng hoàn, phiếu hoàn lấy số đã quét thật).** Tài liệu RIÊNG cho luồng sau khi đóng gói: giao hàng do shop tự giao, tracking dạng dòng thời gian, giao thất bại / giao lại / hoàn về kho, và trả hàng – hoàn tiền (giả lập). Đọc kèm `INTEGRATION_GUIDE_WAREHOUSE.md` (phần sổ cái kho K3 — hàng trả được nhập lại qua đó).

**Phạm vi bản gọn (đã chốt):** mọi bước là **bấm nút đổi trạng thái**. Tracking = lịch sử các lần bấm (ai, lúc nào, lý do). **Chưa có:** bản đồ/GPS, ảnh bằng chứng giao hàng, chuyến giao nhiều điểm, role shipper riêng, đổi hàng — xem Phần E.

Quy ước: 🆕 mới · 🔄 route cũ đổi hành vi · ⏳ chưa có.

---

# PHẦN A — BỨC TRANH TỔNG

```
[Packaging Staff] Đóng gói xong ──► nhóm đơn "packed"
                                         │
[Coordinator] Bắt đầu giao ─────────────►│ tạo VẬN ĐƠN, nhóm đơn -> "shipped"
                                         ▼
                                  out_for_delivery ──[Giao thành công]──► delivered ✅ (nhóm đơn -> delivered)
                                         │                                    │
                              [Giao thất bại + lý do]                          │ (trong 15 ngày)
                                         ▼                                    ▼
                                  delivery_failed ──[Giao lại]──► out_for_delivery      PHIẾU TRẢ HÀNG (giả lập)
                                         │                                    requested → approved → về kho → kiểm → closed
                  lần 2 / khách từ chối: HỆ THỐNG TỰ CHUYỂN
                                         ▼
                              returning_to_warehouse
                                         │
[Warehouse] Nhận hàng hoàn ──────────────► returned_to_warehouse ✅ (nhóm đơn -> returned)
                                         │
                          HỆ THỐNG TỰ TẠO PHIẾU HOÀN (đã nhận) ──► [Warehouse] Kiểm hàng ──► closed
                                                                     đạt -> nhập lại ô (sổ cái)
```

**Ai bấm gì (bản gọn):**

| Vai trò | Nút |
|---|---|
| Shipping Coordinator | Bắt đầu giao · Giao thành công · Giao thất bại · Giao lại |
| Warehouse Staff | Nhận hàng hoàn (vận đơn) · Nhận hàng trả (phiếu) · Kiểm hàng |
| Admin (đóng vai khách) | Tạo yêu cầu trả hàng |
| Store Owner | Duyệt / Từ chối yêu cầu trả hàng |
| **Hệ thống tự làm** | Chuyển hoàn về sau lần thất bại thứ 2 hoặc khi khách từ chối; tạo phiếu hoàn khi kiện về kho; đổi trạng thái nhóm đơn |

Admin gọi được mọi nút (để test).

---

# PHẦN B — GIAO HÀNG (G1) 🆕

## B.1. Trạng thái vận đơn

| `status` | Nghĩa | Nút FE hiện |
|---|---|---|
| `out_for_delivery` | Đang đi giao (lần `attemptCount`) | Giao thành công · Giao thất bại |
| `delivery_failed` | Giao thất bại, chờ giao lại | Giao lại |
| `returning_to_warehouse` | Đang mang về kho | (Warehouse) Nhận hàng hoàn |
| `delivered` | ✅ Kết thúc — đã giao | — |
| `returned_to_warehouse` | ✅ Kết thúc — kho đã nhận lại | — |

**FE chỉ cần nhìn `status` để quyết định hiện nút nào.** Không có nút "hoàn về kho" cho Coordinator — hệ thống tự làm.

## B.2. Bắt đầu giao

Danh sách nhóm đơn chờ giao: dùng route sẵn có `GET /order-groups?fulfillment_status=packed`.

```
POST /shipments
Body: { "order_group_id": "66f0...", "note": "Giao buổi chiều" }
→ 201:
{
  "id": "66f5...", "shipmentCode": "SHP-260927-8F3A1C", "orderGroupId": "66f0...",
  "status": "out_for_delivery", "attemptCount": 1, "maxAttempts": 2,
  "lastFailureReason": null, "deliveredAt": null, "returnedAt": null,
  "version": 0, "createdAt": "...", "updatedAt": "..."
}
```

| Tình huống | Kết quả |
|---|---|
| Nhóm đơn chưa `packed` | `409 SHP_GROUP_NOT_READY` |
| Nhóm đơn đã có vận đơn (2 người bấm cùng lúc cũng vậy) | `409 SHP_ALREADY_EXISTS` kèm `details.shipmentId` |
| Nhóm đơn đã `shipped` TRƯỚC khi có G1 (chưa có vận đơn) | ✅ Tạo bù vận đơn, **không** đổi trạng thái nhóm đơn. Lịch sử ghi `legacy_backfill` |

Tìm vận đơn của 1 nhóm đơn: `GET /shipments?order_group_id=66f0...`.

## B.3. Các nút trên vận đơn

Mọi nút gửi `expected_version` = trường `version` đọc được lần gần nhất (chống 2 người bấm đè nhau). Sai version → `409 SHP_STATE_CONFLICT` → FE tải lại.

```
POST /shipments/:id/deliver         { "expected_version": 0, "note": "Nhận tại bảo vệ" }
POST /shipments/:id/fail            { "expected_version": 0, "reason_code": "customer_unreachable", "note": "..." }
POST /shipments/:id/retry           { "expected_version": 1 }
POST /shipments/:id/receive-return  { "expected_version": 2 }     ← Warehouse Staff
```

**Lý do thất bại** — lấy danh sách cho dropdown: `GET /shipments/reason-codes`

| `reason_code` | Nhãn | Hệ thống làm gì |
|---|---|---|
| `customer_unreachable` | Không liên lạc được khách | Lần 1 → chờ giao lại; lần 2 → tự hoàn |
| `customer_rescheduled` | Khách hẹn giao lại | như trên |
| `wrong_address` | Sai / không tìm thấy địa chỉ | như trên |
| `area_inaccessible` | Không vào được khu vực | như trên |
| `customer_refused` | **Khách từ chối nhận** | **Hoàn về NGAY**, không giao lại |
| `other` | Lý do khác | như lần 1/2; **bắt buộc `note`** (thiếu → `400 SHP_NOTE_REQUIRED`) |

**Ví dụ đầy đủ — thất bại 2 lần:**
```
1. POST /shipments                       → out_for_delivery, attemptCount 1, version 0
2. POST /shipments/:id/fail  (v0, customer_unreachable)  → delivery_failed, version 1
3. POST /shipments/:id/retry (v1)        → out_for_delivery, attemptCount 2, version 2
4. POST /shipments/:id/fail  (v2, wrong_address)         → returning_to_warehouse (TỰ ĐỘNG), version 3
5. [Warehouse] POST /shipments/:id/receive-return (v3)   → returned_to_warehouse
      + nhóm đơn -> returned
      + hệ thống tự tạo PHIẾU HOÀN trạng thái "received" (xem Phần C) để kho kiểm hàng
```

| Bấm sai thứ tự (VD "Giao lại" khi đang đi giao; "Nhận hàng hoàn" khi chưa hoàn) | `409 SHP_INVALID_TRANSITION` |
|---|---|

## B.4. Tracking — dòng thời gian

```
GET /shipments/:id/events      (cũ → mới)
→ [
  { "eventType": "start_delivery",  "statusFrom": null, "statusTo": "out_for_delivery", "attemptNo": 1, "actorId": "coord-1", "note": "Giao buổi chiều", "occurredAt": "10:30" },
  { "eventType": "delivery_failed", "statusFrom": "out_for_delivery", "statusTo": "delivery_failed", "attemptNo": 1,
    "reasonCode": "customer_unreachable", "reasonLabel": "Không liên lạc được khách", "occurredAt": "14:10" },
  { "eventType": "retry", ..., "attemptNo": 2, "occurredAt": "16:45" },
  { "eventType": "delivery_failed", ..., "reasonCode": "wrong_address" },
  { "eventType": "auto_return", "actorId": "system", "note": "Đã giao 2/2 lần không thành công — tự động hoàn về kho" },
  { "eventType": "return_received", "actorId": "wh-1", ... }
]
```

- `actorId: "system"` = hệ thống tự làm → FE hiện nhãn "Hệ thống".
- Lịch sử **chỉ được thêm, không sửa/xóa** — dùng làm bằng chứng khi tranh chấp.
- Mỗi sự kiện có sẵn chỗ để sau này gắn tọa độ GPS và ảnh (Phần E) mà không đổi cấu trúc.

## B.5. Danh sách & chi tiết

```
GET /shipments?status=delivery_failed&page=1&limit=20
GET /shipments/:id
```
Quyền xem: Admin, Shipping Coordinator, Store Owner, Warehouse Staff.

---

# PHẦN C — TRẢ HÀNG / HOÀN HÀNG (G3) 🆕

## C.1. 3 loại phiếu

| `type` | Ai tạo | Có hàng về kho? | Luồng |
|---|---|---|---|
| `failed_delivery` | **Hệ thống tự tạo** khi kho nhận lại kiện giao thất bại | Có (đã về) | `received` → kiểm hàng → `closed` |
| `return_refund` | Admin đóng vai khách | Có | `requested` → duyệt → `awaiting_receipt` → nhận → `received` → kiểm → `closed` |
| `refund_only` | Admin đóng vai khách | **Không** | `requested` → duyệt → `closed` luôn |

Từ chối ở bước `requested` → `rejected` (kết thúc). Hệ thống **chỉ quản lý hàng**; tiền hoàn do sàn xử lý.

## C.2. Tạo yêu cầu trả hàng (giả lập khách)

```
POST /returns                                   (Admin)
Body:
{
  "order_group_id": "66f0...",
  "type": "return_refund",                      // hoặc "refund_only"
  "items": [ { "seller_sku": "ATD-M-01", "quantity": 1, "reason_code": "defective" } ],
  "customer_note": "Áo bị lỗi đường may"
}
→ 201: { "id": "...", "rmaCode": "RMA-260927-4B1D22", "status": "requested", "version": 0, "items": [...], ... }
```

Lý do trả: `GET /returns/reason-codes` → `defective, wrong_item, not_as_described, size_not_fit, changed_mind, other`.

| Tình huống | Lỗi |
|---|---|
| Nhóm đơn chưa `delivered` | `409 RMA_ORDER_NOT_DELIVERED` |
| Quá 15 ngày kể từ lúc giao | `409 RMA_WINDOW_EXPIRED` |
| SKU không thuộc nhóm đơn / khai trùng / trả nhiều hơn đã mua | `400 RMA_INVALID_ITEMS` |
| Nhóm đơn đang có phiếu chưa xử lý xong | `409 RMA_OPEN_EXISTS` |

## C.3. Duyệt / từ chối (Store Owner)

```
POST /returns/:id/approve   { "expected_version": 0, "note": "Đồng ý" }
POST /returns/:id/reject    { "expected_version": 0, "note": "Hàng đã qua sử dụng" }   // note BẮT BUỘC
```
- **Người tạo phiếu không được tự duyệt** → `403 RMA_SELF_APPROVAL`. Khi demo: tạo bằng tài khoản Admin, duyệt bằng tài khoản Store Owner.
- `refund_only` duyệt xong → `closed` ngay; `return_refund` → `awaiting_receipt`.

## C.4. Kho nhận hàng trả

```
POST /returns/:id/receive   { "expected_version": 1 }        (Warehouse Staff)
```
Trả **toàn bộ** hàng của nhóm đơn → nhóm đơn chuyển `returned`. Trả 1 phần → nhóm đơn giữ `delivered`.

## C.5. Kiểm hàng — bước quan trọng nhất

```
POST /returns/:id/inspect                               (Warehouse Staff)
Body:
{
  "expected_version": 2,
  "lines": [
    { "seller_sku": "ATD-M-01", "quantity": 1, "result": "restock",
      "warehouse_id": "66e1...", "bin_location_id": "66e9..." },
    { "seller_sku": "ATD-M-01", "quantity": 1, "result": "quarantine", "note": "Nghi lỗi chỉ" }
  ]
}
→ 200: { ..., "status": "closed", "inspection": [...] }
```

| `result` | Ý nghĩa | Tồn kho |
|---|---|---|
| `restock` | Đạt, bán lại được | **Cộng vào ô đã chọn**, ghi sổ cái loại `return_restock` (liên kết phiếu) — xem được ở `GET .../sku-bin-assignments/:id/movements` |
| `quarantine` | Nghi lỗi, cần xem thêm | Không cộng tồn bán — chỉ ghi nhận trên phiếu |
| `discard` | Hỏng hẳn | Không cộng tồn |

| Quy tắc | Lỗi |
|---|---|
| Tổng các dòng của **mỗi SKU phải bằng đúng số lượng trả** (không để "mất" hàng) | `400 RMA_INSPECTION_MISMATCH` |
| Dòng `restock` phải có `warehouse_id` + `bin_location_id` | `400 RMA_BIN_REQUIRED` |
| Ô không thuộc kho / ô đã tắt | `WH_BIN_NOT_IN_WAREHOUSE` / `WH_BIN_INACTIVE` |

Tất cả dòng + đóng phiếu chạy trong **1 transaction**: lỗi 1 dòng thì không dòng nào được nhập kho.

🆕 **G4 — kiểm luôn thùng/xốp đi kèm:** body `inspect` nhận thêm mảng tùy chọn `packaging` (hạng A/B/C, số lần đã dùng, đã gỡ nhãn cũ chưa). Hạng A hợp lệ → vào kho vật liệu tái sử dụng, cùng transaction với phiếu. Kết quả trả trong `packagingInspection`. Chi tiết: `INTEGRATION_GUIDE_PACKAGING_MATERIALS.md` Phần D.

**Gợi ý FE:** form kiểm hàng cho mỗi SKU hiện ô "số lượng còn phải kiểm", chỉ bật nút Lưu khi tất cả về 0; dòng "Nhập lại" có dropdown ô — lấy từ `GET /warehouse/warehouses/:id/bin-suggestions` (K2).

---

# PHẦN D — TÁC ĐỘNG TỚI LUỒNG ĐÃ CÓ 🔄

## D.1. 3 route cũ vẫn chạy — nhưng nay đi qua vận đơn

`POST /order-groups/:id/fulfillment/ship | deliver | return` **giữ nguyên đường dẫn, body `{ expected_version }` (version của NHÓM ĐƠN), quyền và response**. FE đang dùng không gãy. Khác biệt:

| Route cũ | Nay làm gì |
|---|---|
| `ship` | Tạo vận đơn `out_for_delivery` + nhóm đơn → `shipped` |
| `deliver` | Vận đơn → `delivered` + nhóm đơn → `delivered`. Nếu vận đơn đang `delivery_failed` → `409 SHP_INVALID_TRANSITION` (phải "Giao lại" trước) |
| `return` (nhóm đơn `shipped`) | Vận đơn → `returned_to_warehouse` + nhóm đơn → `returned` + **tự tạo phiếu hoàn** để kiểm hàng |
| `return` (nhóm đơn `delivered`) | Giữ hành vi cũ: nhóm đơn → `returned`, chỉ ghi lịch sử vận đơn — **KHÔNG tạo phiếu trả, KHÔNG kiểm hàng**. Khuyến nghị FE chuyển sang `POST /returns` |

Swagger đánh dấu 3 route này `deprecated`. FE mới nên dùng `/shipments/*` và `/returns/*`.

## D.2. Dữ liệu cũ

- Nhóm đơn đã `shipped` trước G1 không có vận đơn → vận đơn được **tạo bù tự động** khi bấm bất kỳ nút nào (route mới hoặc cũ). Không cần script.
- Nhóm đơn đã `delivered`/`returned` trước G1: không có vận đơn, không ảnh hưởng.

## D.3. Không bị ảnh hưởng

Đồng bộ đơn, gộp đơn, lấy hàng, gợi ý/duyệt đóng gói, `pack`, thông báo.

---

# PHẦN E — ĐIỂM CÒN YẾU / CHƯA LÀM (nói thẳng)

| # | Điểm | Hệ quả | Kế hoạch |
|---|---|---|---|
| 1 | Chưa có bản đồ/GPS, ảnh bằng chứng | Tracking chỉ là dòng thời gian bấm nút; "đã giao" dựa vào lời Coordinator | Mở rộng sau — events đã có chỗ gắn vị trí/ảnh |
| 2 | Chưa có role shipper — Coordinator bấm hộ | Không biết chính xác ai cầm kiện | Quyết định role khi làm phần mở rộng |
| 3 | Không có khoảng cách tối thiểu giữa 2 lần giao | Có thể bấm thất bại → giao lại → thất bại liên tục trong 1 phút để hoàn hàng | Thêm "không giao lại trước X giờ / trước giờ khách hẹn" |
| 4 | Chưa có thông báo (chuông) cho giao thất bại / hoàn về / yêu cầu trả hàng | Store Owner phải tự vào xem | Dùng lại hệ thống thông báo sẵn có |
| 5 | Chưa có hạn giao 3–5 ngày + cảnh báo trễ | Đơn đi giao lâu không ai biết | Cron cảnh báo, tái dùng mẫu SLA sẵn có |
| 6 | **Chưa có đổi hàng** | Chỉ trả hàng/hoàn tiền | Sau: phiếu đổi = thu hồi + sinh nhóm đơn thay thế đi lại luồng lấy hàng |
| 7 | Chưa có đi lấy hàng trả tại nhà khách (vận đơn chiều ngược) | Coi như khách tự gửi về | Mở rộng cùng phần 1 |
| 8 | Hàng `quarantine` chỉ ghi trên phiếu | Chưa có màn hình "hàng cách ly chờ xử lý", chưa có nút xử lý tiếp | Khu `RETURN-QC` + thao tác xử lý hàng cách ly |
| 9 | ~~Phiếu `failed_delivery` lấy hàng theo số lượng đặt~~ ✅ **Đã sửa ở G4**: lấy theo số đã quét thật (sổ cái K3); nhóm đơn lấy hàng trước K3 mới dùng số đặt | Nếu lúc lấy hàng bị thiếu, phiếu có thể ghi nhiều hơn số thật về kho → kho kiểm sẽ không khớp | Lấy theo số lượng thực đã quét (sổ cái `pick` của K3) |
| 10 | Route cũ `return` cho nhóm đơn đã giao không tạo phiếu | Hàng về kho mà không kiểm, không nhập lại | FE chuyển sang `/returns`; có thể chặn route cũ trường hợp này sau |
| 11 | Hạn 15 ngày tính từ `deliveredAt` của vận đơn; nhóm đơn giao trước G1 dùng thời điểm cập nhật cuối của nhóm đơn | Có thể lệch với ngày giao thật của đơn cũ | Chấp nhận cho dữ liệu cũ |
| 12 | ~~Chưa tái sử dụng vật liệu đóng gói~~ ✅ **Đã có ở G4** | — | Xem guide vật liệu |

---

# PHẦN F — THAM CHIẾU NHANH

## F.1. Route

| Method | Route | Role |
|---|---|---|
| GET | `/shipments/reason-codes` | Admin, Coordinator, Store Owner, Warehouse |
| GET | `/shipments` · `/shipments/:id` · `/shipments/:id/events` | Admin, Coordinator, Store Owner, Warehouse |
| POST | `/shipments` | Coordinator, Admin |
| POST | `/shipments/:id/deliver` · `/fail` · `/retry` | Coordinator, Admin |
| POST | `/shipments/:id/receive-return` | Warehouse, Admin |
| POST | `/order-groups/:id/fulfillment/ship` · `/deliver` | Coordinator, Admin (🔄 lỗi thời) |
| POST | `/order-groups/:id/fulfillment/return` | Coordinator, Warehouse, Admin (🔄 lỗi thời) |
| GET | `/returns/reason-codes` · `/returns` · `/returns/:id` | Admin, Store Owner, Warehouse, Coordinator |
| POST | `/returns` | Admin (đóng vai khách) |
| POST | `/returns/:id/approve` · `/reject` | Store Owner, Admin |
| POST | `/returns/:id/receive` · `/inspect` | Warehouse, Admin |

## F.2. Mã lỗi

| Mã | HTTP | Khi nào |
|---|---|---|
| `SHP_NOT_FOUND` / `SHP_INVALID_ID` | 404/400 | Vận đơn không tồn tại / id sai |
| `SHP_GROUP_NOT_READY` | 409 | Bắt đầu giao khi nhóm đơn chưa `packed` |
| `SHP_ALREADY_EXISTS` | 409 | Nhóm đơn đã có vận đơn |
| `SHP_INVALID_TRANSITION` | 409 | Bấm nút sai thứ tự |
| `SHP_STATE_CONFLICT` | 409 | Sai version — tải lại |
| `SHP_NOTE_REQUIRED` | 400 | Lý do `other` không ghi chú |
| `RMA_NOT_FOUND` / `RMA_INVALID_ID` | 404/400 | Phiếu không tồn tại / id sai |
| `RMA_ORDER_NOT_DELIVERED` | 409 | Nhóm đơn chưa giao |
| `RMA_WINDOW_EXPIRED` | 409 | Quá 15 ngày |
| `RMA_INVALID_ITEMS` | 400 | SKU lạ / trùng / vượt số đã mua |
| `RMA_OPEN_EXISTS` | 409 | Đang có phiếu chưa xong |
| `RMA_SELF_APPROVAL` | 403 | Người tạo tự duyệt |
| `RMA_NOTE_REQUIRED` | 400 | Từ chối không ghi lý do |
| `RMA_INVALID_STATUS` | 409 | Bấm nút sai bước |
| `RMA_STATE_CONFLICT` | 409 | Sai version |
| `RMA_INSPECTION_MISMATCH` | 400 | Tổng kiểm hàng ≠ số trả |
| `RMA_BIN_REQUIRED` | 400 | Nhập lại kho chưa chọn ô |

## F.3. Checklist test cho FE

- [ ] Nhóm đơn `packed` → Bắt đầu giao → vận đơn `out_for_delivery`, nhóm đơn `shipped`
- [ ] Bắt đầu giao lần 2 cùng nhóm đơn → `SHP_ALREADY_EXISTS`
- [ ] Thất bại lần 1 → `delivery_failed`; Giao lại → `attemptCount: 2`; thất bại lần 2 → tự `returning_to_warehouse`, timeline có dòng "Hệ thống"
- [ ] Khách từ chối ngay lần 1 → tự `returning_to_warehouse`
- [ ] Warehouse nhận hàng hoàn → nhóm đơn `returned` + xuất hiện 1 phiếu `failed_delivery` trạng thái `received`
- [ ] Kiểm phiếu đó: 1 dòng `restock` chọn ô → mở sổ cái của SKU trên ô thấy dòng `return_restock`
- [ ] Bấm 2 máy cùng lúc cùng 1 nút → 1 thành công, 1 `SHP_STATE_CONFLICT`
- [ ] Nhóm đơn đã giao → Admin tạo trả hàng → Admin tự duyệt bị `RMA_SELF_APPROVAL` → Store Owner duyệt → kho nhận → kiểm → `closed`
- [ ] `refund_only` → duyệt là `closed` ngay, tồn kho không đổi
- [ ] Kiểm hàng thiếu số lượng → `RMA_INSPECTION_MISMATCH`
- [ ] Route cũ `fulfillment/ship|deliver|return` vẫn trả response nhóm đơn như trước
