# OptiPackAI — Danh sách API đầy đủ theo Role

Tài liệu này liệt kê **toàn bộ** route thật đang tồn tại trong code (đã quét trực tiếp từ `@Controller`/`@Roles` decorator, không phải từ trí nhớ/thiết kế) — dùng làm nguồn tham chiếu DUY NHẤT khi cần biết "route này ai gọi được, dùng để làm gì". Cập nhật lần cuối: 2026-10-04 — 🔄 **làm lại kế hoạch đóng gói**: gỡ toàn bộ `/order-groups/:groupId/packaging/*` và `fulfillment/pack`, thay bằng `/order-groups/:groupId/packing-plan` (1 kế hoạch/nhóm, tự tính khi lấy xong, nhãn chứng minh tối ưu, chỉnh tay đổi thùng/chuyển món) + `GET /packing-plans/summary` (mục 8); 2026-09-30 — 🆕 **đa kiện thật** (mỗi đơn có N kiện: `cartons[]`, `carton_index` ở `adjust`/`pack`/`guide`, lý do no_fit có mã), engine 3D mới (extreme-point, bỏ trần 30 món); 2026-09-30 (rà business rule) — 🔄 `fulfillment/pick` chỉ từ `picking`; `decide-partial` từ chối → `picking` (lượt mới); `packaging/adjust` tăng version nhóm; thông báo `packaging_plan_invalidated`; 2026-09-29 — 🆕 webhook nhận sự kiện AURELLE (`POST /marketplace/webhooks/:platform`, mục 3b), `POST /orders/:platform/sync` tổng quát (mục 4), trạng thái `canceled` cho Order Group (N1 — tự động hủy khi mọi đơn trong nhóm không còn fulfill được, nhả giữ chỗ đóng gói), liên kết cùng người nhận `GET /order-groups/:id/linked` + `linkedGroupCount`/`linkedPending` (Mục 9.5, mục 5-6), module `shipments/` mới — giao chung chuyến (mục 6b), picking list gộp nhiều nhóm `GET /warehouse/:warehouseId/picking-list?group_ids=` (mục 9); trước đó 2026-09-28 — 🆕 vật tư chèn `/packaging/materials` (danh mục + tồn kho + bộ luật chọn vật tư, mục 8e), phương án đóng gói trả `materials[]` đầy đủ + `materialsWeightG/CostVnd/Shortfall`; 2026-09-22 — 🆕 tồn kho thùng trong `/packaging/boxes` (stock-in, sổ xuất/nhập, engine chỉ chọn thùng còn trống), gỡ `/materials`; 2026-09-21 lần 3: 🆕 danh mục túi zip `/packaging/bags` (mục 8d), hồ sơ SKU thêm loại sản phẩm + túi zip (mục 8c), hướng dẫn đóng gói bằng AI; lần 2: 🆕 engine đóng gói 3D (mỗi đơn 1 kiện, tọa độ xếp cho animation), danh mục thùng `/packaging/boxes`, hồ sơ SKU `/product-master`, `pick`/`pick-item` đối soát số lượng, `pack` nhận cân từng kiện (mục 6, 8, 8b, 8c); lần 1: đồng bộ luồng lấy hàng trước, đóng gói sau; trước đó 2026-09-20 (gộp bản contract từ nhánh `thi_dev`: thêm mục Quy ước, mục 0 System, bảng DTO/field cho từng module, mục 11 collection nội bộ/planned và bảng mã lỗi theo module).

**Cách đọc**: "Bất kỳ" = mọi role đã đăng nhập đều gọi được. "Public" = không cần token.

## Quy ước

- Protected API dùng `Authorization: Bearer <access_token>`; `Public` không cần token.
- Mongo `_id: ObjectId` được đổi thành `id: string` ở các response có mapper.
- Request hiện dùng field `snake_case`; một số response public dùng `camelCase`.
- GET dùng path/query, không có JSON body. Error theo global exception filter và mã trong `*.errors.ts`.
- Không expose password, token hash, encrypted marketplace token hoặc `__v`.
- `planned` nghĩa là chưa implement, không phải contract đang chạy.

Error response chuẩn:

```json
{
  "success": false,
  "error_code": "VALIDATION_ERROR",
  "message": "Request không hợp lệ",
  "details": null,
  "timestamp": "2026-09-14T00:00:00.000Z",
  "path": "/orders"
}
```

---

## 0. System

