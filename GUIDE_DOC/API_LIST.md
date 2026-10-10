# OptiPackAI — Danh sách API đầy đủ theo Role

Tài liệu này liệt kê **toàn bộ** route thật đang tồn tại trong code (đã quét trực tiếp từ `@Controller`/`@Roles` decorator, không phải từ trí nhớ/thiết kế) — dùng làm nguồn tham chiếu DUY NHẤT khi cần biết "route này ai gọi được, dùng để làm gì". Cập nhật lần cuối: 2026-10-07 (sửa lỗi kiểu id: Picking List, `pick-item`, nhập thêm hàng hết báo lỗi sai; gợi ý đóng gói theo số đã quét; `relatedEntityId` của thông báo `sync_failed` đổi nghĩa — không route nào thêm/bớt, không request/response nào đổi; chi tiết `INTEGRATION_GUIDE_WAREHOUSE.md` PHẦN B6). Trước đó: 2026-10-04 (Product Master đồng bộ theo danh sách sản phẩm của shop + `POST /product-master/sync`). Trước đó: 2026-10-02 (nút pack báo "đã đóng gói" lên Lazada + route gửi lại). Trước đó: 2026-10-01 (mở quyền vận hành kho cho Warehouse Staff — mục 9; nhóm đơn trả thêm `activeOrderCount`/`canceledOrderCount` — mục 5). Trước đó: 2026-09-27 (K1–K5, G1, G3, G4 và tiện ích vận hành).

**Cách đọc**: "Bất kỳ" = mọi role đã đăng nhập đều gọi được. "Public" = không cần token.

---

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

## 3. Marketplace Integration (`/marketplace`)

| Method | Route                             | Role   | Mô tả                                                    |
| ------ | --------------------------------- | ------ | -------------------------------------------------------- |
| GET    | `/marketplace/:platform/connect`  | Admin  | Tạo URL OAuth để kết nối shop 1 sàn (lazada/tiktok/tiki) |
| GET    | `/marketplace/:platform/callback` | Public | Sàn tự gọi lại sau khi seller authorize                  |

## 4. Orders (`/orders`)

| Method | Route                 | Role                   | Mô tả                                                                               |
| ------ | --------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| POST   | `/orders/lazada/sync` | Admin                  | Kích hoạt tay 1 lần đồng bộ đơn từ Lazada (thao tác kỹ thuật, giữ nguyên chỉ Admin) |
| GET    | `/orders`             | **Admin, Store Owner** | Danh sách đơn đã đồng bộ                                                            |
| GET    | `/orders/:id`         | **Admin, Store Owner** | Chi tiết 1 đơn hàng. 🆕 08/10/2026: thêm `recipientProvince`, `recipientDistrict`, `recipientWard` (`string \| null`) |

## 5. Order Groups — Đọc (`/order-groups`)

