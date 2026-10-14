# FE — Danh sách việc cần chỉnh để khớp Backend mới nhất

> Phiên bản 1.2 — 14/10/2026 (22h: thêm Mục 0 tóm tắt đã sửa / FE cần làm). Đối chiếu tự động: mọi đường dẫn API xuất hiện trong `fe/src` (nhánh `main`) so với 239 route của BE hiện tại (gồm C4–C6 GHN).
> Tài liệu này là **bản tổng hợp việc phải làm**; request/response chi tiết nằm ở guide của từng phần (cột "Đọc ở đâu").
> Thứ tự đọc đề xuất: Mục 1 (đang gãy) → Mục 2 (giao hàng/GHN) → Mục 3 (hoàn hàng) → các mục còn lại.

> 🔄 **14/10 tối — đã gộp FE từ `feature/viet_ui` (12/10) vào nhánh `merge/viet-fe`:** FE nay đã gọi `/colors`, `/master-skus`, `/product-master` (+ sync), `/stock-availability`, `POST /returns` (form tạo phiếu), màn Tồn kho bỏ dữ liệu giả → các dòng tương ứng ở Mục 6, 7b.3, 7b.4 coi như **đã có phần gọi API** (vẫn cần nghiệm thu). Bản của Việt **thêm 1 route đã gỡ**: `POST /order-groups/:id/lazada-pack/retry` (`retryLazadaPack` trong `PackagingWorkbench.tsx`) — BE bỏ từ 10/10 (OptiPack không báo pack lên Lazada) → xoá cùng Mục 1.

## 0. Tóm tắt trạng thái (cập nhật 14/10/2026, 22h)

### ✅ Đã sửa sẵn (không đụng màn hình — FE chỉ việc dùng)

| Đã sửa | Ở đâu | FE dùng thế nào |
|---|---|---|
| Gọi được method `PUT` | `fe/src/lib/api.ts` | `apiRequest(path, { method: 'PUT', body, auth: true })` cho `/packing/settings`, `/shipping/settings`, `/packaging/materials/rules`, `/product-master/:id/packaging-profile` |
| Tải file PDF | `fe/src/lib/api.ts` → `apiRequestBlob(path)` | `URL.createObjectURL(await apiRequestBlob('/documents/shipping-label/' + groupId))` rồi mở/in |
| Thời gian chờ cho route gọi GHN | `fe/src/lib/api.ts` → `CARRIER_REQUEST_TIMEOUT_MS` (60 s) | Truyền `timeoutMs: CARRIER_REQUEST_TIMEOUT_MS` khi gọi báo giá / đặt GHN / so phương án |
| Thu hồi vật tư khi kiểm hàng hoàn | `inspectReturn(id, { expected_version, lines, packaging })`, kiểu `InspectReturnPackagingInput`; đọc `ReturnRequest.packagingInspection` | Gửi `packaging: [{ material_code, quantity, grade: 'A'|'B'|'C', old_label_removed }]` |
| Lọc + phân trang nhóm đơn | `listOrderGroups({ assigned_staff_id, stock_shortage, is_overdue, before, limit })` | Trang sau: `before = createdAt` của dòng cuối |
| Thông tin liên kết tay / đơn đổi hàng | `OrderGroup.manualLink`, `origin`, `sourceReturnId` | Hiện nhãn "Đã liên kết" / "Đơn đổi hàng" |
| Giao thất bại có hẹn giờ; giao lại sớm có lý do | `failShipment(id, version, reason, note, rescheduleAt)`, `retryShipment(id, version, note, overrideReason)`; đọc `Shipment.nextAttemptNotBefore`, `isOverdue`, `trackingCode` | Trước `nextAttemptNotBefore` phải nhập lý do (3–300 ký tự) |
| Lọc sản phẩm theo trạng thái | `listProductMaster({ status: 'needs_measurement' | 'ready' })` | Lọc sản phẩm chưa đo kích thước |
| Mã ô trong bảng tồn | **BE** trả `binCode` ở `GET .../sku-bin-assignments` | Màn Kho (Admin) tự hiện mã ô — không cần sửa |
| Báo giá GHN nhanh hơn | **BE** hỏi GHN song song (≤ 4 kiện cùng lúc) | Không cần sửa |
| Đã nối từ nhánh Việt | `/colors`, `/master-skus`, `/product-master` (+ đồng bộ), `/stock-availability`, phiếu trả (tạo, nhận, kiểm, cách ly, đổi hàng), màn Tồn kho dùng dữ liệu thật | Nghiệm thu |

### ❌ FE cần làm (chưa làm)

