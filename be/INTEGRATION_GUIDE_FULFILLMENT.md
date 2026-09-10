# OptiPackAI Backend — Integration Guide: Fulfillment & Warehouse (Package 3/4)

Tài liệu này dành cho FE tích hợp 3 module **Order Groups** (gộp đơn + chuyển trạng thái fulfillment), **Packaging** (UC-04 — duyệt gợi ý đóng gói), và **Warehouse** (vị trí kệ kho). Cùng cấp với `INTEGRATION_GUIDE.md` (Auth/Users) và `INTEGRATION_GUIDE_ORDERS.md` (Orders/Marketplace) — đọc **cả 2 file đó trước**, đặc biệt `INTEGRATION_GUIDE_ORDERS.md` mục 7 (Consolidation), vì 3 module ở đây build tiếp ngay trên khái niệm "gộp đơn" đã giới thiệu ở đó.

**Swagger UI**: `http://localhost:3000/api/docs`

> ⚠️ **Phạm vi hiện tại — đọc trước khi code UI**: Toàn bộ luồng dưới đây đã code xong và verify bằng compiler + 108 unit test thật (không phải mock suông) — nhưng **`packaging/generate` là route TẠM, dùng thuật toán fallback đơn giản, KHÔNG PHẢI AI thật** (AI Packaging — Package 3 — do 1 thành viên khác code riêng, chưa xong). FE vẫn tích hợp được bình thường vì shape response giữ nguyên khi AI thật thay vào, nhưng đừng ngạc nhiên nếu gợi ý đóng gói hiện tại "hơi đơn giản" (chỉ chọn 1 trong 3 size thùng cố định).

---

## 0. ⚠️ CẢNH BÁO QUAN TRỌNG NHẤT — 2 kiểu response KHÁC NHAU giữa các module, đọc trước khi viết bất kỳ TypeScript interface nào

Khác với `orders`/`order-groups` (đã map cẩn thận field sang **camelCase**, ẩn hết field nội bộ Mongoose — xem mẫu ở mục 2), **`packaging/` và `warehouse/` hiện tại trả THẲNG document MongoDB ra ngoài, KHÔNG qua bước map**. Nghĩa là response 2 module này có:
- Field tên **snake_case** (`order_group_id`, `material_type`, `approval_status`...), không phải camelCase
- Field `_id` (không phải `id`) chứa ObjectId dạng string
- Field `__v` (số version nội bộ Mongoose) — **KHÁC** với field `version` (số nguyên, dễ đọc) mà `order-groups` cố tình lộ ra để FE dùng cho Optimistic Concurrency (mục 3). `packaging`/`warehouse` **chưa có** cơ chế tương tự — hiện KHÔNG áp Optimistic Concurrency cho warehouse (ít rủi ro concurrent-edit hơn, chủ yếu Admin thao tác), còn `packaging` áp Optimistic Concurrency **gián tiếp qua `order_groups`**, không phải qua chính recommendation.

**FE nên xử lý sao**: viết 2 kiểu interface/type riêng biệt (1 cho `order-groups` theo camelCase sạch, 1 cho `packaging`/`warehouse` theo đúng raw shape bên dưới) — **đừng cố ép chung 1 interface dùng camelCase cho cả 3 module**, sẽ luôn sai field cho 2 module còn lại. Đây là ghi nhận thật về hiện trạng code, không phải khuyến nghị thiết kế — nếu team muốn đồng nhất, cần yêu cầu BE bổ sung tầng map cho `packaging`/`warehouse` sau.

---

## 1. Base URL & Header chung

Giống hệt 2 module trước — `Authorization: Bearer <access_token>` bắt buộc cho **mọi** route trong tài liệu này, không có route public nào ở 3 module này.

---

## 2. Luồng chạy đầy đủ (end-to-end) — đọc mục này TRƯỚC khi code UI

