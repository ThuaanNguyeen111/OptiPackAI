# OptiPackAI Backend — Integration Guide: Quản lý Kho (Warehouse Management)

**Phiên bản v1.1 — 26/09/2026 (K1 + K2 của đợt làm lại kho).** v1.0: vòng đời kho/khu/kệ + Product Master (K1). v1.1: danh mục 2 cấp, kệ chuẩn mới 5 phần, sức chứa ô, gợi ý ô, lộ trình lấy hàng hình rắn (K2). Tài liệu RIÊNG cho toàn bộ vòng đời dữ liệu kho: kho → khu → kệ → sản phẩm trên kệ, cùng dữ liệu kích thước sản phẩm (Product Master). Trước đây phần kho chỉ được nhắc trong `INTEGRATION_GUIDE_FULFILLMENT.md` mục "Nghiệp vụ 2b" (4 bước TẠO kho) — file này thay thế và mở rộng phần đó, vì kho giờ là 1 luồng nghiệp vụ đầy đủ, không chỉ là bước chuẩn bị cho lấy hàng. **v1.2 (27/09/2026): bước K3 — sổ cái kho, kiểm kê, chuyển ô, 1 SKU nhiều ô — xem PHẦN B3.** **v1.3 (27/09/2026): K4a — SKU nội bộ, danh mục màu, nối SKU sàn, sửa lỗi lọc sàn/shop khi trừ tồn — xem PHẦN B4.**

Đọc kèm: `API_LIST.md` (bảng route/role), `INTEGRATION_GUIDE_FULFILLMENT.md` (luồng lấy hàng dùng dữ liệu kho).

Quy ước đánh dấu: 🆕 **MỚI** = route/hành vi mới có; 🔄 **ĐÃ ĐỔI** = route cũ đổi hành vi, FE phải sửa; ⏳ **SẮP CÓ** = đã thiết kế, CHƯA code — KHÔNG gọi được, chỉ để FE chuẩn bị.

---

# PHẦN A — TỔNG QUAN

## A.1. Mô hình kho hiện tại (đang chạy)

```
Kho (warehouse)            VD: WH-HCM-01 — Kho Quận 7
 └─ Khu (zone)             VD: A — Phụ kiện điện thoại
     └─ Kệ/Ô (bin)         VD: A-03-01-01 = khu A, dãy 03, kệ 01, tầng 01
         └─ SKU trên kệ    VD: OPLUNG-IP15, còn 50 cái
```

Mã kệ hiện tại có dạng `{khu}-{dãy}-{kệ:2 số}-{tầng:2 số}`. Đợt làm lại kho sẽ đổi sang mã 5 phần (xem Phần D) — **mã hiện tại vẫn dùng bình thường cho tới khi bước K2 xong**.

## A.2. Có gì mới ở bước K1

Trước K1, phần kho chỉ có **Tạo** và **Xem**: không sửa được tên kho, không xóa được khu tạo nhầm, không tắt được kệ hỏng, và dữ liệu kích thước sản phẩm (dùng cho gợi ý đóng gói) hoàn toàn không có API — sai là phải vào thẳng MongoDB sửa. K1 bổ sung đủ vòng đời:

| Đối tượng | Trước K1 | Sau K1 |
|---|---|---|
| Kho | Tạo, Xem danh sách | + Xem chi tiết, Sửa, Vô hiệu hóa, Kích hoạt lại |
| Khu | Tạo, Xem | + Sửa, Vô hiệu hóa, Kích hoạt lại |
| Kệ | Sinh hàng loạt, Xem | + Vô hiệu hóa, Kích hoạt lại |
| Product Master | *(không có API)* | Xem danh sách, Xem chi tiết, Sửa tay |

## A.3. 4 nguyên tắc FE cần nắm trước khi đọc chi tiết

**1. "Xóa" nghĩa là VÔ HIỆU HÓA, không xóa hẳn.** Gọi `DELETE` → đối tượng chuyển `isActive: false`, vẫn còn trong DB. Lý do: lịch sử lấy hàng, đơn đã giao từ kho đó vẫn phải tra ra được. Muốn dùng lại → gọi `.../reactivate`.

**2. Còn hàng thì KHÔNG cho vô hiệu hóa.** Hệ thống cộng tổng tồn kho trong phạm vi đó; lớn hơn 0 → trả `409 WH_HAS_STOCK` kèm số lượng còn. Nếu cho tắt kho còn hàng, số hàng đó "biến mất" khỏi mọi màn hình nhưng vẫn nằm trên kệ thật.

**3. MÃ không bao giờ sửa được** (`warehouseCode`, `zoneCode`, `binCode`). Chỉ sửa tên/mô tả/địa chỉ. Mã khu nằm trong mọi mã kệ của khu, và mã kệ đã in nhãn dán lên kệ thật — đổi mã trên hệ thống mà nhãn vẫn cũ thì nhân viên đi nhầm chỗ. Gửi kèm trường mã khi sửa → **400** (hệ thống bật chế độ từ chối trường lạ).

**4. Tắt theo dây chuyền từ trên xuống, bật lại có quy tắc riêng** (Phần B.2).

---

# PHẦN B — NGHIỆP VỤ CHI TIẾT THEO TỪNG TÌNH HUỐNG

## B.1. Sửa thông tin kho / khu 🆕

```
PATCH /warehouse/warehouses/:warehouseId
Body: { "warehouse_name": "Kho Q7 (mở rộng)", "address": "456 Đường XYZ, Q7" }   // gửi 1 hoặc cả 2
→ 200: { "id": "...", "warehouseCode": "WH-HCM-01", "warehouseName": "Kho Q7 (mở rộng)", "address": "...", "isActive": true }

PATCH /warehouse/zones/:zoneId
Body: { "zone_name": "Phụ kiện", "description": "Ốp lưng, cáp sạc" }
→ 200: { "id": "...", "zoneCode": "A", "zoneName": "Phụ kiện", "description": "...", "isActive": true }
```

| Tình huống | Kết quả |
|---|---|
| Body rỗng `{}` | `400 WH_NOTHING_TO_UPDATE` |
| Gửi kèm `warehouse_code` / `zone_code` | `400` (lỗi validate, `message` là mảng chuỗi) |
| Sửa kho/khu đang bị vô hiệu hóa | **Cho phép** — sửa tên không ảnh hưởng vận hành |

**Gợi ý UI:** ô mã hiển thị dạng chỉ đọc (khóa), kèm dòng nhỏ "Mã không đổi được sau khi tạo".

## B.2. Vô hiệu hóa / kích hoạt lại 🆕

### Quy tắc dây chuyền

```
TẮT KHO  ──► tự tắt TẤT CẢ khu ──► tự tắt TẤT CẢ kệ       (1 transaction: hoặc tắt hết, hoặc không tắt gì)
TẮT KHU  ──► tự tắt TẤT CẢ kệ trong khu                    (1 transaction)
TẮT KỆ   ──► chỉ kệ đó

BẬT KHO  ──► CHỈ bật kho. Khu và kệ vẫn tắt — Admin bật lại từng khu cần dùng.
BẬT KHU  ──► bật khu + TẤT CẢ kệ trong khu. Điều kiện: kho phải đang bật.
BẬT KỆ   ──► chỉ kệ đó. Điều kiện: khu phải đang bật.
```

Vì sao bật kho không tự bật lại mọi khu: kho có thể bị tắt để sắp xếp lại, trong đó có khu đã bỏ hẳn — tự bật lại toàn bộ sẽ làm sống lại cả những khu không còn dùng.

### API

```
DELETE /warehouse/warehouses/:warehouseId              → 200 { ...kho, "isActive": false }
POST   /warehouse/warehouses/:warehouseId/reactivate   → 200 { ...kho, "isActive": true }
DELETE /warehouse/zones/:zoneId                        → 200 { ...khu, "isActive": false }
POST   /warehouse/zones/:zoneId/reactivate             → 200 { ...khu, "isActive": true }
DELETE /warehouse/bin-locations/:binId                 → 200 { ...kệ, "isActive": false }
POST   /warehouse/bin-locations/:binId/reactivate      → 200 { ...kệ, "isActive": true }
```

