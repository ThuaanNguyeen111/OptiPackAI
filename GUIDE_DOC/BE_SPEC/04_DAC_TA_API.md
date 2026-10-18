# 04 — Đặc tả API (danh mục đầy đủ)

> Cập nhật 14/10/2026. **Sinh tự động từ metadata của NestJS** (route, `@Roles`, guard, `@ApiOperation`, DTO) trên mã hiện tại — 239 route. Request/response chi tiết từng màn nằm ở guide FE ghi trong cột "Đọc ở đâu" (các guide được cập nhật theo từng đợt code). Swagger: `/api/docs` khi BE chạy. FE cần chỉnh gì để khớp: `GUIDE_DOC/FE_UPDATE_CHECKLIST.md`.

> Bản 04 cũ (07–10/10, 141 route, mô tả từng route) đã được thay bằng bản này; nội dung cũ xem lịch sử git.

## Quy ước chung

- Base URL dev: `http://localhost:3000`. JSON; ngày giờ ISO 8601.
- Xác thực: `Authorization: Bearer <access_token>`; hết hạn → `POST /auth/refresh`.
- Lỗi: `{ success: false, error_code, message, details, timestamp, path }` — rẽ nhánh theo `error_code`.
- Ghi có khoá phiên bản: gửi `expected_version` (hoặc `expected_group_version`) = `version` đọc được; lệch → 409.
- Danh sách: `page` (≥1), `limit` (1–100, mặc định 20) ở route có hỗ trợ.
- Tần suất: 600 request/phút/IP toàn cục (`THROTTLE_LIMIT_PER_MINUTE`); `/auth/login` 5/phút; `/auth/forgot-password` 3/phút; webhook và đếm thông báo bỏ qua giới hạn.

## Thống kê theo module

| Module | Nội dung | Số route | Đọc ở đâu (GUIDE_DOC/) |
|---|---|---|---|
| `app` | Ứng dụng gốc | 1 | — |
| `auth` | Xác thực | 10 | INTEGRATION_GUIDE.md |
| `users` | Người dùng | 9 | INTEGRATION_GUIDE.md |
| `notifications` | Thông báo | 4 | INTEGRATION_GUIDE_OPERATIONS_UTILITIES.md |
| `marketplace-integration` | Kết nối sàn | 3 | INTEGRATION_GUIDE_ORDERS.md |
| `marketplace-webhooks` | Webhook sàn (AURELLE) | 1 | Aurelle/AURELLE_MARKETPLACE_DESIGN.md |
| `orders` | Đơn hàng | 4 | INTEGRATION_GUIDE_ORDERS.md |
| `order-groups` | Nhóm đơn, lấy hàng, giữ chỗ, liên kết | 18 | INTEGRATION_GUIDE_FULFILLMENT.md, INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md, INTEGRATION_GUIDE_SHIPPING.md B.6 |
| `warehouse` | Kho hàng | 34 | INTEGRATION_GUIDE_WAREHOUSE.md |
| `categories` | Danh mục sản phẩm | 6 | INTEGRATION_GUIDE_WAREHOUSE.md |
| `master-skus` | SKU nội bộ & màu | 19 | INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md |
| `product-master` | Product Master | 4 | INTEGRATION_GUIDE_WAREHOUSE.md |
| `packing` | Kế hoạch & phiên đóng gói | 27 | INTEGRATION_GUIDE_PACKING.md |
| `packaging` | Danh mục thùng / túi / vật tư chèn | 16 | INTEGRATION_GUIDE_PACKING.md mục 5 |
| `packaging-materials` | Kho vật liệu (G4) | 10 | INTEGRATION_GUIDE_PACKAGING_MATERIALS.md |
| `shipping` | Hãng vận chuyển, báo giá, phương án đóng gói | 7 | INTEGRATION_GUIDE_SHIPPING.md B.7–B.8, GHN_INTEGRATION_GUIDE.md mục 11 |
| `shipments` | Vận đơn, GHN, trả hàng | 36 | INTEGRATION_GUIDE_SHIPPING.md, GHN_INTEGRATION_GUIDE.md mục 11 |
| `documents` | Chứng từ PDF | 3 | INTEGRATION_GUIDE_SHIPPING.md B.7.6 |
| `storefront` | Website AURELLE (storefront) | 27 | Aurelle/, storefront/README |
| | **Tổng** | **239** | |

## Ứng dụng gốc (`app`) — 1 route

Đọc chi tiết: —

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| GET | `/` | Công khai (health) | — | Kiểm tra BE đang chạy. |

## Xác thực (`auth`) — 10 route

Đọc chi tiết: INTEGRATION_GUIDE.md

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| POST | `/auth/change-password` | Mọi tài khoản đã đăng nhập | `ChangePasswordDto` | Đổi mật khẩu (bắt buộc nếu must_change_password = true) |
| POST | `/auth/forgot-password` | Công khai — giới hạn 3/phút | `ForgotPasswordDto` | Gửi email hướng dẫn đặt lại mật khẩu |
| GET | `/auth/google` | Công khai — `state` + PKCE | — | Khởi tạo đăng nhập Google OAuth |
| GET | `/auth/google/callback` | Công khai — `state` + PKCE | — | Google OAuth Callback (được Google tự động gọi) |
| POST | `/auth/login` | Công khai — giới hạn 5/phút | `LoginDto` | Đăng nhập vào hệ thống (tài khoản do Admin tạo sẵn) |
| POST | `/auth/logout` | Mọi tài khoản đã đăng nhập | `RefreshTokenDto` | Đăng xuất khỏi hệ thống (thu hồi refresh token) |
| POST | `/auth/mfa/setup` | Mọi tài khoản đã đăng nhập | — | Bước 1: Sinh QR code MFA cho tài khoản hiện tại |
| POST | `/auth/mfa/verify` | Mọi tài khoản đã đăng nhập | `VerifyMfaSetupDto` | Bước 2: Xác thực mã TOTP để kích hoạt MFA |
| POST | `/auth/refresh` | Công khai — refresh token xoay vòng | `RefreshTokenDto` | Làm mới access token bằng refresh token |
| POST | `/auth/reset-password` | Công khai — token đặt lại 1 lần (30 phút) | `ResetPasswordDto` | Đặt lại mật khẩu bằng token nhận được qua email |

## Người dùng (`users`) — 9 route

Đọc chi tiết: INTEGRATION_GUIDE.md

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| GET | `/users` | Admin, Store Owner | — | Danh sách nhân viên trong hệ thống (có phân trang) |
| POST | `/users` | Admin | `CreateUserDto` | Admin tạo tài khoản nhân viên mới |
| DELETE | `/users/:id` | Admin | — | Vô hiệu hóa tài khoản nhân viên (xóa mềm) |
| PATCH | `/users/:id` | Admin | `AdminUpdateUserDto` | Admin sửa thông tin 1 nhân viên (tên, role, SĐT, địa chỉ, mã NV, phòng ban) |
| POST | `/users/:id/disable-mfa` | Admin | — | Admin tắt MFA hộ nhân viên bị khóa (mất điện thoại, hết mã dự phòng) |
| POST | `/users/:id/reactivate` | Admin | — | Admin kích hoạt lại tài khoản đã xóa mềm |
| POST | `/users/:id/reset-password` | Admin | — | Admin reset mật khẩu hộ nhân viên (sinh mật khẩu tạm mới, cũng dùng để MỞ KHÓA tài khoản bị khóa do quá hạn 72h) |
| GET | `/users/me` | Mọi tài khoản đã đăng nhập | — | Xem hồ sơ cá nhân của chính mình |
| PATCH | `/users/me` | Mọi tài khoản đã đăng nhập | `UpdateProfileDto` | Cập nhật hồ sơ cá nhân (SĐT, địa chỉ, avatar) |

## Thông báo (`notifications`) — 4 route

