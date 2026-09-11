# OptiPackAI — Danh sách API đầy đủ theo Role

Tài liệu này liệt kê **toàn bộ** route thật đang tồn tại trong code (đã quét trực tiếp từ `@Controller`/`@Roles` decorator, không phải từ trí nhớ/thiết kế) — dùng làm nguồn tham chiếu DUY NHẤT khi cần biết "route này ai gọi được, dùng để làm gì". Cập nhật lần cuối: 2026-09-11.

**Cách đọc**: "Bất kỳ" = mọi role đã đăng nhập đều gọi được. "Public" = không cần token.

---

## 1. Auth (`/auth`)

| Method | Route | Role | Mô tả |
|---|---|---|---|
| POST | `/auth/login` | Public | Đăng nhập — có thể trả `mfa_required` nếu tài khoản bật MFA |
| POST | `/auth/forgot-password` | Public | Gửi email link đặt lại mật khẩu |
| POST | `/auth/reset-password` | Public | Đặt mật khẩu mới bằng token từ email |
| POST | `/auth/change-password` | Bất kỳ | Đổi mật khẩu khi đã đăng nhập |
| POST | `/auth/mfa/setup` | Bất kỳ | Bắt đầu bật MFA — trả về `otpauthUrl` để tự vẽ QR |
| POST | `/auth/mfa/verify` | Bất kỳ | Xác nhận mã TOTP đầu tiên — bật MFA thật, trả 10 mã dự phòng |
| POST | `/auth/refresh` | Public | Lấy cặp access/refresh token mới |
| POST | `/auth/logout` | Bất kỳ | Thu hồi refresh token hiện tại |
| GET | `/auth/google` | Public | Bắt đầu luồng đăng nhập Google (redirect) |
| GET | `/auth/google/callback` | Public | Google gọi lại sau khi user xác thực |

## 2. Users (`/users`)

| Method | Route | Role | Mô tả |
|---|---|---|---|
| POST | `/users` | Admin | Tạo tài khoản nhân viên mới |
| GET | `/users` | Admin, Store Owner | Danh sách toàn bộ user |
| GET | `/users/me` | Bất kỳ | Xem thông tin chính mình |
| PATCH | `/users/me` | Bất kỳ | Tự sửa phone/address/avatar |
| POST | `/users/:id/reset-password` | Admin | Reset mật khẩu hộ 1 user |
| POST | `/users/:id/disable-mfa` | Admin | Tắt MFA hộ user mất thiết bị/mã dự phòng |
| POST | `/users/:id/reactivate` | Admin | Mở lại tài khoản bị khóa |
| PATCH | `/users/:id` | Admin | Sửa tên/role/phone/address/mã NV/phòng ban |
| DELETE | `/users/:id` | Admin | Xóa mềm 1 user |

## 3. Marketplace Integration (`/marketplace`)

| Method | Route | Role | Mô tả |
|---|---|---|---|
| GET | `/marketplace/:platform/connect` | Admin | Tạo URL OAuth để kết nối shop 1 sàn (lazada/tiktok/tiki) |
| GET | `/marketplace/:platform/callback` | Public | Sàn tự gọi lại sau khi seller authorize |

## 4. Orders (`/orders`)

| Method | Route | Role | Mô tả |
|---|---|---|---|
| POST | `/orders/lazada/sync` | Admin | Kích hoạt tay 1 lần đồng bộ đơn từ Lazada |
| GET | `/orders` | Admin | Danh sách đơn đã đồng bộ |
| GET | `/orders/:id` | Admin | Chi tiết 1 đơn hàng |

## 5. Order Groups — Đọc (`/order-groups`)

| Method | Route | Role | Mô tả |
|---|---|---|---|
| GET | `/order-groups` | Warehouse, Packaging, Shipping, Admin | Danh sách nhóm đơn (lọc theo `fulfillment_status`/`platform`) |
| GET | `/order-groups/:id` | Warehouse, Packaging, Shipping, Admin | Chi tiết 1 nhóm đơn — đọc `version` ở đây trước mọi request ghi |
| GET | `/order-groups/:id/picking-list` | Warehouse, Admin | Toàn bộ SKU cần lấy cho nhóm đơn này |
| GET | `/order-groups/:id/picking-list/:sku` | Warehouse, Admin | Chi tiết 1 SKU riêng lẻ trong nhóm đơn |

## 6. Order Groups — Fulfillment (ghi trạng thái)

| Method | Route | Role | Mô tả |
|---|---|---|---|
| POST | `/order-groups/:id/fulfillment/pick-item` | Warehouse, Admin | Quét/nhập tay 1 SKU — trừ tồn kho ngay, chống trừ trùng khi mất mạng |
| POST | `/order-groups/:id/fulfillment/report-missing` | Warehouse, Admin | Báo thiếu hàng lúc lấy — dừng đơn, báo Store Owner, chờ duyệt |
| POST | `/order-groups/:id/fulfillment/decide-partial` | Packaging, Admin | Duyệt tiếp với phần có sẵn, hoặc hủy làm lại |
| POST | `/order-groups/:id/fulfillment/pick` | Warehouse, Admin | Xác nhận đã lấy xong TOÀN BỘ nhóm đơn |
| POST | `/order-groups/:id/fulfillment/pack` | Warehouse, Admin | Xác nhận đã đóng gói xong |
| POST | `/order-groups/:id/fulfillment/ship` | Shipping, Admin | Xác nhận đã bàn giao vận chuyển |
| POST | `/order-groups/:id/fulfillment/deliver` | Shipping, Admin | Xác nhận đã giao thành công tới khách |
| POST | `/order-groups/:id/fulfillment/return` | Shipping, Warehouse, Admin | Ghi nhận hoàn hàng (từ shipped hoặc delivered) |
| PATCH | `/order-groups/:id/priority` | **Store Owner**, Admin | Đánh dấu đơn Hỏa Tốc/Bình thường, tự tính hạn đóng gói |