### Từng tình huống

**Tình huống 1 — tắt kho còn hàng.** Kho WH-HCM-01 còn 12 ốp lưng trên kệ A-03-01-01.
```
DELETE /warehouse/warehouses/:id
→ 409 { "error_code": "WH_HAS_STOCK", "message": "Kho \"WH-HCM-01\" còn 12 đơn vị hàng tồn — chuyển hết hàng đi trước khi vô hiệu hóa.", "details": { "unitsInStock": 12, ... } }
```
FE: hiện hộp thoại dùng đúng `message`, không tự đoán. Không có thay đổi nào được ghi. *(Chức năng "chuyển hàng sang kệ khác" sẽ có ở bước K3 — hiện tại muốn tắt thì phải xử lý hết hàng trước.)*

**Tình huống 2 — tắt kho đã hết hàng.** → 200. Mở danh sách khu sẽ thấy trống (vì đã bị tắt theo); thêm `?include_inactive=true` để thấy chúng với `isActive: false`.

**Tình huống 3 — bấm tắt 2 lần (mạng chậm, bấm lại).** Lần 2 trả 200 với trạng thái hiện tại, **không lỗi** — FE không cần chặn bấm lặp.

**Tình huống 4 — bật lại khu khi kho đang tắt.** → `409 WH_WAREHOUSE_INACTIVE`. FE hướng dẫn: "Kích hoạt lại kho trước".

**Tình huống 5 — bật lại kệ khi khu đang tắt.** → `409 WH_ZONE_INACTIVE`.

**Tình huống 6 — tắt 1 kệ còn hàng.** → `409 WH_HAS_STOCK` (chỉ tính hàng trên đúng kệ đó).

## B.3. Xem danh sách — tham số `include_inactive` 🔄

```
GET /warehouse/warehouses?include_inactive=true
GET /warehouse/warehouses/:warehouseId/zones?include_inactive=true
GET /warehouse/zones/:zoneId/bin-locations?include_inactive=true
GET /warehouse/warehouses/:warehouseId/bin-locations?include_inactive=true
GET /warehouse/warehouses/:warehouseId        🆕 chi tiết 1 kho (trả cả khi đã tắt)
```

- **Mặc định (không truyền) chỉ trả đối tượng đang hoạt động** — màn hình vận hành (chọn kho để lấy hàng, chọn kệ để gán SKU) không bao giờ hiện thứ đã tắt.
- `include_inactive=true` dùng cho màn hình quản trị (để bật lại).
- Với danh sách kho: **chỉ Admin** được xem kho đã tắt; Warehouse Staff truyền `true` vẫn chỉ nhận kho đang hoạt động (không lỗi, chỉ bị bỏ qua).
- 🔄 Response khu và kệ **có thêm trường `isActive`** (trước đây chỉ kho có).

## B.4. Thao tác bị chặn khi kho/khu/kệ đã tắt 🔄

Đây là thay đổi ảnh hưởng tới các màn hình ĐÃ CÓ:

| Thao tác (route cũ) | Khi nào bị chặn | Lỗi |
|---|---|---|
| Tạo khu — `POST .../warehouses/:id/zones` | Kho đã tắt | `409 WH_WAREHOUSE_INACTIVE` |
| Sinh kệ — `POST .../zones/:zoneId/bin-locations/generate` | Khu hoặc kho đã tắt | `409 WH_ZONE_INACTIVE` / `WH_WAREHOUSE_INACTIVE` |
| Gán SKU — `POST .../sku-bin-assignments` | Kho đã tắt / kệ đã tắt | `409 WH_WAREHOUSE_INACTIVE` / `WH_BIN_INACTIVE` |
| Nhập thêm hàng — `POST .../restock` | Kho đã tắt | `409 WH_WAREHOUSE_INACTIVE` |
| Picking List — `GET /warehouse/:warehouseId/picking-list/:groupId` | Kho đã tắt | `409 WH_WAREHOUSE_INACTIVE` |

**Lưu ý khi sinh kệ:** gọi `generate` lại đúng khoảng có kệ đã bị tắt thì **kệ đó KHÔNG tự bật lại** (chỉ tạo kệ chưa từng có) — muốn dùng lại phải gọi `.../reactivate` cho từng kệ, hoặc bật lại cả khu.

## B.5. Gán SKU vào kệ — sửa lỗi cũ 🔄

**Lỗi trước K1:** hệ thống không kiểm tra `bin_location_id` — gán được SKU vào kệ không tồn tại, hoặc kệ của **kho khác**. Picking List sau đó hiện "CHƯA GÁN VỊ TRÍ" hoặc vị trí ở kho khác mà không ai biết vì sao.

**Sau K1:**

| Tình huống | Lỗi |
|---|---|
| `bin_location_id` sai định dạng / không tồn tại | `400/404 WH_BIN_NOT_FOUND` |
| Kệ thuộc kho khác | `400 WH_BIN_NOT_IN_WAREHOUSE` |
| Kệ đã tắt | `409 WH_BIN_INACTIVE` |

**FE:** dropdown chọn kệ nên lấy từ `GET /warehouse/warehouses/:warehouseId/bin-locations` (đúng kho đang thao tác, mặc định chỉ kệ đang hoạt động) — khi đó 3 lỗi trên gần như không bao giờ xảy ra.

## B.6. Product Master — xem và sửa tay kích thước 🆕

**Product Master là gì:** bảng lưu kích thước + cân nặng + cờ dễ vỡ của từng SKU, lấy từ Lazada mỗi ngày 3h sáng. Thuật toán gợi ý đóng gói đọc bảng này để chọn thùng. Lazada trả sai/thiếu (đã gặp thật: thiếu kích thước làm sập Picking List ngày 19/09) → gợi ý đóng gói sai theo.

```
GET /product-master?shop_id=...&search=OPLUNG&manual_only=true&page=1&limit=20
→ 200: { "items": [ {...} ], "total": 56, "page": 1, "limit": 20 }

GET /product-master/:id
→ 200: {
  "id": "...", "platform": "lazada", "shopId": "201171264532", "sellerSku": "OPLUNG-IP15",
  "lengthCm": 20, "widthCm": 12, "heightCm": 2, "weightKg": 0.05,
  "isFragile": false,
  "manualOverride": false, "manualOverrideAt": null,
  "lastSyncedAt": "2026-09-26T20:00:00.000Z"
}

PATCH /product-master/:id
Body: { "package_weight_kg": 0.08, "is_fragile": true }      // gửi field nào sửa field đó
→ 200: { ..., "weightKg": 0.08, "isFragile": true, "manualOverride": true, "manualOverrideAt": "..." }
```

| Điểm cần biết | Chi tiết |
|---|---|
| Ai xem | Admin, Store Owner, Packaging Staff |
| Ai sửa | Admin, Store Owner |
| `search` | Tìm theo `sellerSku`, không phân biệt hoa/thường, chấp nhận ký tự đặc biệt |
| `limit` | Tối đa 100, mặc định 20 |
| Kích thước `null` | Dữ liệu hỏng/thiếu — FE hiện "Chưa có kích thước", mời nhập tay. Không coi là lỗi tải |
| Sửa 1 cạnh | 3 cạnh còn lại **giữ nguyên** (không bị xóa) |
| Không sửa được | `platform`, `shopId`, `sellerSku` — gửi lên → 400 |

### Xung đột với cron đồng bộ — đã xử lý

**Vấn đề:** cron 3h sáng mỗi ngày ghi đè kích thước từ Lazada. Nếu không xử lý, Admin sửa tay hôm nay thì sáng mai bị ghi đè mất.