| Method | Route                                 | Role                                                   | Mô tả                                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/order-groups`                       | **Store Owner**, Warehouse, Packaging, Shipping, Admin | Danh sách nhóm đơn — lọc theo `fulfillment_status`/`platform`/**`order_priority`** (MỚI — xem toàn bộ đơn Hỏa Tốc bằng `?order_priority=express`). 🔄 **01/10/2026**: mỗi nhóm có thêm `activeOrderCount` (đơn còn phải xử lý) và `canceledOrderCount` (đơn đã hủy) — xem `INTEGRATION_GUIDE_FULFILLMENT.md` Nghiệp vụ 3 |
| GET    | `/order-groups/:id`                   | **Store Owner**, Warehouse, Packaging, Shipping, Admin | Chi tiết 1 nhóm đơn — đọc `version` ở đây trước mọi request ghi                                                                                                                                                                                                                                                          |
| GET    | `/order-groups/:id/picking-list`      | Warehouse, Admin                                       | Toàn bộ SKU cần lấy cho nhóm đơn này                                                                                                                                                                                                                                                                                     |
| GET    | `/order-groups/:id/picking-list/:sku` | Warehouse, Admin                                       | Chi tiết 1 SKU riêng lẻ trong nhóm đơn                                                                                                                                                                                                                                                                                   |

## 6. Order Groups — Fulfillment (ghi trạng thái)

| Method  | Route                                          | Role                           | Mô tả                                                                                                                                                                                                     |
| ------- | ---------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST    | `/order-groups/:id/fulfillment/pick-item`      | Warehouse, Admin               | Quét/nhập tay 1 SKU — trừ tồn kho ngay, chống trừ trùng khi mất mạng. 🔄 **07/10/2026**: hết báo `409 INSUFFICIENT_STOCK` sai khi kho đã gán đúng; tìm được tồn chưa "Đồng bộ tồn"; không phân biệt hoa thường |
| POST    | `/order-groups/:id/fulfillment/report-missing` | Warehouse, Admin               | Báo thiếu hàng lúc lấy — dừng đơn, báo Store Owner, chờ duyệt                                                                                                                                             |
| POST    | `/order-groups/:id/fulfillment/decide-partial` | Packaging, Admin               | Duyệt tiếp với phần có sẵn, hoặc hủy làm lại                                                                                                                                                              |
| POST    | `/order-groups/:id/fulfillment/pick`           | Warehouse, Admin               | Xác nhận đã lấy xong TOÀN BỘ nhóm đơn                                                                                                                                                                     |
| POST    | `/order-groups/:id/fulfillment/pack`           | 🔄 Packaging, Warehouse, Admin | Xác nhận đã đóng gói xong — mở thêm Packaging Staff (21/09/2026). 🔄 **10/10/2026**: ĐÃ BỎ báo "đã đóng gói" lên Lazada — chỉ ghi trong OptiPack, response không còn `lazadaPackSync`; nhóm hủy hết → 409 `ORD_GROUP_ALL_ORDERS_CANCELED` |
| ~~POST~~ | ~~`/order-groups/:id/lazada-pack/retry`~~ | — | **ĐÃ BỎ (10/10/2026)** — OptiPack không ghi ngược lên Lazada |
| POST    | `/order-groups/:id/fulfillment/ship`           | Shipping, Admin                | Xác nhận đã bàn giao vận chuyển                                                                                                                                                                           |
| POST    | `/order-groups/:id/fulfillment/deliver`        | Shipping, Admin                | Xác nhận đã giao thành công tới khách                                                                                                                                                                     |
| POST    | `/order-groups/:id/fulfillment/return`         | Shipping, Warehouse, Admin     | Ghi nhận hoàn hàng (từ shipped hoặc delivered)                                                                                                                                                            |
| PATCH   | `/order-groups/:id/priority`                   | **Store Owner**, Admin         | Đánh dấu đơn Hỏa Tốc/Bình thường, tự tính hạn đóng gói                                                                                                                                                    |

## 7. Staff Assignment — Phân công / Đổi nhân viên phụ trách

| Method | Route                        | Role                        | Mô tả                                                                                                                                                                                                                                                                   |
| ------ | ---------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/order-groups/:id/assign`   | Admin, Warehouse            | **Gán/ĐỔI nhân viên phụ trách 1 nhóm đơn.** Body rỗng = tự động chọn lại người đang ít việc nhất (Least-Busy). Truyền `staff_id` = chỉ định tay 1 người cụ thể (dùng khi cần ĐỔI người đang phụ trách, VD người cũ nghỉ đột xuất, đơn Hỏa Tốc cần người giỏi hơn xử lý) |
| GET    | `/order-groups/staff/search` | Admin, Warehouse, Packaging | Tìm nhân viên theo tên/email, kèm số việc đang xử lý (`activeWorkload`) — dùng để CHỌN AI khi muốn đổi tay ở API trên                                                                                                                                                   |

> **Lưu ý quan trọng — trả lời đúng câu hỏi "sao đơn hỏa tốc không có API đổi người"**: KHÔNG có route riêng "đổi người cho đơn hỏa tốc" — vì **không cần thiết phải tách riêng**. `POST /order-groups/:id/assign` (route ở trên) dùng được cho **MỌI đơn, kể cả hỏa tốc lẫn thường** — không phân biệt. Nếu 1 đơn đang là "express" mà người phụ trách hiện tại xử lý chậm, Admin/Warehouse Staff chỉ cần gọi ĐÚNG route này với `staff_id` của người khác — hệ thống không quan tâm đơn đó thường hay hỏa tốc khi đổi người, tách API riêng cho từng loại đơn sẽ là thừa (2 route làm cùng 1 việc).

