# OptiPackAI — Danh sách API đầy đủ theo Role

Tài liệu này liệt kê **toàn bộ** route thật đang tồn tại trong code (đã quét trực tiếp từ `@Controller`/`@Roles` decorator, không phải từ trí nhớ/thiết kế) — dùng làm nguồn tham chiếu DUY NHẤT khi cần biết "route này ai gọi được, dùng để làm gì". Cập nhật lần cuối: 2026-09-22 — 🆕 tồn kho thùng trong `/packaging/boxes` (stock-in, sổ xuất/nhập, engine chỉ chọn thùng còn trống), gỡ `/materials`; 2026-09-21 lần 3: 🆕 danh mục túi zip `/packaging/bags` (mục 8d), hồ sơ SKU thêm loại sản phẩm + túi zip (mục 8c), hướng dẫn đóng gói bằng AI; lần 2: 🆕 engine đóng gói 3D (mỗi đơn 1 kiện, tọa độ xếp cho animation), danh mục thùng `/packaging/boxes`, hồ sơ SKU `/product-master`, `pick`/`pick-item` đối soát số lượng, `pack` nhận cân từng kiện (mục 6, 8, 8b, 8c); lần 1: đồng bộ luồng lấy hàng trước, đóng gói sau; trước đó 2026-09-20 (gộp bản contract từ nhánh `thi_dev`: thêm mục Quy ước, mục 0 System, bảng DTO/field cho từng module, mục 11 collection nội bộ/planned và bảng mã lỗi theo module).

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

`platform` là enum marketplace. Callback state dùng một lần để chống CSRF. Access/refresh token được mã hóa trong `marketplace_shops`, không expose.

## 4. Orders (`/orders`)

| Method | Route                 | Role                   | Mô tả                                                                               |
| ------ | --------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| POST   | `/orders/lazada/sync` | Admin                  | Kích hoạt tay 1 lần đồng bộ đơn từ Lazada (thao tác kỹ thuật, giữ nguyên chỉ Admin) |
| GET    | `/orders`             | **Admin, Store Owner** | Danh sách đơn đã đồng bộ                                                            |
| GET    | `/orders/:id`         | **Admin, Store Owner** | Chi tiết 1 đơn hàng                                                                 |

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
| GET    | `/order-groups/:id`                   | **Store Owner**, Warehouse, Packaging, Shipping, Admin | Chi tiết 1 nhóm đơn — đọc `version` ở đây trước mọi request ghi                                                                                   |
| GET    | `/order-groups/:id/picking-list`      | Warehouse, Admin                                       | Toàn bộ SKU cần lấy. 🔄 21/09: mỗi dòng có `quantity` (số đặt), `picked_quantity` (đã quét trong lượt), `packaging_profile_ready`; số đo `null` nếu SKU chưa đo — **không còn 422 khi SKU chưa có hồ sơ** |
| GET    | `/order-groups/:id/picking-list/:sku` | Warehouse, Admin                                       | Chi tiết 1 SKU riêng lẻ trong nhóm đơn (cùng shape dòng picking-list ở trên)                                                                      |

## 6. Order Groups — Fulfillment (ghi trạng thái)

