# 07 — Đánh giá: dư thừa, lỗ hổng, nghiệp vụ chưa rõ, đề xuất

Mức ưu tiên: **P0** sửa trước khi demo/bảo vệ · **P1** nên sửa trong giai đoạn hiện tại · **P2** cải tiến khi có thời gian.

Đối chiếu mã: `main` `93d20bf` + nhánh `feature/viet_befe` (`631dc39`) + bản sửa ObjectId ngày 07/10/2026.

## 0. Lỗi đã sửa ngày 07/10/2026

| Lỗi | Nguyên nhân | Đã sửa | Việc còn phải làm |
|---|---|---|---|
| Picking List "CHƯA GÁN VỊ TRÍ" và quét hàng 409 dù dữ liệu kho đúng | 35 trường id khai `type: Types.ObjectId` bị `@nestjs/mongoose` dựng thành kiểu Mixed; truy vấn `warehouse_id` bằng chuỗi ra 0 dòng | Schema khai `SchemaTypes.ObjectId` (35 trường); Picking List và pick-item đổi `warehouse_id` sang ObjectId (bản sửa của Việt) | Chạy `scripts/migrate-objectid-fields.ts --apply` trên mỗi database |
| Nhập thêm hàng luôn 404 | Cùng nguyên nhân, ở `restockSku` | Đổi `warehouse_id` sang ObjectId | — |
| Gợi ý đóng gói luôn dùng số lượng đặt dù đã quét | `pick_events.order_group_id` lưu chuỗi, chỗ đọc dùng ObjectId | Ghi ObjectId | Chạy script để nhóm đơn cũ đọc được số đã quét |
| Thông báo có thể ném lỗi giữa vòng đồng bộ | `sync_failed` ghi mã shop Lazada vào trường id | `relatedEntityId` = id document shop; `notify()` ghi `null` cho giá trị không phải id | — |
| Nhập lại hàng hoàn tạo dòng tồn thiếu `master_sku` / `seller_sku` | Bộ lọc tìm tồn mới của nhánh Việt có `$or` và regex; MongoDB không chép các điều kiện đó khi upsert tạo dòng mới | Upsert dùng `stockUpsertFilterFor` (khớp chính xác) | — |

Bảo vệ: test `src/common/schemas/objectid-fields.spec.ts` báo lỗi nếu còn trường Mixed. Quy tắc ghi ở `CLAUDE.md` (Database Design Standards, mục 24).

## 1. Lỗ hổng bảo mật

Chi tiết ở tài liệu 03, mục 6.

| Ưu tiên | Vấn đề | Đề xuất |
|---|---|---|
| **P0** | `ForcePasswordChangeGuard` chỉ gắn ở `/users` → tài khoản dùng mật khẩu tạm vẫn gọi được mọi API nghiệp vụ | Đăng ký guard toàn cục (`APP_GUARD`) sau `JwtAuthGuard`, hoặc gắn vào mọi controller |
| **P0** | `users.mfa_secret` lưu dạng rõ | Mã hóa AES-256-GCM giống token sàn; viết script mã hóa dữ liệu cũ |
| **P0** | `be.zip` chia sẻ kèm `.env` thật | Không đóng gói `.env`; xoay vòng JWT secret, `TOKEN_ENCRYPTION_KEY`, khóa Lazada nếu file đã lan ra ngoài |
| P1 | CORS mở mọi nguồn khi thiếu `CORS_ORIGIN` | Bắt buộc cấu hình |
| P1 | Giới hạn 20 request/phút áp chung | Giới hạn chặt riêng cho `/auth/*`, nới cho route vận hành |
| P1 | Access token sống 1 ngày | Rút còn 15–60 phút |
| P2 | Token Google trả qua query string | Đổi sang mã một lần + POST đổi token |

## 2. Chức năng, mã và dữ liệu dư thừa