## 8. Packaging — UC-04 (`/order-groups/:groupId/packaging`)

| Method | Route                                       | Role                                  | Mô tả                                                     |
| ------ | ------------------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| GET    | `/order-groups/:groupId/packaging`          | Packaging, Warehouse, Shipping, Admin | Xem gợi ý đóng gói hiện tại (dù đã duyệt hay chưa)        |
| POST   | `/order-groups/:groupId/packaging/generate` | **Chỉ Admin** (route TẠM)             | Tạo gợi ý đóng gói bằng thuật toán fallback (chờ AI thật) |
| POST   | `/order-groups/:groupId/packaging/approve`  | Packaging, Admin                      | Duyệt gợi ý, kèm cân nặng THẬT đo được                    |
| POST   | `/order-groups/:groupId/packaging/adjust`   | Packaging, Admin                      | Đổi thùng/vật liệu rồi mới duyệt                          |
| POST   | `/order-groups/:groupId/packaging/reject`   | Packaging, Admin                      | Từ chối, quay lại chờ tính toán lại                       |

> ⚠️ `packaging/generate` không phải hành vi nghiệp vụ chính thức lâu dài — sẽ bị thay bằng cơ chế tự động khi AI Packaging thật (Package 3) xong.

## 9. Warehouse (`/warehouse`)

🔄 **ĐÃ ĐỔI (16/09/2026)** — thêm 3 route GET còn thiếu (trước đây chỉ tạo được, không xem lại được); sửa `GET .../zones` không trả dữ liệu dù đã tạo thành công (ép kiểu `ObjectId` tường minh).

