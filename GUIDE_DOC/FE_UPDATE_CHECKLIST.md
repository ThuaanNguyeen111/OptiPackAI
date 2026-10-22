# FE — Việc còn phải làm để khớp Backend

> **Phiên bản 3.2 — 22/10/2026 chiều** (thêm mục 1d). **Phiên bản 3.1 — 22/10/2026** (thêm mục 1b). **Phiên bản 3.0 — 21/10/2026.** Đối chiếu code FE trên `feature/thuan_be` (FE = `feature/viet_ui` commit `b00830e`, gộp ở AOFP-133) với **253 route BE**. Cách rà: so mọi đường dẫn FE gọi với route BE (cả 2 chiều), tìm hàm API khai báo mà không màn nào dùng, so danh sách trạng thái/loại thông báo FE với enum BE.
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
| 7 | 🆕 21/10 (tối) — nhóm đơn có `warehouseId`: màn lấy hàng mở đúng kho của nhóm; bắt 409 `ORD_GROUP_WRONG_WAREHOUSE` (hiện "Nhóm đang lấy ở kho khác"); màn Trả hàng: phiếu của khách có thể 2 phiếu mở / nhóm (mỗi đơn 1), lọc theo `sourceOrderId` | — | ~1 giờ |
| 8 | 🆕 22/10 — Màn Đóng gói: tab **"Kẹt — SKU chưa đo"** (`packingBlocked`), nút sang màn đo | 1b.1 | ~1 giờ |
| 9 | 🆕 22/10 — Hiện **tên người đóng gói** (`assignedPackerName`) trên thẻ nhóm + danh sách | 1b.2 | ~30 phút |
| 10 | 🆕 22/10 — Ô tìm nhóm gọi `GET /order-groups?q=` (đuôi mã nhóm, mã đơn sàn) | 1b.3 | ~30 phút |
| 11 | 🆕 22/10 — **Bỏ form giả lập trả hàng** (POST /returns trả 410) | 1b.4 | ~30 phút |
| 12 | 🆕 22/10 — Nút **"Ngắt kết nối"** shop ở màn Kết nối sàn | 1b.5 | ~45 phút |
| 13 | 🆕 22/10 — **Nghỉ phép nhân viên**: bật/tắt ở màn Nhân viên, khoá chọn người nghỉ khi phân công | 1b.6 | ~1 giờ |
| 14 | 🆕 22/10 — Loại thông báo mới `packing_blocked` (nhãn + điều hướng) | 1b.7 | ~15 phút |
| 15 | 🆕 22/10 — SKU sàn **ngừng bán / ngừng dùng**: nhãn + nút "Ngừng dùng" ở màn Sản phẩm, SKU tự nối | 1c | ~45 phút |
| 16 | 🆕 22/10 (chiều) — Nút **"Hủy đơn (người bán)"** cho đơn AURELLE + chip "Người bán hủy" ở chi tiết đơn | 1d | ~1 giờ |
| 17 | 🆕 22/10 (chiều) — Đổi chữ hộp **giao thiếu** ở màn đóng gói ("Giao phần có sẵn" + dòng giải thích) | 1d | ~10 phút |
| 18 | 🆕 22/10 (chiều) — Chip **"Tự tạo từ AURELLE"** (SKU nội bộ) + **"Tự nối"** (liên kết) dùng `createdBy` mới; cảnh báo khi vô hiệu SKU nội bộ | 1d | ~30 phút |

Không có việc nào ở trên làm **hỏng** màn hiện tại — BE chỉ thêm, chưa làm thì màn cũ vẫn chạy.

> **21/10/2026 — chỉ đổi nghĩa con số, FE không phải sửa:** `activeWorkload` của Warehouse Staff (`GET /order-groups/staff/search`, hiện "N việc" ở `WarehousePage.tsx`) nay chỉ đếm nhóm **còn ở bước lấy hàng** (chờ xử lý, đang lấy, thiếu hàng chờ quyết định) — số sẽ nhỏ hơn trước. Nếu màn có chữ giải thích thì sửa thành "nhóm đang lấy".