| Loại | Thành phần | Tình trạng | Đề xuất |
|---|---|---|---|
| Mã chết | `adapters/tiki.adapter.ts`, `adapters/tiktok-shop.adapter.ts` | Không được đăng ký; Shopee/TikTok/Tiki đã dừng | Xóa, kèm biến `TIKTOK_*`, `TIKI_*` trong `.env.example` |
| Mã chết | `common/schemas/processed-webhook-event.schema.ts` | Không module nào đăng ký | Xóa hoặc dùng khi làm webhook |
| Mã chết | Thư mục rỗng `mail/templates/` | Mẫu email nằm ở `mail.templates.ts` | Xóa thư mục |
| Mã chết | `GET /` "Hello World" | Mẫu NestJS | Đổi thành `GET /health` trả trạng thái DB/Redis |
| Mã lỗi thừa | `MKT_SHOP_LOOKUP_FAILED`, `MKT_TOKEN_DECRYPT_FAILED`, `MKT_WEBHOOK_SIGNATURE_INVALID`, `ORD_UNSUPPORTED_PLATFORM`, `PKG_GROUP_NOT_PENDING_APPROVAL` | Khai báo, không nơi nào ném | Xóa hoặc dùng đúng chỗ |
| Thông báo thừa | `abnormal_package`, `connection_lost` | Khai báo, chưa bao giờ gửi | Gửi khi lệch cân và khi refresh token sàn thất bại |
| Route trùng | `POST /order-groups/:id/fulfillment/ship`, `/deliver`, `/return` | Trùng với `/shipments/*`; giữ để FE cũ không gãy | Chuyển FE sang `/shipments`, sau đó gỡ |
| Route gần trùng | `GET /warehouse/zones/:zoneId/bin-locations` và `GET /warehouse/warehouses/:warehouseId/bin-locations` | Cùng danh sách ô, khác phạm vi lọc | Gộp thành 1 route có query `zone_id` |
| Collection rác trong DB | `packaging_boxes`, `packaging_bags`, `carton_materials`, `packaging_material_rules`, `customers`, `customer_addresses` | Không có schema trong BE | Sao lưu, xác nhận không ai dùng, xóa |
| Dữ liệu suy ra được | `stock_reservation_totals`, `order_groups.active_order_count`/`canceled_order_count`, `order_groups.order_count` | Thừa có chủ đích để tăng tốc | Thêm script/cron đối soát khi lệch |
| Tài liệu lẫn trong mã | `orders/PATCH_NOTES.md`, `marketplace-integration/SETUP_NOTES.md` | | Chuyển về `GUIDE_DOC/` |

## 3. Nghiệp vụ chưa rõ ràng hoặc còn yếu