| Method    | Route                                                                          | Role                   | Mô tả                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST      | `/warehouse/warehouses`                                                        | Admin                  | Tạo kho mới (bước 1/4)                                                                                                                                                                                                |
| GET       | `/warehouse/warehouses`                                                        | Admin, Warehouse Staff | 🔄 Danh sách kho — **mở thêm Warehouse Staff (19/09/2026)**: trước đây chỉ Admin xem được, nhưng picking-list/pick-item/report-missing đều bắt buộc `warehouse_id`, Warehouse Staff không có cách nào biết ID kho nào |
| POST      | `/warehouse/warehouses/:warehouseId/zones`                                     | Admin                  | Tạo khu trong kho (bước 2/4)                                                                                                                                                                                          |
| GET       | `/warehouse/warehouses/:warehouseId/zones`                                     | Admin, Warehouse Staff | 🔄 Danh sách khu trong 1 kho — **sửa lỗi 16/09/2026**: trước đây có thể không trả ra dữ liệu dù tạo thành công. 🔄 **Mở thêm Warehouse Staff (01/10/2026)**                                                           |
| POST      | `/warehouse/zones/:zoneId/bin-locations/generate`                              | Admin                  | Tạo HÀNG LOẠT kệ theo dãy/rack/tầng (bước 3/4)                                                                                                                                                                        |
| 🆕 GET    | `/warehouse/zones/:zoneId/bin-locations`                                       | Admin                  | **MỚI (16/09/2026)** — Danh sách kệ đã tạo trong 1 khu (trước đây chỉ tạo được, không xem lại được)                                                                                                                   |
| 🆕 GET    | `/warehouse/warehouses/:warehouseId/bin-locations`                             | Admin, Warehouse Staff | **MỚI (16/09/2026)** — Danh sách TOÀN BỘ kệ trong 1 kho (gộp mọi khu). 🔄 **Mở thêm Warehouse Staff (01/10/2026)**                                                                                                    |
| POST      | `/warehouse/warehouses/:warehouseId/sku-bin-assignments`                       | Admin                  | Gán 1 SKU vào 1 kệ, kèm số lượng ban đầu (bước 4/4)                                                                                                                                                                   |
| 🆕 GET    | `/warehouse/warehouses/:warehouseId/sku-bin-assignments`                       | Admin, Warehouse Staff | **MỚI (16/09/2026)** — Danh sách SKU đã gán vị trí trong 1 kho, kèm số lượng từng ô (trước đây chỉ GET được danh sách CHƯA gán, không GET được danh sách ĐÃ gán). 🔄 **Mở thêm Warehouse Staff (01/10/2026)**         |
| POST      | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock` | Admin, Warehouse Staff | Nhập thêm hàng (cộng dồn, không ghi đè; ghi sổ cái `receive`). 🔄 **Mở thêm Warehouse Staff (01/10/2026)**. 🔄 **Sửa lỗi luôn trả 404 (07/10/2026)** |
| GET       | `/warehouse/sku-bin-assignments/unassigned`                                    | Admin                  | SKU đã có trong hệ thống nhưng CHƯA gán kệ                                                                                                                                                                            |
| GET       | `/warehouse/:warehouseId/picking-list/:groupId`                                | Warehouse, Admin       | Picking list CÓ vị trí kệ thật, đã sắp xếp theo lộ trình đi. 🔄 **07/10/2026**: hết báo "CHƯA GÁN VỊ TRÍ" sai khi kho đã gán đúng |
| 🆕 GET    | `/warehouse/warehouses/:warehouseId`                                           | Admin, Warehouse       | **K1 (26/09/2026)** — chi tiết 1 kho (kể cả đã tắt)                                                                                                                                                                   |
| 🆕 PATCH  | `/warehouse/warehouses/:warehouseId`                                           | Admin                  | K1 — sửa tên/địa chỉ, KHÔNG sửa mã                                                                                                                                                                                    |
| 🆕 DELETE | `/warehouse/warehouses/:warehouseId`                                           | Admin                  | K1 — vô hiệu hóa (xóa mềm) + dây chuyền khu/kệ; 409 nếu còn hàng                                                                                                                                                      |
| 🆕 DELETE | `/warehouse/warehouses/:warehouseId/permanent` | Admin | **10/10/2026** — XOÁ HẲN kho chưa từng dùng + khu/ô bên trong; 409 `WH_HAS_STOCK` / `WH_HAS_HISTORY` |
| 🆕 POST   | `/warehouse/warehouses/:warehouseId/reactivate`                                | Admin                  | K1 — bật lại CHỈ kho                                                                                                                                                                                                  |
| 🆕 PATCH  | `/warehouse/zones/:zoneId`                                                     | Admin                  | K1 — sửa tên/mô tả khu                                                                                                                                                                                                |
| 🆕 DELETE | `/warehouse/zones/:zoneId`                                                     | Admin                  | K1 — vô hiệu hóa khu + kệ; 409 nếu còn hàng                                                                                                                                                                           |
| 🆕 DELETE | `/warehouse/zones/:zoneId/permanent` | Admin | **10/10/2026** — XOÁ HẲN khu chưa từng dùng + ô trong khu |
| 🆕 POST   | `/warehouse/zones/:zoneId/reactivate`                                          | Admin                  | K1 — bật lại khu + kệ (kho phải đang bật)                                                                                                                                                                             |
| 🆕 DELETE | `/warehouse/bin-locations/:binId`                                              | Admin                  | K1 — vô hiệu hóa 1 kệ; 409 nếu còn hàng                                                                                                                                                                               |
| 🆕 DELETE | `/warehouse/bin-locations/:binId/permanent` | Admin | **10/10/2026** — XOÁ HẲN 1 ô chưa từng dùng |
| 🆕 DELETE | `/warehouse/zones/:zoneId/racks/permanent?aisle=&side=&bay=` | Admin | **10/10/2026** — XOÁ HẲN nguyên kệ / nguyên dãy chưa từng dùng trong 1 lần gọi; có 1 ô đã dùng → 409, không xoá ô nào |
| 🆕 POST   | `/warehouse/bin-locations/:binId/reactivate`                                   | Admin                  | K1 — bật lại 1 kệ (khu phải đang bật)                                                                                                                                                                                 |

> 🔄 **ĐÃ ĐỔI (26/09/2026, K1)**: các GET danh sách kho/khu/kệ nhận thêm `?include_inactive=true` (mặc định chỉ trả mục đang hoạt động); response khu/kệ có thêm `isActive`; tạo khu, sinh kệ, gán SKU, nhập hàng, Picking List bị chặn `409` khi kho/khu/kệ đã tắt; gán SKU giờ kiểm tra kệ tồn tại + thuộc đúng kho. Chi tiết: **`INTEGRATION_GUIDE_WAREHOUSE.md`**.

| 🆕 POST | `/warehouse/zones/:zoneId/racks` | Admin | **K2 (26/09/2026)** — tạo kệ chuẩn mới `KA-D1-P02-T03-1` + toàn bộ ô |
| 🆕 PATCH | `/warehouse/bin-locations/:binId` | Admin | K2 — sức chứa + danh mục/size/màu đăng ký của ô |
| 🆕 GET | `/warehouse/warehouses/:warehouseId/bin-suggestions` | Admin, Warehouse | K2 — gợi ý ô theo danh mục/size/màu |

> 🔄 **ĐÃ ĐỔI (01/10/2026)**: 4 route vận hành kho (danh sách khu, danh sách ô của kho, tồn theo ô, nhập thêm hàng) mở thêm cho Warehouse Staff. Nguyên tắc: route **cấu hình** kho chỉ Admin; route **vận hành** kho mở cho Admin và Warehouse Staff. Request/response không đổi. Chi tiết và màn hình gợi ý: `INTEGRATION_GUIDE_WAREHOUSE.md` PHẦN B5.

> 🔄 **ĐÃ ĐỔI (K2)**: `zone_code` mới bắt buộc `KA..KZ`; gán SKU/nhập hàng có thể trả `409 WH_BIN_OVER_CAPACITY` (gửi lại kèm `force: true`); Picking List sắp theo lộ trình hình rắn; `POST .../bin-locations/generate` deprecated. Route cũ `POST .../bin-locations/generate` bị chặn `409 WH_ZONE_V2_USE_RACKS` ở khu `KA..KZ`; đổi đăng ký ô đang có hàng bị chặn `409 WH_BIN_HAS_STOCK_DESIGNATION`.

## 9c. 🆕 Categories (`/categories`) — K2 (26/09/2026)

| Method | Route                          | Role                                     | Mô tả                             |
| ------ | ------------------------------ | ---------------------------------------- | --------------------------------- |
| GET    | `/categories`                  | Admin, Store Owner, Warehouse, Packaging | Cây danh mục 2 cấp                |
| GET    | `/categories/:code`            | (như trên)                               | Chi tiết                          |
| POST   | `/categories`                  | Admin                                    | Tạo (cấp 2 bắt buộc `size_scale`) |
| PATCH  | `/categories/:code`            | Admin                                    | Tên + thang size                  |
| DELETE | `/categories/:code`            | Admin                                    | Vô hiệu hóa                       |
| POST   | `/categories/:code/reactivate` | Admin                                    | Kích hoạt lại                     |

## 9b. 🆕 Product Master (`/product-master`) — K1 (26/09/2026)

| Method    | Route                                 | Role                          | Mô tả                                                                                                                                                      |
| --------- | ------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET       | `/product-master`                     | Admin, Store Owner, Packaging | Danh sách kích thước/cân nặng SKU; `?shop_id&search&manual_only&page&limit`                                                                                |
| GET       | `/product-master/:id`                 | Admin, Store Owner, Packaging | Chi tiết                                                                                                                                                   |
| PATCH     | `/product-master/:id`                 | Admin, Store Owner            | Sửa tay kích thước/cân nặng/dễ vỡ -> `manualOverride: true`, cron không ghi đè nữa                                                                         |
| 🆕 DELETE | `/product-master/:id/manual-override` | Admin, Store Owner            | **K2 (rà soát 26/09)** — bỏ sửa tay, lần đồng bộ sau lấy lại số Lazada                                                                                     |
| 🆕 POST   | `/product-master/sync`                | Admin                         | **MỚI (04/10/2026)** — đồng bộ ngay danh sách sản phẩm từ Lazada; `?shop_id` (bỏ trống = mọi shop), `?full=true` (toàn bộ). Cron tự chạy mỗi giờ + 3h sáng |

## 10. Notifications (`/notifications`)

| Method | Route                         | Role   | Mô tả                                                       |
| ------ | ----------------------------- | ------ | ----------------------------------------------------------- |
| GET    | `/notifications`              | Bất kỳ | Danh sách thông báo của chính user đang login. 🔄 **07/10/2026**: `relatedEntityId` luôn là id hoặc `null`; loại `sync_failed` mang id shop đã kết nối (trước là mã shop Lazada) |
| GET    | `/notifications/unread-count` | Bất kỳ | Số chưa đọc — FE gọi định kỳ (polling) cho chuông thông báo |
| PATCH  | `/notifications/:id/read`     | Bất kỳ | Đánh dấu 1 thông báo đã đọc                                 |

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
GET   /warehouse/warehouses, /:id, /:id/zones                    Chọn kho, xem khu (zones mở 01/10/2026)
GET   /warehouse/warehouses/:id/bin-locations, /sku-bin-assignments   Xem ô và tồn theo ô (mở 01/10/2026)
POST  .../sku-bin-assignments/:assignmentId/restock, /adjust, /transfer   Nhập hàng (mở 01/10/2026), kiểm kê, chuyển ô
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

## 9d. 🆕 K3 — Sổ cái kho, kiểm kê, chuyển ô (27/09/2026)

| Method | Route                                                                            | Role                          | Mô tả                                                  |
| ------ | -------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------ |
| POST   | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/adjust`    | Admin, Warehouse              | Kiểm kê: số đếm thực tế + lý do, ghi sổ cái            |
| POST   | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/transfer`  | Admin, Warehouse              | Chuyển hàng sang ô khác (1 transaction, 2 dòng sổ cái) |
| DELETE | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId`           | Admin                         | Bỏ gán SKU khỏi ô (tồn phải = 0)                       |
| 🆕 PATCH | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId` | Admin | **10/10/2026** — sửa gán nhầm: dời SKU sang ô đúng (còn hàng thì chuyển toàn bộ, ghi sổ cái) |
| GET    | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/movements` | Admin, Warehouse, Store Owner | Sổ cái của SKU trên ô                                  |

