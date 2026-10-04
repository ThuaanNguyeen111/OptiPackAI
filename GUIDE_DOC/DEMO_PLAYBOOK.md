# OptiPackAI — Sổ tay trình diễn hệ thống (Demo Playbook)

| Thông tin         | Giá trị                                                                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phiên bản         | 1.0 — 27/09/2026                                                                                                                                                                                   |
| Phạm vi           | Toàn bộ luồng sau đồng bộ đơn: kho & SKU → lấy hàng → đóng gói & vật liệu → giao hàng → trả / đổi hàng → chống bán lố                                                                              |
| Thời lượng        | Bản đầy đủ ~25 phút · Bản rút gọn trước hội đồng ~12 phút (Mục 9)                                                                                                                                  |
| Tài liệu chi tiết | `INTEGRATION_GUIDE_WAREHOUSE.md`, `INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md`, `INTEGRATION_GUIDE_SHIPPING.md`, `INTEGRATION_GUIDE_PACKAGING_MATERIALS.md`, `INTEGRATION_GUIDE_OPERATIONS_UTILITIES.md` |

Mỗi bước trình bày theo cấu trúc: **Vai trò → Màn hình → Thao tác → API tương ứng → Kết quả cần thấy.** Cột API giúp kiểm tra bằng Swagger/Postman khi giao diện chưa hoàn thiện.

---

## 1. Chuẩn bị môi trường (thực hiện trước buổi demo)

### 1.1. Cấu hình

Thêm vào `.env` của BE để không phải chờ thời gian thực:

```
SHIPMENT_MIN_RETRY_GAP_MINUTES=1
SHIPMENT_DUE_BUSINESS_HOURS=0
```

### 1.2. Lệnh chạy

```bash
cd be
npx ts-node -r dotenv/config scripts/migrate-sku-bin-assignment-multibin.ts   # 1 lần mỗi môi trường
npx ts-node -r dotenv/config scripts/backfill-order-group-counts.ts            # 1 lần mỗi môi trường (01/10/2026) — số đơn còn hiệu lực/đã hủy cho nhóm đơn cũ
npm run start:dev                                                              # khởi động lại để tạo index mới
```

### 1.3. Tài khoản

| Vai trò              | Dùng cho                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Admin                | Cấu hình kho, SKU, vật liệu; giả lập khách yêu cầu trả/đổi hàng                                                       |
| Store Owner          | Duyệt trả/đổi hàng, nhận thông báo                                                                                    |
| Warehouse Staff      | Xem tồn theo ô, nhập thêm hàng, lấy hàng, kiểm kê, nhận và kiểm hàng hoàn (quyền xem ô và nhập hàng có từ 01/10/2026) |
| Packaging Staff      | Duyệt gợi ý đóng gói, đóng gói                                                                                        |
| Shipping Coordinator | Các thao tác giao hàng                                                                                                |

Mở mỗi vai trò trong một cửa sổ trình duyệt riêng (hoặc chế độ ẩn danh) để chuyển vai nhanh.

### 1.4. Dữ liệu cần có

- Shop Lazada đã kết nối, đơn và sản phẩm đã đồng bộ (`GET /product-master` có dữ liệu).
- Ít nhất **3 nhóm đơn** chứa cùng 1 SKU áo (gọi là SKU-DEMO), ở trạng thái đang lấy hàng. Nếu chưa có, đặt đơn thử trên shop Lazada.
- 2 SKU Lazada khác nhau cùng đại diện 1 sản phẩm (tình huống 2 listing), gọi là LISTING-1 và LISTING-2.

---

## 2. Dựng dữ liệu nền (Admin, ~5 phút — có thể làm trước)

