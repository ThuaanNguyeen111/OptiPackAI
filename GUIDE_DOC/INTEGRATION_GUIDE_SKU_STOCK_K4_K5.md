# OptiPackAI — Hướng dẫn FE & Demo: SKU nội bộ, Tồn kho chung, Chống bán lố (K4a · K4b · K5)

**Phiên bản v1.2 — 07/10/2026** (sửa lỗi BE khiến Picking List báo "CHƯA GÁN VỊ TRÍ" và quét hàng báo thiếu tồn dù cấu hình đúng; Picking List / quét hàng tìm thêm tồn chưa gộp và không phân biệt hoa thường; bước 1.5 chạy script chuyển dữ liệu id; cập nhật mục 0b.2, 0b.4, 4.7, 5.4, 8.3, 8.4). **v1.1 — 04/10/2026** (thêm Phần 0b: quy trình cấu hình chuẩn, cách đặt SKU trên Lazada, xử lý sự cố "CHƯA GÁN VỊ TRÍ"; sửa bước 1.3 theo cơ chế đồng bộ sản phẩm mới). **v1.0 — 27/09/2026.** Tài liệu này dành cho FE ghép giao diện **và** cho người thuyết trình chạy demo. Đi đúng thứ tự từ trên xuống: mỗi bước đều có _làm gì → gọi API nào → body mẫu → kết quả phải thấy → nếu sai thì lỗi gì_.

Đọc kèm (đã có trước): `INTEGRATION_GUIDE_WAREHOUSE.md` (kho, kệ, sổ cái K3), `INTEGRATION_GUIDE_SHIPPING.md`, `INTEGRATION_GUIDE_PACKAGING_MATERIALS.md`.

---

## MỤC LỤC

- **Phần 0** — Hiểu nhanh 3 bước K4a / K4b / K5 (đọc trước, 3 phút)
- **Phần 0b** — 🆕 Quy trình cấu hình chuẩn từ đầu: 3 loại mã, đặt SKU trên Lazada, 8 bước, xử lý sự cố
- **Phần 1** — Chuẩn bị môi trường (bắt buộc làm 1 lần)
- **Phần 2** — Dựng dữ liệu nền từ đầu (kho → khu → danh mục → màu → kệ)
- **Phần 3** — K4a: tạo SKU nội bộ, nối SKU Lazada
- **Phần 4** — K4b: tồn kho chung theo SKU nội bộ — 7 trường hợp
- **Phần 5** — K5: chống bán lố — 6 trường hợp
- **Phần 6** — FE cần làm gì ở từng màn hình
- **Phần 7** — Kịch bản demo trước hội đồng (~10 phút)
- **Phần 8** — Mã lỗi, hạn chế hiện tại, checklist

---

# PHẦN 0 — HIỂU NHANH

Ví dụ xuyên suốt tài liệu: **1 chiếc áo thun đen size M**, trên kệ còn 10 cái. Trên Lazada, shop lỡ đăng **2 listing** cho cùng chiếc áo này với 2 mã khác nhau: `ATD-M-01` và `AOTHUN-DEN-M`.

| Bước    | Giải quyết                          | Trước                                                                                             | Sau                                                                     |
| ------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **K4a** | Đặt **tên chính thức** cho sản phẩm | Mỗi listing 1 mã, không biết cái nào là cùng 1 sản phẩm                                           | Có SKU nội bộ `ATHUN-005-DEN-M`, 2 mã Lazada được **nối** vào nó        |
| **K4b** | Kho **đếm theo tên chính thức**     | Hệ thống thấy 2 sản phẩm, mỗi cái 1 số tồn riêng                                                  | 1 số tồn chung: đơn từ listing nào cũng trừ vào cùng 1 chỗ              |
| **K5**  | **Chống bán lố**                    | Tồn chỉ bị trừ lúc nhân viên quét hàng → 2 đơn cùng tranh món cuối, đơn thứ 2 tới kệ mới biết hết | Đơn vừa về là **giữ chỗ** ngay; không đủ → **gắn cờ thiếu hàng** từ đầu |

**"Đường lùi" của K4b — điều quan trọng nhất FE cần nhớ:**

```
SKU sàn ĐÃ nối    → tồn tính theo SKU nội bộ (chung)
SKU sàn CHƯA nối  → tồn tính theo SKU sàn — Y HỆT trước đây, không gãy gì
```

Nghĩa là: deploy xong mà chưa nối SKU nào thì hệ thống chạy **đúng như cũ**. Nối tới đâu, tồn gộp tới đó.

---

# PHẦN 0b — QUY TRÌNH CẤU HÌNH CHUẨN TỪ ĐẦU 🆕 (04/10/2026)

> Đọc phần này trước khi cấu hình kho cho một shop mới, hoặc khi Picking List hiện **"CHƯA GÁN VỊ TRÍ"** và quét hàng báo **thiếu tồn**.

## 0b.1. Ba loại mã — không được nhầm

| Loại mã                      | Ví dụ                     | Là gì                                                         | Ai tạo                                        |
| ---------------------------- | ------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| **Mã ô** (`binCode`)         | `KA-D1-P03-T01-3`         | **Vị trí** trên kệ: khu KA, dãy D1, mặt P kệ 03, tầng 01, ô 3 | Hệ thống **tự sinh** khi Admin tạo kệ         |
| **SKU nội bộ** (`masterSku`) | `ATHUN-005-DEN-M`         | **Sản phẩm thật**: danh mục – mẫu – màu – size                | Hệ thống **tự sinh** khi Admin tạo SKU nội bộ |
| **SKU sàn** (`sellerSku`)    | Mã đặt trên Seller Center | Mã sản phẩm **trên Lazada**, đi theo từng đơn hàng            | **Người bán** đặt trên Lazada                 |

**Quy tắc quan trọng nhất: hệ thống KHÔNG tự nối các mã vì chúng viết giống nhau.** Ba mã chỉ liên kết với nhau qua 2 thao tác do Admin thực hiện:

```
SKU sàn ──(A) Gán SKU vào ô ─────────────────►  Mã ô         POST /warehouse/warehouses/:id/sku-bin-assignments
   │
   └────(B) Nối SKU sàn vào SKU nội bộ ───────►  SKU nội bộ   POST /master-skus/:code/mappings
```

