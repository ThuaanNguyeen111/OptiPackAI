# OptiPackAI Backend — Integration Guide: Quản lý Kho (Warehouse Management)

**Phiên bản v1.0 — 26/09/2026 (bước K1 của đợt làm lại kho).** Tài liệu RIÊNG cho toàn bộ vòng đời dữ liệu kho: kho → khu → kệ → sản phẩm trên kệ, cùng dữ liệu kích thước sản phẩm (Product Master). Trước đây phần kho chỉ được nhắc trong `INTEGRATION_GUIDE_FULFILLMENT.md` mục "Nghiệp vụ 2b" (4 bước TẠO kho) — file này thay thế và mở rộng phần đó, vì kho giờ là 1 luồng nghiệp vụ đầy đủ, không chỉ là bước chuẩn bị cho lấy hàng.

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

---

# PHẦN D — ĐỢT LÀM LẠI KHO: CÁC BƯỚC TIẾP THEO ⏳ (CHƯA CÓ, chỉ để FE chuẩn bị)

| Bước | Nội dung | FE sẽ phải làm gì |
|---|---|---|
| **K2** | Mã kệ 5 phần `KA-D1-PH02-T03-1` (Khu-Dãy-Bên+Kệ-Tầng-Ô); sức chứa từng ô; thứ tự lộ trình hình rắn; danh mục 2 cấp (Áo → Áo thun...) + thang size; mỗi ô đăng ký danh mục/size/màu | Form sinh kệ đổi hoàn toàn; hiển thị mã kệ mới. **Dữ liệu kệ thử nghiệm hiện tại sẽ bị xóa làm lại** |
| **K3** | Sổ cái biến động kho; điều chỉnh kiểm kê (bắt lý do); chuyển hàng giữa các ô; 1 SKU nằm nhiều ô | Màn hình kiểm kê, chuyển ô; Picking List có thể chỉ 1 SKU lấy từ nhiều ô |
| **K4** | SKU nội bộ (`GUOC-005-DEN-37`) + bảng nối SKU Lazada/Tiki; 1 tồn chung mọi sàn; thao tác "Thay thế SKU" | Màn hình nối SKU sàn; gán kệ theo SKU nội bộ thay vì SKU sàn |
| **K5** | Tồn khả dụng + giữ chỗ chống bán lố giữa các sàn | Hiển thị 2 con số: tồn thực và tồn khả dụng |

Mỗi bước khi xong sẽ cập nhật file này với đầy đủ phần "Tác động tới luồng đã có" như Phần C.

---

# PHẦN E — ĐIỂM CÒN YẾU CỦA PHẦN KHO SAU K1 (nói thẳng để FE/nhóm biết)

1. **Chưa ghi ai tắt/bật, lúc nào.** Có trạng thái nhưng không có nhật ký thao tác quản trị. → Làm cùng sổ cái ở K3.
2. **Khe thời gian hẹp khi tắt kho:** hệ thống kiểm tồn = 0 rồi mới tắt; nếu đúng giữa 2 bước đó có người nhập hàng thì kho bị tắt khi vẫn còn hàng. Rất hiếm (Admin tắt kho và nhân viên nhập hàng cùng lúc). → Xử lý triệt để ở K3 khi mọi thay đổi tồn đi qua sổ cái.
3. **Chưa có nút bỏ sửa tay** Product Master (trả về số Lazada). → Bổ sung nhỏ, làm cùng K2.
4. **Nhập hàng chỉ là 1 con số** — không có phiếu nhập, nhà cung cấp, người nhận hàng. → K3.
5. **Chưa có cảnh báo tồn kho thấp.** → Đề xuất thêm sau K3 (dùng lại hệ thống thông báo sẵn có).
6. **Product Master chỉ có SKU đã từng có đơn** (thiết kế cũ để tiết kiệm lượt gọi Lazada) — sản phẩm mới chưa ai mua thì không có kích thước. → Bước K4 cho phép tạo SKU nội bộ kèm kích thước ngay từ đầu, không phụ thuộc đơn hàng.

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
| GET | `/product-master` | Admin, Store Owner, Packaging | 🆕 |
| GET | `/product-master/:id` | Admin, Store Owner, Packaging | 🆕 |
| PATCH | `/product-master/:id` | Admin, Store Owner | 🆕 bật `manualOverride` |

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
| 🆕 `PM_INVALID_ID` / `PM_NOT_FOUND` | 400/404 | Id Product Master sai / không tồn tại |
| 🆕 `PM_NOTHING_TO_UPDATE` | 400 | PATCH body rỗng |

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
