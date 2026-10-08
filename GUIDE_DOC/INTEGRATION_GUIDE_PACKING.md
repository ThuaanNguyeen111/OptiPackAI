# Hướng dẫn FE tích hợp API Đóng gói (Packing)

> **Cập nhật:** 08/10/2026 · **Backend:** `be/src/modules/packing/` · **Swagger:** `/api/docs` (tag _Packing plan_, _Packing settings & reports_)
> Tài liệu này gom **mọi API đóng gói** vào một chỗ, theo thứ tự màn hình FE cần dựng. Phần lấy hàng, giao hàng, kho vẫn ở `INTEGRATION_GUIDE_FULFILLMENT.md` / `INTEGRATION_GUIDE_WAREHOUSE.md`; bảng tra route ngắn ở `API_LIST.md` mục 8.

---

## 0. Đọc trước 5 phút

### 0.1 Quy ước chung

- **Base URL:** cùng backend (mặc định `http://localhost:3000`). Mọi route cần header `Authorization: Bearer <access_token>`.
- **Response thành công:** JSON trực tiếp, field **camelCase** (`orderGroupId`, `parcelNo`). **Body gửi lên dùng snake_case** (`expected_version`, `box_code`).
- **Response lỗi:**
  ```json
  { "success": false, "error_code": "PACKING_VERSION_CONFLICT", "message": "…", "details": null, "timestamp": "…", "path": "…" }
  ```
  FE chỉ nên rẽ nhánh theo `error_code`, hiển thị `message` cho người dùng.
- **ID dùng trong URL là `groupId`** (id của nhóm đơn — `orderGroupId`), không phải id của kế hoạch. Mỗi nhóm có **tối đa 1 kế hoạch đang hoạt động**.
- **Kiện** được định danh bằng `parcelNo` (1..N trong cả nhóm, đánh lại sau mỗi lần chỉnh).
- **Món** được định danh bằng `itemKey` dạng `SKU#số` (2 áo cùng SKU = `TEE#1`, `TEE#2`).
- Đơn vị: kích thước **mm**, khối lượng **g** trong kế hoạch; riêng cân thật gửi lên là **kg**.

### 0.2 Khóa lạc quan `version` (QUAN TRỌNG)

Hầu hết thao tác ghi cần `expected_version` = `plan.version` **lúc người dùng xem**. Backend tăng `version` sau mỗi thay đổi người dùng thấy được.

```ts
// Mẫu dùng cho MỌI thao tác ghi
async function act(path: string, body: object) {
  const { plan } = await api.post(`/order-groups/${groupId}/packing-plan/${path}`, {
    expected_version: currentPlan.version,
    ...body,
  });
  setCurrentPlan(plan); // luôn thay bằng plan trả về, KHÔNG tự cộng version
}
```

- Lỗi `409 PACKING_VERSION_CONFLICT` = có người khác vừa đổi → **tải lại** `GET …/packing-plan` rồi cho người dùng thao tác lại. Không tự retry mù.
- **Ngoại lệ không cần `expected_version`:** `scan` (quét liên tục), `assign`, `GET`.
- Hướng dẫn AI (`…/guide`) **không** tăng version.

### 0.3 Vòng đời — FE chỉ cần nhớ sơ đồ này

```
Nhóm đơn:  … → picked ─(tự tính ≤10 s)→ pending_approval ─(duyệt)→ approved_for_packing ─(kiện cuối niêm phong)→ packed → (giao hàng)
Kế hoạch:       computing → ready ──────────────────────────→ approved ─(quét/bắt đầu)→ packing ───────────────→ packed
                              └─ rejected (từ chối) ─ recompute | manual | trả về lấy hàng
                 failed (lỗi dữ liệu, vd thiếu hồ sơ SKU) ─ sửa dữ liệu rồi "Tính lại"
Kiện:      pending ─(niêm phong + cân)→ sealed | held (lệch cân, chờ người khác xem) ─ accept/reweigh → sealed | reopen → pending
           sealed ─(unseal)→ pending ;   to_unpack ─(unpack)→ voided   (đơn bị hủy sau khi đã đóng)
```

**Không có API "Tạo kế hoạch".** Khi nhóm sang `picked`, cron backend tự tính (BRKGA, vài trăm ms; CP-SAT chạy nền để chứng minh tối ưu). FE chỉ **thăm dò**:

- Nhóm vừa `picked`, `GET …/packing-plan` trả `{ "plan": null }` → chờ 3 s hỏi lại.
- `plan.status === 'computing'` → chờ 3 s hỏi lại.
- `plan.status === 'failed'` → hiện `plan.failureReason` (VD "Hồ sơ SKU X chưa sẵn sàng") + nút **Tính lại** sau khi người dùng sửa dữ liệu. Backend **không** tự tính lặp.
- `plan.cpSatPending === true` → kế hoạch dùng được ngay; nhãn "tối ưu" sẽ cập nhật sau → thăm dò thưa (10 s) nếu muốn hiện nhãn mới.

### 0.4 Phân quyền theo vai trò

| Vai trò                | Làm được                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Packaging Staff**    | Xem, tính lại, duyệt, từ chối, đóng thủ công, đổi thùng/chuyển món, giao người đóng, quét/niêm phong/xem lại kiện, hoàn tác |
| **Warehouse Staff**    | Xem, đổi thùng **lúc đang đóng**, hướng dẫn, bắt đầu/quét/niêm phong, báo sự cố, tháo kiện, hoàn tác (kế hoạch còn đang đóng) |
| **Admin**              | Tất cả                                                                                                                       |
| **Store Owner**        | Xem; cài đặt + báo cáo; hoàn tác kiện **sau khi nhóm đã `packed`**                                                           |
| **Shipping Coordinator** | Chỉ xem (GET, summary)                                                                                                    |

Gửi sai vai trò → `403`. Ẩn nút theo vai trò ở FE, nhưng **không** coi đó là bảo mật.

