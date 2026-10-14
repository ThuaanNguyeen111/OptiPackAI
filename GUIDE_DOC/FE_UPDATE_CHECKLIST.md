# FE — Danh sách việc cần chỉnh để khớp Backend mới nhất

> Phiên bản 1.1 — 14/10/2026 (tối: thêm Mục 7b sau rà soát kỹ từng lời gọi API và kiểu dữ liệu FE). Đối chiếu tự động: mọi đường dẫn API xuất hiện trong `fe/src` (nhánh `main`) so với 239 route của BE hiện tại (gồm C4–C6 GHN).
> Tài liệu này là **bản tổng hợp việc phải làm**; request/response chi tiết nằm ở guide của từng phần (cột "Đọc ở đâu").
> Thứ tự đọc đề xuất: Mục 1 (đang gãy) → Mục 2 (giao hàng/GHN) → Mục 3 (hoàn hàng) → các mục còn lại.

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