Thiếu cả (A) lẫn (B) thì SKU sàn bị coi là **sản phẩm mới, chưa có ô, chưa có tồn** — kể cả khi chuỗi ký tự trùng hệt mã ô hoặc SKU nội bộ. Thiết kế cố ý như vậy: nối tự động theo tên dễ nối nhầm (một lỗi gõ là tồn của sản phẩm này bị trừ cho sản phẩm khác).

## 0b.2. Đặt SKU trên Seller Center

| Nên                                                                                                      | Không nên                                                                                      |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Đặt SKU trên Lazada **trùng SKU nội bộ** (ví dụ `ATHUN-005-DEN-M`) — dễ đối chiếu, nhìn mã biết sản phẩm | Đặt SKU trên Lazada **trùng mã ô** (ví dụ `KA-D1-P03-T01-3`)                                   |
| Giữ một kiểu viết thống nhất (chữ hoa, không khoảng trắng)                                               | Viết lẫn hoa/thường hoặc có khoảng trắng — từ 07/10/2026 Picking List và quét hàng đã bỏ qua khác biệt hoa thường, nhưng nối SKU (`MAP_SELLER_SKU_UNKNOWN`) và danh sách "SKU chưa gán ô" **vẫn so chính xác từng ký tự** |

Vì sao không đặt trùng mã ô: nhân viên quét mã dán trên kệ hay mã trên sản phẩm đều ra cùng chuỗi nên không phát hiện được quét nhầm; chuyển hàng sang ô khác thì mã trên Lazada mang tên ô cũ; một ô chứa nhiều sản phẩm hoặc một sản phẩm nằm nhiều ô thì không thể đặt "mã sản phẩm = mã ô".

Dù đặt SKU Lazada trùng SKU nội bộ, **vẫn phải nối (B) một lần** — trùng tên không tự nối.

## 0b.3. Tám bước cấu hình (Admin)

```
1. Danh mục + màu ──► 2. Kho → khu → kệ (sinh mã ô) ──► 3. SKU nội bộ (sinh mã sản phẩm)
                                                               │
4. Đặt SKU trên Lazada (= SKU nội bộ) ──► 5. Đồng bộ sản phẩm ◄┘
        │
        ▼
6. Nối SKU Lazada → SKU nội bộ ──► 7. Gán vào ô + số lượng thật ──► 8. Gộp tồn ──► sẵn sàng lấy hàng
```

| Bước | Việc                                                | API                                                                                     | Chi tiết               |
| ---- | --------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------- |
| 1    | Danh mục 2 cấp (kèm thang size) và màu chuẩn        | `POST /categories`, `POST /colors`                                                      | Phần 2 (2.3, 2.4)      |
| 2    | Kho → khu → cả dãy kệ; hệ thống sinh mã ô           | `POST /warehouse/warehouses` → `POST .../zones` → `POST /warehouse/zones/:zoneId/racks` | Phần 2 (2.1, 2.2, 2.5) |
| 3    | SKU nội bộ cho từng sản phẩm thật; hệ thống sinh mã | `POST /master-skus`                                                                     | Phần 3 (3.1)           |
| 4    | Trên Seller Center, đặt SKU sản phẩm = SKU nội bộ   | (làm trên Lazada)                                                                       | Mục 0b.2               |
| 5    | Kéo danh sách sản phẩm Lazada về                    | `POST /product-master/sync` (hoặc chờ cron mỗi giờ)                                     | Phần 1 (1.3)           |
| 6    | Nối SKU Lazada vào SKU nội bộ                       | `POST /master-skus/:code/mappings`                                                      | Phần 3 (3.3), Phần 4   |
| 7    | Gán sản phẩm vào ô kèm số lượng thật                | `POST /warehouse/warehouses/:id/sku-bin-assignments` (`initial_quantity`)               | Phần 2 (2.6)           |
| 8    | Gộp tồn theo SKU nội bộ                             | `POST /master-skus/sync-stock`                                                          | Phần 4 (4.7)           |

Ví dụ đầy đủ cho 1 sản phẩm, shop `201171264532`:

```
POST /master-skus
{ "category_code": "ATHUN", "model_no": 5, "color_code": "DEN", "size": "M", "name": "Áo thun basic đen size M" }
→ { "masterSku": "ATHUN-005-DEN-M", ... }

(Seller Center: đặt SKU sản phẩm = ATHUN-005-DEN-M)

POST /product-master/sync?shop_id=201171264532

POST /master-skus/ATHUN-005-DEN-M/mappings
{ "platform": "lazada", "shop_id": "201171264532", "seller_sku": "ATHUN-005-DEN-M" }

POST /warehouse/warehouses/WAREHOUSE_ID/sku-bin-assignments
{ "platform": "lazada", "shop_id": "201171264532", "seller_sku": "ATHUN-005-DEN-M",
  "bin_location_id": "<id ô KA-D1-P02-T03-1>", "initial_quantity": 10 }

POST /master-skus/sync-stock
```

Kết quả đúng: đơn Lazada chứa `ATHUN-005-DEN-M` → Picking List chỉ ô `KA-D1-P02-T03-1`, `master_sku` = `ATHUN-005-DEN-M`, quét lấy hàng trừ tồn bình thường.

Ghi chú:

- Bước 4–5 có thể làm trước bước 2–3; chỉ cần đủ 8 bước **trước khi** bắt đầu lấy hàng.
- Một sản phẩm nằm nhiều ô → lặp bước 7 cho từng ô. Một sản phẩm bán ở nhiều shop/listing → lặp bước 6 cho từng SKU sàn, tồn được tính chung.

## 0b.4. Xử lý sự cố thường gặp

