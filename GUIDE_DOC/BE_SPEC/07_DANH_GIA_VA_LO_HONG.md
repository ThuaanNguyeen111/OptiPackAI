# 07 — Đánh giá: dư thừa, lỗ hổng, nghiệp vụ chưa rõ, đề xuất

> Viết lại 14/10/2026 từ đợt rà soát tổng thể cùng ngày (BE + FE + storefront + docs + DB), sau khi C4–C6 (GHN) đã code. Bản cũ (07/10) giữ trong lịch sử git.

Mức ưu tiên: **P0** sửa trước khi demo/bảo vệ · **P1** nên sửa trong giai đoạn hiện tại · **P2** cải tiến khi có thời gian.

## 0. Kết luận nhanh

| Khía cạnh | Đánh giá |
|---|---|
| Quy mô | 20 module, 239 route, 50 collection, 85 file unit test (~920 test), 9 cron |
| Phân quyền | Mọi route nghiệp vụ có JWT + RolesGuard; route công khai đều có cơ chế riêng (chữ ký HMAC, `state`, khóa webhook, refresh token) — xem 03 |
| Toàn vẹn dữ liệu | Transaction + khóa phiên bản ở mọi luồng ghi quan trọng; index duy nhất chống trùng (đơn, giữ chỗ, quét lấy hàng, webhook) |
| Luồng chính | Đồng bộ đơn → gộp nhóm → lấy hàng → packing plan → đóng gói → giao (G1 hoặc GHN) → hoàn hàng + thu hồi vật liệu: **chạy đủ ở BE** |
| Điểm yếu lớn nhất | FE chưa theo kịp BE (gọi route đã gỡ, chưa có màn GHN/chứng từ/hoàn hàng); sync Lazada có thể sót đơn; 1 index quan trọng không dùng được; test toàn bộ dùng mock |

## 1. Đã sửa so với bản đánh giá 07/10

| Vấn đề cũ | Trạng thái |
|---|---|
| 35 trường id bị hiểu là Mixed | Sửa 07/10; nay **80 trường** được test `objectid-fields.spec.ts` canh giữ |
| Nhóm kẹt ở `awaiting_packaging` sau khi từ chối lấy thiếu | Sửa: `decide-partial approve=false` đưa thẳng về `picking` (lượt mới) |
| Chỉ Admin sinh được gợi ý đóng gói | Thay bằng packing plan **tự tính** (cron 10 giây) khi nhóm `picked` |
| Đơn hủy không nhả giữ chỗ | Sửa 09/10 |
| Đơn đến muộn chen vào nhóm đã đóng | Sửa (`isGroupOpenForNewOrders`) |
| Thuật toán chỉ 3 cỡ thùng cố định | Thay bằng engine BRKGA dùng danh mục thùng thực tế + CP-SAT tùy chọn |
| Cước vận chuyển cố định 15.000đ/kg | Thay bằng bảng cước theo hãng (cân quy đổi) + phí thật GHN |
| CORS mở khi thiếu cấu hình; throttle 20/phút | Sửa (localhost mặc định; 600/phút + login 5, forgot 3) |
| `connection_lost` chưa bao giờ gửi | Đã gửi từ webhook AURELLE |
| Báo pack Lazada chưa test đơn thật | Bỏ hẳn tính năng ghi Lazada (10/10) — không còn rủi ro |

## 2. Lỗi / thiếu logic còn mở

