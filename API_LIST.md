# OptiPackAI — API contract hiện trạng

> Nguồn canonical cho route và contract backend hiện tại. Đối chiếu từ `be/src/**/**controller.ts`, DTO và schema. Cập nhật 2026-09-14.

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

## 0. System

| Method | Route | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/` | Public | Không body | Chuỗi health/welcome từ `AppService` |

## 1. Auth — `/auth`

| Method | Route | Auth/role | Request | Response |
|---|---|---|---|---|
| POST | `/auth/login` | Public | `LoginDto` | Login result hoặc `mfa_required` |
| POST | `/auth/forgot-password` | Public | `ForgotPasswordDto` | `{ message }` |
| POST | `/auth/reset-password` | Public | `ResetPasswordDto` | `{ message }` |
| POST | `/auth/change-password` | JWT | `ChangePasswordDto` | `{ message }` |
| POST | `/auth/mfa/setup` | JWT | Không body | `{ otpauthUrl }` |
| POST | `/auth/mfa/verify` | JWT | `VerifyMfaSetupDto` | `{ message, backup_codes[] }` |
| POST | `/auth/refresh` | Public | `{ refresh_token }` | Token pair |
| POST | `/auth/logout` | JWT | `{ refresh_token }` | `{ message }` |
| GET | `/auth/google` | Public | Query `code_challenge?` | Redirect Google |
| GET | `/auth/google/callback` | Public | Query `code`, `state`, `code_verifier?` | Redirect frontend |

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

## 2. Users — `/users`

| Method | Route | Role | Request | Response |
|---|---|---|---|---|
| POST | `/users` | Admin | `CreateUserDto` | `{ message, user, temporary_password }` |
| GET | `/users` | Admin, Store Owner | Query `role?`, `page?`, `limit?` | `PaginatedUsers` |
| GET | `/users/me` | Mọi role | Không body | Public user profile |
| PATCH | `/users/me` | Mọi role | `UpdateProfileDto` | Public user profile |
| POST | `/users/:id/reset-password` | Admin | Không body | `{ message, temporary_password }` |
| POST | `/users/:id/disable-mfa` | Admin | Không body | `{ message }` |
| POST | `/users/:id/reactivate` | Admin | Không body | `{ message }` |
| PATCH | `/users/:id` | Admin | `AdminUpdateUserDto` | Public user profile |
| DELETE | `/users/:id` | Admin | Không body | `{ message }` |

| DTO/query | Field | Type | Req. | Validation/meaning |
|---|---|---:|:---:|---|
| `CreateUserDto` | `name`, `email`, `role` | string, string, enum | ✓ | User mới |
| `UpdateProfileDto` | `phone`, `address`, `avatar` | string |  | Profile; phone max 20, address max 255 |
| `AdminUpdateUserDto` | `name`, `role`, `phone`, `address`, `employee_code`, `department` | string/enum |  | Admin update; employee code max 20, department max 100 |
| list query | `role`, `page`, `limit` | number |  | Page mặc định 1, limit mặc định 20 |

`PaginatedUsers`: `{ data: UserDocument[], total, page, limit }`; service loại bỏ password/MFA secret/reset hash trước khi trả list.

Public profile: `id`, `name`, `email`, `role`, `avatar`, `phone?`, `address?`, `employee_code?`, `department?`, `mfa_enabled`, `login_type`, `created_at?`.

## 3. Marketplace — `/marketplace`

| Method | Route | Role | Request | Response |
|---|---|---|---|---|
| GET | `/marketplace/:platform/connect` | Admin | Path `platform`; PKCE tùy adapter | OAuth URL/redirect |
| GET | `/marketplace/:platform/callback` | Public callback | Query `code`, `state`, `shop_id?` | Callback result/redirect |

`platform` là enum marketplace. Callback state dùng một lần để chống CSRF. Access/refresh token được mã hóa trong `marketplace_shops`, không expose.

## 4. Orders — `/orders`

| Method | Route | Role | Request | Response |
|---|---|---|---|---|
| POST | `/orders/lazada/sync` | Admin | Query `shop_id` bắt buộc | `{ fetched, upserted, newlyConsolidated }` |
| GET | `/orders` | Admin, Store Owner | `shop_id?`, `status?`, `consolidated_group_id?`, `before?`, `limit?` | `{ orders[], nextCursor }` |
| GET | `/orders/:id` | Admin, Store Owner | Path ObjectId `id` | Order detail |

| Query | Type | Validation/meaning |
|---|---:|---|
| `shop_id` | string | Shop trên sàn |
| `status` | `OrderStatus` | Trạng thái chuẩn hóa |
| `consolidated_group_id` | ObjectId string | Group gom đơn |
| `before` | ISO date | Cursor theo `created_at` |
| `limit` | integer | Mặc định 20, min 1, max 100 |

List item: `id`, `platform`, `shopId`, `platformOrderId`, `platformOrderNumber?`, `status`, `recipientName`, `recipientCity`, `isConsolidated`, `consolidatedGroupId`, `totalAmount`, `currency`, `itemCount`, `createdAt`.

Detail bổ sung địa chỉ nhận đầy đủ và `items[]`. Items được aggregate theo `sku + variation + status`, có quantity, unit price, line total và `platformOrderItemIds`.

## 5. Order Groups — `/order-groups`

### Read/search

| Method | Route | Role | Request | Response |
|---|---|---|---|---|
| GET | `/order-groups` | Store Owner, Warehouse, Packaging, Shipping, Admin | Query `fulfillment_status?`, `platform?`, `order_priority?` | `OrderGroupResponse[]` |
| GET | `/order-groups/:id` | Store Owner, Warehouse, Packaging, Shipping, Admin | Path `id` | `OrderGroupResponse` |
| GET | `/order-groups/:id/picking-list` | Warehouse, Admin | Path `id` | Packable items |
| GET | `/order-groups/:id/picking-list/:sku` | Warehouse, Admin | Path `id`, `sku` | Một packable item |
| GET | `/order-groups/staff/search` | Admin, Warehouse, Packaging | Query `q?` | Staff + `activeWorkload` |

### Fulfillment/write

| Method | Route | Role | Body | Response |
|---|---|---|---|---|
| POST | `/order-groups/:id/fulfillment/pick-item` | Warehouse, Admin | `PickItemDto` | Operation/group result |
| POST | `/order-groups/:id/fulfillment/report-missing` | Warehouse, Admin | `ReportMissingDto` | Operation/group result |
| POST | `/order-groups/:id/fulfillment/decide-partial` | Packaging, Admin | `DecidePartialDto` | Group response |
| POST | `/order-groups/:id/fulfillment/pick` | Warehouse, Admin | `TransitionOrderGroupDto` | Group response |
| POST | `/order-groups/:id/fulfillment/pack` | Warehouse, Admin | `TransitionOrderGroupDto` | Group response |
| POST | `/order-groups/:id/fulfillment/ship` | Shipping, Admin | `TransitionOrderGroupDto` | Group response |
| POST | `/order-groups/:id/fulfillment/deliver` | Shipping, Admin | `TransitionOrderGroupDto` | Group response |
| POST | `/order-groups/:id/fulfillment/return` | Shipping, Warehouse, Admin | `TransitionOrderGroupDto` | Group response |
| PATCH | `/order-groups/:id/priority` | Store Owner, Admin | `SetPriorityDto` | Group response |
| POST | `/order-groups/:id/assign` | Admin, Warehouse | `AssignStaffDto` | Updated group |

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

## 6. Packaging — `/order-groups/:groupId/packaging`

| Method | Route | Role | Body | Response |
|---|---|---|---|---|
| GET | `/order-groups/:groupId/packaging` | Packaging, Warehouse, Shipping, Admin | Không body | Recommendation |
| POST | `/order-groups/:groupId/packaging/generate` | Admin | Không body | Recommendation |
| POST | `/order-groups/:groupId/packaging/approve` | Packaging, Admin | `ApprovePackagingDto` | Recommendation/group result |
| POST | `/order-groups/:groupId/packaging/adjust` | Packaging, Admin | `AdjustPackagingDto` | Recommendation/group result |
| POST | `/order-groups/:groupId/packaging/reject` | Packaging, Admin | `RejectPackagingDto` | `{ message }` |

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

## 7. Warehouse — `/warehouse`

| Method | Route | Role | Request | Response |
|---|---|---|---|---|
| POST | `/warehouse/warehouses` | Admin | `CreateWarehouseDto` | Warehouse public response |
| GET | `/warehouse/warehouses` | Admin | Không body | Warehouse[] |
| POST | `/warehouse/warehouses/:warehouseId/zones` | Admin | `CreateZoneDto` | Zone response |
| GET | `/warehouse/warehouses/:warehouseId/zones` | Admin | Path `warehouseId` | Zone[] |
| POST | `/warehouse/zones/:zoneId/bin-locations/generate` | Admin | `GenerateBinLocationsDto` | `{ created }` |
| POST | `/warehouse/warehouses/:warehouseId/sku-bin-assignments` | Admin | `AssignSkuBinDto` | Assignment response |
| POST | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock` | Admin | `RestockSkuDto` | Assignment response |
| GET | `/warehouse/sku-bin-assignments/unassigned` | Admin | Không body | SKU chưa gán kệ[] |
| GET | `/warehouse/:warehouseId/picking-list/:groupId` | Warehouse, Admin | Path params | Enriched picking list |

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

