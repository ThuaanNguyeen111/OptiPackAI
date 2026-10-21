# OptiPackAI Backend — Integration Guide: Giao hàng & Trả hàng (Shipping & Returns)

> **18/10/2026 — Tiến độ nhóm đơn khi khách trả đủ hàng:** Admin tạo phiếu → `returning` (Đang hoàn); Store duyệt → `returned` (Đã hoàn hàng); kho kiểm và xử lý tồn xong → `canceled` (Đã hủy). Xem **C.0** để nối FE; trạng thái phiếu và trạng thái hãng vận chuyển vẫn có ý nghĩa riêng.

**Phiên bản v1.4 — 14/10/2026 (chiều)** (C4–C6: giao qua GHN thật — Phần B.8; F.1/F.2/F.3 bổ sung). **v1.3 — 14/10/2026** (thêm Phần B.7: báo giá theo kiện, chọn hãng, giao chung chuyến, lịch lấy hàng, in phiếu/nhãn/manifest — các route của module `shipping`/`documents` gộp từ thi_dev 04/10 trước đây chỉ có ở `API_LIST.md`; bổ sung bảng route F.1, mã lỗi F.2, checklist F.3; Phần E thêm hạn chế 14–16 về GHN). **v1.2 — 07/10/2026** (sửa lỗi nhập lại hàng hoàn vào ô chưa có dòng tồn — mục C.5; ghi nhận hạn chế phiếu hoàn có thể mang SKU của sàn khác — Phần E mục 13). **v1.1 — 27/09/2026 (G1 + G3; v1.1: G4 — kiểm vật liệu đóng gói khi kiểm hàng hoàn, phiếu hoàn lấy số đã quét thật).** Tài liệu RIÊNG cho luồng sau khi đóng gói: giao hàng do shop tự giao, tracking dạng dòng thời gian, giao thất bại / giao lại / hoàn về kho, và trả hàng – hoàn tiền (giả lập). Đọc kèm `INTEGRATION_GUIDE_WAREHOUSE.md` (phần sổ cái kho K3 — hàng trả được nhập lại qua đó).

**Phạm vi bản gọn (đã chốt):** mọi bước là **bấm nút đổi trạng thái**. Tracking = lịch sử các lần bấm (ai, lúc nào, lý do). **Chưa có:** bản đồ/GPS, ảnh bằng chứng giao hàng, chuyến giao nhiều điểm, role shipper riêng, đổi hàng — xem Phần E.

Quy ước: 🆕 mới · 🔄 route cũ đổi hành vi · ⏳ chưa có.

> 📌 **Cập nhật 27/09/2026:** các tiện ích vận hành (khoảng cách giao lại, quá hạn giao, thông báo, hàng cách ly, đổi hàng, vật liệu thực tế, kho vật liệu nội bộ) được mô tả tại **`INTEGRATION_GUIDE_OPERATIONS_UTILITIES.md`**. Kịch bản trình diễn toàn hệ thống: **`DEMO_PLAYBOOK.md`**.

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

🔄 (09/10/2026) Query được validate: `status` (enum trạng thái vận đơn), `order_group_id` (ObjectId), `overdue` (`true`/`false`), `trip_code`, `carrier_code`, `page` ≥ 1, `limit` 1–100 (mặc định 20). Sai → 400 `VALIDATION_ERROR` (trước đây id sai định dạng lọt thành 500).

---

## B.6. 🆕 Gom đơn, liên kết và giao chung chuyến (13/10/2026)

### B.6.1. Hệ thống tự gom thế nào

| Mã | Gồm | Dùng để |
|---|---|---|
| `consolidation_key` | sàn + SĐT + dòng địa chỉ + thành phố (**không có tên**) | Gom đơn vào **cùng 1 nhóm** (cùng sàn, cùng shop, nhóm còn mở: `awaiting_packaging`/`picking`) |
| `recipient_key` | tên + SĐT + dòng địa chỉ + thành phố (**không có sàn**) | **Liên kết** các nhóm khác nhau → Picking List gộp, "Đi cùng: N kiện", giao chung chuyến |

Chuẩn hoá trước khi so: bỏ dấu (kể cả **Đ/đ → d**, từ 13/10/2026), chữ thường, gộp khoảng trắng; SĐT `+84`/`84`/`0` quy về một dạng. **Mỗi đơn luôn đóng kiện riêng** (kế hoạch đóng gói: mỗi kiện thuộc đúng 1 đơn) — gom chỉ để xử lý và giao cùng lúc.