Đọc chi tiết: INTEGRATION_GUIDE_OPERATIONS_UTILITIES.md

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| GET | `/notifications` | Mọi tài khoản đã đăng nhập | — | Danh sách thông báo của user hiện tại (đích danh + theo role), mới nhất trước. is_read là trạng thái của CHÍNH người gọi. Trang kế: ?before=<created_at dòng cuối>. |
| PATCH | `/notifications/:id/read` | Mọi tài khoản đã đăng nhập | — | Đánh dấu 1 thông báo đã đọc (chỉ thông báo của chính mình). |
| PATCH | `/notifications/read-all` | Mọi tài khoản đã đăng nhập | — | Đánh dấu TẤT CẢ thông báo của người gọi là đã đọc (theo role: chỉ với người gọi). |
| GET | `/notifications/unread-count` | Mọi tài khoản đã đăng nhập | — | Số thông báo chưa đọc — FE gọi định kỳ (polling) để cập nhật chuông thông báo. |

## Kết nối sàn (`marketplace-integration`) — 3 route

Đọc chi tiết: INTEGRATION_GUIDE_ORDERS.md

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| GET | `/marketplace/:platform/callback` | Công khai — `state` OAuth 1 lần (10 phút) | `OAuthCallbackQueryDto` | Endpoint sàn TỰ ĐỘNG gọi lại sau khi seller Authorize — do trình duyệt điều hướng tới, KHÔNG mang Bearer token, nên KHÔNG đặt JwtAuthGuard ở đây (xem giải thích ở JSDoc class phía trên). Bảo mật dựa vào state một-lần-dùng. Redirect thẳng về FE (không trả JSON) — đúng spec FE đã chốt: thành công kèm shopId/shopName/connected=true, thất bại kèm error=<code>. |
| GET | `/marketplace/:platform/connect` | Admin | — | Tạo URL OAuth để Admin kết nối shop trên 1 sàn (tiktok \| lazada \| tiki) |
| GET | `/marketplace/:platform/shops` | Admin, Store Owner | — | Danh sách shop đã kết nối OAuth của 1 sàn, đọc thật từ DB (không kèm token) — dùng cho màn Kết nối sàn |

## Webhook sàn (AURELLE) (`marketplace-webhooks`) — 1 route

Đọc chi tiết: Aurelle/AURELLE_MARKETPLACE_DESIGN.md

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| POST | `/marketplace/webhooks/:platform` | Công khai — chữ ký HMAC `Authorization` + chống trùng `message_id` | — | Nhận webhook "đơn mới / đổi trạng thái" của AURELLE (chữ ký HMAC), xử lý qua đồng bộ 1 đơn. |

## Đơn hàng (`orders`) — 4 route

Đọc chi tiết: INTEGRATION_GUIDE_ORDERS.md

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| GET | `/orders` | Admin, Store Owner | `ListOrdersQueryDto` | Danh sách đơn đã đồng bộ, phân trang kiểu cursor theo created_at |
| GET | `/orders/:id` | Admin, Store Owner | — | Chi tiết 1 đơn hàng, bao gồm sản phẩm (đã gộp theo SKU+trạng thái) và địa chỉ đầy đủ — dùng cho màn hình chi tiết đơn của FE |
| POST | `/orders/:platform/sync` | Admin | `SyncLazadaOrdersQueryDto` | Kích hoạt tay 1 lần đồng bộ đơn cho 1 shop đã kết nối, theo platform bất kỳ (Lazada, AURELLE...) — bản tổng quát của lazada/sync. |
| POST | `/orders/lazada/sync` | Admin | `SyncLazadaOrdersQueryDto` | Kích hoạt tay 1 lần đồng bộ đơn từ Lazada cho 1 shop đã kết nối — dùng để demo Mainflow 1 (GetOrders → GetOrderItems → chuẩn hóa → check gộp đơn → lưu Mongo) |

## Nhóm đơn, lấy hàng, giữ chỗ, liên kết (`order-groups`) — 18 route

Đọc chi tiết: INTEGRATION_GUIDE_FULFILLMENT.md, INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md, INTEGRATION_GUIDE_SHIPPING.md B.6

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| GET | `/order-groups` | Warehouse, Packaging, Coordinator, Store Owner, Admin | `ListOrderGroupsQueryDto` | Danh sách mới nhất trước; lọc fulfillment_status / assigned_staff_id (người lấy) / assigned_packer_id (người đóng trên kế hoạch active, trước phân trang) / stock_shortage / is_overdue. Mặc định 100 dòng, tối đa 200; trang kế dùng before=<createdAt dòng cuối>. |
| GET | `/order-groups/:id` | Warehouse, Packaging, Coordinator, Store Owner, Admin | — | Chi tiết 1 Order Group — đọc field "version" để dùng cho các API chuyển trạng thái. "linkedGroupCount" (Mục 9.5): số nhóm khác (có thể khác sàn) cùng người nhận, chưa giao xong. "orders" (09/10/2026): các đơn trong nhóm kèm người nhận + món đã gộp (cả đơn đã hủy). |
| POST | `/order-groups/:id/assign` | Admin, Warehouse | `AssignStaffDto` | Phân công Warehouse Staff cho 1 Order Group. Không truyền staff_id = tự động (Least-Busy, ít việc nhất). Truyền staff_id = đổi tay, ghi đè kết quả auto bất kỳ lúc nào. |
| POST | `/order-groups/:id/fulfillment/decide-partial` | Packaging, Admin | `DecidePartialDto` | Quyết định group đang "partial_needs_review" — approve=true: tiếp tục với phần có sẵn (picked); approve=false: hủy, quay lại awaiting_packaging. |
| POST | `/order-groups/:id/fulfillment/pick` | Warehouse, Admin | `TransitionOrderGroupDto` | Xác nhận ĐÃ LẤY XONG toàn bộ hàng trong Order Group (picking -> picked). Server đối soát mọi SKU đã quét đủ số đặt trong lượt hiện tại; thiếu → 409 ORD_GROUP_PICK_INCOMPLETE (dùng report-missing). Sau bước này hệ thống tự tính kế hoạch đóng gói. |
| POST | `/order-groups/:id/fulfillment/pick-item` | Warehouse, Admin | `PickItemDto` | Quét/nhập tay 1 SKU khi lấy hàng — trừ tồn kho ngay (atomic). Gọi NHIỀU LẦN, mỗi lần 1 SKU, TRƯỚC KHI bấm "pick" (xác nhận xong cả nhóm) bên dưới. Dùng client_event_id khi Mobile App offline-sync retry (chống trừ trùng). |
| POST | `/order-groups/:id/fulfillment/report-missing` | Warehouse, Admin | `ReportMissingDto` | Báo thiếu hàng khi lấy (UC-07 Alt Flow) — group chuyển "partial_needs_review", DỪNG LẠI chờ Packaging Staff/Admin quyết định (Hướng Y), thông báo Store Owner ngay. |
| DELETE | `/order-groups/:id/link` | Coordinator, Admin | — | 🆕 13/10/2026 — Bỏ liên kết tay của nhóm này (nhóm phải chưa giao). Liên kết tự động theo cùng người nhận (recipient_key) không bị ảnh hưởng. |
| POST | `/order-groups/:id/link` | Coordinator, Admin | `LinkOrderGroupDto` | 🆕 13/10/2026 — LIÊN KẾT TAY nhóm này với `target_group_id` (cùng người nhận nhưng hệ thống không tự nhận ra — VD đơn Lazada bị che dữ liệu). Sau đó 2 nhóm hiện "Đi cùng", Picking List gộp được và giao chung chuyến (POST /shipments/batch). Cả 2 nhóm phải chưa giao. Trả danh sách nhóm đang liên kết với nhóm này. |
| GET | `/order-groups/:id/linked` | Warehouse, Packaging, Coordinator, Store Owner, Admin | — | MỚI (Mục 9.5) — Các nhóm đơn KHÁC (có thể khác sàn) cùng người nhận với nhóm này, chưa giao xong. Dùng để hiển thị "Đi cùng: N kiện" và chuẩn bị giao chung chuyến. |
| GET | `/order-groups/:id/picking-list` | Warehouse, Admin | — | Danh sách sản phẩm cần lấy: số đặt + đã quét trong lượt hiện tại (picked_quantity). Số đo chỉ có khi hồ sơ đóng gói đã ready — KHÔNG bắt buộc để lấy hàng. Bản có vị trí kệ: GET /warehouse/:warehouseId/picking-list/:groupId. |
| GET | `/order-groups/:id/picking-list/:sku` | Warehouse, Admin | — | Chi tiết 1 món hàng riêng lẻ trong Order Group — dùng cho màn hình Stepper số lượng/confirm từng item trước khi quét. |
| PATCH | `/order-groups/:id/priority` | Store Owner, Admin | `SetPriorityDto` | Đánh dấu đơn Hỏa Tốc/Bình thường — Lazada KHÔNG cung cấp tín hiệu tự động (đã xác minh bằng doc thật), Store Owner/Admin tự tay quyết định. Tự tính packaging_deadline theo giờ hành chính (8h-17h, tính cả Thứ 7). |
| GET | `/order-groups/:id/stock-reservation` | Admin, Store Owner, Warehouse | — | Chi tiết giữ chỗ của nhóm đơn theo từng SKU. |
| POST | `/order-groups/:id/stock-reservation/recheck` | Admin, Store Owner | — | Tính lại giữ chỗ (VD vừa nhập thêm hàng cho nhóm đơn đang thiếu). |
| POST | `/order-groups/:id/stock-reservation/release` | Admin | — | Nhả toàn bộ giữ chỗ của nhóm đơn (VD nhóm đơn bị hủy/treo). |
| GET | `/order-groups/staff/search` | Admin, Warehouse, Packaging | — | Danh sách Warehouse Staff kèm số việc đang xử lý (workload real-time) — dùng cho màn hình chọn tay khi Admin/Warehouse Staff muốn đổi phân công. |
| GET | `/stock-availability` | Admin, Store Owner, Warehouse | `StockAvailabilityQueryDto` | Tồn thực / đã giữ / khả dụng của 1 SKU sàn (tự tra SKU nội bộ nếu đã nối). ?platform&shop_id&seller_sku |