## 8. Notifications — `/notifications`

| Method | Route | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/notifications` | JWT | Query `is_read?` | Tối đa 50 notification mới nhất |
| GET | `/notifications/unread-count` | JWT | Không body | `{ count }` |
| PATCH | `/notifications/:id/read` | JWT | Path ObjectId `id` | Notification đã đọc |

Danh sách là hợp của notification đích danh user và broadcast role. `is_read` nhận chuỗi query; chỉ `true` được parse thành true.

## 9. Collection nội bộ và planned

Không có public CRUD tổng quát cho `refresh_tokens`, `trusted_devices`, `login_audit_logs`, `marketplace_oauth_states`, `processed_webhook_events`, `product_master`, `orders`, `order_groups`, `pick_events` và `packaging_recommendations`.

Planned: catalog/readiness Product Master; webhook/Kafka/event queue; carrier/pickup/tracking thật; packaging flow tự động hoàn chỉnh.

## 10. Error code theo module

| Module | Codes |
|---|---|
| Auth/Google | `AUTH_*`, `GOOGLE_*` theo service và `GoogleOAuthErrorCode` |
| Marketplace | `MKT_OAUTH_STATE_INVALID`, `MKT_ADAPTER_NOT_REGISTERED`, `MKT_SHOP_NOT_CONNECTED`, `MKT_TOKEN_EXCHANGE_FAILED`, `MKT_TOKEN_REFRESH_FAILED`, `MKT_TOKEN_DECRYPT_FAILED`, `MKT_WEBHOOK_SIGNATURE_INVALID`, `MKT_SHOP_LOOKUP_FAILED`, `MKT_SERVER_ERROR` |
| Orders | `ORD_SYNC_FAILED`, `ORD_UNSUPPORTED_PLATFORM`, `ORD_INVALID_ORDER_ID`, `ORD_ORDER_NOT_FOUND` |
| Order Groups | `ORD_GROUP_INVALID_ID`, `ORD_GROUP_NOT_FOUND`, `ORD_GROUP_STATE_CONFLICT`, `ORD_GROUP_INVALID_TRANSITION`, `ORD_GROUP_INSUFFICIENT_STOCK`, `ORD_GROUP_ITEM_NOT_IN_GROUP`, `ORD_GROUP_PACKAGING_PROFILE_NOT_READY`, `ORD_GROUP_ALL_ORDERS_CANCELED` |
| Staff assignment | `ORD_GROUP_NO_STAFF_AVAILABLE`, `ORD_GROUP_STAFF_NOT_FOUND`, `ORD_GROUP_STAFF_INACTIVE` |
| Packaging | `PKG_INVALID_RECOMMENDATION_ID`, `PKG_RECOMMENDATION_NOT_FOUND`, `PKG_NO_ACTIVE_RECOMMENDATION`, `PKG_ALREADY_DECIDED`, `PKG_GROUP_NOT_PENDING_APPROVAL` |
| Warehouse | `WH_WAREHOUSE_NOT_FOUND`, `WH_ZONE_NOT_FOUND`, `WH_INVALID_BIN_RANGE` |
| Notifications | `NOTI_INVALID_ID`, `NOTI_NOT_FOUND` |

Chi tiết collection, embedded document, reference và index xem [docs/ERD.md](docs/ERD.md).