| # | Tình huống | Chung nhóm | Liên kết |
|---|---|---|---|
| 1 | Cùng sàn + shop, cùng tên/SĐT/địa chỉ, nhóm đầu còn mở | ✅ | (đã chung nhóm) |
| 2 | Như #1, nhóm đầu đã lấy hàng/đóng gói | ❌ nhóm mới | ✅ |
| 3 | Cùng SĐT + địa chỉ, khác tên, nhóm còn mở | ✅ | — |
| 4 | Như #3, nhóm đầu đã đóng | ❌ | ❌ |
| 5 | Cùng tên + SĐT, khác địa chỉ (hoặc khác phường) | ❌ | ❌ |
| 6 | Cùng tên + địa chỉ, khác SĐT | ❌ | ❌ |
| 7 | Cùng sàn, khác shop | ❌ | ✅ |
| 8 | Khác sàn, thông tin ghi y hệt | ❌ | ✅ |
| 9 | Địa chỉ khác cách viết ("3/2" và "3-2", "P.5" và "Phường 5") | ❌ | ❌ (cố ý — thà bỏ sót còn hơn gộp nhầm) |
| 10 | Khác dấu, hoa/thường, khoảng trắng, đầu số SĐT | ✅ | ✅ |
| 11 | Đơn kia đã giao/huỷ/hoàn | ❌ | ❌ |
| 12 | Đơn đã thuộc nhóm, lần đồng bộ sau thấy trùng | giữ nhóm cũ | — |
| 13 | **Lazada** — dữ liệu bị che (`V**h`, `8**5`) | gom theo dữ liệu đã che (có thể gộp nhầm 2 người — hạn chế đã biết) | — |
| 14 | **Lazada + AURELLE** cùng người thật | ❌ | ❌ tự động — dùng **liên kết tay** (B.6.2) |
| 15 | AURELLE: cùng khách, 1 đơn chọn địa chỉ "trước sáp nhập" | ❌ | ❌ (tên tỉnh/phường khác) |

Bảng trên được kiểm bằng test `be/src/modules/storefront/aurelle-consolidation-cases.spec.ts` (đi đúng đường dữ liệu thật của đơn AURELLE).

### B.6.2. Liên kết tay (Shipping Coordinator)

Dùng khi Coordinator biết 2 nhóm là cùng người nhận nhưng hệ thống không tự nhận ra (chủ yếu đơn Lazada bị che dữ liệu + đơn AURELLE).

**Bước 1 — Liên kết**

```http
POST /order-groups/66f0a1b2c3d4e5f678901234/link
Authorization: Bearer <token Coordinator/Admin>
Content-Type: application/json

{ "target_group_id": "66f0a1b2c3d4e5f678905678", "note": "Cùng khách — đã gọi xác nhận" }
```

Trả `{ "linkedGroups": OrderGroupResponse[] }` — các nhóm đang liên kết với nhóm trên URL. Nhóm đã nằm trong 1 bộ liên kết tay → nhóm mới nối vào đúng bộ đó; 2 bộ khác nhau → gộp thành 1 bộ.

**Bước 2 — Hiển thị.** Mọi response nhóm đơn có thêm:

```json
"manualLink": { "linkId": "6710…", "linkedBy": "<userId>", "linkedAt": "2026-10-13T00:40:00.000Z", "note": "Cùng khách — đã gọi xác nhận" }
```

`null` = không có liên kết tay. `linkedGroupCount` và `GET /order-groups/:id/linked` nay tính **cả** liên kết tự động lẫn liên kết tay. Gợi ý: hiện nhãn "Đi cùng: N kiện" kèm biểu tượng "liên kết tay" khi `manualLink != null`.

**Bước 3 — Giao chung chuyến:** `POST /shipments/batch` với các nhóm đã `packed` — chấp nhận khi cùng `recipient_key` **hoặc** cùng `manualLink.linkId`.

**Bỏ liên kết:** `DELETE /order-groups/:id/link`. Bộ chỉ còn 1 nhóm → nhóm đó cũng tự bỏ liên kết.

| HTTP | `error_code` | Khi nào |
|---|---|---|
| 400 | `ORD_GROUP_LINK_SELF` | `target_group_id` trùng nhóm trên URL |
| 409 | `ORD_GROUP_LINK_NOT_ALLOWED` | 1 trong 2 nhóm đã `shipped`/`delivered`/`returned`/`canceled` |
| 409 | `ORD_GROUP_NOT_MANUALLY_LINKED` | Bỏ liên kết khi nhóm không có liên kết tay |
| 400 | `SHP_RECIPIENT_MISMATCH` (sẵn có) | Giao chung chuyến các nhóm không cùng người nhận và không liên kết tay |

**Màn hình gợi ý:** trên chi tiết nhóm đơn (vai trò Coordinator) thêm nút "Liên kết với nhóm khác" → hộp chọn nhóm đang chờ (lọc theo trạng thái chưa giao, tìm theo mã đơn) + ô ghi chú → gọi Bước 1. Nhóm có `manualLink` hiện nút "Bỏ liên kết".

## B.7. 🆕 Báo giá theo kiện, chọn hãng, giao chung chuyến, in chứng từ (gộp từ thi_dev 04/10/2026)

> 🔄 **Cập nhật 14/10/2026 (chiều):** đã có hãng **GHN thật** trong cùng danh sách (`kind: "live"`) — báo giá, tạo vận đơn, in nhãn, trạng thái giao đi qua API GHN. Xem **Phần B.8**. Các hãng mẫu (`SAMPLE-*`, `isSampleRate: true`, mã nội bộ `SHP-...`) vẫn chạy như mô tả dưới đây.

### B.7.1. Chuẩn bị (Admin, làm 1 lần)