---

## 1. Màn "Hàng chờ đóng gói" (`/app/packing`)

### 1.1 Lấy danh sách nhóm cần đóng

Lấy các nhóm đang ở các trạng thái đóng gói từ API nhóm đơn có sẵn:

```
GET /order-groups?fulfillment_status=picked
GET /order-groups?fulfillment_status=pending_approval
GET /order-groups?fulfillment_status=approved_for_packing
GET /order-groups?fulfillment_status=packed
```

(Chi tiết lọc/phân trang: `INTEGRATION_GUIDE_FULFILLMENT.md`.)

### 1.2 Tóm tắt kế hoạch hàng loạt — **1 lần gọi cho cả bảng**

```
GET /packing-plans/summary?group_ids=<id1>,<id2>,…      (tối đa 200 id)
Role: Packaging, Warehouse, Shipping, Store Owner, Admin
```

```jsonc
{
  "summaries": [
    {
      "orderGroupId": "…",
      "status": "ready",              // computing | ready | approved | packing | packed | rejected | failed
      "version": 3,
      "proof": "optimal_global",      // optimal_global | optimal_in_model | heuristic | null
      "cpSatPending": false,
      "parcels": 2,
      "packagingCostVnd": 14500,
      "failureReason": null,
      "assignedPackerId": "…",
      "parcelCounts": { "pending": 2, "sealed": 0 }   // đếm theo trạng thái kiện
    }
  ],
  "groups": [                         // để hiện mã đơn thay vì ObjectId
    {
      "orderGroupId": "…",
      "orderNumbers": ["710000123"],
      "recipientName": "N**n",
      "units": 3,
      "skus": [{ "sku": "TEE-M-WHITE", "quantity": 2 }]
    }
  ]
}
```

Gợi ý chia cột: **Cần xử lý** (`failed` / `rejected`) · **Chờ duyệt** (`ready`) · **Chờ đóng** (`approved`/`packing`) · **Đã đóng** (`packed`). Tự làm mới 10 s.

---

## 2. Màn làm việc của một nhóm (`/app/packing/:groupId`)

### 2.1 Xem kế hoạch

```
GET /order-groups/:groupId/packing-plan
Role: Packaging, Warehouse, Shipping, Store Owner, Admin
→ { "plan": PackingPlanResponse | null }
```

Các field FE dùng nhiều nhất (đầy đủ ở Swagger):

```ts
interface PackingPlan {
  id: string; orderGroupId: string;
  version: number;                       // dùng làm expected_version
  status: 'computing'|'ready'|'approved'|'packing'|'packed'|'rejected'|'failed'|'superseded';
  failureReason: string | null;
  proof: 'optimal_global'|'optimal_in_model'|'heuristic' | null;  // nhãn YẾU NHẤT các đơn
  cpSatPending: boolean;
  source: 'solver' | 'manual';           // manual = đóng thủ công sau từ chối
  totals: { parcels: number; packagingCostVnd: number; estimatedWeightG: number; avgFill: number };
  orders: {                              // mỗi đơn một khối giải thích
    orderId: string; platformOrderId: string | null;
    status: 'ok'|'partial'|'no_fit'|'canceled';      // ≠ ok ⇒ chưa duyệt được
    unplaced: { itemKey: string; code: string; reason: string }[];
    proof: string; lowerBoundParcels: number;
    explanation: string[];               // dòng "Vì sao phương án này?"
    overParcelLimit: boolean;            // true ⇒ duyệt phải kèm override_reason
    stockSuggestion: {…} | null;         // gợi ý nhập thêm thùng (xem 2.6)
  }[];
  parcels: {
    parcelNo: number; orderId: string; platformOrderId: string | null;
    status: 'pending'|'sealed'|'held'|'to_unpack'|'voided';
    box: { code: string; name: string; innerMm: Dims; outerMm: Dims; tareG: number; maxLoadG: number; priceVnd: number|null };
    placements: { itemKey: string; sku: string; step: number; x:number;y:number;z:number; dx:number;dy:number;dz:number; orientation: string; folded: boolean }[]; // tọa độ mm cho 3D
    manualLayout: boolean;               // true ⇒ không có tọa độ thật, đừng dựng 3D
    fillRatio: number; estimatedWeightG: number; actualWeightKg: number | null;
    isAbnormal: boolean;                 // lệch cân vượt ngưỡng
    materials: { name: string; quantity: number; unit: string; costVnd: number }[];
    materialsShortfall: { code: string; missing: number }[];   // thiếu thùng/vật tư/túi lúc niêm phong
    scannedCount: number; itemCount: number;
    guide: { source: 'ai'|'template'; summary: string; steps: { step:number; instruction:string; tip:string|null }[] } | null;
    // + scans[], weighings[], reviews[], unpack, sealedBy, sealedAt, boxConsumed, hasFragile
  }[];
  rejection: { reasonCode: string|null; ownerId: string|null; dueAt: string|null; overdue: boolean; resolution: 'recompute'|'manual'|null } | null;
  session: { assignedPackerId: string|null; startedAt: string|null; packMode: 'scan'|'quick'|null; parcelCounts: Record<string, number> };
  adjustments: { kind: string; detail: string; reason: string; note: string|null; at: string; oldBoxOutcome: 'unused'|'damaged'|null; wasteCostVnd: number }[];
  issues: …[]; activity: …[];
}
```

**Dựng 3D:** mỗi `placements[]` là một khối hộp tại `(x,y,z)` kích thước `(dx,dy,dz)` **mm** bên trong `box.innerMm`, vẽ theo `step` tăng dần. Món `folded: true` là hàng mềm đã gập đôi. Bỏ qua kiện có `manualLayout: true`.

### 2.2 Tính lại (có điều kiện)