## Kho hàng (`warehouse`) — 34 route

Đọc chi tiết: INTEGRATION_GUIDE_WAREHOUSE.md

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| GET | `/warehouse/:warehouseId/picking-list` | Warehouse, Admin | — | MỚI (Mục 9.5) — Picking List GỘP nhiều Order Group (có thể khác sàn, cùng người nhận — xem GET :id/linked) thành 1 lượt đi kệ. Mỗi dòng vẫn ghi rõ order_group_id (thùng nào) — quét hàng vẫn theo từng nhóm. |
| GET | `/warehouse/:warehouseId/picking-list/:groupId` | Warehouse, Admin | — | Picking List CÓ vị trí kệ thật, đã sắp xếp theo lộ trình vật lý trong kho (wave picking) — dùng cho màn hình Warehouse Picking (Mobile App). |
| DELETE | `/warehouse/bin-locations/:binId` | Admin | — | 🆕 K1 — Vô hiệu hóa 1 kệ. Chặn 409 nếu kệ còn hàng. |
| PATCH | `/warehouse/bin-locations/:binId` | Admin | `UpdateBinDto` | 🆕 K2 — Sửa sức chứa + danh mục/size/màu đăng ký của 1 ô. KHÔNG sửa được mã ô. |
| DELETE | `/warehouse/bin-locations/:binId/permanent` | Admin | — | 🆕 10/10/2026 — XOÁ HẲN 1 ô tạo nhầm (kèm dòng gán thử tồn 0). Chỉ khi chưa từng có hàng/nhập–xuất (409 WH_HAS_STOCK / WH_HAS_HISTORY). |
| POST | `/warehouse/bin-locations/:binId/reactivate` | Admin | — | 🆕 K1 — Kích hoạt lại 1 kệ. Khu chứa kệ phải đang hoạt động. |
| GET | `/warehouse/sku-bin-assignments/unassigned` | Admin | — | Danh sách SKU đã có trong Product Master nhưng CHƯA được gán vị trí kệ — Admin chỉ cần mở đúng màn hình này mỗi khi có sản phẩm mới, không phải dò tay. |
| GET | `/warehouse/warehouses` | Admin, Warehouse | — | Danh sách kho. 🔄 SỬA (19/09/2026, báo cáo Hải Phượng) — mở thêm cho Warehouse Staff: trước đây CHỈ Admin xem được, nhưng picking-list/pick-item/report-missing đều BẮT BUỘC warehouse_id — Warehouse Staff không có cách nào (qua API) biết warehouse_id nào để dùng nếu route này vẫn khóa Admin-only. |
| POST | `/warehouse/warehouses` | Admin | `CreateWarehouseDto` | Tạo kho mới (bước 1/4 trong luồng "add kho") |
| DELETE | `/warehouse/warehouses/:warehouseId` | Admin | — | 🆕 K1 — Vô hiệu hóa kho (xóa mềm). Chặn 409 WH_HAS_STOCK nếu còn hàng. Tự vô hiệu hóa toàn bộ khu + kệ bên trong. |
| GET | `/warehouse/warehouses/:warehouseId` | Admin, Warehouse | — | 🆕 K1 — Chi tiết 1 kho (kể cả đã vô hiệu hóa). |
| PATCH | `/warehouse/warehouses/:warehouseId` | Admin | `UpdateWarehouseDto` | 🆕 K1 — Sửa tên/địa chỉ kho. KHÔNG sửa được warehouse_code. |
| GET | `/warehouse/warehouses/:warehouseId/bin-locations` | Admin, Warehouse | — | BỔ SUNG (16/09/2026) — Danh sách TOÀN BỘ kệ trong 1 kho (mọi khu gộp lại). |
| GET | `/warehouse/warehouses/:warehouseId/bin-suggestions` | Admin, Warehouse | `BinSuggestionsQueryDto` | 🆕 K2 — Gợi ý ô xếp hàng theo danh mục (bắt buộc), size, màu. Chỉ gợi ý ô còn chỗ. |
| DELETE | `/warehouse/warehouses/:warehouseId/permanent` | Admin | — | 🆕 10/10/2026 — XOÁ HẲN kho tạo nhầm + toàn bộ khu/ô bên trong. Chỉ khi kho CHƯA TỪNG có hàng/nhập–xuất (409 WH_HAS_STOCK / WH_HAS_HISTORY nếu đã dùng → dùng DELETE thường để vô hiệu hoá). |
| POST | `/warehouse/warehouses/:warehouseId/reactivate` | Admin | — | 🆕 K1 — Kích hoạt lại kho. CHỈ kho — các khu vẫn tắt, Admin bật lại từng khu. |
| GET | `/warehouse/warehouses/:warehouseId/sku-bin-assignments` | Admin, Warehouse | — | BỔ SUNG (16/09/2026, báo cáo Hải Phượng) — Danh sách SKU đã gán vị trí trong 1 kho, để Admin xem lại/đối chiếu sau khi gán (trước đây chỉ GET được danh sách CHƯA gán, không GET được danh sách ĐÃ gán). |
| POST | `/warehouse/warehouses/:warehouseId/sku-bin-assignments` | Admin | `AssignSkuBinDto` | Gán 1 SKU vào 1 kệ cụ thể (bước 4/4) |
| DELETE | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId` | Admin | — | 🆕 K3 — Bỏ gán SKU khỏi ô (chỉ khi tồn = 0). Sổ cái cũ giữ nguyên. |
| PATCH | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId` | Admin | `MoveAssignmentDto` | 🆕 10/10/2026 — SỬA GÁN NHẦM: dời SKU sang ô đúng (cùng kho). Ô hết hàng → chỉ đổi ô; ô còn hàng → chuyển toàn bộ (ghi sổ cái) rồi bỏ dòng cũ. Trả về dòng ở ô đích. |
| POST | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/adjust` | Admin, Warehouse | `AdjustStockDto` | 🆕 K3 — Kiểm kê: nhập số đếm thực tế, hệ thống tự tính chênh lệch + ghi sổ cái (bắt buộc lý do). |
| GET | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/movements` | Admin, Warehouse, Store Owner | — | 🆕 K3 — Sổ cái của 1 SKU trên 1 ô (mới -> cũ): nhập, lấy, kiểm kê, chuyển, hoàn. |
| POST | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock` | Admin, Warehouse | `RestockSkuDto` | Nhập thêm hàng vào 1 vị trí đã gán (cộng dồn quantity_on_hand, không reset về giá trị mới). |
| POST | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/transfer` | Admin, Warehouse | `TransferStockDto` | 🆕 K3 — Chuyển hàng sang ô khác cùng kho (trừ nguồn + cộng đích + 2 dòng sổ cái, 1 transaction). |
| GET | `/warehouse/warehouses/:warehouseId/zones` | Admin, Warehouse | — | Danh sách khu trong 1 kho |
| POST | `/warehouse/warehouses/:warehouseId/zones` | Admin | `CreateZoneDto` | Tạo khu trong 1 kho (bước 2/4) |
| DELETE | `/warehouse/zones/:zoneId` | Admin | — | 🆕 K1 — Vô hiệu hóa khu + toàn bộ kệ trong khu. Chặn 409 nếu còn hàng. |
| PATCH | `/warehouse/zones/:zoneId` | Admin | `UpdateZoneDto` | 🆕 K1 — Sửa tên/mô tả khu. KHÔNG sửa được zone_code (đã nằm trong mã kệ in trên nhãn). |
| GET | `/warehouse/zones/:zoneId/bin-locations` | Admin | — | BỔ SUNG (16/09/2026, báo cáo Hải Phượng) — Danh sách kệ đã tạo trong 1 khu. Trước đây chỉ có POST .../generate để TẠO, không có cách XEM LẠI. |
| POST | `/warehouse/zones/:zoneId/bin-locations/generate` | Admin | `GenerateBinLocationsDto` | Tạo HÀNG LOẠT kệ trong 1 khu theo dãy (bước 3/4) — VD aisle=03, rack 1-10, level 1-4 -> tự sinh 40 kệ, không cần tạo tay từng cái. |
| DELETE | `/warehouse/zones/:zoneId/permanent` | Admin | — | 🆕 10/10/2026 — XOÁ HẲN khu tạo nhầm + toàn bộ ô trong khu. Chỉ khi chưa từng có hàng/nhập–xuất (409 WH_HAS_STOCK / WH_HAS_HISTORY). |
| POST | `/warehouse/zones/:zoneId/racks` | Admin | `CreateRackDto` | 🆕 K2 — Tạo 1 kệ chuẩn mới (mã KA-D1-P02-T03-1) + toàn bộ ô, mỗi tầng 1 size, mỗi ô 1 màu. Thay thế dần endpoint generate cũ. |
| DELETE | `/warehouse/zones/:zoneId/racks/permanent` | Admin | `PurgeRackQueryDto` | 🆕 10/10/2026 — XOÁ HẲN nguyên KỆ hoặc nguyên DÃY tạo nhầm trong 1 lần gọi. ?aisle=D1 (cả dãy) \| &side=P (1 bên) \| &bay=2 (đúng 1 kệ). Tất cả hoặc không gì: có 1 ô đã có hàng/nhập–xuất → 409 WH_HAS_STOCK / WH_HAS_HISTORY, không xoá ô nào. |
| POST | `/warehouse/zones/:zoneId/reactivate` | Admin | — | 🆕 K1 — Kích hoạt lại khu + toàn bộ kệ trong khu. Kho phải đang hoạt động. |