> 🔄 K3: gán SKU vào ô khác nay là THÊM ô (không còn dời); Picking List có `bin_location_id` + `other_bins`; `pick-item` nhận thêm `bin_location_id`. **Phải chạy `scripts/migrate-sku-bin-assignment-multibin.ts` trên mỗi môi trường.**

## 10. 🆕 Giao hàng (`/shipments`) — G1 (27/09/2026)

| Method | Route                           | Role                                       | Mô tả                                            |
| ------ | ------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| GET    | `/shipments/reason-codes`       | Admin, Coordinator, Store Owner, Warehouse | Lý do giao thất bại                              |
| GET    | `/shipments` · `/shipments/:id` | Admin, Coordinator, Store Owner, Warehouse | Danh sách / chi tiết vận đơn                     |
| GET    | `/shipments/:id/events`         | Admin, Coordinator, Store Owner, Warehouse | Tracking dạng dòng thời gian                     |
| POST   | `/shipments`                    | Coordinator, Admin                         | Bắt đầu giao (nhóm đơn packed)                   |
| POST   | `/shipments/:id/deliver`        | Coordinator, Admin                         | Giao thành công                                  |
| POST   | `/shipments/:id/fail`           | Coordinator, Admin                         | Giao thất bại (lần 2 / khách từ chối -> tự hoàn) |
| POST   | `/shipments/:id/retry`          | Coordinator, Admin                         | Giao lại                                         |
| POST   | `/shipments/:id/receive-return` | Warehouse, Admin                           | Kho nhận kiện hoàn (tự tạo phiếu hoàn)           |