```
POST …/packing-plan/recompute                 Role: Packaging, Admin
{ "expected_version": 3,                      // bắt buộc nếu đã có kế hoạch
  "exclude_box_codes": ["SAMPLE-L"],          // tùy chọn: không dùng các thùng này
  "prefer": "cheapest" }                      // tùy chọn: fewest_parcels (mặc định) | cheapest
→ { "plan": … }
```

Dùng khi: kế hoạch `failed` (sau khi sửa hồ sơ SKU), `rejected`, hoặc muốn loại thùng hỏng. Chỉ chạy được ở `ready` / `failed` / `rejected`.

### 2.3 Duyệt

```
POST …/packing-plan/approve                   Role: Packaging, Admin
{ "expected_version": 3, "override_reason": "Khách yêu cầu tách kiện" }   // override_reason chỉ bắt buộc khi orders[].overParcelLimit = true
```

| Lỗi                             | HTTP | Ý nghĩa                                                       |
| ------------------------------- | ---- | ------------------------------------------------------------- |
| `PACKING_HAS_UNPLACED`          | 409  | Còn đơn `partial`/`no_fit` — chuyển món, đổi thùng, tính lại, hoặc từ chối |
| `PACKING_PARCEL_LIMIT_EXCEEDED` | 422  | Vượt số kiện tối đa mà thiếu `override_reason`                |

Sau duyệt: kế hoạch `approved`, nhóm `approved_for_packing`.

### 2.4 Chỉnh tay trước khi duyệt (kế hoạch `ready`)

**Mã lý do dùng chung** (`reason`):

| Mã                                   | Khi nào                         |
| ------------------------------------ | ------------------------------- |
| `PRODUCT_MORE_FRAGILE_THAN_EXPECTED` | Hàng dễ vỡ hơn dữ liệu          |
| `RECOMMENDED_BOX_NOT_IN_STOCK`       | Thùng gợi ý thực tế hết         |
| `ITEM_DIMENSION_WRONG`               | Số đo hồ sơ SKU sai             |
| `ITEM_WEIGHT_WRONG`                  | Cân nặng hồ sơ SKU sai          |
| `BOX_TOO_TIGHT` / `BOX_TOO_LOOSE`    | Thùng chật / rộng quá           |
| `BOX_SPEC_WRONG`                     | Số đo thùng trong danh mục sai  |
| `TOO_MANY_PARCELS`                   | Chia quá nhiều kiện             |
| `ITEM_DAMAGED`                       | Món bị hỏng                     |
| `OTHER`                              | Khác — **bắt buộc `note`** (thiếu → 400 `PACKING_NOTE_REQUIRED`) |

Nên làm **dropdown** lấy từ danh sách trên. Lý do này đi vào báo cáo cải thiện (mục 6).

**Đổi thùng một kiện:**

```
POST …/packing-plan/parcels/:parcelNo/change-box        Role: Packaging, Admin
{ "expected_version": 3, "box_code": "SAMPLE-L", "reason": "BOX_TOO_TIGHT", "note": "tuỳ chọn" }
```

Hệ thống xếp lại đúng các món của kiện vào thùng mới qua validator. Lỗi: `422 PACKING_BOX_DOES_NOT_FIT` (không vừa), `409 PKG_BOX_OUT_OF_STOCK` (hết thùng).

**Chuyển món sang kiện khác (cùng đơn) hoặc tách kiện mới:**

```
POST …/packing-plan/parcels/:parcelNo/move-item        Role: Packaging, Admin
{ "expected_version": 3, "item_key": "TEE#2", "to_parcel_no": 2, "reason": "TOO_MANY_PARCELS" }
//  bỏ trống / null to_parcel_no  ⇒  tách ra kiện MỚI (hệ thống tự chọn thùng)
```

Sang kiện của đơn khác → `400 PACKING_MOVE_ACROSS_ORDERS`.

Mỗi lần chỉnh: nhãn chứng minh của đơn đó thành `heuristic`, `version` tăng, ghi một dòng `adjustments[]`.

### 2.5 Từ chối — có kiểm soát, không còn là ngõ cụt

```
POST …/packing-plan/reject                     Role: Packaging, Admin
{ "expected_version": 3,
  "reason": "SPECIAL_PACKING_NEEDED",           // mã: các mã ở 2.4 + SPECIAL_PACKING_NEEDED | PLAN_UNREALISTIC
  "note": "Khách yêu cầu thùng gỗ",             // bắt buộc khi reason = OTHER
  "owner_id": "<userId>" }                      // tùy chọn: giao đích danh người xử lý
```

- ⚠️ **`reason` là MÃ, không còn chữ tự do** (thay đổi từ 08/10/2026). Gửi chuỗi tự do → 400.
- Kế hoạch thành `rejected`, nhóm về `picked`, **không tự tính lại**. Có **hạn 2 giờ làm việc** (`rejection.dueAt`, `rejection.overdue`); quá hạn hệ thống nhắc 1 lần. Thông báo gửi Admin + Store Owner (hoặc `owner_id`).

**Phải kết thúc bằng một trong 3 cách** — FE hiện 3 nút khi `status === 'rejected'`:

1. **Tính lại** — `POST …/recompute` (mục 2.2).
2. **Đóng gói thủ công:**
   ```
   POST …/packing-plan/manual                    Role: Packaging, Admin
   { "expected_version": 5,
     "note": "Khách yêu cầu gói chung 1 thùng",          // 3–500 ký tự, bắt buộc
     "parcels": [
       { "order_id": "<orderId>", "box_code": "SAMPLE-L", "item_keys": ["TEE#1","TEE#2","JEAN#1"] }
     ] }
   ```
   Phủ **đủ mọi món, mỗi món đúng 1 kiện**. Hệ thống kiểm: thùng còn tồn, không quá tải. Tạo kế hoạch **mới** `source: "manual"` ở `ready` → **người KHÁC duyệt** (mục 2.3) rồi đóng như bình thường. Kiện không xếp được 3D sẽ có `manualLayout: true`.
   Lỗi: `422 PACKING_MANUAL_PACK_INVALID` (thiếu/trùng/sai món/quá tải), `409 PKG_BOX_OUT_OF_STOCK`, `409 PACKING_WRONG_PLAN_STATUS` (chỉ dùng khi đang `rejected`).