| Hiện tượng                                                                                   | Nguyên nhân                                                                                                               | Cách xử lý                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Picking List hiện `bin_code: "CHƯA GÁN VỊ TRÍ"`, `bin_location_id: null`, `master_sku: null` | SKU sàn của đơn **chưa gán ô (A)** và **chưa nối SKU nội bộ (B)**. 🔄 Trước 07/10/2026 còn một nguyên nhân phía BE: dữ liệu đúng hết vẫn báo "CHƯA GÁN VỊ TRÍ" (lỗi kiểu id kho) — đã sửa; nếu vẫn gặp sau khi cập nhật BE, kiểm tra đã chạy bước 1.5 chưa | Làm bước 6–8 (nếu hàng đang nằm dưới SKU nội bộ / mã khác) hoặc bước 7 (nếu chưa có hàng gán cho sản phẩm này); sau đó `POST /order-groups/:id/stock-reservation/recheck`                                   |
| `POST .../fulfillment/pick-item` trả `409 ORD_GROUP_INSUFFICIENT_STOCK`                      | (Trước 07/10/2026 lỗi này xảy ra cả khi dữ liệu đúng — lỗi kiểu id kho phía BE, đã sửa.) Không có dòng tồn nào khớp: cùng kho + cùng SKU (hoặc cùng SKU nội bộ) + đúng ô (nếu gửi `bin_location_id`) + đủ số lượng | Kiểm tra theo thứ tự: dòng Picking List có ô chưa → `GET .../sku-bin-assignments` dòng đó còn tồn không → FE gửi đúng `sku` (mã **sản phẩm**, không phải mã ô), đúng `warehouse_id`, đúng `bin_location_id` |
| Nối SKU báo `400 MAP_SELLER_SKU_UNKNOWN`                                                     | Hệ thống chưa biết SKU sàn đó                                                                                             | `POST /product-master/sync` rồi nối lại                                                                                                                                                                     |
| Đã đổi mã SKU trên Lazada, trang kho vẫn hiện mã cũ                                          | Ô kho lưu mã lúc gán, không tự đổi; đơn cũ giữ mã cũ                                                                      | `POST /product-master/sync` → nối **cả mã cũ và mã mới** vào cùng SKU nội bộ → `POST /master-skus/sync-stock`. Không xóa dòng tồn mã cũ (đơn cũ đang chờ lấy sẽ thiếu hàng)                                 |
| Mã trên Lazada đang trùng mã ô                                                               | Đặt sai quy ước (mục 0b.2)                                                                                                | Tạm thời: nối mã đó vào SKU nội bộ đúng để đơn đang chờ lấy được. Lâu dài: đổi SKU trên Lazada thành SKU nội bộ, rồi nối mã mới                                                                             |

## 0b.5. FE cần làm

| Màn hình                 | Việc                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Picking List / quét hàng | Dòng có `bin_location_id = null` → **khóa nút quét**, hiện "SKU chưa được gán ô — liên hệ Admin" thay vì để quét rồi nhận 409. Khi quét, gửi `sku` = **`item.sku`** (mã sản phẩm) và `bin_location_id` = `item.bin_location_id` |
| Cấu hình kho (Admin)     | Nút **"Đồng bộ sản phẩm từ Lazada"** → `POST /product-master/sync`; khối cảnh báo **"SKU chưa nối SKU nội bộ"** từ `GET /master-skus/unmapped-seller-skus`                                                                      |
| Tạo SKU nội bộ           | Hiện mã do hệ thống sinh để Admin dùng đặt SKU trên Seller Center                                                                                                                                                               |

---

# PHẦN 1 — CHUẨN BỊ MÔI TRƯỜNG (1 lần mỗi môi trường)

**Bước 1.1 — Chạy migration của K3** (nếu chưa chạy). Không chạy thì gán SKU vào ô thứ 2 / chuyển ô / gộp tồn sẽ lỗi trùng khóa:

```bash
cd be
npx ts-node -r dotenv/config scripts/migrate-sku-bin-assignment-multibin.ts
```

Kết quả đúng: `✅ Đã xóa index cũ ...` hoặc `Không còn index cũ — không cần làm gì.`, sau đó `✅ Đã đồng bộ index theo schema mới`.

**Bước 1.2 — Khởi động lại BE.** Index mới của K4b (1 SKU nội bộ chỉ có 1 dòng tồn trên 1 ô) và của K5 được Mongoose tự tạo khi khởi động.

**Bước 1.3 — Đồng bộ sản phẩm Lazada.** K4a chỉ cho nối SKU **đã đồng bộ về**. Kiểm tra có dữ liệu:

```
GET /product-master?shop_id=201171264532
```

Phải thấy danh sách SKU. Nếu rỗng hoặc thiếu SKU vừa tạo/vừa đổi trên Lazada → Admin gọi:

```
POST /product-master/sync?shop_id=201171264532          (chỉ sản phẩm thay đổi)
POST /product-master/sync?shop_id=201171264532&full=true (toàn bộ danh sách sản phẩm)
```

🔄 **Từ 04/10/2026** hệ thống đồng bộ theo **danh sách sản phẩm của shop** (không còn chỉ theo SKU đã có trong đơn): tự chạy **mỗi giờ** (sản phẩm thay đổi) và **3h sáng** (toàn bộ). Script tay vẫn dùng được: `npx ts-node -r dotenv/config scripts/sync-product-master-now.ts 201171264532`.

**Bước 1.4 — Chuẩn bị 3 tài khoản** để demo đúng quyền: **Admin**, **Store Owner**, **Warehouse Staff**.

**Bước 1.5 — 🆕 (07/10/2026) Chuyển dữ liệu id cũ sang ObjectId.** Bắt buộc 1 lần trên mỗi database sau khi cập nhật BE bản 07/10/2026 (chi tiết: `INTEGRATION_GUIDE_WAREHOUSE.md` PHẦN B6):

```bash
cd be
npx ts-node -r dotenv/config scripts/migrate-objectid-fields.ts            # chạy thử, chỉ đếm
npx ts-node -r dotenv/config scripts/migrate-objectid-fields.ts --apply    # ghi thật
```

Kết quả đúng: lần chạy lại báo `✅ Không còn giá trị id nào lưu dạng chuỗi — không cần làm gì.`, hoặc `✅ Không còn id dạng chuỗi nào cần chuyển. Còn N giá trị không phải id được giữ nguyên…` (các giá trị này nằm ở thông báo `sync_failed` cũ — không ảnh hưởng nghiệp vụ).

---

# PHẦN 2 — DỰNG DỮ LIỆU NỀN TỪ ĐẦU

Làm đúng thứ tự — bước sau cần kết quả bước trước. Ghi lại các `id` trả về.

**2.1 — Kho** (Admin)

```
POST /warehouse/warehouses
{ "warehouse_code": "WH-HCM-01", "warehouse_name": "Kho Quận 7", "address": "123 Nguyễn Văn Linh, Q7" }
→ ghi lại "id" = WAREHOUSE_ID
```

**2.2 — Khu chuẩn mới** (mã bắt buộc `KA..KZ`)

```
POST /warehouse/warehouses/WAREHOUSE_ID/zones
{ "zone_code": "KA", "zone_name": "Thời trang" }
→ ZONE_ID
```

**2.3 — Danh mục** (cấp 1 rồi cấp 2)