## Danh mục sản phẩm (`categories`) — 6 route

Đọc chi tiết: INTEGRATION_GUIDE_WAREHOUSE.md

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| GET | `/categories` | Admin, Store Owner, Warehouse, Packaging | — | 🆕 K2 — Cây danh mục (cấp 1 kèm danh sách cấp 2). ?include_inactive=true để thấy cả mục đã tắt. |
| POST | `/categories` | Admin | `CreateCategoryDto` | 🆕 K2 — Tạo danh mục. Không có parent_code = cấp 1; có = cấp 2 (bắt buộc size_scale). |
| DELETE | `/categories/:code` | Admin | — | 🆕 K2 — Vô hiệu hóa. Chặn nếu còn danh mục con đang bật hoặc ô kệ đang đăng ký. |
| GET | `/categories/:code` | Admin, Store Owner, Warehouse, Packaging | — | 🆕 K2 — Chi tiết 1 danh mục. |
| PATCH | `/categories/:code` | Admin | `UpdateCategoryDto` | 🆕 K2 — Sửa tên/thang size. Bỏ size đang được kệ dùng -> 409 CAT_SIZE_IN_USE. |
| POST | `/categories/:code/reactivate` | Admin | — | 🆕 K2 — Kích hoạt lại (danh mục cha phải đang bật). |

## SKU nội bộ & màu (`master-skus`) — 19 route

Đọc chi tiết: INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| GET | `/colors` | Admin, Store Owner, Warehouse, Packaging | — | 🆕 K4a — Danh mục màu chuẩn (dropdown). ?include_inactive=true |
| POST | `/colors` | Admin | `CreateColorDto` | 🆕 K4a — Khai màu (mã 2-10 chữ hoa, khóa sau khi tạo). |
| DELETE | `/colors/:code` | Admin | — | Vô hiệu hóa (chặn nếu còn SKU nội bộ dùng). |
| PATCH | `/colors/:code` | Admin | `UpdateColorDto` | Sửa tên / mã hiển thị của màu (mã màu trong SKU nội bộ không đổi). |
| POST | `/colors/:code/reactivate` | Admin | — | Bật lại màu đã ngừng dùng. |
| GET | `/master-skus` | Admin, Store Owner, Warehouse, Packaging | — | 🆕 K4a — Danh sách SKU nội bộ. ?category_code&color_code&search&include_inactive&page&limit |
| POST | `/master-skus` | Admin | `CreateMasterSkuDto` | 🆕 K4a — Tạo SKU nội bộ: hệ thống tự ghép mã {danh mục}-{mẫu}-{màu}-{size}, VD ATHUN-005-DEN-M. |
| DELETE | `/master-skus/:code` | Admin | — | Vô hiệu hóa (chặn nếu còn SKU sàn nối vào). |
| GET | `/master-skus/:code` | Admin, Store Owner, Warehouse, Packaging | — | Chi tiết 1 SKU nội bộ. |
| PATCH | `/master-skus/:code` | Admin | `UpdateMasterSkuDto` | Sửa tên/giới tính/kích thước/dễ vỡ. KHÔNG sửa mã và danh mục-mẫu-màu-size (dùng Thay thế). |
| GET | `/master-skus/:code/mappings` | Admin, Store Owner, Warehouse, Packaging | — | Các SKU sàn đang nối vào SKU nội bộ này. |
| POST | `/master-skus/:code/mappings` | Admin | `CreateMappingDto` | 🆕 K4a — Nối 1 SKU sàn (phải đã đồng bộ về) vào SKU nội bộ này. |
| DELETE | `/master-skus/:code/permanent` | Admin | — | 🆕 10/10/2026 — XOÁ HẲN SKU nội bộ tạo nhầm. Chỉ khi chưa từng dùng: không còn SKU sàn nối vào (MSKU_HAS_MAPPINGS), không nằm trên ô (MSKU_HAS_STOCK), chưa có nhập–xuất (MSKU_HAS_HISTORY). |
| POST | `/master-skus/:code/reactivate` | Admin | — | Bật lại SKU nội bộ đã ngừng dùng. |
| POST | `/master-skus/:code/replace` | Admin | `ReplaceMasterSkuDto` | 🆕 K4a — THAY THẾ SKU đặt sai: tạo SKU mới + chuyển liên kết sàn + khóa SKU cũ (replaced_by), 1 transaction. |
| DELETE | `/master-skus/mappings/:id` | Admin | — | Bỏ nối 1 SKU sàn. 🔄 K4b: chặn nếu SKU nội bộ còn tồn gộp chung (MAP_HAS_POOLED_STOCK). |
| POST | `/master-skus/sync-stock` | Admin | — | 🆕 K4b — Gắn nhãn/gộp tồn cho MỌI liên kết (liên kết tạo trước K4b). Chạy lại nhiều lần an toàn. |
| GET | `/master-skus/unmapped-seller-skus` | Admin, Store Owner | — | 🆕 K4a — SKU sàn đã đồng bộ về nhưng chưa nối SKU nội bộ (việc cần làm). |
| GET | `/master-skus/unpooled-stock` | Admin, Store Owner | — | 🆕 K4b — Dòng tồn > 0 CHƯA tính theo SKU nội bộ: notMapped (cần nối) + mappedNotSynced (cần bấm đồng bộ). |