---

## 1b. 🆕 Mới 22/10/2026 — kẹt đóng gói, tên người đóng, tìm nhóm, bỏ giả lập trả hàng, ngắt shop, nghỉ phép

> BE đã xong (AOFP-152..158). Chưa làm FE thì màn cũ **vẫn chạy**, chỉ thiếu thông tin — riêng mục 1b.4 (bỏ form giả lập) nên làm sớm vì bấm form cũ sẽ nhận lỗi 410.
> Phần **tự tính lại thiếu hàng khi có hàng về** (AOFP-154) và **hành trình hàng đổi trên website AURELLE** (AOFP-156) KHÔNG cần sửa FE OptiPack.

### 1b.1 Màn Đóng gói — nhóm kẹt vì SKU chưa đo

**Vấn đề hiện tại:** nhóm đã lấy xong (`picked`) mà có SKU chưa có số đo kho xác nhận thì BE không tính được kế hoạch → nhóm không nằm ở tab nào của `PackagingWorkbench`, người dùng tưởng mất đơn.

**BE trả gì:** mỗi `OrderGroup` (`GET /order-groups`, `GET /order-groups/:id`) có thêm
`packingBlocked: { reason: 'needs_measurement' | 'missing_product_master', skus: string[], at: string | null } | null`.
Lọc riêng: `GET /order-groups?packing_blocked=true`. Kho bấm "Xác nhận số đo" xong → BE tự xoá `packingBlocked` và tự tính lại kế hoạch trong ~10 giây (không cần nút "Tính lại").

**Bước 1 — tầng API** (`fe/src/types/order-groups.ts`, `fe/src/api/order-groups.api.ts`):
1. Thêm type `PackingBlocked = { reason: 'needs_measurement' | 'missing_product_master'; skus: string[]; at: string | null }`.
2. `OrderGroup` thêm `packingBlocked: PackingBlocked | null`.
3. Trong hàm map 1 dòng nhóm đơn (chỗ đang map `stockShortage`), đọc `row.packingBlocked ?? null`.
4. `ListOrderGroupsParams` thêm `packing_blocked?: boolean`; `toQuery` gửi `packing_blocked: 'true' | 'false'`.

**Bước 2 — màn** (`fe/src/components/packing/PackagingWorkbench.tsx`):
1. Trong `queueTabs` thêm tab thứ 5 **"Kẹt — SKU chưa đo"** (key `packing_blocked`, không phải "chỉ xem"), đếm = số nhóm có `packingBlocked !== null`.
2. Khi chọn tab này: gọi `listOrderGroups({ packing_blocked: true })` (Packaging Staff vẫn gửi `assigned_packer_id` như cũ? **Không** — nhóm kẹt chưa có kế hoạch nên chưa có người đóng; tab này bỏ lọc người đóng).
3. Mỗi dòng: mã nhóm + chip đỏ **"Chưa đo: SLL-BRN-37, X-1"** (từ `packingBlocked.skus`), thời điểm `packingBlocked.at`.
4. Khung chi tiết nhóm kẹt: dòng giải thích theo `reason`:
   - `needs_measurement` → "Các SKU sau chưa có số đo kho xác nhận. Vào **Cấu hình kho → Sản phẩm → Nối SKU** → lọc **Chưa đo** → **Xác nhận số đo**. Đo xong, hệ thống tự tính lại kế hoạch trong vài giây."
   - `missing_product_master` → "SKU chưa có hồ sơ sản phẩm. Bấm đồng bộ catalog ở **Cấu hình kho → Sản phẩm** rồi xác nhận số đo."
5. Admin thấy thêm nút **"Đi tới màn đo"** → `navigate('/app/admin/warehouse')` (tab Sản phẩm). Packaging Staff chỉ thấy chữ, không có nút (không có quyền màn này).
6. Ở tab này đặt hẹn giờ tải lại 15 giây (hoặc nút **Tải lại**) để nhóm tự biến khỏi tab khi đã đo xong và chuyển sang "Chờ duyệt kế hoạch".