```
POST /categories  { "code": "AO", "name": "Áo" }
POST /categories  { "code": "ATHUN", "name": "Áo thun", "parent_code": "AO", "size_scale": ["S","M","L","XL"] }
```

**2.4 — Màu chuẩn** 🆕 K4a

```
POST /colors  { "code": "DEN",   "name": "Đen",   "hex": "#000000" }
POST /colors  { "code": "TRANG", "name": "Trắng", "hex": "#FFFFFF" }
POST /colors  { "code": "VANG",  "name": "Vàng",  "hex": "#F5C400" }
```

**2.5 — Tạo kệ** (4 tầng × 3 ô = 12 ô)

```
POST /warehouse/zones/ZONE_ID/racks
{ "aisle": "D1", "side": "P", "bay": 2, "category_code": "ATHUN",
  "tiers": [ {"tier":1,"size":"XL"}, {"tier":2,"size":"L"}, {"tier":3,"size":"M"}, {"tier":4,"size":"S"} ],
  "cells_per_tier": 3, "cell_colors": ["DEN","TRANG","VANG"], "capacity_per_cell": 30 }
```

Ô cần dùng cho ví dụ: `KA-D1-P02-T03-1` (tầng 3 = size M, ô 1 = Đen). Lấy id của ô:

```
GET /warehouse/warehouses/WAREHOUSE_ID/bin-locations      → tìm binCode "KA-D1-P02-T03-1" → BIN_ID
```

Và 1 ô thứ 2 để thử chuyển ô: `KA-D1-P02-T03-2` → `BIN_ID_2`.

**2.6 — Gán tồn ban đầu theo SKU Lazada** (cách cũ, chưa nối gì)

```
POST /warehouse/warehouses/WAREHOUSE_ID/sku-bin-assignments
{ "platform": "lazada", "shop_id": "201171264532", "seller_sku": "ATD-M-01", "bin_location_id": "BIN_ID", "initial_quantity": 6 }
→ ASSIGNMENT_A (quantityOnHand 6, masterSku null)

POST /warehouse/warehouses/WAREHOUSE_ID/sku-bin-assignments
{ "platform": "lazada", "shop_id": "201171264532", "seller_sku": "AOTHUN-DEN-M", "bin_location_id": "BIN_ID", "initial_quantity": 4 }
→ ASSIGNMENT_B (quantityOnHand 4, masterSku null)
```

> Thay `ATD-M-01` / `AOTHUN-DEN-M` bằng **2 SKU có thật** trong `GET /product-master` của shop (đóng vai "2 listing của cùng 1 sản phẩm"). Tổng thật trên kệ: 6 + 4 = 10.

**Kiểm tra lúc này:** `GET /warehouse/warehouses/WAREHOUSE_ID/sku-bin-assignments` → 2 dòng riêng, cả 2 `masterSku: null`. Đây là trạng thái "trước K4b".

---

# PHẦN 3 — K4a: TẠO SKU NỘI BỘ, NỐI SKU LAZADA

**3.1 — Tạo SKU nội bộ** (Admin). FE **không gửi mã** — hệ thống tự ghép:

```
POST /master-skus
{ "category_code": "ATHUN", "model_no": 5, "color_code": "DEN", "size": "M",
  "name": "Áo thun basic đen size M", "gender": "unisex", "weight_kg": 0.2 }
→ { "masterSku": "ATHUN-005-DEN-M", "isActive": true, ... }
```

| Thử sai                | Kết quả                                              |
| ---------------------- | ---------------------------------------------------- |
| `"size": "XXL"`        | `400 MSKU_SIZE_NOT_IN_SCALE` — kèm thang size hợp lệ |
| `"color_code": "DENN"` | `400 COLOR_NOT_FOUND`                                |
| Tạo lại y hệt          | `409 MSKU_ALREADY_EXISTS`                            |

**3.2 — Xem SKU sàn chưa nối** (danh sách việc cần làm)

```
GET /master-skus/unmapped-seller-skus
→ [ { "platform": "lazada", "shop_id": "201171264532", "seller_sku": "ATD-M-01" }, { ... "AOTHUN-DEN-M" }, ... ]
```

**3.3 — Nối** — phần này làm ở Phần 4 vì từ K4b, **nối là tồn tự gộp**. Cú pháp:

```
POST /master-skus/ATHUN-005-DEN-M/mappings
{ "platform": "lazada", "shop_id": "201171264532", "seller_sku": "ATD-M-01" }
```

| Thử sai                                               | Kết quả                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| Gõ SKU chưa từng đồng bộ về                           | `400 MAP_SELLER_SKU_UNKNOWN`                                |
| Nối SKU đã nối SKU nội bộ khác                        | `409 MAP_ALREADY_MAPPED` — message nói đang nối với SKU nào |
| `"seller_sku": "atd-m-01 "` (hoa/thường, dư dấu cách) | Vẫn nhận ra là `ATD-M-01`                                   |

---

# PHẦN 4 — K4b: TỒN KHO CHUNG THEO SKU NỘI BỘ

### Trường hợp 4.1 — Chưa nối gì: hệ thống chạy như cũ (đường lùi)

Trước khi nối, mở Picking List của 1 nhóm đơn có `ATD-M-01`:

```
GET /warehouse/WAREHOUSE_ID/picking-list/GROUP_ID
→ [ { "sku": "ATD-M-01", "master_sku": null, "bin_code": "KA-D1-P02-T03-1", "bin_location_id": "BIN_ID", ... } ]
```

`master_sku: null` = đang tính theo SKU sàn. Quét hàng, nhập hàng, kiểm kê… đều chạy như trước.

### Trường hợp 4.2 — Nối listing thứ nhất: tồn được GẮN NHÃN

```
POST /master-skus/ATHUN-005-DEN-M/mappings
{ "platform": "lazada", "shop_id": "201171264532", "seller_sku": "ATD-M-01" }
```

Hệ thống, trong **cùng 1 transaction** với việc nối: tìm các dòng tồn của `ATD-M-01` → ô `BIN_ID` chưa có dòng nào của `ATHUN-005-DEN-M` → **gắn nhãn** dòng đó.

Kiểm tra:

```
GET /warehouse/warehouses/WAREHOUSE_ID/sku-bin-assignments
→ ASSIGNMENT_A: { "sellerSku": "ATD-M-01",     "quantityOnHand": 6, "masterSku": "ATHUN-005-DEN-M" }   ← đã gắn nhãn
  ASSIGNMENT_B: { "sellerSku": "AOTHUN-DEN-M", "quantityOnHand": 4, "masterSku": null }                 ← chưa nối, như cũ
```