| Ưu tiên | Vấn đề | Chi tiết | Đề xuất |
|---|---|---|---|
| **P0** | **Nhóm đơn bị kẹt sau khi từ chối lấy thiếu hàng** | `decide-partial` với `approve=false` đưa nhóm về `awaiting_packaging`. Bảng trạng thái chỉ cho `awaiting_packaging → picking`, nhưng **không có API nào thực hiện bước này** (chỉ chạy tự động lúc tạo nhóm). Nhóm nằm mãi ở `awaiting_packaging` | Thêm route "Lấy hàng lại" chuyển `awaiting_packaging → picking`, giữ chỗ lại tồn, phân công lại |
| **P0** | **Chỉ Admin sinh được gợi ý đóng gói** | `POST .../packaging/generate` chỉ cho Admin. Sau mỗi lần lấy hàng xong, Packaging Staff phải chờ Admin | Tự sinh gợi ý ngay khi nhóm chuyển `picked`, hoặc mở quyền cho Packaging Staff |
| **P0** | **Đơn hủy không trả lại hàng đã giữ** (rà 06/10) | Giữ chỗ chỉ được tính lại khi số đơn trong nhóm thay đổi; hủy đơn không đổi số đơn → phần giữ cho đơn hủy vẫn khóa. Nhóm hủy hết không bao giờ tới `picked` → giữ mãi. `reconcile()` cũng không nhả SKU đã biến mất khỏi danh sách | Tính lại giữ chỗ khi `active/canceled_order_count` đổi (đã có `refreshOrderCounts`); nhả SKU không còn trong danh sách; nhóm hủy hết → `releaseGroup`. Làm cùng "bước 2" xử lý hủy đơn (trạng thái `cancelled`, phiếu cất hàng) |
| **P0** | **Khóa giữ chỗ đổi giữa chừng** (rà 06/10) | Nối / bỏ nối SKU sàn hoặc thay SKU nội bộ làm đổi khóa tồn (`S:...` ↔ `M:...`) nhưng `stock_reservations.stock_key` và `stock_reservation_totals` không đổi theo → pick-item không trừ được phần đã giữ, tính lại thì giữ 2 lần, khóa cũ treo; thay SKU còn có thể cho giữ vượt tồn | Trong cùng transaction của 3 thao tác, chuyển các giữ chỗ đang hiệu lực sang khóa mới |
| **P1** | **Phiếu hoàn có thể mang SKU của sàn khác** (rà 06/10) | Sổ cái `pick` ghi `seller_sku` của dòng tồn gộp (SKU của sàn tạo dòng đầu tiên); phiếu hoàn giao thất bại lấy SKU từ sổ cái → nhập lại kho tra không ra SKU nội bộ, tạo dòng tồn lạc | Lấy hàng hoàn từ `pick_events` (đúng SKU đơn) hoặc ghi thêm SKU đơn vào sổ cái |
| P1 | **Đơn đến muộn gộp được vào nhóm đã lấy/đóng gói** (rà 06/10) | `tryConsolidate` chỉ xét trạng thái đơn trên sàn (gồm `packed`, `ready_to_ship`), không xét trạng thái nhóm trong kho | Chặn gộp khi nhóm đã qua `picking`; tạo nhóm mới |
| P1 | **So SKU chỗ nguyên văn, chỗ không phân biệt hoa thường** (rà 06/10) | Mapping và khóa giữ chỗ dùng bản chuẩn hóa; `createMapping` kiểm `product_master` nguyên văn; `findUnassignedSkus` so nguyên văn; `assignSkuToBin` không kiểm SKU có trong `product_master`. Picking List/pick-item đã dùng regex không phân biệt hoa thường (nhánh Việt) nhưng regex không dùng được index | Thêm `seller_sku_normalized` có index vào `sku_bin_assignments`, mọi chỗ lọc theo trường này; bắt buộc SKU có trong `product_master` khi gán ô |
| P1 | **Tìm tồn có nhánh dự phòng dòng chưa gắn nhãn** (nhánh Việt) | Picking List/pick-item dùng cả dòng chưa chạy `sync-stock` → che dữ liệu chưa gộp; báo cáo tồn theo SKU nội bộ vẫn thiếu phần này | Tự gắn nhãn khi nối SKU / gán ô, sau đó bỏ nhánh dự phòng |
| P1 | **Tên trạng thái `awaiting_packaging` gây hiểu nhầm** | Thực chất là "vừa tạo, chưa lấy hàng" | Đổi tên hiển thị (`created`/`awaiting_picking`), giữ giá trị cũ cho tương thích |
| P1 | **Nhóm đơn không gắn kho; giữ chỗ cộng tồn mọi kho** (rà 06/10) | `order_groups` không có `warehouse_id`; Picking List và quét lấy hàng nhận `warehouse_id` do FE truyền; giữ chỗ tính tồn mọi kho nhưng quét chỉ trừ 1 kho → nhiều kho thì "đủ hàng" mà quét vẫn 409 | Lưu kho xử lý trên nhóm đơn, giữ chỗ theo kho |
| P1 | **Xác nhận lấy xong không cần quét** | `POST .../fulfillment/pick` cho chuyển `picked` dù chưa quét món nào; gợi ý đóng gói khi đó tính theo đơn đặt | Bắt buộc quét đủ, hoặc ghi rõ "xác nhận không quét" và người chịu trách nhiệm |
| P1 | **Phân công chỉ cho Warehouse Staff** | Packaging Staff và Shipping Coordinator không được phân công, ai cũng nhận mọi việc | Mở rộng Least-Busy cho từng công đoạn |
| P1 | **Lệch cân > 20% chỉ gắn cờ** | Không thông báo, không chặn đóng gói | Gửi `abnormal_package`; tùy chính sách thì yêu cầu kiểm lại |
| P1 | **Nhập hàng không tự tính lại nhóm thiếu hàng** | Nhóm `stock_shortage` vẫn mang cờ tới khi có người bấm "Tính lại" | Tự chạy tính lại cho các nhóm thiếu đúng SKU vừa nhập |
| P1 | **Có thể tạo 2 phiếu trả mở cho 1 nhóm khi gọi đồng thời** | Chỉ kiểm tra ở service | Index duy nhất có điều kiện trên `return_requests(order_group_id)` với trạng thái mở |
| P1 | **Báo Lazada mới dừng ở "đã đóng gói"** | Giao thành công, thất bại, hoàn hàng không cập nhật lên sàn; chưa test trên đơn SOF thật | Test 1 đơn thật trước demo; cân nhắc ReadyToShip |
| P2 | **Đơn hỏa tốc phải đặt tay** | Lazada không có cờ hỏa tốc; Store Owner chọn bằng `PATCH .../priority` | Ghi rõ trong tài liệu vận hành |
| P2 | **Chi phí vận chuyển ước tính cố định 15.000đ/kg** | Không theo vùng, kích thước quy đổi | Bảng giá theo vùng và khối lượng quy đổi |
| P2 | **Thuật toán đóng gói chỉ 3 cỡ thùng cố định** | Không dùng danh mục `packaging_materials` thực tế, không xếp 3D | Chọn thùng từ danh mục vật liệu đang có tồn; nâng cấp thuật toán xếp 3D |
| P2 | **Chưa có gộp kiện liên sàn, đồng bộ tồn lên sàn** | Đã có thiết kế, chưa làm | Theo kế hoạch đã chốt |
| P2 | **Hằng số nghiệp vụ nằm trong mã** | Ngưỡng 20%, 15 ngày đổi trả, 2 lần giao, 3 cỡ thùng | Gom vào cấu hình |