3. **Trả về lấy hàng** — khi hàng hỏng: `POST …/report-issue` (mục 3.5).

### 2.6 Hướng dẫn đóng gói từng bước (AI)

```
POST …/packing-plan/parcels/:parcelNo/guide     Role: Packaging, Warehouse, Admin
{ "regenerate": false }                         // true = viết lại dù đã có
→ { "plan": … }   // đọc plan.parcels[n].guide
```

- AI **chỉ viết lời**; vị trí/xoay/thứ tự do thuật toán quyết. Khi AI lỗi hoặc không bật → `guide.source = "template"` (câu mẫu) — **vẫn dùng được**, hiển thị nhãn "Câu mẫu".
- Giới hạn tốc độ 10 lần/phút. Không tăng `version`. Kiện `manualLayout` → `409 PACKING_GUIDE_NOT_AVAILABLE`.
- Gọi khi mở kiện lần đầu; nút "Viết lại" gửi `regenerate: true`.

### 2.7 Giải thích cho người dùng ("Vì sao phương án này?")

Dùng `plan.orders[]`:

| Field               | Hiển thị                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `proof`             | `optimal_global` "Tối ưu (đã chứng minh)" · `optimal_in_model` "Tối ưu theo mô hình" · `heuristic` chỉ hiện "Đã kiểm tra hợp lệ", **đừng** gọi là tối ưu |
| `lowerBoundParcels` | "Tối thiểu cần N kiện" — nếu bằng số kiện hiện tại ⇒ "đã đạt mức tối thiểu"                      |
| `explanation[]`     | Liệt kê nguyên văn                                                                                |
| `stockSuggestion`   | Thẻ "Nhập thêm thùng X thì còn Y kiện / rẻ hơn Z đ" (chụp lúc tính; không cập nhật sau chỉnh tay) |

---

## 3. Chế độ đóng gói (`approved` → `packing` → `packed`)

Đóng **từng kiện**: quét từng món → niêm phong + cân. Thùng + vật tư + túi zip chỉ bị trừ tồn **lúc niêm phong**.

### 3.1 (Tuỳ chọn) Giao người đóng

```
POST …/packing-plan/assign        Role: Packaging, Admin
{ "mode": "auto" }                                   // người ít việc nhất
{ "mode": "manual", "staff_id": "<packagingStaffId>" }
```

Backend cũng tự giao khi kế hoạch `ready` và báo người đó. Lỗi: `409 PACKING_NO_PACKER_AVAILABLE`, `422 PACKING_PACKER_INVALID`.

### 3.2 Bắt đầu

```
POST …/packing-plan/start         Role: Packaging, Warehouse, Admin
{ "expected_version": 6 }          // bấm lại khi đã packing: không lỗi
```

**Không bắt buộc** — quét món đầu tiên cũng tự bắt đầu. Dùng khi muốn ghi giờ bắt đầu chính xác.

### 3.3 Quét món vào kiện

```
POST …/packing-plan/parcels/:parcelNo/scan     Role: Packaging, Warehouse, Admin
{ "code": "TEE-M-WHITE",            // SKU sàn HOẶC SKU nội bộ, không phân biệt hoa/thường
  "quantity": 1,                    // tùy chọn, mặc định 1
  "scan_method": "barcode",         // barcode | manual
  "client_event_id": "dev1-1699…" } // tùy chọn nhưng NÊN gửi
→ { "plan": …,
    "scan": { "parcelNo": 1, "sku": "TEE-M-WHITE", "itemKeys": ["TEE-M-WHITE#1"], "remainingInParcel": 2, "duplicate": false } }
```

- **Không cần `expected_version`** (quét liên tục từ máy quét).
- **`client_event_id`**: sinh trên thiết bị lúc quét; mất mạng gửi lại **không bị đếm 2 lần** (`scan.duplicate: true`). Mẫu offline: lưu hàng đợi cục bộ, gửi tuần tự khi có mạng.
- Hiển thị tiến độ từ `parcels[n].scannedCount / itemCount` và `scan.remainingInParcel`.

| Lỗi                       | HTTP | Xử lý ở FE                                                             |
| ------------------------- | ---- | ---------------------------------------------------------------------- |
| `PACKING_SCAN_WRONG_PARCEL` | 409 | Bỏ vào **sai kiện** — `details.belongsToParcels` cho biết kiện đúng; báo to, rung máy |
| `PACKING_SCAN_NOT_IN_PLAN`  | 404 | Mã lạ, không thuộc nhóm này                                            |
| `PACKING_SCAN_OVER`         | 409 | Quét thừa — kiện đã đủ món đó                                          |
| `PACKING_PARCEL_WRONG_STATUS` | 409 | Kiện đã niêm phong — mở lại bằng `unseal` nếu cần                    |

Gỡ lần quét nhầm (bắt buộc lý do):

```
POST …/parcels/:parcelNo/unscan
{ "expected_version": 7, "item_key": "TEE-M-WHITE#2", "reason": "Quét nhầm món" }
```

### 3.4 Niêm phong + cân một kiện

```
POST …/packing-plan/parcels/:parcelNo/seal     Role: Packaging, Warehouse, Admin
{ "expected_version": 8, "weight_kg": 0.46 }    // cân THẬT sau khi đóng
→ { "plan": …, "completed": false, "lazadaPackSync": null }
```