**Bước 3 — các màn khác (tuỳ chọn):** `OrderGroupsPage.tsx` hiện chip "Kẹt đóng gói" cạnh chip "Thiếu hàng" khi `packingBlocked` khác null.

### 1b.2 Tên người đóng gói

**BE trả gì:**
- `OrderGroup` (danh sách + chi tiết) thêm `assignedPackerId: string | null`, `assignedPackerName: string | null` (người đóng của kế hoạch đang hoạt động; null = chưa có kế hoạch / chưa giao).
- Kế hoạch đóng gói: `plan.session.assignedPackerName` (cạnh `assignedPackerId`). `GET /packing-plans/summary` thêm `assignedPackerName`.

**Bước:**
1. `fe/src/types/order-groups.ts`: `OrderGroup` thêm 2 trường trên; map trong `order-groups.api.ts`.
2. `fe/src/types/packing-plan.ts`: `session` thêm `assignedPackerName: string | null`; summary thêm `assignedPackerName`.
3. `PackagingWorkbench.tsx`:
   - Thẻ mỗi nhóm ở hàng đợi (Admin/Store Owner xem): thêm dòng nhỏ **"Người đóng: {assignedPackerName ?? 'chưa giao'}"**.
   - Khung "Gán người đóng · {6 ký tự cuối}" (khoảng dòng 1218): thay `assignedPackerId.slice(-6)` bằng `plan.session.assignedPackerName ?? plan.session.assignedPackerId?.slice(-6)`.
   - Hiện tên người đóng ngay ở phần chi tiết nhóm cả khi chưa duyệt (không chỉ trong khối `approved_for_packing`).
4. `OrderGroupsPage.tsx` (tuỳ chọn): cột "Người đóng".

### 1b.3 Tìm nhóm đơn trên server (`?q=`)

**BE:** `GET /order-groups?q=<chuỗi>` (tối đa 64 ký tự) khớp: mã nhóm đủ 24 ký tự; **đuôi** mã nhóm 4–23 ký tự hex (VD `5beca05d93` như màn kho hiện, `f8d98931` như màn đóng gói hiện); mã đơn sàn / mã đơn AURELLE (`platformOrderId` hoặc số đơn hiển thị — khớp chính xác, không phân biệt hoa thường). Ghép được với mọi bộ lọc khác.

**Bước:**
1. `ListOrderGroupsParams` thêm `q?: string`, gửi trong `toQuery`.
2. `PackagingWorkbench.tsx` ô **"Tìm mã đơn…"**: hiện chỉ lọc trong danh sách đã tải (`groupMatchesSearch`). Giữ lọc tại chỗ; khi không khớp dòng nào và chuỗi ≥ 4 ký tự → gọi `listOrderGroups({ q })` (không truyền `fulfillment_status`) và hiện kết quả kèm trạng thái thật của nhóm, VD "Nhóm …05d93 đang **Đang lấy hàng** — chưa tới bước đóng gói". Đây là điều người dùng gặp ngày 22/10: tìm ở màn Đóng gói nhưng nhóm còn ở bước lấy hàng.
3. `OrderGroupsPage.tsx` và `WarehousePage.tsx` (ô chọn nhóm): dùng `q` thay vì lọc tại chỗ để tìm được cả nhóm ngoài trang đang tải.

### 1b.4 Bỏ form giả lập trả hàng (làm sớm)

**BE:** `POST /returns` nay **luôn** trả `410 RMA_SIMULATION_DISABLED` cho mọi sàn. Phiếu trả/đổi chỉ còn 2 nguồn: khách gửi trên website AURELLE (tự hiện ở danh sách, `source = 'marketplace'`) và phiếu hoàn tự tạo khi giao thất bại (`source = 'failed_delivery'`). Các bước duyệt → nhận → kiểm → đóng giữ nguyên.