## Product Master (`product-master`) — 4 route

Đọc chi tiết: INTEGRATION_GUIDE_WAREHOUSE.md

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| GET | `/product-master` | Warehouse, Packaging, Store Owner, Admin | `ListProductMasterQueryDto` | Danh sách hồ sơ SKU (lọc status=needs_measurement để biết SKU cần đo). |
| GET | `/product-master/:id` | Warehouse, Packaging, Store Owner, Admin | — | Chi tiết 1 hồ sơ sản phẩm. |
| PUT | `/product-master/:id/packaging-profile` | Warehouse, Admin | `ConfirmPackagingProfileDto` | Kho/Admin xác nhận số đo thật sau gấp/bọc + quy cách xếp → hồ sơ chuyển ready. |
| POST | `/product-master/sync` | Admin | — | Đồng bộ NGAY catalog sản phẩm từ sàn vào Product Master (không chờ cron mỗi giờ). Mặc định chỉ lấy sản phẩm thay đổi từ lần trước; full=true lấy toàn bộ. Bỏ shop_id = mọi shop đang kết nối của mọi sàn hỗ trợ. Số đo sàn chỉ ghi vào marketplaceDimension, không đổi hồ sơ kho đã xác nhận. |

## Kế hoạch & phiên đóng gói (`packing`) — 27 route

Đọc chi tiết: INTEGRATION_GUIDE_PACKING.md

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| GET | `/order-groups/:groupId/packing-plan` | Packaging, Warehouse, Coordinator, Store Owner, Admin | — | Kế hoạch đóng gói đang hoạt động của nhóm (null nếu chưa có). |
| POST | `/order-groups/:groupId/packing-plan/approve` | Packaging, Admin | `ApprovePlanDto` | Chấp nhận và bắt đầu ngay: ready → packing, nhóm → approved_for_packing trong cùng transaction; version +1, ghi người/giờ duyệt và bắt đầu. Mọi đơn phải xếp hết món. |
| POST | `/order-groups/:groupId/packing-plan/undo-approve` | Packaging, Admin | `VersionedDto` | Quay lại chờ chấp nhận trước khi từng niêm phong: packing/approved → ready, nhóm → pending_approval, cùng transaction; giữ kế hoạch/phân công, xóa lượt quét và người/giờ duyệt/bắt đầu, version +1. Response `{ plan }`, lịch sử `undo_approve`. Đã/từng niêm phong hoặc có kiện phải tháo → 409 PACKING_UNDO_APPROVE_NOT_ALLOWED. |
| POST | `/order-groups/:groupId/packing-plan/assign` | Packaging, Admin | `AssignPackerDto` | Giao người đóng (Packaging Staff): auto = ít việc nhất; manual = chỉ định staff_id. |
| POST | `/order-groups/:groupId/packing-plan/back-to-picking` | Packaging, Admin | `BackToPickingDto` | Lối ra thứ 3 sau khi từ chối: trả nhóm về bước lấy hàng. Khai món phải lấy lại (restock=true: món lấy nhầm còn tốt, cộng lại đúng ô; mặc định: món hỏng, loại bỏ). Kế hoạch cũ superseded, nhóm picked → picking; kho quét bù rồi xác nhận lấy xong, cron tự tính kế hoạch mới. |
| POST | `/order-groups/:groupId/packing-plan/finish` | Packaging, Warehouse, Admin | `FinishPackingDto` | Hoàn tất khi mọi kiện còn giao đã niêm phong nhưng kế hoạch chưa tự sang packed. |
| POST | `/order-groups/:groupId/packing-plan/manual` | Packaging, Admin | `ManualPackDto` | Đóng gói THỦ CÔNG sau khi từ chối: nhập kiện thật (thùng + món). Hệ thống kiểm đủ món, thùng còn tồn, quá tải; tạo kế hoạch mới chờ người KHÁC duyệt. |
| POST | `/order-groups/:groupId/packing-plan/pack` | Packaging, Warehouse, Admin | `PackPlanDto` | Lối tắt: cân cho ĐỦ các kiện chưa niêm phong trong 1 lần (không quét từng món — ghi "bypass"). Kiện lệch cân bị giữ chờ xem lại; hết kiện giữ → nhóm packed trong OptiPack. Bị chặn khi cài đặt require_scan = true. |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/change-box` | Packaging, Admin | `ChangeBoxDto` | Đổi thùng cho 1 kiện — xếp lại và phải qua validator. |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/change-box-in-session` | Packaging, Warehouse, Admin | `ChangeBoxInSessionDto` | Đổi thùng khi ĐANG đóng (kế hoạch approved/packing, kiện chưa niêm phong). Bắt buộc khai thùng cũ: unused = trả kệ, không trừ; damaged = trừ tồn + ghi hao hụt. Giữ các lần quét đã có. |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/guide` | Packaging, Warehouse, Admin | `GuideDto` | Hướng dẫn đóng gói từng bước cho 1 kiện (AI viết lời, có câu mẫu dự phòng). |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/move-item` | Packaging, Admin | `MoveItemDto` | Chuyển 1 món sang kiện khác cùng đơn, hoặc tách ra kiện mới. |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/review` | Packaging, Admin | `ReviewParcelDto` | Xem lại kiện lệch cân: accept (người KHÁC người niêm phong), reweigh (cân lại), reopen (mở ra đóng lại, không trừ thùng lần 2). |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/scan` | Packaging, Warehouse, Admin | `ScanItemDto` | Quét món vào kiện (SKU sàn hoặc SKU nội bộ). Sai kiện / quá số món bị chặn. Không cần expected_version; gửi lại cùng client_event_id không đếm 2 lần. |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/seal` | Packaging, Warehouse, Admin | `SealParcelDto` | Niêm phong + cân 1 kiện (đã quét đủ): trừ thùng/vật tư của kiện. Lệch cân quá ngưỡng → kiện "held" chờ người khác xem lại. Kiện cuối cùng → nhóm packed trong OptiPack. |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/unpack` | Packaging, Warehouse, Admin | `UnpackParcelDto` | Tháo kiện của đơn bị hủy sau khi đóng: hàng về đúng ô đã lấy (sổ kho cancel_unpack), thùng còn tốt vào kho tái sử dụng, vật tư chèn khai trong recovered_materials được thu hồi. |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/unscan` | Packaging, Warehouse, Admin | `UnscanItemDto` | Gỡ 1 lần quét (quét nhầm) — bắt buộc lý do, ghi nhật ký. |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/unseal` | Packaging, Warehouse, Store Owner, Admin | `UnsealParcelDto` | Hoàn tác niêm phong 1 kiện (sealed/held) để đóng lại. Kế hoạch đang đóng: nhân viên đóng gói làm được. Nhóm đã packed (chưa giao): chỉ Admin/Store Owner, nhóm quay về approved_for_packing. Thùng reusable = dùng lại, không trừ lần 2; damaged = mất, niêm phong lại trừ cái mới + ghi hao hụt. Lazada KHÔNG hoàn tác được Pack — response có cảnh báo. |
| POST | `/order-groups/:groupId/packing-plan/recompute` | Packaging, Admin | `RecomputePlanDto` | Tính lại (có điều kiện: loại trừ thùng, ưu tiên rẻ). Kế hoạch cũ bị thay, nhóm quay về picked rồi tính ngay; CP-SAT chạy nền. |
| POST | `/order-groups/:groupId/packing-plan/reject` | Packaging, Admin | `RejectPlanDto` | Từ chối kế hoạch: lý do theo MÃ, có người xử lý + hạn (2 giờ làm việc). Nhóm về picked, không tự tính lại; lối ra: recompute, manual hoặc back-to-picking. |
| POST | `/order-groups/:groupId/packing-plan/report-issue` | Packaging, Warehouse, Admin | `ReportIssueDto` | Báo món hỏng/thiếu/sai lúc đóng: replace = lấy món thay từ kệ ngay; back_to_picking = trả nhóm về lấy hàng (chỉ khi chưa niêm phong kiện nào). |
| POST | `/order-groups/:groupId/packing-plan/start` | Packaging, Warehouse, Admin | `StartPackingDto` | Tương thích kế hoạch approved cũ → packing. Luồng mới approve đã bắt đầu đóng; gọi lại khi packing không thay đổi dữ liệu. |
| GET | `/packing-plans/summary` | Packaging, Warehouse, Coordinator, Store Owner, Admin | — | Tóm tắt kế hoạch đang hoạt động của các nhóm (?group_ids=a,b,c — tối đa 200). |
| GET | `/packing/reports/feedback` | Store Owner, Admin | — | Vòng phản hồi (08/10/2026): gom các lần nhân viên làm KHÁC gợi ý (chỉnh tay, từ chối, lệch cân) theo lý do × SKU × thùng và ĐỀ XUẤT việc Admin nên sửa (hồ sơ SKU, danh mục thùng, cài đặt). ?from&to ISO (mặc định 30 ngày); ?min_count số lần tối thiểu để sinh đề xuất (mặc định 3). |
| GET | `/packing/reports/summary` | Store Owner, Admin | — | Hiệu suất đóng gói trong khoảng ngày (?from&to ISO, mặc định 30 ngày; ?staff_id lọc 1 người): thời gian, tỷ lệ lệch cân, duyệt nguyên vẹn, đạt số kiện tối thiểu, quét kiểm, chi phí, theo nhân viên. |
| GET | `/packing/settings` | Packaging, Warehouse, Store Owner, Admin | — | Cài đặt đóng gói đang dùng (version null = mặc định trong code). |
| PUT | `/packing/settings` | Store Owner, Admin | `UpdatePackingSettingsDto` | Lưu cài đặt mới (tạo version mới, giữ lịch sử). Trường không gửi giữ nguyên. |
| GET | `/packing/staff` | Packaging, Store Owner, Admin | — | Danh sách Packaging Staff đang hoạt động kèm số kế hoạch đang mở (?q tìm theo tên/email). Dùng cho dropdown giao người đóng (packing-plan/assign) và người xử lý khi từ chối (reject.owner_id). |