**Cách xử lý:** sửa tay → hệ thống bật `manualOverride: true`. Cron gặp SKU có cờ này thì **chỉ cập nhật `lastSyncedAt`**, giữ nguyên số Admin đã nhập. FE nên hiện nhãn "Đã sửa tay" cho các SKU này (lọc nhanh bằng `manual_only=true`).

*Hiện chưa có nút "trả về số liệu Lazada" (tắt cờ sửa tay) — xem Phần E.*

---

# PHẦN B2 — BỐ CỤC KHO CHUẨN MỚI (bước K2) 🆕

## B2.1. Mã ô chuẩn mới — đọc mã là biết hàng gì

```
KA - D1 - P02 - T03 - 1
│    │    │     │     └ Ô số 1 (1 thùng trên tầng)      → 1 MÀU      (VD đen)
│    │    │     └────── Tầng 3                          → 1 SIZE     (VD M)
│    │    └──────────── Bên Phải, kệ số 02              → 1 LOẠI     (VD Áo thun)
│    └───────────────── Dãy 1                           → nhóm hàng  (VD dãy Áo)
└────────────────────── Khu A (chuẩn mới: KA..KZ)
```

- Bên kệ: `T` = trái, `P` = phải (theo lối đi, nhìn từ đầu dãy).
- Kệ và tầng luôn 2 chữ số (`P02`, `T03`) để mã dài đều nhau, dễ đọc trên nhãn.
- **Kệ chuẩn cũ** (`A-03-01-01`) **vẫn chạy bình thường** — không bị xóa, không phải đổi. Response có `layoutVersion: 1` để FE phân biệt.

## B2.2. Danh mục sản phẩm 2 cấp — tạo TRƯỚC khi tạo kệ

```
Cấp 1 (chỉ để nhóm, KHÔNG có size)    Cấp 2 (loại thật, BẮT BUỘC có thang size)
AO   Áo                          →    ATHUN  Áo thun      [S, M, L, XL]
                                      ASOMI  Áo sơ mi     [S, M, L, XL, XXL]
GIAY Giày                        →    GUOC   Guốc         [35, 36, 37, 38, 39, 40]
```

```
POST /categories                 Body cấp 1: { "code": "AO", "name": "Áo" }
                                 Body cấp 2: { "code": "ATHUN", "name": "Áo thun", "parent_code": "AO", "size_scale": ["S","M","L","XL"] }
GET  /categories                 → cây: [{ "code":"AO", ..., "children":[{ "code":"ATHUN", "sizeScale":[...] }] }]
GET  /categories/:code
PATCH /categories/:code          Body: { "name"?: "...", "size_scale"?: [...] }   (không sửa code, parent_code)
DELETE /categories/:code         → vô hiệu hóa
POST /categories/:code/reactivate
```

| Tình huống | Kết quả |
|---|---|
| Cấp 2 không có `size_scale` | `400 CAT_SIZE_SCALE_REQUIRED` |
| Cấp 1 có `size_scale` | `400 CAT_SIZE_SCALE_NOT_ALLOWED` |
| Tạo cấp 3 (cha là cấp 2) | `400 CAT_PARENT_NOT_LEVEL_1` — chỉ hỗ trợ 2 cấp |
| Mã trùng | `409 CAT_CODE_IN_USE` |
| Bỏ 1 size khỏi thang mà đang có ô kệ đăng ký size đó | `409 CAT_SIZE_IN_USE` + số ô đang dùng — đổi đăng ký các ô trước |
| Tắt cấp 1 còn con đang bật | `409 CAT_HAS_ACTIVE_CHILDREN` |
| Tắt cấp 2 đang có ô kệ đăng ký | `409 CAT_IN_USE` |
| Bật lại cấp 2 khi cha đang tắt | `409 CAT_PARENT_INACTIVE` |

**Vì sao giới tính (nam/nữ) KHÔNG phải cấp danh mục:** áo thun có cả nam, nữ, unisex — làm thành danh mục thì cây nhân ba và báo cáo "bán bao nhiêu áo thun" phải cộng 3 nhánh. Giới tính sẽ là thuộc tính của mẫu sản phẩm (bước K4).

## B2.3. Tạo kệ chuẩn mới — 1 lần gọi tạo cả kệ

```
POST /warehouse/zones/:zoneId/racks
Body: {
  "aisle": "D1",
  "side": "P",
  "bay": 2,
  "category_code": "ATHUN",
  "tiers": [ { "tier": 1, "size": "XL" }, { "tier": 2, "size": "L" }, { "tier": 3, "size": "M" },
             { "tier": 4, "size": "S" } ],
  "cells_per_tier": 3,
  "cell_colors": ["DEN", "TRANG", "VANG"],     // tùy chọn, độ dài = cells_per_tier
  "capacity_per_cell": 30                       // tùy chọn, bỏ trống = không giới hạn
}
→ 201: [ 12 ô, đã sắp theo lộ trình ]
  { "binCode": "KA-D1-P02-T01-1", "layoutVersion": 2, "side": "P", "cell": 1, "capacity": 30,
    "designated": { "categoryCode": "ATHUN", "size": "XL", "colorCode": "DEN" }, "pickSequence": 1010203011, "isActive": true, ... }
```

Ví dụ trên tạo kệ số 2 bên phải dãy D1: 4 tầng × 3 ô = **12 ô**, ô 1 mọi tầng là màu đen, ô 2 trắng, ô 3 vàng.

**Khuyến nghị xếp size theo tầng:** vùng lấy hàng dễ nhất là khoảng giữa đùi tới giữa ngực (tầng 2-3). Đặt **size bán chạy nhất** (thường M, L) ở tầng 2-3; tầng 1 sát sàn và tầng trên cùng cho size bán chậm. Hệ thống không ép thứ tự — Admin tự khai tầng nào size gì.

| Tình huống | Kết quả |
|---|---|
| Khu dùng mã cũ (VD `A`) | `409 WH_ZONE_LEGACY_FORMAT` — kệ chuẩn mới chỉ tạo trong khu `KA..KZ` |
| Danh mục là cấp 1 / đã tắt / không tồn tại | `400 CAT_NOT_LEVEL_2` / `409 CAT_INACTIVE` / `404 CAT_NOT_FOUND` |
| Size tầng không thuộc thang size | `400 WH_SIZE_NOT_IN_SCALE` (kèm thang size đúng) |
| Khai trùng tầng / số màu khác số ô | `400 WH_INVALID_RACK_LAYOUT` |
| Kệ (dãy + bên + số kệ) đã có | `409 WH_RACK_EXISTS` — không trộn đăng ký cũ/mới |
| Khu/kho đã tắt | `409 WH_ZONE_INACTIVE` / `WH_WAREHOUSE_INACTIVE` |
| Giới hạn | Tầng 1-9, ô 1-9 (tối đa 81 ô/lần), kệ 1-99, dãy D1-D99 |

Tạo ô là **tất cả hoặc không** — lỗi giữa chừng thì không ô nào được tạo.

🔄 `POST .../bin-locations/generate` (chuẩn cũ) được đánh dấu **deprecated** trên Swagger — vẫn gọi được nhưng không nên dùng cho kệ mới (không giới hạn khoảng, không có danh mục/size/màu).

## B2.4. Sửa 1 ô — sức chứa và thuộc tính đăng ký

```
PATCH /warehouse/bin-locations/:binId
Body: { "capacity": 40, "designated_size": "M", "designated_color_code": "XANH" }   // gửi field nào sửa field đó
      { "capacity": null }                                                         // bỏ giới hạn sức chứa
```

| Tình huống | Kết quả |
|---|---|
| Hạ sức chứa xuống dưới số hàng đang có | `409 WH_BIN_OVER_CAPACITY` |
| Size không thuộc thang size danh mục | `400 WH_SIZE_NOT_IN_SCALE` |
| Đăng ký size mà ô chưa có danh mục | `400 WH_INVALID_RACK_LAYOUT` |
| Mã ô, vị trí vật lý | Không sửa được (đã in nhãn) |


