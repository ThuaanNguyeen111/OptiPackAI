# OptiPackAI Backend — Integration Guide: Quản lý Kho (Warehouse Management)

**Phiên bản v1.1 — 26/09/2026 (K1 + K2 của đợt làm lại kho).** v1.0: vòng đời kho/khu/kệ + Product Master (K1). v1.1: danh mục 2 cấp, kệ chuẩn mới 5 phần, sức chứa ô, gợi ý ô, lộ trình lấy hàng hình rắn (K2). Tài liệu RIÊNG cho toàn bộ vòng đời dữ liệu kho: kho → khu → kệ → sản phẩm trên kệ, cùng dữ liệu kích thước sản phẩm (Product Master). Trước đây phần kho chỉ được nhắc trong `INTEGRATION_GUIDE_FULFILLMENT.md` mục "Nghiệp vụ 2b" (4 bước TẠO kho) — file này thay thế và mở rộng phần đó, vì kho giờ là 1 luồng nghiệp vụ đầy đủ, không chỉ là bước chuẩn bị cho lấy hàng. **v1.2 (27/09/2026): bước K3 — sổ cái kho, kiểm kê, chuyển ô, 1 SKU nhiều ô — xem PHẦN B3.** **v1.3 (27/09/2026): K4a — SKU nội bộ, danh mục màu, nối SKU sàn, sửa lỗi lọc sàn/shop khi trừ tồn — xem PHẦN B4.** **v1.4 (01/10/2026): mở quyền vận hành kho cho Warehouse Staff — xem danh sách khu, danh sách ô, tồn theo ô và nhập thêm hàng — xem PHẦN B5.** **v1.5 (07/10/2026): sửa lỗi kiểu id khiến Picking List báo "CHƯA GÁN VỊ TRÍ", quét hàng báo thiếu tồn và nhập thêm hàng luôn 404 dù dữ liệu kho đúng; gộp bản sửa tìm tồn của nhánh `feature/viet_befe`; script chuyển dữ liệu id cũ — xem PHẦN B6.**

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

| Đối tượng      | Trước K1            | Sau K1                                          |
| -------------- | ------------------- | ----------------------------------------------- |
| Kho            | Tạo, Xem danh sách  | + Xem chi tiết, Sửa, Vô hiệu hóa, Kích hoạt lại |
| Khu            | Tạo, Xem            | + Sửa, Vô hiệu hóa, Kích hoạt lại               |
| Kệ             | Sinh hàng loạt, Xem | + Vô hiệu hóa, Kích hoạt lại                    |
| Product Master | _(không có API)_    | Xem danh sách, Xem chi tiết, Sửa tay            |

## A.3. 5 nguyên tắc FE cần nắm trước khi đọc chi tiết

**1. "Xóa" nghĩa là VÔ HIỆU HÓA, không xóa hẳn.** Gọi `DELETE` → đối tượng chuyển `isActive: false`, vẫn còn trong DB. Lý do: lịch sử lấy hàng, đơn đã giao từ kho đó vẫn phải tra ra được. Muốn dùng lại → gọi `.../reactivate`.

**2. Còn hàng thì KHÔNG cho vô hiệu hóa.** Hệ thống cộng tổng tồn kho trong phạm vi đó; lớn hơn 0 → trả `409 WH_HAS_STOCK` kèm số lượng còn. Nếu cho tắt kho còn hàng, số hàng đó "biến mất" khỏi mọi màn hình nhưng vẫn nằm trên kệ thật.

**3. MÃ không bao giờ sửa được** (`warehouseCode`, `zoneCode`, `binCode`). Chỉ sửa tên/mô tả/địa chỉ. Mã khu nằm trong mọi mã kệ của khu, và mã kệ đã in nhãn dán lên kệ thật — đổi mã trên hệ thống mà nhãn vẫn cũ thì nhân viên đi nhầm chỗ. Gửi kèm trường mã khi sửa → **400** (hệ thống bật chế độ từ chối trường lạ).

**4. Tắt theo dây chuyền từ trên xuống, bật lại có quy tắc riêng** (Phần B.2).

**5. 🆕 Mã ô, SKU nội bộ và SKU sàn là 3 thứ khác nhau — hệ thống không tự nối theo tên.** Đặt SKU trên Lazada trùng mã ô (ví dụ `KA-D1-P03-T01-3`) **không** làm hàng tự nằm ở ô đó: SKU sàn phải được **gán vào ô** hoặc **nối vào SKU nội bộ** thì Picking List mới có vị trí. Quy trình cấu hình chuẩn 8 bước, cách đặt SKU trên Seller Center và xử lý "CHƯA GÁN VỊ TRÍ": **`INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md` Phần 0b**. 🔄 Trước 07/10/2026 Picking List còn báo "CHƯA GÁN VỊ TRÍ" vì một lỗi BE dù đã gán đúng — đã sửa, xem PHẦN B6.

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

| Tình huống                             | Kết quả                                         |
| -------------------------------------- | ----------------------------------------------- |
| Body rỗng `{}`                         | `400 WH_NOTHING_TO_UPDATE`                      |
| Gửi kèm `warehouse_code` / `zone_code` | `400` (lỗi validate, `message` là mảng chuỗi)   |
| Sửa kho/khu đang bị vô hiệu hóa        | **Cho phép** — sửa tên không ảnh hưởng vận hành |

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

FE: hiện hộp thoại dùng đúng `message`, không tự đoán. Không có thay đổi nào được ghi. _(Chức năng "chuyển hàng sang kệ khác" sẽ có ở bước K3 — hiện tại muốn tắt thì phải xử lý hết hàng trước.)_

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
- 🔄 **Từ 01/10/2026** Warehouse Staff gọi được danh sách khu (`GET .../warehouses/:warehouseId/zones`) và danh sách ô của kho (`GET .../warehouses/:warehouseId/bin-locations`). Với khu và ô, `include_inactive=true` có tác dụng với **cả Admin lẫn Warehouse Staff** (khác danh sách kho). Màn hình vận hành của Warehouse Staff không nên truyền tham số này. Danh sách ô theo 1 khu (`GET /warehouse/zones/:zoneId/bin-locations`) vẫn chỉ dành cho Admin — xem PHẦN B5.

## B.4. Thao tác bị chặn khi kho/khu/kệ đã tắt 🔄

Đây là thay đổi ảnh hưởng tới các màn hình ĐÃ CÓ:

| Thao tác (route cũ)                                                | Khi nào bị chặn        | Lỗi                                              |
| ------------------------------------------------------------------ | ---------------------- | ------------------------------------------------ |
| Tạo khu — `POST .../warehouses/:id/zones`                          | Kho đã tắt             | `409 WH_WAREHOUSE_INACTIVE`                      |
| Sinh kệ — `POST .../zones/:zoneId/bin-locations/generate`          | Khu hoặc kho đã tắt    | `409 WH_ZONE_INACTIVE` / `WH_WAREHOUSE_INACTIVE` |
| Gán SKU — `POST .../sku-bin-assignments`                           | Kho đã tắt / kệ đã tắt | `409 WH_WAREHOUSE_INACTIVE` / `WH_BIN_INACTIVE`  |
| Nhập thêm hàng — `POST .../restock`                                | Kho đã tắt             | `409 WH_WAREHOUSE_INACTIVE`                      |
| Picking List — `GET /warehouse/:warehouseId/picking-list/:groupId` | Kho đã tắt             | `409 WH_WAREHOUSE_INACTIVE`                      |

**Lưu ý khi sinh kệ:** gọi `generate` lại đúng khoảng có kệ đã bị tắt thì **kệ đó KHÔNG tự bật lại** (chỉ tạo kệ chưa từng có) — muốn dùng lại phải gọi `.../reactivate` cho từng kệ, hoặc bật lại cả khu.

## B.5. Gán SKU vào kệ — sửa lỗi cũ 🔄

**Lỗi trước K1:** hệ thống không kiểm tra `bin_location_id` — gán được SKU vào kệ không tồn tại, hoặc kệ của **kho khác**. Picking List sau đó hiện "CHƯA GÁN VỊ TRÍ" hoặc vị trí ở kho khác mà không ai biết vì sao.

**Sau K1:**