| Method | Route                                          | Role                       | Mô tả                                                                |
| ------ | ---------------------------------------------- | -------------------------- | -------------------------------------------------------------------- |
| POST   | `/order-groups/:id/fulfillment/pick-item`      | Warehouse, Admin           | Quét/nhập tay 1 SKU — trừ tồn + ghi pick_event trong 1 transaction, chống trừ trùng khi mất mạng. 🔄 21/09: chỉ khi group `picking`; chặn quét vượt số đặt trong lượt; KHÔNG cần hồ sơ đóng gói |
| POST   | `/order-groups/:id/fulfillment/report-missing` | Warehouse, Admin           | Báo thiếu hàng lúc lấy — dừng đơn, báo Store Owner, chờ duyệt        |
| POST   | `/order-groups/:id/fulfillment/decide-partial` | Packaging, Admin           | Duyệt tiếp với phần có sẵn, hoặc hủy làm lại (🔄 21/09: hủy = mở lượt lấy mới `pick_round + 1`, không đếm lại lượt cũ; tồn kho không tự cộng lại) |
| POST   | `/order-groups/:id/fulfillment/pick`           | Warehouse, Admin           | `picking → picked`: 🔄 21/09 server đối soát mọi SKU đã quét đủ số đặt trong lượt; thiếu → 409 `ORD_GROUP_PICK_INCOMPLETE` kèm danh sách |
| POST   | `/order-groups/:id/fulfillment/pack`           | Warehouse, Admin           | `approved_for_packing → packed`: 🔄 21/09 body `packages[]` = cân THẬT từng kiện (mỗi đơn 1 kiện); lệch > 20% so với ước tính (hàng + bì) → `isAbnormal` + thông báo Store Owner. Xử lý ở module packaging |
| POST   | `/order-groups/:id/fulfillment/ship`           | Shipping, Admin            | Xác nhận đã bàn giao vận chuyển                                      |
| POST   | `/order-groups/:id/fulfillment/deliver`        | Shipping, Admin            | Xác nhận đã giao thành công tới khách                                |
| POST   | `/order-groups/:id/fulfillment/return`         | Shipping, Warehouse, Admin | Ghi nhận hoàn hàng (từ shipped hoặc delivered)                       |
| PATCH  | `/order-groups/:id/priority`                   | **Store Owner**, Admin     | Đánh dấu đơn Hỏa Tốc/Bình thường, tự tính hạn đóng gói               |

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
| `PackGroupDto` (🆕 21/09, route `pack`) | `packages[].order_id` | ObjectId string | ✓ | Đơn của kiện — phải đủ mọi kiện đã duyệt, mỗi đơn 1 lần |
|  | `packages[].actual_weight_kg` | number | ✓ | Cân thật cả kiện, > 0 |
|  | `expected_version` | integer | ✓ | Version group |
| `SetPriorityDto` | `order_priority` | `normal\|express` | ✓ | Ưu tiên |
|  | `deadline_hours` | integer |  | Deadline tùy chọn |
| `AssignStaffDto` | `staff_id` | ObjectId string |  | Trống = Least-Busy, có = gán tay |

`OrderGroupResponse` gồm `id`, `platform`, `shopId`, `orderCount`, `fulfillmentStatus`, `activePackagingRecommendationId`, `assignedStaffId`, `orderPriority`, `packagingDeadline`, `isOverdue`, `version`, `createdAt`, `updatedAt`. `order_priority` nhận `normal|express` để lọc danh sách. Mọi transition kiểm tra status transition và version.

## 8. Packaging — UC-04 (`/order-groups/:groupId/packaging`)

🔄 **ĐÃ ĐỔI (21/09/2026)** — đóng gói diễn ra SAU lấy hàng. **Lần 2 cùng ngày:** `generate` chia hàng đã quét về **từng đơn** (mỗi đơn 1 kiện) rồi chạy **engine greedy 3D + validator** trên danh mục thùng thật (`/packaging/boxes`). Không thùng nào hợp lệ → `solutionStatus: "no_fit"` (không còn trả thùng Large). Approve **không nhận cân** nữa; cân chuyển sang `fulfillment/pack`.