> 🔄 **Rà soát K2 (26/09/2026) — ĐỔI ĐĂNG KÝ Ô ĐANG CÓ HÀNG BỊ CHẶN:** đổi danh mục/size/màu của ô còn hàng → `409 WH_BIN_HAS_STOCK_DESIGNATION` (kèm `details.unitsInStock`). Lý do: nhãn hệ thống ghi "size M" mà thùng thật vẫn chứa size L thì nhân viên lấy nhầm. Chuyển hết hàng ra trước. **Đổi sức chứa khi ô còn hàng vẫn được** (miễn không thấp hơn số đang có).

## B2.5. Sức chứa ô khi xếp/nhập hàng 🔄

Sức chứa tính trên **tổng hàng của mọi SKU đang nằm trong ô** (đơn vị sản phẩm). Áp dụng cho:
- Gán SKU vào kệ (`POST .../sku-bin-assignments`)
- Nhập thêm hàng (`POST .../restock`)

Vượt sức chứa → `409 WH_BIN_OVER_CAPACITY` với `details: { capacity, current, incoming }`. **FE:** hiện hộp thoại "Ô này chứa tối đa 30, đang có 25, thêm 10 sẽ vượt — vẫn xếp?" → nếu người dùng xác nhận, gửi lại cùng body kèm `"force": true`. Ô không khai sức chứa (kệ cũ, hoặc `capacity: null`) thì không kiểm tra.

## B2.6. Gợi ý ô để xếp hàng

```
GET /warehouse/warehouses/:warehouseId/bin-suggestions?category_code=ATHUN&size=M&color_code=DEN
→ 200: [
  { "bin": { "binCode": "KA-D1-P02-T03-1", ... }, "matchLevel": 3, "usedUnits": 5, "freeCapacity": 25 },
  { "bin": { "binCode": "KA-D1-P02-T03-2", ... }, "matchLevel": 2, "usedUnits": 0, "freeCapacity": 30 },
  ...
]
```

- `matchLevel`: **3** = đúng danh mục + size + màu; **2** = đúng danh mục + size; **1** = cùng danh mục.
- Chỉ gợi ý ô **còn chỗ**; tối đa 20 ô; cùng mức thì ô trống nhiều hơn đứng trước.
- Đây là **gợi ý**, không bắt buộc — Admin vẫn chọn ô khác được (VD hết chỗ, xếp tạm).
- Ai gọi: Admin, Warehouse Staff.

## B2.7. Picking List theo lộ trình hình rắn 🔄

Trước K2, Picking List sắp theo chữ cái của mã kệ → nhân viên đi hết 1 dãy rồi phải **quay về đầu** dãy sau, và đi hết bên phải rồi mới quay lại bên trái. Từ K2, mỗi ô chuẩn mới có `pickSequence` tính sẵn:

```
        D1 (đi xuôi ↓)        D2 (đi ngược ↑)
Kệ 1   [T][P]  ──┐           ┌──  [T][P]   ← kết thúc
Kệ 2   [T][P]    │           │    [T][P]
Kệ 3   [T][P]    ↓           ↑    [T][P]
       cuối D1 ──┴───────────┘  đầu D2
```

- Dãy lẻ đi xuôi, dãy chẵn đi ngược → hết dãy này là đang đứng ở đầu dãy kế.
- Đứng ở 1 vị trí thì lấy cả 2 bên (T trước, P sau).
- **Kho đang chuyển đổi** (có cả kệ cũ lẫn kệ mới): dòng ở kệ mới đi trước theo lộ trình, dòng ở kệ cũ và dòng "CHƯA GÁN VỊ TRÍ" đi sau theo cách sắp cũ. Mỗi dòng Picking List có thêm `pick_sequence` (`null` = kệ cũ/chưa gán).

---

## B2.8. Product Master — bỏ sửa tay 🆕

```
DELETE /product-master/:id/manual-override   (Admin, Store Owner)
→ 200: { ..., "manualOverride": false, "manualOverrideAt": null }
```

Số hiện tại **giữ nguyên** cho tới lần đồng bộ kế tiếp (cron 3h sáng hoặc chạy script đồng bộ tay) — lúc đó mới lấy lại số liệu Lazada. Dùng khi Admin sửa tay nhầm, hoặc Lazada đã cập nhật số đúng.

---


# PHẦN B3 — BƯỚC K3: SỔ CÁI KHO, KIỂM KÊ, CHUYỂN Ô 🆕 (27/09/2026)

## B3.1. Sổ cái — mọi thay đổi tồn kho đều để lại dấu vết

Từ K3, **mọi lần số tồn thay đổi** đều ghi 1 dòng vào sổ cái, trong cùng 1 transaction với chính thay đổi đó:

| `type` | Khi nào |
|---|---|
| `assign_initial` | Gán SKU vào ô kèm tồn ban đầu |
| `receive` | Nhập thêm hàng (restock) |
| `pick` | Nhân viên quét lấy hàng cho đơn (`refType: order_group`) |
| `adjust` | Kiểm kê (kể cả khớp — chênh 0) |
| `transfer_out` / `transfer_in` | Chuyển ô (2 dòng cùng `refId`) |
| `return_restock` | Hàng trả/hoàn đạt kiểm tra, nhập lại (`refType: return_request`) — xem `INTEGRATION_GUIDE_SHIPPING.md` |

```
GET /warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/movements?limit=100
→ [ { "type": "adjust", "delta": -1, "quantityBefore": 12, "quantityAfter": 11, "reasonCode": "damaged",
      "note": "1 cái rách bao bì", "actorId": "u1", "createdAt": "..." }, ... ]   (mới → cũ)
```
Quyền: Admin, Warehouse Staff, Store Owner. Sổ cái **không có nút sửa/xóa**.

## B3.2. Kiểm kê

```
POST /warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/adjust     (Admin, Warehouse)
Body: { "counted_quantity": 11, "reason_code": "damaged", "note": "1 cái rách bao bì" }
```
- Nhập **số đếm được thực tế**, hệ thống tự tính chênh lệch — không bắt nhân viên tự trừ.
- `reason_code`: `count_correction` · `damaged` · `lost` · `found` · `other` (bắt buộc `note`, thiếu → `400 WH_NOTE_REQUIRED`).
- **Kiểm kê khớp (chênh 0) vẫn ghi sổ** — làm bằng chứng đã kiểm, ai kiểm, lúc nào.
- Trong lúc đang đếm mà có người lấy/nhập hàng ở ô đó → `409 WH_STOCK_CHANGED` → tải lại, đếm lại. Hệ thống không bao giờ ghi đè con số người khác vừa thay đổi.

## B3.3. Chuyển hàng sang ô khác

```
POST /warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/transfer   (Admin, Warehouse)
Body: { "to_bin_location_id": "66e9...", "quantity": 5, "force": false, "note": "Dọn ô cho size mới" }
→ 200: { "from": { ...ô nguồn, quantityOnHand: 7 }, "to": { ...ô đích, quantityOnHand: 5 } }
```
Trừ nguồn + cộng đích + 2 dòng sổ cái trong **1 transaction** — không bao giờ có lúc hàng "biến mất" giữa 2 ô.

| Tình huống | Lỗi |
|---|---|
| Ô nguồn không đủ (kể cả vừa bị lấy mất giữa chừng) | `409 WH_INSUFFICIENT_STOCK` |
| Ô đích = ô nguồn | `400 WH_SAME_BIN` |
| Ô đích thuộc kho khác / đã tắt | `WH_BIN_NOT_IN_WAREHOUSE` / `WH_BIN_INACTIVE` |
| Ô đích vượt sức chứa | `409 WH_BIN_OVER_CAPACITY` — gửi `force: true` để vẫn chuyển |

## B3.4. 1 SKU nằm nhiều ô 🔄