**Ưu tiên 1 — đang lỗi, sửa trước demo**
1. Màn đóng gói gọi 7 route đã gỡ: `/order-groups/:id/packaging*` (5), `fulfillment/pack`, `lazada-pack/retry` → chuyển sang `/order-groups/:groupId/packing-plan/*` (Mục 1, Mục 5).
2. Màn Đơn hàng còn trộn đơn giả "demo đa sàn" Lazada + TikTok (`data/demo-multi-platform-orders.ts`) → bỏ (Mục 7b.4).

**Ưu tiên 2 — giao hàng / GHN / chứng từ (Mục 2)**
3. Báo giá, chọn hãng, đặt GHN, hủy, đồng bộ, nút giả lập trạng thái, sửa địa chỉ, giao chung chuyến, in nhãn / phiếu / bảng kê.
4. Thêm trạng thái vận đơn `awaiting_pickup`, `in_transit`, `cancelled` (kiểu + nhãn + tab) và bỏ chỗ tự gán `out_for_delivery` trong `shipments.api.ts` (Mục 7b.1, N6).
5. Kho "Nhận hàng hoàn" (`POST /shipments/:id/receive-return`).

**Ưu tiên 3 — thêm phần màn hình cho các hàm đã có sẵn ở trên**
6. Ô chọn hạng thu hồi vật tư khi kiểm hàng hoàn (Mục 3).
7. Ô "lý do giao sớm" ở nút giao lại; hiện giờ được giao lại và cờ quá hạn.
8. Nút "trang sau" + bộ lọc (thiếu hàng, quá hạn, của tôi) ở danh sách nhóm đơn; nhãn "Đã liên kết" / "Đơn đổi hàng".
9. Liên kết tay 2 nhóm (`POST/DELETE /order-groups/:id/link`, `GET .../linked`); giữ chỗ tồn (`/stock-reservation*`) (Mục 4).

**Ưu tiên 4 — màn còn thiếu / dữ liệu giả**
10. Danh mục thùng, túi, vật tư (`/packaging/boxes|bags|materials`) và quản lý vật tư (`/packaging-materials` mua, dùng nội bộ…) (Mục 7b.3).
11. Cài đặt đóng gói, báo cáo đóng gói (`/packing/settings`, `/packing/reports/*`, `/packing-plans/summary`).
12. Kết nối AURELLE + danh sách shop (`marketplace.api.ts` đang cố định `lazada`); nút "Đọc hết thông báo" (`PATCH /notifications/read-all`).
13. Thêm trạng thái nhóm đơn `canceled` và 14 loại thông báo mới (kiểu + nhãn + điều hướng) (Mục 7b.1).
14. Các màn đang dùng dữ liệu giả: Dashboard, Báo cáo, Quy tắc đóng gói, Mẫu đóng gói (Mục 7b.4).
15. Kho: gợi ý ô cất, sửa gán nhầm ô, sửa ô, xóa hẳn mục tạo nhầm; SKU nội bộ: sửa/xóa; Product Master: chi tiết + hồ sơ kích thước đóng gói.
16. Xóa mã chết: `types/packaging.ts`, `packagingConsumption`, `active_packaging_recommendation`, `lazadaPack*` (Mục 7b.2).

> Chi tiết từng việc (route, body, mã lỗi) ở các mục bên dưới. Làm xong việc nào thì tick ở Mục 8.

---

**Quy ước chung (áp cho mọi mục):**
- Mọi nút đổi trạng thái gửi `expected_version` = trường `version` đọc được lần gần nhất. Nhận `409 *_STATE_CONFLICT` / `*_VERSION_CONFLICT` → tải lại dữ liệu rồi cho bấm lại.
- Lỗi luôn có dạng `{ error_code, message, details }` — hiển thị `message`, rẽ nhánh theo `error_code` (không theo `message`).
- Header `Authorization: Bearer <access_token>`; 401 → gọi `POST /auth/refresh` rồi thử lại 1 lần.

---

## 1. ❌ Đang gãy — FE gọi route KHÔNG CÒN TỒN TẠI (sửa trước demo)

Route `/order-groups/:id/packaging*` và `/order-groups/:id/fulfillment/pack` đã bị **bỏ khi gộp `main` + `thi_dev` (04–05/10/2026)**, thay bằng kế hoạch đóng gói `packing-plan`. FE trên `main` vẫn gọi route cũ → 404.

