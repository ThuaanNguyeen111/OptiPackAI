# Đặc tả: Mô hình 3D của sản phẩm dùng trong đóng gói

> Trạng thái: **đã chốt nghiệp vụ, chưa code** (27/11/2026). Các quyết định Q1–Q19 được chốt qua phỏng vấn với chủ sản phẩm; mã quyết định ghi trong ngoặc để tra ngược.

## 0. Tóm tắt một đoạn

Mỗi SKU người bán (`product_master`) muốn được đóng gói phải trỏ tới **một mô hình 3D trong thư viện dùng chung** (`product_models`). Mô hình chỉ quyết định **dáng** để hiển thị; kích thước luôn lấy theo số đo SKU, bộ giải vẫn tính bằng khối hộp như hiện nay. Có 4 nguồn mô hình: **mô hình theo loại** (9 file GLB có sẵn), **mô hình riêng** (tải file GLB), **dựng từ hình cơ bản** (hộp/trụ/chai/tuýp, vẽ từ thông số, không cần file), và **hình đại diện** (hộp dựng từ kích thước). Quần áo, đầm, túi xách bắt buộc dùng mô hình có dáng thật vì bước gập/cho vào túi cần dáng đó. MVP có thêm tab "Mô hình 3D" tối thiểu để tra SKU đang dùng và thay/ngừng dùng an toàn.

---

## 1. Hiện trạng (có dẫn chiếu)

### 1.1 Sản phẩm và kích thước

| Kết luận | Dẫn chiếu |
|---|---|
| Đóng gói chỉ đọc **`product_master`** (1 bản ghi / sàn + shop + seller_sku). Biến thể là bản ghi riêng, không nhúng. | `be/src/modules/product-master/schemas/product-master.schema.ts`, index unique `:141` |
| Kích thước dùng để tính là **`dimension`** = số kho đo **sau khi gập / cho vào túi zip** (kích thước "bao bì riêng" của món). `marketplace_dimension` (sàn khai) **không** được dùng. Không có trường "kích thước món trần". | schema `:42`, `:46`; `order-groups.service.ts:773-776` |
| Chỉ **`confirmPackagingProfile`** ghi `dimension` và chuyển `packaging_profile_status` sang `ready`; nó cũng gỡ chặn nhóm đơn (`releasePackingBlocks`). | `product-master.service.ts:376-474`, `:482` |
| Đồng bộ sàn (`upsertProducts`) chỉ ghi `marketplace_*`, SKU mới luôn `needs_measurement`. Nguồn gọi: cron giờ/ngày, `POST /product-master/sync`, webhook `product_updated`, AURELLE app-key. Không có import CSV. | `product-master.service.ts:242-281`, `product-master-sync.scheduler.ts`, `marketplace-webhooks.service.ts:185-199` |
| `master_skus` (SKU nội bộ) có kích thước riêng nhưng **đóng gói không đọc**; nối với seller SKU qua `marketplace-sku-mapping`. | `master-skus/schemas/master-sku.schema.ts:11-30` |
| Thông số chuẩn AOFP-343 không phải trường schema mà là script một lần, khoá theo tiền tố mã mẫu. | `be/scripts/apply-standard-packing-specs.ts:16-67` |
| Form nhập hồ sơ đóng gói: `PackagingProfileForm` → `PUT /product-master/:id/packaging-profile`. | `fe/src/pages/admin-warehouse/CatalogPanels.tsx:1096-1308`, `product-master.controller.ts:169` |

### 1.2 Cổng "được đóng gói"

- `isPackagingProfileReady` = `ready` + có `is_fragile` + đủ 4 số đo (`order-groups.service.ts:142-165`).
- Thiếu → `ORD_GROUP_PACKAGING_PROFILE_NOT_READY` (HTTP 422, `details.reason: missing_product_master | needs_measurement`), kế hoạch `failed`, nhóm đơn ghi `packing_blocked_*`, gửi thông báo `PACKING_BLOCKED` (`order-groups.service.ts:736-768`, `packing-plan.service.ts:755`).
- Loại sản phẩm và mô hình **không** được kiểm tra ở đâu cả.

### 1.3 Bộ giải chỉ biết khối hộp