```
1. Đơn hàng đã sync qua Lazada (INTEGRATION_GUIDE_ORDERS.md mục 4) — đơn có
   consolidated_group_id có thể đang null (chưa gộp với ai).

2. Cron nền TỰ ĐỘNG (không cần FE gọi gì) mỗi 15 phút quét đơn consolidated_group_id
   null → tạo Order Group tương ứng (kể cả đơn đơn lẻ cũng có "group of 1").
   → FE KHÔNG cần biết bước này tồn tại — chỉ cần gọi mục 3 bên dưới, group SẼ
     tự có sau tối đa 15 phút kể từ lúc đơn sync xong.

3. FE gọi GET /order-groups (lọc theo fulfillment_status nếu cần) để lấy danh
   sách group cần xử lý → hiện bảng cho đúng role đang login (xem ma trận role
   mục 4).

4. [ADMIN, TẠM] POST /order-groups/:id/packaging/generate
   → Tạo gợi ý đóng gói (thuật toán fallback) → group chuyển "pending_approval"

5. [PACKAGING_STAFF] Duyệt gợi ý:
   POST /order-groups/:id/packaging/approve   (đồng ý, kèm cân THẬT đo được)
   POST /order-groups/:id/packaging/adjust    (đổi box/material rồi mới đồng ý)
   POST /order-groups/:id/packaging/reject    (không đồng ý, quay lại bước 4)
   → Approve/Adjust: group chuyển "approved_for_packing"
   → Reject: group quay lại "awaiting_packaging" (gọi lại bước 4)

6. [WAREHOUSE_STAFF] Lấy hàng theo vị trí kệ + đóng gói:
   GET  /warehouse/:warehouseId/picking-list/:groupId   (xem SKU + kệ số mấy)
   POST /order-groups/:id/fulfillment/pick    → group chuyển "picked"
   POST /order-groups/:id/fulfillment/pack    → group chuyển "packed"

7. [SHIPPING_COORDINATOR] Giao hàng:
   POST /order-groups/:id/fulfillment/ship     → group chuyển "shipped"
   POST /order-groups/:id/fulfillment/deliver  → group chuyển "delivered"

8. [SHIPPING_COORDINATOR hoặc WAREHOUSE_STAFF] Nếu hoàn hàng:
   POST /order-groups/:id/fulfillment/return   → group chuyển "returned" (trạng thái cuối)
```

**Sơ đồ trạng thái đầy đủ** (mọi `fulfillment_status` có thể có, và đường đi hợp lệ giữa chúng — GỌI SAI THỨ TỰ SẼ BỊ TỪ CHỐI, xem mục 6):

```
awaiting_packaging → pending_approval → approved_for_packing → picked → packed → shipped → delivered
        ↑                    ↓ (reject)                                              ↓ (return)
        └────────────────────┘                                                    returned
                                                    (shipped hoặc delivered đều return được)
```

### Cách FE tự test luồng này qua Swagger (không cần BE ngồi cạnh)

1. Đăng nhập, Authorize như thường lệ (xem `INTEGRATION_GUIDE.md`).
2. `GET /order-groups` — nếu rỗng, đợi tối đa 15 phút sau khi có đơn Lazada mới sync (bước 2 ở trên tự chạy), hoặc hỏi BE ép cron chạy ngay lúc test (đổi tạm lịch cron).
3. Copy `id` của 1 group, thử `GET /order-groups/:id` — ghi lại field **`version`** (số này BẮT BUỘC dùng cho MỌI request ghi ở bước sau).
4. Đi tuần tự từng bước 4→8 ở trên qua Swagger, **sau MỖI bước ghi, gọi lại `GET /order-groups/:id` để lấy `version` MỚI** trước khi gọi bước tiếp theo — quên bước này sẽ luôn bị lỗi 409 (mục 6).

---

## 3. `GET /order-groups`, `GET /order-groups/:id` — response chuẩn (camelCase, đã map)

### Response mẫu

```json
{
  "id": "68bf9a1c2e4d5f0012a3b456",
  "platform": "lazada",
  "shopId": "201171264532",
  "orderCount": 2,
  "fulfillmentStatus": "pending_approval",
  "activePackagingRecommendationId": "68bf9a332e4d5f0012a3b459",
  "version": 1,
  "createdAt": "2026-09-09T10:00:00.000Z",
  "updatedAt": "2026-09-09T10:05:00.000Z"
}
```