> 🔄 G1: `POST /order-groups/:id/fulfillment/ship|deliver|return` giữ nguyên URL/body/response nhưng nay đi qua vận đơn (deprecated). Chi tiết: **`INTEGRATION_GUIDE_SHIPPING.md`**.

## 11. 🆕 Trả hàng (`/returns`) — G3 (27/09/2026)

| Method | Route                                                 | Role                                       | Mô tả                                                        |
| ------ | ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| GET    | `/returns/reason-codes` · `/returns` · `/returns/:id` | Admin, Store Owner, Warehouse, Coordinator |                                                              |
| POST   | `/returns`                                            | Admin (đóng vai khách)                     | Yêu cầu trả hàng / hoàn tiền (nhóm đơn delivered, ≤15 ngày)  |
| POST   | `/returns/:id/approve`                                | Store Owner, Admin                         | Duyệt (người tạo không tự duyệt)                             |
| POST   | `/returns/:id/reject`                                 | Store Owner, Admin                         | Từ chối (bắt buộc lý do)                                     |
| POST   | `/returns/:id/receive`                                | Warehouse, Admin                           | Hàng trả về kho                                              |
| POST   | `/returns/:id/inspect`                                | Warehouse, Admin                           | Kiểm hàng: restock (nhập lại, sổ cái) / quarantine / discard |