Trước K3, 1 SKU chỉ nằm được 1 ô/kho. Nay 1 SKU có thể nằm nhiều ô (hàng về 200 cái, mỗi ô chứa 50). Hệ quả cho các route cũ:

| Route | Trước K3 | Sau K3 |
|---|---|---|
| `POST .../sku-bin-assignments` (gán) | Gọi lại với ô khác = **DỜI** SKU + toàn bộ tồn sang ô mới, không ghi lịch sử | Gọi với ô khác = **THÊM** SKU vào ô đó (tồn riêng). Gọi lại đúng ô đã có = trả bản ghi cũ, không đổi gì. **Muốn dời hàng → dùng chuyển ô (B3.3)** |
| Picking List | 1 dòng 1 ô | Mỗi dòng có `bin_location_id` (ô CHÍNH — ô còn hàng đứng trước theo lộ trình) + `other_bins: [{ bin_location_id, bin_code, quantity_on_hand }]` |
| `POST /order-groups/:id/fulfillment/pick-item` | Trừ ở ô bất kỳ đủ hàng | Nhận thêm `bin_location_id` (tùy chọn) → **trừ đúng ô nhân viên lấy**. FE nên gửi `bin_location_id` lấy từ Picking List. Không gửi thì vẫn chạy như cũ |

Bỏ gán SKU khỏi ô (chỉ khi tồn = 0, sổ cái cũ giữ nguyên):
```
DELETE /warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId     (Admin)
→ còn hàng: 409 WH_ASSIGNMENT_HAS_STOCK
```

## B3.5. ⚠️ Việc BẮT BUỘC làm trên mỗi môi trường sau khi deploy K3

Mongoose tự tạo index mới nhưng **không tự xóa index cũ** (1 SKU 1 ô). Nếu không chạy script, gán SKU vào ô thứ 2 / chuyển ô sẽ lỗi trùng khóa:
```
npx ts-node -r dotenv/config scripts/migrate-sku-bin-assignment-multibin.ts
```
Chạy lại nhiều lần an toàn, không đụng dữ liệu.

---


# PHẦN B4 — BƯỚC K4a: SKU NỘI BỘ, DANH MỤC MÀU, NỐI SKU SÀN 🆕 (27/09/2026)

> K4 chia 2 phần vì rủi ro: **K4a (đã xong)** dựng danh mục SKU nội bộ + sửa lỗi; **K4b (chưa làm)** mới chuyển TỒN KHO sang tính theo SKU nội bộ. Ở K4a, tồn kho, gán kệ, lấy hàng **vẫn dùng SKU sàn như trước**.

## B4.1. Danh mục màu
```
POST /colors   { "code": "DEN", "name": "Đen", "hex": "#000000" }      (Admin; mã 2-10 CHỮ HOA, khóa sau khi tạo)
GET  /colors                                                            dropdown màu cho mọi form
PATCH /colors/:code · DELETE /colors/:code (chặn nếu còn SKU dùng: COLOR_IN_USE) · POST /colors/:code/reactivate
```
FE dùng dropdown từ `/colors` cho **mọi** chỗ chọn màu (kể cả `cell_colors` khi tạo kệ K2) — hết lỗi `DEN`/`DENN`.

## B4.2. SKU nội bộ — hệ thống tự ghép mã
```
POST /master-skus      (Admin)
{ "category_code": "ATHUN", "model_no": 5, "color_code": "DEN", "size": "M",
  "name": "Áo thun basic đen M", "gender": "unisex", "weight_kg": 0.2, "is_fragile": false }
→ { "masterSku": "ATHUN-005-DEN-M", ... }
```
- Mã = `{danh mục cấp 2}-{mẫu 3 số}-{màu}-{size}` — **FE không gửi mã**, hệ thống ghép.
- Danh mục phải cấp 2 đang hoạt động; size thuộc thang size danh mục (`MSKU_SIZE_NOT_IN_SCALE`); màu có trong danh mục màu (`COLOR_NOT_FOUND`/`COLOR_INACTIVE`).
- **Sửa được:** tên, giới tính, kích thước, cân nặng, dễ vỡ (`PATCH /master-skus/:code`). **Không sửa được:** mã và 4 thành phần tạo mã.
- Giới tính là **thuộc tính**, không phải cấp danh mục (đúng quyết định đã chốt).

## B4.3. Thay thế SKU (khi đặt sai)
```
POST /master-skus/ATHUN-005-DEN-M/replace   { "color_code": "TRANG", "reason": "Đặt nhầm màu" }
→ { "oldSku": {..., "isActive": false, "replacedBy": "ATHUN-005-TRANG-M"}, "newSku": {...}, "movedMappings": 2 }
```
1 transaction: tạo SKU mới (chép tên/kích thước) → chuyển **mọi** liên kết SKU sàn sang SKU mới → khóa SKU cũ + `replacedBy`. Tra SKU cũ vẫn biết đã thay bằng gì. Không đổi thành phần nào → `MSKU_REPLACE_SAME`.

## B4.4. Nối SKU sàn → SKU nội bộ
```
GET  /master-skus/unmapped-seller-skus        SKU sàn đã đồng bộ về nhưng chưa nối (danh sách việc cần làm)
POST /master-skus/ATHUN-005-DEN-M/mappings    { "platform": "lazada", "shop_id": "201171264532", "seller_sku": "ATD-M-01" }
GET  /master-skus/ATHUN-005-DEN-M/mappings
DELETE /master-skus/mappings/:id
```
- **Chỉ nối được SKU sàn đã đồng bộ về** (`MAP_SELLER_SKU_UNKNOWN` nếu gõ mã chưa từng thấy) — FE nên cho chọn từ danh sách unmapped, không cho gõ tay.
- So khớp **không phân biệt hoa/thường, bỏ dấu cách 2 đầu** (`atd-m-01 ` = `ATD-M-01`); lưu cả bản gốc.
- 1 SKU sàn chỉ nối 1 SKU nội bộ (`MAP_ALREADY_MAPPED` kèm SKU đang nối); nhiều SKU sàn (Lazada, Tiki, shop khác) có thể nối chung 1 SKU nội bộ.
- Vô hiệu hóa SKU nội bộ còn liên kết → `MSKU_HAS_MAPPINGS`.

## B4.5. 🔄 Sửa lỗi có sẵn — trừ tồn khi quét hàng
| Trước K4a | Sau K4a |
|---|---|
| `pick-item` và Picking List chỉ lọc `kho + seller_sku` → 2 sàn/shop trùng chuỗi SKU có thể **trừ nhầm tồn** của nhau | Lọc thêm `platform + shop_id` của nhóm đơn |
| Trừ tồn rồi mới ghi sổ cái + nhật ký quét, **không transaction** → lỗi giữa chừng thì tồn đã trừ mà không có dòng sổ | Trừ tồn + sổ cái + nhật ký quét trong **1 transaction** |

FE **không phải sửa gì** — request/response `pick-item` và Picking List giữ nguyên.

## B4.6. K4b + K5 — ✅ ĐÃ XONG (27/09/2026)

> Chi tiết từng bước, từng trường hợp và kịch bản demo: **`INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md`**.

~~K4b — sắp làm~~
Chuyển tồn kho, gán kệ, Picking List, trừ tồn sang tính theo **SKU nội bộ** (Lazada + Tiki bán chung 1 tồn). Cần mọi SKU sàn đang có hàng phải được nối trước → sẽ có script kiểm tra "SKU sàn còn tồn nhưng chưa nối" trước khi bật.

---

# PHẦN C — TÁC ĐỘNG TỚI DỮ LIỆU VÀ LUỒNG ĐÃ CÓ

## C.1. Dữ liệu cũ trong DB — không cần chạy script gì

Khu và kệ tạo **trước K1** không có trường `is_active`. Hệ thống coi "không có trường" = **đang hoạt động** (lọc bằng "khác false", không phải "bằng true"). Nghĩa là:
- Không cần chạy migration.
- Mọi khu/kệ cũ vẫn hiện bình thường, response trả `isActive: true`.
- Chỉ khi Admin chủ động tắt thì trường mới được ghi `false`.