- Phải **quét đủ** trước, thiếu → `409 PACKING_PARCEL_NOT_FULLY_SCANNED` (`details.missing`).
- Trừ thùng, vật tư chèn, túi zip của kiện. Hết thùng → **rollback**, `409 PKG_BOX_OUT_OF_STOCK` (đổi thùng bằng mục 4.1). Thiếu vật tư/túi **không chặn** — xem `materialsShortfall`.
- **Lệch cân** vượt ngưỡng (mặc định 20% so với `estimatedWeightG`) ⇒ kiện thành **`held`**, `isAbnormal: true` → chờ người khác xem (3.6).
- Kiện cuối cùng niêm phong xong ⇒ `completed: true`, kế hoạch + nhóm sang `packed`. `lazadaPackSync` cho biết kết quả báo "Đã đóng gói" lên Lazada (xem 3.8).

### 3.5 Báo sự cố lúc đóng (món hỏng / thiếu / sai)

```
POST …/packing-plan/report-issue               Role: Packaging, Warehouse, Admin
{ "expected_version": 8, "parcel_no": 1, "item_key": "TEE#1",
  "issue": "damaged",                      // damaged | missing | wrong_item
  "resolution": "replace",                 // replace | back_to_picking
  "warehouse_id": "<id>",                  // bắt buộc khi replace
  "bin_location_id": "<id>",               // tùy chọn: ô lấy món thay
  "note": "…" }
```

- `replace`: lấy ngay 1 món thay từ kệ (trừ tồn, sổ kho ghi `pack_replace`).
- `back_to_picking`: trả cả nhóm về lấy hàng — **chỉ khi chưa niêm phong kiện nào** (`409 PACKING_ISSUE_HAS_SEALED_PARCELS`); kế hoạch bị thay, tự tính lại sau khi lấy xong.
- Chỉ áp dụng cho kiện `pending`.

### 3.6 Xem lại kiện lệch cân (`held`)

```
POST …/packing-plan/parcels/:parcelNo/review   Role: Packaging, Admin
{ "expected_version": 9,
  "action": "accept",                    // accept | reweigh | reopen
  "reason": "SCALE_ERROR",               // SCALE_ERROR | MATERIALS_HEAVIER | PRODUCT_WEIGHT_WRONG | WRONG_ITEM_INSIDE | OTHER
  "note": "…",                           // bắt buộc khi OTHER
  "weight_kg": 0.5,                      // bắt buộc khi reweigh
  "rescan": false }                      // reopen: true = quét lại từ đầu
```

- `accept` **phải do người KHÁC người niêm phong** → `403 PACKING_SELF_REVIEW_FORBIDDEN`. FE ẩn nút nếu `sealedBy === currentUserId`.
- `reopen` mở kiện ra đóng lại, **không trừ thùng lần 2**.

### 3.7 Hoàn tất thủ công

```
POST …/packing-plan/finish    { "expected_version": 12 }
```

Chỉ dùng khi mọi kiện còn giao đã `sealed` mà kế hoạch chưa tự sang `packed` (VD đơn cuối chưa đóng vừa bị hủy). Lỗi: `409 PACKING_NOT_COMPLETE`.

### 3.8 Báo "Đã đóng gói" lên Lazada

`seal` / `review` / `finish` / `pack` trả `lazadaPackSync` khi nhóm vừa `packed`:

```jsonc
{ "status": "success" | "partial" | "failed" | "skipped" | "disabled", … }
```

- `disabled` = cầu dao `LAZADA_WRITE_APIS_ENABLED` đang tắt (mặc định ở dev) — **không phải lỗi**.
- `failed`/`partial` **không** chặn đóng gói; hiện cảnh báo + nút thử lại: `POST /order-groups/:id/lazada-pack/retry` (xem `INTEGRATION_GUIDE_FULFILLMENT.md`).

### 3.9 Lối tắt: cân cả nhóm một lần (không quét)

```
POST …/packing-plan/pack       Role: Packaging, Warehouse, Admin
{ "expected_version": 6,
  "parcels": [ { "parcel_no": 1, "weight_kg": 0.46 }, { "parcel_no": 2, "weight_kg": 1.2 } ] }   // ĐỦ mọi kiện chưa niêm phong, mỗi kiện 1 lần
```

Tự ghi quét `bypass` (đánh dấu "đóng nhanh"). Kiện lệch cân vẫn `held`. Bị chặn `409 PACKING_SCAN_REQUIRED` khi cài đặt `requireScan = true`. Sai danh sách cân → `400 PACKING_PACK_WEIGHTS_MISMATCH`.

---

## 4. Thao tác đặc biệt khi đang đóng

### 4.1 Đổi thùng khi **đang đóng** (kiện chưa niêm phong)

```
POST …/packing-plan/parcels/:parcelNo/change-box-in-session     Role: Packaging, Warehouse, Admin
{ "expected_version": 8, "box_code": "SAMPLE-L", "reason": "BOX_TOO_TIGHT", "note": "…",
  "old_box_outcome": "unused" }        // BẮT BUỘC: unused | damaged
```

| `old_box_outcome` | Tốn gì                                                                |
| ----------------- | --------------------------------------------------------------------- |
| `unused`          | Không tốn — thùng cũ trả lại kệ                                       |
| `damaged`         | Trừ 1 thùng cũ khỏi tồn + ghi sổ **hao hụt** (`waste`) kèm chi phí    |

- Giữ nguyên các lần quét đã có. Xếp lại qua validator.
- Lỗi: `409 PACKING_PARCEL_WRONG_STATUS` (đã niêm phong), `409 PACKING_WRONG_PLAN_STATUS` (chưa duyệt — dùng `change-box` ở 2.4), `400 PACKING_SAME_BOX` (trùng thùng cũ mà khai `unused`), `422 PACKING_BOX_DOES_NOT_FIT`, `409 PKG_BOX_OUT_OF_STOCK`.

### 4.2 Hoàn tác niêm phong (`unseal`)