## 12. 🆕 Vật liệu đóng gói (`/packaging-materials`) — G4 (27/09/2026)

| Method         | Route                                            | Role                                     | Mô tả                                                         |
| -------------- | ------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------- |
| GET            | `/packaging-materials` · `/:code` · `/movements` | Admin, Store Owner, Warehouse, Packaging | Danh mục + tồn mới/tái sử dụng, sổ cái                        |
| GET            | `/packaging-materials/savings`                   | Admin, Store Owner                       | Tổng tiết kiệm, tỷ lệ dùng lại                                |
| POST           | `/packaging-materials`                           | Admin                                    | Khai vật liệu (thùng: 3 kích thước; đệm: match_material_type) |
| PATCH · DELETE | `/packaging-materials/:code`                     | Admin                                    | Sửa tên/đơn giá · vô hiệu hóa (chặn nếu còn tồn)              |
| POST           | `/packaging-materials/:code/reactivate`          | Admin                                    |                                                               |
| POST           | `/packaging-materials/:code/purchase`            | Admin, Warehouse                         | Nhập vật liệu mới                                             |

> 🔄 G4: `POST /order-groups/:id/fulfillment/pack` response THÊM `packagingConsumption` (trừ vật liệu tự động, không chặn pack). `POST /returns/:id/inspect` nhận thêm `packaging[]`. Chi tiết: **`INTEGRATION_GUIDE_PACKAGING_MATERIALS.md`**.

## 13. 🆕 Màu & SKU nội bộ (`/colors`, `/master-skus`) — K4a (27/09/2026)

| Method                | Route                                                                  | Role                                     | Mô tả                                      |
| --------------------- | ---------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| GET                   | `/colors`                                                              | Admin, Store Owner, Warehouse, Packaging | Danh mục màu chuẩn                         |
| POST · PATCH · DELETE | `/colors` · `/colors/:code`                                            | Admin                                    |                                            |
| POST                  | `/colors/:code/reactivate`                                             | Admin                                    |                                            |
| GET                   | `/master-skus` · `/master-skus/:code` · `/:code/mappings`              | Admin, Store Owner, Warehouse, Packaging |                                            |
| 🆕 DELETE | `/master-skus/:code/permanent` | Admin | **10/10/2026** — XOÁ HẲN SKU nội bộ chưa từng dùng (409 `MSKU_HAS_MAPPINGS` / `MSKU_HAS_STOCK` / `MSKU_HAS_HISTORY`) |
| GET                   | `/master-skus/unmapped-seller-skus`                                    | Admin, Store Owner                       | SKU sàn chưa nối                           |
| POST                  | `/master-skus`                                                         | Admin                                    | Tạo — hệ thống tự ghép mã                  |
| PATCH · DELETE        | `/master-skus/:code`                                                   | Admin                                    | Sửa thuộc tính mô tả · vô hiệu hóa         |
| POST                  | `/master-skus/:code/reactivate` · `/:code/replace` · `/:code/mappings` | Admin                                    | Kích hoạt lại · Thay thế SKU · Nối SKU sàn |
| DELETE                | `/master-skus/mappings/:id`                                            | Admin                                    | Bỏ nối                                     |

> 🔄 K4a: `pick-item` + Picking List lọc thêm platform/shop_id; pick-item chạy trong 1 transaction. Request/response không đổi.

## 14. 🆕 K4b + K5 — Tồn chung theo SKU nội bộ & chống bán lố (27/09/2026)