Product Master cũ không có `manual_override` → coi là chưa sửa tay → cron vẫn đồng bộ bình thường.

## C.2. Các luồng bị ảnh hưởng — FE phải sửa gì

| Màn hình đang có | Cần sửa |
|---|---|
| Danh sách kho / khu / kệ (Admin) | Hiển thị trạng thái `isActive`; thêm nút Sửa, Vô hiệu hóa, Kích hoạt lại; công tắc "Hiện cả mục đã tắt" (truyền `include_inactive=true`) |
| Form tạo khu / sinh kệ | Bắt `409 WH_WAREHOUSE_INACTIVE` / `WH_ZONE_INACTIVE` |
| Form gán SKU vào kệ | Dropdown kệ lấy đúng kho đang thao tác; bắt 3 lỗi kệ ở mục B.5 |
| Nhập thêm hàng | Bắt `409 WH_WAREHOUSE_INACTIVE` |
| Màn hình Warehouse Staff chọn kho → Picking List | Không đổi gì nếu chỉ lấy kho từ danh sách mặc định (đã lọc sẵn). Vẫn nên bắt `409 WH_WAREHOUSE_INACTIVE` phòng trường hợp kho bị tắt trong lúc đang mở màn hình |
| *(mới)* Màn hình Product Master | Danh sách + tìm kiếm + form sửa kích thước |

## C.3. Luồng KHÔNG bị ảnh hưởng

Đồng bộ đơn Lazada, gộp đơn, tạo nhóm đơn, quét lấy hàng (`pick-item`), báo thiếu hàng, gợi ý đóng gói, duyệt đóng gói, thông báo — **không đổi hành vi**.

## C.4. 2 lỗi có sẵn phát hiện trong lúc làm K1

| Lỗi | Trạng thái |
|---|---|
| Gán SKU không kiểm tra kệ (mục B.5) | ✅ Đã sửa trong K1 |
| Trừ tồn khi quét và Picking List chỉ lọc theo `kho + seller_sku`, **không lọc sàn/shop**. Nếu 2 sàn (hoặc 2 shop) có SKU trùng chuỗi trong cùng kho → có thể trừ nhầm tồn của sàn kia | ⚠️ Chưa sửa — hiện chưa xảy ra vì dữ liệu chỉ có 1 shop Lazada. Bước K4 (SKU nội bộ, 1 tồn chung cho mọi sàn) xử lý tận gốc |

## C.5. Tác động của K2 🔄

**Dữ liệu cũ:** kệ tạo trước K2 không có các trường mới → response trả `layoutVersion: 1`, `side/cell/capacity/designated/pickSequence = null`. **Không cần migration, không bị xóa.** Kệ chuẩn mới vẫn ghi `rack` (= số kệ) và `level` (= số tầng) nên màn hình cũ đọc 2 trường này không vỡ.

**Route cũ đổi hành vi:**

| Route | Thay đổi | FE phải làm |
|---|---|---|
| `POST .../warehouses/:id/zones` | `zone_code` bắt buộc dạng `KA..KZ` | Validate ô nhập mã khu; khu cũ đã tạo không bị ảnh hưởng |
| `POST .../sku-bin-assignments`, `POST .../restock` | Có thể trả `409 WH_BIN_OVER_CAPACITY`; nhận thêm `force` | Hộp thoại xác nhận + gửi lại kèm `force: true` |
| `GET .../picking-list/:groupId` | Thứ tự mới; mỗi dòng có `pick_sequence` | Hiển thị đúng thứ tự API trả, KHÔNG tự sắp lại theo mã kệ |
| Mọi GET kệ | Response có thêm 6 trường | Hiển thị mã kệ mới + danh mục/size/màu của ô |
| `POST .../bin-locations/generate` | Deprecated | Chuyển form tạo kệ sang `POST .../racks` |

**Không bị ảnh hưởng:** đồng bộ đơn, gộp đơn, quét lấy hàng, báo thiếu, đóng gói, thông báo, Product Master.

**Kế hoạch bỏ chuẩn cũ:** khi mọi ô kệ cũ đã hết hàng → vô hiệu hóa các khu mã cũ (`DELETE /warehouse/zones/:id`). Không cần xóa dữ liệu.

### C.5b. Rà soát lại code K2 (26/09/2026) — 2 lỗ hổng đã sửa

| Lỗ hổng | Hậu quả nếu không sửa | Đã xử lý |
|---|---|---|
| Ô đang có hàng vẫn đổi được danh mục/size/màu đăng ký | Nhãn hệ thống và hàng thật lệch nhau → lấy nhầm hàng | Chặn `409 WH_BIN_HAS_STOCK_DESIGNATION` |
| Route sinh kệ **kiểu cũ** (`.../bin-locations/generate`, đã lỗi thời) vẫn chạy trong khu chuẩn mới `KA..KZ` | 1 khu lẫn 2 kiểu mã (`KA-03-01-01` và `KA-D1-P02-T03-1`), lộ trình lấy hàng lẫn lộn | Ở khu `KA..KZ` trả `409 WH_ZONE_V2_USE_RACKS`; khu mã cũ vẫn dùng route cũ được (tương thích ngược) |

**FE cần làm thêm:** bắt 2 mã lỗi trên; ẩn nút "Sinh kệ kiểu cũ" ở khu có mã `KA..KZ`; thêm nút "Bỏ sửa tay" ở Product Master (B2.8).


---

# PHẦN D — ĐỢT LÀM LẠI KHO: CÁC BƯỚC TIẾP THEO ⏳ (CHƯA CÓ, chỉ để FE chuẩn bị)

| Bước | Nội dung | FE sẽ phải làm gì |
|---|---|---|
| ~~K2~~ | ✅ **ĐÃ XONG 26/09/2026** — xem PHẦN B2, C.5, C.5b. Ký hiệu bên `T`/`P` theo quy ước nhóm (đổi 1 dòng trong `warehouse-layout.ts` nếu cần). Kệ cũ không phải xóa, chạy song song | — |
| **K3** | Sổ cái biến động kho; điều chỉnh kiểm kê (bắt lý do); chuyển hàng giữa các ô; 1 SKU nằm nhiều ô | Màn hình kiểm kê, chuyển ô; Picking List có thể chỉ 1 SKU lấy từ nhiều ô |
| **K4** (K4a + K4b ✅ xong 27/09 — B4 + guide SKU_STOCK) | SKU nội bộ (`GUOC-005-DEN-37`) + bảng nối SKU Lazada/Tiki; 1 tồn chung mọi sàn; thao tác "Thay thế SKU" | Màn hình nối SKU sàn; gán kệ theo SKU nội bộ thay vì SKU sàn |
| ~~K5~~ | ✅ **ĐÃ XONG 27/09/2026** — giữ chỗ + tồn khả dụng + cờ thiếu hàng, xem `INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md` | — |

Mỗi bước khi xong sẽ cập nhật file này với đầy đủ phần "Tác động tới luồng đã có" như Phần C.

---

# PHẦN E — ĐIỂM CÒN YẾU CỦA PHẦN KHO SAU K1 + K2 (nói thẳng để FE/nhóm biết)