**Bước:**
1. `fe/src/pages/ReturnsPage.tsx`: bỏ nút **"+ Tạo phiếu RMA"** và khối `{isAdmin && createOpen ? <CreateReturnForm …/> : null}` (khoảng dòng 345–375) cùng state `createOpen`.
2. Thay bằng 1 dòng hướng dẫn ở đầu màn: "Phiếu trả/đổi do khách gửi trên website AURELLE và tự hiện ở đây. Giao thất bại thì hệ thống tự tạo phiếu hoàn."
3. Xoá `fe/src/components/returns/CreateReturnForm.tsx` và hàm `createReturn` trong `fe/src/api/returns.api.ts` (không màn nào dùng nữa) — hoặc giữ hàm nhưng không gọi.
4. Nếu còn chỗ nào gọi `createReturn`: bắt `410 RMA_SIMULATION_DISABLED` → hiện `message` của BE.
5. Lọc theo nguồn (tuỳ chọn): dropdown "Nguồn: Khách AURELLE / Giao thất bại" dựa trên `source`.

### 1b.5 Ngắt kết nối shop

**BE:** `DELETE /marketplace/:platform/shops/:shopId` (chỉ **Admin**) → `200 { shopId, platform, isActive: false, wasActive, disconnectedAt }`. Chỉ tắt shop (`is_active=false`), dừng kéo đơn/catalog/đẩy tồn/kéo yêu cầu trả hàng; **không xoá** đơn, sản phẩm, tồn kho. Gọi lại khi đã ngắt vẫn 200 (`wasActive: false`). Shop chưa từng kết nối → `404 MKT_SHOP_NOT_FOUND`. Kết nối lại = bấm "Kết nối" OAuth như lần đầu. `GET /marketplace/:platform/shops` thêm `disconnectedAt` (null nếu không do Admin ngắt).

**Bước:**
1. `fe/src/api/marketplace.api.ts`: thêm `disconnectShop(platform, shopId)` → `DELETE /marketplace/${platform}/shops/${encodeURIComponent(shopId)}`.
2. `fe/src/types/marketplace-orders.ts`: kiểu shop thêm `disconnectedAt: string | null`.
3. `fe/src/components/marketplace/LazadaConnectPanel.tsx` (dùng cho cả AURELLE): mỗi shop đang `isActive` có nút đỏ **"Ngắt kết nối"** → hộp xác nhận "Ngắt shop {shopName}? Hệ thống ngừng đồng bộ đơn, sản phẩm, tồn kho của shop này. Dữ liệu cũ vẫn giữ." → gọi API → tải lại danh sách.
4. Shop đã ngắt: chip xám **"Đã ngắt {ngày giờ disconnectedAt}"** (hoặc "Token hết hạn" nếu `disconnectedAt` null) + nút **"Kết nối lại"** (luồng OAuth cũ).
5. Store Owner không thấy nút (route chỉ Admin).

### 1b.6 Nghỉ phép nhân viên

**BE:**
- `PATCH /users/:id/leave` (Admin, Store Owner), body `{ on_leave: boolean, until?: ISO, note?: string (≤200) }` → trả 1 dòng nhân viên như danh sách Admin. `until` (tuỳ chọn) qua hạn thì tự tính đi làm lại. Chỉ cho Warehouse Staff / Packaging Staff / Shipping Coordinator (`422 USER_LEAVE_NOT_STAFF`); `until` đã qua → `400 USER_LEAVE_UNTIL_PAST`.
- `GET /users` mỗi dòng thêm `on_leave` (đã tính hạn), `on_leave_until`, `on_leave_note`.
- Danh sách chọn người: `GET /order-groups/staff/search` và `GET /packing/staff` mỗi dòng thêm `onLeave: boolean`, `onLeaveUntil: string | null`.
- Người nghỉ: hệ thống **không tự giao** việc lấy hàng / đóng gói; giao tay → `409 ORD_GROUP_STAFF_ON_LEAVE` (lấy hàng) / `409 PACKING_PACKER_ON_LEAVE` (đóng gói). Việc họ đang giữ **không tự chuyển** — dùng "Đổi người".

**Bước 1 — API** (`fe/src/api/users.api.ts`): thêm `setUserLeaveApi(id, { on_leave, until?, note? })`; kiểu nhân viên thêm `onLeave`, `onLeaveUntil`, `onLeaveNote` (map từ `on_leave`…).