| #   | Màn hình     | Thao tác                                                                                   | API                                        | Kết quả                             |
| --- | ------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------- |
| 2.1 | Kho          | Tạo kho `WH-HCM-01`                                                                        | `POST /warehouse/warehouses`               | Kho mới, `isActive: true`           |
| 2.2 | Kho → Khu    | Tạo khu `KA`                                                                               | `POST /warehouse/warehouses/:id/zones`     | Khu `KA`                            |
| 2.3 | Danh mục     | Tạo `AO` (cấp 1), `ATHUN` (cấp 2, size S/M/L/XL)                                           | `POST /categories` ×2                      | Cây 2 cấp                           |
| 2.4 | Màu          | Tạo `DEN`, `TRANG`, `VANG`                                                                 | `POST /colors` ×3                          | 3 màu                               |
| 2.5 | Kho → Tạo kệ | Dãy D1, bên P, kệ 02, danh mục ATHUN, 4 tầng (XL/L/M/S), 3 ô (Đen/Trắng/Vàng), sức chứa 30 | `POST /warehouse/zones/:zoneId/racks`      | 12 ô `KA-D1-P02-T01-1` … `T04-3`    |
| 2.6 | Vật liệu     | Khai `BOX-S`, `BOX-M`, `BOX-L`, `BUBBLE` (kích thước và đơn giá theo guide vật liệu)       | `POST /packaging-materials` ×4             | Danh mục vật liệu                   |
| 2.7 | Vật liệu     | Nhập 20 thùng mỗi loại, 50 Bubble                                                          | `POST /packaging-materials/:code/purchase` | `qtyNew` tăng                       |
| 2.8 | Tồn kho      | Gán LISTING-1 vào ô `KA-D1-P02-T03-1`, tồn 6; gán LISTING-2 cùng ô, tồn 4                  | `POST .../sku-bin-assignments` ×2          | 2 dòng tồn riêng, `masterSku: null` |

---

## 3. Phần A — Kho và SKU nội bộ (~5 phút)

| #   | Vai trò   | Thao tác                                    | API                                                                                    | Kết quả cần thấy                            | Thông điệp trình bày                              |
| --- | --------- | ------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------- |
| A1  | Admin     | Mở màn tồn kho                              | `GET .../sku-bin-assignments`                                                          | 2 dòng: LISTING-1 = 6, LISTING-2 = 4        | Cùng 1 sản phẩm nhưng hệ thống đang ghi nhận 2 mã |
| A2  | Admin     | Tạo SKU nội bộ: ATHUN · mẫu 5 · DEN · M     | `POST /master-skus`                                                                    | Mã tự sinh `ATHUN-005-DEN-M`                | Mã do hệ thống sinh theo quy ước                  |
| A3  | Admin     | Thử tạo với size `XXL`                      | `POST /master-skus`                                                                    | `400 MSKU_SIZE_NOT_IN_SCALE`                | Kiểm tra theo thang size của danh mục             |
| A4  | Admin     | Màn "SKU chưa nối" → nối LISTING-1          | `GET /master-skus/unmapped-seller-skus` → `POST /master-skus/ATHUN-005-DEN-M/mappings` | Dòng tồn LISTING-1 có `masterSku`           | Tồn chuyển sang tính theo SKU nội bộ              |
| A5  | Admin     | Nối LISTING-2                               | `POST .../mappings`                                                                    | Còn **1 dòng, tồn 10**                      | Tồn 2 listing được gộp đúng với thực tế           |
| A6  | Admin     | Mở sổ cái của dòng tồn                      | `GET .../movements`                                                                    | Dòng `transfer_in +4`, `refType: sku_merge` | Mọi thay đổi tồn đều có dấu vết                   |
| A7  | Admin     | Thử bỏ nối LISTING-2                        | `DELETE /master-skus/mappings/:id`                                                     | `409 MAP_HAS_POOLED_STOCK`                  | Tồn đã gộp không thể tách mà không có căn cứ      |
| A8  | Warehouse | Kiểm kê ô: đếm được 10, lý do "Đếm định kỳ" | `POST .../adjust`                                                                      | Sổ cái dòng `adjust`, chênh lệch 0          | Kiểm kê khớp vẫn được lưu làm bằng chứng          |

---

## 4. Phần B — Chống bán lố (~4 phút)

Chuẩn bị: nhóm đơn G1 và G2 cùng cần 1 SKU-DEMO (là LISTING-1 hoặc LISTING-2).

| #   | Vai trò     | Thao tác                                       | API                                               | Kết quả cần thấy                                                                                           |
| --- | ----------- | ---------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| B1  | Warehouse   | Kiểm kê ô về **1** cái (lý do "Chuẩn bị demo") | `POST .../adjust`                                 | Tồn = 1                                                                                                    |
| B2  | Admin       | Nhóm đơn G1 → "Tính lại giữ chỗ"               | `POST /order-groups/G1/stock-reservation/recheck` | `stockShortage: false`                                                                                     |
| B3  | Admin       | Nhóm đơn G2 → "Tính lại giữ chỗ"               | `POST /order-groups/G2/stock-reservation/recheck` | `stockShortage: true`, thiếu 1; Store Owner nhận thông báo `stock_shortage`                                |
| B4  | Store Owner | Mở chuông thông báo, mở danh sách nhóm đơn     | `GET /notifications`, `GET /order-groups`         | Nhóm G2 mang nhãn **Thiếu hàng**                                                                           |
| B5  | Admin       | Tra tồn khả dụng                               | `GET /stock-availability?...`                     | Tồn thực 1 · Đã giữ 1 · Khả dụng 0                                                                         |
| B6  | Warehouse   | Nhập thêm 5 cái                                | `POST .../restock`                                | Tồn = 6; sổ cái có dòng `receive` ghi tên nhân viên kho (Warehouse Staff gọi được route này từ 01/10/2026) |
| B7  | Admin       | G2 → "Tính lại giữ chỗ"                        | `POST .../recheck`                                | `stockShortage: false`                                                                                     |