1. **Chưa ghi ai tắt/bật, lúc nào.** Có trạng thái nhưng không có nhật ký thao tác quản trị. → Làm cùng sổ cái ở K3.
2. **Khe thời gian hẹp khi tắt kho:** hệ thống kiểm tồn = 0 rồi mới tắt; nếu đúng giữa 2 bước đó có người nhập hàng thì kho bị tắt khi vẫn còn hàng. Rất hiếm (Admin tắt kho và nhân viên nhập hàng cùng lúc). → Xử lý triệt để ở K3 khi mọi thay đổi tồn đi qua sổ cái.
3. **Chưa có nút bỏ sửa tay** Product Master (trả về số Lazada). → Bổ sung nhỏ, làm cùng K2.
4. **Nhập hàng chỉ là 1 con số** — không có phiếu nhập, nhà cung cấp, người nhận hàng. → K3.
5. **Chưa có cảnh báo tồn kho thấp.** → Đề xuất thêm sau K3 (dùng lại hệ thống thông báo sẵn có).
6. **Product Master chỉ có SKU đã từng có đơn** (thiết kế cũ để tiết kiệm lượt gọi Lazada) — sản phẩm mới chưa ai mua thì không có kích thước. → Bước K4 cho phép tạo SKU nội bộ kèm kích thước ngay từ đầu, không phụ thuộc đơn hàng.

**Phát hiện thêm khi làm K2 (rà lại cách vận hành):**

7. **Nhân viên và nhóm đơn không gắn với kho nào.** Tự động gán việc chọn trong TOÀN BỘ Warehouse Staff của hệ thống; kho để lấy hàng do FE chọn lúc mở Picking List. 1 kho thì không sao; 2 kho trở lên thì nhân viên kho A có thể bị giao đơn phải lấy ở kho B, và không có quy tắc nào quyết định đơn nào do kho nào xử lý. → Cần thêm "kho phục vụ" cho nhóm đơn + "kho làm việc" cho nhân viên (đề xuất làm cùng K5).
8. **Kiểm tra sức chứa khi nhập hàng chưa tuyệt đối an toàn** khi 2 người nhập cùng 1 ô cùng lúc (cả 2 có thể cùng lọt). → K3 (mọi thay đổi tồn đi qua sổ cái).
9. **Sức chứa tính theo số cái, không theo thể tích** — 30 đôi tất và 30 áo khoác chiếm chỗ khác hẳn nhau. → Có thể tính theo thể tích khi có kích thước sản phẩm chuẩn (K4).
10. **Màu là mã chữ tự do** (`DEN`, `TRANG`) — gõ nhầm `DENN` là thành 1 màu khác. → Danh mục màu chuẩn làm cùng SKU nội bộ (K4).
11. **Gán SKU vào ô chưa đối chiếu được danh mục/size/màu** vì SKU sàn chưa có các thuộc tính này — quy tắc "lệch thì bắt lý do" chưa áp được. → K4.
12. **Gợi ý ô chưa ưu tiên ô SKU đang nằm sẵn** (để gom hàng về 1 chỗ). → K3 (1 SKU nhiều ô).
13. **Danh sách "SKU chưa gán kệ" không phân biệt kho** và tải toàn bộ dữ liệu vào bộ nhớ — SKU đã gán ở kho 1 bị coi là đã gán ở mọi kho. → Sửa cùng K4.
14. **Lộ trình hình rắn giả định mỗi dãy chỉ có 1 lối đi, vào từ đầu dãy.** Kho có lối cắt ngang giữa dãy thì thứ tự chưa tối ưu. Chấp nhận được cho quy mô hiện tại.

**Sau K2 (rà soát 26/09/2026):**

- **Không mở rộng được kệ đã tạo** (thêm tầng/ô) — gọi lại trả `WH_RACK_EXISTS`; phải tạo kệ số khác. → Bổ sung thao tác "mở rộng kệ".
- **Không tắt được cả kệ trong 1 lần** — phải tắt từng ô (kệ 5×3 = 15 lần gọi). → Bổ sung "tắt kệ".
- **Mã màu gõ tự do** — `DEN` và `DENN` bị coi là 2 màu khác (cùng loại lỗi gõ tay SKU). → Danh mục màu chuẩn, làm cùng K4 (SKU nội bộ cũng cần màu chuẩn).
- **Gợi ý ô chưa biết SKU cụ thể** (chưa có SKU nội bộ) → chưa ưu tiên ô đang chứa đúng SKU đó, có thể rải 1 SKU ra nhiều ô. → K3/K4.
- **Lộ trình hình rắn giả định mặt bằng**: dãy lẻ vào từ kệ 01, dãy chẵn vào từ cuối, mỗi khu đánh số dãy lại từ D1. Kho có mặt bằng khác thì thứ tự chưa tối ưu. → Cấu hình mặt bằng theo kho (sau K5).
- **Kiểm sức chứa khi nhập hàng không nguyên tử** — 2 lần nhập cùng lúc vào cùng ô có thể cùng lọt. → K3 (sổ cái).
- **Gán SKU sang kệ khác = chuyển hàng không ghi lịch sử** (hành vi có từ trước K1). → K3 thay bằng thao tác "chuyển ô" có sổ cái.
- **Không xóa được đăng ký của 1 ô** (đặt về "không danh mục") — nhỏ.
- **Tối đa 26 khu/kho** (`KA..KZ`) — đủ cho quy mô shop, ghi nhận để biết.
- **Kho đang chuyển đổi** (kệ cũ + mới): Picking List đi hết kệ mới rồi mới tới kệ cũ — đúng, nhưng quãng đường chưa tối ưu trong thời gian chuyển đổi.


---

# PHẦN F — THAM CHIẾU NHANH

## F.1. Bảng route (phần kho + Product Master)

| Method | Route | Role | Ghi chú |
|---|---|---|---|
| POST | `/warehouse/warehouses` | Admin | Tạo kho |
| GET | `/warehouse/warehouses` | Admin, Warehouse | 🔄 `?include_inactive=true` (chỉ Admin có tác dụng) |
| GET | `/warehouse/warehouses/:warehouseId` | Admin, Warehouse | 🆕 |
| PATCH | `/warehouse/warehouses/:warehouseId` | Admin | 🆕 tên, địa chỉ |
| DELETE | `/warehouse/warehouses/:warehouseId` | Admin | 🆕 vô hiệu hóa + dây chuyền |
| POST | `/warehouse/warehouses/:warehouseId/reactivate` | Admin | 🆕 chỉ kho |
| POST | `/warehouse/warehouses/:warehouseId/zones` | Admin | 🔄 chặn khi kho tắt |
| GET | `/warehouse/warehouses/:warehouseId/zones` | Admin | 🔄 `include_inactive`, có `isActive` |
| PATCH | `/warehouse/zones/:zoneId` | Admin | 🆕 tên, mô tả |
| DELETE | `/warehouse/zones/:zoneId` | Admin | 🆕 vô hiệu hóa + kệ |
| POST | `/warehouse/zones/:zoneId/reactivate` | Admin | 🆕 bật khu + kệ |
| POST | `/warehouse/zones/:zoneId/bin-locations/generate` | Admin | 🔄 chặn khi khu/kho tắt |
| GET | `/warehouse/zones/:zoneId/bin-locations` | Admin | 🔄 `include_inactive`, có `isActive` |
| GET | `/warehouse/warehouses/:warehouseId/bin-locations` | Admin | 🔄 `include_inactive`, có `isActive` |
| DELETE | `/warehouse/bin-locations/:binId` | Admin | 🆕 |
| POST | `/warehouse/bin-locations/:binId/reactivate` | Admin | 🆕 |
| POST | `/warehouse/warehouses/:warehouseId/sku-bin-assignments` | Admin | 🔄 kiểm tra kệ |
| GET | `/warehouse/warehouses/:warehouseId/sku-bin-assignments` | Admin | |
| POST | `.../sku-bin-assignments/:assignmentId/restock` | Admin | 🔄 chặn khi kho tắt |
| GET | `/warehouse/sku-bin-assignments/unassigned` | Admin | |
| GET | `/warehouse/:warehouseId/picking-list/:groupId` | Warehouse, Admin | 🔄 chặn khi kho tắt |
| POST | `/warehouse/zones/:zoneId/racks` | Admin | 🆕 K2 tạo kệ chuẩn mới |
| PATCH | `/warehouse/bin-locations/:binId` | Admin | 🆕 K2 sức chứa + đăng ký ô |
| GET | `/warehouse/warehouses/:warehouseId/bin-suggestions` | Admin, Warehouse | 🆕 K2 gợi ý ô |
| GET | `/categories` | Admin, Store Owner, Warehouse, Packaging | 🆕 K2 cây danh mục |
| GET | `/categories/:code` | (như trên) | 🆕 K2 |
| POST | `/categories` | Admin | 🆕 K2 |
| PATCH | `/categories/:code` | Admin | 🆕 K2 tên + thang size |
| DELETE | `/categories/:code` | Admin | 🆕 K2 vô hiệu hóa |
| POST | `/categories/:code/reactivate` | Admin | 🆕 K2 |
| GET | `/product-master` | Admin, Store Owner, Packaging | 🆕 |
| GET | `/product-master/:id` | Admin, Store Owner, Packaging | 🆕 |
| PATCH | `/product-master/:id` | Admin, Store Owner | 🆕 bật `manualOverride` |
| DELETE | `/product-master/:id/manual-override` | Admin, Store Owner | 🆕 K2 bỏ sửa tay |