1. Tạo hãng mẫu: trong thư mục `be` chạy `npx ts-node -r dotenv/config scripts/seed-shipping-carriers.ts` (chạy lại không tạo trùng).
2. Kiểm tra: `GET /shipping/carriers` → thấy `SAMPLE-EXPRESS` (dịch vụ `FAST`, 1–2 ngày) và `SAMPLE-ECONOMY` (`STANDARD` 3–5 ngày, `BULK` 4–7 ngày).
3. (Tuỳ chọn) Store Owner đặt chiến lược: `PUT /shipping/settings` `{ "strategy": "cheapest" | "fastest" | "fixed", "default_carrier_code": "...", "default_service_code": "..." }`.
4. 🆕 (21/10/2026) **Người gửi in trên nhãn:** cùng `PUT /shipping/settings`, thêm `sender_name`, `sender_phone`, `sender_address` (tuỳ chọn). Field **không gửi = giữ nguyên**; gửi `""` hoặc `null` = xoá. `GET /shipping/settings` trả thêm `sender: { name, phone, address }`. Bỏ trống thì nhãn tự lấy **tên + địa chỉ kho đang hoạt động đầu tiên**; không có kho thì in tên shop.

Thêm/sửa hãng: `POST /shipping/carriers`, `PATCH /shipping/carriers/:id` (Admin) — bảng cước theo bậc khối lượng `bands[{ up_to_g, price_vnd }]` tăng dần, `extra_price_vnd_per_500g`, `volumetric_divisor`, ETA. Sai bảng cước → `400 SHIP_INVALID_RATE_TABLE`.

### B.7.2. Báo giá cho 1 nhóm đơn (Coordinator)

```http
GET /shipping/quote/66f0a1b2c3d4e5f678901234
→ 200
{
  "groupId": "66f0...", "parcelCount": 2, "strategy": "cheapest",
  "quotes": [
    { "carrierCode": "SAMPLE-ECONOMY", "carrierName": "Hãng mẫu — Tiết kiệm (số giả lập)",
      "serviceCode": "STANDARD", "serviceName": "Tiêu chuẩn 3-5 ngày",
      "isSample": true, "totalChargeableG": 1400, "totalCostVnd": 44000, "etaMinDays": 3, "etaMaxDays": 5,
      "parcels": [
        { "orderId": "66f1...", "cartonIndex": 0, "actualG": 450, "volumetricG": 600, "chargeableG": 600, "costVnd": 22000 },
        { "orderId": "66f1...", "cartonIndex": 1, "actualG": 800, "volumetricG": 520, "chargeableG": 800, "costVnd": 22000 } ] },
    { "carrierCode": "SAMPLE-EXPRESS", "serviceCode": "FAST", "...": "..." }
  ],
  "recommended": { "carrierCode": "SAMPLE-ECONOMY", "serviceCode": "STANDARD" }
}
```

- Kiện lấy từ **kế hoạch đóng gói đã duyệt/đã đóng**: cân thật lúc niêm phong nếu có, chưa đóng thì cân ước tính; kích thước ngoài của thùng.
- Cân tính cước mỗi kiện = max(cân thực, thể tích ngoài cm³ / `volumetric_divisor`). Cước nhóm = tổng cước các kiện.
- Nhóm chưa có kiện hợp lệ → `409 SHIP_NO_PARCELS`.
- **Màn hình gợi ý:** bảng so sánh các dịch vụ (cước, ETA), đánh dấu dòng `recommended`, nhãn "Cước mẫu" khi `isSample = true`.

### B.7.3. Bắt đầu giao 1 nhóm đơn có chọn hãng

```http
POST /shipments
{ "order_group_id": "66f0...", "carrier_code": "SAMPLE-ECONOMY", "service_code": "STANDARD", "pickup_at": "2026-10-15T02:00:00.000Z", "note": "..." }
```

`carrier_code` + `service_code` đi cùng nhau (thiếu 1 trong 2 → `400 SHP_CARRIER_REQUIRED`). Không gửi hãng → vận đơn kiểu G1 cũ (không cước, không ETA). Response vận đơn có thêm `trackingCode`, `carrierCode/Name`, `serviceCode/Name`, `parcelCount`, `chargeableWeightG`, `estimatedCostVnd`, `isSampleRate`, `etaFrom/To`, `pickupAt`, `tripCode`.

### B.7.4. Giao chung chuyến nhiều nhóm

```http
POST /shipments/batch
{ "order_group_ids": ["66f0...1234", "66f0...5678"], "carrier_code": "SAMPLE-ECONOMY", "service_code": "STANDARD", "pickup_at": "2026-10-15T02:00:00.000Z", "note": "Chuyến chiều" }
→ 201
{ "tripCode": "TRIP-261014-3FA2", "carrierCode": "SAMPLE-ECONOMY", "serviceCode": "STANDARD", "totalCostVnd": 88000,
  "shipments": [ { "id": "...", "orderGroupId": "...1234", "trackingCode": "SHP-261014-AB12CD", "parcelCount": 2, "estimatedCostVnd": 44000, "etaFrom": "...", "etaTo": "..." }, { "...": "..." } ] }
```