| Field | Type | Ghi chú |
|---|---|---|
| `id` | string | ObjectId — dùng cho mọi route `:id` bên dưới |
| `fulfillmentStatus` | string | 1 trong 9 giá trị đã liệt kê ở mục 2 — **KHÁC HẲN** `status` của Order (Lazada trả về) — 2 field độc lập tuyệt đối, đừng nhầm |
| `activePackagingRecommendationId` | string \| null | Chỉ có giá trị SAU khi gọi `packaging/generate` (bước 4) — trước đó luôn `null` |
| `version` | number | **BẮT BUỘC** đọc field này, gửi lại đúng giá trị vào body mọi request GHI (mục 6) |

**Query filter cho `GET /order-groups`**: `fulfillment_status` (1 trong 9 giá trị enum), `platform` — cả 2 đều optional, không truyền = lấy tất cả (giới hạn 100 kết quả gần nhất, **chưa có cursor pagination** như `GET /orders` — nếu >100 group, cần yêu cầu BE bổ sung).

### `GET /order-groups/:id/picking-list`

```json
{
  "order_group_id": "68bf9a1c2e4d5f0012a3b456",
  "items": [
    { "sku": "ABC-123", "quantity": 2, "length_cm": 10, "width_cm": 10, "height_cm": 10, "weight_kg": 0.2, "is_fragile": false }
  ]
}
```
⚠️ Route này **CHƯA có vị trí kệ** (`bin_code`) — chỉ trả kích thước/cân nặng. Muốn có vị trí kệ thật, dùng route ở mục 5 (`GET /warehouse/:warehouseId/picking-list/:groupId`), khác route, khác response shape — đọc kỹ, đừng nhầm 2 route na ná tên nhau này.

---

## 4. Module Packaging (UC-04) — response RAW (snake_case, xem cảnh báo mục 0)

### `POST /order-groups/:id/packaging/generate` — role: `ADMIN` (TẠM)

Không cần body. Response:
```json
{
  "_id": "68bf9a332e4d5f0012a3b459",
  "order_group_id": "68bf9a1c2e4d5f0012a3b456",
  "box_size": { "length_cm": 20, "width_cm": 15, "height_cm": 10 },
  "material_type": "Small Box",
  "material_quantity": 1,
  "estimated_shipping_cost_vnd": 6000,
  "computation_time_ms": 1,
  "fallback_used": true,
  "approval_status": "pending",
  "approved_by": null,
  "approved_at": null,
  "actual_measured_weight_kg": null,
  "is_abnormal": false,
  "is_active": true,
  "created_at": "2026-09-09T10:05:00.000Z",
  "updated_at": "2026-09-09T10:05:00.000Z",
  "__v": 0
}
```

### `POST /order-groups/:id/packaging/approve` — role: `PACKAGING_STAFF`, `ADMIN`

**Body (bắt buộc cả 2 field):**
```json
{ "actual_measured_weight_kg": 0.45, "expected_group_version": 1 }
```
- `actual_measured_weight_kg`: **cân THẬT** Packaging Staff đo sau khi đóng gói — không phải số ước tính. Nếu lệch >20% so với cân ước tính (lấy từ `picking-list`), BE **tự động** đánh `is_abnormal: true` — FE nên hiện cảnh báo nổi bật trên UI khi thấy field này = true (không phải lỗi, là tín hiệu cần Packaging Staff/Admin xem lại).
- `expected_group_version`: lấy từ `GET /order-groups/:id` → field `version` (**KHÔNG PHẢI** `__v` của chính recommendation).

### `POST /order-groups/:id/packaging/adjust` — role: `PACKAGING_STAFF`, `ADMIN`

