# FE — Danh sách việc cần chỉnh để khớp Backend mới nhất

> Phiên bản 1.0 — 14/10/2026. Đối chiếu tự động: mọi đường dẫn API xuất hiện trong `fe/src` (nhánh `main`) so với 239 route của BE hiện tại (gồm C4–C6 GHN).
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

## 8. Checklist nghiệm thu FE

- [ ] Màn đóng gói không còn gọi `/packaging*`, `/fulfillment/pack` (tìm trong `fe/src` ra 0 kết quả)
- [ ] Báo giá hiện cả hãng mẫu và GHN; dòng lỗi bị làm mờ, có ô sửa địa chỉ; `assumptions` hiện cảnh báo
- [ ] Tạo vận đơn GHN → "Chờ hãng lấy hàng", có mã GHN từng kiện, in được nhãn
- [ ] Vận đơn GHN không hiện nút giao kiểu cũ; nút "Mô phỏng GHN" chạy đủ: lấy hàng → đang giao → đã giao
- [ ] Giao thất bại → hoàn → kho "Nhận hàng hoàn" → phiếu hoàn → kiểm hàng có thu hồi thùng hạng A
- [ ] Huỷ ở hãng → vận đơn "Đã huỷ ở hãng", nhóm đơn quay về "Đã đóng gói", tạo lại được
- [ ] Liên kết tay 2 nhóm → giao chung chuyến → in bảng kê chuyến
- [ ] Mọi nút xử lý 409 version conflict bằng tải lại