### Trường hợp 4.3 — Nối listing thứ hai vào CÙNG SKU nội bộ: tồn được GỘP ⭐

```
POST /master-skus/ATHUN-005-DEN-M/mappings
{ "platform": "lazada", "shop_id": "201171264532", "seller_sku": "AOTHUN-DEN-M" }
```

Ô `BIN_ID` **đã có** dòng của `ATHUN-005-DEN-M` (ASSIGNMENT_A) → hệ thống **gộp**: cộng 4 vào ASSIGNMENT_A, ghi 2 dòng sổ cái, xóa ASSIGNMENT_B.

Kiểm tra:

```
GET /warehouse/warehouses/WAREHOUSE_ID/sku-bin-assignments
→ chỉ còn 1 dòng: { "id": "ASSIGNMENT_A", "quantityOnHand": 10, "masterSku": "ATHUN-005-DEN-M" }

GET /warehouse/warehouses/WAREHOUSE_ID/sku-bin-assignments/ASSIGNMENT_A/movements
→ [ { "type": "transfer_in", "delta": 4, "quantityBefore": 6, "quantityAfter": 10, "masterSku": "ATHUN-005-DEN-M",
      "refType": "sku_merge", "note": "Gộp từ lazada/201171264532/AOTHUN-DEN-M" }, ... ]
```

**Thông điệp trình bày:** trước đó hệ thống thấy 2 sản phẩm (6 và 4), giờ thấy đúng 1 sản phẩm 10 cái — khớp kệ thật. Mọi thay đổi có dấu vết trong sổ cái.

### Trường hợp 4.4 — Đơn từ listing nào cũng trừ vào tồn chung

Nhóm đơn có `AOTHUN-DEN-M` (listing thứ 2):

```
GET /warehouse/WAREHOUSE_ID/picking-list/GROUP_ID_2
→ [ { "sku": "AOTHUN-DEN-M", "master_sku": "ATHUN-005-DEN-M", "bin_code": "KA-D1-P02-T03-1", "bin_location_id": "BIN_ID" } ]

POST /order-groups/GROUP_ID_2/fulfillment/pick-item
{ "warehouse_id": "WAREHOUSE_ID", "sku": "AOTHUN-DEN-M", "scanned_quantity": 1, "scan_method": "barcode", "bin_location_id": "BIN_ID" }
→ { "sku": "AOTHUN-DEN-M", "decrementedBy": 1, "remainingStock": 9 }
```

Tồn chung giảm từ 10 xuống 9 — dù dòng tồn "đứng tên" `ATD-M-01`. **Request/response `pick-item` không đổi gì** — FE không phải sửa.

### Trường hợp 4.5 — Bỏ nối bị chặn khi tồn đang gộp chung

```
GET /master-skus/ATHUN-005-DEN-M/mappings          → lấy "id" của liên kết → MAPPING_ID
DELETE /master-skus/mappings/MAPPING_ID
→ 409 MAP_HAS_POOLED_STOCK
  "SKU nội bộ "ATHUN-005-DEN-M" đang giữ 9 đơn vị tồn gộp chung — chuyển/kiểm kê về 0 trước khi bỏ nối."
```

**Vì sao chặn:** 9 cái đã gộp thì không còn biết cái nào "của" listing nào — tách ngược là đoán mò. Muốn bỏ nối thì đưa tồn về 0 trước (kiểm kê/chuyển đi). Khi bỏ **liên kết cuối cùng** (tồn = 0), các dòng tồn tự gỡ nhãn, quay về cách tính theo SKU sàn.

### Trường hợp 4.6 — Thay thế SKU: nhãn tồn đi theo

Giả sử lẽ ra phải là màu Trắng:

```
POST /master-skus/ATHUN-005-DEN-M/replace
{ "color_code": "TRANG", "reason": "Đặt nhầm màu" }
→ { "oldSku": { "masterSku": "ATHUN-005-DEN-M", "isActive": false, "replacedBy": "ATHUN-005-TRANG-M" },
    "newSku": { "masterSku": "ATHUN-005-TRANG-M", ... }, "movedMappings": 2 }
```

Kiểm tra `GET .../sku-bin-assignments` → dòng tồn giờ có `masterSku: "ATHUN-005-TRANG-M"`, số lượng giữ nguyên. Cả 2 listing Lazada đã nối sang SKU mới. _(Làm xong nhớ thay ngược lại hoặc tạo lại dữ liệu nếu muốn giữ ví dụ Đen cho các phần sau.)_

### Trường hợp 4.7 — Liên kết tạo trước khi deploy K4b / kiểm tra còn sót

Liên kết tạo ở giai đoạn K4a (trước K4b) **chưa gắn nhãn tồn**. Bấm 1 lần (chạy lại nhiều lần an toàn):

```
POST /master-skus/sync-stock          (Admin)
→ { "mappings": 12, "tagged": 9, "merged": 2 }
```

Báo cáo còn sót:

```
GET /master-skus/unpooled-stock        (Admin, Store Owner)
→ { "notMapped":       [ { "sellerSku": "QJEAN-30", "quantityOnHand": 5, "binLocationId": "...", ... } ],   ← cần NỐI
    "mappedNotSynced": [ ]                                                                                    ← cần bấm sync-stock }
```

Mục tiêu trước khi chạy thật: `notMapped` rỗng (hoặc chấp nhận có — vẫn chạy theo đường lùi).

🔄 **Từ 07/10/2026** (bản sửa của nhánh `feature/viet_befe`): nếu một SKU **đã nối** nhưng dòng tồn còn nằm trong `mappedNotSynced` (chưa bấm `sync-stock`), Picking List và quét hàng **vẫn tìm thấy** dòng đó (cùng sàn/shop) thay vì báo "CHƯA GÁN VỊ TRÍ". Tuy vậy **vẫn phải bấm `sync-stock`**: tồn khả dụng, báo cáo tồn theo SKU nội bộ và gộp tồn nhiều listing chỉ tính dòng đã gắn nhãn.

---

# PHẦN 5 — K5: CHỐNG BÁN LỐ

**Khái niệm:**

```
Tồn thực     = hàng thật đang trên kệ (mọi kho, mọi ô) của khóa tồn
Đã giữ       = tổng các nhóm đơn đang giữ chỗ nhưng chưa quét
Tồn khả dụng = Tồn thực − Đã giữ        ← con số quyết định có nhận thêm đơn được không
```