| Tình huống                                      | Lỗi                           |
| ----------------------------------------------- | ----------------------------- |
| `bin_location_id` sai định dạng / không tồn tại | `400/404 WH_BIN_NOT_FOUND`    |
| Kệ thuộc kho khác                               | `400 WH_BIN_NOT_IN_WAREHOUSE` |
| Kệ đã tắt                                       | `409 WH_BIN_INACTIVE`         |

**FE:** dropdown chọn kệ nên lấy từ `GET /warehouse/warehouses/:warehouseId/bin-locations` (đúng kho đang thao tác, mặc định chỉ kệ đang hoạt động) — khi đó 3 lỗi trên gần như không bao giờ xảy ra.

## B.6. Product Master — xem và kho xác nhận số đo 🔄 ĐÃ ĐỔI (gộp 04/10/2026, sửa tài liệu 09/10/2026)

**Product Master là gì:** bảng hồ sơ đóng gói của từng SKU. 🔄 **Từ 04/10/2026** đồng bộ theo **danh sách sản phẩm của shop** (không còn chỉ theo SKU đã có trong đơn): mỗi giờ lấy sản phẩm thay đổi gần đây, 3h sáng lấy toàn bộ — xem mục "Đồng bộ ngay" bên dưới.

> 🔄 **ĐÃ ĐỔI (09/10/2026, sửa tài liệu cho khớp code)**: bản trước mô tả `PATCH /product-master/:id`, cờ `manualOverride` và `DELETE /product-master/:id/manual-override` — **các route/trường này không còn** (bỏ khi gộp 04/10). Số đo sàn chỉ ghi vào `marketplaceDimension` (tham khảo); kích thước engine đóng gói dùng là `dimension`, **chỉ** do kho xác nhận qua `PUT /product-master/:id/packaging-profile`. Cron đồng bộ **không bao giờ** ghi đè `dimension` nên không cần cờ sửa tay.

```
GET /product-master?status=needs_measurement&shop_id=...&search=OPLUNG
→ 200: [ {...}, ... ]                       // mảng, tối đa 200 dòng

GET /product-master/:id
→ 200: {
  "id": "...", "platform": "lazada", "shopId": "201171264532", "sellerSku": "OPLUNG-IP15",
  "packagingProfileStatus": "needs_measurement",
  "dimension": null,
  "marketplaceDimension": { "lengthCm": 20, "widthCm": 12, "heightCm": 2, "weightKg": 0.05 },
  "isFragile": null, "orientationRule": null, "maxStackLoadKg": null,
  "productCategory": null, "zipBagCode": null, "zipBagFolded": false, "canFoldInHalf": false,
  "profileConfirmedBy": null, "profileConfirmedAt": null,
  "lastSyncedAt": "2026-09-26T20:00:00.000Z"
}

PUT /product-master/:id/packaging-profile      // kho đo thật sau gấp/bọc → status "ready"
```

| Điểm cần biết       | Chi tiết |
| ------------------- | -------- |
| Ai xem              | Admin, Store Owner, Warehouse Staff, Packaging Staff |
| Ai xác nhận số đo   | Warehouse Staff, Admin (`PUT .../packaging-profile` — body và kiểm túi zip xem `INTEGRATION_GUIDE_PACKING.md`) |
| `status`            | `needs_measurement` \| `ready` |
| `search`            | Tìm theo `sellerSku`, không phân biệt hoa/thường |
| `dimension: null`   | Kho chưa đo — FE hiện "Chưa có hồ sơ đóng gói", mời đo. Kế hoạch đóng gói của nhóm có SKU này sẽ `failed` với lý do thiếu hồ sơ |
| `marketplaceDimension` | Số đo khai báo trên sàn, chỉ để tham khảo khi đo |

### 🆕 Đồng bộ ngay danh sách sản phẩm từ Lazada (04/10/2026)

**Vấn đề trước đây:** Product Master chỉ biết SKU **đã xuất hiện trong đơn hàng**, chạy 1 lần lúc 3h sáng. Thêm sản phẩm mới hoặc **đổi mã SKU trên Seller Center** thì trang cấu hình kho / tình trạng kho reload vẫn không thấy mã mới cho tới khi có người đặt mã đó **và** qua 3h sáng.

**Từ 04/10/2026:**

| Cơ chế           | Lịch             | Lấy gì                                                |
| ---------------- | ---------------- | ----------------------------------------------------- |
| Tự động tăng dần | Mỗi giờ (phút 0) | Sản phẩm thay đổi sau lần đồng bộ trước (lùi 10 phút) |
| Tự động toàn bộ  | 3:00 sáng        | Toàn bộ danh sách sản phẩm của shop                   |
| **Bấm tay**      | Khi cần          | `POST /product-master/sync` (Admin)                   |

```
POST /product-master/sync                      → mọi shop Lazada đang kết nối, chỉ sản phẩm thay đổi
POST /product-master/sync?shop_id=201171264532  → 1 shop
POST /product-master/sync?full=true             → toàn bộ danh sách sản phẩm
→ 201: { "results": [ { "ok": true, "shopId": "201171264532", "mode": "incremental",
                         "since": "2026-10-04T07:50:00.000Z", "products": 3, "synced": 3, "complete": true } ] }
```

| Trường     | Ý nghĩa                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------- |
| `ok`       | `false` kèm `error` nếu shop đó lỗi (token hết hạn, Lazada từ chối…); shop khác vẫn chạy |
| `mode`     | `incremental` (tăng dần) hoặc `full` (toàn bộ — lần đầu hoặc `full=true`)                |
| `products` | Số sản phẩm Lazada trả về                                                                |
| `synced`   | Số SKU được ghi mới / cập nhật vào Product Master                                        |
| `complete` | `false` nếu shop quá lớn chạm giới hạn 10.000 của Lazada — lần sau sẽ quét lại           |

**FE:** thêm nút **"Đồng bộ sản phẩm từ Lazada"** ở trang cấu hình kho (chỉ Admin). Bấm xong tải lại danh sách "SKU chưa gán ô".

**Ghi chú:**

- SKU cũ **không bị xóa** (đơn cũ vẫn dùng mã cũ). Ô kho đang gán mã cũ giữ nguyên.
- Danh sách "SKU chưa gán ô" sẽ có **mọi sản phẩm** của shop (kể cả chưa có đơn) — để Admin gán ô trước khi hàng về.
- Hồ sơ kho đã xác nhận (`dimension`, `packagingProfileStatus: ready`) không bị đồng bộ ghi đè — sàn chỉ cập nhật `marketplaceDimension`.
- Khi Lazada đổi mã SKU: sau khi mã mới xuất hiện, nối **cả mã cũ và mã mới** vào cùng một SKU nội bộ (`POST /master-skus/:code/mappings`) rồi `POST /master-skus/sync-stock` — tồn được tính chung, không phải chuyển hàng giữa ô.

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

| Tình huống                                           | Kết quả                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| Cấp 2 không có `size_scale`                          | `400 CAT_SIZE_SCALE_REQUIRED`                                    |
| Cấp 1 có `size_scale`                                | `400 CAT_SIZE_SCALE_NOT_ALLOWED`                                 |
| Tạo cấp 3 (cha là cấp 2)                             | `400 CAT_PARENT_NOT_LEVEL_1` — chỉ hỗ trợ 2 cấp                  |
| Mã trùng                                             | `409 CAT_CODE_IN_USE`                                            |
| Bỏ 1 size khỏi thang mà đang có ô kệ đăng ký size đó | `409 CAT_SIZE_IN_USE` + số ô đang dùng — đổi đăng ký các ô trước |
| Tắt cấp 1 còn con đang bật                           | `409 CAT_HAS_ACTIVE_CHILDREN`                                    |
| Tắt cấp 2 đang có ô kệ đăng ký                       | `409 CAT_IN_USE`                                                 |
| Bật lại cấp 2 khi cha đang tắt                       | `409 CAT_PARENT_INACTIVE`                                        |

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