| Method | Route                                       | Role                                  | Mô tả                                                     |
| ------ | ------------------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| GET    | `/order-groups/:groupId/packaging`          | Packaging, Warehouse, Shipping, **Store Owner**, Admin | 🔄 Trả `{ orderGroupId, recommendations[] }` — mỗi đơn 1 phần tử, kèm `placements[]` (tọa độ mm) cho animation 3D. Mảng rỗng nếu chưa generate |
| POST   | `/order-groups/:groupId/packaging/generate` | **Chỉ Admin** (trigger tự động là BE-5) | `picked → pending_approval`: engine 3D tính phương án cho từng đơn |
| POST   | `/order-groups/:groupId/packaging/approve`  | Packaging, Admin                      | `pending_approval → approved_for_packing`: chốt mọi đơn. Bị chặn nếu còn đơn `no_fit` (`PKG_HAS_NO_FIT`) |
| POST   | `/order-groups/:groupId/packaging/adjust`   | Packaging, Admin                      | 🔄 Đổi thùng cho **1 đơn** (`order_id` + `box_code` trong danh mục): engine xếp lại, validator phải chấp nhận (không vừa → 422 `PKG_BOX_DOES_NOT_FIT`). Lưu lý do. Group vẫn chờ approve |
| POST   | `/order-groups/:groupId/packaging/reject`   | Packaging, Admin                      | `pending_approval → picked`: vô hiệu hóa mọi phương án, gọi lại generate |
| POST   | `/order-groups/:groupId/packaging/:recommendationId/guide` | Packaging, Warehouse, Admin | 🆕 21/09: hướng dẫn đóng gói từng bước cho 1 đơn (animation 3D). Engine quyết định vị trí/thứ tự, AI viết lời (Groq); chưa cấu hình/AI trả sai → câu mẫu (`packingGuide.source = template`). Body `{ regenerate?: boolean }`. Đơn `no_fit` → 409 `PKG_GUIDE_NOT_AVAILABLE`. Giới hạn 10 lần/phút |

**Chi tiết DTO**

| DTO | Field | Type | Req. | Meaning |
|---|---|---:|:---:|---|
| Approve | `expected_group_version` | integer | ✓ | Version group |
|  | `actual_measured_weight_kg` | number |  | ⚠️ Deprecated từ 21/09 — bỏ qua; cân nhập ở `fulfillment/pack` |
| Adjust | `order_id` | ObjectId string | ✓ | Đơn cần đổi thùng |
|  | `box_code` | string | ✓ | Mã thùng trong `/packaging/boxes` (không còn nhập `box_size` tùy ý) |
|  | `adjustment_reason` | enum | ✓ | `PRODUCT_MORE_FRAGILE_THAN_EXPECTED` / `RECOMMENDED_BOX_NOT_IN_STOCK` / `OTHER` |
|  | `adjustment_note` | string |  | Bắt buộc khi `OTHER` (`PKG_ADJUSTMENT_NOTE_REQUIRED`) |
|  | `expected_group_version` | integer | ✓ | Version group |
| Reject | `expected_group_version` | integer | ✓ | Version group |

**Response phương án (camelCase, 1 phần tử/đơn)**: `id`, `orderId`, `platformOrderId`, `solutionStatus` (`ok`/`no_fit`), `noFitReasons[]`, `boxCode`, `boxName`, `boxInnerMm`/`boxOuterMm` (`lengthMm`, `widthMm`, `heightMm`), `boxSize` (cm, cho client cũ), `placements[]` (`itemKey`, `sku`, `step`, `x`, `y`, `z`, `dx`, `dy`, `dz`, `orientation` — mm, trục z hướng lên, `step` là thứ tự đặt; 🆕 22/09 `folded` = món đã được gập đôi, `dx/dy/dz` là số đo sau gập), `materials[]`, `itemsWeightG`, `estimatedPackageWeightG` (hàng + bì), `volumetricWeightG` (hệ số 6000), `fillRatio`, `estimatedShippingCostVnd` (**null** tới khi có bảng cước thật), `engineVersion`, `approvalStatus`, `adjustmentReason`/`adjustmentNote`/`adjustedFromBoxCode`, `actualMeasuredWeightKg`, `packedAt`, `isAbnormal`.

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
| GET    | `/warehouse/:warehouseId/picking-list/:groupId`                                | Warehouse, Admin       | Picking list CÓ vị trí kệ thật, đã sắp xếp theo lộ trình đi (🔄 21/09: cùng shape mới — `picked_quantity`, số đo có thể `null`)                                                                                   |

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