Dùng khi Packaging Staff KHÔNG đồng ý gợi ý — tự nhập lại box/material rồi mới duyệt:
```json
{
  "box_size": { "length_cm": 25, "width_cm": 20, "height_cm": 15 },
  "material_type": "Bubble Wrap",
  "adjustment_reason": "PRODUCT_MORE_FRAGILE_THAN_EXPECTED",
  "adjustment_note": null,
  "actual_measured_weight_kg": 0.45,
  "expected_group_version": 1
}
```
`adjustment_reason` chỉ nhận đúng 3 giá trị: `PRODUCT_MORE_FRAGILE_THAN_EXPECTED`, `RECOMMENDED_BOX_NOT_IN_STOCK`, `OTHER` (khi chọn `OTHER`, nên bắt FE yêu cầu nhập thêm `adjustment_note`, dù BE hiện **không** validate bắt buộc field này — chỉ là gợi ý UX).

### `POST /order-groups/:id/packaging/reject` — role: `PACKAGING_STAFF`, `ADMIN`

```json
{ "expected_group_version": 1 }
```
Response: `{ "message": "Đã từ chối gợi ý đóng gói — Order Group quay lại hàng đợi chờ tính toán lại." }` — **không** trả object recommendation (khác 2 API trên). Recommendation cũ **không bị xóa** (`is_active: false`, vẫn còn trong DB, chỉ không active nữa) — nếu FE cần xem lịch sử các lần bị reject, cần API riêng (chưa có, hỏi BE nếu cần).

### `GET /order-groups/:id/packaging` — role: mọi role fulfillment (`PACKAGING_STAFF`, `WAREHOUSE_STAFF`, `SHIPPING_COORDINATOR`, `ADMIN`)

Trả recommendation hiện tại **bất kể** `approval_status` (kể cả đã approve/reject rồi) — trả **`null`** (không phải lỗi 404) nếu group chưa từng gọi `generate`. FE check `response === null` để biết "chưa có gợi ý nào" thay vì bắt lỗi.

---

## 5. Module Warehouse — response RAW (snake_case), toàn bộ route Admin trừ 1 route cuối

Luồng "thêm kho vào hệ thống" — 4 bước THEO ĐÚNG THỨ TỰ (bước sau phụ thuộc bước trước, gọi sai thứ tự sẽ nhận 404 "not found" vì tham chiếu chưa tồn tại):

```
1. POST /warehouse/warehouses                                  { warehouse_code, warehouse_name, address }
2. POST /warehouse/warehouses/:warehouseId/zones                { zone_code, zone_name, description? }
3. POST /warehouse/zones/:zoneId/bin-locations/generate          { aisle, rack_from, rack_to, level_from, level_to }
   → tạo HÀNG LOẠT kệ cùng lúc, VD rack 1-10 x level 1-4 = 40 kệ chỉ 1 lần gọi
   → response: { "created": 40 }  — số kệ MỚI được tạo (gọi lại lần 2 cùng range → created: 0, KHÔNG lỗi, KHÔNG tạo trùng — idempotent)
4. POST /warehouse/warehouses/:warehouseId/sku-bin-assignments   { platform, shop_id, seller_sku, bin_location_id }
```

Toàn bộ 4 route trên: role `ADMIN`. **FE chỉ cần build UI cho 4 bước này nếu có màn hình "Quản lý kho" dành cho Admin** — nếu capstone chỉ demo warehouse ngầm (Admin tự setup 1 lần qua Swagger, không cần UI riêng), có thể bỏ qua, không bắt buộc code FE cho mục này.

### `GET /warehouse/sku-bin-assignments/unassigned` — role: `ADMIN`

Trả danh sách SKU đã có trong hệ thống (từ Product Master) nhưng **chưa gán vị trí kệ** — dùng cho màn hình nhắc Admin gán nốt, tự động phát hiện, không cần dò tay.

### `GET /warehouse/:warehouseId/picking-list/:groupId` — role: `WAREHOUSE_STAFF`, `ADMIN`

