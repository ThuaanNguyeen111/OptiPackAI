# OptiPackAI — Thuật ngữ vận hành kho

Từ ngữ dùng chung cho luồng đơn đi từ sàn về kho, được lấy, đóng gói, giao và hoàn. Mỗi khái niệm chỉ có một tên; tên trong `_Tránh_` không dùng trong UI, docs hay thảo luận.

## Đơn và nhóm đơn

**Đơn**:
Một đơn khách đặt trên một sàn (Lazada, AURELLE), giữ nguyên mã đơn của sàn.
_Tránh_: order con, đơn lẻ

**Nhóm đơn**:
Các đơn cùng người nhận được lấy hàng chung một lượt; mỗi đơn trong nhóm vẫn có kiện và vận đơn riêng.
_Tránh_: đơn gộp, order group (trong UI), lô đơn

**Gộp đơn**:
Đưa một đơn mới vào nhóm đơn đang mở của cùng người nhận.
_Tránh_: ghép đơn, consolidate (trong UI)

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

**Kiện**:
Một thùng hoặc túi đã niêm phong, đi một vận đơn.
_Tránh_: parcel (trong UI), gói, hộp

**Niêm phong**:
Đóng kiện sau khi quét đủ món và cân; kiện cuối được niêm phong thì nhóm đơn coi như đã đóng gói.
_Tránh_: seal (trong UI), chốt kiện

## Vận chuyển và hoàn

**Vận đơn**:
Mã giao hàng của hãng (GHN) hoặc của đội tự giao, gắn với một kiện.
_Tránh_: AWB (trong UI), mã ship

**Phiếu trả hàng**:
Yêu cầu hoàn/đổi của khách cho một đơn đã giao, đi qua bước nhận và kiểm hàng trước khi nhập lại kho.
_Tránh_: đơn hoàn, return (trong UI)