- Mọi nhóm phải `packed`, chưa có vận đơn, không còn kiện chờ tháo.
- Từ 2 nhóm trở lên: cùng `recipient_key` **hoặc** cùng liên kết tay (B.6). Sai → `400 SHP_RECIPIENT_MISMATCH`.
- Tất cả tạo trong **1 transaction**: lỗi 1 nhóm thì không nhóm nào được tạo.
- Mỗi nhóm vẫn có **vận đơn riêng** (`SHP-...`), chung `tripCode`. Lọc: `GET /shipments?trip_code=TRIP-...`.

### B.7.5. Lịch hãng đến lấy hàng

`PATCH /shipments/:id/pickup` `{ "pickup_at": "<ISO 8601>" }` — chỉ **lưu lịch** (chưa gọi hãng). Thời điểm ở quá khứ → `400 SHP_PICKUP_IN_PAST`.

### B.7.6. In chứng từ (trả về file PDF)

| Route | Nội dung | Điều kiện |
|---|---|---|
| `GET /documents/packing-slip/:groupId` | Phiếu đóng gói A5, mỗi đơn 1 trang: người nhận, danh sách hàng có ô tích, các kiện/thùng, mã vạch nhóm | Nhóm còn đơn (`DOC_NO_ORDERS`) |
| `GET /documents/shipping-label/:groupId` | Nhãn 100×150 mm, **mỗi kiện 1 nhãn** (k/n), Code128 + QR của mã vận đơn, hãng, dịch vụ, ETA, mã chuyến; 🆕 21/10: khối **NGƯỜI GỬI** (tên · SĐT, địa chỉ — B.7.1 bước 4) dưới người nhận | Đã có vận đơn (`DOC_SHIPMENT_NOT_FOUND`) |
| `GET /documents/manifest/:tripCode` | Bảng kê chuyến A4: mọi vận đơn cùng mã chuyến, tổng kiện/cân/cước, chỗ ký giao nhận | Có vận đơn thuộc chuyến (`DOC_TRIP_NOT_FOUND`) |

FE mở bằng `fetch` kèm token rồi tạo `blob:` URL để xem/in. Đơn Lazada bị che dữ liệu sẽ in tên/SĐT/địa chỉ dạng `***` — đây là giới hạn của Lazada.

🆕 21/10/2026 — chứng từ phía **kho** (tem ô kệ, tem SKU, danh sách lấy hàng, phiếu nhập kho) nằm cùng module `/documents`, xem [INTEGRATION_GUIDE_WAREHOUSE.md — PHẦN B9](INTEGRATION_GUIDE_WAREHOUSE.md).

### B.7.7. Kịch bản demo từng bước

1. Đóng gói xong 2 nhóm của cùng người nhận (hoặc liên kết tay 1 nhóm Lazada + 1 nhóm AURELLE theo B.6.2).
2. Coordinator mở nhóm 1 → **Báo giá** (`GET /shipping/quote/:id`) → xem bảng, chọn dịch vụ được gợi ý.
3. Chọn cả 2 nhóm → **Giao chung chuyến** (`POST /shipments/batch`) → nhận `TRIP-...`.
4. In **nhãn** cho từng nhóm và **bảng kê chuyến** → dán nhãn lên kiện.
5. Bấm các nút giao hàng ở B.3 cho từng vận đơn.

## B.8. 🆕 Giao qua GHN thật (C4–C6, 14/10/2026)

> Hướng dẫn đầy đủ từng bước (request/response, mã lỗi, kịch bản demo): **`GHN_INTEGRATION_GUIDE.md` mục 11**. Tóm tắt cho màn Vận chuyển:

1. **Chuẩn bị 1 lần:** `npx ts-node -r dotenv/config scripts/seed-ghn-carrier.ts` → `GET /shipping/carriers` có thêm `GHN` (`kind: "live"`, dịch vụ `LIGHT`, `HEAVY`).
2. **Báo giá** (`GET /shipping/quote/:groupId`): dòng GHN có `isLive: true`, cước là phí THẬT GHN (Preview từng kiện). `unavailableReason` ≠ null → làm mờ dòng + cho sửa địa chỉ (query `province_name`, `ward_name`, `street`, `phone`). `assumptions[]` → hiện cảnh báo (đơn Lazada bị che: dùng tỉnh mặc định / SĐT demo).
3. **So phương án đóng gói** (`GET /shipping/packaging-options/:groupId?carrier_code=GHN&service_code=LIGHT`): tổng chi phí thùng + vật tư + phí ship của mọi thùng xếp vừa từng kiện; áp dụng bằng route đổi thùng của kế hoạch đóng gói.
4. **Tạo vận đơn** (`POST /shipments` hoặc `/shipments/batch` với `carrier_code: "GHN"`, tuỳ chọn `to_location`): vận đơn **`awaiting_pickup`** ("Chờ GHN lấy hàng"), mỗi kiện 1 mã GHN (`carrierParcels[].carrierOrderCode`). Lỗi hãng → `carrierBookingError`; sửa `PATCH /shipments/:id/to-location` hoặc thử lại `POST /shipments/:id/carrier/book`.
5. **In nhãn:** `GET /documents/shipping-label/:groupId` in mã GHN từng kiện; hoặc `GET /shipments/:id/carrier/label` lấy link A5 của GHN.
6. **Trạng thái giao:** nút B.3 (giao/thất bại/giao lại) **bị chặn** với vận đơn GHN (`409 SHP_MANAGED_BY_CARRIER`). Trạng thái đến từ webhook GHN, hoặc (demo) nút **"Mô phỏng GHN: …"** `POST /shipments/:id/carrier/simulate { status }` — chỉ đổi dữ liệu OptiPack, shop không đổi được trạng thái bên GHN. Trạng thái mới: `awaiting_pickup` (Chờ lấy hàng), `in_transit` (Đang trung chuyển), `cancelled` (Đã huỷ ở hãng).
7. **Hoàn hàng:** GHN báo hoàn → vận đơn `returning_to_warehouse` → **kho vẫn bấm "Nhận hàng hoàn"** (B.3) → phiếu hoàn tự tạo → kiểm hàng (Phần C, kèm thu hồi thùng/vật tư hạng A vào kho tái sử dụng).
8. **Huỷ ở hãng:** `POST /shipments/:id/carrier/cancel` (chỉ khi chờ lấy hàng) → vận đơn `cancelled`, nhóm đơn về `packed`, tạo lại vận đơn được.