**Đây là route ĐÚNG có vị trí kệ thật** (khác route ở mục 3):
```json
[
  {
    "sku": "ABC-123", "quantity": 2,
    "length_cm": 10, "width_cm": 10, "height_cm": 10, "weight_kg": 0.2, "is_fragile": false,
    "zone_code": "A", "bin_code": "A-03-02-01"
  }
]
```
Mảng **đã SẮP XẾP sẵn theo lộ trình vật lý** (zone → bin_code tăng dần) — FE **render đúng thứ tự mảng trả về**, không tự sort lại theo tên/SKU, sẽ phá mất tối ưu đường đi trong kho. SKU chưa gán vị trí sẽ có `bin_code: "CHƯA GÁN VỊ TRÍ"`, xếp cuối danh sách — FE nên hiện style khác biệt (màu xám/icon cảnh báo) cho dòng này, không coi như lỗi.

---

## 6. 5 endpoint Fulfillment — cơ chế Optimistic Concurrency, ĐỌC KỸ

`POST /order-groups/:id/fulfillment/{pick|pack|ship|deliver|return}` — **TẤT CẢ dùng chung 1 shape body**:
```json
{ "expected_version": 1 }
```

### Role từng endpoint

| Endpoint | Role |
|---|---|
| `pick`, `pack` | `WAREHOUSE_STAFF`, `ADMIN` |
| `ship`, `deliver` | `SHIPPING_COORDINATOR`, `ADMIN` |
| `return` | `SHIPPING_COORDINATOR`, `WAREHOUSE_STAFF`, `ADMIN` |

### 🔴 Cơ chế QUAN TRỌNG NHẤT cần FE hiểu đúng — Optimistic Concurrency (Rule #18)

Mỗi lần ghi thành công, `version` server-side **tăng thêm 1**. Nếu FE gửi `expected_version` **KHÔNG khớp** version hiện tại trên server (vì 2 người cùng thao tác 1 group, hoặc FE cache version cũ quá lâu) → nhận lỗi **409 Conflict**, `error_code: "ORD_GROUP_STATE_CONFLICT"`.

**FE PHẢI xử lý case này bằng UX rõ ràng, KHÔNG được retry tự động với version cũ** (sẽ lặp lại lỗi vô hạn). Cách xử lý đúng:
1. Hiện thông báo: *"Dữ liệu đã được người khác cập nhật — đang tải lại..."*
2. Tự động gọi lại `GET /order-groups/:id` lấy `version` mới nhất
3. Hiện lại trạng thái mới cho user xem, **KHÔNG tự động thực hiện lại hành động vừa bị conflict** — để user tự quyết định thao tác tiếp (tránh 2 người vô tình cùng "pick" 2 lần liên tiếp không ai biết).

### Lỗi chặn nhảy trạng thái sai thứ tự

Gọi `ship` khi group đang `picked` (bỏ qua `pack`) → **400 Bad Request**, `error_code: "ORD_GROUP_INVALID_TRANSITION"`, `details: { from: "picked", to: "shipped" }`. FE nên **disable nút** tương ứng trên UI dựa theo `fulfillmentStatus` hiện tại (đừng để user bấm được nút sai thứ tự rồi mới báo lỗi) — dùng đúng sơ đồ trạng thái ở mục 2 để tính nút nào được phép hiện.

---

## 7. Bảng mã lỗi đầy đủ (3 module)

| `error_code` | HTTP | Module | Khi nào |
|---|---|---|---|
| `ORD_GROUP_INVALID_ID` | 400 | order-groups | `:id` sai định dạng ObjectId |
| `ORD_GROUP_NOT_FOUND` | 404 | order-groups | Group không tồn tại |
| `ORD_GROUP_STATE_CONFLICT` | 409 | order-groups | `version` không khớp — xem mục 6 |
| `ORD_GROUP_INVALID_TRANSITION` | 400 | order-groups | Chuyển trạng thái sai thứ tự — xem mục 6 |
| `PKG_INVALID_RECOMMENDATION_ID` | 400 | packaging | `:id` (group) sai định dạng ObjectId khi gọi API packaging |
| `PKG_RECOMMENDATION_NOT_FOUND` | 500 | packaging | Lỗi hạ tầng hiếm gặp (không phải lỗi FE gây ra) |
| `PKG_NO_ACTIVE_RECOMMENDATION` | 404 | packaging | Gọi `approve`/`adjust`/`reject` khi group CHƯA từng `generate` |
| `PKG_ALREADY_DECIDED` | 409 | packaging | Gọi `approve`/`adjust`/`reject` khi recommendation ĐÃ được quyết định trước đó (không phải `pending`) |
| `WH_WAREHOUSE_NOT_FOUND` | 404/400 | warehouse | `:warehouseId` không tồn tại hoặc sai định dạng |
| `WH_ZONE_NOT_FOUND` | 404/400 | warehouse | `:zoneId` không tồn tại hoặc sai định dạng |
| `WH_INVALID_BIN_RANGE` | 400 | warehouse | `rack_from > rack_to` hoặc `level_from > level_to` khi generate bin |