- `PackableItem` chỉ có L×W×H, khối lượng, dễ vỡ, `orientation_rule`, chịu đè; `product_category` và các trường túi zip ghi rõ "chỉ cho hướng dẫn/3D" (`be/src/common/interfaces/packaging.interface.ts:7-31`).
- `expandToUnits` đổi cm→mm, cộng đệm dễ vỡ, quần áo chỉ xoay quanh trục đứng, gập theo `foldUnit` tối đa 2 lần (`be/src/modules/packaging/engine/units.ts`).
- NestJS → Python (`POST ${PACKER_URL}/v1/check-combos`) chỉ gửi `dx/dy/dz` từng hướng; **không** có SKU, loại hay hình học (`be/src/modules/packing/solver/cp-sat.ts:33-103`, `packer/packer/models.py`).
- **Kết luận:** mô hình 3D là dữ liệu **hiển thị**, không ảnh hưởng phép tính. MVP không cần va chạm theo hình dáng thật — bộ giải đã an toàn vì mọi món được coi là khối bao của nó.

### 1.4 Trình xem 3D

- Chọn GLB **theo `product_category`**, không theo SKU (`fe/src/components/packing/product-models.ts:30-42`); `sandals`, `other` không có mô hình → khối màu (`:81-107`). BE chỉ gửi `itemProfiles {sku, productCategory, zipBagCode, zipBagFolded}` (`packing-plan.controller.ts:582-587`).
- `fitToBlock` xoay cho trục dài nhất khớp, quần áo **giãn từng trục**, đồ cứng **co đều** và căn giữa (`fe/src/components/packing/scene/model-rigs.ts:132-185`). Chuỗi `orientation` của placement **không** được đọc.
- Animation gập áo + cho vào túi zip **nằm trong file GLB** (xương `fold_*`, cụm túi zip, `ClipPhases.foldEnd/bagEnd` trong `model-rigs.ts`). Bước chuẩn bị theo loại (`shoeBox`, `bagPrep`, `caseIn`), đặt vào thùng theo bước và vật liệu chèn (`MaterialsScene`) là **chung cho cảnh**, không phụ thuộc file.
- Mobile không có 3D riêng: WebView mở `/embed/packing/<groupId>` (`mobile/lib/features/packing/parcel_3d_screen.dart`).
- `fe/public/models/CREDITS.md`: hầu hết dòng trống cột Nguồn/Giấy phép (= "chưa kiểm chứng").

### 1.5 Lưu trữ

- `packing_plans.item_profiles` chỉ chụp loại + túi zip; **không** chụp mô hình (`packing-plan.schema.ts:422-429`). Đổi file GLB là mọi kế hoạch cũ hiển thị khác đi.
- Tải file: `POST /proof-photos` ký Cloudinary bằng tay, **ép thành JPG** (`proof-photos.service.ts:80-150`) → GLB không đi được đường này. Cơ chế ký (`signCloudinaryParams`) và biến môi trường `CLOUDINARY_*` dùng lại được.

---

## 2. Quyết định đã chốt

| # | Quyết định |
|---|---|
| Q1 | Thư viện riêng `product_models`; `product_master.model_id` trỏ tới. 9 mô hình theo loại hiện có thành mục có sẵn. |
| Q2 | Mô hình là điều kiện của `ready` và của `isPackagingProfileReady` (lý do mới `missing_model`). Lưu nháp / SKU chưa đóng gói không bị ép. |
| Q3 | Hình hộp đại diện chỉ hợp lệ cho đồ cứng. Quần áo, đầm, túi xách phải dùng mô hình có dáng thật. |
| Q4 → Q16 | Mô hình chỉ là dáng, **luôn giãn đúng số đo SKU theo từng trục**. Không chặn vì lệch tỉ lệ; chỉ nhắc khi giãn lệch > 35%. |
| Q5 | File GLB (glTF 2.0) ≤ 10 MB, Cloudinary `raw`, kiểm tra ở server bằng `@gltf-transform/core`. |
| Q6 | MVP có tab "Mô hình 3D" tối thiểu. |
| Q7 | Chụp mô hình (id + phiên bản + đường dẫn/thông số) vào kế hoạch; không xoá cứng, chỉ "ngừng dùng". |
| Q8 | Migrate: gắn mô hình theo loại; `sandals`/`other` gắn hình hộp đại diện; không SKU nào bị chặn. |
| Q9 | Không kế thừa ngầm; form gợi ý mô hình của SKU anh em. |
| Q10 | Bắt buộc ghi nguồn khi tải lên. |
| Q11 | Quyền trang mới `product_models`. Tải lên + gắn: ai xác nhận được hồ sơ đóng gói. Thay file + ngừng dùng: Admin. |
| Q12, Q13 | Theo Q16: thay file hay sửa số đo **không** bị chặn vì tỉ lệ. |
| Q14 | Không thêm loại sản phẩm. Loại vẫn quyết định bước hướng dẫn; mô hình chỉ quyết định hình. |
| Q15 | Bản ghi chỉ tạo khi tải + kiểm tra xong; mô hình chưa gắn giữ lại, lọc được, không tự xoá. |
| Q17 | Dựng từ hình cơ bản: hộp (bo góc), trụ, chai, tuýp; lưu thông số vào thư viện. |
| Q18 | 4 nhãn nguồn (xem 3.2). |
| Q19 | MVP: mô hình quần áo tải lên phải có xương gập; thiếu thì từ chối. Đợt 2: "Gập tự động" cho file trải phẳng. |

