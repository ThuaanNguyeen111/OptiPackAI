# Hướng kỹ thuật triển khai AI 3D Packaging cho hiện trạng backend OptiPackAI

**Tài liệu đi kèm:** `FEEDBACK_AI_PACKAGING_REVIEW.md` (nhận xét phản biện ba tài liệu thiết kế gốc).
**Mục tiêu tài liệu này:** trình bày bối cảnh hệ thống hiện tại đầy đủ (schema, luồng dữ liệu, thuật toán đang chạy), lý do cụ thể vì sao thuật toán trong ba tài liệu gốc chưa khớp trực tiếp với hiện trạng, và hướng triển khai M0–M4 đã điều chỉnh — có khảo sát công nghệ mới nhất, tối ưu theo tiêu chí tốc độ.
**Ngày biên soạn:** 12/09/2026.

---

## Phần I — Bối cảnh hệ thống hiện tại (bắt buộc đọc trước khi code)

### I.1. Ngành hàng thật và ý nghĩa với thiết kế thuật toán

Shop Lazada dùng để đồng bộ dữ liệu và demo hệ thống kinh doanh **giày dép và quần áo**. Đây không phải giả định — là dữ liệu SKU thật sẽ chạy qua toàn bộ pipeline. Điều này xác nhận: hướng thiết kế "hồ sơ gấp/bọc theo biến thể", "quy cách túi mailer cho từng tổ hợp SKU", "giữ nguyên giày trong hộp gốc" trong ba tài liệu gốc là **đúng ngành hàng**, không phải thu hẹp phạm vi sai như đánh giá sơ bộ ban đầu. Phần còn lại của tài liệu này giữ nguyên định hướng ngành hàng đó.

### I.2. Sơ đồ luồng dữ liệu thật, từ đơn hàng tới gợi ý đóng gói

```
Lazada GetOrders (cron 10 phút)
        │
        ▼
  Order (collection "orders")
  ├─ platform, shop_id, items[] (mỗi item có seller_sku, quantity, status)
        │  gộp theo customer/address (BR-03)
        ▼
  OrderGroup (collection "order_groups")
  ├─ platform, shop_id, order_count, fulfillment_status, ...
        │  OrderGroupsService.getPackableItemsForGroup(groupId)
        │
        ├──① Order.find({consolidated_group_id}).select('items platform shop_id')
        ├──② aggregateOrderItems(allRawItems)  — GỘP theo SKU, cộng dồn quantity
        ├──③ ProductMaster.find({platform, shop_id, seller_sku: {$in: skus}})
        │      (kích thước GỐC lấy từ Lazada GetProducts, cron riêng, KHÔNG phải
        │       kích thước sau gấp/bọc)
        └──④ map thành PackableItem[] { sku, quantity, length_cm, width_cm,
               height_cm, weight_kg, is_fragile }
        │
        ▼
  PackagingController.generate(groupId)
        │
        ▼
  computeFallbackPackaging(PackableItem[])   ← ĐÂY LÀ ĐIỂM CẦN THAY THẾ
        │  hiện tại: so tổng thể tích với 3 cỡ thùng cố định, KHÔNG có tọa độ
        ▼
  PackagingRecommendationDoc (collection "packaging_recommendations")
  ├─ box_size, material_type, material_quantity,
  │  estimated_shipping_cost_vnd, is_abnormal, approval_status
        │
        ▼
  [Packaging Staff duyệt] → tự động trigger Staff Assignment + Notifications
```

Bốn bước ①–④ (do `OrderGroupsService.getPackableItemsForGroup()` thực hiện) là ranh giới hiện tại giữa "dữ liệu nghiệp vụ" và "thuật toán đóng gói". Toàn bộ công việc M0–M4 nên diễn ra **sau** bước ④, thay thế đúng lời gọi `computeFallbackPackaging()`, không đụng vào bốn bước trên.

### I.3. Cấu trúc dữ liệu chính xác tại từng điểm trong luồng

**`PackableItem`** (hợp đồng cố định, `common/interfaces/packaging.interface.ts`):

| Field | Kiểu | Nguồn | Ghi chú |
|---|---|---|---|
| `sku` | `string` | `Order.items[].seller_sku` | Đã gộp theo SKU, KHÔNG phải theo instance |
| `quantity` | `number` | Tổng số lượng cùng SKU trong nhóm đơn | Số lượng GỘP |
| `length_cm`, `width_cm`, `height_cm` | `number` | `ProductMaster.package_dimension` | Kích thước sản phẩm GỐC từ Lazada, chưa qua bước gấp/bọc |
| `weight_kg` | `number` | `ProductMaster.package_dimension.weight_kg` | |
| `is_fragile` | `boolean` | `ProductMaster.is_fragile` | |