| Tình huống                                 | Kết quả                                                               |
| ------------------------------------------ | --------------------------------------------------------------------- |
| Khu dùng mã cũ (VD `A`)                    | `409 WH_ZONE_LEGACY_FORMAT` — kệ chuẩn mới chỉ tạo trong khu `KA..KZ` |
| Danh mục là cấp 1 / đã tắt / không tồn tại | `400 CAT_NOT_LEVEL_2` / `409 CAT_INACTIVE` / `404 CAT_NOT_FOUND`      |
| Size tầng không thuộc thang size           | `400 WH_SIZE_NOT_IN_SCALE` (kèm thang size đúng)                      |
| Khai trùng tầng / số màu khác số ô         | `400 WH_INVALID_RACK_LAYOUT`                                          |
| Kệ (dãy + bên + số kệ) đã có               | `409 WH_RACK_EXISTS` — không trộn đăng ký cũ/mới                      |
| Khu/kho đã tắt                             | `409 WH_ZONE_INACTIVE` / `WH_WAREHOUSE_INACTIVE`                      |
| Giới hạn                                   | Tầng 1-9, ô 1-9 (tối đa 81 ô/lần), kệ 1-99, dãy D1-D99                |

Tạo ô là **tất cả hoặc không** — lỗi giữa chừng thì không ô nào được tạo.

🔄 `POST .../bin-locations/generate` (chuẩn cũ) được đánh dấu **deprecated** trên Swagger — vẫn gọi được nhưng không nên dùng cho kệ mới (không giới hạn khoảng, không có danh mục/size/màu).

## B2.4. Sửa 1 ô — sức chứa và thuộc tính đăng ký

```
PATCH /warehouse/bin-locations/:binId
Body: { "capacity": 40, "designated_size": "M", "designated_color_code": "XANH" }   // gửi field nào sửa field đó
      { "capacity": null }                                                         // bỏ giới hạn sức chứa
```

| Tình huống                             | Kết quả                      |
| -------------------------------------- | ---------------------------- |
| Hạ sức chứa xuống dưới số hàng đang có | `409 WH_BIN_OVER_CAPACITY`   |
| Size không thuộc thang size danh mục   | `400 WH_SIZE_NOT_IN_SCALE`   |
| Đăng ký size mà ô chưa có danh mục     | `400 WH_INVALID_RACK_LAYOUT` |
| Mã ô, vị trí vật lý                    | Không sửa được (đã in nhãn)  |

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

## B2.8. ~~Product Master — bỏ sửa tay~~ 🔄 ĐÃ GỠ (gộp 04/10/2026, sửa tài liệu 09/10/2026)

`DELETE /product-master/:id/manual-override` **không còn tồn tại** (gọi → 404). Số đo dùng cho đóng gói do kho xác nhận qua `PUT /product-master/:id/packaging-profile`; số liệu sàn nằm riêng ở `marketplaceDimension` nên không cần "trả về số liệu Lazada". Xem B.6.

---

# PHẦN B3 — BƯỚC K3: SỔ CÁI KHO, KIỂM KÊ, CHUYỂN Ô 🆕 (27/09/2026)

## B3.1. Sổ cái — mọi thay đổi tồn kho đều để lại dấu vết

Từ K3, **mọi lần số tồn thay đổi** đều ghi 1 dòng vào sổ cái, trong cùng 1 transaction với chính thay đổi đó:

| `type`                         | Khi nào                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `assign_initial`               | Gán SKU vào ô kèm tồn ban đầu                                                                          |
| `receive`                      | Nhập thêm hàng (restock)                                                                               |
| `pick`                         | Nhân viên quét lấy hàng cho đơn (`refType: order_group`)                                               |
| `adjust`                       | Kiểm kê (kể cả khớp — chênh 0)                                                                         |
| `transfer_out` / `transfer_in` | Chuyển ô (2 dòng cùng `refId`)                                                                         |
| `return_restock`               | Hàng trả/hoàn đạt kiểm tra, nhập lại (`refType: return_request`) — xem `INTEGRATION_GUIDE_SHIPPING.md` |

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

| Tình huống                                         | Lỗi                                                          |
| -------------------------------------------------- | ------------------------------------------------------------ |
| Ô nguồn không đủ (kể cả vừa bị lấy mất giữa chừng) | `409 WH_INSUFFICIENT_STOCK`                                  |
| Ô đích = ô nguồn                                   | `400 WH_SAME_BIN`                                            |
| Ô đích thuộc kho khác / đã tắt                     | `WH_BIN_NOT_IN_WAREHOUSE` / `WH_BIN_INACTIVE`                |
| Ô đích vượt sức chứa                               | `409 WH_BIN_OVER_CAPACITY` — gửi `force: true` để vẫn chuyển |

## B3.4. 1 SKU nằm nhiều ô 🔄

Trước K3, 1 SKU chỉ nằm được 1 ô/kho. Nay 1 SKU có thể nằm nhiều ô (hàng về 200 cái, mỗi ô chứa 50). Hệ quả cho các route cũ:

| Route                                          | Trước K3                                                                     | Sau K3                                                                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST .../sku-bin-assignments` (gán)           | Gọi lại với ô khác = **DỜI** SKU + toàn bộ tồn sang ô mới, không ghi lịch sử | Gọi với ô khác = **THÊM** SKU vào ô đó (tồn riêng). Gọi lại đúng ô đã có = trả bản ghi cũ, không đổi gì. **Muốn dời hàng → dùng chuyển ô (B3.3)**      |
| Picking List                                   | 1 dòng 1 ô                                                                   | Mỗi dòng có `bin_location_id` (ô CHÍNH — ô còn hàng đứng trước theo lộ trình) + `other_bins: [{ bin_location_id, bin_code, quantity_on_hand }]`        |
| `POST /order-groups/:id/fulfillment/pick-item` | Trừ ở ô bất kỳ đủ hàng                                                       | Nhận thêm `bin_location_id` (tùy chọn) → **trừ đúng ô nhân viên lấy**. FE nên gửi `bin_location_id` lấy từ Picking List. Không gửi thì vẫn chạy như cũ |

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

| Trước K4a                                                                                                            | Sau K4a                                                 |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `pick-item` và Picking List chỉ lọc `kho + seller_sku` → 2 sàn/shop trùng chuỗi SKU có thể **trừ nhầm tồn** của nhau | Lọc thêm `platform + shop_id` của nhóm đơn              |
| Trừ tồn rồi mới ghi sổ cái + nhật ký quét, **không transaction** → lỗi giữa chừng thì tồn đã trừ mà không có dòng sổ | Trừ tồn + sổ cái + nhật ký quét trong **1 transaction** |

FE **không phải sửa gì** — request/response `pick-item` và Picking List giữ nguyên.

## B4.6. K4b + K5 — ✅ ĐÃ XONG (27/09/2026)

> Chi tiết từng bước, từng trường hợp và kịch bản demo: **`INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md`**.

~~K4b — sắp làm~~
Chuyển tồn kho, gán kệ, Picking List, trừ tồn sang tính theo **SKU nội bộ** (Lazada + Tiki bán chung 1 tồn). Cần mọi SKU sàn đang có hàng phải được nối trước → sẽ có script kiểm tra "SKU sàn còn tồn nhưng chưa nối" trước khi bật.

---

# PHẦN B5 — QUYỀN VẬN HÀNH KHO CHO WAREHOUSE STAFF 🔄 (01/10/2026)

## B5.1. Thay đổi

Trước ngày 01/10/2026, Warehouse Staff đã được phép **kiểm kê** (`adjust`), **chuyển ô** (`transfer`), xem **gợi ý ô**, **sổ cái** và **Picking List**, nhưng lại **không xem được danh sách ô và tồn theo ô**, và **không nhập thêm hàng được** — các route này trả `403`. Nhân viên kho vì vậy không có màn hình nào để biết hàng đang nằm ở đâu, và không tự nhập được hàng mới về. Bốn route sau được mở thêm cho Warehouse Staff:

| Method | Route                                                                          | Quyền trước | Quyền từ 01/10/2026    |
| ------ | ------------------------------------------------------------------------------ | ----------- | ---------------------- |
| GET    | `/warehouse/warehouses/:warehouseId/zones`                                     | Admin       | Admin, Warehouse Staff |
| GET    | `/warehouse/warehouses/:warehouseId/bin-locations`                             | Admin       | Admin, Warehouse Staff |
| GET    | `/warehouse/warehouses/:warehouseId/sku-bin-assignments`                       | Admin       | Admin, Warehouse Staff |
| POST   | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock` | Admin       | Admin, Warehouse Staff |

**Không thay đổi:** request, response, mã lỗi và hành vi của cả 4 route giữ nguyên. Chỉ thay đổi danh sách vai trò được gọi. Các route **cấu hình kho** (tạo/sửa/tắt kho, khu, kệ; gán SKU vào ô; bỏ gán; danh sách SKU chưa gán; danh sách ô theo 1 khu) vẫn chỉ dành cho Admin.