---

## 3. Business rules

### 3.1 Định nghĩa

- **Mô hình** = một mục trong `product_models`, có `source` ∈ `category | upload | primitive` và `kind` ∈ `garment | rigid`.
- **Mô hình hợp lệ** (kiểm tra ở server, lúc tạo/thay):
  1. `upload`: đọc được là glTF 2.0 nhị phân (magic `glTF`, version 2), ≤ 10 MB, có ít nhất 1 mesh; khối bao > 0 trên cả 3 trục và nằm trong **1 cm – 2 m** (glTF quy ước mét; ngoài khoảng = sai đơn vị).
  2. Quy ước trục: **+Y là chiều cao của món** (chuẩn glTF). Chiều dài/rộng lấy theo X/Z của khối bao; xem trước trong form để người dùng thấy ngay nếu file "nằm sai".
  3. `kind = garment` (bắt buộc với loại quần áo/đầm) phải có clip animation tác động xương `fold_*` và cụm túi zip đúng quy ước của mô hình theo loại (`GARMENT_HIDDEN_NODES`, `ZIPBAG_ROOT_NODE`).
  4. `primitive`: `shape` hợp lệ, thông số trong khoảng cho phép (bảng 5.3).
  5. Có tải được và hiển thị được: server parse thành công ⇒ coi là tải được; FE vẫn bọc `ModelBoundary` và rơi về khối hộp nếu lỗi lúc chạy.
- **Tương thích loại ↔ mô hình:**

| Loại SKU | Nguồn được phép |
|---|---|
| `t_shirt, shirt, jacket, shorts, trousers, dress` | `category` (garment) hoặc `upload` có `kind=garment` |
| `bag` | `category` hoặc `upload` |
| `shoes, sandals, accessory, other` | mọi nguồn, kể cả hình đại diện |

### 3.2 Nhãn hiển thị

| Nguồn | Nhãn |
|---|---|
| `category` | **Mô hình theo loại** |
| `upload` | **Mô hình riêng** |
| `primitive` trụ / chai / tuýp / hộp bo góc | **Dựng từ hình cơ bản** |
| `primitive` hộp không bo góc | **Hình đại diện — dựng từ kích thước** |

### 3.3 Bảng quy tắc