**`PackagingRecommendationDoc`** (schema đầy đủ, xem `FEEDBACK_AI_PACKAGING_REVIEW.md` Nhận xét 1): các field hiện tại (`box_size`, `material_type`, `material_quantity`, `estimated_shipping_cost_vnd`, `is_abnormal`, `approval_status`, `is_active`) là **nền cần giữ nguyên**. M0–M4 chỉ thêm field mới, không xóa field cũ (nguyên tắc mở rộng không phá vỡ, đã áp dụng nhất quán trong toàn dự án — xem `CLAUDE.md` Rule #22).

### I.4. Ngăn xếp công nghệ thật (xác nhận từ `package.json`, không suy đoán)

| Thành phần | Phiên bản thật |
|---|---|
| Node.js runtime | Theo `engines` trong `package.json` (backend hiện hành) |
| `@nestjs/core` | `^11.0.1` |
| `mongoose` | `^9.9.2` |
| `@nestjs/schedule` | `^6.1.3` (đã dùng cho `ExpressOrderSlaScheduler`, `OrderGroupBackfillScheduler`) |
| MongoDB | Atlas (cloud), replica set mặc định — transaction đã hoạt động thật trong `packaging.service.ts` |

Không có `worker_threads` pool, không có message queue (Redis dùng cho rate-limit, không dùng cho job queue), không có tiến trình Python riêng biệt nào trong hệ thống hiện tại.

---

## Phần II — Vì sao thuật toán trong ba tài liệu gốc chưa áp dụng trực tiếp được, và hướng điều chỉnh

### II.1. Bảng đối chiếu từng thành phần thuật toán đề xuất với hiện trạng

| Thành phần đề xuất (tài liệu gốc) | Hiện trạng | Có thể áp dụng thẳng? | Điều chỉnh cần thiết |
|---|---|---|---|
| Validator hình học độc lập (M2) | Không tồn tại — `computeFallbackPackaging()` không kiểm tra hình học | Không | Viết mới hoàn toàn — đây là phần **nên ưu tiên viết đầu tiên**, đúng thứ tự M2 trước M3 mà roadmap gốc đã đề xuất đúng |
| Sinh điểm đặt ứng viên + greedy (M3) | Không tồn tại | Không viết tay từ đầu | Dùng `binpackingjs` làm lõi sinh candidate (xem II.3), bọc validator riêng bên ngoài |
| `item_key` theo instance | `PackableItem.quantity` gộp | Không trực tiếp | Sinh `item_key` nội bộ trong lớp normalize, không đổi hợp đồng interface (xem Nhận xét 3, tài liệu phản biện) |
| Catalog `packing_profile` (hồ sơ gấp/bọc) | Chưa có, `ProductMaster` chỉ có kích thước gốc | Không | Tạo collection mới `packing_profiles`, xem II.2 |
| Catalog túi mailer + fit recipe | Chưa có | Không | Hoãn sang M4A, ưu tiên nhánh `box` trước (đúng thứ tự roadmap gốc) |
| Worker threads cho solver | Chưa có hạ tầng | Không cần cho MVP | Xem II.4 — đề xuất KHÔNG dùng worker thread ở M0–M4 |
| Transaction cho confirm (M6) | Đã có pattern `session.withTransaction()` | Có, dùng lại nguyên | Không cần chuẩn bị gì thêm |

### II.2. Thiết kế collection `packing_profiles` — bổ sung tối thiểu, không trùng `ProductMaster`

Đề xuất schema mới, tuân thủ đúng convention dự án (snake_case, sub-schema riêng, `HydratedDocument`, index theo Rule #3 ESR):

```ts
@Schema({ collection: 'packing_profiles', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class PackingProfile {
  @Prop({ type: String, enum: MarketplacePlatform, required: true }) platform!: MarketplacePlatform;
  @Prop({ required: true }) shop_id!: string;
  @Prop({ required: true }) seller_sku!: string;
  @Prop({ default: '' }) variation!: string; // chuẩn hóa rỗng thống nhất, đúng khuyến nghị tài liệu gốc mục 3.2

  // Kích thước SAU gấp/bọc — khác package_dimension của ProductMaster
  @Prop({ type: PackedDimensionSchema, required: true }) packed_dimension!: PackedDimension;
  @Prop({ type: [String], default: [] }) allowed_orientations!: string[]; // vd ['LWH', 'WLH']; rỗng = mọi hướng
  @Prop({ default: false }) requires_outer_box!: boolean; // box_required, đúng thuật ngữ tài liệu 3
  @Prop({ default: false }) allow_mailer!: boolean;
  @Prop({ default: 1 }) version!: number;
  @Prop({ type: Types.ObjectId, default: null }) verified_by!: Types.ObjectId | null;
}
// Index: mapping duy nhất theo tổ hợp — Rule #5, unique ở tầng DB
PackingProfileSchema.index(
  { platform: 1, shop_id: 1, seller_sku: 1, variation: 1 },
  { unique: true },
);
```

**Quan hệ với `ProductMaster` (trả lời trực tiếp Nhận xét 4 của tài liệu phản biện):** khi tính `PackableItem` cho 1 SKU, tra `PackingProfile` trước; nếu có bản ghi, dùng `packed_dimension` thay cho `ProductMaster.package_dimension`; nếu không có, dùng thẳng `ProductMaster` làm giá trị mặc định và đánh dấu `profile_status: 'not_verified'` trong log — không chặn luồng, đúng nguyên tắc "thiếu quy cách chỉ đánh dấu chưa đánh giá, không chặn cứng" mà chính tài liệu gốc đã thiết kế đúng cho nhánh túi.

### II.3. Lựa chọn thuật toán lõi — khảo sát mới nhất, ưu tiên tốc độ

Tài liệu gốc (mục 6.1, `AI_3D_PACKAGING_OPTIMIZATION.md`) chỉ so sánh các *hướng tiếp cận* (Greedy, LAFF, Multi-start, MIP/CP-SAT, ML, RL) mà chưa khảo sát *thư viện triển khai sẵn*. Khảo sát bổ sung, tiêu chí tốc độ và mức độ sẵn sàng dùng ngay trong Node.js:

| Lựa chọn | Tốc độ dự kiến | Độ sẵn sàng | Đánh giá cho MVP |
|---|---|---|---|
| Tự viết Greedy + Extreme Points từ đầu (đúng M3 roadmap gốc) | Phụ thuộc chất lượng code, cần tối ưu tay | Thấp — cần viết + test từ số 0 | Rủi ro cao nhất về thời gian, dễ có bug hình học tinh vi (đã được chính tài liệu 2 mục 4.2 liệt kê hơn 10 ca kiểm thử bắt buộc) |
| `binpackingjs` (npm, TypeScript thuần) | Cao — thuật toán pivot-based đã tối ưu, chạy đồng bộ trong process, không qua IPC | Cao — cài đặt bằng `npm install`, API rõ ràng (`Bin`, `Item`, `Packer`) | **Khuyến nghị chính** — cắt giảm effort M3 xuống còn công việc "chuyển đổi dữ liệu vào/ra" thay vì viết thuật toán |
| MIP/CP-SAT (OR-Tools qua Python adapter) | Chậm hơn cho bài toán nhỏ do chi phí gọi liên tiến trình; nhanh về chất lượng nghiệm nếu bài toán vừa | Thấp — cần thêm runtime Python, hợp đồng liên tiến trình | Không phù hợp MVP — đúng như tài liệu gốc mục 7.2 đã kết luận, giữ nguyên |

**Kiến trúc đề xuất kết hợp** (tối ưu tốc độ VÀ đúng nguyên tắc Validator độc lập của tài liệu gốc):

```
PackableItem[] (đã có)
      │
      ▼
normalize()  — sinh item_key nội bộ, tra PackingProfile, chuẩn hóa mm nguyên
      │
      ▼
binpackingjs.Packer  — sinh candidate placement (nhanh, đã tối ưu sẵn)
      │
      ▼
validateCandidate()  — HÀM TỰ VIẾT, kiểm tra: trong biên, không chồng lấn,
      │                 hướng hợp lệ, is_fragile không bị đè, tổng khối lượng
      │                 (đúng 100% nguyên tắc Validator độc lập, mục 5.2
      │                  AI_3D_PACKAGING_OPTIMIZATION.md — GIỮ NGUYÊN)
      ▼
rankCandidates()  — thể tích ngoài → chi phí vật tư → mã thùng (đúng thứ tự
      │              đã định nghĩa ở mục 5, GIAI_THICH_THUAT_TOAN_3D_PACKAGING.md)
      ▼
PackagingRecommendationDoc (schema hiện tại, THÊM field placements[] mới)
```

**Ước tính tốc độ**: với giới hạn đề xuất trong roadmap gốc (30 item, 20 loại thùng), `binpackingjs` xử lý bài toán này trong khoảng vài chục mili-giây trên một tiến trình Node đơn — thấp hơn đáng kể ngưỡng 2 giây mà roadmap gốc đặt ra cho solver tự viết, vì thư viện đã tối ưu bước sinh điểm ứng viên (không cần tự cài `Number.isSafeInteger` guard hay tối ưu vòng lặp tay).

### II.4. Vì sao KHÔNG cần worker thread cho M0–M4 — điều chỉnh so với đề xuất gốc

Roadmap gốc (mục 6.3, `BE_PACKAGING_IMPLEMENTATION_ROADMAP.md`) đề xuất chạy solver trong worker thread pool để không chặn event loop HTTP. Với thời gian tính toán thực tế của `binpackingjs` ở quy mô 30 item/20 thùng (dưới 100ms, xem II.3), chi phí đồng bộ hóa dữ liệu qua worker thread (serialize/deserialize `postMessage`) có thể **lớn hơn** chính thời gian tính toán — worker thread chỉ có lợi khi tác vụ đủ nặng để bù lại chi phí IPC. Backend hiện tại (`packaging.service.ts`) đã chạy `computeFallbackPackaging()` đồng bộ trực tiếp trong request handler mà không có vấn đề hiệu năng ghi nhận.

**Khuyến nghị điều chỉnh**: M0–M4 chạy đồng bộ trong request, có `deadline` guard bằng `Date.now()` đơn giản (đúng pattern đã dùng trong toàn dự án cho các thao tác có giới hạn thời gian). Chỉ chuyển sang worker thread pool (đúng đề xuất gốc) nếu benchmark M5+ cho thấy input thực tế (số item/thùng lớn hơn giả định ban đầu) khiến thời gian tính toán vượt ngưỡng ảnh hưởng người dùng — quyết định dựa trên số đo thật, không phải giả định trước.

---

## Phần III — Kế hoạch triển khai M0–M4 điều chỉnh, có gắn PR cụ thể

| Mốc | Công việc | File/module bị ảnh hưởng | Không đụng vào |
|---|---|---|---|
| M0 | Cài `binpackingjs`; định nghĩa `PackingCandidate`, `Placement` type trong `packaging/interfaces/` | Thêm mới | `PackableItem` interface (giữ nguyên) |
| M1 | Schema `PackingProfile` (II.2); service tra cứu ưu tiên `PackingProfile` > `ProductMaster` | `product-master/` hoặc `packaging/` (cần quyết định vị trí — xem ghi chú) | `ProductMaster` schema (không sửa) |
| M2 | `validateCandidate()` — hàm thuần TS, unit test độc lập | Mới, trong `packaging/utils/` | — |
| M3 | Thay nội dung `computeFallbackPackaging()` bằng lời gọi `binpackingjs` + `validateCandidate()` + `rankCandidates()` | `packaging/utils/fallback-packaging.util.ts` (sửa TẠI CHỖ, không đổi tên hàm — giữ signature cũ để không phải sửa `packaging.service.ts`) | `packaging.service.ts`, route, DTO (giữ nguyên 100%) |
| M4 | Thêm field `placements: Placement[]` vào `PackagingRecommendationDoc` (mở rộng, không xóa field cũ); cập nhật `INTEGRATION_GUIDE_FULFILLMENT.md` | `schemas/packaging-recommendation.schema.ts`, tài liệu FE | Route path, role, các field response hiện có |

**Ghi chú vị trí `PackingProfile`**: đặt trong `product-master/` (mở rộng module đã có, cùng nhóm dữ liệu SKU) hay `packaging/` (gần thuật toán dùng nó nhất) là quyết định kiến trúc cần thống nhất trước M1 — cả hai đều hợp lý, tài liệu này không tự quyết thay.

---

## Phần IV — Việc cần làm ngay, không phụ thuộc quyết định kiến trúc

1. Cài thử `binpackingjs`, viết 1 script benchmark độc lập (ngoài NestJS) với đúng fixture A1/A2/B1 từ `GIAI_THICH_THUAT_TOAN_3D_PACKAGING.md` mục 7 — xác nhận thư viện cho kết quả đúng `(200,100,80)`/`(200,200,80)`/`(300,100,100)` như ví dụ tay đã tính, trước khi tích hợp vào NestJS.
2. Viết `validateCandidate()` trước, độc lập với `binpackingjs` — đúng nguyên tắc M2 trước M3 của roadmap gốc, đảm bảo có bộ kiểm tra sẵn sàng bất kể lõi sinh candidate là thư viện nào.
3. Xác nhận với thành viên phụ trách AI Packaging: đồng ý hướng "tích hợp vào module đang chạy" (Nhận xét 1, tài liệu phản biện) trước khi viết bất kỳ dòng code nào cho M0.