```
POST …/packing-plan/parcels/:parcelNo/unseal    Role: Packaging, Warehouse, Store Owner, Admin
{ "expected_version": 10, "reason": "BOX_TOO_TIGHT", "note": "…",
  "box_condition": "reusable",          // reusable (dùng lại, KHÔNG trừ lần 2) | damaged (mất, niêm phong lại trừ cái mới)
  "rescan": false }
→ { "plan": …, "wasPacked": false, "warnings": [] }
```

| Tình huống                              | Ai làm được            | Kết quả                                                       |
| --------------------------------------- | ---------------------- | ------------------------------------------------------------- |
| Kế hoạch còn `packing`                  | Packaging, Warehouse, Store Owner, Admin | Kiện về `pending`                          |
| Nhóm đã `packed`, chưa giao             | **Chỉ Admin / Store Owner** (`403 PACKING_UNSEAL_NOT_ALLOWED` với người khác) | Kế hoạch `packed→packing`, nhóm về `approved_for_packing` |
| Đã giao (`shipped`+)                    | Không ai               | `409 PACKING_WRONG_PLAN_STATUS` — dùng luồng hoàn hàng        |

Khi `wasPacked: true`, hiện nguyên văn `warnings[]`: **Lazada không hoàn tác được lệnh Pack**, trạng thái trên sàn giữ nguyên.

### 4.3 Tháo kiện của đơn bị hủy sau khi đã đóng (`to_unpack`)

Khi một đơn trong nhóm bị hủy sau khi đã bắt đầu đóng, các kiện của đơn đó chuyển `to_unpack` (FE hiện banner đỏ) và **chặn giao hàng** (`409 SHP_PARCELS_TO_UNPACK`) tới khi tháo xong:

```
POST …/packing-plan/parcels/:parcelNo/unpack    Role: Packaging, Warehouse, Admin
{ "expected_version": 11,
  "box_condition": "reusable",                           // reusable (vào kho tái sử dụng) | damaged
  "recovered_materials": [ { "code": "FOAM-CORNER", "quantity": 4, "condition": "reusable" } ],   // tùy chọn
  "note": "…" }
→ { "plan": …, "completed": false, "restocked": 3, "withoutLocation": 0, "box": "SAMPLE-M",
    "materials": [ { "code": "FOAM-CORNER", "quantity": 4, "outcome": "reused" } ], "lazadaPackSync": null }
```

Hàng về đúng ô đã lấy (`restocked`); `withoutLocation > 0` = có món không tìm lại được ô → kho đối soát tay. Vật tư khai thu hồi phải bật "reusable" trong danh mục (`400 PKG_MATERIAL_NOT_REUSABLE`).

---

## 5. Danh mục & cài đặt FE cần cho các màn

### 5.1 Thùng — chọn thùng khi đổi thùng / đóng thủ công

```
GET /packaging/boxes?active=true     Role: Packaging, Warehouse, Store Owner, Admin
→ [{ id, code, name, inner, outer, tareG, maxLoadG, priceVnd,
     quantityOnHand, reserved, available, reorderLevel, stockStatus: 'in_stock'|'low_stock'|'out_of_stock', … }]
```

Khóa nút/chọn thùng khi `available <= 0`. Nhập thùng: `POST /packaging/boxes/:id/stock-in { quantity, note? }` (Admin, Warehouse). Thêm/sửa thùng: Admin (`POST` / `PATCH /packaging/boxes/:id`). Sổ kho: `GET /packaging/boxes/:id/movements`.

### 5.2 Túi zip

```
GET /packaging/bags?active=true     → [{ code, name, widthMm, lengthMm, priceVnd, quantityOnHand, reorderLevel, … }]
POST /packaging/bags/:id/stock-in   { "quantity": 200, "note": "…" }     Role: Warehouse, Admin
```

Túi được chọn **khi đo hồ sơ SKU** (`PUT /product-master/:id/packaging-profile`): quá nhỏ → `422 PM_ZIP_BAG_TOO_SMALL` (`details.suggestedZipBagCode`); response PUT luôn có `suggestedZipBagCode` để FE điền sẵn.

### 5.3 Vật tư chèn

`GET /packaging/materials` (danh mục + tồn), luật chọn vật tư `GET/PUT /packaging/materials/rules`. Số lượng trong mỗi kiện là **ước lượng theo luật** (không chiếm thể tích) — đừng trình bày như lượng đệm tính chính xác.

### 5.4 Cài đặt đóng gói

```
GET /packing/settings     Role: Packaging, Warehouse, Store Owner, Admin
PUT /packing/settings     Role: Store Owner, Admin      (field không gửi ⇒ giữ nguyên)
{ "expected_version": 2,
  "abnormal_weight_threshold": 0.2,       // 0.01–1: ngưỡng lệch cân
  "fragile_cushion_mm": 5,                // 0–50: đệm quanh hàng dễ vỡ (áp cho LẦN TÍNH TIẾP THEO)
  "default_prefer": "fewest_parcels",     // | cheapest
  "max_parcels_per_order": 3,             // null = bỏ giới hạn
  "allow_reused_box_for_fragile": false,
  "require_scan": true }
```

Hai người lưu cùng lúc → người sau `409 PACKING_SETTINGS_CONFLICT` (tải lại). `version: null` = đang dùng mặc định trong code.

---

## 6. Báo cáo (Store Owner, Admin)

### 6.1 Hiệu suất

`GET /packing/reports/summary?from&to&staff_id` — thời gian chờ/đóng, tỷ lệ lệch cân, duyệt nguyên vẹn, đạt số kiện tối thiểu, quét kiểm, chi phí, sự cố, theo nhân viên. `from`/`to` ISO (mặc định 30 ngày); sai khoảng ngày → `400 PACKING_INVALID_DATE_RANGE`.

### 6.2 Vòng phản hồi — Admin cải thiện gợi ý