| # | Điều kiện | Hành vi UI | Kiểm tra backend | Thông báo / mã lỗi |
|---|---|---|---|---|
| R1 | Xác nhận hồ sơ đóng gói mà chưa chọn mô hình | Nút "Xác nhận" bị khoá, mục Mô hình 3D viền đỏ | `confirmPackagingProfile`: `model_id` bắt buộc | `PM_MODEL_REQUIRED` — "Chọn mô hình 3D trước khi xác nhận hồ sơ đóng gói" |
| R2 | Mô hình không hợp với loại SKU (vd. áo thun + chai) | Mô hình không đúng bị làm mờ trong danh sách chọn, kèm lý do | `confirmPackagingProfile`, `PUT /product-master/:id/model` | `PM_MODEL_CATEGORY_MISMATCH` — "Áo thun cần mô hình quần áo có bước gập" |
| R3 | Nhóm đơn chứa SKU `ready` nhưng `model_id` rỗng (dữ liệu lỗi/ngoại lệ sau migrate) | Nhóm đơn hiện "Bị chặn: thiếu mô hình 3D", nút tới form SKU | `isPackagingProfileReady` | `ORD_GROUP_PACKAGING_PROFILE_NOT_READY`, `reason: missing_model` |
| R4 | Gắn/đổi mô hình cho SKU đã `ready` | Không phải xác nhận lại số đo | `PUT /product-master/:id/model`; **không** đổi `profile_confirmed_at` (dáng không ảnh hưởng tính) | — |
| R5 | Đồng bộ sàn / webhook / API | Không có UI | `upsertProducts` **không bao giờ** ghi `model_id` hay `ready` | — |
| R6 | Tải file không phải GLB / > 10 MB / parse lỗi | Báo dưới ô tải, giữ form | `POST /product-models/upload` | `PM3D_INVALID_FILE` — "File phải là GLB (glTF 2.0), tối đa 10 MB" |
| R7 | Khối bao ngoài 1 cm – 2 m | Như R6 | như trên | `PM3D_BAD_UNITS` — "Mô hình rộng {x} m — có thể sai đơn vị (glTF dùng mét)" |
| R8 | Tải mô hình `kind=garment` thiếu xương gập | Như R6, kèm gợi ý mô hình theo loại | như trên | `PM3D_GARMENT_RIG_MISSING` — "Mô hình quần áo cần xương gập `fold_*` để chạy hướng dẫn gập — dùng mô hình theo loại hoặc dựng theo mẫu" |
| R9 | Thiếu nguồn khi tải lên | Ô Nguồn bắt buộc | DTO | `PM3D_CREDIT_REQUIRED` |
| R10 | Mô hình bị giãn lệch > 35% so với dáng gốc | Dòng nhắc vàng ở khung xem trước, **không chặn** | — (tính ở FE) | "Hình đang bị kéo giãn so với dáng gốc — kiểm tra lại số đo hoặc chọn mô hình khác" |
| R11 | Sửa số đo SKU sau khi gắn mô hình | Xem trước cập nhật ngay | Không kiểm tra tỉ lệ; kế hoạch cũ đánh dấu cũ qua `isProfileStale` như hiện nay | — |
| R12 | Thay file của mô hình (Admin) | Hộp xác nhận: "Đổi hình của N SKU" | `PUT /product-models/:id/file`: validate như R6–R8, `version + 1`, giữ file cũ | `PM3D_FORBIDDEN` nếu không phải Admin |
| R13 | Ngừng dùng mô hình (Admin) | Ẩn khỏi danh sách chọn; SKU đang dùng **vẫn hợp lệ**, có cờ "đang dùng mô hình đã ngừng" | `POST /product-models/:id/retire` | — |
| R14 | Xoá hẳn mô hình | Không có nút | Không có API xoá cứng | — |
| R15 | Tải lên lỗi giữa chừng | Báo lỗi, không có mục nào được tạo | Tải Cloudinary trước, tạo document sau; tạo document lỗi → xoá asset Cloudinary (best-effort, ghi log) | `PM3D_UPLOAD_FAILED` |
| R16 | Cloudinary chưa cấu hình | Tab Tải lên báo không khả dụng; vẫn chọn có sẵn / dựng hình được | như `PROOF_PHOTO_NOT_CONFIGURED` | `PM3D_STORAGE_NOT_CONFIGURED` (503) |
| R17 | Kế hoạch đã lưu khi mô hình bị thay / ngừng dùng | Kế hoạch cũ hiển thị đúng hình lúc tính | `item_profiles[].model` chụp id + version + url/thông số | — |
| R18 | Kế hoạch cũ chưa có ảnh chụp mô hình | Hiển thị theo bảng loại như hiện nay | FE rơi về `ITEM_MODELS` | — |

---

## 4. Luồng UX

### 4.1 Vị trí trong form

Trong `PackagingProfileForm`, ngay dưới khối số đo, thêm mục **Mô hình 3D**:

```
┌ Mô hình 3D ─────────────────────────────────────────────┐
│ [Gợi ý] [Thư viện] [Tải lên] [Dựng hình cơ bản]          │
│ ┌───────────────┐  Chai tròn cổ ngắn                     │
│ │  xem trước 3D │  Dựng từ hình cơ bản · dùng bởi 3 SKU  │
│ │  (kéo xoay)   │  Hiển thị theo số đo 4 × 4 × 12 cm     │
│ └───────────────┘  [Đổi mô hình]                          │
│ ⚠ Hình đang bị kéo giãn so với dáng gốc… (chỉ khi > 35%) │
└──────────────────────────────────────────────────────────┘
```

- Khung xem trước dùng cùng renderer với cảnh đóng gói, giãn theo số đo đang gõ (cập nhật trực tiếp).
- **Gợi ý:** mô hình của SKU cùng `master_sku`, rồi cùng tiền tố mã mẫu, rồi mô hình theo loại của SKU. Bấm một lần để chọn.
- **Thư viện:** tìm theo tên, lọc theo nguồn; mục không hợp loại bị làm mờ + lý do (R2).
- **Tải lên:** kéo thả GLB, ô Tên, ô Nguồn (tự dựng / nhà cung cấp / đường dẫn + giấy phép), chọn `Quần áo (có bước gập)` hoặc `Hàng cứng`. Trạng thái: *Đang tải lên… → Đang kiểm tra mô hình… → Xong* / lỗi R6–R9.
- **Dựng hình cơ bản:** chọn dáng (hộp / trụ / chai / tuýp), vài thanh trượt thông số, màu thân/nắp, tên để lưu vào thư viện.
- Loại quần áo/đầm: tab Dựng hình cơ bản bị ẩn; tab Tải lên ghi chú "cần xương gập".