Thông điệp: nhóm đơn thiếu hàng được phát hiện ngay khi đơn về, không phải khi nhân viên đã tới kệ. Khi hai đơn về cùng thời điểm, giao dịch cơ sở dữ liệu đảm bảo chỉ một đơn giữ được món cuối.

---

## 5. Phần C — Lấy hàng, đóng gói và vật liệu (~4 phút)

| #   | Vai trò   | Thao tác                                                                  | API                                                | Kết quả cần thấy                                               |
| --- | --------- | ------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| C1  | Warehouse | Mở Picking List của G1                                                    | `GET /warehouse/:warehouseId/picking-list/G1`      | Có `bin_code`, `bin_location_id`, `master_sku`                 |
| C2  | Warehouse | Quét SKU tại ô, xác nhận lấy xong                                         | `POST .../pick-item` → `POST .../fulfillment/pick` | Tồn giảm; giữ chỗ chuyển `released`                            |
| C3  | Packaging | Mở gợi ý đóng gói, duyệt                                                  | Luồng gợi ý đóng gói hiện có                       | Nhóm đơn sẵn sàng đóng gói                                     |
| C4  | Packaging | Màn đóng gói: đổi thùng gợi ý sang `BOX-L`, nguồn _Mới_ → "Đóng gói xong" | `POST .../fulfillment/pack` + `materials_used`     | Nhóm đơn `packed`; `packagingConsumption` ghi đúng `BOX-L` mới |
| C5  | Admin     | Màn vật liệu                                                              | `GET /packaging-materials`                         | `BOX-L.qtyNew` giảm 1                                          |

Thông điệp: kho vật liệu phản ánh đúng thứ nhân viên đã dùng; trạng thái đóng gói và tồn vật liệu được cập nhật trong cùng một giao dịch.

---

## 6. Phần D — Giao hàng (~5 phút)

Chuẩn bị: 3 nhóm đơn đã `packed` (G1 từ Phần C, và G3, G4).

### D-1. Giao thành công

| #   | Vai trò     | Thao tác                                 | API                           | Kết quả cần thấy                                  |
| --- | ----------- | ---------------------------------------- | ----------------------------- | ------------------------------------------------- |
| D1  | Coordinator | Danh sách chờ giao → G1 → "Bắt đầu giao" | `POST /shipments`             | Vận đơn `out_for_delivery`, có `dueAt`            |
| D2  | Coordinator | "Giao thành công"                        | `POST /shipments/:id/deliver` | `delivered`; nhóm đơn `delivered`                 |
| D3  | Coordinator | Mở tab "Hành trình"                      | `GET /shipments/:id/events`   | Dòng thời gian đầy đủ người thao tác và thời điểm |

### D-2. Giao thất bại, giao lại, hoàn về kho

| #   | Vai trò     | Thao tác                                                                 | API                                  | Kết quả cần thấy                                                                       |
| --- | ----------- | ------------------------------------------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------- |
| D4  | Coordinator | G3 → "Bắt đầu giao" → "Giao thất bại", lý do _Không liên lạc được khách_ | `POST /shipments/:id/fail`           | `delivery_failed`; `nextAttemptNotBefore` = +1 phút; thông báo `delivery_failed`       |
| D5  | Coordinator | Bấm "Giao lại" ngay                                                      | `POST /shipments/:id/retry`          | `409 SHP_RETRY_TOO_EARLY`                                                              |
| D6  | Coordinator | Chờ 1 phút → "Giao lại"                                                  | `POST .../retry`                     | `out_for_delivery`, lần giao 2                                                         |
| D7  | Coordinator | "Giao thất bại" lần 2                                                    | `POST .../fail`                      | Hệ thống tự chuyển `returning_to_warehouse`; thông báo `delivery_returning` (critical) |
| D8  | Warehouse   | "Nhận hàng hoàn"                                                         | `POST /shipments/:id/receive-return` | `returned_to_warehouse`; phiếu hoàn `failed_delivery` được tạo tự động                 |