**Nguyên tắc phân quyền từ nay:** route **cấu hình** kho chỉ Admin; route **vận hành** kho (xem vị trí và tồn, nhập hàng, kiểm kê, chuyển ô, lấy hàng) mở cho cả Admin và Warehouse Staff.

## B5.2. Màn hình "Tồn kho theo vị trí" cho Warehouse Staff

Màn hình gồm 3 phần: chọn kho → xem ô và hàng trong ô → nhập thêm hàng.

**Bước 1 — Chọn kho.**

```
GET /warehouse/warehouses
→ 200: [ { "id": "66e1...", "warehouseCode": "WH-HCM-01", "warehouseName": "Kho Quận 7", "address": "...", "isActive": true } ]
```

Nếu chỉ có 1 kho, FE chọn sẵn kho đó.

**Bước 2 — Lấy danh sách khu (để hiển thị mã và tên khu).**

```
GET /warehouse/warehouses/66e1.../zones
→ 200: [ { "id": "66e2...", "warehouseId": "66e1...", "zoneCode": "KA", "zoneName": "Khu áo", "description": "", "isActive": true } ]
```

Danh sách ô ở bước 3 chỉ trả `zoneId`. FE dùng kết quả bước này để đổi `zoneId` thành mã khu (`KA`) và làm bộ lọc theo khu.

**Bước 3 — Lấy danh sách ô và tồn theo ô, rồi ghép lại.**

```
GET /warehouse/warehouses/66e1.../bin-locations
→ 200: [
  { "id": "66e9...", "warehouseId": "66e1...", "zoneId": "66e2...", "binCode": "KA-D1-P02-T03-1",
    "aisle": "D1", "rack": 2, "level": 3, "isActive": true,
    "layoutVersion": 2, "side": "P", "cell": 1, "capacity": 30,
    "designated": { "categoryCode": "ATHUN", "size": "M", "colorCode": "DEN" },
    "pickSequence": 14 }
]

GET /warehouse/warehouses/66e1.../sku-bin-assignments
→ 200: [
  { "id": "66f3...", "warehouseId": "66e1...", "platform": "lazada", "shopId": "201171264532",
    "sellerSku": "ATD-M-01", "binLocationId": "66e9...", "quantityOnHand": 6,
    "masterSku": "ATHUN-005-DEN-M" }
]
```

Ghép theo `sku-bin-assignments[].binLocationId` = `bin-locations[].id`. Gợi ý hiển thị mỗi ô:

| Cột          | Nguồn                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| Mã ô         | `binCode`                                                                                             |
| Khu          | `zoneId` → `zoneCode` (bước 2)                                                                        |
| Đăng ký      | `designated.categoryCode` / `size` / `colorCode` (kệ mã cũ: `designated = null`, hiển thị "—")        |
| Hàng trong ô | Các dòng assignment có `binLocationId` trùng: `sellerSku` (hoặc `masterSku` nếu có), `quantityOnHand` |
| Mức sử dụng  | Tổng `quantityOnHand` của ô / `capacity` (ví dụ 18/30). `capacity = null` thì không hiển thị          |

Sắp xếp theo `pickSequence` tăng dần để thứ tự trên màn hình trùng thứ tự đi lấy hàng. Ô chưa có hàng vẫn hiển thị (đó là chỗ trống để xếp hàng).

**Bước 4 — Nhập thêm hàng vào 1 ô.** Mỗi dòng hàng có nút _Nhập thêm_, mở hộp thoại nhập số lượng.

```
POST /warehouse/warehouses/66e1.../sku-bin-assignments/66f3.../restock
{ "quantity": 5 }
→ 201: { "id": "66f3...", ..., "quantityOnHand": 11, ... }
```

Hệ thống cộng dồn tồn và ghi sổ cái loại `receive` trong cùng một giao dịch, người thực hiện lấy từ tài khoản đang đăng nhập (không nhận từ body). Thành công thì tải lại bước 3.

| Mã lỗi                   | HTTP      | Nguyên nhân                                                                                | Xử lý trên FE                                                                                                           |
| ------------------------ | --------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `WH_BIN_OVER_CAPACITY`   | 409       | Tổng hàng trong ô sau khi nhập vượt `capacity`; `details: { capacity, current, incoming }` | Hộp thoại "Ô chứa tối đa 30, đang có 25, thêm 10 sẽ vượt — vẫn nhập?". Đồng ý thì gửi lại cùng body kèm `"force": true` |
| `WH_WAREHOUSE_INACTIVE`  | 409       | Kho đã bị vô hiệu hóa                                                                      | Thông báo và quay về bước 1                                                                                             |
| `WH_WAREHOUSE_NOT_FOUND` | 400 / 404 | `assignmentId` sai định dạng, hoặc dòng không thuộc kho này (mã lỗi dùng chung, xem B5.5). 🔄 Trước 07/10/2026 route này **luôn** trả 404 do lỗi BE — xem PHẦN B6  | Tải lại danh sách                                                                                                       |
| (validate)               | 400       | `quantity` không phải số nguyên ≥ 1                                                        | Chặn ngay ở ô nhập                                                                                                      |
| —                        | 403       | Tài khoản không phải Admin hoặc Warehouse Staff                                            | Ẩn nút theo vai trò                                                                                                     |

**Xem lịch sử của 1 dòng** (đã mở cho Warehouse Staff từ K3): `GET .../sku-bin-assignments/:assignmentId/movements` — dòng vừa nhập có `type: receive`, đúng số lượng và đúng nhân viên.

## B5.3. Cách demo

1. Đăng nhập **Warehouse Staff** → mở màn "Tồn kho theo vị trí" → chọn kho. Thấy đủ danh sách ô và hàng trong ô (trước đây màn này trả `403`).
2. Chọn 1 dòng hàng có tồn 6 → _Nhập thêm_ → nhập 5 → tồn thành 11.
3. Mở _Lịch sử_ của dòng đó → dòng `receive +5`, người thực hiện là tài khoản Warehouse Staff vừa dùng.
4. Chọn 1 ô có `capacity` 30, đang có 25 → nhập 10 → hộp thoại vượt sức chứa → _Vẫn nhập_ → thành công với `force: true`.
5. Vẫn tài khoản Warehouse Staff, thử một thao tác cấu hình (ví dụ tạo khu mới) → `403`. Thao tác cấu hình vẫn chỉ Admin làm được.

## B5.4. Tác động tới dữ liệu và luồng đã có

| Câu hỏi                          | Trả lời                                                                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dữ liệu cũ có còn đọc đúng không | Có. Không đổi schema, không cần migration                                                                                                                              |
| Route nào đổi hành vi            | Không route nào đổi request/response. 4 route trên chỉ thêm vai trò được gọi                                                                                           |
| Luồng nào bị ảnh hưởng           | Nhập hàng giờ có thể do Warehouse Staff thực hiện → sổ cái `receive` ghi đúng người thực hiện; tồn khả dụng (K5) tăng như khi Admin nhập                               |
| Luồng nào không bị ảnh hưởng     | Cấu hình kho, gán SKU, K4a/K4b, giữ chỗ K5, Picking List, pick-item, trả/hoàn hàng                                                                                     |
| Lỗi có sẵn phát hiện             | `DEMO_PLAYBOOK.md` bước B6 và guide SKU_STOCK mục 5.4 đã hướng dẫn **Warehouse** bấm nhập hàng, nhưng trước ngày 01/10 thao tác đó trả `403`. Đã khớp sau thay đổi này |

## B5.5. Hạn chế hiện tại và hướng khắc phục