### 4.2 SKU mới (ví dụ chai)

1. Đồng bộ sàn tạo `SERUM-30ML` (`needs_measurement`, chưa có mô hình) → danh sách "Cần đo".
2. Kho mở form, nhập 4 × 4 × 12 cm, 0,08 kg, dễ vỡ, loại `other`.
3. Mục Mô hình 3D: không có gợi ý → chọn **Dựng hình cơ bản → Chai**, cổ cao 25%, đường kính cổ 40%, nắp đen, tên "Chai tròn cổ ngắn" → xem trước đúng dáng chai đứng.
4. Bấm **Xác nhận** → BE tạo mô hình `primitive`, gắn `model_id`, chuyển `ready`, gỡ chặn nhóm đơn.
5. Lần tính kế hoạch tiếp theo: chai được bọc xốp hơi + chèn theo luật vật tư, hiển thị bằng hình chai.

### 4.3 SKU biến thể (ví dụ áo thun size L)

1. `TS-BASIC-M` đã `ready` với mô hình **Áo thun (theo loại)**.
2. `TS-BASIC-L` mới đồng bộ. Mở form → tab **Gợi ý** hiện "Áo thun — đang dùng bởi TS-BASIC-M (cùng mã mẫu)".
3. Chọn gợi ý, nhập số đo riêng của size L → xem trước giãn theo số đo L → Xác nhận.
4. Hai SKU dùng chung một mô hình nhưng mỗi SKU có số đo riêng; thay file áo thun về sau (Admin) đổi hình cả hai.

### 4.4 SKU cũ chưa có 3D

1. Migrate gắn tự động: áo/quần/đầm/giày/túi/phụ kiện → mô hình theo loại; `sandals`/`other`/loại rỗng → **Hình đại diện**.
2. Danh sách sản phẩm có bộ lọc **"Đang dùng hình đại diện"** và **"Mô hình đã ngừng dùng"**; mỗi dòng có nhãn nguồn.
3. Kho mở SKU dép → tab Tải lên (hoặc Thư viện) → chọn mô hình dép → lưu bằng `PUT /product-master/:id/model`, **không** phải xác nhận lại số đo (R4).

### 4.5 Tab "Mô hình 3D" (màn Kho)

- Lưới thẻ: ảnh xem trước, tên, nhãn nguồn, số SKU đang dùng, trạng thái.
- Tìm theo tên; lọc nguồn; lọc "Chưa SKU nào dùng" (Q15), "Đã ngừng dùng".
- Chi tiết: xem trước xoay được, thông tin nguồn/giấy phép, danh sách SKU đang dùng (bấm mở form SKU), phiên bản.
- Admin: **Thay file** (R12), **Ngừng dùng** (R13), sửa tên/nguồn. Mô hình `category` chỉ Admin thay được file.
- Không có: thay hàng loạt theo bộ lọc, gộp mô hình, lịch sử phiên bản chi tiết.

### 4.6 Vì sao cần tab riêng ngay MVP

Thư viện dùng chung (Q1) là mặc định: 39 SKU Lazada hiện chỉ có vài dáng, mỗi dáng dùng cho nhiều SKU khác màu/size. Khi đó câu hỏi vận hành thường gặp là "đổi mô hình này thì ảnh hưởng SKU nào" và "SKU nào còn dùng hình đại diện" — form từng SKU không trả lời được. Tab chỉ gồm danh sách, tìm kiếm, xem trước, SKU đang dùng, thay/ngừng dùng; việc gắn vẫn làm ngay trong form SKU.

---

## 5. Thiết kế kỹ thuật

### 5.1 Dữ liệu

**Collection mới `product_models`** (module mới `be/src/modules/product-models/`):