| Method | Route                                             | Role                          | Mô tả                                                            |
| ------ | ------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| GET    | `/master-skus/unpooled-stock`                     | Admin, Store Owner            | Dòng tồn > 0 chưa tính theo SKU nội bộ (chưa nối / chưa đồng bộ) |
| POST   | `/master-skus/sync-stock`                         | Admin                         | Gắn nhãn/gộp tồn cho mọi liên kết (idempotent)                   |
| GET    | `/stock-availability?platform&shop_id&seller_sku` | Admin, Store Owner, Warehouse | Tồn thực / đã giữ / khả dụng                                     |
| GET    | `/order-groups/:id/stock-reservation`             | Admin, Store Owner, Warehouse | Giữ chỗ theo SKU                                                 |
| POST   | `/order-groups/:id/stock-reservation/recheck`     | Admin, Store Owner            | Tính lại giữ chỗ                                                 |
| POST   | `/order-groups/:id/stock-reservation/release`     | Admin                         | Nhả giữ chỗ                                                      |

> 🔄 K4b: nối SKU sàn tự gắn nhãn/gộp tồn; bỏ nối chặn khi tồn gộp > 0 (`MAP_HAS_POOLED_STOCK`); dòng tồn + sổ cái có `masterSku`; Picking List có `master_sku`; pick-item tự trừ vào tồn chung (request/response không đổi). 🔄 K5: nhóm đơn có `stockShortage`, `stockShortageItems`. Chi tiết + demo: **`INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md`**.

## 15. 🆕 Tiện ích vận hành (27/09/2026)

| Method | Route                                        | Role                                       | Mô tả                                    |
| ------ | -------------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| POST   | `/shipments/overdue-scan`                    | Admin                                      | Quét vận đơn quá hạn ngay                |
| GET    | `/shipments?overdue=true`                    | Admin, Coordinator, Store Owner, Warehouse | Lọc vận đơn quá hạn                      |
| GET    | `/returns/quarantine`                        | Admin, Store Owner, Warehouse, Coordinator | Danh sách hàng cách ly chờ xử lý         |
| POST   | `/returns/:id/quarantine/:lineIndex/resolve` | Warehouse, Admin                           | Nhập lại kho / loại bỏ hàng cách ly      |
| POST   | `/returns/:id/create-replacement`            | Admin                                      | Tạo lại đơn thay thế khi tạo tự động lỗi |
| POST   | `/packaging-materials/:code/internal-use`    | Admin, Warehouse                           | Xuất vật liệu hạng B dùng nội bộ         |

> 🔄 Trường tùy chọn mới: `fail` nhận `reschedule_at`; `retry` nhận `override_reason`; `pack` nhận `materials_used`; `POST /returns` nhận `type: exchange` + `exchange_items`. Response bổ sung: vận đơn `nextAttemptNotBefore`, `dueAt`, `isOverdue`; phiếu trả `exchangeItems`, `replacementStatus`, `replacementGroupId`, `replacementError`; nhóm đơn `origin`, `sourceReturnId`; vật liệu `qtyInternal`. Chi tiết: **`INTEGRATION_GUIDE_OPERATIONS_UTILITIES.md`**.

## 16. 🔄 Sửa lỗi kiểu id (07/10/2026)

Không có route mới. Các route dưới đây trước đây trả kết quả sai dù dữ liệu đúng, do 35 trường id trong schema bị Mongoose hiểu là kiểu Mixed (không đổi chuỗi id sang ObjectId):

| Route | Trước 07/10/2026 | Sau |
| ----- | ---------------- | --- |
| `GET /warehouse/:warehouseId/picking-list/:groupId` | "CHƯA GÁN VỊ TRÍ" dù đã gán ô | Có vị trí ô |
| `POST /order-groups/:id/fulfillment/pick-item` | `409 ORD_GROUP_INSUFFICIENT_STOCK` dù còn hàng | Trừ tồn bình thường |
| `POST /warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock` | Luôn `404` | Cộng tồn bình thường |
| `POST /order-groups/:groupId/packaging/generate` | Luôn tính theo số lượng đặt | Tính theo số đã quét |
| `POST /returns/:id/inspect`, `POST /returns/:id/quarantine/:lineIndex/resolve` (`restock` vào ô mới) | Dòng tồn mới có thể thiếu `masterSku`/`sellerSku` (chỉ trên bản có thay đổi tìm tồn mới) | Dòng tồn mới đủ thông tin |

Việc bắt buộc sau khi deploy: chạy `npx ts-node -r dotenv/config scripts/migrate-objectid-fields.ts --apply` trên mỗi database. Chi tiết: **`INTEGRATION_GUIDE_WAREHOUSE.md` PHẦN B6**.