## Danh mục thùng / túi / vật tư chèn (`packaging`) — 16 route

Đọc chi tiết: INTEGRATION_GUIDE_PACKING.md mục 5

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| GET | `/packaging/bags` | Packaging, Warehouse, Store Owner, Admin | — | Danh mục túi zip bọc hàng (kích thước trải phẳng, mm). |
| POST | `/packaging/bags` | Admin | `CreatePackagingBagDto` | Thêm túi zip vào danh mục (Admin). |
| PATCH | `/packaging/bags/:id` | Admin | `UpdatePackagingBagDto` | Sửa túi zip hoặc ngừng dùng (is_active=false) — Admin. |
| POST | `/packaging/bags/:id/stock-in` | Warehouse, Admin | `StockInBagDto` | Nhập thêm túi zip vào kho (tăng tồn, ghi sổ vật tư). Tồn bị trừ lúc niêm phong kiện. |
| GET | `/packaging/boxes` | Packaging, Warehouse, Store Owner, Admin | — | Danh mục thùng carton (mm/g) kèm tồn kho: quantityOnHand (thực có), reserved (phương án chưa đóng đang giữ chỗ), available (còn trống — engine chỉ chọn thùng available > 0). |
| POST | `/packaging/boxes` | Admin | `CreatePackagingBoxDto` | Thêm thùng carton vào danh mục (Admin). |
| PATCH | `/packaging/boxes/:id` | Admin | `UpdatePackagingBoxDto` | Sửa thùng, mức cảnh báo, vị trí hoặc ngừng dùng (is_active=false) — Admin. Không sửa được tồn (dùng stock-in). |
| GET | `/packaging/boxes/:id/movements` | Admin, Warehouse, Packaging | — | Lịch sử xuất/nhập của 1 loại thùng (mới nhất trước, tối đa 20 dòng). |
| POST | `/packaging/boxes/:id/stock-in` | Admin, Warehouse | `StockInPackagingBoxDto` | Nhập thêm thùng vào kho (ghi 1 dòng sổ xuất/nhập). Tồn chỉ đổi qua route này hoặc lúc pack. |
| GET | `/packaging/materials` | Packaging, Warehouse, Store Owner, Admin | — | Danh mục vật tư chèn (góc xốp, tấm ngăn, gối hơi...) kèm tồn kho. Engine chỉ dùng vật tư đang dùng. |
| POST | `/packaging/materials` | Admin | `CreatePackagingMaterialDto` | Thêm vật tư vào danh mục (Admin). Tồn ban đầu 0 — nhập qua stock-in. |
| PATCH | `/packaging/materials/:id` | Admin | `UpdatePackagingMaterialDto` | Sửa vật tư, mức cảnh báo, vị trí hoặc ngừng dùng (is_active=false) — Admin. Không sửa được tồn (dùng stock-in). |
| GET | `/packaging/materials/:id/movements` | Admin, Warehouse, Packaging | — | Lịch sử xuất/nhập của 1 vật tư (mới nhất trước, tối đa 20 dòng). |
| POST | `/packaging/materials/:id/stock-in` | Admin, Warehouse | `StockInPackagingMaterialDto` | Nhập thêm vật tư vào kho (ghi 1 dòng sổ). Tồn chỉ đổi qua route này hoặc lúc pack. |
| GET | `/packaging/materials/rules` | Packaging, Warehouse, Store Owner, Admin | — | Bộ luật chọn vật tư hiện hành (version null = luật mặc định trong code). Kết quả là ƯỚC LƯỢNG theo luật, không phải lượng đệm tính từ hình học. |
| PUT | `/packaging/materials/rules` | Admin | `UpdateMaterialRulesDto` | Lưu bộ luật mới (tạo version kế tiếp, bản cũ tắt — giữ lịch sử). Áp dụng từ lần generate sau. |

## Kho vật liệu (G4) (`packaging-materials`) — 10 route

Đọc chi tiết: INTEGRATION_GUIDE_PACKAGING_MATERIALS.md

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| GET | `/packaging-materials` | Admin, Store Owner, Warehouse, Packaging | — | Danh mục vật liệu kèm tồn MỚI / TÁI SỬ DỤNG. ?include_inactive=true |
| POST | `/packaging-materials` | Admin | `CreatePackagingMaterialDto` | Khai vật liệu. Thùng: đủ 3 cạnh (khớp gợi ý đóng gói). Đệm: match_material_type. |
| DELETE | `/packaging-materials/:code` | Admin | — | Vô hiệu hóa (chặn nếu còn tồn). |
| GET | `/packaging-materials/:code` | Admin, Store Owner, Warehouse, Packaging | — | Chi tiết 1 vật liệu (tồn mới / tái sử dụng / nội bộ). |
| PATCH | `/packaging-materials/:code` | Admin | `UpdatePackagingMaterialDto` | Sửa tên / đơn giá / tái sử dụng / số lần tối đa. KHÔNG sửa mã, loại, kích thước. |
| POST | `/packaging-materials/:code/internal-use` | Admin, Warehouse | `InternalUseDto` | Xuất vật liệu hạng B để dùng nội bộ (ghi sổ cái kèm mục đích). |
| POST | `/packaging-materials/:code/purchase` | Admin, Warehouse | `PurchasePackagingDto` | Nhập vật liệu MỚI (ghi sổ cái). |
| POST | `/packaging-materials/:code/reactivate` | Admin | — | Bật lại vật liệu đã ngừng dùng. |
| GET | `/packaging-materials/movements` | Admin, Store Owner, Warehouse, Packaging | — | Sổ cái vật liệu (mới -> cũ). ?material_code=BOX-M&limit=100 |
| GET | `/packaging-materials/savings` | Admin, Store Owner | — | Tổng tiền tiết kiệm nhờ tái sử dụng + tỷ lệ dùng lại (cho Dashboard). |