Khóa tồn theo K4b: SKU đã nối → theo SKU nội bộ (giữ chỗ chung mọi listing); chưa nối → theo SKU sàn.

**Khi nào hệ thống tự làm:**

| Sự kiện                                | Hệ thống                                       |
| -------------------------------------- | ---------------------------------------------- |
| Nhóm đơn mới được tạo (đồng bộ Lazada) | Giữ chỗ ngay; không đủ → `stockShortage: true` |
| Có đơn gộp đến muộn vào nhóm đơn       | Tính lại giữ chỗ                               |
| Quét hàng (`pick-item`)                | Tiêu phần đã giữ, cùng transaction với trừ tồn |
| Xác nhận lấy xong (`pick` → picked)    | Nhả phần giữ còn dư                            |

Nhóm đơn tạo **trước khi deploy K5** chưa có giữ chỗ → bấm "Tính lại" (5.3) để tạo.

### Trường hợp 5.1 — Xem tồn khả dụng

```
GET /stock-availability?platform=lazada&shop_id=201171264532&seller_sku=ATD-M-01
→ { "stockKey": "M:ATHUN-005-DEN-M", "masterSku": "ATHUN-005-DEN-M", "onHand": 9, "reserved": 0, "available": 9 }
```

Hỏi bằng `AOTHUN-DEN-M` cũng ra **đúng cùng 1 con số** (vì đã nối chung).

### Trường hợp 5.2 — Đủ hàng: giữ chỗ bình thường

Nhóm đơn cần 2 cái:

```
POST /order-groups/GROUP_ID/stock-reservation/recheck      (Admin, Store Owner)
→ { "stockShortage": false, "stockShortageItems": [] }

GET /order-groups/GROUP_ID/stock-reservation
→ [ { "sellerSku": "ATD-M-01", "masterSku": "ATHUN-005-DEN-M", "status": "active",
      "quantityNeeded": 2, "quantityPicked": 0, "quantityReserved": 2, "shortage": 0 } ]

GET /stock-availability?...seller_sku=ATD-M-01     → { "onHand": 9, "reserved": 2, "available": 7 }
```

### Trường hợp 5.3 — Món cuối cùng, 2 nhóm đơn tranh nhau ⭐ (tình huống chính của K5)

Chuẩn bị: đưa tồn về **đúng 1 cái** bằng kiểm kê (K3):

```
POST /warehouse/warehouses/WAREHOUSE_ID/sku-bin-assignments/ASSIGNMENT_A/adjust
{ "counted_quantity": 1, "reason_code": "count_correction", "note": "Chuẩn bị demo K5" }
```

Cần 2 nhóm đơn (A và B) cùng có SKU này, mỗi nhóm cần 1. (Nhóm đơn sinh từ đơn Lazada thật — có thể đặt 2 đơn thử, hoặc dùng 2 nhóm đơn sẵn có chứa cùng SKU.) Nếu nhóm A đang giữ chỗ từ bước trước, nhả trước cho sạch: `POST /order-groups/GROUP_A/stock-reservation/release`.

```
POST /order-groups/GROUP_A/stock-reservation/recheck
→ { "stockShortage": false, "stockShortageItems": [] }                         ← A giữ được cái cuối

POST /order-groups/GROUP_B/stock-reservation/recheck
→ { "stockShortage": true,
    "stockShortageItems": [ { "sku": "ATD-M-01", "needed": 1, "reserved": 0, "shortage": 1 } ] }   ← B bị gắn cờ NGAY

GET /order-groups/GROUP_B
→ { ..., "stockShortage": true, "stockShortageItems": [ ... ] }
```

**Thông điệp trình bày:** trước K5, cả A và B đều vào lấy hàng, nhân viên đi tới kệ mới phát hiện hết. Giờ B bị đánh dấu thiếu hàng **ngay lúc đơn về** — Store Owner xử lý sớm (nhập hàng, liên hệ khách, hủy).

**Nếu 2 nhóm đơn giữ chỗ cùng 1 thời điểm (2 đơn về cùng giây)?** Mỗi khóa tồn có 1 bản ghi "tổng đã giữ" được ghi trong transaction — 2 giao dịch đụng nhau thì MongoDB bắt 1 bên chạy lại, bên chạy lại thấy đã hết. **Không bao giờ giữ lố.** (Đã có test tự động; demo tay khó tạo đúng cùng giây nên chỉ cần nói.)

### Trường hợp 5.4 — Nhập thêm hàng → hết thiếu

```
POST /warehouse/warehouses/WAREHOUSE_ID/sku-bin-assignments/ASSIGNMENT_A/restock   { "quantity": 5 }
POST /order-groups/GROUP_B/stock-reservation/recheck
→ { "stockShortage": false, "stockShortageItems": [] }
```

⚠️ Nhập hàng **không tự** tính lại các nhóm đơn đang thiếu — phải bấm "Tính lại" (xem Phần 8 điểm yếu).

🔄 **07/10/2026:** trước ngày này lệnh `restock` luôn trả `404 WH_WAREHOUSE_NOT_FOUND` do lỗi kiểu id kho phía BE — đã sửa. Nếu demo trên bản BE cũ, dùng kiểm kê (`adjust`) để tăng tồn thay thế.

🔄 **Từ 01/10/2026** lệnh nhập hàng (`restock`) gọi được bằng tài khoản **Warehouse Staff** (trước đây chỉ Admin). Lệnh "Tính lại giữ chỗ" vẫn do Admin hoặc Store Owner thực hiện như trước.

### Trường hợp 5.5 — Quét hàng tiêu dần phần giữ, lấy xong thì nhả phần dư

Nhóm đơn cần 2, mới quét 1 rồi báo thiếu và xác nhận lấy xong:

```
POST /order-groups/GROUP_ID/fulfillment/pick-item   { ..., "scanned_quantity": 1 }
GET  /order-groups/GROUP_ID/stock-reservation
→ [ { "quantityNeeded": 2, "quantityPicked": 1, "quantityReserved": 1, "status": "active" } ]

POST /order-groups/GROUP_ID/fulfillment/pick         (xác nhận lấy xong)
GET  /order-groups/GROUP_ID/stock-reservation
→ [ { "quantityPicked": 1, "quantityReserved": 0, "status": "released" } ]     ← 1 cái dư đã trả cho đơn khác
```

### Trường hợp 5.6 — Nhóm đơn treo / bị hủy → nhả tay