Cột gợi ý cho danh sách vận đơn: Hãng · Mã GHN (`carrierParcels[].carrierOrderCode`) · Trạng thái hãng (`carrierStatusLabel`) · Phí ship (`estimatedCostVnd`) · Giao dự kiến (`etaTo`) · cờ đỏ khi `carrierBookingError` / `carrierIncident`.

---

# PHẦN C — TRẢ HÀNG / HOÀN HÀNG (G3) 🆕

## C.0. Trạng thái đơn nội bộ theo tiến độ hoàn hàng (18/10/2026)

Áp dụng cho phiếu `type: "return_refund"`, `source: "simulated"` do Admin tạo. Khi tổng số trả theo từng SKU bằng toàn bộ hàng trong nhóm:

| Thao tác | API | `ReturnRequest.status` | `OrderGroup.fulfillmentStatus` / nhãn FE |
|---|---|---|---|
| Admin tạo phiếu | `POST /returns` | `requested` | `returning` — **Đang hoàn** |
| Store duyệt | `POST /returns/:id/approve` | `awaiting_receipt` | `returned` — **Đã hoàn hàng** |
| Kho nhận kiện | `POST /returns/:id/receive` | `received` | Giữ `returned`; chưa cộng tồn |
| Kho kiểm và xử lý đủ hàng | `POST /returns/:id/inspect` | `closed` | `canceled` — **Đã hủy** |
| Store từ chối phiếu | `POST /returns/:id/reject` | `rejected` | Khôi phục `delivered` |
| Khách không gửi, Store hủy phiếu đã duyệt | `POST /returns/:id/cancel` | `canceled` | Khôi phục `delivered` |

- **Trả một phần:** nhóm giữ `delivered` ở mọi bước. Cộng các phiếu `return_refund` cùng nguồn đã `closed` trước đó với phiếu hiện tại, theo từng SKU; phiếu cuối trả đủ phần còn lại áp dụng bảng trên. Ví dụ nhóm A×2, B×1: đã xử lý A×1; tạo phiếu A×1+B×1 sẽ đưa nhóm sang `returning`.
- Phiếu `rejected`/`canceled`, phiếu đổi hàng, chỉ hoàn tiền và giao thất bại không được cộng vào tiến độ trả đủ nhóm này. Giới hạn số lượng còn được yêu cầu trả vẫn trừ các phiếu trước theo quy tắc hiện có.
- **Đã hoàn hàng** trong luồng này là mốc Store đã duyệt; việc nhận vật lý/kiểm hàng theo `ReturnRequest.status`. Kho nhận kiện chưa chuyển nhóm sang `canceled`.
- `inspect` phải xử lý đủ số lượng: chỉ `restock` cộng tồn bán; `quarantine`/`discard` ghi nhận đúng kết quả, không cộng tồn bán. Xử lý đủ vẫn kết thúc nhóm bằng `canceled`, kể cả có hàng cách ly/loại bỏ.
- Mỗi lần đổi phiếu và nhóm, hoặc đóng phiếu + xử lý tồn, đều dùng cùng transaction và khóa version. Lỗi nhập tồn/khóa version không được để lại trạng thái dở dang. Gửi lại thao tác đã thành công sẽ bị chặn bằng lỗi trạng thái/version; FE tải lại dữ liệu trước khi cho thao tác tiếp.
- BE giữ ngày giao gốc bằng snapshot nội bộ `delivered_at_snapshot`, kể cả ở phiếu bị từ chối/hủy, để thay đổi `updated_at` của nhóm không làm kéo dài hạn trả 15 ngày. Field này không thêm vào response FE.

**FE dùng trạng thái nào:**

```http
GET /order-groups?fulfillment_status=returning
GET /order-groups?fulfillment_status=returned
GET /order-groups?fulfillment_status=canceled
GET /order-groups/:orderGroupId
```