## Hãng vận chuyển, báo giá, phương án đóng gói (`shipping`) — 7 route

Đọc chi tiết: INTEGRATION_GUIDE_SHIPPING.md B.7–B.8, GHN_INTEGRATION_GUIDE.md mục 11

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| GET | `/shipping/carriers` | Coordinator, Store Owner, Warehouse, Admin | — | Danh mục hãng vận chuyển + bảng cước (mặc định chỉ hãng đang dùng). |
| POST | `/shipping/carriers` | Admin | `CreateCarrierDto` | Thêm hãng vận chuyển + dịch vụ + bảng cước theo bậc khối lượng. |
| PATCH | `/shipping/carriers/:id` | Admin | `UpdateCarrierDto` | Sửa hãng/bảng cước hoặc ngừng dùng (`is_active: false`). Không đổi được mã. |
| GET | `/shipping/packaging-options/:groupId` | Coordinator, Packaging, Store Owner, Admin | `PackagingOptionsQueryDto` | C6 — So TỔNG chi phí (thùng + vật tư chèn + phí ship của hãng/dịch vụ chọn) cho mọi thùng xếp vừa từng kiện; chỉ ra phương án rẻ nhất và số tiền tiết kiệm. Chỉ đọc — áp dụng bằng route đổi thùng của kế hoạch đóng gói. |
| GET | `/shipping/quote/:groupId` | Coordinator, Store Owner, Admin | `QuoteQueryDto` | Báo giá vận chuyển cho nhóm đơn: mỗi (hãng, dịch vụ) một dòng — cước từng kiện, tổng cước, thời gian giao dự kiến — kèm dịch vụ ĐỀ XUẤT theo tùy chọn của Store Owner. |
| GET | `/shipping/settings` | Coordinator, Store Owner, Admin | — | Tùy chọn vận chuyển của Store Owner (chiến lược đề xuất, dịch vụ mặc định). |
| PUT | `/shipping/settings` | Store Owner, Admin | `UpdateShippingSettingsDto` | Cấu hình tùy chọn vận chuyển: cheapest / fastest / fixed (+ dịch vụ mặc định). |

## Vận đơn, GHN, trả hàng (`shipments`) — 36 route

Đọc chi tiết: INTEGRATION_GUIDE_SHIPPING.md, GHN_INTEGRATION_GUIDE.md mục 11

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| POST | `/carriers/ghn/webhook` | Công khai — header `X-OptiPack-Secret` (hoặc `?secret=`) + kiểm ShopID | `CarrierEventPayload` (khuôn GHN) | C5 — Nhận Order Status Callback của GHN; trả 200 cho sự kiện đã nhận (kể cả trùng/bỏ qua), 5xx khi lỗi tạm thời để GHN gửi lại. |
| POST | `/order-groups/:id/fulfillment/deliver` | Coordinator, Admin | `TransitionOrderGroupDto` | (Cũ) shipped -> delivered. Nay đi qua vận đơn. Dùng POST /shipments/:id/deliver. |
| POST | `/order-groups/:id/fulfillment/return` | Coordinator, Warehouse, Admin | `TransitionOrderGroupDto` | (Cũ) shipped/delivered -> returned. Nay ghi lịch sử vận đơn. Dùng luồng /shipments. |
| POST | `/order-groups/:id/fulfillment/ship` | Coordinator, Admin | `TransitionOrderGroupDto` | (Cũ) packed -> shipped. Nay tạo vận đơn out_for_delivery. Dùng POST /shipments. |
| GET | `/returns` | Admin, Store Owner, Warehouse, Coordinator | `ListReturnsQueryDto` | Danh sách phiếu trả hàng (lọc trạng thái, nhóm đơn, phân trang). |
| POST | `/returns` | Admin | `CreateReturnDto` | Tạo phiếu trong 15 ngày từ ngày giao gốc; return_refund trả đủ nhóm (cộng dồn phiếu closed) → nhóm returning, phiếu requested. |
| GET | `/returns/:id` | Admin, Store Owner, Warehouse, Coordinator | — | Chi tiết phiếu trả hàng (dòng hàng, kết quả kiểm, thu hồi vật liệu). |
| POST | `/returns/:id/approve` | Store Owner, Admin | `ReturnActionDto` | return_refund trả đủ nhóm → nhóm returned, phiếu awaiting_receipt; refund_only đóng luôn. Người tạo không tự duyệt. |
| POST | `/returns/:id/cancel` | Store Owner, Admin | `ReturnActionDto` | Khách không gửi: phiếu awaiting_receipt → canceled, cần note; return_refund trả đủ nhóm khôi phục nhóm delivered. |
| POST | `/returns/:id/create-replacement` | Store Owner, Admin | — | Tạo lại đơn thay thế cho phiếu đổi hàng (khi lần tạo tự động bị lỗi). |
| POST | `/returns/:id/inspect` | Warehouse, Admin | `InspectReturnDto` | Kiểm đủ từng SKU: restock/quarantine/discard, phiếu closed; return_refund trả đủ nhóm → canceled cùng transaction xử lý tồn. |
| POST | `/returns/:id/quarantine/:lineIndex/resolve` | Warehouse, Admin | `ResolveQuarantineDto` | Xử lý 1 dòng cách ly: restock (nhập lại ô bán, ghi sổ cái) hoặc discard (loại bỏ). |
| POST | `/returns/:id/receive` | Warehouse, Admin | `ReturnActionDto` | Nhận kiện: phiếu received, nhóm trả đủ giữ returned; chưa nhập tồn/chưa canceled. Có tương thích phiếu cũ. |
| POST | `/returns/:id/reject` | Store Owner, Admin | `ReturnActionDto` | Từ chối phải ghi lý do; return_refund trả đủ nhóm khôi phục nhóm delivered. |
| GET | `/returns/quarantine` | Admin, Store Owner, Warehouse | — | Hàng đang cách ly chờ xử lý (mọi phiếu), cũ nhất trước. |
| GET | `/returns/reason-codes` | Admin, Store Owner, Warehouse, Coordinator | — | Danh sách lý do trả hàng (dropdown). |
| GET | `/shipments` | Admin, Coordinator, Store Owner, Warehouse | `ListShipmentsQueryDto` | Danh sách vận đơn (lọc theo trạng thái / nhóm đơn / chuyến / hãng). |
| POST | `/shipments` | Coordinator, Admin | `StartShipmentDto` | [Bắt đầu giao] Tạo vận đơn cho nhóm đơn đã đóng gói (packed) -> out_for_delivery; nhóm đơn -> shipped. |
| GET | `/shipments/:id` | Admin, Coordinator, Store Owner, Warehouse | — | Chi tiết vận đơn. |
| POST | `/shipments/:id/carrier/book` | Coordinator, Admin | — | C4 — Tạo (lại) vận đơn ở hãng cho các kiện CHƯA có mã hãng (gọi lại an toàn, hãng không tạo trùng). |
| POST | `/shipments/:id/carrier/cancel` | Coordinator, Admin | `CancelCarrierDto` | C4 — Huỷ vận đơn ở hãng (chỉ khi "chờ lấy hàng"). Vận đơn -> cancelled, nhóm đơn -> packed để tạo lại. |
| GET | `/shipments/:id/carrier/label` | Coordinator, Warehouse, Packaging, Admin | — | C4 — Link in nhãn của hãng (GHN A5, sống ~30 phút) cho mọi kiện đã có mã hãng. |
| POST | `/shipments/:id/carrier/simulate` | Coordinator, Admin | `SimulateCarrierStatusDto` | C5 — [DEMO] Mô phỏng sự kiện của hãng (VD picked, delivering, delivered, delivery_fail, returning, returned). Dựng đúng payload webhook GHN và đi CÙNG hàm xử lý webhook. Chỉ đổi dữ liệu OptiPack, không đổi gì bên GHN. Bật bằng CARRIER_MANUAL_STATUS_ENABLED=true. |
| POST | `/shipments/:id/carrier/sync` | Coordinator, Admin | — | C5 — Đồng bộ trạng thái từ hãng (Order Info) — dự phòng khi mất webhook. |
| POST | `/shipments/:id/deliver` | Coordinator, Admin | `ShipmentActionDto` | [Giao thành công] out_for_delivery -> delivered; nhóm đơn -> delivered. |
| GET | `/shipments/:id/events` | Admin, Coordinator, Store Owner, Warehouse | — | Lịch sử vận đơn (tracking dạng dòng thời gian), cũ -> mới. |
| POST | `/shipments/:id/fail` | Coordinator, Admin | `FailShipmentDto` | [Giao thất bại] Chọn lý do. Lần 2 hoặc "khách từ chối" -> hệ thống TỰ chuyển hoàn về kho. |
| PATCH | `/shipments/:id/pickup` | Coordinator, Admin | `SchedulePickupDto` | Đặt/đổi lịch hãng đến lấy hàng (chỉ lưu lịch, chưa gọi API hãng). |
| POST | `/shipments/:id/receive-return` | Warehouse, Admin | `ShipmentActionDto` | [Kho nhận hàng hoàn] returning_to_warehouse -> returned_to_warehouse; nhóm đơn -> returned. |
| POST | `/shipments/:id/retry` | Coordinator, Admin | `RetryShipmentDto` | [Giao lại] delivery_failed -> out_for_delivery. Trước giờ cho phép (nextAttemptNotBefore) phải gửi override_reason. |
| PATCH | `/shipments/:id/to-location` | Coordinator, Admin | `UpdateToLocationDto` | C4 — Sửa địa chỉ gửi hãng (số nhà / phường / tỉnh / SĐT) khi hãng báo sai địa chỉ, rồi tự tạo lại ở hãng. Chỉ khi còn kiện chưa có mã hãng. |
| POST | `/shipments/batch` | Coordinator, Admin | `CreateShipmentBatchDto` | Giao chung chuyến: tạo vận đơn cho 1..N nhóm đã packed trong 1 transaction, chung mã chuyến. ≥2 nhóm phải cùng người nhận (recipient_key). Bắt buộc chọn hãng + dịch vụ (GET /shipping/quote/:groupId); cước ghi lên vận đơn và từng kiện. |
| GET | `/shipments/carrier/statuses` | Admin, Coordinator, Store Owner, Warehouse | — | C5 — Trạng thái hãng (GHN) mô phỏng được + nhãn tiếng Việt (dropdown nút mô phỏng). |
| GET | `/shipments/group/:groupId` | Admin, Coordinator, Store Owner, Warehouse | — | Vận đơn của 1 nhóm đơn (null nếu chưa có). |
| POST | `/shipments/overdue-scan` | Admin | — | Quét vận đơn quá hạn giao NGAY (cùng logic cron 15 phút/lần) — dùng khi vận hành/demo. |
| GET | `/shipments/reason-codes` | Admin, Coordinator, Store Owner, Warehouse | — | Danh sách lý do giao thất bại (dùng cho dropdown). |