> ⚠️ **`PKG_GROUP_NOT_PENDING_APPROVAL` đã khai báo trong code nhưng HIỆN CHƯA được dùng ở đâu cả** (kiểm tra trực tiếp trong source, không phải suy đoán) — nếu FE thấy mã này xuất hiện ở đâu đó ngoài dự kiến, báo lại BE ngay vì đây là dấu hiệu code có nhánh chưa document; còn nếu không bao giờ thấy mã này, không cần viết logic xử lý riêng cho nó.

---

## 8. Bảng route đầy đủ (3 module)

| Method | Route | Role | Response shape |
|---|---|---|---|
| GET | `/order-groups` | WAREHOUSE_STAFF, PACKAGING_STAFF, SHIPPING_COORDINATOR, ADMIN | camelCase (mục 3) |
| GET | `/order-groups/:id` | (như trên) | camelCase |
| GET | `/order-groups/:id/picking-list` | WAREHOUSE_STAFF, ADMIN | camelCase, KHÔNG có bin_code |
| GET | `/order-groups/:id/packaging` | 4 role fulfillment | raw snake_case, có thể `null` |
| POST | `/order-groups/:id/packaging/generate` | ADMIN (TẠM) | raw snake_case |
| POST | `/order-groups/:id/packaging/approve` | PACKAGING_STAFF, ADMIN | raw snake_case |
| POST | `/order-groups/:id/packaging/adjust` | PACKAGING_STAFF, ADMIN | raw snake_case |
| POST | `/order-groups/:id/packaging/reject` | PACKAGING_STAFF, ADMIN | `{ message }` |
| POST | `/order-groups/:id/fulfillment/pick` | WAREHOUSE_STAFF, ADMIN | camelCase |
| POST | `/order-groups/:id/fulfillment/pack` | WAREHOUSE_STAFF, ADMIN | camelCase |
| POST | `/order-groups/:id/fulfillment/ship` | SHIPPING_COORDINATOR, ADMIN | camelCase |
| POST | `/order-groups/:id/fulfillment/deliver` | SHIPPING_COORDINATOR, ADMIN | camelCase |
| POST | `/order-groups/:id/fulfillment/return` | SHIPPING_COORDINATOR, WAREHOUSE_STAFF, ADMIN | camelCase |
| POST/GET | `/warehouse/warehouses` | ADMIN | raw snake_case |
| POST/GET | `/warehouse/warehouses/:id/zones` | ADMIN | raw snake_case |
| POST | `/warehouse/zones/:id/bin-locations/generate` | ADMIN | `{ created }` |
| POST | `/warehouse/warehouses/:id/sku-bin-assignments` | ADMIN | raw snake_case |
| GET | `/warehouse/sku-bin-assignments/unassigned` | ADMIN | array |
| GET | `/warehouse/:warehouseId/picking-list/:groupId` | WAREHOUSE_STAFF, ADMIN | camelCase item fields + `zone_code`/`bin_code` snake_case (lai 2 kiểu — xem mục 5) |

---

## 9. Danh sách trường hợp FE PHẢI TỰ TEST trước khi báo "xong tích hợp"

### Happy path (bắt buộc test ít nhất 1 lần trọn luồng)
- [ ] Sync đơn → thấy group xuất hiện ở `GET /order-groups` trong vòng 15 phút
- [ ] `generate` → `approve` (không abnormal) → `pick` → `pack` → `ship` → `deliver` — đi hết 1 lượt, mỗi bước đều `GET` lại để lấy `version` mới đúng cách