```
GET /packing/reports/feedback?from&to&min_count=3
→ { "report": {
      "plans": 120, "followedRate": 0.82,          // tỷ lệ kế hoạch được làm ĐÚNG gợi ý
      "adjustedPlans": 14, "rejectedPlans": 4,
      "byReason": [{ "reason": "BOX_TOO_TIGHT", "count": 6 }],
      "bySku":   [{ "sku": "TEE-M-WHITE", "reason": "ITEM_DIMENSION_WRONG", "count": 4 }],
      "byBox":   [{ "boxCode": "SAMPLE-M", "reason": "RECOMMENDED_BOX_NOT_IN_STOCK", "count": 5 }],
      "rejections": { "total": 4, "open": 1, "overdue": 0, "byReason": […], "resolvedBy": { "recompute": 2, "manual": 1 } },
      "waste": { "events": 2, "costVnd": 6000, "byBox": [{ "boxCode": "SAMPLE-M", "count": 2, "costVnd": 6000 }] },
      "suggestions": [{
        "target": { "type": "sku", "code": "TEE-M-WHITE" },     // sku | box | settings
        "reason": "ITEM_DIMENSION_WRONG", "count": 4,
        "message": "SKU TEE-M-WHITE bị báo sai kích thước 4 lần — đo lại sau khi gấp/bọc.",
        "action": { "label": "Đo lại hồ sơ SKU", "method": "PUT", "route": "/product-master/:id/packaging-profile" } }]
} }
```

`suggestions` chỉ là **đề xuất** — FE hiện thành thẻ và đặt nút dẫn tới màn sửa tương ứng (`action.label`); không tự gọi `action.route`. Khi trình bày: "gợi ý tốt lên nhờ dữ liệu đầu vào đúng hơn", không phải hệ thống tự học.

---

## 7. Bảng mã lỗi

Mã bắt đầu `PACKING_` thuộc module này; `PKG_` / `PM_` / `SHP_` của module liên quan.

| `error_code`                          | HTTP | Ý nghĩa & hành động FE                                                   |
| ------------------------------------- | ---- | ------------------------------------------------------------------------ |
| `PACKING_INVALID_ID`                  | 400  | `groupId` sai định dạng                                                  |
| `PACKING_PLAN_NOT_FOUND`              | 404  | Nhóm chưa có kế hoạch                                                    |
| `PACKING_PLAN_COMPUTING`              | 409  | Đang tính — chờ rồi hỏi lại                                              |
| `PACKING_WRONG_PLAN_STATUS`           | 409  | Thao tác không hợp trạng thái kế hoạch/nhóm → tải lại, ẩn nút            |
| `PACKING_VERSION_CONFLICT`            | 409  | Có người khác vừa đổi → **tải lại**                                      |
| `PACKING_HAS_UNPLACED`                | 409  | Duyệt khi còn đơn chưa xếp hết                                           |
| `PACKING_PARCEL_LIMIT_EXCEEDED`       | 422  | Vượt số kiện tối đa — cần `override_reason`                              |
| `PACKING_PARCEL_NOT_FOUND`            | 404  | Không có kiện đó                                                         |
| `PACKING_ITEM_NOT_IN_PARCEL`          | 404  | Món không nằm trong kiện                                                 |
| `PACKING_MOVE_ACROSS_ORDERS`          | 400  | Chuyển món sang kiện của đơn khác                                        |
| `PACKING_BOX_DOES_NOT_FIT`            | 422  | Thùng không xếp vừa (validator từ chối)                                  |
| `PACKING_SAME_BOX`                    | 400  | Đổi sang đúng thùng đang dùng mà khai chưa dùng                          |
| `PACKING_NOTE_REQUIRED`               | 400  | Lý do `OTHER` thiếu `note`                                               |
| `PACKING_MANUAL_PACK_INVALID`         | 422  | Đóng thủ công: thiếu/trùng/sai món, quá tải thùng                        |
| `PACKING_GUIDE_NOT_AVAILABLE`         | 409  | Kiện không có cách xếp để hướng dẫn                                      |
| `PACKING_PARCEL_WRONG_STATUS`         | 409  | Thao tác không hợp trạng thái kiện                                       |
| `PACKING_SCAN_NOT_IN_PLAN`            | 404  | Mã quét không thuộc kế hoạch                                             |
| `PACKING_SCAN_WRONG_PARCEL`           | 409  | Quét vào sai kiện (`details.belongsToParcels`)                           |
| `PACKING_SCAN_OVER`                   | 409  | Quét thừa                                                                |
| `PACKING_SCAN_NOT_FOUND`              | 404  | Gỡ lần quét không tồn tại                                                |
| `PACKING_PARCEL_NOT_FULLY_SCANNED`    | 409  | Niêm phong khi chưa quét đủ                                              |
| `PACKING_SCAN_REQUIRED`               | 409  | Cài đặt bắt buộc quét — lối tắt `pack` bị chặn                           |
| `PACKING_WEIGHT_REQUIRED`             | 400  | `reweigh` thiếu `weight_kg`                                              |
| `PACKING_PACK_WEIGHTS_MISMATCH`       | 400  | Danh sách cân của `pack` không khớp đúng các kiện chưa niêm phong        |
| `PACKING_SELF_REVIEW_FORBIDDEN`       | 403  | Tự chấp nhận kiện mình niêm phong                                        |
| `PACKING_UNSEAL_NOT_ALLOWED`          | 403  | Nhóm đã `packed`: chỉ Admin/Store Owner hoàn tác                         |
| `PACKING_NOT_COMPLETE`                | 409  | `finish` khi còn kiện chưa niêm phong/đang giữ                           |
| `PACKING_ISSUE_HAS_SEALED_PARCELS`    | 409  | `back_to_picking` khi đã niêm phong kiện                                 |
| `PACKING_REPLACEMENT_WAREHOUSE_REQUIRED` | 400 | `replace` thiếu `warehouse_id`                                         |
| `PACKING_PACKER_INVALID`              | 422  | Người được giao không phải Packaging Staff đang hoạt động                |
| `PACKING_NO_PACKER_AVAILABLE`         | 409  | Không có Packaging Staff nào để tự giao                                  |
| `PACKING_RECOVER_MATERIAL_INVALID`    | 400  | Thu hồi vật tư không có trong kiện / vượt số lượng                       |
| `PACKING_SETTINGS_CONFLICT`           | 409  | Cài đặt vừa bị người khác lưu                                            |
| `PACKING_INVALID_DATE_RANGE`          | 400  | `from`/`to` báo cáo sai                                                  |
| `PKG_BOX_OUT_OF_STOCK`                | 409  | Hết thùng (`details.boxCode`)                                            |
| `PKG_MATERIAL_NOT_REUSABLE`           | 400  | Vật tư không bật "reusable"                                              |
| `PM_ZIP_BAG_TOO_SMALL`                | 422  | Túi zip không vừa gói đã đo                                              |
| `SHP_PARCELS_TO_UNPACK`               | 409  | (Giao hàng) còn kiện phải tháo                                           |