**Bước 2 — màn Nhân viên** (`fe/src/pages/StaffManagementPage.tsx`, và bảng người dùng ở `AdminPage.tsx` nếu có cột trạng thái):
1. Cột trạng thái: thêm chip vàng **"Nghỉ phép"** (kèm "đến dd/mm" nếu có `onLeaveUntil`, tooltip `onLeaveNote`).
2. Nút **"Cho nghỉ phép"** (chỉ hiện với 3 vai trò trên) → popup: ô "Nghỉ đến" (datetime, tuỳ chọn), ô ghi chú → gọi API `on_leave: true`.
3. Người đang nghỉ: nút **"Đi làm lại"** → gọi API `on_leave: false`.
4. Store Owner hiện chỉ xem màn này (`GET /users`) — nay được bấm 2 nút trên (route cho phép Store Owner).

**Bước 3 — dropdown phân công:**
1. `WarehousePage.tsx` ("Phân công nhân viên kho" → "Chọn tay"): option của người `onLeave` hiện "(nghỉ phép)" và `disabled`.
2. `PackagingWorkbench.tsx` ("Gán người đóng" → "Chọn nhân viên"): tương tự.
3. Bắt `409 ORD_GROUP_STAFF_ON_LEAVE` / `409 PACKING_PACKER_ON_LEAVE` → hiện `message`, tải lại danh sách người.

### 1b.7 Loại thông báo mới `packing_blocked`

1. `fe/src/types/notifications.ts`: thêm `'packing_blocked'` vào danh sách loại + nhãn `{ vi: 'Kẹt đóng gói — SKU chưa đo', en: 'Packing blocked — SKU not measured' }`.
2. `fe/src/lib/notification-nav.ts`: `packing_blocked` → Admin điều hướng `/app/packing` (tab "Kẹt — SKU chưa đo") hoặc `/app/admin/warehouse`; Store Owner → `/app/order-groups`. Gửi cho Admin + Store Owner, 1 lần mỗi lần nhóm chuyển sang kẹt.

---

## 1c. 🆕 Mới 22/10/2026 (trưa) — SKU AURELLE theo quy tắc OptiPack, tự nối SKU, SKU sàn ngừng dùng

> BE đã xong (AOFP-159..161). Form tạo sản phẩm bên **website AURELLE** đã sửa (không thuộc FE OptiPack). FE OptiPack chỉ cần phần dưới.

**BE đổi gì (ảnh hưởng màn OptiPack):**
- SKU AURELLE mới luôn dạng `{danh mục cấp 2}-{số mẫu 3 số}-{màu}-{size}` (VD `ATHUN-005-DEN-M`). SKU sàn trùng mã một SKU nội bộ đang dùng → BE **tự nối** (không cần bấm ở màn "Nối SKU"); tạo SKU nội bộ mới trùng mã SKU sàn đã có → cũng tự nối. Liên kết tự nối có `created_by = 'system:auto-map'`.
- `GET /product-master` mỗi dòng thêm `marketplaceStatus: 'active' | 'inactive' | null` và `retired: boolean`. Mặc định **ẩn** SKU sàn đã ngừng bán (`inactive`) hoặc đã đánh dấu ngừng dùng; `?include_retired=true` để xem cả.
- "SKU chưa gán" (`GET /warehouse/sku-bin-assignments/unassigned`), "SKU chưa nối" (`GET /master-skus/unmapped-seller-skus`) cũng tự bỏ các SKU đó.
- 🆕 `PATCH /product-master/:id/retire` (Admin), body `{ retired: boolean }`.

**Bước 1 — API** (`fe/src/api/catalog.api.ts` hoặc file đang gọi `/product-master`):
1. Kiểu hồ sơ SKU thêm `marketplaceStatus`, `retired`.
2. Hàm `retireProductMaster(id, retired)` → `PATCH /product-master/${id}/retire`.
3. Hàm danh sách nhận thêm `include_retired?: boolean`.

