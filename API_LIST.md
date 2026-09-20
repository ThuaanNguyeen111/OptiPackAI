# OptiPackAI — Danh sách API đầy đủ theo Role

Tài liệu này liệt kê **toàn bộ** route thật đang tồn tại trong code (đã quét trực tiếp từ `@Controller`/`@Roles` decorator, không phải từ trí nhớ/thiết kế) — dùng làm nguồn tham chiếu DUY NHẤT khi cần biết "route này ai gọi được, dùng để làm gì". Cập nhật lần cuối: 2026-09-20 (gộp bản contract từ nhánh `thi_dev`: thêm mục Quy ước, mục 0 System, bảng DTO/field cho từng module, mục 11 collection nội bộ/planned và bảng mã lỗi theo module).

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
| GET    | `/order-groups/:id/picking-list`      | Warehouse, Admin                                       | Toàn bộ SKU cần lấy cho nhóm đơn này                                                                                                              |
| GET    | `/order-groups/:id/picking-list/:sku` | Warehouse, Admin                                       | Chi tiết 1 SKU riêng lẻ trong nhóm đơn                                                                                                            |

## 6. Order Groups — Fulfillment (ghi trạng thái)

| Method | Route                                          | Role                       | Mô tả                                                                |
| ------ | ---------------------------------------------- | -------------------------- | -------------------------------------------------------------------- |
| POST   | `/order-groups/:id/fulfillment/pick-item`      | Warehouse, Admin           | Quét/nhập tay 1 SKU — trừ tồn kho ngay, chống trừ trùng khi mất mạng |
| POST   | `/order-groups/:id/fulfillment/report-missing` | Warehouse, Admin           | Báo thiếu hàng lúc lấy — dừng đơn, báo Store Owner, chờ duyệt        |
| POST   | `/order-groups/:id/fulfillment/decide-partial` | Packaging, Admin           | Duyệt tiếp với phần có sẵn, hoặc hủy làm lại                         |
| POST   | `/order-groups/:id/fulfillment/pick`           | Warehouse, Admin           | Xác nhận đã lấy xong TOÀN BỘ nhóm đơn                                |
| POST   | `/order-groups/:id/fulfillment/pack`           | Warehouse, Admin           | Xác nhận đã đóng gói xong                                            |
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
| `TransitionOrderGroupDto` | `expected_version` | integer | ✓ | Version hiện tại |
| `SetPriorityDto` | `order_priority` | `normal\|express` | ✓ | Ưu tiên |
|  | `deadline_hours` | integer |  | Deadline tùy chọn |
| `AssignStaffDto` | `staff_id` | ObjectId string |  | Trống = Least-Busy, có = gán tay |

`OrderGroupResponse` gồm `id`, `platform`, `shopId`, `orderCount`, `fulfillmentStatus`, `activePackagingRecommendationId`, `assignedStaffId`, `orderPriority`, `packagingDeadline`, `isOverdue`, `version`, `createdAt`, `updatedAt`. `order_priority` nhận `normal|express` để lọc danh sách. Mọi transition kiểm tra status transition và version.

## 8. Packaging — UC-04 (`/order-groups/:groupId/packaging`)

| Method | Route                                       | Role                                  | Mô tả                                                     |
| ------ | ------------------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| GET    | `/order-groups/:groupId/packaging`          | Packaging, Warehouse, Shipping, Admin | Xem gợi ý đóng gói hiện tại (dù đã duyệt hay chưa)        |
| POST   | `/order-groups/:groupId/packaging/generate` | **Chỉ Admin** (route TẠM)             | Tạo gợi ý đóng gói bằng thuật toán fallback (chờ AI thật) |
| POST   | `/order-groups/:groupId/packaging/approve`  | Packaging, Admin                      | Duyệt gợi ý, kèm cân nặng THẬT đo được                    |
| POST   | `/order-groups/:groupId/packaging/adjust`   | Packaging, Admin                      | Đổi thùng/vật liệu rồi mới duyệt                          |
| POST   | `/order-groups/:groupId/packaging/reject`   | Packaging, Admin                      | Từ chối, quay lại chờ tính toán lại                       |