| Ưu tiên | Vấn đề | Chi tiết | Đề xuất |
|---|---|---|---|
| **P0** | **Sync Lazada chỉ lấy 100 đơn đầu** | `lazada-protocol.client.getOrders` dùng `limit 100`, không lặp offset, nhưng `last_polled_at` vẫn tiến → hơn 100 đơn đổi trong một cửa sổ thì phần dư bị bỏ sót vĩnh viễn | Lặp offset tới khi trang < limit; chỉ tiến `last_polled_at` khi đọc hết |
| **P0** | **Index `orders.consolidated_group_id` không dùng được** | Index partial `is_consolidated: true`, nhưng nhóm 1 đơn có `consolidated_group_id` mà `is_consolidated=false`, và mọi truy vấn (đếm đơn, documents, packing-queue, returns, order-groups) không lọc `is_consolidated` → quét toàn collection | Index thường `{ consolidated_group_id: 1 }` (partial `$type: 'objectId'`), bỏ index cũ |
| ~~P0~~ ✅ 21/10 | ~~FE gọi route đã gỡ~~ | Màn đóng gói đã chuyển hết sang `packing-plan` (FE nhánh Việt, AOFP-133). Còn sót **mã chết không màn nào gọi**: `api/packaging.api.ts`, `packOrderGroup`, `retryLazadaPack` | Xoá theo `GUIDE_DOC/FE_UPDATE_CHECKLIST.md` mục 3 |
| P1 | Khóa giữ chỗ không đổi khi nối/bỏ nối/thay SKU nội bộ (06/10 #1) | `stock_reservations.stock_key` treo khóa cũ | Chuyển giữ chỗ sang khóa mới trong cùng transaction |
| P1 | Phiếu hoàn lấy `seller_sku` từ sổ cái pick (06/10 #3) | Có thể là SKU của sàn khác → nhập lại tạo dòng tồn lạc | Lấy từ `pick_events` (đúng SKU đơn) |
| P1 | Giữ chỗ cộng mọi kho, quét chỉ trừ 1 kho (06/10 #4) | Nhóm đơn không gắn kho | Lưu `warehouse_id` trên nhóm, giữ chỗ theo kho |
| P1 | So SKU còn dùng regex (06/10 #6, một phần) | 7 chỗ `$regex`/`RegExp` không dùng index | Cột `seller_sku_normalized` có index |
| P1 | AURELLE không nhận trạng thái ngược | Khách không thấy "đang giao/đã giao", không có mã vận đơn; trái quyết định 28/09 | Outbox ghi `storefront_orders.fulfillment_status` khi nhóm đổi trạng thái (adapter đã có `updateOrderStatus`) |
| P1 | Tồn storefront tách rời tồn OptiPack | 2 nguồn tồn không đồng bộ | Đẩy tồn khả dụng sang storefront (adapter đã có `updateSellableQuantity`) |
| P1 | Không có API ngắt kết nối shop | Chỉ kết nối mới → shop cũ `inactive` | Thêm `POST /marketplace/:platform/shops/:id/disconnect` (đổi trạng thái, không xóa) |
| P1 | Xác nhận lấy xong không bắt quét | `fulfillment/pick` cho `picked` dù chưa quét | Bắt quét đủ hoặc ghi rõ người xác nhận |
| P1 | Nhập hàng không tự tính lại nhóm thiếu hàng | Cờ `stock_shortage` giữ tới khi bấm tính lại | Tự chạy cho nhóm thiếu đúng SKU vừa nhập |
| P1 | Có thể tạo 2 phiếu trả mở cho 1 nhóm khi gọi đồng thời | Chỉ kiểm ở service | Index duy nhất có điều kiện trên trạng thái mở |
| P2 | `abnormal_package` khai báo nhưng chưa gửi | Lệch cân chỉ gắn cờ | Gửi thông báo khi niêm phong lệch ngưỡng |
| P2 | Không có cron đồng bộ trạng thái GHN | Mất webhook thì phải bấm "Đồng bộ" | Cron quét vận đơn `awaiting_pickup`/`in_transit` quá X giờ chưa có sự kiện |
| P2 | Hằng số nghiệp vụ trong mã | Ngưỡng lệch cân, 15 ngày đổi trả, 2 lần giao | Gom vào cấu hình |

## 3. Bảo mật (chi tiết ở 03 mục 6)

| Ưu tiên | Vấn đề | Đề xuất |
|---|---|---|
| P1 | `ForcePasswordChangeGuard` chỉ ở `/users` | `APP_GUARD` toàn cục, bỏ qua route auth |
| P1 | `users.mfa_secret` lưu dạng rõ | AES-256-GCM + script mã hóa dữ liệu cũ |
| P2 | Access token 1 ngày | 15–60 phút |
| P2 | Token Google qua query string | Mã một lần + POST |
| Quy tắc | `.env` không commit, không zip gửi đi | Xoay vòng secret nếu đã lộ |

## 4. Dư thừa

| Loại | Thành phần | Đề xuất |
|---|---|---|
| Mã chết | `adapters/tiki.adapter.ts`, `adapters/tiktok-shop.adapter.ts` + biến `TIKTOK_*`, `TIKI_*` | Xóa |
| Mã chết | `GET /` "Hello World" | Đổi thành `GET /health` (DB/Redis/GHN) |
| Route trùng | `POST /order-groups/:id/fulfillment/ship|deliver|return` (legacy) trùng `/shipments/*` | Chuyển FE sang `/shipments`, sau đó gỡ |
| Route gần trùng | 2 route danh sách ô (theo khu / theo kho) | Gộp, dùng query `zone_id` |
| Dữ liệu suy ra | `stock_reservation_totals`, số đếm đơn trên nhóm | Giữ để nhanh; thêm script đối soát |
| Tài liệu | `DEMO_PLAYBOOK.md` ở gốc (BẢN CŨ) trùng `GUIDE_DOC/DEMO_PLAYBOOK.md` | Giữ nhãn BẢN CŨ hoặc xóa khi nhóm đồng ý |

## 5. Kiến trúc, dữ liệu và hiệu năng

| Ưu tiên | Vấn đề | Đề xuất |
|---|---|---|
| P0 | Index `consolidated_group_id` (mục 2) | Như trên |
| P1 | Nhiều module ghi thẳng collection của module khác (VD `shipments` ghi `OrderGroup`, `InventoryMovement`) | Chỉ module sở hữu ghi; module khác gọi service |
| P1 | Service rất lớn (`shipments.service.ts`, `order-groups.service.ts`, `warehouse.service.ts`, `packing-plan.service.ts` > 1.500 dòng) | Tách theo nhóm chức năng (VD `CarrierBookingService`) |
| P1 | Toàn bộ test dùng model giả lập | Thêm e2e với Mongo replica set thật cho phân quyền, transaction, luồng lấy → đóng → giao → hoàn |
| P2 | AURELLE nằm trong cùng BE/DB OptiPack (thiết kế ghi tách riêng) | Chấp nhận cho demo, ghi hạn chế |
| P2 | Cron packing-plan chạy mỗi 10 giây | Ổn khi demo; production nên dùng hàng đợi (BullMQ) |
| Tốt | Index ESR cho danh sách đơn, partial cho `consolidation_key`/`recipient_key`/`manual_link_id`, unique chống trùng, TTL cho log/state | Giữ |

## 6. Tài liệu

| Tài liệu | Trạng thái 14/10 |
|---|---|
| `GUIDE_DOC/BE_SPEC/*`, `docs/ERD.md` | **Đã viết lại** theo code (route và collection sinh tự động) |
| `GUIDE_DOC/FE_UPDATE_CHECKLIST.md` | Mới — mọi việc FE phải chỉnh |
| `GHN_INTEGRATION_GUIDE.md` v1.3, `INTEGRATION_GUIDE_SHIPPING.md` v1.4 | Đúng với C4–C6 |
| `README.md` | Đã thêm env GHN; `.env` máy demo cần thêm `PACKER_*` nếu muốn CP-SAT |

## 7. Lộ trình đề xuất

1. **Trước demo (P0):** sửa phân trang sync Lazada; sửa index `consolidated_group_id`; FE bỏ route đã gỡ và chuyển sang packing-plan (checklist mục 1); chạy thử kịch bản GHN đầy đủ (đặt → giả lập → hoàn → nhận → kiểm → thu hồi vật liệu).
2. **Giai đoạn hiện tại (P1):** ghi trạng thái ngược AURELLE; giữ chỗ theo kho; chuyển khóa giữ chỗ khi nối SKU; phiếu hoàn lấy đúng SKU; guard đổi mật khẩu toàn cục; mã hóa `mfa_secret`; e2e với Mongo thật.
3. **Cải tiến (P2):** dọn mã chết; tách service lớn; cron đồng bộ GHN; gom hằng số vào cấu hình.