```ts
{
  _id: ObjectId,
  name: string,                       // "Chai tròn cổ ngắn"
  source: 'category' | 'upload' | 'primitive',
  kind: 'garment' | 'rigid',          // garment = có bước gập/túi zip trong file
  category_key: ProductCategory | null, // chỉ với source=category
  version: number,                    // +1 mỗi lần thay file / sửa thông số
  file: {                             // source = category | upload
    url: string,                      // category: '/models/tshirt.glb' (file tĩnh FE); upload: Cloudinary raw
    public_id: string | null,
    bytes: number, sha256: string,
  } | null,
  primitive: {                        // source = primitive
    shape: 'box' | 'cylinder' | 'bottle' | 'tube',
    params: Record<string, number>,   // xem 5.3
    body_color: string, cap_color: string | null,
  } | null,
  bbox_m: { x: number, y: number, z: number } | null, // từ file; null với primitive
  has_fold_rig: boolean,
  preview_url: string | null,         // ảnh PNG do FE chụp khi tạo
  credit: { type: 'self_made' | 'supplier' | 'external', url: string | null, license: string | null } | null,
  status: 'active' | 'retired',
  file_history: { version: number, url: string, public_id: string | null, replaced_at: Date }[],
  created_by, updated_by, createdAt, updatedAt,
}
// index: { status: 1, source: 1 }, text { name }
```

**`product_master`** thêm `model_id: ObjectId | null` (index thường để đếm "đang dùng").

**`packing_plans.item_profiles[]`** thêm ảnh chụp:

```ts
model: { id, version, source, kind, url: string | null, primitive: {...} | null } | null
```

Ghi tại `utils/item-profiles.util.ts` khi tạo kế hoạch.

### 5.2 API

| Method + path | Quyền | Ghi chú |
|---|---|---|
| `GET /product-models?q&source&status&unused&page` | `product_models` hoặc quyền xác nhận hồ sơ | kèm `usage_count` |
| `GET /product-models/:id` | như trên | kèm danh sách SKU đang dùng (phân trang) |
| `POST /product-models/upload` (multipart `file`, `name`, `kind`, `credit`) | quyền xác nhận hồ sơ | R6–R9, R15; multer `FileInterceptor('file', { limits: { fileSize: 10 MB } })` |
| `POST /product-models/primitive` | quyền xác nhận hồ sơ | `{ name, shape, params, body_color, cap_color }` |
| `PATCH /product-models/:id` | người tạo hoặc Admin | tên, nguồn; thông số primitive → `version + 1` |
| `PUT /product-models/:id/file` | Admin | R12 |
| `POST /product-models/:id/retire`, `/restore` | Admin | R13 |
| `POST /product-models/:id/preview` | quyền xác nhận hồ sơ | ảnh PNG chụp từ canvas (đi đường ảnh hiện có) |
| `GET /product-master/:id/model-suggestions` | như form SKU | cùng `master_sku` → cùng tiền tố mẫu → theo loại |
| `PUT /product-master/:id/model` `{ model_id }` | quyền xác nhận hồ sơ | R2, R4 |
| `PUT /product-master/:id/packaging-profile` | hiện có | thêm `model_id` bắt buộc (R1, R2) |

Mọi controller mới phải có `@Features(...)` hoặc `@NoFeatureGate` (quy ước AOFP-335). Thêm `'product_models'` vào `FEATURE_VALUES` và `DEFAULT_ROLE_FEATURES` (`be/src/common/enums/feature.enum.ts`).

Phản hồi kế hoạch (`toPlanResponse`, `packing-plan.controller.ts:582`) thêm `itemProfiles[].model` từ ảnh chụp.

### 5.3 Hình cơ bản (`buildPrimitive`)

Một hàm thuần ở FE, `fe/src/components/packing/scene/primitives.ts`:

```ts
buildPrimitive(shape, params, colors): THREE.Group  // dựng trong khối đơn vị 1×1×1, +Y là chiều cao
```

Sau đó dùng chung bước giãn theo số đo (5.4). Thông số:

| Dáng | Thông số (khoảng hợp lệ) | Cách dựng |
|---|---|---|
| `box` | `corner_radius_pct` 0–20 (0 = **Hình đại diện**) | `BoxGeometry` / `RoundedBoxGeometry` |
| `cylinder` | `cap_height_pct` 0–30 | `CylinderGeometry` + nắp |
| `bottle` | `shoulder_pct` 5–30, `neck_height_pct` 5–40, `neck_diameter_pct` 15–80, `cap_height_pct` 0–20 | `LatheGeometry` từ đường viền thân → vai → cổ, nắp là trụ riêng |
| `tube` | `cap_height_pct` 5–25, `crimp_pct` 5–15 | `LatheGeometry` đầu tròn + đuôi ép dẹt |

BE kiểm tra cùng bảng khoảng này (DTO `class-validator`). Có unit test vitest cho mỗi dáng: khối bao sau khi dựng đúng 1×1×1.

### 5.4 Thay đổi trình xem 3D