### Error case — BẮT BUỘC tự gây lỗi ra để xem UI phản ứng đúng chưa
- [ ] Gọi `approve` với `expected_group_version` SAI (số cũ) → phải thấy UI hiện đúng thông báo conflict (mục 6), KHÔNG phải lỗi trắng màn hình
- [ ] Gọi `ship` khi group đang ở `picked` (bỏ qua `pack`) → phải thấy UI chặn/báo đúng lỗi `INVALID_TRANSITION`
- [ ] Nhập `actual_measured_weight_kg` lệch nhiều (VD gấp đôi ước tính) lúc `approve` → xác nhận `is_abnormal: true` trả về, UI có hiện cảnh báo
- [ ] Gọi `reject`, xong thử `approve` lại NGAY (không gọi `generate` lại) → phải nhận `PKG_NO_ACTIVE_RECOMMENDATION` (vì recommendation cũ đã `is_active: false`), UI phải hướng dẫn quay lại bước generate
- [ ] Gọi cùng 1 action (VD `pick`) 2 LẦN LIÊN TIẾP với CÙNG `expected_version` (không gọi lại GET ở giữa) → lần 2 PHẢI lỗi 409 — nếu FE thấy lần 2 vẫn thành công, có bug thật ở BE, báo ngay
- [ ] Test role sai — dùng token `WAREHOUSE_STAFF` gọi `POST .../packaging/approve` (route chỉ `PACKAGING_STAFF`/`ADMIN`) → phải nhận `403 Forbidden`
- [ ] Test `:id` không tồn tại (sửa tay vài ký tự cuối) → phải nhận `404` với đúng `error_code` tương ứng module đó
- [ ] `GET /order-groups/:id/packaging` cho 1 group CHƯA từng `generate` → phải nhận `200` với body `null`, KHÔNG phải `404`

### Warehouse riêng
- [ ] Gọi `bin-locations/generate` 2 LẦN với CÙNG range → lần 2 phải trả `created: 0`, không lỗi, không tạo trùng document (idempotent)
- [ ] `GET .../picking-list/:groupId` cho group có SKU CHƯA gán kệ → phải thấy dòng `bin_code: "CHƯA GÁN VỊ TRÍ"` xếp cuối mảng, không làm crash cả danh sách

---

## 10. Checklist nhanh trước khi FE bắt đầu code

- [ ] Đã đọc kỹ mục 0 — hiểu rõ `order-groups` trả camelCase sạch, còn `packaging`/`warehouse` trả raw snake_case — viết 2 interface riêng, không gộp chung
- [ ] Đã hiểu `fulfillmentStatus` (Order Group) và `status` (Order, từ Lazada) là **2 field hoàn toàn độc lập**, đừng lẫn lộn
- [ ] Đã implement đúng cơ chế Optimistic Concurrency: LUÔN lấy `version` mới nhất từ `GET` ngay trước khi gọi bất kỳ action ghi nào, xử lý đúng UX khi 409 (mục 6)
- [ ] Đã tính toán được nút nào nên disable trên UI dựa theo sơ đồ trạng thái (mục 2), tránh để user bấm sai thứ tự rồi mới báo lỗi
- [ ] Đã phân biệt đúng 2 route "picking list" khác nhau (mục 3 không có kệ, mục 5 có kệ thật) — dùng đúng route cho đúng màn hình
- [ ] Đã switch theo `error_code` cho toàn bộ 11 mã lỗi ở mục 7, không parse `message`
- [ ] Đã tự chạy qua đủ danh sách test case ở mục 9 (happy path + toàn bộ error case), không chỉ test đường thành công
- [ ] Đã xác nhận với BE về route TẠM `packaging/generate` (@Roles ADMIN) — route này sẽ bị thay/xóa khi AI Packaging thật (Package 3) xong, đừng thiết kế UI cuối cùng cho luồng Admin tự bấm "generate" như 1 tính năng chính thức lâu dài