### D-3. Khách từ chối và vận đơn quá hạn

| #   | Vai trò     | Thao tác                                         | API                            | Kết quả cần thấy                                                           |
| --- | ----------- | ------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------- |
| D9  | Coordinator | G4 → "Bắt đầu giao"                              | `POST /shipments`              | `dueAt` = thời điểm hiện tại (cấu hình demo 0 giờ)                         |
| D10 | Admin       | "Quét quá hạn ngay"                              | `POST /shipments/overdue-scan` | `{ "flagged": 1 }`; G4 mang nhãn **Quá hạn**; thông báo `delivery_overdue` |
| D11 | Coordinator | G4 → "Giao thất bại", lý do _Khách từ chối nhận_ | `POST .../fail`                | Hoàn về kho ngay ở lần giao đầu tiên                                       |

Thông điệp: các quy tắc nghiệp vụ được hệ thống thực thi — không thể kết thúc đơn bằng cách bấm liên tục, khách từ chối được xử lý ngay, đơn trễ hạn được cảnh báo chủ động.

---

## 7. Phần E — Kiểm hàng hoàn, hàng cách ly, tái sử dụng vật liệu (~4 phút)

| #   | Vai trò   | Thao tác                                                                                                                                | API                                                                           | Kết quả cần thấy                                                            |
| --- | --------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| E1  | Warehouse | Danh sách phiếu trả → phiếu `failed_delivery` của G3                                                                                    | `GET /returns?status=received`                                                | Phiếu ở bước chờ kiểm                                                       |
| E2  | Warehouse | Kiểm hàng: 1 sản phẩm _Nhập lại kho_ (chọn ô), 1 sản phẩm _Cách ly_; vật liệu: `BOX-M` hạng A (đã gỡ nhãn, dùng 1 lần), `BUBBLE` hạng B | `POST /returns/:id/inspect`                                                   | Phiếu `closed`; tồn tăng 1; `BOX-M.qtyReused` +1; `BUBBLE.qtyInternal` tăng |
| E3  | Warehouse | Thử xếp hạng A khi chưa tick "Đã gỡ nhãn cũ"                                                                                            | `POST .../inspect`                                                            | `400 PKG_OLD_LABEL_NOT_REMOVED`                                             |
| E4  | Warehouse | Màn "Hàng cách ly" → dòng vừa cách ly → _Nhập lại kho_                                                                                  | `GET /returns/quarantine` → `POST /returns/:id/quarantine/:lineIndex/resolve` | Dòng biến mất khỏi danh sách; tồn tăng; sổ cái `return_restock`             |
| E5  | Packaging | Đóng gói 1 nhóm đơn gợi ý `BOX-M`, không khai vật liệu                                                                                  | `POST .../pack`                                                               | Hệ thống dùng thùng tái sử dụng, `savingVnd` = đơn giá thùng                |
| E6  | Admin     | Màn thống kê vật liệu                                                                                                                   | `GET /packaging-materials/savings`                                            | Tổng tiết kiệm, tỷ lệ tái sử dụng, số dùng nội bộ, số loại bỏ               |
| E7  | Warehouse | Xuất 1 Bubble hạng B dùng nội bộ                                                                                                        | `POST /packaging-materials/BUBBLE/internal-use`                               | `qtyInternal` giảm; sổ cái `internal_use`                                   |

---

## 8. Phần F — Trả hàng và đổi hàng (~4 phút)

Chuẩn bị: nhóm đơn G1 đã `delivered` ở Phần D.

| #   | Vai trò     | Thao tác                                                               | API                                         | Kết quả cần thấy                                                     |
| --- | ----------- | ---------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| F1  | Admin       | G1 → "Yêu cầu đổi hàng": trả size L, đổi sang size M                   | `POST /returns` (`type: exchange`)          | Phiếu `requested`; Store Owner nhận thông báo `return_requested`     |
| F2  | Admin       | Tự bấm "Duyệt"                                                         | `POST /returns/:id/approve`                 | `403 RMA_SELF_APPROVAL`                                              |
| F3  | Store Owner | "Duyệt"                                                                | `POST .../approve`                          | `awaiting_receipt`                                                   |
| F4  | Warehouse   | "Nhận hàng trả" → "Kiểm hàng" (nhập lại kho)                           | `POST .../receive` → `POST .../inspect`     | Phiếu `closed`, `replacementStatus: created`                         |
| F5  | Warehouse   | Danh sách lấy hàng                                                     | `GET /order-groups`                         | Nhóm đơn mới nhãn **Đơn đổi hàng**, mã đơn `EXC-...`, đã giữ chỗ tồn |
| F6  | —           | (Tùy thời gian) đưa đơn thay thế qua lấy hàng → đóng gói → giao        | Các bước C, D-1                             | Đơn thay thế giao thành công                                         |
| F7  | Admin       | Nhóm đơn khác → "Yêu cầu hoàn tiền không trả hàng" → Store Owner duyệt | `POST /returns` (`refund_only`) → `approve` | Phiếu đóng ngay, tồn không đổi                                       |

