# Đặc tả Backend OptiPackAI — Mục lục

| Thông tin | Giá trị |
|---|---|
| Phạm vi | Toàn bộ thư mục `be/` (435 file TS, ~62.500 dòng; 20 module, 239 route, 50 collection, 85 file test, 9 cron) |
| Phiên bản mã đối chiếu | Code ngày 14/10/2026 sau AOFP-79 (C4–C6 giao qua GHN) |
| Phương pháp | Bảng route (04, 03 mục 7), schema/index (05), danh sách file (02) được **sinh tự động từ metadata Nest/Mongoose** (`be/backups/gen/routes.ts.txt`, `schemas.ts.txt` — thư mục gitignore, để đuôi .txt cho watcher không biên dịch); phần nghiệp vụ và đánh giá viết tay sau khi đọc service |

## Đọc theo mục đích

| Bạn cần | Đọc |
|---|---|
| Hiểu hệ thống dùng công nghệ gì, chạy ra sao | **01** — Công nghệ và kiến trúc |
| Biết file nào làm gì, bố trí mã có hợp lý không | **02** — Cấu trúc mã nguồn |
| Biết hệ thống bảo vệ thế nào, ai được gọi API nào | **03** — Bảo mật (có ma trận quyền 239 route) |
| Tra cứu một API cụ thể: quyền, body, trường hợp, mã lỗi | **04** — Đặc tả API |
| Hiểu DB: collection nào, trường nào nghĩa gì, liên kết ra sao | **05** — Thiết kế cơ sở dữ liệu |
| Hiểu một nghiệp vụ chạy từ đầu tới cuối | **06** — Luồng nghiệp vụ |
| Biết hệ thống còn thiếu gì, cần sửa gì trước | **07** — Đánh giá, lỗ hổng, đề xuất |

## Danh sách tài liệu

| # | File | Nội dung chính |
|---|---|---|
| 01 | `01_CONG_NGHE_VA_KIEN_TRUC.md` | Vai trò từng công nghệ, kiến trúc, vòng đời request, phụ thuộc module, cron, biến môi trường |
| 02 | `02_CAU_TRUC_SRC.md` | Cây thư mục, quy ước module, quá trình khởi động (9 cron), chức năng từng file, đánh giá bố trí |
| 03 | `03_BAO_MAT.md` | Các lớp bảo vệ, mật khẩu/token/MFA/OAuth, bảo mật Lazada/AURELLE/GHN, độ phủ guard 30 controller, lỗ hổng, ma trận quyền 239 route |
| 04 | `04_DAC_TA_API.md` | 239 route theo module: method, path, quyền/cơ chế bảo vệ, DTO, mô tả; trỏ tới guide chi tiết từng module |
| 05 | `05_THIET_KE_CSDL.md` | Cách DB được tạo, kiểu trường id (80 trường ObjectId), 50 collection, ERD, trường + index từng collection, đánh giá tốc độ/logic |
| 06 | `06_LUONG_NGHIEP_VU.md` | 12 luồng có sơ đồ: kết nối Lazada/AURELLE, đồng bộ, lấy hàng, packing plan, giao G1/GHN, hoàn hàng + thu hồi vật liệu |
| 07 | `07_DANH_GIA_VA_LO_HONG.md` | Rà soát 14/10: đã sửa, còn mở (P0–P2), bảo mật, dư thừa, hiệu năng DB, lộ trình |

## Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| Nhóm đơn (order group) | Các đơn cùng sàn, cùng người nhận → 1 thùng, 1 lần giao |
| Ô (bin) | Vị trí chứa hàng trong kho, mã 5 phần `KA-D1-P02-T03-1` |
| SKU sàn / SKU nội bộ | Mã sản phẩm trên từng sàn / mã sản phẩm thật dùng chung (`ATHUN-005-DEN-M`) |
| Giữ chỗ tồn (reservation) | Phần tồn đã dành cho nhóm đơn chưa lấy hàng |
| Sổ cái (ledger) | Collection chỉ thêm, ghi mọi biến động (`inventory_movements`, `packaging_movements`) |
| `expected_version` | Phiên bản bản ghi client đang giữ; lệch → 409 (khóa lạc quan) |
| SOF | Seller Own Fleet — shop tự giao, không dùng vận chuyển Lazada |
| Packing plan | Phương án đóng gói của 1 nhóm đơn: kiện nào, thùng nào, món nào — engine tự tính, nhân viên duyệt/quét/niêm phong |
| Hãng `live` / mẫu | `GHN` gọi API thật; `SAMPLE-*` dùng bảng cước nội bộ |
| G1 / C4–C6 | Giao tự quản bấm tay / giao qua GHN (báo giá, đặt đơn, webhook, so phương án đóng gói) |
| Giả lập GHN | Nút đổi trạng thái vận đơn trong DB OptiPack (demo); GHN không cho shop đổi trạng thái thật |
| AURELLE | Sàn demo nội bộ (storefront) cùng khuôn API Lazada |

> Khi mã nguồn thay đổi, chạy lại bộ sinh (đổi tạm `backups/gen/*.ts.txt` thành `.ts`, chạy `npx ts-node --transpile-only`, rồi đổi lại `.txt`) để các bảng không lệch. Swagger (`/api/docs`) luôn phản ánh mã đang chạy.

## Lịch sử cập nhật

| Ngày | Nội dung | Tài liệu đổi |
|---|---|---|
| 03/10/2026 | Bản đầu, đối chiếu `be.zip` 03/10 | 00–07 |
| 07/10/2026 | Đồng bộ Product Master theo danh sách sản phẩm + `POST /product-master/sync` (code 04/10, trước chưa có trong bộ này); gộp bản sửa tìm tồn của nhánh `feature/viet_befe`; sửa tận gốc 35 trường id bị hiểu là Mixed + script `migrate-objectid-fields.ts`; sửa nhập thêm hàng 404, `pick_events` lưu chuỗi, upsert hàng hoàn; thêm 6 lỗi rà soát 06/10 vào danh sách cần sửa | 00, 01, 02, 03, 04, 05, 06, 07 |
| 14/10/2026 | Viết lại toàn bộ theo code sau C4–C6: 239 route / 50 collection sinh tự động; thêm packing plan, GHN, AURELLE, storefront; bỏ nội dung báo pack Lazada và cầu dao ghi; cập nhật bảo mật (CORS, throttle) và đánh giá 14/10; `docs/ERD.md` viết lại | 00–07, `docs/ERD.md` |