1. Chọn mô hình theo **SKU** (`itemProfiles[].model`) thay vì theo loại; không có ảnh chụp thì rơi về `ITEM_MODELS` (R18).
2. `fitToBlock`: **mọi** mô hình giãn từng trục khớp đúng `dx/dy/dz` (Q16), bỏ nhánh co đều của `rigid`.
3. Đọc `placement.orientation` để quay mô hình (trục cao +Y của mô hình → trục tương ứng của placement) thay cho việc ghép theo "trục dài nhất". Bắt buộc với chai nằm ngang.
4. Bước chuẩn bị (`prepStep`) và bước gập/túi zip vẫn lấy theo **loại SKU**; bước gập chỉ chạy khi mô hình có `has_fold_rig`.
5. Tải GLB từ Cloudinary: kiểm tra header CORS của URL `raw` trong `useGLTF`; nếu thiếu thì phục vụ qua `GET /product-models/:id/file` (proxy) — **cần kiểm chứng khi làm**.

### 5.5 Kiểm tra file ở server

- Thêm phụ thuộc `@gltf-transform/core` (đọc GLB trong Node, không cần WebGL).
- Các bước: magic + version → `NodeIO.readBinary` → có mesh → khối bao (bỏ qua node ẩn theo `GARMENT_HIDDEN_NODES`) → nếu `kind=garment` thì có animation channel trỏ vào node tên `fold_*` và có node `ZIPBAG_ROOT_NODE`.
- Tải lên Cloudinary bằng `resource_type: raw` (endpoint `/raw/upload`), thư mục `optipack/models`, dùng lại `signCloudinaryParams`. Không biến đổi file.
- Kiểm tra giới hạn body của reverse proxy (`client_max_body_size`) ≥ 12 MB trên server triển khai.

### 5.6 Migrate dữ liệu cũ (`be/scripts/migrate-product-models.ts`)

1. Tạo 9 mô hình `source=category` từ `ITEM_MODELS` (đường dẫn tĩnh `/models/*.glb`, `kind` theo bảng hiện tại, `has_fold_rig` = true với 6 loại quần áo).
2. Tạo mô hình **Hình đại diện** (`primitive box`, `corner_radius_pct = 0`).
3. Gắn `model_id` cho mọi `product_master` chưa có: theo loại; `sandals`/`other`/rỗng → Hình đại diện.
4. Có `--dry-run` in bảng đếm theo loại, danh sách SKU `ready` bị gắn Hình đại diện; chạy lại an toàn (chỉ gắn nơi `model_id` rỗng).
5. Thứ tự triển khai: deploy BE có schema + API **nhưng chưa bật cổng R1/R3** → chạy migrate trên DB thật → deploy bản bật cổng cùng FE.

---

## 6. Acceptance criteria

Ví dụ xuyên suốt:

- **A. `VI-DA-NAU`** — ví da trong hộp, loại `accessory`, 20 × 12 × 4 cm, không dễ vỡ.
- **B. `SERUM-30ML`** — chai thuỷ tinh, loại `other`, 4 × 4 × 12 cm, dễ vỡ, chỉ dựng đứng; **`SERUM-50ML`** 5 × 5 × 14 cm dùng chung dáng.
- **C. `TS-BASIC-M` / `TS-BASIC-L`** — áo thun, biến thể size.

| # | Tiêu chí |
|---|---|
| AC1 | A: chọn **Hình đại diện** → xác nhận được, xem trước là hộp 20 × 12 × 4 có nhãn "Hình đại diện — dựng từ kích thước". |
| AC2 | A: chọn **Mô hình theo loại** (hộp phụ kiện) → cảnh đóng gói chạy bước `caseIn` như hiện nay. |
| AC3 | B: dựng **Chai** với cổ 25% / đường kính cổ 40% → xem trước là chai đứng cao 12 cm; xác nhận → `ready`; mô hình xuất hiện trong thư viện với nhãn "Dựng từ hình cơ bản". |
| AC4 | B: `SERUM-50ML` chọn lại "Chai tròn cổ ngắn" từ thư viện → hình giãn đúng 5 × 5 × 14; tab Mô hình 3D hiện "dùng bởi 2 SKU". |
| AC5 | B: trong kế hoạch, nếu bộ giải đặt chai nằm (`orientation` khác `LWH`) thì hình chai cũng nằm đúng trục; nếu chai `upright_only` thì luôn đứng. |
| AC6 | C: mở form `TS-BASIC-L` → tab Gợi ý đề xuất mô hình của `TS-BASIC-M`; chọn hình cơ bản bị ẩn; xác nhận → bước gập + túi zip chạy như hiện nay. |
| AC7 | C: tải một GLB áo không có xương `fold_*` với `kind=garment` → lỗi `PM3D_GARMENT_RIG_MISSING`, không tạo mục thư viện. |
| AC8 | Xác nhận hồ sơ không có `model_id` qua API → 4xx `PM_MODEL_REQUIRED`; đồng bộ sàn không bao giờ tạo SKU `ready`. |
| AC9 | SKU `ready` bị xoá `model_id` (giả lập) → tính kế hoạch trả `ORD_GROUP_PACKAGING_PROFILE_NOT_READY` với `reason: missing_model`, nhóm đơn có `packing_blocked_reason`. |
| AC10 | Admin thay file mô hình B → kế hoạch đã lưu trước đó vẫn hiển thị hình cũ (ảnh chụp version cũ); kế hoạch mới dùng hình mới. |
| AC11 | Ngừng dùng mô hình B → không còn trong danh sách chọn; `SERUM-30ML` vẫn đóng gói được và có cờ "đang dùng mô hình đã ngừng". |
| AC12 | Tải file 15 MB / file `.obj` / GLB rộng 150 m → lỗi R6/R7, không có asset mồ côi trên Cloudinary (hoặc có log xoá). |
| AC13 | Sau migrate trên bản sao DB thật: 100% `product_master` có `model_id`; số SKU bị chặn đóng gói trước = sau. |
| AC14 | Kế hoạch cũ (không có `item_profiles[].model`) vẫn hiển thị như trước triển khai. |
| AC15 | Người không có quyền Admin gọi `PUT /product-models/:id/file` → 403. |