| Hạn chế                                                                         | Ảnh hưởng                                                                                                                                | Hướng khắc phục                                                                                               |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Nhập hàng **không tự tính lại** các nhóm đơn đang thiếu hàng (`stock_shortage`) | Warehouse Staff nhập hàng xong, nhóm đơn thiếu hàng vẫn mang nhãn _Thiếu hàng_ cho tới khi Admin hoặc Store Owner bấm "Tính lại giữ chỗ" | Sau mỗi lần nhập thành công, tự chạy tính lại cho các nhóm đơn đang thiếu đúng SKU đó (đã ghi trong audit P1) |
| Warehouse Staff **không gắn với kho**                                           | Nhân viên xem và nhập được hàng ở **mọi** kho, không chỉ kho mình làm việc                                                               | Thêm "kho làm việc" cho nhân viên và lọc theo kho (đã ghi ở PHẦN E mục 7)                                     |
| `include_inactive=true` ở danh sách khu/ô có tác dụng với Warehouse Staff       | Nhân viên có thể thấy khu/ô đã tắt nếu tự truyền tham số (chỉ xem, không thao tác được vì ô tắt bị chặn)                                 | Bỏ qua tham số này với vai trò không phải Admin, như danh sách kho                                            |
| "Không tìm thấy dòng tồn" dùng chung mã `WH_WAREHOUSE_NOT_FOUND`                | FE không phân biệt được "sai kho" với "sai dòng tồn"                                                                                     | Thêm mã riêng `WH_ASSIGNMENT_NOT_FOUND`                                                                       |
| Nhập hàng chỉ có số lượng                                                       | Không có phiếu nhập, nhà cung cấp, chứng từ                                                                                              | Bổ sung phiếu nhập khi mở rộng nghiệp vụ nhập kho                                                             |

---

# PHẦN B6 — SỬA LỖI KIỂU ID: PICKING LIST, QUÉT HÀNG, NHẬP THÊM HÀNG 🔄 (07/10/2026)

## B6.1. Hiện tượng trước khi sửa

| Màn hình / thao tác | Hiện tượng | Dù dữ liệu đã đúng |
|---|---|---|
| Picking List — `GET /warehouse/:warehouseId/picking-list/:groupId` | Dòng hàng hiện `bin_code: "CHƯA GÁN VỊ TRÍ"`, `bin_location_id: null` | Đã gán SKU vào ô, đã nối SKU nội bộ, ô đang hoạt động, còn tồn |
| Quét hàng — `POST /order-groups/:id/fulfillment/pick-item` | `409 ORD_GROUP_INSUFFICIENT_STOCK` | Như trên |
| Nhập thêm hàng — `POST .../sku-bin-assignments/:assignmentId/restock` | `404 WH_WAREHOUSE_NOT_FOUND` "Không tìm thấy sku_bin_assignment" | Dòng tồn có thật, đúng kho |
| Gợi ý đóng gói — `POST .../packaging/generate` | Luôn tính theo **số lượng đặt**, không theo số đã quét | Đã quét từng món bằng `pick-item` |

Ví dụ thật (đọc DB ngày 05/10/2026): SKU `KC-D1-T05-T01-2`, dòng tồn ở kho HCM-02, ô `KC-D1-T05-T01-1` đang hoạt động, tồn 3, `master_sku: "GUOC-020-DEN-35"`, mapping khớp từng ký tự — Picking List vẫn báo "CHƯA GÁN VỊ TRÍ".

## B6.2. Nguyên nhân

Trong DB, các trường id (`warehouse_id`, `bin_location_id`, `order_group_id`…) lưu kiểu **ObjectId**. Id FE gửi lên luôn là **chuỗi** (đường dẫn và JSON không chở được kiểu ObjectId) — điều này đúng, FE không làm sai gì. BE có trách nhiệm đổi chuỗi sang ObjectId trước khi tìm.

Schema BE khai các trường này bằng `@Prop({ type: Types.ObjectId })`. Với thư viện `@nestjs/mongoose`, cách khai đó tạo ra kiểu **Mixed** ("kiểu gì cũng được"), nên Mongoose **không** tự đổi chuỗi sang ObjectId. Truy vấn mang chuỗi đi so với ObjectId trong DB → 0 dòng. Lỗi nằm ở 35 trường trên 18 collection; phần lớn chỗ truy vấn đã tự đổi kiểu nên chạy đúng, còn 3 chỗ trong bảng trên thì không. Chỗ ghi `pick_events.order_group_id` thì lưu nguyên chuỗi.

## B6.3. Đã sửa

| Thay đổi | Ghi chú |
|---|---|
| 35 trường id khai lại `type: SchemaTypes.ObjectId` | Mongoose tự đổi chuỗi → ObjectId ở mọi truy vấn và lệnh ghi |
| Picking List, quét hàng đổi `warehouse_id` sang ObjectId | Bản sửa của Việt (nhánh `feature/viet_befe`), giữ nguyên |
| Nhập thêm hàng đổi `warehouse_id` sang ObjectId | Hết lỗi luôn 404 |
| `pick_events.order_group_id` lưu ObjectId | Gợi ý đóng gói đọc được số đã quét |
| Picking List / quét hàng tìm thêm dòng tồn **chưa gắn nhãn** của SKU đã nối, và so `seller_sku` **không phân biệt hoa thường** | Bản sửa của Việt. Trường hợp Admin nhập tồn trước khi bấm "Đồng bộ tồn" (`POST /master-skus/sync-stock`) vẫn lấy được hàng |
| Nhập lại hàng hoàn vào ô chưa có dòng tồn tạo dòng mới mang đủ `master_sku` / `seller_sku` | Sửa lỗi phát sinh từ thay đổi tìm tồn ở trên |
| Test tự động quét mọi schema, báo lỗi nếu còn trường id kiểu Mixed | Chặn lỗi lặp lại |

**FE không phải sửa gì.** Request/response của mọi route giữ nguyên. Riêng thông báo `sync_failed`: `relatedEntityId` nay là id của shop đã kết nối (trước là mã shop Lazada) — xem `INTEGRATION_GUIDE_FULFILLMENT.md` Nghiệp vụ 6.

## B6.4. Việc BẮT BUỘC sau khi deploy — chuyển dữ liệu id cũ

Một số bản ghi cũ đang lưu id dạng chuỗi (đã biết: `pick_events`, `notifications`, `login_audit_logs`). Sau khi sửa schema, các bản ghi đó **không còn khớp truy vấn** (ví dụ thông báo cũ không hiện cho người nhận) cho tới khi được chuyển sang ObjectId. Chạy 1 lần cho **mỗi** database (Atlas dùng chung, và DB riêng trên máy từng người nếu có):

```bash
cd be
npx ts-node -r dotenv/config scripts/migrate-objectid-fields.ts            # 1. Chạy thử: chỉ đếm, KHÔNG ghi
npx ts-node -r dotenv/config scripts/migrate-objectid-fields.ts --apply    # 2. Ghi thật
npx ts-node -r dotenv/config scripts/migrate-objectid-fields.ts            # 3. Kiểm tra lại: phải báo "✅ Không còn ..." (xem dưới)
```

Dạng kết quả khi chạy thử (số liệu dưới đây chỉ minh họa cách đọc, số thật tùy từng database):

```
Database: optipackai — chế độ: CHẠY THỬ (không ghi)
  pick_events.order_group_id: 42 chuỗi id -> ObjectId, 0 chuỗi rỗng -> null
  notifications.recipient_user_id: 7 chuỗi id -> ObjectId, 0 chuỗi rỗng -> null
  notifications.related_entity_id: 30 chuỗi id -> ObjectId, 0 chuỗi rỗng -> null, 2 không phải id (["201171264532"]) -> giữ nguyên
ℹ️  Chạy thử: sẽ chuyển 79 giá trị, 2 giá trị không phải id. Thêm --apply để ghi thật.
```

- Lần chạy lại đúng sẽ báo `✅ Không còn giá trị id nào lưu dạng chuỗi — không cần làm gì.`, hoặc `✅ Không còn id dạng chuỗi nào cần chuyển. Còn N giá trị không phải id được giữ nguyên…`.
- Giá trị **không phải id** (ví dụ mã shop Lazada trong thông báo `sync_failed` cũ) không đổi được; mặc định giữ nguyên, khi đọc sẽ ra `null`. Muốn dọn hẳn thì thêm `--null-invalid` vào lệnh `--apply`.
- Script dùng `MONGODB_URI` trong `be/.env`, không khởi động ứng dụng, không chạy cron. Chạy lại nhiều lần an toàn.

## B6.5. Cách kiểm tra lại (demo)

1. Chọn 1 nhóm đơn có SKU đã gán ô và còn tồn → mở Picking List → dòng hàng có `bin_code` thật, `bin_location_id` khác `null`.
2. Quét 1 món đúng ô → `200`, tồn giảm 1; mở sổ cái của dòng tồn → có dòng `pick`.
3. Warehouse Staff nhập thêm 5 vào dòng đó → `201`, tồn tăng 5 (trước đây `404`).
4. Lấy hàng xong, Admin tạo gợi ý đóng gói → số lượng trong gợi ý bằng số **đã quét** (thử quét thiếu 1 món so với đơn để thấy khác biệt).
5. Mở chuông thông báo của tài khoản từng nhận thông báo đích danh trước đây → thông báo cũ vẫn hiện (sau khi chạy script).