## Chứng từ PDF (`documents`) — 3 route

Đọc chi tiết: INTEGRATION_GUIDE_SHIPPING.md B.7.6

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| GET | `/documents/manifest/:tripCode` | Coordinator, Store Owner, Admin | — | Bảng kê chuyến giao hàng (PDF) — mọi vận đơn cùng mã chuyến, có chỗ ký giao nhận. |
| GET | `/documents/packing-slip/:groupId` | Warehouse, Packaging, Store Owner, Admin | — | Phiếu đóng gói (PDF) — mỗi đơn một trang: hàng, ô tích, các kiện/thùng. |
| GET | `/documents/shipping-label/:groupId` | Coordinator, Warehouse, Admin | — | Nhãn vận chuyển (PDF) — mỗi kiện một nhãn, kèm barcode Code128 + QR. Cần đã có vận đơn. |

## Website AURELLE (storefront) (`storefront`) — 27 route

Đọc chi tiết: Aurelle/, storefront/README

| Method | Đường dẫn | Ai gọi được | Body / Query DTO | Mô tả |
|---|---|---|---|---|
| POST | `/customer-auth/login` | Công khai (khách AURELLE) | `LoginCustomerDto` | Khách AURELLE đăng nhập. |
| POST | `/customer-auth/logout` | Công khai | — | Khách AURELLE đăng xuất (xoá cookie phiên). |
| GET | `/customer-auth/me` | Khách AURELLE (JWT khách) | — | Thông tin khách AURELLE đang đăng nhập. |
| POST | `/customer-auth/register` | Công khai (khách AURELLE) | `RegisterCustomerDto` | Khách AURELLE đăng ký tài khoản. |
| POST | `/storefront/admin/auth/login` | Admin storefront | `LoginCustomerDto` | Admin storefront đăng nhập (tài khoản trong env). |
| POST | `/storefront/admin/auth/logout` | Admin storefront | — | Admin storefront đăng xuất. |
| GET | `/storefront/admin/auth/me` | Admin storefront | — | Admin storefront đang đăng nhập. |
| POST | `/storefront/admin/images` | Admin storefront | — | Tải ảnh sản phẩm lên (admin storefront). |
| GET | `/storefront/admin/products` | Admin storefront | — | Danh sách sản phẩm (quản trị storefront). |
| POST | `/storefront/admin/products` | Admin storefront | `SaveAdminProductDto` | Tạo sản phẩm storefront. |
| DELETE | `/storefront/admin/products/:id` | Admin storefront | — | Xoá / ẩn sản phẩm storefront. |
| GET | `/storefront/admin/products/:id` | Admin storefront | — | Chi tiết sản phẩm (quản trị storefront). |
| PATCH | `/storefront/admin/products/:id` | Admin storefront | `SaveAdminProductDto` | Sửa sản phẩm storefront. |
| DELETE | `/storefront/cart` | Khách AURELLE (JWT khách) | — | Xoá cả giỏ hàng. |
| GET | `/storefront/cart` | Khách AURELLE (JWT khách) | — | Giỏ hàng của khách. |
| POST | `/storefront/cart/items` | Khách AURELLE (JWT khách) | `AddCartItemDto` | Thêm biến thể vào giỏ. |
| DELETE | `/storefront/cart/items/:variantId` | Khách AURELLE (JWT khách) | — | Bỏ 1 biến thể khỏi giỏ. |
| PATCH | `/storefront/cart/items/:variantId` | Khách AURELLE (JWT khách) | `AddCartItemDto` | Đổi số lượng 1 biến thể trong giỏ. |
| POST | `/storefront/cart/sync` | Khách AURELLE (JWT khách) | `SyncCartDto` | Gộp giỏ tạm (chưa đăng nhập) vào giỏ của khách. |
| GET | `/storefront/categories` | Công khai | — | Danh mục sản phẩm của website. |
| GET | `/storefront/images/:id` | Công khai (ảnh sản phẩm) | — | Trả file ảnh sản phẩm. |
| GET | `/storefront/orders` | Khách AURELLE (JWT khách) | — | Đơn của khách. |
| GET | `/storefront/orders/:id` | Khách AURELLE (JWT khách) | — | Chi tiết đơn của khách (trạng thái, địa chỉ, phí ship). |
| POST | `/storefront/orders/checkout` | Khách AURELLE (JWT khách) | `CheckoutDto` | Đặt hàng (COD) — tạo đơn, giữ tồn storefront, bắn webhook sang OptiPack. |
| GET | `/storefront/products` | Công khai (khách xem hàng) | — | Danh sách sản phẩm (lọc, phân trang). |
| GET | `/storefront/products/:slug` | Công khai | — | Chi tiết sản phẩm theo slug. |
| GET | `/storefront/settings` | Công khai | — | Cấu hình hiển thị website (tên shop...). |