---

## 7. Thứ tự triển khai

| Bước | Nội dung | Kiểm chứng |
|---|---|---|
| 1 | BE: schema `product_models`, `product_master.model_id`, quyền `product_models` | jest schema + RBAC |
| 2 | BE: API thư viện + `primitive` + gợi ý | jest service, e2e Mongo replica set |
| 3 | BE: tải GLB (Cloudinary raw + `@gltf-transform/core` + kiểm tra xương) | jest với 4 file mẫu: GLB tốt, sai đơn vị, áo thiếu xương, file rác |
| 4 | BE: script migrate (`--dry-run`) | chạy trên bản sao DB, so AC13 |
| 5 | FE: `buildPrimitive` + viewer chọn theo SKU, giãn từng trục, đọc `orientation` | vitest khối bao; xem tay 3 kế hoạch thật |
| 6 | BE: ảnh chụp `item_profiles[].model` + phản hồi kế hoạch | jest AC10, AC14 |
| 7 | FE: mục Mô hình 3D trong form SKU + xem trước | xem tay AC1–AC7 |
| 8 | FE: tab Mô hình 3D | xem tay AC4, AC11 |
| 9 | Chạy migrate DB thật → bật cổng R1/R3 (deploy BE + FE cùng lúc) | AC8, AC9, AC13 |
| 10 | Tài liệu: `GLOSSARY.md` (mô hình, hình đại diện, hình cơ bản), quy ước xương quần áo, cập nhật `CREDITS.md` | review |

Chạy jest sau mỗi lần merge (xung đột ngữ nghĩa không bị tsc bắt).

## 8. Đợt 2 (đã thống nhất, ngoài MVP)

- **Gập tự động** cho file quần áo trải phẳng: chia lưới theo mặt phẳng gập (hai bên ~1/4 chiều rộng → gập đôi → gập tư, khớp `MAX_FOLDS = 2`), sinh clip biến dạng; túi zip dùng file túi chung tách từ mô hình hiện có. Nhãn "Bước gập tự tạo". File không trải phẳng → từ chối.
- Thay mô hình hàng loạt theo bộ lọc; lịch sử phiên bản có xem lại.
- Va chạm theo hình dáng thật: **chưa có nhu cầu** — bộ giải dùng khối bao là an toàn; chỉ cân nhắc nếu sau này cần lồng món (vd. chai nằm trong khoảng lõm của món khác).

## 9. Rủi ro và việc cần kiểm chứng khi làm

- CORS khi tải GLB từ Cloudinary `raw` (5.4 mục 5).
- Giới hạn body của reverse proxy với file 10 MB.
- Nguồn/giấy phép của 9 mô hình theo loại hiện vẫn trống trong `CREDITS.md` — cần điền trước khi coi là "Mô hình theo loại" chính thức.
- Đọc `orientation` thay cho ghép trục dài nhất sẽ đổi cách hiển thị **mọi** kế hoạch; cần so ảnh trước/sau trên vài kế hoạch thật.
- `sandals` sau migrate dùng Hình đại diện (hộp) dù dép không phải hộp — chấp nhận tạm, theo dõi bằng bộ lọc.
