# OptiPackAI — Thuật ngữ vận hành kho

Từ ngữ dùng chung cho luồng đơn đi từ sàn về kho, được lấy, đóng gói, giao và hoàn. Mỗi khái niệm chỉ có một tên; tên trong `_Tránh_` không dùng trong UI, docs hay thảo luận.

## Đơn và nhóm đơn

**Đơn**:
Một đơn khách đặt trên một sàn (Lazada, AURELLE), giữ nguyên mã đơn của sàn.
_Tránh_: order con, đơn lẻ

**Nhóm đơn**:
Các đơn cùng người nhận được lấy hàng chung một lượt và giao chung một vận đơn; mỗi đơn vẫn có kiện riêng, trừ kiện gộp nhiều đơn của AURELLE.
_Tránh_: đơn gộp, order group (trong UI), lô đơn

**Gộp đơn**:
Đưa một đơn mới vào nhóm đơn đang mở của cùng người nhận.
_Tránh_: ghép đơn, consolidate (trong UI)

## Kho

**Ô**:
Một vị trí cố định trên kệ, có mã như `A-03-02` (khu A, kệ 3, tầng 2); tồn kho được ghi theo SKU × ô.
_Tránh_: bin (trong UI), ngăn, vị trí

**Kệ**:
Khung giá trong một khu, gồm nhiều tầng; mỗi tầng chia thành các ô.
_Tránh_: rack (trong UI), giá

**Lô**:
Phần tồn của một SKU trong một ô có cùng ngày nhập; lấy hàng luôn trừ lô nhập trước (FIFO), nhân viên không quét mã lô.
_Tránh_: batch, lot (trong UI)

**Phiếu nhập**:
Lần nhập hàng vào kho theo phiếu của nhà cung cấp, bắt buộc kèm ảnh phiếu; mỗi dòng phiếu sinh ra một lô.
_Tránh_: phiếu nhập kho NCC, receipt (trong UI)

**Giữ chỗ**:
Số hàng đã hứa cho nhóm đơn đang chờ lấy, tính theo SKU × kho (không theo ô); hàng giữ chỗ không bán hay hứa cho đơn khác.
_Tránh_: allocated, khoá tồn

## Lấy hàng

**Lượt lấy**:
Một lần nhân viên kho đi nhặt đủ hàng cho một nhóm đơn; huỷ lượt thì mở lượt mới.
_Tránh_: pick round (trong UI), vòng lấy

**Thiếu hàng**:
Lượt lấy kết thúc mà chưa nhặt đủ; nhóm dừng lại chờ quyết định giao phần có sẵn hay lấy lại.
_Tránh_: partial, giao thiếu (khi chưa quyết định)

## Đóng gói

**Kế hoạch đóng gói**:
Phương án hệ thống tự tính cho một nhóm đơn đã lấy xong: dùng thùng nào, bao nhiêu kiện, món nào vào kiện nào.
_Tránh_: gợi ý đóng gói, packing recommendation, phương án AI

**Chấp nhận kế hoạch**:
Nhân viên đóng gói nhận kế hoạch và bắt đầu đóng ngay; là bước người duy nhất trước khi đóng.
_Tránh_: chốt kế hoạch, duyệt kế hoạch, approve (trong UI)

**Từ chối kế hoạch**:
Nhân viên đóng gói trả kế hoạch kèm lý do để hệ thống tính lại, đóng tay, hoặc trả nhóm về lấy hàng.
_Tránh_: reject (trong UI), huỷ kế hoạch

**GSM**:
Trọng lượng vải của một lớp, tính bằng g/m²; hệ thống dùng nó để tính độ dày gói quần áo khi kho không đo độ dày.
_Tránh_: định lượng vải (trong UI), độ dày vải

**Mã thùng**:
Mã vật tư ngắn, cố định của một loại thùng carton rỗng (`CTN-001`…), đánh số theo thể tích lòng tăng dần, không chứa kích thước. Kích thước, kiểu FEFCO và số lớp nằm trong thông tin thùng. Khác với mã nhãn của từng kiện đã đóng.
_Tránh_: mã kiện, BOX-S/BOX-302015 (mã cũ trước AOFP-346)

**Khuôn gấp**:
Dài × rộng chuẩn mà mọi món quần áo cùng loại được gấp về trước khi cho vào túi zip, dùng chung cho mọi size; size chỉ đổi cân nặng.
_Tránh_: số đo áo, kích thước theo size

**Độ dày gói**:
Cạnh mỏng nhất của gói quần áo sau khi gấp và cho vào túi zip; bằng số lớp × độ dày một lớp vải, tối thiểu 0,3 cm.
_Tránh_: chiều cao áo, độ cao gói

**Độ kín**:
Phần lòng thùng được hàng và vật liệu chèn lấp đầy; mục tiêu để khách mở thùng không thấy rỗng.
_Tránh_: tỉ lệ lấp đầy (đó chỉ tính hàng), độ đầy

**Kiện**:
Một thùng hoặc túi đã niêm phong; với GHN mỗi kiện có một mã đơn hãng riêng.
_Tránh_: parcel (trong UI), gói, hộp

**Niêm phong**:
Đóng kiện sau khi quét đủ món và cân; kiện cuối được niêm phong thì nhóm đơn coi như đã đóng gói.
_Tránh_: seal (trong UI), chốt kiện

**Ảnh niêm phong**:
Ảnh chụp kiện ngay trước khi niêm phong, làm bằng chứng khi có khiếu nại; con người xem, hệ thống không tự chấm.
_Tránh_: ảnh xác minh, AI soi ảnh

**Mô hình 3D**:
Dáng hiển thị của SKU trong hướng dẫn đóng gói 3D, chọn từ thư viện dùng chung; kích thước luôn lấy theo số đo của SKU, không ảnh hưởng chọn thùng. Hồ sơ đóng gói phải có mô hình mới được xác nhận.
_Tránh_: model, ảnh 3D, hình sản phẩm

**Mô hình theo loại**:
Mô hình có sẵn cho cả một loại hàng (áo thun, quần dài, giày…), có bước gập và túi zip với quần áo.
_Tránh_: model mặc định, mẫu chung

**Mô hình riêng**:
File GLB kho tải lên cho một hoặc vài SKU; quần áo phải có xương gập và túi zip, hoặc là file trải phẳng (khi đó dùng **bước gập tự tạo**).
_Tránh_: model upload, file tự up

**Bước gập tự tạo**:
Bước gập do hệ thống dựng cho mô hình riêng quần áo trải phẳng không có xương gập: lật hai mép vào giữa, rồi gập đôi / gập tư như thường. Nhãn nguồn: "Mô hình riêng — bước gập tự tạo".
_Tránh_: auto fold (trong UI), gập giả

**Hình cơ bản**:
Mô hình hệ thống dựng từ dáng hộp, trụ, chai hoặc tuýp với vài tỉ lệ (vai, cổ, nắp…); không dùng cho quần áo và túi xách. Hộp không bo góc gọi là **hình đại diện**.
_Tránh_: primitive (trong UI), hình khối

## Vận chuyển và hoàn

**Vận đơn**:
Một lần giao của một nhóm đơn (hãng GHN hoặc đội tự giao), gồm một hoặc nhiều kiện; tạo tay sau khi đóng gói, không tự tạo.
_Tránh_: AWB (trong UI), mã ship

**Phiếu trả hàng**:
Yêu cầu hoàn/đổi của khách cho một đơn đã giao, đi qua bước nhận và kiểm hàng trước khi nhập lại kho.
_Tránh_: đơn hoàn, return (trong UI)