**Bước 2 — màn** (`fe/src/pages/admin-warehouse/CatalogPanels.tsx`, bảng hồ sơ đóng gói / "Đồng bộ và nối SKU sàn"):
1. Thêm ô chọn **"Hiện cả SKU ngừng dùng"** → gọi lại danh sách với `include_retired=true`.
2. Dòng có `marketplaceStatus = 'inactive'` → chip xám **"Sàn ngừng bán"**; `retired = true` → chip **"Ngừng dùng"**.
3. Mỗi dòng có nút **"Ngừng dùng"** (khi `retired = false`) / **"Dùng lại"** (khi `true`) → gọi API → tải lại. Gợi ý cho mã cũ `SF-…` / mã mẫu của sản phẩm đã xoá bên AURELLE: gỡ khỏi kệ (kiểm kê ô về 0 → bỏ gán) rồi bấm "Ngừng dùng".
4. Màn "Nối SKU": dòng liên kết `createdBy = 'system:auto-map'` hiện nhãn **"Tự nối (trùng mã)"**.

---

## 1d. 🆕 Mới 22/10/2026 (chiều) — Người bán hủy đơn AURELLE, giao thiếu, đồng bộ 2 bên

> BE đã xong (AOFP-163..169). Website AURELLE (khách + Admin website) đã sửa — **không thuộc FE OptiPack**. FE OptiPack chỉ cần 2 việc dưới.

**BE đổi gì (ảnh hưởng màn OptiPack):**
- 🆕 `POST /order-groups/orders/:orderId/seller-cancel` (Store Owner, Admin), body `{ reason: string }` (1–300 ký tự, **khách thấy lý do này**). Chỉ đơn **AURELLE**, chưa giao cho vận chuyển. Trả `{ order_id, status: 'canceled' }`. Lỗi:
  - `404 ORD_GROUP_ORDER_NOT_FOUND` — không có đơn.
  - `409 ORD_GROUP_SELLER_CANCEL_NOT_ALLOWED` — đơn Lazada / đơn thay thế đổi hàng / đã hủy / nhóm đã `shipped` trở đi. Hiện `message`.
- Sau khi hủy: nhóm tự xử lý như đơn bị hủy (trả hàng dư về kệ, tháo kiện nếu đang đóng, nhả giữ chỗ — giống khách hủy). Website hiện **"Người bán đã hủy đơn" + lý do**, đơn đã thanh toán chuyển "Đã hoàn tiền".
- `GET /orders/:id` thêm `sellerCanceled: boolean` và `origin: 'marketplace' | 'replacement'`.
- **Giao thiếu:** khi Packaging Staff bấm **"Đồng ý đi tiếp với phần có sẵn"** (decide-partial `approve: true`), BE tự chia số đã lấy cho từng đơn (đơn cũ trước) và báo từng đơn AURELLE bị thiếu → website hiện "Kho giao thiếu N sản phẩm — không tính tiền". **Không đổi API**, chỉ cần đổi chữ cảnh báo.

**Bước 1 — API** (`fe/src/api/orders.api.ts`, file đang gọi `GET /orders/:id`):
1. Kiểu chi tiết đơn thêm `sellerCanceled: boolean`, `origin: 'marketplace' | 'replacement'`.
2. Hàm mới:
   ```ts
   export async function sellerCancelOrder(orderId: string, reason: string) {
     return apiRequest<{ order_id: string; status: 'canceled' }>(
       `/order-groups/orders/${encodeURIComponent(orderId)}/seller-cancel`,
       { method: 'POST', body: { reason }, auth: true },
     )
   }
   ```