Query vẫn dùng bộ lọc/phân trang hiện có; nhãn tiến độ đơn lấy từ `fulfillmentStatus` trong response nhóm. Ghép bằng `orderGroupId` ở vận đơn/phiếu, hoặc `consolidatedGroupId` ở đơn. Sau thao tác phiếu, tải lại phiếu và nhóm liên quan. Không suy ra tiến độ đơn từ `Shipment.status`, `carrierStatus` hoặc `Order.status` gốc từ sàn; vận đơn giao đi có thể vẫn `delivered` trong khi nhóm đang hoàn.

URL và request body của các API phiếu giữ nguyên; response phiếu vẫn là đối tượng phiếu hiện tại, không có field `fulfillmentStatus` mới. FE bổ sung giá trị `returning` và nhãn trên, không cần thêm màn hay bước xác nhận. Phân biệt `canceled` của **nhóm** sau kiểm hàng thành công với `canceled` của **phiếu** khi khách không gửi hàng.

**Tương thích:** không chạy migration/backfill trạng thái hàng loạt. Phiếu cũ đang mở tiếp tục từ thao tác tiếp theo: phiếu chưa duyệt có thể chuyển nhóm từ `delivered` thẳng `returned` khi duyệt; phiếu cũ đã nhận đủ hàng có thể kết thúc nhóm bằng `canceled` khi kiểm xong. Phiếu đã đóng trước bản sửa giữ trạng thái nhóm đã có. Đổi hàng, chỉ hoàn tiền và giao thất bại giữ luồng hiện tại.

## C.1. 3 loại phiếu

| `type` | Ai tạo | Có hàng về kho? | Luồng |
|---|---|---|---|
| `failed_delivery` | **Hệ thống tự tạo** khi kho nhận lại kiện giao thất bại | Có (đã về) | `received` → kiểm hàng → `closed` |
| `return_refund` | Admin đóng vai khách | Có | `requested` → duyệt → `awaiting_receipt` → nhận → `received` → kiểm → `closed` |
| `refund_only` | Admin đóng vai khách | **Không** | `requested` → duyệt → `closed` luôn |

Từ chối ở bước `requested` → `rejected` (kết thúc). 🆕 (09/10/2026) Phiếu `awaiting_receipt` mà khách không gửi hàng → `canceled` (kết thúc) bằng `POST /returns/:id/cancel`. Hệ thống **chỉ quản lý hàng**; tiền hoàn do sàn xử lý.

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
| SKU không thuộc nhóm đơn / khai trùng / trả nhiều hơn **số còn được trả** (🔄 09/10: = đã mua − đã khai ở các phiếu trước, trừ phiếu `rejected`/`canceled`) | `400 RMA_INVALID_ITEMS` |
| Nhóm đơn đang có phiếu chưa xử lý xong | `409 RMA_OPEN_EXISTS` |

## C.3. Duyệt / từ chối (Store Owner)

```
POST /returns/:id/approve   { "expected_version": 0, "note": "Đồng ý" }
POST /returns/:id/reject    { "expected_version": 0, "note": "Hàng đã qua sử dụng" }   // note BẮT BUỘC
```
- **Người tạo phiếu không được tự duyệt** → `403 RMA_SELF_APPROVAL`. Khi demo: tạo bằng tài khoản Admin, duyệt bằng tài khoản Store Owner.
- `refund_only` duyệt xong → `closed` ngay; `return_refund` → `awaiting_receipt`.

🆕 **Hủy phiếu đã duyệt mà hàng không về (09/10/2026):**

```
POST /returns/:id/cancel    { "expected_version": 1, "note": "Khách không gửi hàng sau 7 ngày" }   // Store Owner, Admin; note BẮT BUỘC
```

`awaiting_receipt → canceled`. Thiếu `note` → `400 RMA_NOTE_REQUIRED`; phiếu không ở `awaiting_receipt` → `409 RMA_INVALID_STATUS`. Trước đây phiếu này không có lối ra và chặn mọi phiếu mới của nhóm đơn (`RMA_OPEN_EXISTS`).

## C.4. Kho nhận hàng trả

```
POST /returns/:id/receive   { "expected_version": 1 }        (Warehouse Staff)
```
Với `return_refund` trả đủ nhóm, nhóm đã `returned` từ lúc Store duyệt; bước này chỉ ghi nhận đã nhận kiện. Trả một phần giữ nhóm `delivered`. Phiếu cũ chưa cập nhật nhóm được xử lý tương thích tại bước nhận. Chi tiết cộng dồn và mốc kết thúc `canceled`: C.0.

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

🔄 **ĐÃ SỬA (07/10/2026)** — dòng `restock` vào một ô **chưa có** dòng tồn của SKU đó: hệ thống tạo dòng tồn mới. SKU đã nối SKU nội bộ → dòng mới mang `masterSku` (hàng hoàn vào tồn chung); SKU chưa nối → dòng mới mang đủ `platform`, `shopId`, `sellerSku`. Trước khi sửa (chỉ trên bản có thay đổi tìm tồn của nhánh `feature/viet_befe`), dòng mới có thể thiếu `masterSku` hoặc `sellerSku`. Request/response không đổi. Áp dụng cả cho xử lý hàng cách ly `action: restock`.

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

Swagger đánh dấu 3 route này `deprecated`. 🔄 (09/10/2026) **FE không gọi 3 route này** — `ship` tạo vận đơn không có hãng/cước; `return` bỏ qua hạn trả, kiểm hàng và nhập lại tồn. Dùng `/shipments/*` và `/returns/*`.