## B6.6. Tác động tới dữ liệu và luồng đã có

| Câu hỏi | Trả lời |
|---|---|
| Dữ liệu cũ có còn đọc đúng không | Có, **sau khi chạy script ở B6.4**. Không chạy thì các bản ghi id lưu chuỗi không khớp truy vấn |
| Route nào đổi hành vi | Picking List, quét hàng, nhập thêm hàng hết báo lỗi sai; gợi ý đóng gói dùng số đã quét. Không route nào đổi request/response |
| Luồng nào bị ảnh hưởng | Lấy hàng, nhập hàng, gợi ý đóng gói, nhập lại hàng hoàn, thông báo `sync_failed` |
| Luồng nào không bị ảnh hưởng | Cấu hình kho/khu/ô, kiểm kê, chuyển ô, nối SKU, gộp tồn, giữ chỗ K5, giao hàng, vật liệu đóng gói, đăng nhập |

## B6.7. Hạn chế hiện tại và hướng khắc phục

| Hạn chế | Ảnh hưởng | Hướng khắc phục |
|---|---|---|
| Tìm tồn có nhánh dự phòng "dòng chưa gắn nhãn" | Hàng chưa gộp tồn vẫn lấy được nên khó phát hiện còn thiếu bước "Đồng bộ tồn"; báo cáo tồn theo SKU nội bộ vẫn thiếu phần này | Tự gắn nhãn khi nối SKU / gán ô, rồi bỏ nhánh dự phòng |
| So SKU không phân biệt hoa thường dùng biểu thức chính quy | Không dùng được index, chậm khi dữ liệu lớn (không đáng kể ở quy mô demo) | Lưu thêm cột SKU đã chuẩn hóa có index |
| Các chỗ khác vẫn so SKU nguyên văn (nối SKU, danh sách "SKU chưa gán ô") | Gõ khác hoa thường có thể báo `MAP_SELLER_SKU_UNKNOWN` hoặc hiện "chưa gán" sai | Như trên — dùng cột SKU đã chuẩn hóa ở mọi nơi |
| Script không đổi được giá trị không phải id | Thông báo `sync_failed` cũ mất liên kết điều hướng | Chấp nhận; tùy chọn `--null-invalid` |

---

# PHẦN C — TÁC ĐỘNG TỚI DỮ LIỆU VÀ LUỒNG ĐÃ CÓ

## C.1. Dữ liệu cũ trong DB — không cần chạy script gì

Khu và kệ tạo **trước K1** không có trường `is_active`. Hệ thống coi "không có trường" = **đang hoạt động** (lọc bằng "khác false", không phải "bằng true"). Nghĩa là:

- Không cần chạy migration.
- Mọi khu/kệ cũ vẫn hiện bình thường, response trả `isActive: true`.
- Chỉ khi Admin chủ động tắt thì trường mới được ghi `false`.

~~Product Master cũ không có `manual_override` → coi là chưa sửa tay.~~ 🔄 (09/10/2026) Cờ `manual_override` đã bỏ khi gộp 04/10 — xem B.6.

## C.2. Các luồng bị ảnh hưởng — FE phải sửa gì

| Màn hình đang có                                 | Cần sửa                                                                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Danh sách kho / khu / kệ (Admin)                 | Hiển thị trạng thái `isActive`; thêm nút Sửa, Vô hiệu hóa, Kích hoạt lại; công tắc "Hiện cả mục đã tắt" (truyền `include_inactive=true`)                        |
| Form tạo khu / sinh kệ                           | Bắt `409 WH_WAREHOUSE_INACTIVE` / `WH_ZONE_INACTIVE`                                                                                                            |
| Form gán SKU vào kệ                              | Dropdown kệ lấy đúng kho đang thao tác; bắt 3 lỗi kệ ở mục B.5                                                                                                  |
| Nhập thêm hàng                                   | Bắt `409 WH_WAREHOUSE_INACTIVE`                                                                                                                                 |
| Màn hình Warehouse Staff chọn kho → Picking List | Không đổi gì nếu chỉ lấy kho từ danh sách mặc định (đã lọc sẵn). Vẫn nên bắt `409 WH_WAREHOUSE_INACTIVE` phòng trường hợp kho bị tắt trong lúc đang mở màn hình |
| _(mới)_ Màn hình Product Master                  | Danh sách + tìm kiếm + form kho xác nhận số đo (`PUT .../packaging-profile`) — 🔄 09/10: không còn form sửa tay `PATCH` |

## C.3. Luồng KHÔNG bị ảnh hưởng

Đồng bộ đơn Lazada, gộp đơn, tạo nhóm đơn, quét lấy hàng (`pick-item`), báo thiếu hàng, gợi ý đóng gói, duyệt đóng gói, thông báo — **không đổi hành vi**.

## C.4. 2 lỗi có sẵn phát hiện trong lúc làm K1

| Lỗi                                                                                                                                                                                   | Trạng thái                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Gán SKU không kiểm tra kệ (mục B.5)                                                                                                                                                   | ✅ Đã sửa trong K1                                                                                                          |
| Trừ tồn khi quét và Picking List chỉ lọc theo `kho + seller_sku`, **không lọc sàn/shop**. Nếu 2 sàn (hoặc 2 shop) có SKU trùng chuỗi trong cùng kho → có thể trừ nhầm tồn của sàn kia | ⚠️ Chưa sửa — hiện chưa xảy ra vì dữ liệu chỉ có 1 shop Lazada. Bước K4 (SKU nội bộ, 1 tồn chung cho mọi sàn) xử lý tận gốc |

## C.5. Tác động của K2 🔄

**Dữ liệu cũ:** kệ tạo trước K2 không có các trường mới → response trả `layoutVersion: 1`, `side/cell/capacity/designated/pickSequence = null`. **Không cần migration, không bị xóa.** Kệ chuẩn mới vẫn ghi `rack` (= số kệ) và `level` (= số tầng) nên màn hình cũ đọc 2 trường này không vỡ.

**Route cũ đổi hành vi:**

| Route                                              | Thay đổi                                                 | FE phải làm                                               |
| -------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| `POST .../warehouses/:id/zones`                    | `zone_code` bắt buộc dạng `KA..KZ`                       | Validate ô nhập mã khu; khu cũ đã tạo không bị ảnh hưởng  |
| `POST .../sku-bin-assignments`, `POST .../restock` | Có thể trả `409 WH_BIN_OVER_CAPACITY`; nhận thêm `force` | Hộp thoại xác nhận + gửi lại kèm `force: true`            |
| `GET .../picking-list/:groupId`                    | Thứ tự mới; mỗi dòng có `pick_sequence`                  | Hiển thị đúng thứ tự API trả, KHÔNG tự sắp lại theo mã kệ |
| Mọi GET kệ                                         | Response có thêm 6 trường                                | Hiển thị mã kệ mới + danh mục/size/màu của ô              |
| `POST .../bin-locations/generate`                  | Deprecated                                               | Chuyển form tạo kệ sang `POST .../racks`                  |

**Không bị ảnh hưởng:** đồng bộ đơn, gộp đơn, quét lấy hàng, báo thiếu, đóng gói, thông báo, Product Master.

**Kế hoạch bỏ chuẩn cũ:** khi mọi ô kệ cũ đã hết hàng → vô hiệu hóa các khu mã cũ (`DELETE /warehouse/zones/:id`). Không cần xóa dữ liệu.

### C.5b. Rà soát lại code K2 (26/09/2026) — 2 lỗ hổng đã sửa

| Lỗ hổng                                                                                                     | Hậu quả nếu không sửa                                                               | Đã xử lý                                                                                            |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Ô đang có hàng vẫn đổi được danh mục/size/màu đăng ký                                                       | Nhãn hệ thống và hàng thật lệch nhau → lấy nhầm hàng                                | Chặn `409 WH_BIN_HAS_STOCK_DESIGNATION`                                                             |
| Route sinh kệ **kiểu cũ** (`.../bin-locations/generate`, đã lỗi thời) vẫn chạy trong khu chuẩn mới `KA..KZ` | 1 khu lẫn 2 kiểu mã (`KA-03-01-01` và `KA-D1-P02-T03-1`), lộ trình lấy hàng lẫn lộn | Ở khu `KA..KZ` trả `409 WH_ZONE_V2_USE_RACKS`; khu mã cũ vẫn dùng route cũ được (tương thích ngược) |