## 4. Kiến trúc, dữ liệu và hiệu năng

| Ưu tiên | Vấn đề | Đề xuất |
|---|---|---|
| P1 | Truy vấn đơn theo nhóm không dùng được index (index `consolidated_group_id` có điều kiện `is_consolidated: true`, còn nhóm 1 đơn có `is_consolidated=false`) | Thêm index thường `{ consolidated_group_id: 1 }` |
| P1 | Nhiều module đọc/ghi thẳng collection của module khác | Chỉ module sở hữu được ghi; module khác gọi service |
| P1 | Service quá lớn (`warehouse.service.ts`, `order-groups.service.ts`) | Tách theo nhóm chức năng |
| P2 | ID người thao tác (`actor_id`, `created_by` của sổ cái, phiếu trả, SKU nội bộ…) lưu dạng chuỗi | Khai `String` có chủ đích (có giá trị `"system"`). 35 trường id tham chiếu đã thống nhất ObjectId ngày 07/10/2026 |
| P2 | Transaction cần replica set — chạy MongoDB đơn lẻ local sẽ lỗi | Dùng Atlas hoặc replica set 1 node khi phát triển |
| P2 | Test: 39 suite / 350 test tập trung ở service, dùng model giả lập — lớp lỗi "schema khai sai kiểu" không bị bắt (đã thêm test quét schema); controller, phân quyền, e2e mới có Auth | Thêm e2e chạy với MongoDB thật (Atlas test hoặc replica set local) cho phân quyền và luồng lấy hàng → giao |

## 5. Tài liệu đang lệch với mã

| Tài liệu | Nội dung sai | Thực tế |
|---|---|---|
| `INTEGRATION_GUIDE.md` mục 5 | Khi `must_change_password=true`, mọi API khác trả 403 | Chỉ `/users/*` bị chặn |
| `INTEGRATION_GUIDE.md` mục 9 | Lỗi validate có `message` là mảng | `message` là chuỗi nối bằng `; `, `error_code: VALIDATION_ERROR`; body có thêm `success`, `timestamp`, `path` |
| `INTEGRATION_GUIDE.md` mục 9 | Lỗi theo format NestJS chuẩn `{ statusCode, message, error }` | Format riêng `{ success:false, error_code, message, details, timestamp, path }` |
| Các guide nhắc đồng bộ 10 phút | | Cron đồng bộ đơn chạy **5 phút** |
| `INTEGRATION_GUIDE_ORDERS.md` (bản trong repo) | Nội dung là guide Fulfillment & Warehouse v3 cũ, không phải guide Orders | Cần khôi phục nội dung guide Orders đúng (gộp đơn, đồng bộ, trạng thái đơn) |
| `INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md` mục 0b.4 (trước 07/10) | "CHƯA GÁN VỊ TRÍ" chỉ do thiếu gán ô / nối SKU | Còn do lỗi kiểu id (đã sửa 07/10) — guide đã cập nhật |

## 6. Lộ trình đề xuất

1. **Trước demo (P0):** chạy `scripts/migrate-objectid-fields.ts --apply` trên Atlas; nhả giữ chỗ khi đơn hủy; chuyển khóa giữ chỗ khi nối/bỏ nối/thay SKU; guard đổi mật khẩu toàn cục; mã hóa `mfa_secret`; xoay vòng secret nếu `.env` đã lộ; route "lấy hàng lại" cho nhóm bị kẹt; tự sinh gợi ý đóng gói khi `picked`; test Pack Lazada trên 1 đơn thật; sửa `INTEGRATION_GUIDE.md`.
2. **Giai đoạn hiện tại (P1):** phiếu hoàn lấy đúng SKU đơn; chặn gộp đơn muộn vào nhóm đã lấy; cột `seller_sku_normalized` + tự gắn nhãn tồn; xử lý hủy đơn bước 2; gắn kho vào nhóm đơn; index `consolidated_group_id` và index phiếu trả mở; throttle theo route; CORS bắt buộc; thông báo lệch cân; tự tính lại thiếu hàng khi nhập.
3. **Cải tiến (P2):** dọn mã chết và collection rác; tách service lớn; gom hằng số vào cấu hình; thống nhất kiểu ID; bổ sung e2e.