| File FE | Hàm | Route cũ (404) | Thay bằng | Đọc ở đâu |
|---|---|---|---|---|
| `fe/src/api/packaging.api.ts` | `getPackagingRecommendation` | `GET /order-groups/:id/packaging` | `GET /order-groups/:groupId/packing-plan` | `INTEGRATION_GUIDE_PACKING.md` 2.1 |
| | `generatePackaging` | `POST .../packaging/generate` | **Không có API tạo** — backend tự tính khi nhóm sang `picked` (≤10 s, FE thăm dò). Lỗi → `POST .../packing-plan/recompute` | 0.3, 2.2 |
| | `approvePackaging` | `POST .../packaging/approve` | `POST .../packing-plan/approve` | 2.3 |
| | `adjustPackaging` | `POST .../packaging/adjust` | `POST .../packing-plan/parcels/:parcelNo/change-box` · `.../move-item` · `POST .../packing-plan/manual` | 2.4 |
| | `rejectPackaging` | `POST .../packaging/reject` | `POST .../packing-plan/reject` (sau đó `recompute` / `manual` / `back-to-picking`) | 2.5 |
| `fe/src/api/order-groups.api.ts` | `packOrderGroup` | `POST /order-groups/:id/fulfillment/pack` | Đóng gói theo kiện: `start` → `parcels/:no/scan` → `parcels/:no/seal` (kiện cuối niêm phong = nhóm `packed`), hoặc lối tắt `POST .../packing-plan/pack` | 3.2–3.4, 3.9 |
| | `postFulfillmentTransition('pack')` | `.../fulfillment/pack` | như trên | |

Màn bị ảnh hưởng: `components/packing/PackagingWorkbench.tsx`, `pages/AdminPackingPlansPage.tsx`, `pages/ShippingPage.tsx`.

Lưu ý thêm:
- `fulfillment/ship|deliver|return` vẫn chạy nhưng là **legacy — không dùng cho màn mới** (tạo vận đơn không có hãng/cước). Dùng `/shipments` (Mục 2).
- Response kế hoạch đóng gói không còn `lazadaPack` / `lazadaPackSync` (bỏ 10/10/2026) — trạng thái "đã đóng gói" chỉ ghi trong OptiPack.

---

## 2. 🆕 Giao hàng — báo giá, chọn hãng, GHN, chuyến, chứng từ (FE chưa gọi)

FE hiện chỉ gọi `GET/POST /shipments`, `/:id/deliver|fail|retry`, `/:id/events`, `/reason-codes` (bản G1 ngày 27/09). Cần thêm:

| Việc | API | Đọc ở đâu |
|---|---|---|
| Danh mục hãng (hãng mẫu + **GHN** `kind: "live"`) | `GET /shipping/carriers` | `INTEGRATION_GUIDE_SHIPPING.md` B.7.1, B.8 |
| **Báo giá** theo kiện cho 1 nhóm (dòng GHN có `isLive`, `unavailableReason`, `assumptions`) | `GET /shipping/quote/:groupId?province_name=&ward_name=&street=&phone=` | B.7.2 · `GHN_INTEGRATION_GUIDE.md` 11.3 Bước 1 |
| **So phương án đóng gói** (tổng thùng + vật tư + phí ship) | `GET /shipping/packaging-options/:groupId?carrier_code=&service_code=` | GHN 11.3 Bước 2 |
| Chiến lược đề xuất (Store Owner) | `GET/PUT /shipping/settings` | B.7.1 |
| **Bắt đầu giao có chọn hãng** — đổi `startShipment` gửi thêm `carrier_code`, `service_code`, `pickup_at?`, `to_location?` | `POST /shipments` | B.7.3 · GHN 11.3 Bước 3 |
| Giao chung chuyến (cùng người nhận / đã liên kết tay) | `POST /shipments/batch` | B.7.4 |
| Lịch lấy hàng | `PATCH /shipments/:id/pickup` | B.7.5 |
| Vận đơn của 1 nhóm | `GET /shipments/group/:groupId` | F.1 |
| In phiếu đóng gói / nhãn / bảng kê (PDF — `fetch` kèm token → `blob:` URL) | `GET /documents/packing-slip/:groupId` · `/shipping-label/:groupId` · `/manifest/:tripCode` | B.7.6 |
| **GHN:** tạo lại ở hãng · sửa địa chỉ · link nhãn A5 · huỷ · đồng bộ | `POST /shipments/:id/carrier/book` · `PATCH /shipments/:id/to-location` · `GET /shipments/:id/carrier/label` · `POST /shipments/:id/carrier/cancel` · `POST /shipments/:id/carrier/sync` | GHN 11.3 |
| **GHN demo:** nút "Mô phỏng GHN: …" + dropdown | `POST /shipments/:id/carrier/simulate { status, reason_code?, reason? }` · `GET /shipments/carrier/statuses` | GHN 11.3 Bước 5 |

