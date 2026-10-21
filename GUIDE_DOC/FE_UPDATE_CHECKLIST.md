# FE — Danh sách việc cần chỉnh để khớp Backend mới nhất

> 🆕 **21/10/2026 — xem mục 12:** (1) màn đóng gói báo trước lấy thùng ở **kệ mới hay kệ tái sử dụng**, cho chọn **"Dùng thùng mới thay"** kèm lý do; (2) cài đặt **người gửi** in trên nhãn vận đơn; (3) nút **in tem ô kệ, tem SKU, danh sách lấy hàng, phiếu nhập kho**. BE đã xong, FE chưa làm; không có gì hỏng nếu chưa làm.

> **18/10/2026 — Quay lại sau khi chấp nhận đóng gói:** xem [Packing, mục 2.3.1](INTEGRATION_GUIDE_PACKING.md#231-quay-lại-chờ-chấp-nhận).

- Thêm nút **Quay lại chờ chấp nhận** cho Packaging Staff/Admin, gọi `POST /order-groups/:groupId/packing-plan/undo-approve` với `{ expected_version: plan.version }`; nhận `{ plan }` rồi tải lại nhóm.
- Báo rõ **lượt quét sẽ bị xóa**. Thành công: kế hoạch `ready`, nhóm `pending_approval`, giữ người được giao và phương án; lần nhận đóng tiếp theo phải quét lại, không có màn Approved trung gian.
- Chỉ dùng trước khi từng niêm phong; đã mở niêm phong lại vẫn bị chặn. Xử lý `409 PACKING_UNDO_APPROVE_NOT_ALLOWED`; xung đột version thì tải lại. Không nhầm với `back-to-picking` (trả về kho lấy hàng).
- Type `activity.kind` thêm `undo_approve`. FE chưa được sửa trong thay đổi BE này.

> **18/10/2026 — trạng thái đơn khi trả đủ hàng:** xem [Shipping & Returns, C.0](INTEGRATION_GUIDE_SHIPPING.md).

- Thêm `returning` vào type/bộ lọc/nhãn `fulfillmentStatus`: **Đang hoàn** khi Admin tạo phiếu; **Đã hoàn hàng** (`returned`) sau Store duyệt; **Đã hủy** (`canceled`) sau kho kiểm và xử lý tồn xong.
- Sau thao tác phiếu, tải lại nhóm bằng `orderGroupId`. Nhãn tiến độ đơn lấy từ nhóm, giữ tiến độ phiếu riêng; vận đơn giao đi có thể vẫn `delivered`.
- Kho nhận kiện chưa hủy nhóm. Trả một phần giữ `delivered`; BE tự cộng dồn phiếu đã xử lý để xét trả đủ. Từ chối/hủy phiếu trước nhận hàng khôi phục nhóm `delivered`.
- `canceled` của phiếu là khách không gửi hàng; `canceled` của nhóm trong luồng mới là đã xử lý hoàn xong. API/body phiếu giữ nguyên; không thêm màn hoặc bước xác nhận.

> **18/10/2026 — Đóng gói gọn trong một luồng.** Request/response và lỗi: [hướng dẫn Packing](INTEGRATION_GUIDE_PACKING.md#23-chấp-nhận--đóng-gói).

- Bỏ màn/bước **Chốt kế hoạch** ở Admin; BE tự tính và tự gán người ít việc sau khi kho lấy xong. Admin có thể gán lại bằng API hiện có.
- Danh sách nhân viên: `GET /order-groups?assigned_packer_id=<userId>` (kết hợp trạng thái/phân trang), rồi lấy summary như cũ. Làm mới khi mở trang/nhận thông báo và mỗi 10 giây.
- Nút **Chấp nhận & đóng gói** gọi `/packing-plan/approve` một lần, nhận `packing` và mở ngay quét/cân/niêm phong với 3D bên cạnh.
- Bỏ màn Approved trung gian, nút **Bắt đầu đóng** và khối gán người trên màn nhân viên. Dữ liệu `approved` cũ có thể tự gọi `/start` khi mở.

> 🆕 **15/10/2026:** thêm 2 việc mới ở **mục 11**: nhập kho theo lô + lấy hàng lô cũ nhất trước; màn Admin cấu hình tiêu chí đồng bộ & gom đơn.

> **Phiên bản 2.0 — 14/10/2026 (22h30).** Viết lại sau khi đối chiếu **code FE hiện tại trên `main`** (đã gộp `feature/viet_ui` + vá tầng API AOFP-87) với **239 route BE** (gồm GHN C4–C6). Cách rà: trích mọi lời gọi `apiRequest` / `apiRequestBlob` / `fetch` trong `fe/src`, so method + đường dẫn với route BE; so dữ liệu gửi lên với DTO; so dữ liệu FE đọc với response BE; đọc các file `fe/src/types/*` và `fe/src/data/*-mock.ts`.
> Bỏ qua route do bên ngoài gọi (webhook GHN/AURELLE, callback OAuth) và route của app `storefront/` (app đó đã gọi đủ).
> Request/response chi tiết từng route: xem guide ở cột "Đọc ở đâu".

**Quy ước chung:**
- Mọi nút đổi trạng thái gửi `expected_version` = trường `version` đọc lần gần nhất. Nhận `409 *_STATE_CONFLICT` / `*_VERSION_CONFLICT` → tải lại rồi cho bấm lại.
- Lỗi luôn có dạng `{ error_code, message, details }` — hiện `message`, rẽ nhánh theo `error_code`.
- `fe/src/lib/api.ts` đã tự gắn token, tự `POST /auth/refresh` khi 401, xử lý 429.

---

## 0. Tóm tắt

### Mức độ nối theo module (route FE đã gọi / route BE có)

| Module | Đã nối | Ghi chú |
|---|---|---|
| Đăng nhập, MFA, mật khẩu (`/auth`) | 8/10 | Thiếu đăng nhập Google (tuỳ chọn) |
| Người dùng (`/users`) | 9/9 | ✅ |
| Thông báo (`/notifications`) | 3/4 | Thiếu "đọc hết" |
| Đơn hàng (`/orders`) | 4/4 | ✅ |
| Nhóm đơn + lấy hàng (`/order-groups`) | 14/14 | ✅ (trừ liên kết tay, giữ chỗ, packing plan — dòng dưới) |
| Liên kết tay + giữ chỗ tồn | **0/6** | ❌ Mục 4 |
| **Kế hoạch đóng gói (packing plan)** | **0/21** | ❌ Mục 1 — **màn đóng gói đang lỗi** |
| Cài đặt + báo cáo đóng gói (`/packing`, `/packing-plans`) | 0/6 | ❌ Mục 5 |
| Danh mục thùng/túi/vật tư (`/packaging/*`) | 0/16 | ❌ Mục 5 |
| Vật tư mới/tái dùng (`/packaging-materials`) | 3/10 | Mới xem danh sách, chi tiết, tiết kiệm |
| Kho, khu, ô, tồn theo ô (`/warehouse`) | 25/34 | Mục 6 |
| Danh mục (`/categories`) | 5/6 | ✅ |
| Màu (`/colors`) | 5/5 | ✅ |
| SKU nội bộ (`/master-skus`) | 12/14 | Mục 6 |
| Product Master (`/product-master`) | 2/4 | Mục 6 |
| Tồn khả dụng (`/stock-availability`) | 1/1 | ✅ |
| Phiếu trả (`/returns`) | 11/12 | Mục 3 |
| Vận đơn (`/shipments`) | 8/20 | ❌ Mục 2 (phần GHN) |
| Hãng, báo giá (`/shipping`) | 0/7 | ❌ Mục 2 |
| Chứng từ PDF (`/documents`) | 0/3 | ❌ Mục 2 |
| Kết nối sàn (`/marketplace`) | 1/2 | Mục 7 |

### ✅ Đã sửa sẵn ở tầng API (AOFP-86/87 — không đụng màn hình, FE chỉ việc dùng)

| Đã sửa | Ở đâu | FE dùng thế nào |
|---|---|---|
| Gọi được `PUT` | `lib/api.ts` | `apiRequest(path, { method: 'PUT', body, auth: true })` |
| Tải PDF | `lib/api.ts` → `apiRequestBlob(path)` | `URL.createObjectURL(await apiRequestBlob('/documents/shipping-label/' + groupId))` |
| Chờ lâu hơn cho route gọi GHN | `lib/api.ts` → `CARRIER_REQUEST_TIMEOUT_MS` (60 s) | Truyền `timeoutMs` khi báo giá / đặt GHN / so phương án |
| Thu hồi vật tư khi kiểm hàng | `inspectReturn(id, { expected_version, lines, packaging })`; đọc `ReturnRequest.packagingInspection` | Thêm ô chọn hạng trên màn (Mục 3) |
| Lọc + phân trang nhóm đơn | `listOrderGroups({ assigned_staff_id, stock_shortage, is_overdue, before, limit })` | Thêm nút "trang sau"/bộ lọc |
| Liên kết tay / đơn đổi hàng | `OrderGroup.manualLink`, `origin`, `sourceReturnId` | Hiện nhãn |
| Hẹn giờ giao lại, lý do giao sớm | `failShipment(…, rescheduleAt)`, `retryShipment(…, overrideReason)`; đọc `nextAttemptNotBefore`, `isOverdue`, `trackingCode` | Thêm ô nhập |
| Lọc sản phẩm theo trạng thái | `listProductMaster({ status: 'needs_measurement' \| 'ready' })` | Thêm bộ lọc |
| Mã ô trong bảng tồn | **BE** trả `binCode` ở `GET .../sku-bin-assignments` | Màn Kho tự hiện đúng — không cần sửa |
| Báo giá GHN nhanh hơn | **BE** hỏi GHN song song (≤ 4 kiện cùng lúc) | Không cần sửa |

### ❌ FE cần làm — theo thứ tự ưu tiên

| # | Việc | Mục | Ước lượng |
|---|---|---|---|
| 1 | **Màn đóng gói gọi 7 route đã gỡ → lỗi 404** | 1 | Cách nhanh (giữ giao diện, đổi API, đóng nhanh): ~1 ngày |
| 2 | **Màn Đơn hàng trộn đơn giả "demo đa sàn" Lazada + TikTok** | 8 | Vài giờ (chủ yếu xoá) |
| 3 | Giao hàng GHN: báo giá, chọn hãng, đặt GHN, nút giả lập, in chứng từ, trạng thái mới | 2 | 1–2 ngày |
| 4 | Liên kết tay 2 nhóm + giữ chỗ tồn | 4 | ~nửa ngày |
| 5 | Thu hồi vật tư khi kiểm hàng; hủy phiếu trả; nhận kiện hoàn theo vận đơn | 3 | Vài giờ |
| 6 | Trạng thái + nhãn còn thiếu (vận đơn, nhóm đơn, thông báo) | 7 | Vài giờ |
| 7 | Danh mục thùng/túi/vật tư; cài đặt + báo cáo đóng gói | 5 | 1 ngày |
| 8 | Kho, SKU nội bộ, Product Master: các route còn thiếu | 6 | Vài giờ |
| 9 | Kết nối AURELLE + danh sách shop; "đọc hết thông báo" | 7 | Vài giờ |
| 10 | Màn dùng dữ liệu giả, mã chết | 8 | Tuỳ |
| 11 | 🆕 Phiếu nhập theo lô + tồn theo lô + `oldest_lot` trên Picking List; màn cấu hình đồng bộ & gom đơn | 11 | ~1 ngày |
| 12 | 🆕 21/10: nguồn thùng mới/tái sử dụng trên màn đóng gói; người gửi trên nhãn; 5 nút in tem/phiếu kho | 12 | ~1 ngày |

---

## 1. ❌ Màn đóng gói — đang gọi route đã gỡ (sửa trước demo)

Route `/order-groups/:id/packaging*`, `/fulfillment/pack` bị bỏ khi gộp `thi_dev` (04–05/10), thay bằng **kế hoạch đóng gói** (`packing-plan`); `/lazada-pack/retry` bỏ 10/10 (OptiPack không báo pack lên Lazada). FE còn gọi → 404.

| File FE (dòng) | Hàm | Route cũ (404) | Thay bằng | Đọc ở đâu |
|---|---|---|---|---|
| `api/packaging.api.ts` | `getPackagingRecommendation` | `GET /order-groups/:id/packaging` | `GET /order-groups/:groupId/packing-plan` | `INTEGRATION_GUIDE_PACKING.md` 2.1 |
| | `generatePackaging` | `POST .../packaging/generate` | Không cần — BE tự tính khi nhóm `picked` (≤ 10 s). Lỗi → `POST .../packing-plan/recompute` | 0.3, 2.2 |
| | `approvePackaging` | `POST .../packaging/approve` | `POST .../packing-plan/approve` | 2.3 |
| | `adjustPackaging` | `POST .../packaging/adjust` | `.../parcels/:parcelNo/change-box`, `.../move-item`, `.../manual` | 2.4 |
| | `rejectPackaging` | `POST .../packaging/reject` | `POST .../packing-plan/reject` | 2.5 |
| `api/order-groups.api.ts` (~445) | `packOrderGroup` | `POST /order-groups/:id/fulfillment/pack` | `approve` (trả `packing`) → `parcels/:no/scan` → `parcels/:no/seal`, hoặc lối tắt `POST .../packing-plan/pack` sau chấp nhận | 2.3, 3.3–3.4, 3.9 |
| | `postFulfillmentTransition('pack')` | `.../fulfillment/pack` | như trên | |
| `api/order-groups.api.ts` (~474) | `retryLazadaPack` | `POST /order-groups/:id/lazada-pack/retry` | **Xoá** (cùng nút "gửi lại Lazada" và các toast Lazada trong `PackagingWorkbench.tsx`) | — |

**Màn bị ảnh hưởng:** `components/packing/PackagingWorkbench.tsx` (13 chỗ), `pages/AdminPackingPlansPage.tsx` (2), `pages/ShippingPage.tsx` (2).

**Cách làm gợi ý:**
- **Nhanh (đủ demo, ~1 ngày):** giữ giao diện; đọc `packing-plan` thay cho "gợi ý"; Duyệt/Từ chối gọi route mới; nút Đóng gói gọi `POST .../packing-plan/pack` (niêm phong cả nhóm 1 lần); xoá phần Lazada.
- **Đầy đủ:** thêm luồng bắt đầu → quét từng món → niêm phong từng kiện → xử lý kiện lệch cân / sự cố (Mục 5). Có thể tham khảo màn đóng gói Thi đã viết theo API này ở commit `10bb707` (05/10, trước khi `fe/` được trả về bản `main`) — cần bổ sung phần phiên đóng gói thêm sau ngày đó.

---

## 2. ❌ Giao hàng — GHN, chọn hãng, chuyến, chứng từ

**Đã nối:** `GET /shipments` (+ lọc), `GET /shipments/:id`, `/:id/events`, `/reason-codes`, `POST /shipments` (không chọn hãng), `/:id/deliver`, `/:id/fail`, `/:id/retry`.

**Chưa nối:**

| Việc | API | Đọc ở đâu |
|---|---|---|
| Danh mục hãng (hãng mẫu + GHN `kind: "live"`) | `GET /shipping/carriers` | `INTEGRATION_GUIDE_SHIPPING.md` B.7.1, B.8 |
| Báo giá theo kiện (dòng GHN có `isLive`, `unavailableReason`, `assumptions`) | `GET /shipping/quote/:groupId?province_name=&ward_name=&street=&phone=` | B.7.2 · `GHN_INTEGRATION_GUIDE.md` 11.3 |
| So phương án đóng gói (thùng + vật tư + phí ship) | `GET /shipping/packaging-options/:groupId?carrier_code=&service_code=` | GHN 11.3 Bước 2 |
| Chiến lược đề xuất | `GET/PUT /shipping/settings` | B.7.1 |
| Cấu hình hãng mẫu (Admin) | `POST /shipping/carriers`, `PATCH /shipping/carriers/:id` | B.7.1 |
| Tạo vận đơn **có chọn hãng** — `startShipment` cần gửi thêm `carrier_code`, `service_code`, `pickup_at?`, `to_location?` | `POST /shipments` | B.7.3 · GHN 11.3 Bước 3 |
| Giao chung chuyến | `POST /shipments/batch` | B.7.4 |
| Lịch lấy hàng | `PATCH /shipments/:id/pickup` | B.7.5 |
| Vận đơn của 1 nhóm | `GET /shipments/group/:groupId` | F.1 |
| In phiếu đóng gói / nhãn / bảng kê (dùng `apiRequestBlob`) | `GET /documents/packing-slip/:groupId`, `/shipping-label/:groupId`, `/manifest/:tripCode` | B.7.6 |
| GHN: đặt lại, sửa địa chỉ, nhãn A5, huỷ, đồng bộ | `POST /shipments/:id/carrier/book`, `PATCH /:id/to-location`, `GET /:id/carrier/label`, `POST /:id/carrier/cancel`, `POST /:id/carrier/sync` | GHN 11.3 |
| GHN demo: nút "Mô phỏng GHN" + danh sách trạng thái | `POST /shipments/:id/carrier/simulate { status }`, `GET /shipments/carrier/statuses` | GHN 11.3 Bước 5 |
| Quét quá hạn (demo) | `POST /shipments/overdue-scan` | Operations |

**Phải sửa trên màn Vận chuyển hiện có:**
1. `types/shipments.ts`: thêm `awaiting_pickup` (Chờ hãng lấy hàng), `in_transit` (Đang trung chuyển), `cancelled` (Đã huỷ ở hãng) vào `SHIPMENT_STATUSES` + `SHIPMENT_STATUS_LABELS`; thêm tab tương ứng trong `ShippingPage.tsx`.
2. `api/shipments.api.ts` `mapShipment`: bỏ `|| 'out_for_delivery'` (đang làm vận đơn GHN "chờ lấy" hiện thành "Đang giao").
3. Type `Shipment` thêm các trường GHN BE đã trả: `carrierCode/Name`, `serviceCode/Name`, `parcelCount`, `estimatedCostVnd`, `etaFrom/To`, `tripCode`, `carrierManaged`, `carrierStatus`, `carrierStatusLabel`, `carrierParcels[]`, `carrierBookingError`, `carrierIncident`, `toLocation`, `pickupAt`, `pickedUpAt`, `cancelledAt` (`trackingCode`, `isOverdue`, `nextAttemptNotBefore` đã có).
4. `carrierManaged === true` → ẩn nút Giao thành công / thất bại / giao lại (BE trả `409 SHP_MANAGED_BY_CARRIER`), hiện nhóm nút GHN.
5. Hằng `OWN_FLEET_ACCOUNT` (dữ liệu giả "đội giao riêng") → thay bằng hãng thật.

---

## 3. Hoàn hàng — phần lớn đã nối

**Đã nối (từ nhánh Việt):** danh sách / chi tiết phiếu, lý do trả, tạo phiếu (`POST /returns`), duyệt / từ chối, kho nhận hàng theo phiếu (`/receive`), kiểm hàng (`/inspect`, phần `lines`), danh sách cách ly + xử lý, tạo lại đơn đổi hàng.

**Chưa làm:**

| Việc | API | Ghi chú |
|---|---|---|
| **Thu hồi vật tư khi kiểm hàng** (hạng A + đã gỡ nhãn → kho tái sử dụng; B → nội bộ; C → bỏ) | `POST /returns/:id/inspect` phần `packaging[]` | Hàm API đã nhận `packaging` — chỉ cần thêm ô chọn trên màn kiểm hàng. **Cần cho demo tái sử dụng vật tư** |
| Huỷ phiếu đã duyệt mà hàng không về | `POST /returns/:id/cancel` | Store Owner, Admin |
| Kho nhận kiện **giao thất bại** (tự tạo phiếu `failed_delivery`) | `POST /shipments/:id/receive-return` | Khác `/returns/:id/receive`; cần cho luồng hoàn từ GHN |

---

## 4. ❌ Liên kết tay + giữ chỗ tồn (0/6)

| Việc | API | Đọc ở đâu |
|---|---|---|
| Nhóm cùng người nhận (tự động + liên kết tay) | `GET /order-groups/:id/linked` | `INTEGRATION_GUIDE_SHIPPING.md` B.6 |
| Liên kết / bỏ liên kết tay (VD nhóm Lazada bị che địa chỉ + nhóm AURELLE) | `POST /order-groups/:id/link { target_group_id, note? }`, `DELETE /order-groups/:id/link` | B.6.2 |
| Xem / tính lại / nhả giữ chỗ tồn của nhóm | `GET /order-groups/:id/stock-reservation`, `POST .../recheck`, `POST .../release` | `INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md` |

Gợi ý màn: ở chi tiết nhóm đơn thêm nút "Liên kết với nhóm…" (hộp chọn nhóm), "Bỏ liên kết", danh sách nhóm đã liên kết (đọc `manualLink` — đã có trong `OrderGroup`), và khung "Giữ chỗ tồn" với 2 nút Tính lại / Nhả. Tồn khả dụng (`GET /stock-availability`) **đã nối**.

---

## 5. ❌ Đóng gói đầy đủ + danh mục thùng/túi/vật tư

| Việc | API | Đọc ở đâu |
|---|---|---|
| Hàng chờ đóng gói (tóm tắt nhiều nhóm) | `GET /packing-plans/summary?group_ids=` | `INTEGRATION_GUIDE_PACKING.md` |
| Giao người đóng | `POST .../packing-plan/assign`, `GET /packing/staff` | |
| Phiên đóng gói: bắt đầu, quét/bỏ quét, niêm phong, xem lại kiện lệch cân, xong | `start`, `parcels/:no/scan|unscan|seal|review`, `finish` | 3.x |
| Sự cố: báo sự cố, trả về lấy hàng, hoàn tác niêm phong, tháo kiện đơn huỷ, đổi thùng khi đang đóng | `report-issue`, `back-to-picking`, `parcels/:no/unseal|unpack|change-box-in-session` | |
| Hướng dẫn xếp bằng AI | `parcels/:no/guide` | |
| Cài đặt đóng gói (dùng `PUT`) | `GET/PUT /packing/settings` | |
| Báo cáo đóng gói | `GET /packing/reports/summary`, `/feedback` | |
| Danh mục thùng | `GET/POST/PATCH /packaging/boxes`, `.../:id/stock-in`, `.../:id/movements` | |
| Danh mục túi | `GET/POST/PATCH /packaging/bags`, `.../:id/stock-in` | |
| Vật tư chèn + quy tắc | `GET/POST/PATCH /packaging/materials`, `.../:id/stock-in`, `.../:id/movements`, `GET/PUT /packaging/materials/rules` | |
| Vật tư mới/tái dùng: thêm, sửa, xoá, khôi phục, mua, dùng nội bộ, lịch sử | `/packaging-materials` (POST, PATCH/DELETE `/:code`, `/reactivate`, `/purchase`, `/internal-use`, `/movements`) | `INTEGRATION_GUIDE_PACKAGING_MATERIALS.md` |

Engine đóng gói chọn thùng/túi từ các danh mục trên — chưa có màn thì phải nhập qua Swagger hoặc script seed.

---

## 6. Kho, SKU nội bộ, Product Master — đã nối phần lớn

**Đã nối (từ nhánh Việt):** SKU nội bộ (danh sách, chi tiết, tạo, xoá mềm, khôi phục, thay mã, nối/bỏ nối SKU sàn, gộp tồn, SKU chưa nối, tồn chưa gộp), màu (đủ 5/5), Product Master (danh sách, đồng bộ), kho/khu/ô/kệ, gán SKU vào ô, nhập/kiểm kê/chuyển ô/bỏ gán, lịch sử, Picking List.

**Chưa làm:**

| Việc | API |
|---|---|
| Sửa SKU nội bộ | `PATCH /master-skus/:code` |
| Xoá hẳn SKU nội bộ tạo nhầm (chỉ khi chưa dùng) | `DELETE /master-skus/:code/permanent` |
| Chi tiết sản phẩm + **lưu kích thước/cân đóng gói** (engine cần) | `GET /product-master/:id`, `PUT /product-master/:id/packaging-profile` |
| Lọc sản phẩm chưa đo kích thước | `listProductMaster({ status: 'needs_measurement' })` — hàm đã có |
| Sửa gán nhầm ô (chuyển dòng tồn sang ô khác) | `PATCH /warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId` |
| Sửa ô | `PATCH /warehouse/bin-locations/:binId` |
| Gợi ý ô cất hàng | `GET /warehouse/warehouses/:warehouseId/bin-suggestions` |
| Xem chi tiết 1 kho | `GET /warehouse/warehouses/:warehouseId` |
| Xoá hẳn kho / khu / ô / dãy kệ tạo nhầm | `DELETE .../permanent` (4 route) |
| Picking List cả kho | `GET /warehouse/:warehouseId/picking-list` (tuỳ chọn) |

Chi tiết: `INTEGRATION_GUIDE_WAREHOUSE.md`, `INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md`.

---

## 7. Kết nối sàn, thông báo, trạng thái hiển thị

| Việc | Hiện trạng | Cần làm |
|---|---|---|
| Kết nối shop | `api/marketplace.api.ts` **cố định `lazada`** | Thêm tham số `platform` để kết nối được **AURELLE** (`GET /marketplace/aurelle/connect`) |
| Danh sách shop đã kết nối | FE chỉ nhớ shopId trong trình duyệt | Gọi `GET /marketplace/:platform/shops` |
| Đồng bộ đơn | Gọi `POST /orders/lazada/sync` | Nên đổi sang `POST /orders/:platform/sync` để đồng bộ cả AURELLE |
| Đọc hết thông báo | Chưa có | `PATCH /notifications/read-all` |
| Trạng thái nhóm đơn | `GROUP_FULFILLMENT_STATUSES` thiếu `canceled` | Thêm + nhãn "Đã huỷ" |
| Loại thông báo | `NOTIFICATION_TYPES` có 10/24 loại | Thêm `low_box_stock`, `low_material_stock`, `group_auto_canceled`, `packaging_plan_invalidated`, `delivery_failed`, `delivery_returning`, `delivery_overdue`, `return_requested`, `stock_shortage`, `packing_assigned`, `packing_parcel_held`, `packing_issue`, `unpack_required`, `return_to_shelf` + nhãn; `lib/notification-nav.ts` điều hướng (`delivery_*` → Vận chuyển, `return_*` → Hoàn hàng, `packing_*`/`unpack_required` → Đóng gói, `low_*_stock` → Vật tư) |
| Câu hướng dẫn luồng cũ | `types/order-groups.ts` (~dòng 199) "duyệt kế hoạch → Warehouse pack" | Viết lại: duyệt → bắt đầu → quét → niêm phong |

---

## 8. Dữ liệu giả và mã chết

**Màn đang dùng dữ liệu giả dù BE đã có API:**

| Màn / file | Dữ liệu giả | Thay bằng |
|---|---|---|
| **Đơn hàng** (`MarketplaceOrdersScreen.tsx`, `MarketplaceOrdersView.tsx`, `MarketplaceOrderDetailScreen.tsx`) | Trộn đơn "demo đa sàn" Lazada + TikTok (`data/demo-multi-platform-orders.ts`) vào danh sách thật | Bỏ — dùng đơn AURELLE thật + liên kết tay (Mục 4). **Nên sửa trước demo** |
| Bảng điều khiển (`DashboardPage.tsx`), Báo cáo (`AnalyticsReportPage.tsx`) | Số liệu giả | `/packing/reports/summary`, `/packing-plans/summary`, `/packaging-materials/savings` |
| Quy tắc đóng gói (`PackagingRulesPage.tsx`) | Danh sách thùng giả | `/packaging/boxes`, `/packaging/materials/rules`, `/packing/settings` |
| Mẫu đóng gói (Admin, `usePackagingTemplates.ts`) | `admin-mock` | `/packaging/boxes`, `/packaging/bags` |
| Màn Vận chuyển | `OWN_FLEET_ACCOUNT` | Mục 2 |
| `PackingDashboard.tsx`, `BatchDetailDrawer.tsx`, `ConsolidationActionDrawer.tsx`, `SyncEventLog.tsx`, `useWarehouseFloor.ts` | Dữ liệu giả | Kiểm tra còn dùng không; không dùng thì xoá |
| `pages/ConsolidationPage.tsx`, `pages/IntegrationsPage.tsx` | Dữ liệu giả | **Không có trên route nào** (`App.tsx`) → xoá được |

> Màn **Tồn kho** (`/app/inventory`) đã chuyển sang dữ liệu thật (nhánh Việt).

**Mã chết (xoá cùng lúc làm Mục 1):**
- `api/packaging.api.ts`, `types/packaging.ts`.
- `mapPackagingConsumption`, trường `packagingConsumption` (dữ liệu của `fulfillment/pack` cũ).
- `active_packaging_recommendation` / `activePackagingRecommendationId` (BE đã xoá trường này — luôn rỗng).
- `lazadaPack*`, `mapLazadaPackInfo`, `retryLazadaPack`, `LAZADA_PACK_STATUSES`.
- `'pack'` trong `postFulfillmentTransition`; `ship` / `deliver` / `return` ở đó là route cũ — màn mới dùng `/shipments/*`.

---

## 9. Tầng kết nối chung — đã kiểm, không cần sửa thêm

- `VITE_API_URL` (mặc định `http://localhost:3000`) khớp cổng BE; CORS BE mặc định cho `http://localhost:5173`.
- Token Bearer, tự refresh khi 401 (chống gọi trùng), MFA, thiết bị tin cậy, bắt đổi mật khẩu, redirect Google và kết nối sàn: khớp BE.
- Dữ liệu gửi lên của mọi nút hiện có (43 lời gọi ghi) và tham số lọc: khớp DTO BE (không thừa/thiếu trường).
- 108/206 mã lỗi BE chưa có câu tiếng Việt riêng trong FE → FE dùng `message` của BE (đã tiếng Việt), không gãy.

---

## 10. Checklist nghiệm thu FE

- [ ] Tìm trong `fe/src` không còn `/packaging`, `/fulfillment/pack`, `/lazada-pack` (0 kết quả)
- [ ] Màn đóng gói: duyệt kế hoạch → đóng gói → nhóm sang "Đã đóng gói"
- [ ] Màn Đơn hàng không còn đơn TikTok giả
- [ ] Báo giá hiện cả hãng mẫu và GHN; dòng lỗi bị làm mờ, có ô sửa địa chỉ; `assumptions` hiện cảnh báo
- [ ] Tạo vận đơn GHN → "Chờ hãng lấy hàng", có mã GHN từng kiện, in được nhãn
- [ ] Vận đơn GHN không hiện nút giao kiểu cũ; nút "Mô phỏng GHN" chạy đủ: lấy hàng → đang giao → đã giao
- [ ] Giao thất bại → hoàn → kho "Nhận hàng hoàn" → phiếu hoàn → kiểm hàng **có thu hồi thùng hạng A**
- [ ] Huỷ ở hãng → vận đơn "Đã huỷ ở hãng", nhóm về "Đã đóng gói", tạo lại được
- [ ] Liên kết tay 2 nhóm → giao chung chuyến → in bảng kê chuyến
- [ ] `SHIPMENT_STATUSES`, `GROUP_FULFILLMENT_STATUSES`, `NOTIFICATION_TYPES` khớp BE
- [ ] Kết nối được shop AURELLE từ FE; có nút "Đọc hết thông báo"
- [ ] Mọi nút xử lý 409 bằng tải lại

---

## 11. 🆕 Nhập kho theo lô + cấu hình đồng bộ/gom đơn (15/10/2026)

**Nhập kho theo lô (FIFO theo ngày nhập)** — đọc `INTEGRATION_GUIDE_WAREHOUSE.md` PHẦN B8.

| Việc | API |
|---|---|
| Form **phiếu nhập** nhiều dòng (ngày nhập, mã lô, nhà cung cấp, ghi chú, chọn SKU trên ô + số lượng) | `POST /warehouse/warehouses/:warehouseId/receipts` |
| Danh sách / chi tiết phiếu nhập | `GET .../receipts`, `GET .../receipts/:receiptId` |
| Tồn theo lô của 1 dòng "SKU trên ô" (mở khi bấm vào dòng) | `GET .../sku-bin-assignments/:assignmentId/lots` |
| Màn "Tồn theo lô" của kho, lọc SKU / mã lô | `GET /warehouse/warehouses/:warehouseId/lots` |
| Nút "Nhập thêm hàng" cũ: thêm ô ngày nhập + mã lô (tuỳ chọn) | `restock` nhận `received_at?`, `lot_code?` |
| Picking List: hiện "Lô … · nhập dd/mm" dưới mã ô | trường mới `oldest_lot`, `other_bins[].oldest_lot` |
| Lịch sử ô: hiện lô của từng dòng | sổ cái có thêm `lots[]` |
| Bắt lỗi | `WH_RECEIPT_DATE_IN_FUTURE`, `WH_RECEIPT_LINE_INVALID`, `WH_RECEIPT_LINE_NOT_ASSIGNED`, `WH_RECEIPT_NOT_FOUND` |

**Cấu hình tiêu chí đồng bộ & gom đơn (Admin)** — đọc `INTEGRATION_GUIDE_ORDERS.md` mục 7c.

| Việc | API |
|---|---|
| Màn "Cấu hình đồng bộ đơn" trong menu Admin: dựng form từ `options` của GET | `GET /order-sync-settings` |
| Lưu (gửi `expected_version`; 409 → tải lại) | `PUT /order-sync-settings` |
| Lịch sử thay đổi | `GET /order-sync-settings/history` |
| Store Owner xem (không sửa) | GET ở trên |
| Bắt lỗi | `ORD_SYNC_SETTINGS_INVALID` (hiện `details`), `ORD_SYNC_SETTINGS_CONFLICT` |

## 12. 🆕 Nguồn thùng khi đóng gói + in tem/phiếu kho (21/10/2026)

**BE đã làm (AOFP-134..137):** thêm API, không đổi/bỏ trường cũ → FE hiện tại **không hỏng**. FE **chưa** sửa gì. Mọi việc dưới đây là **thêm nút/khối mới**.

### 12.1 Màn đóng gói — báo trước lấy thùng ở kệ nào, cho chọn "dùng thùng mới thay"

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

### 12.2 Người gửi trên nhãn vận đơn

Đọc: [INTEGRATION_GUIDE_SHIPPING.md B.7.1 bước 4](INTEGRATION_GUIDE_SHIPPING.md).

1. `fe/src/api/shipping.api.ts`: type `ShippingSettings` thêm `sender: { name: string|null; phone: string|null; address: string|null }`; `updateShippingSettings` nhận thêm `sender_name?`, `sender_phone?`, `sender_address?`.
2. Màn cài đặt vận chuyển (Store Owner/Admin): thêm 3 ô **Tên người gửi / SĐT / Địa chỉ kho gửi**, điền sẵn từ `GET`. Ghi chú dưới form: "Bỏ trống → nhãn dùng tên + địa chỉ kho".
3. Nhãn in ra đã có khối NGƯỜI GỬI — nút in nhãn hiện tại không phải sửa.

### 12.3 In tem và phiếu kho

Đọc: [INTEGRATION_GUIDE_WAREHOUSE.md PHẦN B9](INTEGRATION_GUIDE_WAREHOUSE.md). Dùng lại `openShippingDocument(path)` trong `fe/src/api/shipping.api.ts` (nó gọi `apiRequestBlob` rồi mở tab mới) — có thể đổi tên thành `openPdfDocument` cho đúng nghĩa.

| # | Màn | Thêm nút | Gọi |
|---|---|---|---|
| 1 | Quản lý kho → danh sách khu | **In tem ô** (mỗi khu) | `/documents/bin-labels/{warehouseId}?zone_id={zoneId}` |
| 2 | Quản lý kho → dòng 1 ô | **In lại tem** | `/documents/bin-labels/{warehouseId}?bin_ids={binId}` |
| 3 | SKU nội bộ (chọn nhiều dòng) | **In tem SKU** + ô "số bản" (1–50) | `/documents/sku-labels?codes={mã1,mã2}&copies={n}` (nhớ `encodeURIComponent` từng mã) |
| 4 | Lấy hàng (Warehouse Staff, màn Picking List) | **In danh sách lấy hàng** | `/documents/picking-list/{warehouseId}/{groupId}` |
| 5 | Phiếu nhập: sau khi tạo + trong chi tiết phiếu | **In phiếu nhập** | `/documents/stock-receipt/{warehouseId}/{receiptId}` |

Bắt lỗi (JSON như mọi route): `DOC_NO_BINS` "Khu chưa có ô nào", `DOC_TOO_MANY_LABELS` "Quá 500 tem — in theo từng khu", `DOC_NO_CODES`, `WH_RECEIPT_NOT_FOUND`.

### 12.4 Nghiệm thu

- [ ] Kiện thường, kệ tái sử dụng còn → chip "Lấy ở kệ tái sử dụng"; niêm phong → `boxSourceUsed = 'reused'`, trang Vật tư: ô "Tái sử dụng" giảm 1.
- [ ] Bấm "Dùng thùng mới thay" không chọn lý do → không cho gửi; chọn lý do → niêm phong → "Tái sử dụng" giữ nguyên, "Mới" giảm 1, kiện hiện "(đổi từ tái sử dụng — …)".
- [ ] Kiện có hàng dễ vỡ → chip "Lấy thùng mới · hàng dễ vỡ", không có nút đổi.
- [ ] Lưu người gửi → in nhãn thấy khối NGƯỜI GỬI đúng; xoá trắng → nhãn lấy tên + địa chỉ kho.
- [ ] In tem ô của 1 khu, in tem SKU 2 bản, in danh sách lấy hàng, in phiếu nhập → PDF mở tab mới, quét thử mã vạch tem ô ra đúng `bin_code`.