Không có public CRUD tổng quát cho `refresh_tokens`, `trusted_devices`, `login_audit_logs`, `marketplace_oauth_states`, `processed_webhook_events`, `orders`, `order_groups`, `pick_events` và `packaging_recommendations`. (`product_master` có API hồ sơ đóng gói ở mục 8c; `packaging_boxes` ở mục 8b.)

Planned: nhánh túi mailer, danh mục vật tư (khối lượng/giá), bảng cước thật; webhook/Kafka/event queue; carrier/pickup/tracking thật; packaging flow tự động hoàn chỉnh (BE-5).

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
POST  .../pick-item, /pick, /pack, /return, /report-missing     Thao tác lấy/đóng gói (pack = nhập cân từng kiện)
GET   /order-groups/:groupId/packaging                           Xem phương án + animation 3D lúc đóng
GET   /product-master, PUT /product-master/:id/packaging-profile  Đo và xác nhận hồ sơ SKU
GET   /packaging/boxes                                          Danh mục thùng
POST  /order-groups/:id/assign                                  Tự nhận việc HOẶC đổi cho đồng nghiệp khác
GET   /order-groups/staff/search                                Tìm đồng nghiệp để chuyển việc
GET   /warehouse/:warehouseId/picking-list/:groupId              Picking list có vị trí kệ
GET   /notifications*
```

### 🎁 Packaging Staff

```
GET   /order-groups, /:id, /:groupId/packaging       Xem đơn cần duyệt
POST  .../packaging/approve, /adjust, /reject         Duyệt gợi ý đóng gói (adjust = đổi thùng 1 đơn)
GET   /packaging/boxes, /product-master               Tra danh mục thùng + hồ sơ SKU
POST  .../fulfillment/decide-partial                  Quyết định đơn thiếu hàng
GET   /order-groups/staff/search                       Xem tải việc của Warehouse Staff (tham khảo)
GET   /notifications*
```

### 🚚 Shipping Coordinator

```
GET   /order-groups, /:id, /:groupId/packaging
POST  .../fulfillment/ship, /deliver, /return
GET   /notifications*
```

**Ghi chú**: Shipping Coordinator hiện có ít route riêng nhất — chưa có API chọn carrier/lên lịch pickup/tracking thật (Tầng 2, chưa code).

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
| Packaging | `PKG_INVALID_RECOMMENDATION_ID`, `PKG_RECOMMENDATION_NOT_FOUND`, `PKG_NO_ACTIVE_RECOMMENDATION`, `PKG_ALREADY_DECIDED`, `PKG_GROUP_NOT_PENDING_APPROVAL`, 🆕 21/09: `PKG_HAS_NO_FIT`, `PKG_BOX_DOES_NOT_FIT`, `PKG_ORDER_NOT_IN_PLAN`, `PKG_PACK_PACKAGES_MISMATCH`, `PKG_ADJUSTMENT_NOTE_REQUIRED`, `PKG_GUIDE_NOT_AVAILABLE`, `PKG_BOX_OUT_OF_STOCK`, `PKG_INVALID_BAG_ID`, `PKG_BAG_NOT_FOUND`, `PKG_BAG_CODE_IN_USE`, `PKG_INVALID_BOX_ID`, `PKG_BOX_NOT_FOUND`, `PKG_BOX_CODE_IN_USE`, `PKG_BOX_INVALID_DIMENSIONS` |
| Product Master | 🆕 21/09: `PM_INVALID_ID`, `PM_NOT_FOUND` |
| Warehouse | `WH_WAREHOUSE_NOT_FOUND`, `WH_ZONE_NOT_FOUND`, `WH_INVALID_BIN_RANGE`, `WH_WAREHOUSE_CODE_IN_USE`, `WH_ZONE_CODE_IN_USE` (2 mã cuối 🆕 19/09/2026 — trùng mã kho/khu, trả 409 thay vì 500) |
| Notifications | `NOTI_INVALID_ID`, `NOTI_NOT_FOUND` |