Đơn bị hủy trên Lazada mà nhóm đơn không đi tiếp → phần giữ chỗ nằm im, làm giảm tồn khả dụng của đơn khác:

```
POST /order-groups/GROUP_ID/stock-reservation/release      (Admin)
→ { "releasedUnits": 2 }
```

---

# PHẦN 6 — FE CẦN LÀM GÌ Ở TỪNG MÀN HÌNH

| Màn hình                               | Việc cần làm                                                                                                                                                                                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Danh mục màu** (mới)                 | Danh sách + thêm/sửa/tắt. Mọi dropdown màu trong app (tạo kệ, SKU nội bộ) lấy từ `GET /colors`                                                                                                                                                                                         |
| **SKU nội bộ** (mới)                   | Form tạo: chọn danh mục cấp 2 → dropdown size lấy từ `sizeScale` của danh mục → chọn màu → số mẫu → hiện **mã xem trước** `ATHUN-005-DEN-M` (FE ghép để hiển thị, BE mới là nơi quyết định). Chi tiết SKU: tab "SKU sàn đã nối" + nút "Nối thêm" + nút "Thay thế SKU" (bắt nhập lý do) |
| **Nối SKU sàn** (mới)                  | Bảng `GET /master-skus/unmapped-seller-skus`, mỗi dòng nút "Nối vào…" chọn SKU nội bộ. **Không cho gõ tay mã sàn**                                                                                                                                                                     |
| **Đối soát tồn** (mới, Admin)          | `GET /master-skus/unpooled-stock` 2 tab: "Chưa nối" / "Đã nối chưa đồng bộ" + nút "Đồng bộ tồn" (`POST /master-skus/sync-stock`)                                                                                                                                                       |
| **Tồn kho theo ô** (cũ)                | 🔄 Hiện cột `masterSku` — có giá trị thì hiện nhãn "Tồn chung: ATHUN-005-DEN-M"                                                                                                                                                                                                        |
| **Sổ cái** (cũ)                        | 🔄 Hiện `masterSku`; dòng `refType: "sku_merge"` hiện nhãn "Gộp tồn"                                                                                                                                                                                                                   |
| **Picking List / quét hàng** (cũ)      | Không bắt buộc sửa. Nên hiện `master_sku` cạnh `sku` để nhân viên hiểu vì sao lấy ở ô "đứng tên" mã khác                                                                                                                                                                               |
| **Danh sách / chi tiết nhóm đơn** (cũ) | 🔄 Hiện badge đỏ **"Thiếu hàng"** khi `stockShortage: true`, tooltip từ `stockShortageItems`. Chi tiết nhóm đơn: tab "Giữ chỗ" (`GET .../stock-reservation`) + nút "Tính lại" + (Admin) "Nhả giữ chỗ"                                                                                  |
| **Tra tồn khả dụng** (mới)             | Ô nhập SKU → hiện 3 con số Tồn thực / Đã giữ / Khả dụng (`GET /stock-availability`)                                                                                                                                                                                                    |

---

# PHẦN 7 — KỊCH BẢN DEMO TRƯỚC HỘI ĐỒNG (~10 phút)

Chuẩn bị sẵn Phần 1 + Phần 2 trước buổi demo. Mở sẵn 2 tab trình duyệt: tài khoản Admin và Store Owner.

| Phút | Thao tác                                                                               | Thông điệp trình bày                                                                                 |
| ---- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 0:00 | Mở màn tồn kho: 2 dòng `ATD-M-01` (6) và `AOTHUN-DEN-M` (4), cùng 1 ô                  | "Shop đăng 2 listing cho cùng 1 chiếc áo. Hệ thống đang tưởng là 2 sản phẩm."                        |
| 1:00 | Tạo SKU nội bộ → mã tự ra `ATHUN-005-DEN-M`. Thử size XXL → bị từ chối                 | "Mã do hệ thống ghép theo quy tắc, không ai gõ tay được sai."                                        |
| 2:30 | Mở danh sách SKU chưa nối → nối listing 1 → xem tồn: đã gắn nhãn                       | "Nối xong, tồn tự chuyển sang tính theo tên chính thức."                                             |
| 3:30 | Nối listing 2 → tồn còn **1 dòng 10 cái** → mở sổ cái thấy dòng "Gộp tồn"              | "Đúng 10 cái như kệ thật, và có dấu vết ai gộp, lúc nào."                                            |
| 5:00 | Thử bỏ nối → bị chặn `MAP_HAS_POOLED_STOCK`                                            | "Tồn đã gộp thì không tách ngược được — hệ thống chặn thay vì đoán."                                 |
| 6:00 | Tra tồn khả dụng bằng cả 2 mã → cùng 1 con số                                          | "Chung 1 kho, chung 1 số."                                                                           |
| 7:00 | Kiểm kê về 1 cái → Tính lại nhóm A (giữ được) → Tính lại nhóm B → badge **Thiếu hàng** | "Món cuối cùng, 2 đơn tranh nhau. Đơn thứ 2 bị đánh dấu ngay khi về, không đợi nhân viên đi tới kệ." |
| 8:30 | Nhập thêm 5 → Tính lại B → hết thiếu                                                   | "Có hàng về là xử lý tiếp được."                                                                     |
| 9:00 | Quét 1 cái cho A → xem giữ chỗ giảm; xác nhận lấy xong → giữ chỗ `released`            | "Giữ chỗ tiêu dần theo từng lần quét, lấy xong thì trả phần dư cho đơn khác."                        |
| 9:30 | Chốt                                                                                   | "Nếu 2 đơn về đúng cùng 1 giây, transaction đảm bảo chỉ 1 đơn giữ được — đã kiểm bằng test tự động." |

**Câu hỏi thường gặp:**

- _"Chỉ có Lazada thì gộp tồn có ý nghĩa gì?"_ → Chính là trường hợp 2 listing cho 1 sản phẩm (rất phổ biến); và khi thêm Tiki/shop thứ 2 thì không phải đổi gì.
- _"Chưa nối hết thì sao?"_ → Đường lùi: SKU chưa nối vẫn chạy như cũ; báo cáo `unpooled-stock` cho biết còn bao nhiêu việc.
- _"Sao không đẩy tồn khả dụng lên Lazada?"_ → Ngoài phạm vi (không ghi ngược lên sàn); K5 bảo vệ ở phía kho.

---

# PHẦN 8 — MÃ LỖI, HẠN CHẾ HIỆN TẠI, CHECKLIST