## 7. Staff Assignment — Phân công / Đổi nhân viên phụ trách

| Method | Route | Role | Mô tả |
|---|---|---|---|
| POST | `/order-groups/:id/assign` | Admin, Warehouse | **Gán/ĐỔI nhân viên phụ trách 1 nhóm đơn.** Body rỗng = tự động chọn lại người đang ít việc nhất (Least-Busy). Truyền `staff_id` = chỉ định tay 1 người cụ thể (dùng khi cần ĐỔI người đang phụ trách, VD người cũ nghỉ đột xuất, đơn Hỏa Tốc cần người giỏi hơn xử lý) |
| GET | `/order-groups/staff/search` | Admin, Warehouse, Packaging | Tìm nhân viên theo tên/email, kèm số việc đang xử lý (`activeWorkload`) — dùng để CHỌN AI khi muốn đổi tay ở API trên |

> **Lưu ý quan trọng — trả lời đúng câu hỏi "sao đơn hỏa tốc không có API đổi người"**: KHÔNG có route riêng "đổi người cho đơn hỏa tốc" — vì **không cần thiết phải tách riêng**. `POST /order-groups/:id/assign` (route ở trên) dùng được cho **MỌI đơn, kể cả hỏa tốc lẫn thường** — không phân biệt. Nếu 1 đơn đang là "express" mà người phụ trách hiện tại xử lý chậm, Admin/Warehouse Staff chỉ cần gọi ĐÚNG route này với `staff_id` của người khác — hệ thống không quan tâm đơn đó thường hay hỏa tốc khi đổi người, tách API riêng cho từng loại đơn sẽ là thừa (2 route làm cùng 1 việc).

## 8. Packaging — UC-04 (`/order-groups/:groupId/packaging`)

| Method | Route | Role | Mô tả |
|---|---|---|---|
| GET | `/order-groups/:groupId/packaging` | Packaging, Warehouse, Shipping, Admin | Xem gợi ý đóng gói hiện tại (dù đã duyệt hay chưa) |
| POST | `/order-groups/:groupId/packaging/generate` | **Chỉ Admin** (route TẠM) | Tạo gợi ý đóng gói bằng thuật toán fallback (chờ AI thật) |
| POST | `/order-groups/:groupId/packaging/approve` | Packaging, Admin | Duyệt gợi ý, kèm cân nặng THẬT đo được |
| POST | `/order-groups/:groupId/packaging/adjust` | Packaging, Admin | Đổi thùng/vật liệu rồi mới duyệt |
| POST | `/order-groups/:groupId/packaging/reject` | Packaging, Admin | Từ chối, quay lại chờ tính toán lại |

> ⚠️ `packaging/generate` không phải hành vi nghiệp vụ chính thức lâu dài — sẽ bị thay bằng cơ chế tự động khi AI Packaging thật (Package 3) xong.

## 9. Warehouse (`/warehouse`)

| Method | Route | Role | Mô tả |
|---|---|---|---|
| POST | `/warehouse/warehouses` | Admin | Tạo kho mới (bước 1/4) |
| GET | `/warehouse/warehouses` | Admin | Danh sách kho |
| POST | `/warehouse/warehouses/:warehouseId/zones` | Admin | Tạo khu trong kho (bước 2/4) |
| GET | `/warehouse/warehouses/:warehouseId/zones` | Admin | Danh sách khu trong 1 kho |
| POST | `/warehouse/zones/:zoneId/bin-locations/generate` | Admin | Tạo HÀNG LOẠT kệ theo dãy/rack/tầng (bước 3/4) |
| POST | `/warehouse/warehouses/:warehouseId/sku-bin-assignments` | Admin | Gán 1 SKU vào 1 kệ, kèm số lượng ban đầu (bước 4/4) |
| POST | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock` | Admin | Nhập thêm hàng (cộng dồn, không ghi đè) |
| GET | `/warehouse/sku-bin-assignments/unassigned` | Admin | SKU đã có trong hệ thống nhưng CHƯA gán kệ |
| GET | `/warehouse/:warehouseId/picking-list/:groupId` | Warehouse, Admin | Picking list CÓ vị trí kệ thật, đã sắp xếp theo lộ trình đi |

## 10. Notifications (`/notifications`)

| Method | Route | Role | Mô tả |
|---|---|---|---|
| GET | `/notifications` | Bất kỳ | Danh sách thông báo của chính user đang login |
| GET | `/notifications/unread-count` | Bất kỳ | Số chưa đọc — FE gọi định kỳ (polling) cho chuông thông báo |
| PATCH | `/notifications/:id/read` | Bất kỳ | Đánh dấu 1 thông báo đã đọc |

---

## Ma trận theo Role

### 👑 Admin
Toàn quyền — gọi được mọi route liệt kê ở trên.

### 🏪 Store Owner
```
GET   /users                          Xem danh sách nhân viên
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

Xem chi tiết đầy đủ ở `INTEGRATION_GUIDE_FULFILLMENT.md` mục 7 — không lặp lại ở đây tránh 2 nguồn dễ lệch nhau.