## D.2. Dữ liệu cũ

- Nhóm đơn đã `shipped` trước G1 không có vận đơn → vận đơn được **tạo bù tự động** khi bấm bất kỳ nút nào (route mới hoặc cũ). Không cần script.
- Nhóm đơn đã `delivered`/`returned` trước G1: không có vận đơn, không ảnh hưởng.

## D.3. Không bị ảnh hưởng

Đồng bộ đơn, gộp đơn, lấy hàng, gợi ý/duyệt đóng gói, `pack`, thông báo.

---

# PHẦN E — HẠN CHẾ HIỆN TẠI VÀ HƯỚNG KHẮC PHỤC

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
| 14 | Chưa gọi hãng vận chuyển thật (GHN) khi tạo vận đơn — module `carriers` có sẵn nhưng chưa nối (14/10/2026) | Mã vận đơn là `SHP-...` nội bộ, cước là số mẫu, lịch lấy hàng chỉ lưu | C4 trong `GHN_INTEGRATION_GUIDE.md` mục 9.3 |
| 15 | Trạng thái giao vẫn do Coordinator bấm, chưa có webhook GHN | — | C5 (webhook + nút trạng thái đi cùng hàm) |
| 16 | 1 vận đơn cho cả nhóm dù nhiều kiện (nhãn đã in theo kiện) | Khi dùng GHN phải có mỗi kiện 1 mã GHN | C4: lưu `carrier_order_code` theo kiện |
| 13 | Phiếu hoàn giao thất bại lấy SKU từ sổ cái `pick`; với tồn đã gộp theo SKU nội bộ, sổ cái ghi `seller_sku` của dòng tồn (có thể là SKU của sàn/shop khác) | Phiếu có thể mang SKU khác SKU trong đơn; nhập lại kho có thể tạo dòng tồn chưa nối mới thay vì cộng vào tồn chung (rà soát 06/10/2026, chưa sửa) | Lấy danh sách hàng hoàn từ `pick_events` (lưu đúng SKU trong đơn) |

---

# PHẦN F — THAM CHIẾU NHANH

## F.1. Route