**Bước 2 — màn chi tiết đơn** (`fe/src/pages/OrderDetailPage.tsx` và `fe/src/pages/AdminOrderDetailPage.tsx`):
1. Hiện nút **"Hủy đơn (người bán)"** khi **đủ cả 4**: `platform === 'aurelle'`, `origin !== 'replacement'`, `status` thuộc `pending | unpaid | packed | ready_to_ship | topack | toship`, và vai trò là Store Owner / Admin.
2. Bấm nút → mở hộp thoại: ô **"Lý do (khách sẽ thấy)"** bắt buộc, gợi ý sẵn 3 lựa chọn bấm nhanh: "Sản phẩm đã hết hàng", "Không liên hệ được người nhận", "Sai thông tin địa chỉ". Dòng cảnh báo: *"Khách sẽ nhận thông báo đơn bị người bán hủy. Không hoàn tác được."*
3. Xác nhận → gọi `sellerCancelOrder` → thành công: toast "Đã hủy đơn, website đã được báo" → tải lại chi tiết đơn. 409 → hiện `message` trong hộp thoại.
4. Đơn có `sellerCanceled = true` → chip đỏ **"Người bán hủy"** cạnh trạng thái (thay cho chip "Đã hủy" thường).
5. (Tuỳ chọn) Danh sách đơn: chip giống bước 4 — cần `GET /orders` trả thêm field, hiện **chưa có**; bỏ qua.

**Bước 3 — màn đóng gói, hộp quyết định giao thiếu** (`fe/src/components/packing/PackagingWorkbench.tsx`, chỗ gọi `decidePartialOrderGroup`):
1. Đổi chữ nút "Đồng ý" thành **"Giao phần có sẵn"**.
2. Thêm 1 dòng dưới nút: *"Đơn AURELLE bị thiếu sẽ được báo cho khách và không tính tiền phần thiếu. Đơn Lazada xử lý trên Seller Center."*

**Bước 4 — màn SKU nội bộ / Nối SKU** (`fe/src/pages/admin-warehouse/CatalogPanels.tsx`, phần "SKU nội bộ" và "Nối SKU"):
1. API `GET /master-skus` và danh sách liên kết nay trả thêm `createdBy` (BE sửa 22/10 chiều — trước đó **chưa trả**, nên việc 1c bước 2.4 chỉ làm được từ bản này). Thêm `createdBy: string` vào 2 kiểu dữ liệu.
2. SKU nội bộ có `createdBy = 'system:auto-create'` → chip xanh **"Tự tạo từ AURELLE"**. Tên của SKU đó là tên sản phẩm bên website, kích thước để trống → nhắc kho bấm "Sửa" để đo bổ sung.
3. Liên kết có `createdBy = 'system:auto-map'` → nhãn **"Tự nối (trùng mã)"** (chính là việc 1c bước 2.4).
4. Nút **"Vô hiệu"** SKU nội bộ: thêm câu xác nhận *"Website AURELLE sẽ hiện Hết hàng cho mọi SKU nối với mã này (tồn đẩy sang = 0)."*

**Bước 5 — (biết để giải thích, không cần sửa màn):** website AURELLE chỉ bán SKU do kho OptiPack quản. Store Owner hỏi "sao trên web hết hàng" → kiểm tra SKU sàn đó đã nối SKU nội bộ hoặc đã gán kệ/nhập kho chưa (màn "SKU chưa nối", "SKU chưa gán").

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
| Hoàn hàng | Đủ 12 route: tạo, duyệt/từ chối, **huỷ phiếu**, nhận, kiểm hàng **có thu hồi vật tư A/B/C**, cách ly, đơn đổi; kho nhận kiện hoàn theo vận đơn (`receive-return`). 21/10: form giả lập ẩn nhóm AURELLE (BE chặn `RMA_MARKETPLACE_MANAGED`), chi tiết phiếu hiện "Khách tự yêu cầu trên AURELLE · #`externalRef`" |
| Website AURELLE (storefront) | 21/10: trang đơn hiện tên hãng vận chuyển (`carrier`); Admin sản phẩm khóa ô tồn của biến thể `stockSource = optipack` (nhãn "Kho OptiPack") |
| Kho, SKU nội bộ, Product Master | Kho/khu/ô/kệ + sửa/tắt/xoá hẳn (cả dãy kệ), gợi ý ô, gán/sửa gán/chuyển/kiểm kê/lịch sử, Picking List; SKU nội bộ (sửa, xoá hẳn, thay mã, nối SKU sàn, gộp tồn); màu; danh mục; Product Master (danh sách, đồng bộ, lọc chưa đo, lưu kích thước đóng gói); tồn khả dụng |