**FE cần làm thêm:** bắt 2 mã lỗi trên; ẩn nút "Sinh kệ kiểu cũ" ở khu có mã `KA..KZ`. ~~Thêm nút "Bỏ sửa tay" ở Product Master~~ (🔄 09/10: route đã gỡ, xem B2.8).

---

# PHẦN D — ĐỢT LÀM LẠI KHO: CÁC BƯỚC TIẾP THEO ⏳ (CHƯA CÓ, chỉ để FE chuẩn bị)

| Bước                                                    | Nội dung                                                                                                                                                                         | FE sẽ phải làm gì                                                        |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| ~~K2~~                                                  | ✅ **ĐÃ XONG 26/09/2026** — xem PHẦN B2, C.5, C.5b. Ký hiệu bên `T`/`P` theo quy ước nhóm (đổi 1 dòng trong `warehouse-layout.ts` nếu cần). Kệ cũ không phải xóa, chạy song song | —                                                                        |
| **K3**                                                  | Sổ cái biến động kho; điều chỉnh kiểm kê (bắt lý do); chuyển hàng giữa các ô; 1 SKU nằm nhiều ô                                                                                  | Màn hình kiểm kê, chuyển ô; Picking List có thể chỉ 1 SKU lấy từ nhiều ô |
| **K4** (K4a + K4b ✅ xong 27/09 — B4 + guide SKU_STOCK) | SKU nội bộ (`GUOC-005-DEN-37`) + bảng nối SKU Lazada/Tiki; 1 tồn chung mọi sàn; thao tác "Thay thế SKU"                                                                          | Màn hình nối SKU sàn; gán kệ theo SKU nội bộ thay vì SKU sàn             |
| ~~K5~~                                                  | ✅ **ĐÃ XONG 27/09/2026** — giữ chỗ + tồn khả dụng + cờ thiếu hàng, xem `INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md`                                                                   | —                                                                        |

Mỗi bước khi xong sẽ cập nhật file này với đầy đủ phần "Tác động tới luồng đã có" như Phần C.

---

# PHẦN E — HẠN CHẾ HIỆN TẠI VÀ HƯỚNG KHẮC PHỤC

1. **Chưa ghi ai tắt/bật, lúc nào.** Có trạng thái nhưng không có nhật ký thao tác quản trị. → Làm cùng sổ cái ở K3.
2. **Khe thời gian hẹp khi tắt kho:** hệ thống kiểm tồn = 0 rồi mới tắt; nếu đúng giữa 2 bước đó có người nhập hàng thì kho bị tắt khi vẫn còn hàng. Rất hiếm (Admin tắt kho và nhân viên nhập hàng cùng lúc). → Xử lý triệt để ở K3 khi mọi thay đổi tồn đi qua sổ cái.
3. ~~**Chưa có nút bỏ sửa tay** Product Master~~ — 🔄 không còn áp dụng: từ 04/10 số đo sàn (`marketplaceDimension`) và số đo kho xác nhận (`dimension`) tách riêng, không có sửa tay.
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

| Method | Route                                                    | Role                                     | Ghi chú                                                          |
| ------ | -------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| POST   | `/warehouse/warehouses`                                  | Admin                                    | Tạo kho                                                          |
| GET    | `/warehouse/warehouses`                                  | Admin, Warehouse                         | 🔄 `?include_inactive=true` (chỉ Admin có tác dụng)              |
| GET    | `/warehouse/warehouses/:warehouseId`                     | Admin, Warehouse                         | 🆕                                                               |
| PATCH  | `/warehouse/warehouses/:warehouseId`                     | Admin                                    | 🆕 tên, địa chỉ                                                  |
| DELETE | `/warehouse/warehouses/:warehouseId`                     | Admin                                    | 🆕 vô hiệu hóa + dây chuyền                                      |
| POST   | `/warehouse/warehouses/:warehouseId/reactivate`          | Admin                                    | 🆕 chỉ kho                                                       |
| POST   | `/warehouse/warehouses/:warehouseId/zones`               | Admin                                    | 🔄 chặn khi kho tắt                                              |
| GET    | `/warehouse/warehouses/:warehouseId/zones`               | Admin, Warehouse                         | 🔄 `include_inactive`, có `isActive`; 🔄 mở Warehouse 01/10 (B5) |
| PATCH  | `/warehouse/zones/:zoneId`                               | Admin                                    | 🆕 tên, mô tả                                                    |
| DELETE | `/warehouse/zones/:zoneId`                               | Admin                                    | 🆕 vô hiệu hóa + kệ                                              |
| POST   | `/warehouse/zones/:zoneId/reactivate`                    | Admin                                    | 🆕 bật khu + kệ                                                  |
| POST   | `/warehouse/zones/:zoneId/bin-locations/generate`        | Admin                                    | 🔄 chặn khi khu/kho tắt                                          |
| GET    | `/warehouse/zones/:zoneId/bin-locations`                 | Admin                                    | 🔄 `include_inactive`, có `isActive`                             |
| GET    | `/warehouse/warehouses/:warehouseId/bin-locations`       | Admin, Warehouse                         | 🔄 `include_inactive`, có `isActive`; 🔄 mở Warehouse 01/10 (B5) |
| DELETE | `/warehouse/bin-locations/:binId`                        | Admin                                    | 🆕                                                               |
| POST   | `/warehouse/bin-locations/:binId/reactivate`             | Admin                                    | 🆕                                                               |
| POST   | `/warehouse/warehouses/:warehouseId/sku-bin-assignments` | Admin                                    | 🔄 kiểm tra kệ                                                   |
| GET    | `/warehouse/warehouses/:warehouseId/sku-bin-assignments` | Admin, Warehouse                         | 🔄 mở Warehouse 01/10 (B5)                                       |
| POST   | `.../sku-bin-assignments/:assignmentId/restock`          | Admin, Warehouse                         | 🔄 chặn khi kho tắt; 🔄 mở Warehouse 01/10 (B5)                  |
| GET    | `/warehouse/sku-bin-assignments/unassigned`              | Admin                                    |                                                                  |
| GET    | `/warehouse/:warehouseId/picking-list/:groupId`          | Warehouse, Admin                         | 🔄 chặn khi kho tắt                                              |
| POST   | `/warehouse/zones/:zoneId/racks`                         | Admin                                    | 🆕 K2 tạo kệ chuẩn mới                                           |
| PATCH  | `/warehouse/bin-locations/:binId`                        | Admin                                    | 🆕 K2 sức chứa + đăng ký ô                                       |
| GET    | `/warehouse/warehouses/:warehouseId/bin-suggestions`     | Admin, Warehouse                         | 🆕 K2 gợi ý ô                                                    |
| GET    | `/categories`                                            | Admin, Store Owner, Warehouse, Packaging | 🆕 K2 cây danh mục                                               |
| GET    | `/categories/:code`                                      | (như trên)                               | 🆕 K2                                                            |
| POST   | `/categories`                                            | Admin                                    | 🆕 K2                                                            |
| PATCH  | `/categories/:code`                                      | Admin                                    | 🆕 K2 tên + thang size                                           |
| DELETE | `/categories/:code`                                      | Admin                                    | 🆕 K2 vô hiệu hóa                                                |
| POST   | `/categories/:code/reactivate`                           | Admin                                    | 🆕 K2                                                            |
| GET    | `/product-master`                                        | Admin, Store Owner, Warehouse, Packaging | 🔄 09/10 sửa role: có Warehouse; trả mảng, `?status&shop_id&search` |
| GET    | `/product-master/:id`                                    | Admin, Store Owner, Warehouse, Packaging | 🔄 09/10 sửa role                                                |
| PUT    | `/product-master/:id/packaging-profile`                  | Warehouse, Admin                         | Kho xác nhận số đo → `ready`                                     |
| POST   | `/product-master/sync`                                   | Admin                                    | Đồng bộ catalog ngay                                             |
| ~~PATCH~~ | ~~`/product-master/:id`~~                             | —                                        | 🔄 ĐÃ GỠ (04/10) — dùng `PUT .../packaging-profile`              |
| ~~DELETE~~ | ~~`/product-master/:id/manual-override`~~            | —                                        | 🔄 ĐÃ GỠ (04/10)                                                 |
| GET    | `/warehouse/:warehouseId/picking-list?group_ids=G1,G2`   | Warehouse, Admin                         | 🆕 (bổ sung bảng 09/10) Picking list gộp nhiều nhóm; `group_ids` sai → `WH_INVALID_GROUP_IDS` |