---

## 9. Kịch bản rút gọn trước hội đồng (~12 phút)

| Thời gian     | Nội dung                                        | Các bước                                      |
| ------------- | ----------------------------------------------- | --------------------------------------------- |
| 0:00 – 2:30   | Gộp tồn 2 listing vào SKU nội bộ                | A1, A2, A4, A5, A6                            |
| 2:30 – 5:00   | Chống bán lố món cuối cùng                      | B1, B2, B3, B4                                |
| 5:00 – 6:30   | Đóng gói với vật liệu thực tế                   | C4, C5                                        |
| 6:30 – 9:00   | Giao thất bại, khoảng cách giao lại, tự hoàn về | D4, D5, D6, D7, D8                            |
| 9:00 – 11:00  | Kiểm hàng hoàn, tái sử dụng thùng, tiết kiệm    | E2, E5, E6                                    |
| 11:00 – 12:00 | Đổi hàng tạo đơn thay thế                       | F1, F3, F4, F5 (chuẩn bị sẵn phiếu ở bước F3) |

### Câu hỏi thường gặp

| Câu hỏi                                       | Trả lời                                                                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Chỉ kết nối Lazada thì gộp tồn có ý nghĩa gì? | Một sản phẩm thường có nhiều listing trên cùng sàn; khi kết nối thêm sàn hoặc shop khác, cơ chế giữ nguyên                        |
| SKU chưa nối thì sao?                         | Hệ thống tính tồn theo SKU sàn như trước; báo cáo `unpooled-stock` liệt kê phần còn lại                                           |
| Hai đơn về cùng lúc tranh món cuối?           | Mỗi khóa tồn có một bản ghi tổng được ghi trong giao dịch; giao dịch đến sau được chạy lại với số liệu mới nên không giữ vượt tồn |
| Có chặn khách đặt trên Lazada khi hết hàng?   | Hệ thống không ghi ngược tồn lên sàn; phát hiện thiếu hàng ngay khi đơn về để xử lý sớm                                           |
| Vì sao đơn đổi hàng có giá trị 0?             | Chênh lệch giá do sàn xử lý; hệ thống quản lý hàng hóa và vận hành                                                                |
| Tái sử dụng thùng có an toàn không?           | Chỉ thùng hạng A, đã gỡ nhãn cũ, chưa quá số lần dùng; hàng dễ vỡ luôn dùng thùng mới                                             |

---

## 10. Xử lý sự cố khi demo

| Hiện tượng                               | Nguyên nhân                                                                       | Cách xử lý                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Nối SKU báo `MAP_SELLER_SKU_UNKNOWN`     | Sản phẩm chưa đồng bộ                                                             | Admin gọi `POST /product-master/sync` (hoặc chờ cron mỗi giờ)          |
| Gán SKU vào ô thứ 2 lỗi trùng khóa       | Chưa chạy script K3                                                               | Chạy `migrate-sku-bin-assignment-multibin.ts`, khởi động lại BE        |
| `pack` trả `warnings` "Chưa khai thùng…" | Kích thước thùng trong danh mục không khớp gợi ý                                  | Khai đúng 3 kích thước (20×15×10, 35×25×20, 50×40×35)                  |
| "Giao lại" luôn báo quá sớm              | Chưa đặt `SHIPMENT_MIN_RETRY_GAP_MINUTES`                                         | Đặt biến môi trường, khởi động lại BE                                  |
| Không có vận đơn quá hạn                 | `SHIPMENT_DUE_BUSINESS_HOURS` chưa đặt 0, hoặc vận đơn tạo trước khi đổi cấu hình | Đặt biến, tạo vận đơn mới, bấm "Quét quá hạn ngay"                     |
| Tính lại giữ chỗ không báo thiếu         | Nhóm đơn khác đã giữ trước/không giữ                                              | Nhả giữ chỗ các nhóm đơn khác (`.../release`) rồi thực hiện lại B2, B3 |
| Không thấy nhóm đơn thay thế             | Tạo tự động lỗi                                                                   | Xem `replacementError`, bấm `POST /returns/:id/create-replacement`     |