---

## 8. Công thức dựng màn hình (gợi ý)

### 8.1 Màn làm việc — trạng thái nào hiện gì

| `plan.status` | Hiện                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| `null` / `computing` | Màn "Đang tính phương án…", thăm dò 3 s                                                                  |
| `failed`      | Lỗi `failureReason` + **Tính lại**                                                                              |
| `ready`       | 3D + danh sách kiện + giải thích; nút **Duyệt**, **Đổi thùng**, **Chuyển món**, **Tính lại**, **Từ chối**       |
| `rejected`    | Banner đỏ + hạn (`rejection.dueAt`) + 3 nút **Tính lại / Đóng thủ công / Trả về lấy hàng**                      |
| `approved`    | Nút **Bắt đầu đóng**; vẫn đổi thùng (4.1) được                                                                  |
| `packing`     | Chế độ đóng: từng kiện → quét → cân; kiện `held` có nút xem lại; kiện `to_unpack` có nút Tháo                   |
| `packed`      | Tóm tắt + nút **Hoàn tác niêm phong** (chỉ Admin/Store Owner)                                                   |

### 8.2 Thứ tự khuyến nghị trong chế độ đóng một kiện

1. Mở kiện → gọi `…/guide` (lần đầu) → hiện `summary` + `steps`.
2. Quét từng món → thanh tiến độ `scannedCount/itemCount`; sai kiện thì rung/báo to.
3. Đủ món → bật ô nhập cân → `seal`.
4. Nếu `status === 'held'` → hiện "Chờ người khác xem lại"; người khác mở `review`.
5. Còn kiện khác → sang kiện kế; hết → `completed: true` → màn hoàn tất + hiện `lazadaPackSync`.

### 8.3 Thăm dò & làm mới

| Màn                  | Chu kỳ  | Khi nào dừng                                      |
| -------------------- | ------- | ------------------------------------------------- |
| Hàng chờ             | 10 s    | Rời trang                                         |
| Đang tính            | 3 s     | `status` ≠ `computing`/null                       |
| Đang đóng nhiều máy  | 5 s     | Rời trang (để thấy kiện người khác vừa niêm phong) |

### 8.4 Checklist test FE (chạy tay trên Swagger/Postman trước khi tích hợp)

- [ ] Nhóm `picked` → ≤ 10 s sau có `plan` `ready`
- [ ] Duyệt khi còn đơn `no_fit` → 409 `PACKING_HAS_UNPLACED`
- [ ] Gửi `expected_version` cũ → 409 `PACKING_VERSION_CONFLICT`
- [ ] Từ chối bằng mã → thông báo Admin tăng; gửi chữ tự do → 400
- [ ] Đóng thủ công thiếu 1 món → 422; đủ món → kế hoạch mới `source: "manual"`, người khác duyệt được
- [ ] Quét sai kiện → 409 kèm `belongsToParcels`; gửi lại cùng `client_event_id` → `duplicate: true`
- [ ] Niêm phong khi chưa quét đủ → 409; cân lệch > 20% → kiện `held`; tự chấp nhận → 403
- [ ] Đổi thùng lúc đóng `damaged` → báo cáo feedback `waste.events` tăng
- [ ] `unseal` `reusable` rồi niêm phong lại → tồn thùng không giảm thêm
- [ ] Nhóm `packed`: Packaging Staff gọi `unseal` → 403; Admin gọi → nhóm về `approved_for_packing`
- [ ] Hủy 1 đơn trong nhóm đã đóng → kiện `to_unpack`; giao hàng bị chặn tới khi `unpack`

---

## 9. Thay đổi so với FE bản `main` (đang gọi route cũ)

| FE đang gọi (đã gỡ)               | Thay bằng                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /order-groups/:id/packaging` | `GET /order-groups/:id/packing-plan` (1 kế hoạch cho cả nhóm, `parcels[]`)          |
| `POST …/packaging/generate`       | Không còn — tự tính khi nhóm `picked`; muốn tính lại: `…/packing-plan/recompute`    |
| `POST …/packaging/approve`        | `POST …/packing-plan/approve`                                                       |
| `POST …/packaging/adjust`         | `…/parcels/:no/change-box` hoặc `…/move-item`                                       |
| `POST …/packaging/reject`         | `…/packing-plan/reject` (**`reason` là mã**) rồi `recompute` / `manual`             |
| `POST …/fulfillment/pack`         | Có quét: `start` → `scan` → `seal`. Đóng nhanh: `…/packing-plan/pack`               |
| Khóa `expected_group_version`     | Khóa `expected_version` = `plan.version`                                            |

Thay đổi gây gãy từ 08/10/2026: `reject.reason` đổi từ chuỗi tự do sang **mã lý do** (kèm `note`).