**Thay đổi bắt buộc trên màn vận đơn hiện có:**
1. Type `Shipment` thêm field (response `/shipments*`): `tripCode`, `trackingCode`, `carrierCode/Name`, `serviceCode/Name`, `parcelCount`, `chargeableWeightG`, `estimatedCostVnd`, `isSampleRate`, `etaFrom/To`, `pickupAt`, và từ 14/10: `carrierManaged`, `carrierStatus`, `carrierStatusLabel`, `carrierParcels[]`, `carrierBookingError`, `carrierIncident`, `toLocation`, `bookingRound`, `pickedUpAt`, `carrierReturnedAt`, `cancelledAt`.
2. Enum trạng thái vận đơn thêm 3 giá trị — nhãn gợi ý:

   | Giá trị | Nhãn | Ghi chú |
   |---|---|---|
   | `awaiting_pickup` | Chờ hãng lấy hàng | chỉ vận đơn GHN |
   | `in_transit` | Đang trung chuyển | chỉ vận đơn GHN |
   | `out_for_delivery` | Đang giao | |
   | `delivery_failed` | Giao thất bại | |
   | `returning_to_warehouse` | Đang hoàn về kho | |
   | `delivered` | Đã giao | kết thúc |
   | `returned_to_warehouse` | Đã hoàn về kho | kết thúc |
   | `cancelled` | Đã huỷ ở hãng | kết thúc — nhóm đơn về `packed`, tạo lại được |
3. Khi `carrierManaged === true`: **ẩn** nút "Giao thành công / Giao thất bại / Giao lại" (BE trả `409 SHP_MANAGED_BY_CARRIER`), hiện nhóm nút GHN (nhãn, huỷ, đồng bộ, mô phỏng). Nút "Nhận hàng hoàn" (kho) **giữ nguyên**.
4. Lịch sử `GET /shipments/:id/events` thêm `source` (`carrier_webhook` / `carrier_simulated` / `carrier_sync` / `manual`) và `carrierStatus` — hiện biểu tượng nguồn.
5. Cờ đỏ trên danh sách khi `carrierBookingError` hoặc `carrierIncident` khác null.

---

## 3. 🆕 Hoàn hàng — nhận kiện, kiểm hàng, thu hồi vật tư (FE mới có list/approve/reject)

| Việc | API | Role | Đọc ở đâu |
|---|---|---|---|
| Kho nhận kiện hoàn (tự tạo phiếu hoàn) | `POST /shipments/:id/receive-return` | Warehouse, Admin | `INTEGRATION_GUIDE_SHIPPING.md` B.3, C.4 |
| Tạo yêu cầu trả hàng (Admin đóng vai khách) | `POST /returns` | Admin | C.2 |
| Huỷ phiếu đã duyệt mà hàng không về | `POST /returns/:id/cancel` | Store Owner, Admin | F.1 |
| Kho nhận hàng trả theo phiếu | `POST /returns/:id/receive` | Warehouse, Admin | C.4 |
| **Kiểm hàng** — `lines[]` (restock/quarantine/discard + ô) và `packaging[]` (thùng/vật tư: hạng A + `old_label_removed: true` → kho tái sử dụng; B → nội bộ; C → bỏ) | `POST /returns/:id/inspect` | Warehouse, Admin | C.5 · `INTEGRATION_GUIDE_PACKAGING_MATERIALS.md` |
| Hàng cách ly chờ xử lý | `GET /returns/quarantine` · `POST /returns/:id/quarantine/:lineIndex/resolve` | Warehouse, Admin | `INTEGRATION_GUIDE_OPERATIONS_UTILITIES.md` |
| Đổi hàng — tạo lại đơn thay thế khi lỗi | `POST /returns/:id/create-replacement` | | C, Operations |
| Lý do trả hàng (dropdown) | `GET /returns/reason-codes` | | F.1 |

---

## 4. 🆕 Gom đơn, liên kết tay, giữ chỗ tồn

| Việc | API | Đọc ở đâu |
|---|---|---|
| Nhóm cùng người nhận (tự động + liên kết tay) | `GET /order-groups/:id/linked` | `INTEGRATION_GUIDE_SHIPPING.md` B.6 |
| Liên kết / bỏ liên kết tay (đơn Lazada bị che + đơn AURELLE) | `POST /order-groups/:id/link { target_group_id, note? }` · `DELETE /order-groups/:id/link` | B.6.2 |
| Response nhóm đơn thêm `manualLink`, `linkedGroupCount`, `activeOrderCount`, `canceledOrderCount` | — | B.6.2, `INTEGRATION_GUIDE_FULFILLMENT.md` |
| Tình trạng đủ hàng / giữ chỗ | `GET /stock-availability` · `GET /order-groups/:id/stock-reservation` · `.../recheck` · `.../release` | `INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md` |