| Method | Route | Role |
|---|---|---|
| GET | `/shipments/reason-codes` | Admin, Coordinator, Store Owner, Warehouse |
| GET | `/shipments` · `/shipments/:id` · `/shipments/:id/events` | Admin, Coordinator, Store Owner, Warehouse |
| POST | `/shipments` (🆕 tùy chọn `carrier_code`, `service_code`, `pickup_at`) | Coordinator, Admin |
| POST | 🆕 `/shipments/batch` | Coordinator, Admin |
| PATCH | 🆕 `/shipments/:id/pickup` | Coordinator, Admin |
| POST | `/shipments/overdue-scan` | Coordinator, Admin |
| POST | `/shipments/:id/deliver` · `/fail` · `/retry` | Coordinator, Admin |
| GET | 🆕 `/shipping/carriers` | Coordinator, Store Owner, Admin |
| POST · PATCH | 🆕 `/shipping/carriers` · `/shipping/carriers/:id` | Admin |
| GET | 🆕 `/shipping/quote/:groupId` | Coordinator, Store Owner, Admin |
| GET · PUT | 🆕 `/shipping/settings` | GET: Coordinator, Store Owner, Admin · PUT: Store Owner, Admin |
| GET | 🆕 `/documents/packing-slip/:groupId` | Warehouse, Packaging, Store Owner, Admin |
| GET | 🆕 `/documents/shipping-label/:groupId` | Coordinator, Warehouse, Admin |
| GET | 🆕 `/documents/manifest/:tripCode` | Coordinator, Store Owner, Admin |
| POST · DELETE | 🆕 `/order-groups/:id/link` | Coordinator, Admin |
| GET | 🆕 `/shipping/packaging-options/:groupId` (C6) | Coordinator, Packaging, Store Owner, Admin |
| POST | 🆕 `/shipments/:id/carrier/book` · `/carrier/cancel` · `/carrier/sync` · `/carrier/simulate` (C4/C5) | Coordinator, Admin |
| PATCH | 🆕 `/shipments/:id/to-location` (C4) | Coordinator, Admin |
| GET | 🆕 `/shipments/:id/carrier/label` (C4) | Coordinator, Warehouse, Packaging, Admin |
| GET | 🆕 `/shipments/carrier/statuses` (C5) | Coordinator, Store Owner, Warehouse, Admin |
| POST | 🆕 `/carriers/ghn/webhook` (C5) | Public + `X-OptiPack-Secret` |
| POST | `/shipments/:id/receive-return` | Warehouse, Admin |
| POST | `/order-groups/:id/fulfillment/ship` · `/deliver` | Coordinator, Admin (🔄 lỗi thời) |
| POST | `/order-groups/:id/fulfillment/return` | Coordinator, Warehouse, Admin (🔄 lỗi thời) |
| GET | `/returns/reason-codes` · `/returns` · `/returns/:id` | Admin, Store Owner, Warehouse, Coordinator |
| POST | `/returns` | Admin (đóng vai khách) |
| POST | `/returns/:id/approve` · `/reject` · 🆕 `/cancel` (09/10) | Store Owner, Admin |
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
| `SHP_PARCELS_TO_UNPACK` | 409 | Còn kiện của đơn đã huỷ chưa tháo |
| `SHP_EMPTY_GROUP_LIST` | 400 | `/shipments/batch` không có nhóm nào |
| `SHP_RECIPIENT_MISMATCH` | 400 | Giao chung chuyến các nhóm khác người nhận, không liên kết tay |
| `SHP_PICKUP_IN_PAST` | 400 | Lịch lấy hàng ở quá khứ |
| `SHP_CARRIER_REQUIRED` | 400 | Gửi `carrier_code` thiếu `service_code` hoặc ngược lại |
| `SHIP_SERVICE_NOT_FOUND` | 404 | Hãng/dịch vụ không có hoặc đã ngừng |
| `SHIP_NO_PARCELS` | 409 | Nhóm chưa có kiện để báo giá |
| `SHIP_INVALID_RATE_TABLE` | 400 | Bảng cước sai (trống/trùng/không tăng dần) |
| `SHIP_CARRIER_CODE_IN_USE` | 409 | Mã hãng đã tồn tại |
| `DOC_NO_ORDERS` · `DOC_SHIPMENT_NOT_FOUND` · `DOC_TRIP_NOT_FOUND` | 404/409 | Không có đơn / chưa có vận đơn / mã chuyến không có vận đơn |
| `SHP_MANAGED_BY_CARRIER` | 409 | Bấm nút giao/thất bại/giao lại trên vận đơn GHN |
| `SHP_CARRIER_*`, `SHP_TO_LOCATION_LOCKED`, `SHP_WEBHOOK_UNAUTHORIZED`, `SHIP_LIVE_CARRIER_*` | — | Xem `GHN_INTEGRATION_GUIDE.md` mục 11.5 |
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
- [ ] Trả đủ nhóm: Admin tạo → nhóm `returning`; Admin tự duyệt bị `RMA_SELF_APPROVAL`; Store duyệt → `returned`; kho nhận giữ `returned`; kiểm đủ → phiếu `closed`, nhóm `canceled`
- [ ] Trả một phần giữ nhóm `delivered`; nhiều phiếu cộng dồn trả đủ thì phiếu cuối áp dụng đủ các mốc trên
- [ ] Từ chối/hủy phiếu trả đủ nhóm trước nhận hàng → nhóm về `delivered`; ngày giao gốc vẫn giữ cho hạn trả 15 ngày
- [ ] Gửi version cũ hoặc kiểm lại phiếu đã đóng không cộng tồn lần hai; lỗi nhập tồn không đóng phiếu/hủy nhóm
- [ ] Phiếu cũ đang mở tiếp tục được; phiếu đổi hàng/chỉ hoàn tiền/giao thất bại giữ luồng hiện có
- [ ] `refund_only` → duyệt là `closed` ngay, tồn kho không đổi
- [ ] Kiểm hàng thiếu số lượng → `RMA_INSPECTION_MISMATCH`
- [ ] Route cũ `fulfillment/ship|deliver|return` vẫn trả response nhóm đơn như trước
- [ ] 🆕 Chạy seed hãng mẫu → `GET /shipping/quote/:id` trả ≥ 2 dịch vụ, có `recommended`, mỗi dịch vụ có cước từng kiện
- [ ] 🆕 `POST /shipments` có `carrier_code` mà thiếu `service_code` → `SHP_CARRIER_REQUIRED`
- [ ] 🆕 `/shipments/batch` 2 nhóm cùng người nhận → cùng `tripCode`; 2 nhóm khác người nhận → `SHP_RECIPIENT_MISMATCH`; liên kết tay rồi gửi lại → thành công
- [ ] 🆕 In nhãn trước khi có vận đơn → `DOC_SHIPMENT_NOT_FOUND`; sau khi có → PDF đủ số nhãn = số kiện
- [ ] 🆕 `GET /documents/manifest/:tripCode` liệt kê đủ vận đơn của chuyến
- [ ] 🆕 (GHN) Seed GHN → báo giá có dòng `GHN` `isLive: true`; đơn Lazada có `assumptions`
- [ ] 🆕 (GHN) Tạo vận đơn GHN → `awaiting_pickup`, mỗi kiện có `carrierOrderCode`; nút "Giao thành công" kiểu cũ trả `SHP_MANAGED_BY_CARRIER`
- [ ] 🆕 (GHN) Mô phỏng picked → delivering → delivered → nhóm đơn `delivered`; lịch sử có `source: carrier_simulated`
- [ ] 🆕 (GHN) Mô phỏng delivery_fail → returning → returned → kho "Nhận hàng hoàn" → phiếu hoàn → kiểm hàng có thu hồi thùng hạng A
- [ ] 🆕 (GHN) Huỷ khi chờ lấy hàng → vận đơn `cancelled`, nhóm đơn `packed`; tạo lại → `bookingRound: 2`
- [ ] 🆕 (C6) `packaging-options` trả `best` + `savingVnd`; áp dụng bằng change-box rồi báo giá lại thấy giảm