> ⚠️ `packaging/generate` không phải hành vi nghiệp vụ chính thức lâu dài — sẽ bị thay bằng cơ chế tự động khi AI Packaging thật (Package 3) xong.

**Chi tiết DTO**

| DTO | Field | Type | Req. | Meaning |
|---|---|---:|:---:|---|
| Approve | `actual_measured_weight_kg` | number | ✓ | Cân thật, min 0 |
|  | `expected_group_version` | integer | ✓ | Version group |
| Adjust | `box_size.length_cm`, `.width_cm`, `.height_cm` | number | ✓ | Mỗi chiều min 1 |
|  | `material_type` | string | ✓ | Vật liệu |
|  | `adjustment_reason` | enum | ✓ | Fragile / out of stock / OTHER |
|  | `adjustment_note` | string |  | Bắt buộc theo nghiệp vụ khi OTHER |
|  | `actual_measured_weight_kg` | number | ✓ | Cân thật, min 0 |
|  | `expected_group_version` | integer | ✓ | Version group |
| Reject | `expected_group_version` | integer | ✓ | Version group |

`generate` là route legacy/test hiện tại; packaging readiness tự động trong roadmap chưa implement đầy đủ.

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
| GET    | `/warehouse/:warehouseId/picking-list/:groupId`                                | Warehouse, Admin       | Picking list CÓ vị trí kệ thật, đã sắp xếp theo lộ trình đi                                                                                                                                                           |

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

Không có public CRUD tổng quát cho `refresh_tokens`, `trusted_devices`, `login_audit_logs`, `marketplace_oauth_states`, `processed_webhook_events`, `product_master`, `orders`, `order_groups`, `pick_events` và `packaging_recommendations`.

Planned: catalog/readiness Product Master; webhook/Kafka/event queue; carrier/pickup/tracking thật; packaging flow tự động hoàn chỉnh.

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
POST  .../pick-item, /pick, /pack, /return, /report-missing     Thao tác lấy/đóng gói
POST  /order-groups/:id/assign                                  Tự nhận việc HOẶC đổi cho đồng nghiệp khác
GET   /order-groups/staff/search                                Tìm đồng nghiệp để chuyển việc
GET   /warehouse/:warehouseId/picking-list/:groupId              Picking list có vị trí kệ
GET   /notifications*
```

### 🎁 Packaging Staff

```
GET   /order-groups, /:id, /:groupId/packaging       Xem đơn cần duyệt
POST  .../packaging/approve, /adjust, /reject         Duyệt gợi ý đóng gói
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
| Order Groups | `ORD_GROUP_INVALID_ID`, `ORD_GROUP_NOT_FOUND`, `ORD_GROUP_STATE_CONFLICT`, `ORD_GROUP_INVALID_TRANSITION`, `ORD_GROUP_INSUFFICIENT_STOCK`, `ORD_GROUP_ITEM_NOT_IN_GROUP`, `ORD_GROUP_PACKAGING_PROFILE_NOT_READY`, `ORD_GROUP_ALL_ORDERS_CANCELED` |
| Staff assignment | `ORD_GROUP_NO_STAFF_AVAILABLE`, `ORD_GROUP_STAFF_NOT_FOUND`, `ORD_GROUP_STAFF_INACTIVE` |
| Packaging | `PKG_INVALID_RECOMMENDATION_ID`, `PKG_RECOMMENDATION_NOT_FOUND`, `PKG_NO_ACTIVE_RECOMMENDATION`, `PKG_ALREADY_DECIDED`, `PKG_GROUP_NOT_PENDING_APPROVAL` |
| Warehouse | `WH_WAREHOUSE_NOT_FOUND`, `WH_ZONE_NOT_FOUND`, `WH_INVALID_BIN_RANGE`, `WH_WAREHOUSE_CODE_IN_USE`, `WH_ZONE_CODE_IN_USE` (2 mã cuối 🆕 19/09/2026 — trùng mã kho/khu, trả 409 thay vì 500) |
| Notifications | `NOTI_INVALID_ID`, `NOTI_NOT_FOUND` |