---

## 5. Đóng gói — màn mới cần có (ngoài Mục 1)

Hàng chờ (`GET /packing-plans/summary?group_ids=`), giao người đóng (`.../assign`, `GET /packing/staff`), quét/niêm phong/xem lại kiện lệch cân, báo sự cố (`report-issue`), hoàn tác niêm phong (`unseal`), tháo kiện đơn huỷ (`unpack`), đổi thùng khi đang đóng (`change-box-in-session`), hướng dẫn AI (`parcels/:no/guide`), cài đặt (`GET/PUT /packing/settings`), báo cáo (`/packing/reports/*`). Danh mục: `GET /packaging/boxes|bags|materials`. Chi tiết: `INTEGRATION_GUIDE_PACKING.md` mục 1–6.

---

## 6. Kho, SKU nội bộ, Product Master (FE chưa gọi)

`/master-skus/*` (19 route: tạo/đổi SKU nội bộ, nối SKU sàn, gộp tồn), `/colors`, `/product-master/*` (sync catalog `POST /product-master/sync`, hồ sơ đóng gói `PUT /product-master/:id/packaging-profile`). Chi tiết: `INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md`, `INTEGRATION_GUIDE_WAREHOUSE.md`. Kho (`/warehouse/*`) FE đã dùng 26/34 route — còn thiếu các route xoá hẳn (`.../permanent`) và chuyển gán ô (B7 của guide kho).

---

## 7. Kết nối sàn & đơn

| Việc | API | Ghi chú |
|---|---|---|
| Danh sách shop đã kết nối (hiện `isActive`, hạn token) | `GET /marketplace/:platform/shops` | FE chưa gọi |
| Kết nối | `GET /marketplace/lazada/connect` → mở `authUrl` | `state` dùng 1 lần, sống 10 phút — bấm lại phải gọi lại API |
| Sync đơn | `POST /orders/:platform/sync?shop_id=` | `lazada/sync` vẫn chạy (alias). Admin-only |

---

## 7b. 🔎 Bổ sung sau rà soát kỹ (14/10 tối) — kiểu dữ liệu FE lệch BE và route chưa có màn

> Cách rà: trích **84 lời gọi API** trong `fe/src` (mọi `apiRequest`/`fetch`) so khớp method + path với 239 route BE; đọc thêm các file `fe/src/types/*` có danh sách trạng thái cố định. Kết quả: ngoài Mục 1, **không còn route nào FE gọi mà BE không có**; body của các nút giao hàng cũ (`deliver`/`fail`/`retry`) vẫn khớp DTO. Các thiếu sót dưới đây chưa có trong Mục 1–7.

### 7b.1. Danh sách trạng thái cố định trong FE đã cũ (gây hiện sai nhãn/lọc sai tab)

| File FE | Đang có | Phải thêm | Hậu quả nếu không sửa |
|---|---|---|---|
| `fe/src/types/shipments.ts` → `SHIPMENT_STATUSES` | 5 trạng thái G1 | `awaiting_pickup` (Chờ hãng lấy hàng), `in_transit` (Đang trung chuyển), `cancelled` (Đã huỷ ở hãng) | Vận đơn GHN không có nhãn, không vào tab nào trên `ShippingPage.tsx`; `shipments.api.ts` dòng 60 mặc định rơi về `out_for_delivery` khi thiếu → hiện sai trạng thái |
| `fe/src/types/order-groups.ts` → `GROUP_FULFILLMENT_STATUSES` | 10 trạng thái | `canceled` (nhóm bị huỷ do mọi đơn huỷ) | Nhóm huỷ hiện trống nhãn, lọt vào danh sách việc |
| `fe/src/types/order-groups.ts` dòng ~199 | Câu giải thích luồng "duyệt kế hoạch Packaging → Warehouse pack" | Viết lại theo packing plan: duyệt → bắt đầu → quét → niêm phong | Hướng dẫn sai cho người dùng |
| `fe/src/types/notifications.ts` → `NOTIFICATION_TYPES` | 10 loại | `low_box_stock`, `low_material_stock`, `group_auto_canceled`, `packaging_plan_invalidated`, `delivery_failed`, `delivery_returning`, `delivery_overdue`, `return_requested`, `stock_shortage`, `packing_assigned`, `packing_parcel_held`, `packing_issue`, `unpack_required`, `return_to_shelf` (BE có 24 loại) | Thông báo mới hiện mã thô, không có nhãn/icon; `lib/notification-nav.ts` không biết điều hướng tới đâu (gợi ý: `delivery_*` → màn Vận chuyển, `return_*` → Hoàn hàng, `packing_*`/`unpack_required` → Đóng gói, `low_*_stock` → Vật tư) |