## 8.1. Mã lỗi mới

| Mã                                                                                           | HTTP    | Khi nào                                                                                                                        |
| -------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `MAP_HAS_POOLED_STOCK`                                                                       | 409     | 🆕 K4b — bỏ nối khi SKU nội bộ còn tồn gộp chung                                                                               |
| `MAP_SELLER_SKU_UNKNOWN`                                                                     | 400     | Nối SKU sàn chưa từng đồng bộ về                                                                                               |
| `MAP_ALREADY_MAPPED`                                                                         | 409     | SKU sàn đã nối SKU nội bộ khác                                                                                                 |
| `MSKU_SIZE_NOT_IN_SCALE` / `MSKU_ALREADY_EXISTS` / `MSKU_HAS_MAPPINGS` / `MSKU_REPLACE_SAME` | 400/409 | Xem guide kho B4                                                                                                               |
| `COLOR_NOT_FOUND` / `COLOR_INACTIVE` / `COLOR_IN_USE`                                        | 400/409 | Màu                                                                                                                            |
| K5                                                                                           | —       | K5 **không có mã lỗi mới**: thiếu hàng là **trạng thái** (`stockShortage`), không phải lỗi — nhóm đơn vẫn được tạo bình thường |

## 8.2. Route mới

| Method | Route                                             | Role                          |
| ------ | ------------------------------------------------- | ----------------------------- |
| GET    | `/master-skus/unpooled-stock`                     | Admin, Store Owner            |
| POST   | `/master-skus/sync-stock`                         | Admin                         |
| GET    | `/stock-availability?platform&shop_id&seller_sku` | Admin, Store Owner, Warehouse |
| GET    | `/order-groups/:id/stock-reservation`             | Admin, Store Owner, Warehouse |
| POST   | `/order-groups/:id/stock-reservation/recheck`     | Admin, Store Owner            |
| POST   | `/order-groups/:id/stock-reservation/release`     | Admin                         |

Field mới trong response: nhóm đơn `stockShortage`, `stockShortageItems`; dòng tồn `masterSku`; sổ cái `masterSku`; Picking List `master_sku`.

## 8.3. Hạn chế hiện tại và hướng khắc phục

1. **Nhập hàng không tự tính lại** nhóm đơn đang thiếu — phải bấm "Tính lại". → Nên tự quét các nhóm đơn `stockShortage` của khóa tồn đó sau mỗi lần nhập.
2. **Đơn hủy trên Lazada không tự nhả giữ chỗ** — phải nhả tay (5.6). Giữ chỗ chỉ được tính lại khi số đơn trong nhóm đổi; hủy đơn không đổi số đơn. → Tính lại khi số đơn còn hiệu lực / đã hủy đổi; nhóm hủy hết thì nhả toàn bộ (rà soát 06/10/2026, chưa làm).
3. **Giữ chỗ tính trên TỔNG mọi kho**, chưa theo từng kho (đúng với shop 1 kho). → Khi có nhiều kho cần chọn kho lúc giữ chỗ.
4. **Không đẩy tồn khả dụng lên Lazada** — seller vẫn phải tự chỉnh số tồn trên Seller Center; K5 chỉ phát hiện sớm, không ngăn khách đặt.
5. **Giữ chỗ tính theo số lượng ĐẶT** — nếu kiểm hàng sau đó phát hiện nhầm, phải "Tính lại".
6. **Bỏ nối khi tồn = 0 mới được** — muốn tách listing đã gộp phải kiểm kê/chuyển ô về 0 trước; chưa có thao tác "tách tồn".
7. **Màu trên kệ (K2) chưa bị ép theo danh mục màu** — FE phải dùng dropdown `/colors`.
8. ~~**Thiếu hàng chưa có thông báo (chuông)**~~ — đã có thông báo `stock_shortage` cho Store Owner.
9. **Khóa giữ chỗ không đổi theo khi nối / bỏ nối / thay SKU nội bộ** (rà soát 06/10/2026, chưa làm) — nhóm đơn đang giữ chỗ dưới khóa SKU sàn, sau khi nối thì quét hàng không trừ được phần đã giữ và "Tính lại" sẽ giữ thêm lần nữa; thay SKU nội bộ có thể cho giữ vượt tồn. → Trước khi sửa: chỉ nối/thay SKU khi không có nhóm đơn đang giữ chỗ SKU đó, hoặc bấm "Nhả giữ chỗ" rồi "Tính lại" cho các nhóm liên quan ngay sau khi nối.
10. **Tìm tồn có nhánh dự phòng dòng chưa gắn nhãn** (từ 07/10/2026) — giúp không bị kẹt khi quên `sync-stock`, nhưng che việc chưa gộp tồn. → Tự gắn nhãn khi nối SKU / gán ô.

## 8.4. Checklist test (đánh dấu khi chạy xong)

- [ ] Chưa nối gì: Picking List `master_sku: null`, quét hàng như cũ
- [ ] Nối listing 1 → dòng tồn có `masterSku`, số lượng không đổi
- [ ] Nối listing 2 cùng ô → còn 1 dòng, số lượng = tổng; sổ cái có `sku_merge`
- [ ] Quét hàng bằng listing 2 → trừ vào dòng chung
- [ ] Bỏ nối khi còn tồn → `MAP_HAS_POOLED_STOCK`
- [ ] Thay thế SKU → dòng tồn đổi `masterSku` theo
- [ ] `sync-stock` chạy 2 lần liên tiếp → lần 2 `tagged: 0, merged: 0`
- [ ] Tồn khả dụng tra bằng 2 mã listing → cùng kết quả
- [ ] Món cuối: A giữ được, B `stockShortage: true`
- [ ] Nhập thêm + Tính lại → B hết thiếu
- [ ] Quét 1/2 rồi xác nhận lấy xong → giữ chỗ `released`, tồn khả dụng tăng lại phần dư
- [ ] Nhả tay → `releasedUnits` đúng số đang giữ
- [ ] 🆕 (07/10) Đã chạy script `migrate-objectid-fields.ts --apply`; Picking List của SKU đã gán ô không còn "CHƯA GÁN VỊ TRÍ"
- [ ] 🆕 (07/10) SKU đã nối nhưng chưa `sync-stock` → Picking List vẫn có ô, quét trừ được; sau `sync-stock` dòng tồn có `masterSku`
- [ ] 🆕 (07/10) `restock` → `201`, tồn tăng (trước đây `404`)