## F.2. Mã lỗi

| Mã | HTTP | Khi nào |
|---|---|---|
| `WH_WAREHOUSE_NOT_FOUND` | 400/404 | Id kho sai định dạng / không tồn tại |
| `WH_ZONE_NOT_FOUND` | 400/404 | Id khu sai / không tồn tại |
| 🆕 `WH_BIN_NOT_FOUND` | 400/404 | Id kệ sai / không tồn tại |
| 🆕 `WH_WAREHOUSE_INACTIVE` | 409 | Thao tác trên kho đã tắt |
| 🆕 `WH_ZONE_INACTIVE` | 409 | Sinh kệ trong khu đã tắt; bật kệ khi khu đang tắt |
| 🆕 `WH_BIN_INACTIVE` | 409 | Gán SKU vào kệ đã tắt |
| 🆕 `WH_BIN_NOT_IN_WAREHOUSE` | 400 | Gán SKU vào kệ của kho khác |
| 🆕 `WH_HAS_STOCK` | 409 | Tắt kho/khu/kệ còn hàng — `details.unitsInStock` |
| 🆕 `WH_NOTHING_TO_UPDATE` | 400 | PATCH body rỗng |
| `WH_INVALID_BIN_RANGE` | 400 | Khoảng sinh kệ sai |
| `WH_WAREHOUSE_CODE_IN_USE` / `WH_ZONE_CODE_IN_USE` | 409 | Trùng mã khi tạo |
| 🆕 `WH_ZONE_LEGACY_FORMAT` | 409 | Tạo kệ chuẩn mới trong khu mã cũ |
| 🆕 `WH_RACK_EXISTS` | 409 | Kệ đã tồn tại |
| 🆕 `WH_INVALID_RACK_LAYOUT` | 400 | Tầng trùng, số màu ≠ số ô, size không có danh mục |
| 🆕 `WH_SIZE_NOT_IN_SCALE` | 400 | Size không thuộc thang size danh mục |
| 🆕 `WH_BIN_OVER_CAPACITY` | 409 | Vượt sức chứa ô — gửi lại kèm `force: true` nếu chấp nhận |
| 🆕 `CAT_*` | 400/404/409 | Xem bảng mục B2.2 |
| 🆕 `PM_INVALID_ID` / `PM_NOT_FOUND` | 400/404 | Id Product Master sai / không tồn tại |
| 🆕 `PM_NOTHING_TO_UPDATE` | 400 | PATCH body rỗng |
| 🆕 `WH_ZONE_V2_USE_RACKS` | 409 | Gọi sinh kệ kiểu cũ trong khu `KA..KZ` — dùng `POST .../racks` |
| 🆕 `WH_BIN_HAS_STOCK_DESIGNATION` | 409 | Đổi danh mục/size/màu của ô còn hàng |

## F.3. Checklist test cho FE

- [ ] Tắt kho còn hàng → hiện đúng thông báo `WH_HAS_STOCK` kèm số lượng
- [ ] Tắt kho hết hàng → danh sách khu mặc định trống; bật `include_inactive` thấy khu với `isActive: false`
- [ ] Bật lại kho → khu vẫn tắt; bật từng khu → kệ trong khu bật theo
- [ ] Bật khu khi kho đang tắt → `WH_WAREHOUSE_INACTIVE`
- [ ] Sửa kho kèm `warehouse_code` → 400
- [ ] Gán SKU vào kệ của kho khác → `WH_BIN_NOT_IN_WAREHOUSE`
- [ ] Warehouse Staff gọi danh sách kho với `include_inactive=true` → vẫn chỉ thấy kho đang hoạt động
- [ ] Sửa cân nặng 1 SKU Product Master → `manualOverride: true`, 3 cạnh kích thước không đổi
- [ ] Product Master có kích thước `null` → UI hiện "Chưa có kích thước", không báo lỗi

## F.4. Checklist test cho FE — K2

- [ ] Tạo danh mục cấp 2 thiếu thang size → 400; tạo cấp 3 → 400
- [ ] Tạo khu mã `A` → 400 (sai định dạng); tạo khu `KA` → OK
- [ ] Tạo kệ 4 tầng × 3 ô → nhận 12 ô, mã đúng `KA-D1-P02-T01-1`..., đã sắp theo lộ trình
- [ ] Tạo lại đúng kệ đó → `WH_RACK_EXISTS`
- [ ] Tạo kệ trong khu mã cũ → `WH_ZONE_LEGACY_FORMAT`
- [ ] Nhập hàng vượt sức chứa → hộp thoại xác nhận → gửi `force: true` → thành công
- [ ] Bỏ size `L` khỏi thang size khi đang có ô đăng ký `L` → `CAT_SIZE_IN_USE`
- [ ] Gợi ý ô: ô khớp đủ 3 thuộc tính đứng đầu, ô đã đầy không xuất hiện
- [ ] Picking List kho có cả kệ cũ và mới → dòng kệ mới đứng trước theo lộ trình
- [ ] 🆕 Rà soát K2: đổi size của ô đang có hàng → `WH_BIN_HAS_STOCK_DESIGNATION`; ô trống → đổi được
- [ ] 🆕 Rà soát K2: gọi sinh kệ kiểu cũ trong khu `KA` → `WH_ZONE_V2_USE_RACKS`; trong khu mã cũ `A` → vẫn chạy
- [ ] 🆕 Rà soát K2: "Bỏ sửa tay" Product Master → `manualOverride: false`, kích thước chưa đổi ngay
- [ ] 🆕 K3: kiểm kê 1 ô đếm lệch → tồn cập nhật, sổ cái có dòng `adjust` đúng chênh lệch + người kiểm
- [ ] 🆕 K3: chuyển 5 cái sang ô khác → 2 ô cập nhật đúng, sổ cái 2 dòng cùng `refId`
- [ ] 🆕 K3: Picking List của SKU nằm 2 ô → có `bin_location_id` + `other_bins`; quét pick-item gửi `bin_location_id` → trừ đúng ô
- [ ] 🆕 K3: bỏ gán ô còn hàng → `WH_ASSIGNMENT_HAS_STOCK`
- [ ] 🆕 K4a: tạo màu DEN → tạo SKU nội bộ ATHUN/5/DEN/M → mã trả về đúng `ATHUN-005-DEN-M`
- [ ] 🆕 K4a: tạo SKU với màu chưa khai → `COLOR_NOT_FOUND`; size ngoài thang → `MSKU_SIZE_NOT_IN_SCALE`
- [ ] 🆕 K4a: nối 1 SKU Lazada từ danh sách unmapped → biến mất khỏi unmapped; nối lại lần 2 → `MAP_ALREADY_MAPPED`
- [ ] 🆕 K4a: Thay thế SKU đổi màu → SKU cũ `isActive:false, replacedBy`, liên kết chuyển sang SKU mới