## F.2. Mã lỗi

| Mã                                                 | HTTP        | Khi nào                                                        |
| -------------------------------------------------- | ----------- | -------------------------------------------------------------- |
| `WH_WAREHOUSE_NOT_FOUND`                           | 400/404     | Id kho sai định dạng / không tồn tại                           |
| `WH_ZONE_NOT_FOUND`                                | 400/404     | Id khu sai / không tồn tại                                     |
| 🆕 `WH_BIN_NOT_FOUND`                              | 400/404     | Id kệ sai / không tồn tại                                      |
| 🆕 `WH_WAREHOUSE_INACTIVE`                         | 409         | Thao tác trên kho đã tắt                                       |
| 🆕 `WH_ZONE_INACTIVE`                              | 409         | Sinh kệ trong khu đã tắt; bật kệ khi khu đang tắt              |
| 🆕 `WH_BIN_INACTIVE`                               | 409         | Gán SKU vào kệ đã tắt                                          |
| 🆕 `WH_BIN_NOT_IN_WAREHOUSE`                       | 400         | Gán SKU vào kệ của kho khác                                    |
| 🆕 `WH_HAS_STOCK`                                  | 409         | Tắt kho/khu/kệ còn hàng — `details.unitsInStock`               |
| 🆕 `WH_NOTHING_TO_UPDATE`                          | 400         | PATCH body rỗng                                                |
| `WH_INVALID_BIN_RANGE`                             | 400         | Khoảng sinh kệ sai                                             |
| `WH_WAREHOUSE_CODE_IN_USE` / `WH_ZONE_CODE_IN_USE` | 409         | Trùng mã khi tạo                                               |
| 🆕 `WH_ZONE_LEGACY_FORMAT`                         | 409         | Tạo kệ chuẩn mới trong khu mã cũ                               |
| 🆕 `WH_RACK_EXISTS`                                | 409         | Kệ đã tồn tại                                                  |
| 🆕 `WH_INVALID_RACK_LAYOUT`                        | 400         | Tầng trùng, số màu ≠ số ô, size không có danh mục              |
| 🆕 `WH_SIZE_NOT_IN_SCALE`                          | 400         | Size không thuộc thang size danh mục                           |
| 🆕 `WH_BIN_OVER_CAPACITY`                          | 409         | Vượt sức chứa ô — gửi lại kèm `force: true` nếu chấp nhận      |
| 🆕 `CAT_*`                                         | 400/404/409 | Xem bảng mục B2.2                                              |
| 🆕 `PM_INVALID_ID` / `PM_NOT_FOUND`                | 400/404     | Id Product Master sai / không tồn tại                          |
| ~~`PM_NOTHING_TO_UPDATE`~~                         | —           | 🔄 09/10: route PATCH đã gỡ                                    |
| 🆕 `WH_ZONE_V2_USE_RACKS`                          | 409         | Gọi sinh kệ kiểu cũ trong khu `KA..KZ` — dùng `POST .../racks` |
| 🆕 `WH_BIN_HAS_STOCK_DESIGNATION`                  | 409         | Đổi danh mục/size/màu của ô còn hàng                           |

## F.3. Checklist test cho FE

- [ ] Tắt kho còn hàng → hiện đúng thông báo `WH_HAS_STOCK` kèm số lượng
- [ ] Tắt kho hết hàng → danh sách khu mặc định trống; bật `include_inactive` thấy khu với `isActive: false`
- [ ] Bật lại kho → khu vẫn tắt; bật từng khu → kệ trong khu bật theo
- [ ] Bật khu khi kho đang tắt → `WH_WAREHOUSE_INACTIVE`
- [ ] Sửa kho kèm `warehouse_code` → 400
- [ ] Gán SKU vào kệ của kho khác → `WH_BIN_NOT_IN_WAREHOUSE`
- [ ] Warehouse Staff gọi danh sách kho với `include_inactive=true` → vẫn chỉ thấy kho đang hoạt động
- [ ] 🔄 (09/10) Kho xác nhận số đo 1 SKU (`PUT .../packaging-profile`) → `packagingProfileStatus: ready`, `dimension` có giá trị; đồng bộ sàn sau đó không đổi `dimension`
- [ ] Product Master có `dimension: null` → UI hiện "Chưa có hồ sơ đóng gói", không báo lỗi

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
- [ ] ~~Rà soát K2: "Bỏ sửa tay" Product Master~~ (🔄 09/10: route đã gỡ)
- [ ] 🆕 (09/10) Gợi ý ô thiếu `category_code` → 400 `VALIDATION_ERROR`
- [ ] 🆕 K3: kiểm kê 1 ô đếm lệch → tồn cập nhật, sổ cái có dòng `adjust` đúng chênh lệch + người kiểm
- [ ] 🆕 K3: chuyển 5 cái sang ô khác → 2 ô cập nhật đúng, sổ cái 2 dòng cùng `refId`
- [ ] 🆕 K3: Picking List của SKU nằm 2 ô → có `bin_location_id` + `other_bins`; quét pick-item gửi `bin_location_id` → trừ đúng ô
- [ ] 🆕 K3: bỏ gán ô còn hàng → `WH_ASSIGNMENT_HAS_STOCK`
- [ ] 🆕 K4a: tạo màu DEN → tạo SKU nội bộ ATHUN/5/DEN/M → mã trả về đúng `ATHUN-005-DEN-M`
- [ ] 🆕 K4a: tạo SKU với màu chưa khai → `COLOR_NOT_FOUND`; size ngoài thang → `MSKU_SIZE_NOT_IN_SCALE`
- [ ] 🆕 K4a: nối 1 SKU Lazada từ danh sách unmapped → biến mất khỏi unmapped; nối lại lần 2 → `MAP_ALREADY_MAPPED`
- [ ] 🆕 K4a: Thay thế SKU đổi màu → SKU cũ `isActive:false, replacedBy`, liên kết chuyển sang SKU mới

## F.5. Checklist test cho FE — quyền vận hành kho (01/10/2026)

- [ ] Warehouse Staff gọi `GET .../zones`, `GET .../bin-locations`, `GET .../sku-bin-assignments` của 1 kho → `200` (trước đây `403`)
- [ ] Warehouse Staff nhập thêm 5 vào 1 dòng tồn → `quantityOnHand` tăng 5; sổ cái có dòng `receive` với đúng người thực hiện
- [ ] Warehouse Staff nhập vượt sức chứa → `409 WH_BIN_OVER_CAPACITY` → gửi lại `force: true` → thành công
- [ ] Warehouse Staff gọi `POST .../warehouses/:id/zones` hoặc `POST .../sku-bin-assignments` → vẫn `403`
- [ ] Packaging Staff / Shipping Coordinator gọi 4 route trên → `403`

## F.6. Checklist test cho FE — sửa lỗi kiểu id (07/10/2026)

- [ ] Đã chạy `scripts/migrate-objectid-fields.ts --apply` trên DB đang test; chạy lại báo "không cần làm gì"
- [ ] Picking List của nhóm đơn có SKU đã gán ô → có `bin_code`, `bin_location_id` (không còn "CHƯA GÁN VỊ TRÍ")
- [ ] SKU đã nối nhưng tồn chưa "Đồng bộ tồn" → Picking List vẫn có ô; quét trừ được
- [ ] SKU trong đơn viết khác hoa thường so với dòng tồn → Picking List và quét vẫn khớp
- [ ] Quét 1 món → `200`, tồn giảm; quét vượt tồn → `409 ORD_GROUP_INSUFFICIENT_STOCK` (vẫn đúng)
- [ ] Nhập thêm hàng → `201` (trước đây `404`)
- [ ] Quét thiếu so với đơn rồi tạo gợi ý đóng gói → số lượng theo số đã quét
- [ ] Kiểm hàng hoàn `restock` vào ô chưa từng chứa SKU đó → dòng tồn mới có `masterSku` (SKU đã nối) hoặc `sellerSku` (SKU chưa nối)

