# Đặc tả Backend OptiPackAI — Mục lục

| Thông tin | Giá trị |
|---|---|
| Phạm vi | Toàn bộ thư mục `be/` (251 file, ~24.800 dòng) |
| Phiên bản mã đối chiếu | `main` commit `93d20bf` + nhánh `feature/viet_befe` (`631dc39`) + bản sửa ObjectId ngày 07/10/2026 |
| Phương pháp | Bảng route, DTO, schema, index, mã lỗi, danh sách file được **trích tự động từ mã nguồn**; phần giải thích nghiệp vụ và đánh giá viết tay sau khi đọc service |

## Đọc theo mục đích

| Bạn cần | Đọc |
|---|---|
| Hiểu hệ thống dùng công nghệ gì, chạy ra sao | **01** — Công nghệ và kiến trúc |
| Biết file nào làm gì, bố trí mã có hợp lý không | **02** — Cấu trúc mã nguồn |
| Biết hệ thống bảo vệ thế nào, ai được gọi API nào | **03** — Bảo mật (có ma trận quyền 141 endpoint) |
| Tra cứu một API cụ thể: quyền, body, trường hợp, mã lỗi | **04** — Đặc tả API |
| Hiểu DB: collection nào, trường nào nghĩa gì, liên kết ra sao | **05** — Thiết kế cơ sở dữ liệu |
| Hiểu một nghiệp vụ chạy từ đầu tới cuối | **06** — Luồng nghiệp vụ |
| Biết hệ thống còn thiếu gì, cần sửa gì trước | **07** — Đánh giá, lỗ hổng, đề xuất |

## Danh sách tài liệu

| # | File | Nội dung chính |
|---|---|---|
| 01 | `01_CONG_NGHE_VA_KIEN_TRUC.md` | Vai trò từng công nghệ, kiến trúc, vòng đời request, phụ thuộc module, cron, biến môi trường |
| 02 | `02_CAU_TRUC_SRC.md` | Cây thư mục, quy ước module, quá trình khởi động, chức năng 251 file, đánh giá bố trí |
| 03 | `03_BAO_MAT.md` | Các lớp bảo vệ, mật khẩu/token/MFA/OAuth, bảo mật tích hợp sàn, độ phủ guard, lỗ hổng, ma trận quyền |
| 04 | `04_DAC_TA_API.md` | 141 endpoint theo 18 nhóm: quyền, guard, path/query/body từng trường, trường hợp, mã lỗi |
| 05 | `05_THIET_KE_CSDL.md` | Cách DB được tạo, kiểu trường id, 29 collection, ERD, ý nghĩa từng trường, index, khóa liên kết, bảng thừa |
| 06 | `06_LUONG_NGHIEP_VU.md` | 12 luồng nghiệp vụ có sơ đồ, API theo thứ tự gọi, dữ liệu thay đổi |
| 07 | `07_DANH_GIA_VA_LO_HONG.md` | Dư thừa, lỗ hổng, nghiệp vụ chưa rõ, tài liệu lệch, lộ trình ưu tiên |

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
| Cầu dao `LAZADA_WRITE_APIS_ENABLED` | Bật/tắt mọi thao tác ghi lên shop Lazada thật |

> Khi mã nguồn thay đổi, các bảng route/DTO/schema nên được sinh lại để tránh lệch. Swagger (`/api/docs`) luôn phản ánh mã đang chạy.

## Lịch sử cập nhật

| Ngày | Nội dung | Tài liệu đổi |
|---|---|---|
| 03/10/2026 | Bản đầu, đối chiếu `be.zip` 03/10 | 00–07 |
| 07/10/2026 | Đồng bộ Product Master theo danh sách sản phẩm + `POST /product-master/sync` (code 04/10, trước chưa có trong bộ này); gộp bản sửa tìm tồn của nhánh `feature/viet_befe`; sửa tận gốc 35 trường id bị hiểu là Mixed + script `migrate-objectid-fields.ts`; sửa nhập thêm hàng 404, `pick_events` lưu chuỗi, upsert hàng hoàn; thêm 6 lỗi rà soát 06/10 vào danh sách cần sửa | 00, 01, 02, 03, 04, 05, 06, 07 |