| Method | Route | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/` | Public | Không body | Chuỗi health/welcome từ `AppService` |

## 1. Auth (`/auth`)

| Method | Route                   | Role   | Mô tả                                                        |
| ------ | ----------------------- | ------ | ------------------------------------------------------------ |
| POST   | `/auth/login`           | Public | Đăng nhập — có thể trả `mfa_required` nếu tài khoản bật MFA  |
| POST   | `/auth/forgot-password` | Public | Gửi email link đặt lại mật khẩu                              |
| POST   | `/auth/reset-password`  | Public | Đặt mật khẩu mới bằng token từ email                         |
| POST   | `/auth/change-password` | Bất kỳ | Đổi mật khẩu khi đã đăng nhập                                |
| POST   | `/auth/mfa/setup`       | Bất kỳ | Bắt đầu bật MFA — trả về `otpauthUrl` để tự vẽ QR            |
| POST   | `/auth/mfa/verify`      | Bất kỳ | Xác nhận mã TOTP đầu tiên — bật MFA thật, trả 10 mã dự phòng |
| POST   | `/auth/refresh`         | Public | Lấy cặp access/refresh token mới                             |
| POST   | `/auth/logout`          | Bất kỳ | Thu hồi refresh token hiện tại                               |
| GET    | `/auth/google`          | Public | Bắt đầu luồng đăng nhập Google (redirect)                    |
| GET    | `/auth/google/callback` | Public | Google gọi lại sau khi user xác thực                         |

**Chi tiết request/response**

| DTO/body | Field | Type | Req. | Validation/meaning |
|---|---|---:|:---:|---|
| `LoginDto` | `email` | string | ✓ | Email |
|  | `password` | string | ✓ | Mật khẩu |
|  | `mfa_token`, `device_token`, `backup_code` | string |  | MFA/trusted device |
| `ForgotPasswordDto` | `email` | string | ✓ | Email |
| `ResetPasswordDto` | `token`, `new_password` | string | ✓ | Reset token + mật khẩu mới |
| `ChangePasswordDto` | `current_password`, `new_password` | string | ✓ | Đổi mật khẩu |
| `VerifyMfaSetupDto` | `token` | string | ✓ | Mã TOTP |
| refresh/logout | `refresh_token` | string | ✓ | Refresh token |
| Google callback | `code`, `state` | string | ✓ | OAuth code + CSRF state |
|  | `code_verifier` | string |  | PKCE |

Login/Google token response gồm access token, refresh token, role và `must_change_password`; không trả secret MFA.

## 2. Users (`/users`)

| Method | Route                       | Role               | Mô tả                                      |
| ------ | --------------------------- | ------------------ | ------------------------------------------ |
| POST   | `/users`                    | Admin              | Tạo tài khoản nhân viên mới                |
| GET    | `/users`                    | Admin, Store Owner | Danh sách toàn bộ user                     |
| GET    | `/users/me`                 | Bất kỳ             | Xem thông tin chính mình                   |
| PATCH  | `/users/me`                 | Bất kỳ             | Tự sửa phone/address/avatar                |
| POST   | `/users/:id/reset-password` | Admin              | Reset mật khẩu hộ 1 user                   |
| POST   | `/users/:id/disable-mfa`    | Admin              | Tắt MFA hộ user mất thiết bị/mã dự phòng   |
| POST   | `/users/:id/reactivate`     | Admin              | Mở lại tài khoản bị khóa                   |
| PATCH  | `/users/:id`                | Admin              | Sửa tên/role/phone/address/mã NV/phòng ban |
| DELETE | `/users/:id`                | Admin              | Xóa mềm 1 user                             |

**Chi tiết request/response**

| DTO/query | Field | Type | Req. | Validation/meaning |
|---|---|---:|:---:|---|
| `CreateUserDto` | `name`, `email`, `role` | string, string, enum | ✓ | User mới |
| `UpdateProfileDto` | `phone`, `address`, `avatar` | string |  | Profile; phone max 20, address max 255 |
| `AdminUpdateUserDto` | `name`, `role`, `phone`, `address`, `employee_code`, `department` | string/enum |  | Admin update; employee code max 20, department max 100 |
| list query | `role`, `page`, `limit` | number |  | Page mặc định 1, limit mặc định 20 |

`PaginatedUsers`: `{ data: UserDocument[], total, page, limit }`; service loại bỏ password/MFA secret/reset hash trước khi trả list.

Public profile: `id`, `name`, `email`, `role`, `avatar`, `phone?`, `address?`, `employee_code?`, `department?`, `mfa_enabled`, `login_type`, `created_at?`.

## 3. Marketplace Integration (`/marketplace`)

| Method | Route                             | Role   | Mô tả                                                    |
| ------ | --------------------------------- | ------ | -------------------------------------------------------- |
| GET    | `/marketplace/:platform/connect`  | Admin  | Tạo URL OAuth để kết nối shop 1 sàn (lazada/tiktok/tiki) |
| GET    | `/marketplace/:platform/callback` | Public | Sàn tự gọi lại sau khi seller authorize                  |

`platform` là enum marketplace (`lazada`, `tiktok`, `tiki`, 🆕 `aurelle` — sàn thứ 2 tự dựng tương thích khung Lazada, xem `AURELLE_MARKETPLACE_DESIGN.md`). Callback state dùng một lần để chống CSRF. Access/refresh token được mã hóa trong `marketplace_shops`, không expose.

## 3b. 🆕 Webhook AURELLE (`/marketplace/webhooks`) — 29/09/2026

| Method | Route                             | Role   | Mô tả                                                    |
| ------ | ---------------------------------- | ------ | -------------------------------------------------------- |
| POST   | `/marketplace/webhooks/:platform` | Public (không JWT) | AURELLE gọi khi có sự kiện đơn hàng — không expose Swagger |

Không dùng Bearer token — bảo mật bằng chữ ký HMAC trong header `Authorization` (không tiền tố "Bearer"), công thức `UPPER(HEX(HMAC_SHA256(app_secret, app_key + raw_body)))` (`AurelleAdapter.verifyWebhookSignature()`), so sánh bằng `timingSafeEqual`. Chữ ký sai hoặc thiếu → 401 `MKT_WEBHOOK_SIGNATURE_INVALID`. Chống replay: `|now - timestamp| > 5 phút` → cũng 401 cùng mã lỗi. Chống trùng (Rule #17, tạo record trước — bắt lỗi trùng khóa E11000 — thay vì kiểm tra rồi tạo) theo `{platform, event_id: message_id}` trong `processed_webhook_events` (TTL 7 ngày) — `message_id` đã xử lý → ack `{received:true}` ngay, không xử lý lại.

Body: `{ message_id, seller_id, message_type, timestamp, data: { trade_order_id, order_status?, status_update_time? } }`. 3 giá trị `message_type` đã biết: `order_status_changed`/`order_updated` (gọi `syncSingleOrder(platform, seller_id, trade_order_id)` — nếu shop chưa từng connect thì ack, không xử lý), `authorization_revoked` (bắn Notification `CONNECTION_LOST` cho Store Owner + Admin, KHÔNG sync). Giá trị lạ khác vẫn ack 200 (tương thích ngược). Luôn trả 2xx trong vài giây trừ 2 case từ chối ở trên; AURELLE tự retry nếu không nhận được ack.

## 4. Orders (`/orders`)

| Method | Route                    | Role                   | Mô tả                                                                               |
| ------ | ------------------------ | ---------------------- | ----------------------------------------------------------------------------------- |
| POST   | `/orders/lazada/sync`    | Admin                  | Kích hoạt tay 1 lần đồng bộ đơn từ Lazada (giữ nguyên, tương thích ngược)           |
| POST   | `/orders/:platform/sync` | Admin                  | 🆕 29/09/2026 — bản tổng quát, dùng cho MỌI sàn đã đăng ký adapter (`lazada`, `aurelle`...); `/orders/lazada/sync` giờ chỉ là alias gọi lại route này |
| GET    | `/orders`                | **Admin, Store Owner** | Danh sách đơn đã đồng bộ                                                            |
| GET    | `/orders/:id`            | **Admin, Store Owner** | Chi tiết 1 đơn hàng                                                                 |

**Chi tiết query/response**

| Query | Type | Validation/meaning |
|---|---:|---|
| `shop_id` | string | Shop trên sàn |
| `status` | `OrderStatus` | Trạng thái chuẩn hóa |
| `consolidated_group_id` | ObjectId string | Group gom đơn |
| `before` | ISO date | Cursor theo `created_at` |
| `limit` | integer | Mặc định 20, min 1, max 100 |

List item: `id`, `platform`, `shopId`, `platformOrderId`, `platformOrderNumber?`, `status`, `recipientName`, `recipientCity`, `isConsolidated`, `consolidatedGroupId`, `totalAmount`, `currency`, `itemCount`, `createdAt`.

Detail bổ sung địa chỉ nhận đầy đủ và `items[]`. Items được aggregate theo `sku + variation + status`, có quantity, unit price, line total và `platformOrderItemIds`.

## 5. Order Groups — Đọc (`/order-groups`)

| Method | Route                                 | Role                                                   | Mô tả                                                                                                                                             |
| ------ | ------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/order-groups`                       | **Store Owner**, Warehouse, Packaging, Shipping, Admin | Danh sách nhóm đơn — lọc theo `fulfillment_status`/`platform`/**`order_priority`** (MỚI — xem toàn bộ đơn Hỏa Tốc bằng `?order_priority=express`) |
| GET    | `/order-groups/:id`                   | **Store Owner**, Warehouse, Packaging, Shipping, Admin | Chi tiết 1 nhóm đơn — đọc `version` ở đây trước mọi request ghi. 🆕 29/09: thêm `linkedGroupCount` (số nhóm khác, có thể khác sàn, cùng `recipient_key`, chưa giao xong — Mục 9.5) |
| GET    | `/order-groups/:id/picking-list`      | Warehouse, Admin                                       | Toàn bộ SKU cần lấy. 🔄 21/09: mỗi dòng có `quantity` (số đặt), `picked_quantity` (đã quét trong lượt), `packaging_profile_ready`; số đo `null` nếu SKU chưa đo — **không còn 422 khi SKU chưa có hồ sơ** |
| GET    | `/order-groups/:id/picking-list/:sku` | Warehouse, Admin                                       | Chi tiết 1 SKU riêng lẻ trong nhóm đơn (cùng shape dòng picking-list ở trên)                                                                      |
| 🆕 GET | `/order-groups/:id/linked`            | **Store Owner**, Warehouse, Packaging, Shipping, Admin | **MỚI (29/09/2026, Mục 9.5)** — danh sách đầy đủ các nhóm khác cùng `recipient_key` (cùng người nhận thật, có thể khác sàn), chưa tới `delivered`/`returned`/`canceled`. Trả `{ linkedGroups: OrderGroupResponse[] }` |

## 6. Order Groups — Fulfillment (ghi trạng thái)

| Method | Route                                          | Role                       | Mô tả                                                                |
| ------ | ---------------------------------------------- | -------------------------- | -------------------------------------------------------------------- |
| POST   | `/order-groups/:id/fulfillment/pick-item`      | Warehouse, Admin           | Quét/nhập tay 1 SKU — trừ tồn + ghi pick_event trong 1 transaction, chống trừ trùng khi mất mạng. 🔄 21/09: chỉ khi group `picking`; chặn quét vượt số đặt trong lượt; KHÔNG cần hồ sơ đóng gói |
| POST   | `/order-groups/:id/fulfillment/report-missing` | Warehouse, Admin           | Báo thiếu hàng lúc lấy — dừng đơn, báo Store Owner, chờ duyệt        |
| POST   | `/order-groups/:id/fulfillment/decide-partial` | Packaging, Admin           | Duyệt tiếp với phần có sẵn, hoặc hủy làm lại (🔄 21/09: hủy = mở lượt lấy mới `pick_round + 1`, không đếm lại lượt cũ; tồn kho không tự cộng lại) |
| POST   | `/order-groups/:id/fulfillment/pick`           | Warehouse, Admin           | `picking → picked`: 🔄 21/09 server đối soát mọi SKU đã quét đủ số đặt trong lượt; thiếu → 409 `ORD_GROUP_PICK_INCOMPLETE` kèm danh sách |
| ~~POST~~ | ~~`/order-groups/:id/fulfillment/pack`~~ | — | 🔄 **ĐÃ GỠ 04/10/2026** — đóng gói + cân từng kiện chuyển sang `POST /order-groups/:groupId/packing-plan/pack` (mục 8) |
| POST   | `/order-groups/:id/fulfillment/ship`           | Shipping, Admin            | Xác nhận đã bàn giao vận chuyển. 🆕 29/09: response thêm `linkedPending[]` (`{id, fulfillmentStatus}`) — CẢNH BÁO các nhóm khác cùng người nhận CHƯA đóng gói xong (Mục 9.5), KHÔNG chặn hành động ship |
| POST   | `/order-groups/:id/fulfillment/deliver`        | Shipping, Admin            | Xác nhận đã giao thành công tới khách                                |
| POST   | `/order-groups/:id/fulfillment/return`         | Shipping, Warehouse, Admin | Ghi nhận hoàn hàng (từ shipped hoặc delivered)                       |
| POST   | `/order-groups/:id/fulfillment/return-receive` | 🆕 Warehouse, Admin | Kho NHẬN hàng hoàn của nhóm đã `returned`: body `{ warehouse_id, lines:[{ sku, good_quantity, damaged_quantity, note? }], note? }`. Đạt → nhập lại `quantity_on_hand` (cùng transaction); hỏng → chỉ ghi nhận. Mỗi nhóm nhận hoàn **1 lần**, không nhận quá số đã giao. Lỗi `ORD_GROUP_RETURN_*` |
| PATCH  | `/order-groups/:id/priority`                   | **Store Owner**, Admin     | Đánh dấu đơn Hỏa Tốc/Bình thường, tự tính hạn đóng gói               |

**🆕 Trạng thái mới `canceled` (29/09/2026, N1 — Mục 9.6)**: KHÔNG có endpoint ghi riêng — hệ thống **tự động** chuyển 1 Order Group sang `canceled` khi MỌI đơn bên trong không còn fulfill được (đơn bị khách/sàn hủy, hoặc sự cố logistics `lost`/`damaged_by_3pl`/`package_scrapped`...), miễn nhóm đó **chưa** tới `packed`/`shipped`/`delivered` (hàng đã đóng/giao vật lý thì không tự hủy ngầm, cần luồng `return` thủ công). Trigger: mỗi lần `syncShopOrders()`/webhook cập nhật 1 đơn sang trạng thái không-fulfill-được, hệ thống tự kiểm tra và hủy nhóm nếu đủ điều kiện — không cần Warehouse/Packaging Staff xác nhận riêng (ngoại lệ có chủ đích so với nguyên tắc "người xác nhận thay đổi quan trọng" thường dùng, vì rủi ro thấp khi nhóm chưa đóng gói). Khi hủy: tự nhả giữ chỗ đóng gói (🔄 04/10: kế hoạch `packing_plans` đang hoạt động chuyển `superseded`) + bắn Notification `group_auto_canceled` cho Store Owner, Admin và người phụ trách (nếu có).

## 6b. 🆕 Shipments — Giao chung chuyến (`/shipments`) — 29/09/2026

Mục 9.5, hàng #4. Tạo vận đơn thật (mã chuyến + mã theo dõi nội bộ) cho 1 hoặc nhiều Order Group **đã `packed`** — dùng khi nhiều nhóm (có thể khác sàn) cùng 1 người nhận thật, muốn giao chung 1 chuyến. **KHÔNG thay thế** `POST /order-groups/:id/fulfillment/ship` (route đó vẫn dùng được cho ship đơn lẻ không cần vận đơn) — đây là lựa chọn CỘNG THÊM, không bắt buộc.

| Method | Route            | Role                    | Mô tả                                                                 |
| ------ | ---------------- | ----------------------- | ----------------------------------------------------------------------- |
| POST   | `/shipments/batch` | Shipping Coordinator, Admin | Tạo vận đơn cho 1 hoặc nhiều group đã `packed`; mỗi group chuyển `packed → shipped`. ≥2 group bắt buộc cùng `recipient_key` |

Body `CreateShipmentBatchDto` (🔄 30/09 — nay bắt buộc thêm `carrier_code` + `service_code`, xem ngay dưới): `order_group_ids: string[]` (≥1 phần tử, mỗi phần tử ObjectId hợp lệ), `note?: string`. Response `{ tripCode, shipments: [{ id, orderGroupId, trackingCode }] }` — `tripCode` dạng `TRIP-yymmdd-XXXX` (chung cho mọi shipment tạo trong 1 lần gọi), `trackingCode` dạng `OPK-XXXXXXXXXX` (riêng từng shipment). Toàn bộ chạy trong 1 Mongo transaction (Rule #6) — tạo `Shipment` + chuyển trạng thái từng group đều thành công hoặc đều rollback.

Collection `shipments` (mới, tối giản có chủ đích — field carrier/cước/ETA thật sẽ CỘNG THÊM vào đúng collection này khi làm module Shipping riêng, không tạo collection thứ 2): `order_group_id` (unique — 1 group chỉ tạo được 1 shipment), `trip_code`, `tracking_code`, `note`, `created_by`, `created_at`.

Lỗi: `SHP_EMPTY_GROUP_LIST` (400, danh sách rỗng), `SHP_GROUP_NOT_PACKED` (409, có group chưa `packed`), `SHP_RECIPIENT_MISMATCH` (409, ≥2 group khác `recipient_key` hoặc có group `recipient_key: null` — an toàn, không tự đoán liên kết khi không chắc), `SHP_GROUP_ALREADY_SHIPPED` (409, group đã có shipment từ trước — E11000 trên `order_group_id`).

🔄 **ĐÃ THAY ĐỔI 30/09/2026** so với đoạn trên: `POST /shipments/batch` **bắt buộc chọn hãng + dịch vụ**. Body giờ là `{ order_group_ids, carrier_code, service_code, note?, pickup_at? }`. Cước tính từ kiện thật rồi ghi lên vận đơn (`carrier_*`, `service_*`, `parcel_count`, `chargeable_weight_g`, `estimated_cost_vnd`, `is_sample_rate`, `eta_from/eta_to`, `pickup_at`) và lên `estimated_shipping_cost_vnd` của phương án đóng gói từng đơn. Response `{ tripCode, carrierCode, serviceCode, totalCostVnd, shipments:[{ id, orderGroupId, trackingCode, parcelCount, estimatedCostVnd, etaFrom, etaTo }] }`. `trackingCode` vẫn là **mã nội bộ**, không phải mã vận đơn của hãng (chưa gọi API hãng thật).

| Method | Route | Role | Mô tả |
| ------ | ----- | ---- | ----- |
| GET | `/shipments?trip_code=&carrier_code=` | Shipping, Store Owner, Warehouse, Admin | Danh sách vận đơn (mới nhất trước) |
| GET | `/shipments/group/:groupId` | Shipping, Store Owner, Warehouse, Admin | Vận đơn của 1 nhóm (`null` nếu chưa có) |
| PATCH | `/shipments/:id/pickup` | Shipping, Admin | Đặt/đổi lịch hãng đến lấy hàng `{ pickup_at }` — chỉ lưu lịch, chưa gọi hãng. Lỗi `SHP_PICKUP_IN_PAST`, `SHP_SHIPMENT_NOT_FOUND` |

## 6d. 🆕 Chứng từ in PDF (`/documents`) — 30/09/2026

Trả `application/pdf` (font DejaVu nhúng nên đủ tiếng Việt). FE cần gửi Bearer nên tải bằng `fetch` → blob → mở tab mới (xem `fe/src/api/shipping.api.ts::openDocument`), không mở thẳng bằng thẻ `<a>`.

| Method | Route | Role | Nội dung |
| ------ | ----- | ---- | -------- |
| GET | `/documents/packing-slip/:groupId` | Warehouse, Packaging, Store Owner, Admin | Phiếu đóng gói — mỗi đơn 1 trang A5: người nhận, hàng (ô tích), các kiện/thùng, barcode nhóm |
| GET | `/documents/shipping-label/:groupId` | Shipping, Warehouse, Admin | Nhãn 100×150 mm — **mỗi kiện 1 nhãn** (k/n), barcode Code128 + QR mã vận đơn, hãng, ETA. Cần đã có vận đơn |
| GET | `/documents/manifest/:tripCode` | Shipping, Store Owner, Admin | Bảng kê chuyến A4 — mọi vận đơn cùng mã chuyến, tổng kiện/cân/cước, chỗ ký giao nhận |

Lỗi: `DOC_NO_ORDERS` (409, nhóm không còn đơn hợp lệ), `DOC_SHIPMENT_NOT_FOUND` (404, chưa có vận đơn), `DOC_TRIP_NOT_FOUND` (404).

## 6c. 🆕 Vận chuyển — hãng, bảng cước, báo giá (`/shipping`) — 30/09/2026

Báo giá đọc các **kiện thật** của nhóm (phương án đóng gói đã duyệt/đã đóng): cân thực = cân đo lúc `pack` nếu có, chưa pack thì cân ước tính; cân quy đổi = thể tích ngoài của thùng ÷ hệ số của hãng; **cước mỗi kiện = bậc cước theo max(cân thực, cân quy đổi)**, vượt bậc cuối cộng theo mỗi 500 g. Hãng/bảng cước hiện là **số mẫu** (`is_sample`) — Admin thay bằng số thật.

| Method | Route | Role | Mô tả |
| ------ | ----- | ---- | ----- |
| GET | `/shipping/carriers?active=false` | Shipping, Store Owner, Warehouse, Admin | Danh mục hãng + dịch vụ + bảng cước (mặc định chỉ hãng đang dùng) |
| POST | `/shipping/carriers` | Admin | Tạo hãng (`code`, `name`, `volumetric_divisor`, `services[]` gồm `bands[]`, `eta_min_days/eta_max_days`, `extra_price_vnd_per_500g`) |
| PATCH | `/shipping/carriers/:id` | Admin | Sửa hãng (không đổi `code`; `is_active:false` = ngừng dùng) |
| GET | `/shipping/quote/:groupId` | Shipping, Store Owner, Admin | Báo giá MỌI dịch vụ cho nhóm: `{ groupId, parcelCount, strategy, quotes[], recommended }` |
| GET | `/shipping/settings` | Shipping, Store Owner, Admin | Chiến lược chọn hãng: `cheapest` / `fastest` / `fixed` (+ hãng/dịch vụ mặc định) |
| PUT | `/shipping/settings` | Store Owner, Admin | Đổi chiến lược |

Lỗi: `SHIP_INVALID_CARRIER_ID`, `SHIP_CARRIER_NOT_FOUND`, `SHIP_CARRIER_CODE_IN_USE`, `SHIP_SERVICE_NOT_FOUND`, `SHIP_INVALID_RATE_TABLE`, `SHIP_NO_PARCELS` (nhóm chưa có kiện hợp lệ để báo giá), `SHIP_SETTINGS_SERVICE_INVALID`. Seed hãng mẫu: `npx ts-node -r tsconfig-paths/register scripts/seed-shipping-carriers.ts`.

## 7. Staff Assignment — Phân công / Đổi nhân viên phụ trách

| Method | Route                        | Role                        | Mô tả                                                                                                                                                                                                                                                                   |
| ------ | ---------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/order-groups/:id/assign`   | Admin, Warehouse            | **Gán/ĐỔI nhân viên phụ trách 1 nhóm đơn.** Body rỗng = tự động chọn lại người đang ít việc nhất (Least-Busy). Truyền `staff_id` = chỉ định tay 1 người cụ thể (dùng khi cần ĐỔI người đang phụ trách, VD người cũ nghỉ đột xuất, đơn Hỏa Tốc cần người giỏi hơn xử lý) |
| GET    | `/order-groups/staff/search` | Admin, Warehouse, Packaging | Tìm nhân viên theo tên/email, kèm số việc đang xử lý (`activeWorkload`) — dùng để CHỌN AI khi muốn đổi tay ở API trên                                                                                                                                                   |

> **Lưu ý quan trọng — trả lời đúng câu hỏi "sao đơn hỏa tốc không có API đổi người"**: KHÔNG có route riêng "đổi người cho đơn hỏa tốc" — vì **không cần thiết phải tách riêng**. `POST /order-groups/:id/assign` (route ở trên) dùng được cho **MỌI đơn, kể cả hỏa tốc lẫn thường** — không phân biệt. Nếu 1 đơn đang là "express" mà người phụ trách hiện tại xử lý chậm, Admin/Warehouse Staff chỉ cần gọi ĐÚNG route này với `staff_id` của người khác — hệ thống không quan tâm đơn đó thường hay hỏa tốc khi đổi người, tách API riêng cho từng loại đơn sẽ là thừa (2 route làm cùng 1 việc).

**Chi tiết DTO/response — dùng chung cho mục 5, 6 và 7**

| DTO | Field | Type | Req. | Validation/meaning |
|---|---|---:|:---:|---|
| `PickItemDto` | `sku` | string | ✓ | SKU |
|  | `scanned_quantity` | integer | ✓ | Số lượng |
|  | `scan_method` | `barcode\|manual` | ✓ | Cách scan |
|  | `warehouse_id` | ObjectId string | ✓ | Kho |
|  | `client_event_id` | string |  | Idempotency retry |
| `ReportMissingDto` | `sku`, `missing_quantity`, `warehouse_id` | string, integer, ObjectId | ✓ | SKU thiếu, số thiếu, kho |
|  | `note` | string |  | Ghi chú |
|  | `expected_version` | integer | ✓ | Optimistic concurrency |
| `DecidePartialDto` | `approve` | boolean | ✓ | Tiếp tục/hủy làm lại |
|  | `expected_version` | integer | ✓ | Version hiện tại |
| `TransitionOrderGroupDto` | `expected_version` | integer | ✓ | Version hiện tại (pick/ship/deliver/return) |
| `SetPriorityDto` | `order_priority` | `normal\|express` | ✓ | Ưu tiên |
|  | `deadline_hours` | integer |  | Deadline tùy chọn |
| `AssignStaffDto` | `staff_id` | ObjectId string |  | Trống = Least-Busy, có = gán tay |

`OrderGroupResponse` gồm `id`, `platform`, `shopId`, `orderCount`, `fulfillmentStatus`, `assignedStaffId`, `orderPriority`, `packagingDeadline`, `isOverdue`, `version`, `createdAt`, `updatedAt`. `order_priority` nhận `normal|express` để lọc danh sách. Mọi transition kiểm tra status transition và version.

## 8. Kế hoạch đóng gói (`/order-groups/:groupId/packing-plan`) — 🔄 ĐÃ LÀM LẠI 04/10/2026

🔄 **ĐÃ THAY ĐỔI 04/10/2026** — toàn bộ route `/order-groups/:groupId/packaging/*` (generate, approve, adjust, reject, guide, cartonization-preview) và `POST /order-groups/:id/fulfillment/pack` **đã gỡ**. Thay bằng **1 kế hoạch cho cả nhóm** (collection `packing_plans`), gồm mọi đơn và mọi kiện của nhóm:

- **Tự tính**: khi nhóm vào `picked`, job nền (quét mỗi 10 giây) tính kế hoạch rồi chuyển nhóm sang `pending_approval` và báo Packaging Staff — **không còn nút "generate"**. Kế hoạch có trạng thái riêng: `computing` → `ready` (chờ duyệt) → `approved` (chờ đóng) → `packed`; nhánh phụ `failed` (lỗi dữ liệu, kèm `failureReason`), `rejected` (chuyển xử lý ngoài hệ thống), `superseded` (bị thay bởi lần tính mới — không hiện ra API).
- **Bộ giải**: BRKGA (TypeScript, xác định — cùng đầu vào cùng kết quả) cho mọi đơn; đơn ≤ 12 món được service CP-SAT (`packer/`) kiểm tra thêm ở nền. Mỗi đơn có **nhãn chứng minh**: `optimal_global` (không thể ít kiện hơn và mọi tổ hợp thùng rẻ hơn đều không chứa được, đúng với mọi cách xếp), `optimal_in_model` (CP-SAT chứng minh mọi tổ hợp tốt hơn không xếp được theo luật chồng hàng chặt hơn thực tế), `heuristic` (phương án tốt nhất tìm được, chưa chứng minh). `proof` cấp kế hoạch = nhãn yếu nhất các đơn. `cpSatPending: true` = CP-SAT đang chạy, nhãn có thể còn nâng.
- **Không còn "Từ chối, tính lại"**: sai thì **chỉnh tay** (đổi thùng 1 kiện, chuyển món sang kiện khác cùng đơn hoặc tách kiện mới) hoặc **tính lại có điều kiện** (loại thùng, ưu tiên rẻ). `reject` giờ chỉ dùng khi nhóm phải xử lý **ngoài hệ thống** (vd cần thùng gỗ).
- **Khoá lạc quan bằng `version` của kế hoạch** (không phải version nhóm): mọi thao tác ghi gửi `expected_version`; lệch → 409 `PACKING_VERSION_CONFLICT`, tải lại kế hoạch.

| Method | Route | Role | Mô tả |
| ------ | ----- | ---- | ----- |
| GET | `/order-groups/:groupId/packing-plan` | Packaging, Warehouse, Shipping, Store Owner, Admin | `{ plan }` — kế hoạch đang hoạt động, `null` nếu chưa có (nhóm chưa lấy xong hoặc job chưa chạy tới) |
| GET | `/packing-plans/summary?group_ids=a,b,c` | Packaging, Warehouse, Shipping, Store Owner, Admin | `{ summaries[] }` tóm tắt tối đa 200 nhóm (trạng thái, version, nhãn, `cpSatPending`, số kiện, chi phí đóng gói, `failureReason`) — dùng cho bảng hàng chờ |
| POST | `/order-groups/:groupId/packing-plan/recompute` | Packaging, Admin | Tính lại, thay kế hoạch `ready`/`failed`/`rejected` hiện tại (nhóm `pending_approval` tạm về `picked` rồi tính ngay). Body `{ expected_version?, exclude_box_codes?: string[], prefer?: 'fewest_parcels' \| 'cheapest' }` — `expected_version` bắt buộc khi đã có kế hoạch |
| POST | `/order-groups/:groupId/packing-plan/approve` | Packaging, Admin | `ready → approved`, nhóm `pending_approval → approved_for_packing`. Còn đơn chưa xếp hết món → 409 `PACKING_HAS_UNPLACED` |
| POST | `/order-groups/:groupId/packing-plan/reject` | Packaging, Admin | Chuyển xử lý ngoài hệ thống: kế hoạch `rejected` (vẫn hoạt động để job không tự tính lại), nhóm về `picked`, báo Admin. Body `{ expected_version, reason }` (3–500 ký tự) |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/change-box` | Packaging, Admin | Đổi thùng 1 kiện: xếp lại đúng các món của kiện vào thùng mới, phải qua validator (không vừa → 422 `PACKING_BOX_DOES_NOT_FIT`, hết thùng → 409 `PKG_BOX_OUT_OF_STOCK`). Body `{ expected_version, box_code, reason, note? }` |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/move-item` | Packaging, Admin | Chuyển 1 món sang kiện khác **cùng đơn** (`to_parcel_no`) hoặc tách kiện mới (`to_parcel_no` bỏ trống/null — hệ thống chọn thùng). Cả 2 kiện bị ảnh hưởng xếp lại và validate. Sang kiện của đơn khác → 400 `PACKING_MOVE_ACROSS_ORDERS`. Body `{ expected_version, item_key, to_parcel_no?, reason, note? }` |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/guide` | Packaging, Warehouse, Admin | Hướng dẫn đóng gói từng bước cho 1 kiện (engine quyết định vị trí/thứ tự, AI Groq viết lời; chưa cấu hình/AI trả sai → câu mẫu). Body `{ regenerate? }`. Không cần `expected_version`, không đổi `version`. Giới hạn 10 lần/phút |
| POST | `/order-groups/:groupId/packing-plan/pack` | Packaging, Warehouse, Admin | `approved → packed`, nhóm `approved_for_packing → packed`. Body `{ expected_version, parcels: [{ parcel_no, weight_kg }] }` — **cân đủ mọi kiện, mỗi kiện đúng 1 lần** (sai → 400 `PACKING_PACK_WEIGHTS_MISMATCH`). Trừ 1 thùng/kiện + vật tư (thiếu vật tư không chặn, ghi `materialsShortfall`); lệch > 20% so với cân ước tính → `isAbnormal` + thông báo Store Owner |

`reason` của chỉnh tay: `PRODUCT_MORE_FRAGILE_THAN_EXPECTED` / `RECOMMENDED_BOX_NOT_IN_STOCK` / `OTHER` (`OTHER` bắt buộc `note`, thiếu → 400 `PACKING_NOTE_REQUIRED`). Mọi chỉnh tay ghi vào `adjustments[]`.

**Response `plan`** (camelCase, đơn vị mm và gram, trục z hướng lên): `id`, `orderGroupId`, `revision` (lần tính thứ mấy), `version`, `status`, `failureReason`, `proof`, `cpSatPending`, `orders[]` (`orderId`, `platformOrderId`, `status` `ok|partial|no_fit`, `unplaced[]` `{itemKey, code, reason}`, `proof`, `lowerBoundParcels`, `explanation[]`, `strategy`, `cpSat` `pending|done|skipped|unavailable`), `parcels[]` (`parcelNo` 1..N trong cả nhóm, `orderId`, `platformOrderId`, `box` `{code, name, innerMm, outerMm, tareG, maxLoadG, priceVnd}`, `placements[]` `{itemKey, sku, step, x, y, z, dx, dy, dz, orientation, folded}`, `fillRatio`, `itemsWeightG`, `estimatedWeightG`, `volumetricWeightG`, `materials[]`, `materialsWeightG`, `materialsCostVnd`, `shippingCostVnd`, `guide`, `actualWeightKg`, `isAbnormal`, `materialsShortfall[]`), `itemProfiles[]`, `adjustments[]`, `solver` `{engineVersion, computationMs, options}`, `totals` `{parcels, packagingCostVnd, estimatedWeightG}`, `approvedAt`, `rejectedAt`, `rejectionReason`, `packedAt`, `createdAt`, `updatedAt`.

Dữ liệu cũ: `packaging_recommendations` giữ nguyên làm lịch sử. Nhóm đang `pending_approval`/`approved_for_packing` chỉ có phương án cũ cần chạy `npx ts-node -r tsconfig-paths/register scripts/migrate-to-packing-plans.ts` (mặc định chỉ in, `--apply` mới ghi; nhãn luôn `heuristic`).

## 8b. 🆕 Danh mục thùng (`/packaging/boxes`) — 21/09/2026

| Method | Route | Role | Mô tả |
| ------ | ----- | ---- | ----- |
| GET | `/packaging/boxes?active=true` | Packaging, Warehouse, Store Owner, Admin | Danh mục thùng (mặc định chỉ thùng đang dùng) |
| POST | `/packaging/boxes` | Admin | Thêm thùng |
| PATCH | `/packaging/boxes/:id` | Admin | Sửa thùng, 🆕 `reorder_level`, `storage_location` / ngừng dùng (`is_active: false`). Không sửa được tồn |
| POST | `/packaging/boxes/:id/stock-in` | Admin, Warehouse | 🆕 22/09: nhập thêm thùng `{ quantity, note? }`, ghi 1 dòng sổ |
| GET | `/packaging/boxes/:id/movements` | Admin, Warehouse, Packaging | 🆕 22/09: sổ xuất/nhập 20 dòng gần nhất |

Body (đơn vị **mm/g**, số nguyên): `code`, `name`, `inner{length_mm,width_mm,height_mm}` (lòng thùng), `outer{...}` (≥ lòng thùng), `tare_g`, `max_load_g`, `price_vnd?`. Response có `isSample` = thùng mẫu seed tạm (số giả lập). 🆕 22/09: response có tồn kho `quantityOnHand`, `reserved` (phương án chưa đóng giữ chỗ), `available` (còn trống — engine chỉ chọn thùng `available > 0`), `reorderLevel`, `storageLocation`, `stockStatus`. Tồn chỉ đổi qua `stock-in` hoặc lúc `pack` (mỗi kiện trừ 1 thùng); thiếu thùng → 409 `PKG_BOX_OUT_OF_STOCK`. Module `/materials/cartons` cũ đã gỡ (gộp vào đây). Nhập hàng loạt từ CSV (cm/g): `npx ts-node scripts/seed-packaging-boxes.ts ./boxes.csv`.

## 8c. 🆕 Hồ sơ đóng gói SKU (`/product-master`) — 21/09/2026

| Method | Route | Role | Mô tả |
| ------ | ----- | ---- | ----- |
| GET | `/product-master?status=needs_measurement&shop_id=` | Warehouse, Packaging, Admin | Danh sách SKU (lọc SKU cần đo). Có `marketplaceDimension` (số Lazada khai) để tham khảo |
| PUT | `/product-master/:id/packaging-profile` | Warehouse, Admin | Kho xác nhận số đo THẬT sau gấp/bọc → hồ sơ `ready` (engine mới dùng được) |

Body: `length_cm`, `width_cm`, `height_cm`, `weight_kg`, `is_fragile`, `orientation_rule` (`any` = xoay 6 hướng / `upright_only` = chỉ xoay quanh trục đứng, VD hộp giày), `max_stack_load_kg?` (bỏ trống = không cho đặt gì lên trên). 🆕 **21/09/2026 lần 3**: thêm `product_category` (**bắt buộc** — `t_shirt`, `shirt`, `jacket`, `shorts`, `trousers`, `dress`, `shoes`, `sandals`, `accessory`, `other`; dùng cho hình 3D + lời hướng dẫn), `zip_bag_code?` (mã túi trong `/packaging/bags`, null = không dùng túi; mã không có/ngừng dùng → 422 `PM_ZIP_BAG_NOT_FOUND`), `zip_bag_folded?` (gập đôi túi). Có túi thì số đo là của gói **sau khi đã đóng túi (và gập)** — kho tự đo. Response thêm `productCategory`, `zipBagCode`, `zipBagFolded`. 🆕 **22/09/2026**: thêm `can_fold_in_half?` (hàng mềm gập đôi thêm được khi cần; response `canFoldInHalf`); bật cho loại `shoes` → 422 `PM_FOLD_NOT_ALLOWED`. Quần áo (`t_shirt`, `shirt`, `jacket`, `shorts`, `trousers`, `dress`) **luôn được xếp nằm phẳng**, bất kể `orientation_rule`. Đồng bộ Lazada **không ghi đè** hồ sơ đã `ready` (sửa lỗi 21/09: trước đây mỗi lần sync reset về `needs_measurement`).

## 8d. 🆕 Danh mục túi zip (`/packaging/bags`) — 21/09/2026

Túi zip bọc **từng món** (áo, quần…) trước khi xếp vào thùng — khác thùng carton (bao bì ngoài). Engine **không** dùng kích thước túi; dùng cho hướng dẫn đóng gói, cấp vật tư, chi phí.

| Method | Route | Role | Mô tả |
| ------ | ----- | ---- | ----- |
| GET | `/packaging/bags?active=true` | Packaging, Warehouse, Store Owner, Admin | Danh mục túi (mặc định chỉ túi đang dùng) |
| POST | `/packaging/bags` | Admin | Thêm túi: `code`, `name`, `width_mm`, `length_mm` (trải phẳng), `price_vnd?` |
| PATCH | `/packaging/bags/:id` | Admin | Sửa túi / ngừng dùng (`is_active: false`) |

Lỗi: `PKG_INVALID_BAG_ID` (400), `PKG_BAG_NOT_FOUND` (404), `PKG_BAG_CODE_IN_USE` (409). Phương án đóng gói (`GET .../packaging`) có thêm `itemProfiles[]` = `{ sku, productCategory, zipBagCode, zipBagFolded }` chụp từ hồ sơ SKU lúc tính.

## 8e. 🆕 Vật tư chèn (`/packaging/materials`) — 28/09/2026

Góc xốp, tấm ngăn carton, gối hơi, xốp hơi, tem cảnh báo dễ vỡ. **Số lượng trên mỗi phương án là ƯỚC LƯỢNG theo bộ luật** (loại hàng, số món, độ trống của thùng) — vật tư **không** chiếm thể tích trong hình học/validator, đừng trình bày như lượng đệm tính chính xác. Danh mục trống = engine vẫn đóng gói bình thường nhưng `materials` rỗng.

| Method | Route | Role | Mô tả |
| ------ | ----- | ---- | ----- |
| GET | `/packaging/materials?active=true` | Packaging, Warehouse, Store Owner, Admin | Danh mục vật tư + tồn (mặc định chỉ vật tư đang dùng) |
| POST | `/packaging/materials` | Admin | Thêm vật tư: `code`, `name`, `type` (`foam_corner` \| `corrugated_divider` \| `air_pillow` \| `bubble_wrap` \| `fragile_tape`), `unit`, `weight_g_per_unit`, `price_vnd_per_unit`, `reorder_level?`, `storage_location?`. Tồn ban đầu 0 |
| PATCH | `/packaging/materials/:id` | Admin | Sửa tên/đơn vị/khối lượng/giá/mức cảnh báo/vị trí hoặc ngừng dùng (`is_active: false`). Không sửa được `code`, `type`, tồn |
| POST | `/packaging/materials/:id/stock-in` | Admin, Warehouse | Nhập thêm `{ quantity, note? }`, ghi 1 dòng sổ |
| GET | `/packaging/materials/:id/movements` | Admin, Warehouse, Packaging | Sổ xuất/nhập 20 dòng gần nhất (`reason`: `stock_in` \| `pack`) |
| GET | `/packaging/materials/rules` | Packaging, Warehouse, Store Owner, Admin | Bộ luật chọn vật tư hiện hành. `version: null` + `isDefault: true` = luật mặc định trong code |
| PUT | `/packaging/materials/rules` | Admin | Lưu bộ luật mới `{ rules[] }` (tạo version kế tiếp, bản cũ tắt — giữ lịch sử). Áp dụng từ lần tính kế hoạch sau |

Luật (`rules[]`): `material_type`, `applies_to` (`fragile` \| `shoes` \| `fragile_or_shoes` \| `any`), `min_units?`, `basis` (`per_unit` \| `per_extra_unit` \| `per_carton` \| `void_band`), `quantity?`, `void_bands?` (`[{ min_void_ratio, quantity }]`, chỉ dùng cho `void_band`).

Response vật tư: `id, code, name, type, unit, weightGPerUnit, priceVndPerUnit, quantityOnHand, reorderLevel, storageLocation, isSample, isActive, stockStatus` (`in_stock` \| `low_stock` \| `out_of_stock`). **Khác thùng:** không có `reserved/available` — vật tư không giữ chỗ mềm.

**Trừ tồn + thiếu vật tư:** vật tư được trừ lúc đóng gói (🔄 04/10: `POST .../packing-plan/pack`) (cùng transaction với thùng, mỗi lần 1 dòng sổ). Thiếu vật tư **không chặn** đóng gói (khác thùng: hết thùng → 409 `PKG_BOX_OUT_OF_STOCK`) — trừ phần có, phần thiếu ghi vào `materialsShortfall` của kiện và bắn Notification `low_material_stock` cho Admin + Store Owner (cũng bắn khi tồn rơi xuống ≤ `reorderLevel`).

Phương án đóng gói (`GET .../packaging`) — 🔄 ĐÃ ĐỔI 28/09: `materials[]` giờ là `{ type, quantity, code, name, unit, weightG, costVnd }` (bản ghi trước 28/09 chỉ có `type` + `quantity`, các field còn lại `null`/`0`); thêm `materialsWeightG`, `materialsCostVnd`, `materialsShortfall[]` (`{ code, missing }`). `estimatedPackageWeightG` **đã cộng** khối lượng vật tư (hàng + bì thùng + vật tư).

Lỗi: `PKG_INVALID_MATERIAL_ID` (400), `PKG_MATERIAL_NOT_FOUND` (404), `PKG_MATERIAL_CODE_IN_USE` (409), `PKG_MATERIAL_RULES_CONFLICT` (409 — 2 Admin lưu luật cùng lúc, tải lại rồi lưu lại).

## 9. Warehouse (`/warehouse`)

🔄 **ĐÃ ĐỔI (16/09/2026)** — thêm 3 route GET còn thiếu (trước đây chỉ tạo được, không xem lại được); sửa `GET .../zones` không trả dữ liệu dù đã tạo thành công (ép kiểu `ObjectId` tường minh).

| Method | Route                                                                          | Role                   | Mô tả                                                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/warehouse/warehouses`                                                        | Admin                  | Tạo kho mới (bước 1/4)                                                                                                                                                                                                |
| GET    | `/warehouse/warehouses`                                                        | Admin, Warehouse Staff | 🔄 Danh sách kho — **mở thêm Warehouse Staff (19/09/2026)**: trước đây chỉ Admin xem được, nhưng picking-list/pick-item/report-missing đều bắt buộc `warehouse_id`, Warehouse Staff không có cách nào biết ID kho nào |
| POST   | `/warehouse/warehouses/:warehouseId/zones`                                     | Admin                  | Tạo khu trong kho (bước 2/4)                                                                                                                                                                                          |
| GET    | `/warehouse/warehouses/:warehouseId/zones`                                     | Admin                  | 🔄 Danh sách khu trong 1 kho — **sửa lỗi 16/09/2026**: trước đây có thể không trả ra dữ liệu dù tạo thành công                                                                                                        |
| POST   | `/warehouse/zones/:zoneId/bin-locations/generate`                              | Admin                  | Tạo HÀNG LOẠT kệ theo dãy/rack/tầng (bước 3/4)                                                                                                                                                                        |
| 🆕 GET | `/warehouse/zones/:zoneId/bin-locations`                                       | Admin                  | **MỚI (16/09/2026)** — Danh sách kệ đã tạo trong 1 khu (trước đây chỉ tạo được, không xem lại được)                                                                                                                   |
| 🆕 GET | `/warehouse/warehouses/:warehouseId/bin-locations`                             | Admin                  | **MỚI (16/09/2026)** — Danh sách TOÀN BỘ kệ trong 1 kho (gộp mọi khu)                                                                                                                                                 |
| POST   | `/warehouse/warehouses/:warehouseId/sku-bin-assignments`                       | Admin                  | Gán 1 SKU vào 1 kệ, kèm số lượng ban đầu (bước 4/4)                                                                                                                                                                   |
| 🆕 GET | `/warehouse/warehouses/:warehouseId/sku-bin-assignments`                       | Admin                  | **MỚI (16/09/2026)** — Danh sách SKU đã gán vị trí trong 1 kho (trước đây chỉ GET được danh sách CHƯA gán, không GET được danh sách ĐÃ gán)                                                                           |
| POST   | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock` | Admin                  | Nhập thêm hàng (cộng dồn, không ghi đè)                                                                                                                                                                               |
| GET    | `/warehouse/sku-bin-assignments/unassigned`                                    | Admin                  | SKU đã có trong hệ thống nhưng CHƯA gán kệ                                                                                                                                                                            |
| 🆕 GET | `/warehouse/:warehouseId/picking-list?group_ids=G1,G2`                         | Warehouse, Admin       | **MỚI (29/09/2026, Mục 9.5, hàng #3)** — picking list GỘP nhiều Order Group cùng lúc (đi lấy hàng 1 vòng kho cho nhiều đơn "giao chung chuyến"); mỗi dòng vẫn gắn đúng `order_group_id` gốc (KHÔNG cộng dồn trùng SKU giữa 2 group), join bin/zone 1 lần duy nhất trên toàn bộ SKU (Rule #16). `group_ids` sai định dạng/rỗng → 400 `WH_INVALID_GROUP_IDS` |
| GET    | `/warehouse/:warehouseId/picking-list/:groupId`                                | Warehouse, Admin       | Picking list CÓ vị trí kệ thật CHO 1 group, đã sắp xếp theo lộ trình đi (🔄 21/09: cùng shape mới — `picked_quantity`, số đo có thể `null`) — giữ nguyên, route trên là bản GỘP cộng thêm                          |

**Chi tiết DTO**

| DTO | Field | Type | Req. | Meaning |
|---|---|---:|:---:|---|
| Create warehouse | `warehouse_code`, `warehouse_name`, `address` | string | ✓ | Mã, tên, địa chỉ; min length 1 |
| Create zone | `zone_code`, `zone_name` | string | ✓ | Mã/tên khu |
|  | `description` | string |  | Mô tả |
| Generate bins | `aisle` | string | ✓ | Mã dãy |
|  | `rack_from`, `rack_to`, `level_from`, `level_to` | integer | ✓ | Khoảng rack/tầng, min 1 |
| Assign SKU | `platform`, `shop_id`, `seller_sku`, `bin_location_id` | enum/string/ObjectId | ✓ | SKU và vị trí |
|  | `initial_quantity` | integer |  | Mặc định 0, min 0 |
| Restock | `quantity` | integer | ✓ | Số nhập thêm, min 1 |

## 10. Notifications (`/notifications`)

| Method | Route                         | Role   | Mô tả                                                       |
| ------ | ----------------------------- | ------ | ----------------------------------------------------------- |
| GET    | `/notifications`              | Bất kỳ | Danh sách thông báo của chính user đang login               |
| GET    | `/notifications/unread-count` | Bất kỳ | Số chưa đọc — FE gọi định kỳ (polling) cho chuông thông báo |
| PATCH  | `/notifications/:id/read`     | Bất kỳ | Đánh dấu 1 thông báo đã đọc                                 |

Danh sách là hợp của notification đích danh user và broadcast role. `is_read` nhận chuỗi query; chỉ `true` được parse thành true.

## 11. Collection nội bộ và planned

Không có public CRUD tổng quát cho `refresh_tokens`, `trusted_devices`, `login_audit_logs`, `marketplace_oauth_states`, `orders`, `order_groups`, `pick_events`, `packaging_recommendations` (🔄 04/10: chỉ còn là lịch sử, không còn API) và `packing_plans` (đọc/ghi qua mục 8). (`product_master` có API hồ sơ đóng gói ở mục 8c; `packaging_boxes` ở mục 8b; `shipments` có API tạo ở mục 6b nhưng không có GET liệt kê riêng.)

🔄 **ĐÃ ĐỔI (29/09/2026)**: `processed_webhook_events` KHÔNG còn "chuẩn bị sẵn, chưa ai dùng" — đã có consumer thật (`POST /marketplace/webhooks/:platform`, mục 3b) ghi/đọc để chống xử lý trùng 1 sự kiện (Rule #17).

Planned: nhánh túi mailer, bảng cước thật; webhook/Kafka/event queue; carrier/pickup/tracking thật của hãng.

---

## Ma trận theo Role

### 👑 Admin

Toàn quyền — gọi được mọi route liệt kê ở trên.

### 🏪 Store Owner

```
GET   /users                          Xem danh sách nhân viên
GET   /orders, /orders/:id            MỚI (2026-09-11) — xem đơn hàng của shop mình
GET   /order-groups, /:id             MỚI (2026-09-11) — xem tổng quan nhóm đơn + fulfillment
PATCH /order-groups/:id/priority      Đánh dấu Hỏa Tốc — DUY NHẤT role này (ngoài Admin)
GET   /notifications*                 Nhận cảnh báo thiếu hàng, SLA breach, sync failed
+ 6 route tự phục vụ (me, change-password, mfa, logout)
```

### 📦 Warehouse Staff

```
GET   /order-groups, /:id, /picking-list, /picking-list/:sku    Xem việc cần làm
POST  .../pick-item, /pick, /return, /report-missing           Thao tác lấy hàng
GET   /order-groups/:groupId/packing-plan, /packing-plans/summary  🔄 04/10 — xem kế hoạch + 3D lúc đóng
POST  .../packing-plan/pack, /parcels/:no/guide                 🔄 04/10 — đóng gói từng bước, cân từng kiện
GET   /product-master, PUT /product-master/:id/packaging-profile  Đo và xác nhận hồ sơ SKU
GET   /packaging/boxes                                          Danh mục thùng
POST  /order-groups/:id/assign                                  Tự nhận việc HOẶC đổi cho đồng nghiệp khác
GET   /order-groups/staff/search                                Tìm đồng nghiệp để chuyển việc
GET   /warehouse/:warehouseId/picking-list/:groupId              Picking list có vị trí kệ (1 nhóm)
GET   /warehouse/:warehouseId/picking-list?group_ids=            MỚI (29/09) — picking list gộp nhiều nhóm (giao chung chuyến)
GET   /notifications*
```

### 🎁 Packaging Staff

```
GET   /order-groups, /:id, /:groupId/packing-plan    🔄 04/10 — xem kế hoạch cần duyệt
GET   /packing-plans/summary                         Bảng hàng chờ đóng gói
POST  .../packing-plan/approve, /recompute, /reject  Duyệt / tính lại có điều kiện / chuyển xử lý tay
POST  .../packing-plan/parcels/:no/change-box, /move-item  Chỉnh tay: đổi thùng, chuyển món
POST  .../packing-plan/pack, /parcels/:no/guide       Đóng gói + cân từng kiện
GET   /packaging/boxes, /product-master               Tra danh mục thùng + hồ sơ SKU
POST  .../fulfillment/decide-partial                  Quyết định đơn thiếu hàng
GET   /order-groups/staff/search                       Xem tải việc của Warehouse Staff (tham khảo)
GET   /notifications*
```

### 🚚 Shipping Coordinator

```
GET   /order-groups, /:id, /:groupId/packing-plan, /:id/linked
POST  .../fulfillment/ship, /deliver, /return
POST  /shipments/batch          MỚI (29/09) — tạo vận đơn, giao chung chuyến cho nhiều nhóm cùng người nhận
GET   /notifications*
```

**Ghi chú**: 🔄 30/09 Shipping Coordinator đã có báo giá/chọn hãng/hẹn lấy hàng (`/shipping`, `/shipments`, mục 6b–6d); chưa có tracking thật từ hãng.

---

## Bảng mã lỗi

Xem chi tiết đầy đủ ở `INTEGRATION_GUIDE_FULFILLMENT.md` PHẦN D.3 (đã đổi cấu trúc từ "mục 1-10" sang "PHẦN A-D" từ bản v3) — không lặp lại ở đây tránh 2 nguồn dễ lệch nhau.

Bảng tra nhanh theo module (chi tiết "khi nào xảy ra" vẫn ở guide trên):

| Module | Codes |
|---|---|
| Auth/Google | `AUTH_*`, `GOOGLE_*` theo service và `GoogleOAuthErrorCode` |
| Marketplace | `MKT_OAUTH_STATE_INVALID`, `MKT_ADAPTER_NOT_REGISTERED`, `MKT_SHOP_NOT_CONNECTED`, `MKT_TOKEN_EXCHANGE_FAILED`, `MKT_TOKEN_REFRESH_FAILED`, `MKT_TOKEN_DECRYPT_FAILED`, `MKT_WEBHOOK_SIGNATURE_INVALID`, `MKT_SHOP_LOOKUP_FAILED`, `MKT_SERVER_ERROR` |
| Orders | `ORD_SYNC_FAILED`, `ORD_UNSUPPORTED_PLATFORM`, `ORD_INVALID_ORDER_ID`, `ORD_ORDER_NOT_FOUND` |
| Order Groups | `ORD_GROUP_INVALID_ID`, `ORD_GROUP_NOT_FOUND`, `ORD_GROUP_STATE_CONFLICT`, `ORD_GROUP_INVALID_TRANSITION`, `ORD_GROUP_INSUFFICIENT_STOCK`, `ORD_GROUP_ITEM_NOT_IN_GROUP`, `ORD_GROUP_PACKAGING_PROFILE_NOT_READY`, `ORD_GROUP_ALL_ORDERS_CANCELED`, 🆕 21/09: `ORD_GROUP_PICK_NOT_ALLOWED`, `ORD_GROUP_PICK_EXCEEDS_ORDERED`, `ORD_GROUP_PICK_INCOMPLETE`, `ORD_GROUP_NO_PICK_EVENTS` |
| Staff assignment | `ORD_GROUP_NO_STAFF_AVAILABLE`, `ORD_GROUP_STAFF_NOT_FOUND`, `ORD_GROUP_STAFF_INACTIVE` |
| Shipping 🆕 30/09 | `SHIP_INVALID_CARRIER_ID`, `SHIP_CARRIER_NOT_FOUND`, `SHIP_CARRIER_CODE_IN_USE`, `SHIP_SERVICE_NOT_FOUND`, `SHIP_INVALID_RATE_TABLE`, `SHIP_NO_PARCELS`, `SHIP_SETTINGS_SERVICE_INVALID` |
| Documents 🆕 30/09 | `DOC_NO_ORDERS`, `DOC_SHIPMENT_NOT_FOUND`, `DOC_TRIP_NOT_FOUND` |
| Hoàn hàng 🆕 30/09 | `ORD_GROUP_RETURN_NOT_RETURNED`, `ORD_GROUP_RETURN_ALREADY_RECEIVED`, `ORD_GROUP_RETURN_EXCEEDS_SHIPPED`, `ORD_GROUP_RETURN_SKU_NOT_ASSIGNED`, `ORD_GROUP_RETURN_DUPLICATE_LINE` |
| Shipments 🆕 29/09 | `SHP_PICKUP_IN_PAST`, `SHP_SHIPMENT_NOT_FOUND`, `SHP_EMPTY_GROUP_LIST`, `SHP_GROUP_NOT_PACKED`, `SHP_RECIPIENT_MISMATCH`, `SHP_GROUP_ALREADY_SHIPPED` |
| Packaging (danh mục) | `PKG_INVALID_BOX_ID`, `PKG_BOX_NOT_FOUND`, `PKG_BOX_CODE_IN_USE`, `PKG_BOX_INVALID_DIMENSIONS`, `PKG_BOX_OUT_OF_STOCK`, `PKG_INVALID_BAG_ID`, `PKG_BAG_NOT_FOUND`, `PKG_BAG_CODE_IN_USE`, `PKG_INVALID_MATERIAL_ID`, `PKG_MATERIAL_NOT_FOUND`, `PKG_MATERIAL_CODE_IN_USE`, `PKG_MATERIAL_RULES_CONFLICT` (🔄 04/10: các mã của phương án cũ — `PKG_*RECOMMENDATION*`, `PKG_HAS_NO_FIT`, `PKG_ADJUSTMENT_NOTE_REQUIRED`, `PKG_CARTON_NOT_FOUND`... — đã gỡ) |
| Kế hoạch đóng gói 🆕 04/10 | `PACKING_INVALID_ID` (400), `PACKING_PLAN_NOT_FOUND` (404), `PACKING_PLAN_COMPUTING` (409), `PACKING_WRONG_PLAN_STATUS` (409), `PACKING_VERSION_CONFLICT` (409), `PACKING_HAS_UNPLACED` (409), `PACKING_PARCEL_NOT_FOUND` (404), `PACKING_ITEM_NOT_IN_PARCEL` (404), `PACKING_MOVE_ACROSS_ORDERS` (400), `PACKING_BOX_DOES_NOT_FIT` (422), `PACKING_NOTE_REQUIRED` (400), `PACKING_PACK_WEIGHTS_MISMATCH` (400), `PACKING_GUIDE_NOT_AVAILABLE` (409) |
| Product Master | 🆕 21/09: `PM_INVALID_ID`, `PM_NOT_FOUND` |
| Warehouse | `WH_WAREHOUSE_NOT_FOUND`, `WH_ZONE_NOT_FOUND`, `WH_INVALID_BIN_RANGE`, `WH_WAREHOUSE_CODE_IN_USE`, `WH_ZONE_CODE_IN_USE` (2 mã cuối 🆕 19/09/2026 — trùng mã kho/khu, trả 409 thay vì 500), `WH_INVALID_GROUP_IDS` (🆕 29/09/2026 — 400, `group_ids` rỗng/sai định dạng ở picking-list gộp) |
| Notifications | `NOTI_INVALID_ID`, `NOTI_NOT_FOUND` |
