# FE — Việc còn phải làm để khớp Backend

> **Phiên bản 3.0 — 21/10/2026.** Đối chiếu code FE trên `feature/thuan_be` (FE = `feature/viet_ui` commit `b00830e`, gộp ở AOFP-133) với **253 route BE**. Cách rà: so mọi đường dẫn FE gọi với route BE (cả 2 chiều), tìm hàm API khai báo mà không màn nào dùng, so danh sách trạng thái/loại thông báo FE với enum BE.
> File này **chỉ giữ việc chưa làm**. Việc đã xong gom ở [phụ lục ✅](#phụ-lục--đã-hoàn-thành-tóm-tắt) cuối file, mỗi việc 1 dòng.

**Quy ước chung (giữ nguyên):** mọi nút đổi trạng thái gửi `expected_version` = `version` đọc lần gần nhất; `409 *_CONFLICT` → tải lại rồi cho bấm lại. Lỗi luôn là `{ error_code, message, details }` — hiện `message`, rẽ nhánh theo `error_code`. `fe/src/lib/api.ts` đã tự gắn token, tự refresh khi 401, có `apiRequestBlob` để tải PDF.

---

## 0. Còn phải làm — theo thứ tự ưu tiên

| # | Việc | Mục | Ước lượng |
|---|---|---|---|
| 1 | Màn đóng gói: báo trước lấy thùng ở **kệ mới hay kệ tái sử dụng**, nút **"Dùng thùng mới thay"** kèm lý do | 1.1 | ~nửa ngày |
| 2 | 5 nút **in PDF**: tem ô kệ, tem SKU, danh sách lấy hàng, phiếu nhập kho | 1.3 | ~2 giờ |
| 3 | Cài đặt **người gửi** in trên nhãn vận đơn | 1.2 | ~1 giờ |
| 4 | Lô hàng: Picking List hiện **lô xuất trước**; màn **Tồn theo lô** của kho; **danh sách + chi tiết phiếu nhập** | 2 | ~nửa ngày |
| 5 | Dọn mã chết (gọi route BE đã gỡ, không màn nào dùng) | 3 | ~1 giờ |
| 6 | (Tuỳ chọn) Chi tiết 1 sản phẩm Product Master; số liệu giả còn lại ở Bảng điều khiển | 4 | Tuỳ |

Không có việc nào ở trên làm **hỏng** màn hiện tại — BE chỉ thêm, chưa làm thì màn cũ vẫn chạy.

> **21/10/2026 — chỉ đổi nghĩa con số, FE không phải sửa:** `activeWorkload` của Warehouse Staff (`GET /order-groups/staff/search`, hiện "N việc" ở `WarehousePage.tsx`) nay chỉ đếm nhóm **còn ở bước lấy hàng** (chờ xử lý, đang lấy, thiếu hàng chờ quyết định) — số sẽ nhỏ hơn trước. Nếu màn có chữ giải thích thì sửa thành "nhóm đang lấy".

---

## 1. 🆕 Mới 21/10/2026 — nguồn thùng, người gửi, in tem/phiếu kho

### 1.1 Màn đóng gói — báo trước lấy thùng ở kệ nào, cho chọn "dùng thùng mới thay"

Đọc: [INTEGRATION_GUIDE_PACKING.md mục 3.4.1](INTEGRATION_GUIDE_PACKING.md).

**Bước 1 — tầng API** (`fe/src/api/packing-plan.api.ts`, `fe/src/types/packing-plan.ts`):
1. Thêm type `BoxSourcePlan` = `{ parcelNo, boxCode, state: 'to_consume'|'consumed'|'inactive', reusedAllowed, planned: 'new'|'reused'|null, forcedNewReason: 'FRAGILE'|'NOT_REUSABLE'|'NO_REUSED_STOCK'|null, outOfStock, used: 'new'|'reused'|null, boxSourceOverride }` và `BoxSourcesResponse = { orderGroupId, version, allowReusedForFragile, parcels: BoxSourcePlan[], stock: { code, name, qtyNew, qtyReused, reusable }[] }`.
2. Thêm hàm `getBoxSources(groupId)` → `GET /order-groups/:groupId/packing-plan/box-sources`.
3. `PackingPlanParcel` thêm 2 trường tuỳ chọn: `boxSourceUsed?: 'new'|'reused'|null`, `boxSourceOverride?: { source, planned, reason, note, by, at } | null`.
4. `sealParcel(groupId, parcelNo, expectedVersion, weightKg, choice?)`: thêm tham số tuỳ chọn `choice?: { box_source: 'auto'|'new'|'reused'; box_source_reason?: string; box_source_note?: string }`, trải vào body. Không truyền → gửi như cũ.
5. `packPlan(...)`: kiểu phần tử `parcels` thêm 3 trường tuỳ chọn trên.
6. Hằng nhãn lý do: `REUSED_BOX_WORN` "Thùng tái sử dụng móp/rách" · `REUSED_BOX_DIRTY` "Bẩn/ẩm" · `OLD_LABEL_NOT_CLEAN` "Còn vết nhãn cũ" · `REUSED_NOT_ON_SHELF` "Kệ không còn thùng" · `HIGH_VALUE_ORDER` "Đơn giá trị cao" · `OTHER` "Khác (ghi chú)".

**Bước 2 — màn** (`fe/src/components/packing/PackingSessionPanel.tsx`):
1. Khi mở phiên đóng và sau mỗi lần niêm phong thành công: gọi `getBoxSources(groupId)`, lưu theo `parcelNo`.
2. Trên mỗi kiện `pending`, cạnh tên thùng, hiện 1 dòng:
   - `planned = 'reused'` → chip xanh **"Lấy ở kệ tái sử dụng · còn {qtyReused}"**.
   - `planned = 'new'` → chip xám **"Lấy thùng mới · còn {qtyNew}"** + lý do nhỏ theo `forcedNewReason` (`FRAGILE` "hàng dễ vỡ", `NO_REUSED_STOCK` "kệ tái sử dụng hết", `NOT_REUSABLE` "loại thùng không tái sử dụng").
   - `outOfStock = true` → chip đỏ **"Hết thùng"** + gợi ý nút đổi thùng (đã có).
3. Khi `planned = 'reused'`: thêm nút nhỏ **"Dùng thùng mới thay"** → mở popup chọn lý do (bắt buộc; "Khác" bắt buộc ghi chú) → lưu lựa chọn tạm cho kiện đó. Hiện chip "Sẽ dùng thùng mới — {lý do}" + nút "Bỏ chọn".
4. Nút **Niêm phong** của kiện: có lựa chọn tạm → gọi `sealParcel(..., { box_source: 'new', box_source_reason, box_source_note })`; không có → gọi như cũ.
5. Kiện đã niêm phong: hiện "Thùng: mới" hoặc "Thùng: tái sử dụng" từ `boxSourceUsed`; có `boxSourceOverride` thì thêm "(đổi từ tái sử dụng — {lý do})".
6. Đóng nhanh (`PackagingWorkbench.tsx`, chỗ gọi `packPlan`): chỉ cần gửi như cũ; nếu muốn, cho chọn tương tự từng dòng cân.

**Bước 3 — bắt lỗi:** `400 PACKING_BOX_SOURCE_REASON_REQUIRED` (thiếu lý do) · `409 PACKING_BOX_SOURCE_NOT_ALLOWED` (tái sử dụng cho hàng dễ vỡ) · `409 PKG_BOX_OUT_OF_STOCK` có `details.source = 'reused'` (kệ tái sử dụng vừa hết → tải lại `box-sources`) · `409 PACKING_BOX_ALREADY_CONSUMED` (kiện mở ra đóng lại — ẩn nút chọn khi `state = 'consumed'`).

**Bước 4 — báo cáo** (`PackingSettingsReports.tsx`, phần feedback): thêm thẻ **"Thùng tái sử dụng bị thay"** đọc `report.boxSource.overrides`, bảng `byReason`, `byBox`. `suggestions` có thể có thêm loại `box` (đã hiện chung với các đề xuất khác).

### 1.2 Người gửi trên nhãn vận đơn

Đọc: [INTEGRATION_GUIDE_SHIPPING.md B.7.1 bước 4](INTEGRATION_GUIDE_SHIPPING.md).

1. `fe/src/api/shipping.api.ts`: type `ShippingSettings` thêm `sender: { name: string|null; phone: string|null; address: string|null }`; `updateShippingSettings` nhận thêm `sender_name?`, `sender_phone?`, `sender_address?`.
2. Màn cài đặt vận chuyển (Store Owner/Admin): thêm 3 ô **Tên người gửi / SĐT / Địa chỉ kho gửi**, điền sẵn từ `GET`. Ghi chú dưới form: "Bỏ trống → nhãn dùng tên + địa chỉ kho".
3. Nhãn in ra đã có khối NGƯỜI GỬI — nút in nhãn hiện tại không phải sửa.

### 1.3 In tem và phiếu kho

Đọc: [INTEGRATION_GUIDE_WAREHOUSE.md PHẦN B9](INTEGRATION_GUIDE_WAREHOUSE.md). Dùng lại `openShippingDocument(path)` trong `fe/src/api/shipping.api.ts` (nó gọi `apiRequestBlob` rồi mở tab mới) — có thể đổi tên thành `openPdfDocument` cho đúng nghĩa.

| # | Màn | Thêm nút | Gọi |
|---|---|---|---|
| 1 | Quản lý kho → danh sách khu | **In tem ô** (mỗi khu) | `/documents/bin-labels/{warehouseId}?zone_id={zoneId}` |
| 2 | Quản lý kho → dòng 1 ô | **In lại tem** | `/documents/bin-labels/{warehouseId}?bin_ids={binId}` |
| 3 | SKU nội bộ (chọn nhiều dòng) | **In tem SKU** + ô "số bản" (1–50) | `/documents/sku-labels?codes={mã1,mã2}&copies={n}` (nhớ `encodeURIComponent` từng mã) |
| 4 | Lấy hàng (Warehouse Staff, màn Picking List) | **In danh sách lấy hàng** | `/documents/picking-list/{warehouseId}/{groupId}` |
| 5 | Phiếu nhập: sau khi tạo + trong chi tiết phiếu | **In phiếu nhập** | `/documents/stock-receipt/{warehouseId}/{receiptId}` |

Bắt lỗi (JSON như mọi route): `DOC_NO_BINS` "Khu chưa có ô nào", `DOC_TOO_MANY_LABELS` "Quá 500 tem — in theo từng khu", `DOC_NO_CODES`, `WH_RECEIPT_NOT_FOUND`.

---

## 2. Lô hàng (FIFO) — phần FE còn thiếu

BE: [INTEGRATION_GUIDE_WAREHOUSE.md PHẦN B8](INTEGRATION_GUIDE_WAREHOUSE.md). Đã có: form phiếu nhập (`createStockReceipt`), "Nhập thêm hàng" có ngày nhập + mã lô, xem lô của 1 dòng SKU trên ô (`listAssignmentLots`) — đều ở `WarehouseInventoryPage.tsx`.

| # | Việc | Làm ở đâu |
|---|---|---|
| 1 | **Picking List hiện lô xuất trước** "Lô LO-2610 · nhập 01/10" dưới mã ô (cả ô chính và `other_bins`) | `fe/src/api/warehouse.api.ts` → `mapPickingListItem` + `mapOtherBins`: đọc thêm `oldest_lot { lot_code, received_at, quantity_remaining }` (có thể `null`); type `WarehousePickingListItem`, `OtherBin` thêm `oldest_lot`; hiện ở bảng Picking List trong `AdminWarehousePage.tsx` (~dòng 2780) và màn lấy hàng của Warehouse Staff |
| 2 | **Màn "Tồn theo lô" của kho**, lọc SKU / mã lô | Hàm `listStockLots` **đã có, chưa màn nào dùng** → thêm tab trong `WarehouseInventoryPage.tsx` |
| 3 | **Danh sách phiếu nhập** + bấm xem chi tiết | Hàm `listStockReceipts` **đã có, chưa dùng**; thêm hàm `getStockReceipt(warehouseId, receiptId)` → `GET /warehouse/warehouses/:warehouseId/receipts/:receiptId`; chi tiết có nút **In phiếu nhập** (mục 1.3) |

---

## 3. Dọn mã chết

Các hàm dưới đây **không màn nào gọi**, phần lớn trỏ tới route BE **đã gỡ** (gọi sẽ 404). Xoá để khỏi bị dùng nhầm:

| File | Xoá |
|---|---|
| `api/packaging.api.ts` + `types/packaging.ts` | Cả 2 file (route `/order-groups/:id/packaging*` đã gỡ 04/10) |
| `api/order-groups.api.ts` | `packOrderGroup` (`/fulfillment/pack` đã gỡ), `retryLazadaPack` + `mapLazadaPackInfo` (`/lazada-pack/retry` đã gỡ 10/10); giá trị `'pack'` trong `postFulfillmentTransition` |
| Còn sót trong code | `packagingConsumption`, `activePackagingRecommendation`, `LAZADA_PACK_STATUSES` (8 chỗ — tìm bằng grep) |

Sau khi xoá: tìm trong `fe/src` không còn `/packaging/`, `/fulfillment/pack`, `/lazada-pack` (trừ `/packaging/boxes|bags|materials` là danh mục, vẫn đúng).

---

## 4. Tuỳ chọn

- **Chi tiết 1 sản phẩm** Product Master: `GET /product-master/:id` (chưa có hàm). Danh sách, lọc "chưa đo", lưu kích thước đóng gói **đã có**.
- **Bảng điều khiển** (`DashboardPage.tsx`): khối báo cáo đóng gói + tiết kiệm vật tư đã dùng API thật; các khối doanh thu theo kênh / tài chính / thống kê nhân viên vẫn đọc `data/dashboard-mock.ts` — **BE không có API tương ứng**, giữ nguyên nhưng nên ghi chú "số liệu mẫu" trên màn.
- `data/admin-mock.ts` (`defaultAiPackagingParams`) và `data/cartons.ts` (dựng cảnh 3D): dữ liệu tĩnh hợp lệ, không cần đổi.

---

## 5. Nghiệm thu phần còn lại

- [ ] Kiện thường, kệ tái sử dụng còn hàng → chip "Lấy ở kệ tái sử dụng"; niêm phong → kiện hiện "Thùng: tái sử dụng", trang Vật tư: cột Tái sử dụng giảm 1.
- [ ] "Dùng thùng mới thay" mà không chọn lý do → không gửi được; có lý do → cột Mới giảm 1, kiện hiện "(đổi từ tái sử dụng — …)".
- [ ] Kiện có hàng dễ vỡ → chip "Lấy thùng mới · hàng dễ vỡ", không có nút đổi.
- [ ] Lưu người gửi → nhãn có khối NGƯỜI GỬI; xoá trắng → nhãn lấy tên + địa chỉ kho.
- [ ] In tem ô 1 khu, tem SKU 2 bản, danh sách lấy hàng, phiếu nhập → PDF mở tab mới; quét thử tem ô ra đúng `bin_code`.
- [ ] Picking List hiện lô xuất trước; màn Tồn theo lô + danh sách phiếu nhập có dữ liệu.
- [ ] Tìm trong `fe/src` không còn `/fulfillment/pack`, `/lazada-pack`, `api/packaging.api.ts`.

---

## Phụ lục ✅ — đã hoàn thành (tóm tắt)

Đối chiếu 21/10/2026, FE đã nối đủ; chi tiết request/response vẫn ở các guide.

| Nhóm | Đã xong |
|---|---|
| Đăng nhập, người dùng, thông báo | Đủ route; "đọc hết thông báo"; 24/24 loại thông báo + điều hướng |
| Kết nối sàn, đơn hàng | Kết nối Lazada + **AURELLE**, danh sách shop, đồng bộ theo sàn (`/orders/:platform/sync`); bỏ đơn giả "demo đa sàn" |
| Cấu hình đồng bộ & gom đơn | Màn `OrderSyncSettingsPage` (xem, lưu, lịch sử) |
| Nhóm đơn, lấy hàng | Lọc + phân trang, `assigned_packer_id`, trạng thái `returning`/`canceled` (khớp enum BE), liên kết tay, giữ chỗ tồn |
| **Đóng gói** | Chuyển hết sang `packing-plan` (22 route): chấp nhận & đóng, quay lại chờ chấp nhận, quét/niêm phong/xem lại kiện lệch cân, sự cố, trả về lấy hàng, tháo kiện, đổi thùng khi đang đóng, hướng dẫn AI, gán người đóng, tóm tắt hàng chờ, cài đặt + báo cáo + feedback |
| Danh mục thùng/túi/vật tư | `/packaging/boxes|bags|materials` (+ quy tắc), `/packaging-materials` (mua, dùng nội bộ, lịch sử, khôi phục, tiết kiệm) |
| Giao hàng + GHN | Hãng, báo giá, so phương án đóng gói, chiến lược, tạo vận đơn có chọn hãng, giao chung chuyến, lịch lấy hàng, đặt/huỷ/đồng bộ/nhãn A5/sửa địa chỉ GHN, nút mô phỏng GHN, quét quá hạn; 8/8 trạng thái vận đơn; ẩn nút giao tay khi `carrierManaged`; in phiếu đóng gói / nhãn / bảng kê |
| Hoàn hàng | Đủ 12 route: tạo, duyệt/từ chối, **huỷ phiếu**, nhận, kiểm hàng **có thu hồi vật tư A/B/C**, cách ly, đơn đổi; kho nhận kiện hoàn theo vận đơn (`receive-return`) |
| Kho, SKU nội bộ, Product Master | Kho/khu/ô/kệ + sửa/tắt/xoá hẳn (cả dãy kệ), gợi ý ô, gán/sửa gán/chuyển/kiểm kê/lịch sử, Picking List; SKU nội bộ (sửa, xoá hẳn, thay mã, nối SKU sàn, gộp tồn); màu; danh mục; Product Master (danh sách, đồng bộ, lọc chưa đo, lưu kích thước đóng gói); tồn khả dụng |