### 7b.2. Mã chết cần xoá cùng lúc sửa Mục 1

- `fe/src/types/packaging.ts`, `mapPackagingConsumption` và trường `packagingConsumption` trong `types/order-groups.ts` (dữ liệu của `fulfillment/pack` cũ).
- `order-groups.api.ts` dòng ~97 đọc `active_packaging_recommendation` — BE đã xoá trường này (luôn `undefined`). Thay bằng `GET /order-groups/:groupId/packing-plan` hoặc `GET /packing-plans/summary` cho danh sách.
- `postFulfillmentTransition` có `action: 'pack'` trong kiểu union → bỏ `'pack'` (chỉ còn `pick`; `ship`/`deliver`/`return` là route cũ, nên chuyển sang `/shipments/*`).

### 7b.3. Route BE đã có nhưng FE chưa có màn (chưa nêu ở Mục 2–7)

| Nhóm | Route | Ai dùng | Ghi chú |
|---|---|---|---|
| Kết nối sàn AURELLE | `GET /marketplace/aurelle/connect`, `GET /marketplace/:platform/shops` | Admin | `marketplace.api.ts` đang **cố định `lazada`** → không kết nối được AURELLE từ FE; cần tham số `platform` + danh sách shop đã kết nối (hiện FE chỉ nhớ shopId trong trình duyệt) |
| Thông báo | `PATCH /notifications/read-all` | Mọi vai trò | Nút "Đánh dấu đã đọc hết" |
| Danh mục túi / vật tư chèn | `GET/POST/PATCH /packaging/bags`, `POST /packaging/bags/:id/stock-in`, `GET/POST/PATCH /packaging/materials`, `.../:id/stock-in`, `.../:id/movements`, `GET/PUT /packaging/materials/rules` | Admin, Warehouse | Engine đóng gói chọn từ các danh mục này; không có màn thì phải nhập qua Swagger |
| Vật tư (kho mới/tái dùng) | `GET /packaging-materials`, `/movements`, `POST/PATCH/DELETE /packaging-materials/:code`, `/reactivate`, `/purchase`, `/internal-use` | Admin, Warehouse | FE hiện chỉ gọi `/savings` |
| Kho | `GET /warehouse/warehouses/:warehouseId/bin-suggestions` (gợi ý ô cất), `PATCH .../sku-bin-assignments/:assignmentId` (sửa gán nhầm ô), `PATCH /warehouse/bin-locations/:binId`, `GET /warehouse/warehouses/:warehouseId`, các route `.../permanent` (xoá hẳn mục tạo nhầm) | Admin, Warehouse | Xem `INTEGRATION_GUIDE_WAREHOUSE.md` |
| Hãng vận chuyển (cấu hình) | `POST /shipping/carriers`, `PATCH /shipping/carriers/:id` | Admin | Bảng cước hãng mẫu; GHN thì seed bằng script |
| Vận đơn quá hạn | `POST /shipments/overdue-scan`, lọc `GET /shipments?overdue=true` | Admin, Coordinator | Cron 15 phút đã tự chạy; nút chỉ để demo |
| Danh mục | `GET /categories/:code` | Admin | Tuỳ chọn |
| Đăng nhập Google | `GET /auth/google` (+ callback) | Mọi vai trò | Tuỳ chọn; BE trả token qua query string của `CLIENT_REDIRECT_CALLBACK` |

> Không cần làm ở FE quản trị: `/storefront/*`, `/customer-auth/*` (app `storefront/` đã gọi đủ), `POST /carriers/ghn/webhook`, `POST /marketplace/webhooks/:platform`, `GET /marketplace/:platform/callback` (do sàn/hãng gọi).

### 7b.4. Dữ liệu gửi lên đã khớp; còn các màn đang dùng dữ liệu giả dù BE đã có API

Đã so **dữ liệu gửi lên** (body của 43 lời gọi POST/PATCH/PUT, kể cả kiểu `*Input` của màn Kho/Danh mục/User) và **tham số lọc** (query của các màn danh sách) với DTO của BE (BE bật `forbidNonWhitelisted`, gửi thừa trường là bị 400). Kết quả: **không có chỗ nào gửi thừa hay thiếu trường bắt buộc**; vai trò (`UserRole` 0–4) khớp BE.

Những màn còn đọc dữ liệu giả trong `fe/src/data/*-mock.ts` dù BE đã có API:

| Màn / file | Dữ liệu giả | API BE thay thế | Mức sửa |
|---|---|---|---|
| Đơn hàng (`OrdersPage`, `AdminOrdersPage` → `MarketplaceOrdersScreen.tsx`, `MarketplaceOrdersView.tsx`) | **Trộn đơn "demo đa sàn" Lazada + TikTok giả** (`data/demo-multi-platform-orders.ts`) vào danh sách đơn thật, kèm dòng chú thích "DEMO FE" | `GET /orders` (đã gọi) — đơn AURELLE thật + liên kết tay nhóm (`POST /order-groups/:id/link`) thay cho demo đa sàn | Nhỏ: bỏ phần trộn + chú thích. **Nên sửa trước demo** (TikTok đã bỏ khỏi phạm vi) |
| Tồn kho (`/app/inventory`, `WarehouseInventoryPage.tsx`) | Toàn bộ danh sách tồn giả, lưu `localStorage` | `GET /warehouse/warehouses/:id/sku-bin-assignments`, `GET /stock-availability` | Vừa |
| Quy tắc đóng gói (`/app/packaging-rules`, `PackagingRulesPage.tsx`) | Danh sách thùng giả `initialCartons` | `GET /packaging/boxes`, `GET/PUT /packaging/materials/rules`, `GET/PUT /packing/settings` | Vừa |
| Mẫu đóng gói (Admin `templates`, `usePackagingTemplates.ts`) | `admin-mock` | `/packaging/boxes`, `/packaging/bags` | Vừa |
| Bảng điều khiển (`DashboardPage.tsx`), Báo cáo (`AnalyticsReportPage.tsx`) | Số liệu giả | `GET /packing/reports/summary`, `GET /packing-plans/summary`, `GET /packaging-materials/savings` | Vừa |
| Màn Vận chuyển (`ShippingPage.tsx`) | Hằng số `OWN_FLEET_ACCOUNT` (đội giao riêng) | Hãng thật từ `GET /shipping/carriers` | Nhỏ (cùng việc Mục 2) |
| `PackingDashboard.tsx`, `ConsolidationPage.tsx`, `IntegrationsPage.tsx`, `SyncEventLog.tsx`, `BatchDetailDrawer.tsx`, `useWarehouseFloor.ts` | Dữ liệu giả | Màn cũ, kiểm tra còn được dùng trên menu không; không dùng thì xoá | Tuỳ |


---

### 7b.5. Rà sâu 14/10 (21h) — các route FE ĐÃ gọi nhưng nối chưa đủ + tầng kết nối chung

> ✅ **14/10 (22h) đã sửa (AOFP-86/87, chỉ tầng API + BE, không đụng màn hình):** K1 (`PUT`), K2 (`apiRequestBlob` + hằng `CARRIER_REQUEST_TIMEOUT_MS = 60_000`), K3 phía BE (báo giá / so phương án hỏi GHN song song, tối đa 4 lượt cùng lúc), N1 (kiểu `InspectReturnPackagingInput`, tham số `packaging` của `inspectReturn`, đọc `packagingInspection`), N2 (`listOrderGroups` nhận `assigned_staff_id`, `stock_shortage`, `is_overdue`, `before`, `limit`), N3 (đọc `manualLink`, `origin`, `sourceReturnId`), N4 phía BE (`binCode` trong `GET .../sku-bin-assignments`), N5 (`failShipment(..., rescheduleAt)`, `retryShipment(..., overrideReason)`, đọc `nextAttemptNotBefore`, `isOverdue`, `trackingCode`), N7 (`listProductMaster({ status })`). **FE còn phải làm phần màn hình:** ô chọn hạng thu hồi vật tư khi kiểm hàng, ô "lý do giao sớm" ở nút giao lại, nút "trang sau"/bộ lọc nhóm đơn, nhãn "Đã liên kết"/"Đơn đổi hàng". **Chưa sửa:** N6 (tự gán `out_for_delivery`) — để làm cùng tab GHN ở màn Vận chuyển.

**Tầng kết nối chung (`fe/src/lib/api.ts`)** — đã đúng: `VITE_API_URL` (mặc định `http://localhost:3000`), CORS BE mặc định cho `http://localhost:5173`, header Bearer, tự `POST /auth/refresh` khi 401 (chống gọi trùng), đọc đúng `{ error_code, message, details }`, xử lý 429, luồng MFA/thiết bị tin cậy/bắt đổi mật khẩu, redirect Google và kết nối sàn. Còn thiếu:

| # | Thiếu | Hậu quả | Sửa (không đụng màn hình) |
|---|---|---|---|
| K1 | `RequestOptions.method` không có `'PUT'` | Không gọi được `PUT /packing/settings`, `/shipping/settings`, `/packaging/materials/rules`, `/product-master/:id/packaging-profile` | Thêm `'PUT'` vào kiểu |
| K2 | `apiRequest` luôn đọc JSON | Không tải được PDF `/documents/*` (phiếu đóng gói, nhãn, bảng kê) | Thêm hàm `apiRequestBlob()` trả `Blob` + tạo `blob:` URL |
| K3 | Hết giờ mặc định 12 giây | Báo giá GHN / đặt GHN / so phương án gọi GHN **tuần tự từng kiện** (mỗi lần tới 10 s) → nhóm nhiều kiện dễ quá 12 s, FE báo "Máy chủ không phản hồi" dù BE vẫn chạy | Gọi các route này với `timeoutMs: 60_000`; phía BE nên gọi GHN song song (`Promise.all`) |
| K4 | 108/206 mã lỗi BE chưa có câu tiếng Việt riêng trong FE (nhóm `PKG_*`, `SHIP_*`, `DOC_*`, `PM_*`, `SF_*`, một phần `SHP_*`, `ORD_*`, `WH_*`) | Không gãy — FE rơi về `message` của BE (đã là tiếng Việt) | Tuỳ chọn |

**Route FE đã gọi nhưng chưa dùng hết những gì BE hỗ trợ** (ngoài phần GHN/đóng gói mới):

| # | Route | Đang thiếu | Hậu quả |
|---|---|---|---|
| N1 | `POST /returns/:id/inspect` | Không gửi `packaging[]` (thu hồi thùng/vật tư hạng A/B/C); không đọc `packagingInspection` | **Không demo được thu hồi vật tư từ hàng hoàn** (G4) trên FE |
| N2 | `GET /order-groups` | Không gửi `limit`/`before` (chỉ lấy 100 nhóm đầu), không dùng lọc `is_overdue`, `stock_shortage`, `assigned_staff_id` | Quá 100 nhóm thì phần sau không hiện; không lọc được nhóm quá hạn/thiếu hàng/của tôi |
| N3 | Dữ liệu nhóm đơn | Không đọc `manualLink`, `origin`, `sourceReturnId` | Không biết nhóm nào đang liên kết tay, nhóm nào là đơn đổi hàng (`EXC-…`) |
| N4 | `GET .../sku-bin-assignments` | BE không trả `binCode` | Bảng tồn ở màn Kho (Admin) hiện 8 ký tự cuối id ô thay vì mã ô → **sửa phía BE** |
| N5 | `POST /shipments/:id/fail`, `/retry` (G1) | Không gửi `reschedule_at`, `override_reason`; không đọc `nextAttemptNotBefore`, `isOverdue` | Bấm giao lại trước khoảng chờ → lỗi mà không có ô nhập lý do giao sớm; không hiện cờ quá hạn |
| N6 | Dữ liệu vận đơn | Gặp trạng thái lạ tự gán `out_for_delivery` | Vận đơn GHN `awaiting_pickup` hiện sai thành "Đang giao" |
| N7 | `GET /product-master` | Không lọc `status` | Nhỏ |

---

## 8. Checklist nghiệm thu FE

- [ ] Màn đóng gói không còn gọi `/packaging*`, `/fulfillment/pack` (tìm trong `fe/src` ra 0 kết quả)
- [ ] Báo giá hiện cả hãng mẫu và GHN; dòng lỗi bị làm mờ, có ô sửa địa chỉ; `assumptions` hiện cảnh báo
- [ ] Tạo vận đơn GHN → "Chờ hãng lấy hàng", có mã GHN từng kiện, in được nhãn
- [ ] Vận đơn GHN không hiện nút giao kiểu cũ; nút "Mô phỏng GHN" chạy đủ: lấy hàng → đang giao → đã giao
- [ ] Giao thất bại → hoàn → kho "Nhận hàng hoàn" → phiếu hoàn → kiểm hàng có thu hồi thùng hạng A
- [ ] Huỷ ở hãng → vận đơn "Đã huỷ ở hãng", nhóm đơn quay về "Đã đóng gói", tạo lại được
- [ ] Liên kết tay 2 nhóm → giao chung chuyến → in bảng kê chuyến
- [ ] Mọi nút xử lý 409 version conflict bằng tải lại
- [ ] `SHIPMENT_STATUSES`, `GROUP_FULFILLMENT_STATUSES`, `NOTIFICATION_TYPES` khớp BE (Mục 7b.1)
- [ ] Kết nối được shop AURELLE từ FE; có nút "Đọc hết thông báo"

