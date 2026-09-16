# AI 3D Packaging Optimization — Ý tưởng và hướng triển khai cho OptiPackAI

Biên soạn: **08/09/2026**, cập nhật danh mục **09/09/2026**. Đối tượng đọc: nhóm phát triển, người phụ trách kho và người đánh giá đồ án AOFP.

**Định hướng đề xuất:** xây dựng hệ thống chọn túi/thùng cho quần áo, giày và phụ kiện, với quy cách gấp/bọc và hướng dẫn đóng có thể kiểm chứng; dùng thuật toán hình học làm nền, bổ sung AI khi có dữ liệu và phép đo chứng minh giá trị. Thành công là nhân viên đóng được đơn đúng, ít tốn kém và có thể truy lại lý do lựa chọn.

Đây là tài liệu ý tưởng và thiết kế đề xuất, **chưa phải tính năng đã triển khai**. Các API, collection, ngưỡng hiệu năng và số liệu demo bên dưới đều là đề xuất hoặc dữ liệu giả lập. Tài liệu không cam kết phần trăm tiết kiệm trước khi đo thực tế.

## Mục lục

Để chuyển ý tưởng thành các công việc triển khai chỉ cho backend, xem [Backend roadmap: implementation và cải thiện thuật toán](BE_PACKAGING_IMPLEMENTATION_ROADMAP.md).

1. [Hiện trạng dự án](#hien-trang)
2. [Bài toán, mục tiêu và phạm vi](#bai-toan)
3. [Danh mục ý tưởng sản phẩm](#y-tuong)
4. [Dữ liệu và quy trình đo](#du-lieu)
5. [Mô hình hình học và ràng buộc](#hinh-hoc)
6. [Thuật toán và vai trò AI](#thuat-toan)
7. [Kiến trúc và tích hợp](#kien-truc)
8. [Giao diện 3D và quy trình kho](#giao-dien)
9. [API và hợp đồng dữ liệu đề xuất](#api)
10. [Ví dụ xuyên suốt](#vi-du)
11. [Chi phí, vật liệu và tác động môi trường](#chi-phi)
12. [Benchmark và kiểm thử](#kiem-thu)
13. [Vận hành và xử lý thất bại](#van-hanh)
14. [Roadmap và kịch bản demo](#roadmap)
15. [Thuật ngữ và nguồn tham khảo](#nguon)

<a id="hien-trang"></a>

## 1. Hiện trạng dự án

### 1.1. Những gì đã có và những gì còn thiếu

| Hạng mục                                  | Bằng chứng trong repo                                                                                                               | Ý nghĩa với packaging                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Backend NestJS, MongoDB/Mongoose          | [AppModule](../be/src/app.module.ts), [package backend](../be/package.json)                                                         | Có nền tảng module, xác thực, lưu trữ để tích hợp                                                          |
| Đơn hàng Lazada và đồng bộ định kỳ        | [Hướng dẫn Orders](../be/INTEGRATION_GUIDE_ORDERS.md), [scheduler](../be/src/modules/orders/lazada-order-sync.scheduler.ts)         | Có nguồn đơn đầu vào; tài liệu dự án ghi nhận đã thử end-to-end, lần biên soạn này không chạy lại API thật |
| Lưu từng đơn vị sản phẩm                  | [Order schema](../be/src/modules/orders/schemas/order.schema.ts), [mapper](../be/src/modules/orders/mappers/lazada-order.mapper.ts) | Phải truy được từng item từ vị trí trong thùng về đơn gốc                                                  |
| Gộp dòng chỉ để hiển thị                  | [aggregateOrderItems](../be/src/modules/orders/utils/aggregate-order-items.util.ts)                                                 | Không dùng dòng SKU đã gộp thay cho danh tính từng đơn vị                                                  |
| Module packaging, catalog thùng và engine | Không có module tương ứng trong cây `be/src/modules` đã kiểm tra                                                                    | Cần bổ sung; route recommend trong README là dự kiến                                                       |
| Kích thước, khối lượng, khả năng chồng    | Chưa có trên `OrderItem` hiện tại                                                                                                   | Phải xây dựng hồ sơ đóng gói SKU, không suy ra từ tên sản phẩm                                             |
| Frontend                                  | [package frontend](../fe/package.json) khai React `^19.2.8`, Vite `^8.2.0`, TypeScript `~6.0.2`                                     | Đây là phiên bản khai báo, không phải xác nhận phiên bản đã cài; chưa có dependency dựng 3D                |
| Phân quyền                                | [UserRole](../be/src/common/enums/user-role.enum.ts) có 5 role dạng số                                                              | Dùng role hiện hữu, không tạo thêm role chỉ để phục vụ packaging                                           |

### 1.2. Điểm tài liệu chưa thống nhất

- [README](../README.md) mô tả engine nằm trong modular monolith; [CLAUDE.md](../CLAUDE.md) ghi lựa chọn Python/service riêng hoặc JavaScript chưa chốt và cần prototype. Vì vậy, tài liệu này đưa ra **khuyến nghị để thử nghiệm**, không tuyên bố dự án đã chọn engine.
- README ghi React 18, trong khi package frontend khai React 19. Khi tích hợp thư viện phải kiểm tra package và lockfile thực tế.
- Report 1/Report 2 được nhắc trong hướng dẫn nhưng không tìm thấy file PDF/DOCX tương ứng trong lượt kiểm tra repo. Không coi tài liệu này là xác nhận đầy đủ yêu cầu trong các report đó.
- Lazada là nguồn tích hợp đang phát triển. Không mở thêm Shopee, TikTok hay Tiki chỉ để làm tính năng packaging.

### 1.3. Nền tảng cần bổ sung trước khi nói đến AI

Ba phần cần có đầu tiên là **dữ liệu sản phẩm đã đo**, **danh mục thùng đang dùng**, và **bộ kiểm tra phương án xếp**. Một mô hình tốt vẫn đưa ra phương án sai nếu kích thước đầu vào là kích thước ảnh quảng cáo hoặc kích thước kiện vận chuyển cũ.

<a id="bai-toan"></a>

## 2. Bài toán, mục tiêu và phạm vi

### Danh mục sản phẩm và mô hình đóng gói

**Phạm vi: quần áo, giày và phụ kiện thời trang.** Phân nhóm theo cách đóng: đồ mềm gấp được, đồ giữ nếp/phom, phụ kiện mềm, phụ kiện có hộp và phụ kiện cần bảo vệ bề mặt. Áo thun, quần, mũ, túi xách, thắt lưng và trang sức là ví dụ thiết kế; chưa phải dữ liệu SKU thật đã có trong repo.

Quần áo dùng hồ sơ gấp/bọc đã đo theo SKU/size/biến thể. Không suy số đo từ nhãn size, không tự nén một tỷ lệ và không lấy kích thước hàng trải phẳng để xếp. Phụ kiện được đánh giá theo yêu cầu hộp bảo vệ, giữ phom, chồng và tiếp xúc với vải. V1 dùng một hồ sơ đã duyệt cho từng biến thể.

Nhánh `box` dùng greedy 3D trên khối bao quanh gói sau chuẩn hóa. Nhánh `mailer` dùng quy cách túi đã thử cho đúng tổ hợp profile/version/số lượng, cách gói và đóng kín. Không dùng dài × rộng phẳng để tự suy chiều cao túi hoặc khả năng chứa. Thiếu quy cách túi nghĩa chưa đánh giá nhánh đó, không phải chứng minh túi không vừa.

Prototype nhánh thùng hoàn tất ở M4; chọn túi theo quy cách ở M4A là một phần của MVP API thời trang, trước pilot M6. Mô phỏng biến dạng vải/túi và tối ưu nén vẫn là nghiên cứu P2. Xem [giải thích thuật toán](GIAI_THICH_THUAT_TOAN_3D_PACKAGING.md) và [roadmap backend](BE_PACKAGING_IMPLEMENTATION_ROADMAP.md).

### Giày và hộp sản phẩm

Giày có hộp nằm trong danh mục dự án. V1 giữ nguyên đôi giày trong hộp gốc; engine xếp khối bao quanh **hộp giày đã bảo vệ** bằng kích thước ngoài. Một đôi bán cùng hộp là một item, không tách từng chiếc hoặc mở hộp để xếp thêm quần áo. SKU/size có thể dùng hộp khác nên phải có mapping số đo được xác minh.

Hộp giày là bao bì sản phẩm; túi/thùng giao hàng là bao bì ngoài cần tối ưu. Khối lượng hiệu dụng item đã gồm hộp gốc thì không cộng lại. Hộp đi kèm không trừ từ tồn thùng giao hàng; chỉ vật tư bổ sung hoặc hộp thay thế mới được tính theo nghiệp vụ cấp phát tương ứng.

Đề xuất pilot ưu tiên bảo toàn hộp, mặc định profile giày yêu cầu thùng ngoài. Chỉ cho túi ngoài khi hồ sơ cho phép và quy cách đúng tổ hợp đã được kiểm chứng về vừa túi/đóng kín/bảo vệ hộp. Không coi lọt túi là đủ chống móp, không tự dùng hộp sản phẩm làm kiện giao trực tiếp. Chỉ chồng hàng lên hộp khi tải cho phép đã được xác minh.

Catalog, validator và benchmark MVP bao gồm đơn một đôi giày, nhiều đôi, giày kèm áo và giày kèm phụ kiện. [Tài liệu giải thích](GIAI_THICH_THUAT_TOAN_3D_PACKAGING.md) có fixture SH1/T1 giữ nguyên hộp, tổng khối lượng kiện 1.480 g với số liệu giả lập.

<a id="hang-de-vo-chong-soc"></a>

### Hàng dễ vỡ và cần chống sốc: ví dụ trang sức

Bổ sung thiết kế ngày **11/09/2026**. Yêu cầu bảo vệ là **ràng buộc bắt buộc trước khi tối ưu chi phí**. Hộp vừa kích thước sản phẩm chưa đủ; phương án phải đáp ứng quy cách bảo vệ đã được kho xác minh. Đây là yêu cầu đề xuất, chưa phải tính năng đã triển khai.

Không mặc định mọi trang sức đều dễ vỡ. Hồ sơ theo SKU/biến thể ghi riêng các yêu cầu dưới đây; có thể kế thừa mẫu của nhóm sản phẩm nhưng phải xác nhận quy cách áp dụng cho SKU trước khi sử dụng.

| Yêu cầu | Dữ liệu và tác động đến phương án |
| --- | --- |
| Dễ vỡ | Gắn quy cách bảo vệ đã duyệt; cờ dễ vỡ riêng lẻ không đủ để suy ra độ dày đệm |
| Cần chống sốc | Ghi loại, lượng vật liệu, cách cố định và khoảng đệm theo quy cách đã thử |
| Dễ trầy xước | Bọc riêng, lớp lót hoặc ngăn cách theo quy cách tương thích bề mặt |
| Không được đè lên | Cấm đặt hàng khác lên item; nếu cho chồng phải có tải cho phép đã xác minh |
| Đã có hộp bảo vệ | Dùng kích thước ngoài và khối lượng gói hoàn chỉnh; không cộng hộp/lớp đệm hai lần |
| Giới hạn bao bì ngoài | Chỉ xét túi/thùng được hồ sơ cho phép; lọt túi không chứng minh đủ bảo vệ |

**Ví dụ quy cách trang sức:** món hàng → hộp nhỏ có đệm cố định và lớp lót phù hợp → lớp chống sốc → thùng vận chuyển. Đây là mẫu để kho thử và duyệt, không phải quy cách chung cho mọi loại trang sức. Đo kích thước và khối lượng sau các bước bảo vệ item, rồi dùng khối bao đó làm đầu vào xếp 3D. Phần chèn giữa item và thành thùng hoặc giữa các item phải được mô hình hóa riêng nếu chưa nằm trong kích thước hiệu dụng; không để solver sử dụng khoảng đệm này cho món khác.

Quy trình đề xuất:

1. Lấy hồ sơ SKU và phiên bản quy cách bảo vệ đã duyệt, kiểm tra đủ dữ liệu và vật tư.
2. Chuẩn hóa item sau bảo vệ, giữ các ràng buộc xoay, chồng, tiếp xúc và khoảng đệm.
3. Loại phương án vi phạm bảo vệ, sau đó xếp hạng các phương án hợp lệ theo tổng chi phí hộp/túi, vật liệu bổ sung và vận chuyển khi có biểu phí. Khi thiếu biểu phí, áp dụng thứ tự ưu tiên hiện hành và ghi rõ giới hạn ước tính.
4. Trả hướng dẫn thao tác, danh sách/định lượng vật tư và lý do chọn hoặc loại bao bì; lưu phiên bản quy cách trong snapshot để truy lại.
5. Nếu thiếu quy cách đã duyệt hoặc không tìm được phương án đáp ứng với vật tư hiện có, trả trạng thái cần xử lý thủ công cùng lý do. Không giảm lớp bảo vệ để ép vừa hộp; không khẳng định bài toán vô nghiệm chỉ vì heuristic chưa tìm thấy cách xếp.

AI có thể gợi ý quy cách để người phụ trách đánh giá; không tự bỏ yêu cầu bảo vệ hoặc coi gợi ý chưa kiểm chứng là hồ sơ đã duyệt. Validator hình học chỉ xác nhận mô hình quy tắc; khả năng chống sốc thực tế cần được xác minh qua thử nghiệm đóng gói.

### 2.1. Hệ thống cần trả lời câu hỏi gì?

Với đơn quần áo/giày/phụ kiện và vật tư tại kho, hệ thống đề xuất túi hoặc thùng, số kiện, quy cách gấp/bọc, vật liệu bảo vệ và thứ tự thao tác. Với thùng, kết quả có tọa độ/hướng từng món; với túi, kết quả có quy cách gói đã kiểm chứng. Sau đó giải thích chi phí dự kiến và lý do một phương án khác bị loại.

Phân biệt ba bài toán:

| Bài toán               | Đầu vào/đầu ra                                                    | Vai trò trong OptiPackAI                  |
| ---------------------- | ----------------------------------------------------------------- | ----------------------------------------- |
| Cartonization          | Đơn hàng + catalog → loại và số thùng                             | Chọn bao bì phù hợp                       |
| 3D bin packing         | Các khối + thùng → tọa độ và hướng xoay                           | Chứng minh cách xếp theo mô hình hình học |
| Packaging optimization | Phương án xếp + vật liệu + chi phí + thao tác → lựa chọn vận hành | Bài toán sản phẩm tổng thể                |

MVP xử lý **offline packing**: biết toàn bộ item của đơn trước khi xếp. “Online packing” trong nghiên cứu là item xuất hiện lần lượt và phải ra quyết định khi chưa biết các item sau, không có nghĩa đơn giản là chạy trên website.

### 2.2. Thứ tự ưu tiên đề xuất

1. Đủ từng item hợp lệ, không trùng, không bỏ sót; đáp ứng ràng buộc hình học và nghiệp vụ.
2. Chỉ dùng loại thùng và cách đóng gói được kho chấp nhận.
3. Nếu có biểu phí đủ tin cậy: giảm tổng chi phí vật tư và vận chuyển của **cả đơn**.
4. Nếu chưa đủ biểu phí: prototype chỉ có thùng ưu tiên ít kiện, thể tích ngoài rồi vật tư. Từ M4A khi so cả túi/thùng, ưu tiên ít kiện rồi chi phí vật tư đầy đủ; không so thể tích thùng với kích thước phẳng túi. Nếu giá vật tư chưa đủ cho mọi candidate, không kết luận lựa chọn rẻ nhất toàn bộ; luôn ghi rõ cước/tổng chưa biết.
5. Khi các phương án bằng nhau: ưu tiên ít thao tác và thứ tự ổn định để dễ tái hiện.

Không cộng điểm an toàn vào điểm chi phí rồi cho phép phương án rẻ “bù” cho vi phạm bắt buộc. Không gọi phương án heuristic là tối ưu toàn cục nếu chưa có chứng minh.

### 2.3. Phạm vi theo giai đoạn

**MVP:** gói quần áo/giày/phụ kiện sau gấp/bọc được mô hình hóa bằng khối hộp không biến dạng, xoay vuông góc theo hướng được phép, catalog thùng có sẵn, một đơn được xét tại một thời điểm, hướng dẫn 3D/2D, nhân viên xác nhận. Nhánh túi theo quy cách đã thử là mốc M4A của MVP API thời trang; viewer 3D áp dụng cho thùng, còn túi dùng danh sách bước gói. Khi cần nhiều kiện, chỉ xác nhận nếu luồng fulfillment hỗ trợ; nếu chưa hỗ trợ thì kết quả chia kiện là đề xuất cần xử lý thủ công.

**Mở rộng:** tối ưu nhiều đơn cùng tồn kho vật tư, gộp đơn có điều kiện nghiệp vụ, mô phỏng biến dạng túi/vải, hình dạng bất quy tắc, đo bằng camera, pallet và robot. Gộp theo địa chỉ không tự động có nghĩa sàn cho phép dùng chung vận đơn; không để engine hình học tự quyết định điều đó.

<a id="y-tuong"></a>

## 3. Danh mục ý tưởng sản phẩm

Ưu tiên: **P0** cần cho MVP thời trang gồm M4A, **P1** tăng giá trị sau MVP, **P2** nghiên cứu/mở rộng. Độ khó là ước lượng tương đối cho nhóm, chưa phải cam kết thời gian.

| Ý tưởng                           | Lợi ích và ví dụ                                 | Dữ liệu/phụ thuộc                                  |   Khó   | Ưu tiên |
| --------------------------------- | ------------------------------------------------ | -------------------------------------------------- | :-----: | :-----: |
| Hồ sơ đóng gói SKU                | Biết món nào thiếu số đo trước khi chạy engine   | Số đo, biến thể, người xác minh                    |   Vừa   |   P0    |
| Chọn thùng từ tồn kho             | Không gợi ý loại kho đã hết                      | Kích thước, sức chứa, số lượng khả dụng            |   Vừa   |   P0    |
| Xếp 3D và hướng dẫn từng bước     | Nhân viên mới có thể làm theo                    | Placement đã kiểm tra, thứ tự thao tác             |   Vừa   |   P0    |
| Giải thích chọn/loại thùng        | “Thùng S không đủ chiều dài sau bọc”             | Mã lý do từ validator và cost engine               |  Thấp   |   P0    |
| Gợi ý vật liệu theo quy tắc       | Chỉ định bọc riêng hoặc tấm ngăn                 | Quy cách vật tư đã được kho thử                    |   Vừa   |   P0    |
| Chuyển sang xử lý thủ công        | Không bịa phương án khi thiếu dữ liệu            | Lý do lỗi, quyền nhân viên                         |  Thấp   |   P0    |
| So sánh tối đa 3 phương án        | Thấy chi phí, số kiện và thao tác cạnh nhau      | Nhiều phương án hợp lệ, biểu phí                   |   Vừa   |   P1    |
| Chia kiện thông minh              | Xử lý đơn vượt tải hoặc hàng không được đi chung | Quy tắc sàn, tracking, phí từng kiện               |   Cao   |   P1    |
| Đổi thùng tức thời                | Hết thùng M thì tính lại bằng catalog còn lại    | Tồn kho và phiên bản recommendation                |   Vừa   |   P1    |
| Quét mã khi đóng gói              | Phát hiện lấy sai SKU hoặc thiếu số lượng        | Scanner, mapping mã hàng → SKU                     |   Vừa   |   P1    |
| Cân và đối chiếu khối lượng       | Phát hiện sai lệch cần kiểm tra                  | Cân, dung sai đo, vật tư thực dùng                 |   Vừa   |   P1    |
| Học từ chỉnh sửa của nhân viên    | Giảm gợi ý khó thao tác lặp lại                  | Lý do đổi, phương án cũ/mới, kết quả thực tế       |   Cao   |   P1    |
| Xếp hạng phương án bằng ML        | Dự đoán phương án dễ đóng và ít tốn công         | Lịch sử đóng, đặc trưng, tập kiểm thử              |   Cao   |   P1    |
| Phát hiện dữ liệu SKU bất thường  | Cảnh báo một biến thể bị nhập lớn gấp nhiều lần  | Phân bố số đo và lịch sử sửa                       |   Vừa   |   P1    |
| Dashboard tiết kiệm đã kiểm chứng | Tách tiền dự kiến khỏi tiền thực trả             | Baseline, hóa đơn, vật tư, thời gian               |   Vừa   |   P1    |
| Tối ưu bộ kích cỡ thùng           | Gợi ý bổ sung một cỡ phục vụ nhiều đơn           | Lịch sử đơn, MOQ, giá mua, diện tích kho           |   Cao   |   P2    |
| Tối ưu theo ca/kho                | Phân bổ thùng khan hiếm cho đơn có lợi nhất      | Batch đơn, hạn giao, tồn kho tổng                  |   Cao   |   P2    |
| Camera hỗ trợ đo                  | Giảm thao tác nhập số đo                         | Thiết bị hiệu chuẩn, vật chuẩn/depth, quy trình đo |   Cao   |   P2    |
| Đóng gói vật thể bất quy tắc      | Khai thác khoảng trống của hình dạng thật        | Mesh/scan, va chạm và ổn định                      | Rất cao |   P2    |
| Chọn túi giao hàng theo quy cách  | Phục vụ đơn thời trang đủ điều kiện, mốc M4A     | Tổ hợp profile/version/số lượng đã thử, tồn và giá |   Vừa   |   P0    |
| Mô phỏng túi/vải và tối ưu nén    | Xét biến dạng ngoài mô hình gói cố định          | Mức nén cho phép và thử nghiệm hàng                |   Cao   |   P2    |
| Pallet/robot                      | Mở rộng sang xếp vận chuyển hoặc tự động hóa     | Tải trọng, trọng tâm, đường đi, kẹp gắp            | Rất cao |   P2    |
| Trợ lý hỏi đáp quy trình          | Giải thích hướng dẫn đã duyệt cho nhân viên      | Tài liệu kho và dữ liệu phương án                  |   Vừa   |   P2    |
| Chỉ số môi trường                 | So sánh khối lượng vật tư giữa phương án         | Vật liệu và hệ số có nguồn, phạm vi tính           |   Cao   |   P2    |

**Nhóm tính năng nên làm đầu tiên:** hồ sơ SKU + catalog thùng + engine kiểm chứng + hướng dẫn xếp + ghi nhận phản hồi. Nhóm này tạo một vòng vận hành hoàn chỉnh và sinh dữ liệu cho AI về sau.

<a id="du-lieu"></a>

## 4. Dữ liệu và quy trình đo

### 4.1. Hồ sơ đóng gói sản phẩm

Đề xuất catalog riêng, ánh xạ `(platform, shop_id, sku, variation)` tới hồ sơ nội bộ. Không coi cùng chuỗi SKU ở hai shop là cùng sản phẩm nếu chưa có mapping xác minh.

| Nhóm               | Trường/capability đề xuất                                       | Quy tắc sử dụng                                                              |
| ------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Danh tính          | SKU nội bộ, biến thể, mapping sàn                               | Tách danh tính sản phẩm với danh tính item của đơn                           |
| Kích thước         | Dài/rộng/cao sau gấp và quy trình bọc đã đo theo biến thể       | Phân biệt số đo gói và phần bảo vệ cộng thêm; không dùng số đo áo trải phẳng |
| Khối lượng         | Gram của đơn vị hàng                                            | Không dùng giá hoặc tên để suy đoán                                          |
| Hướng              | Tập hướng được phép, mặt phải hướng lên                         | “Không lật” có thể vẫn cho xoay trên mặt đáy                                 |
| Độ nhạy            | Giữ nếp/phom, cấm ép/chồng, bảo vệ bề mặt, tương thích đi chung | Quy tắc được kho xác minh cho từng hồ sơ                                     |
| Bọc và đệm         | Công thức bọc, độ dày theo từng trục, khối lượng vật tư         | Tính đúng một lần, tránh cộng trùng với hộp bán lẻ                           |
| Độ tin cậy dữ liệu | Nguồn đo, ngày đo, người duyệt, phiên bản                       | Đây là độ tin cậy số đo, khác với điểm xếp hạng mô hình                      |

MVP dùng **mm nguyên** cho hình học và **g nguyên** cho khối lượng. Làm tròn kích thước item lên và không gian dùng được của thùng xuống khi chuyển đổi; giữ số đo gốc để truy vết. Sai số đo và độ hở thao tác là hai thứ cần khai báo riêng.

Mỗi item đưa vào engine có `item_key` duy nhất, trỏ về order và `platform_order_item_id`. Nếu về sau một nguồn lưu `quantity > 1`, tạo từng instance có chỉ số đơn vị; không nhân bản ID rồi gây trùng. Item bị hủy không được đi vào phương án giao.

### 4.2. Catalog túi, thùng và vật tư

- **Kích thước trong:** kiểm tra có xếp được hay không. Nếu có lót thành thùng, trừ độ dày lót để có không gian dùng được.
- **Kích thước ngoài:** đầu vào ước tính cước và kiểm tra giới hạn kiện của dịch vụ giao hàng.
- **Giới hạn tải:** phân biệt tải hàng cho phép với giới hạn tổng khối lượng cả kiện; không dùng một field mơ hồ cho cả hai.
- **Khối lượng bì, giá, tồn khả dụng:** giá và tồn có phiên bản/thời điểm. Recommendation không tự giữ chỗ vật tư.
- **Quy cách vật liệu:** đơn vị tính là tấm, mét, cuộn hoặc gram; có cách chuyển lượng sử dụng sang chi phí và khối lượng.

Túi giao hàng có mã, kích thước phẳng, bì, tồn/giá và quy cách fit đã duyệt. Mỗi fit profile lưu tổ hợp hồ sơ sản phẩm/version/số lượng cùng cách gói và đóng kín. Tổ hợp khác size, chất liệu, số lượng hoặc thêm phụ kiện phải có quy cách phù hợp riêng; không suy rộng tự động.

Khoảng trống hình học không tự chuyển thành lượng giấy chèn chính xác. Vật liệu bọc riêng, chèn khe và tấm ngăn cần công thức/quy trình riêng do kho thử nghiệm.

### 4.3. Luồng chuẩn hóa

1. Nhập catalog thủ công hoặc CSV có template và đơn vị rõ ràng.
2. Đo hàng ở đúng trạng thái đóng gói; đo lại khi số đo bất thường hoặc biến thể thay đổi.
3. Người có quyền xác minh số đo và quy cách bọc; lưu phiên bản.
4. Kiểm tra chiều dương, khối lượng dương, giá trị hữu hạn, mapping đủ và hướng hợp lệ.
5. Đánh dấu `ready` hoặc `needs_measurement`; item thiếu dữ liệu chặn recommendation có thể xác nhận.
6. Khi đo lại, recommendation chưa xác nhận dùng phiên bản cũ phải được tính lại; lịch sử đã xác nhận vẫn giữ snapshot.

Có thể cho chạy thử dữ liệu giả ở môi trường demo với nhãn “dữ liệu giả lập”. Không âm thầm dùng số đo mặc định cho đơn thật.

<a id="hinh-hoc"></a>

## 5. Mô hình hình học và ràng buộc

### 5.1. Quy ước tọa độ

Engine dùng `x` theo chiều dài, `y` theo chiều rộng, `z` hướng lên. Gốc là góc dưới của **không gian trong thùng có thể sử dụng**. Mỗi placement lưu góc nhỏ nhất `(x, y, z)` và kích thước sau xoay `(dx, dy, dz)`.

Khối hộp có tối đa sáu hoán vị kích thước theo ba trục; loại hướng trùng khi cạnh bằng nhau. Khi cần giữ mặt “UP”, danh sách orientation phải mang ý nghĩa mặt sản phẩm, không chỉ so sánh ba số kích thước. MVP không xét xoay chéo tùy ý.

### 5.2. Validator độc lập với thuật toán tìm kiếm

Mọi phương án từ heuristic, ML hay nhân viên chỉnh sửa đều phải đi qua cùng một validator ở backend:

- Item nằm trong biên: `0 <= x`, `x + dx <= L`, tương tự với `y/W` và `z/H`.
- Hai khối không chồng lấn: phải tách rời hoặc chỉ chạm mặt trên ít nhất một trục. Dùng kiểm tra hộp song song trục (AABB), không dùng riêng tổng thể tích.
- Mỗi đơn vị cần đóng xuất hiện đúng một lần trong toàn bộ các kiện; không chấp nhận item lạ.
- Hướng xoay thuộc tập cho phép; lớp bọc có mặt trong kích thước hiệu dụng.
- Tổng khối lượng hàng và tổng cả kiện thỏa đúng loại giới hạn tương ứng.
- Không đặt vật lên món cấm chồng; không trộn nhóm cấm đi chung.

**Chính sách ổn định đơn giản cho MVP:** item đặt trên đáy hoặc được đỡ toàn bộ đáy bởi một mặt trên của item khác đã được phép chịu tải. Không xếp bắc cầu lên nhiều vật; khi chưa có dữ liệu chịu tải thì không đặt hàng khác lên item đó. Cộng dồn khối lượng các vật phía trên theo chuỗi đỡ để kiểm tra tải cho phép.

Chính sách này chủ động bỏ qua một số cách xếp hợp lệ ngoài đời để giảm độ phức tạp. Kết quả chỉ chứng minh thỏa **mô hình quy tắc**, chưa chứng minh chống rung, rơi, móp hoặc trượt khi vận chuyển. Chất lượng bao bì phải được thử thực tế.

### 5.3. Thứ tự đóng gói cũng là một ràng buộc

Một cách xếp hoàn tất không va chạm chưa chắc đặt được từng món theo thứ tự đã cho. MVP chọn thao tác đưa món từ miệng thùng xuống theo phương thẳng đứng, vật đỡ được đặt trước. Kiểm tra vùng quét khi hạ item không xuyên vật đã đặt; tránh yêu cầu luồn món vào khe bị khóa.

Lưu riêng khoảng hở thao tác và thể tích bọc. Khi cần tay/kẹp giữ sản phẩm, quy trình thực tế có thể đòi hỏi không gian lớn hơn khối mô phỏng; nhân viên được báo không thao tác được và chuyển sang phương án khác.

<a id="thuat-toan"></a>

## 6. Thuật toán và vai trò AI

### 6.1. So sánh các hướng

| Hướng                      | Cách dùng đề xuất                                     | Điểm mạnh                                               | Giới hạn                                                      |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| Greedy + điểm đặt ứng viên | Thử vị trí cạnh các vật đã đặt và hướng hợp lệ        | Dễ giải thích, làm baseline                             | Phụ thuộc thứ tự, dễ bỏ lỡ cách xếp tốt                       |
| LAFF/xếp theo lớp          | Tham khảo chiến lược ưu tiên diện tích đáy            | Phù hợp nghiên cứu cách xếp có cấu trúc                 | Phải tự kiểm tra phù hợp với dữ liệu và ràng buộc             |
| Multi-start + local search | Đổi thứ tự, đổi thùng, chuyển item giữa kiện          | Cải thiện baseline với ngân sách thời gian              | Không bảo đảm tối ưu toàn cục                                 |
| MIP/CP-SAT                 | Mô hình chính xác cho bộ ca nhỏ                       | Có thể tìm nghiệm/chứng minh tối ưu khi solver hoàn tất | Cần tự mô hình hóa 3D, hướng, không giao nhau; có thể timeout |
| ML xếp hạng                | Dự đoán thời gian hoặc ưu tiên giữa phương án hợp lệ  | Dễ tích hợp vào engine hiện có                          | Cần dữ liệu thực, có sai lệch do cách thu thập                |
| Reinforcement learning     | Học chọn món, vị trí và hướng qua môi trường mô phỏng | Hướng nghiên cứu cho chính sách xếp                     | Chi phí môi trường, huấn luyện và kiểm chứng cao              |

Kho mã [skjolber/3d-bin-container-packing](https://github.com/skjolber/3d-bin-container-packing) có triển khai Java của biến thể LAFF và brute force. Đây là nguồn tham khảo/benchmark, **không phải thư viện JavaScript có thể import thẳng vào NestJS**.

Ví dụ [Bin Packing của OR-Tools](https://developers.google.com/optimization/pack/bin_packing) gán item vào bin theo dung lượng và giảm số bin; không cung cấp sẵn mô hình tọa độ 3D cho bài toán này. Chọn OR-Tools vẫn phải thiết kế ràng buộc hình học và ổn định.

### 6.2. Baseline đề xuất cho prototype

```text
Đọc snapshot item, catalog thùng và quy tắc
→ Kiểm tra dữ liệu; tính kích thước sau bọc
→ Lọc thùng theo điều kiện cần: kích thước từng món, tải, thể tích
→ Thử nhiều thứ tự item với cùng ngân sách tính
→ Sinh điểm đặt cạnh các khối đã xếp; thử hướng được phép
→ Chấp nhận bước đặt khi qua kiểm tra hình học và quy tắc
→ Nếu chưa đủ: thử thứ tự/thùng khác; xét chia kiện nếu được phép
→ Validator độc lập kiểm tra toàn bộ phương án
→ Tính chi phí, loại phương án trùng, xếp hạng và trả kết quả
```

Các thứ tự đầu tiên: thể tích giảm dần, cạnh lớn nhất giảm dần, diện tích đáy giảm dần; ưu tiên quy tắc cấm chồng khi quyết định vị trí. Tie-break theo `item_key` và mã thùng để tái hiện. Nếu dùng ngẫu nhiên, lưu seed.

Ngân sách prototype đề xuất: tối đa **2 giây tính solver**, 30 đơn vị hàng, 20 loại thùng; benchmark trên máy ghi rõ cấu hình. Đây là giới hạn thử ban đầu, không phải hiệu năng đã đo. Khi hết thời gian, trả phương án hợp lệ tốt nhất đã có kèm trạng thái giới hạn tìm kiếm; nếu chưa có thì báo không tìm thấy trong ngân sách. Không kết luận vô nghiệm chỉ vì greedy thất bại.

### 6.3. Nên đưa AI vào đâu trước?

**Đề xuất của tài liệu:** dùng ML xếp hạng sau khi có baseline và lịch sử đóng thực tế. Đầu vào mô hình có thể gồm số item, mức đa dạng kích thước, số lớp, số lần đổi hướng, loại vật tư và độ khó thao tác. Đầu ra dự đoán thời gian đóng hoặc điểm ưu tiên; validator vẫn quyết định tính hợp lệ.

Chuỗi thu thập dữ liệu: phương án được đề xuất → phương án nhân viên chọn → lý do đổi → thời gian và vật tư thực dùng → sự cố sau giao nếu theo dõi được. “Nhân viên đã chọn” là tín hiệu sở thích, không tự động là nhãn tối ưu hoặc an toàn. Không có phản hồi hư hỏng cũng không đồng nghĩa không hư hỏng.

Chia train/validation/test theo thời gian; thêm tập SKU hoặc tổ hợp SKU chưa gặp. Giữ các phiên bản cùng đơn trong cùng tập để tránh rò rỉ. So sánh ML với baseline trên cùng tập, cùng ngân sách và cùng validator; chỉ đưa vào vận hành khi cải thiện chỉ số mục tiêu mà không làm tăng vi phạm.

Nghiên cứu [Online 3D Bin Packing with Constrained Deep Reinforcement Learning](https://arxiv.org/abs/2006.14978) sử dụng học tăng cường có ràng buộc cho bài toán online. [Learning Practically Feasible Policies for Online 3D Bin Packing](https://arxiv.org/abs/2108.13680) nghiên cứu khả thi thực tế và kiểm tra ổn định bằng stacking tree. Hai hướng này phù hợp để tham khảo thiết kế môi trường; cần đánh giá lại khi áp dụng cho đơn hàng offline và quy trình kho của OptiPackAI.

### 6.4. Vai trò LLM và computer vision

LLM có thể diễn đạt mã lý do thành hướng dẫn dễ đọc hoặc tìm quy trình kho đã duyệt. MVP dùng template cố định cho giải thích quan trọng: “Thùng S bị loại vì cạnh dài hiệu dụng 220 mm vượt chiều trong 200 mm”. Không giao cho LLM quyền tự tạo số đo, tính tọa độ cuối cùng, giá cước hay xác nhận phương án.

Camera đo kích thước là một bài toán riêng: cần tỷ lệ tham chiếu/hiệu chuẩn, xử lý che khuất và kiểm tra sai số. Một ảnh sản phẩm thông thường không đủ để đảm bảo kích thước tuyệt đối. Chỉ dùng số đo camera sau bước xác minh, và giữ lựa chọn nhập/đo thủ công.

### 6.5. Đề tài nghiên cứu có thể bảo vệ

- Multi-start có giảm số kiện/thể tích so với greedy một lượt trong cùng thời gian không?
- ML ranker có giảm thời gian đóng thực tế so với chỉ xếp hạng theo thể tích không?
- Quy tắc ổn định và độ hở làm giảm mật độ xếp bao nhiêu, đổi lại nhân viên thực hiện thành công thế nào?
- Catalog thùng mới có giảm tổng chi phí trên đơn chưa dùng để thiết kế catalog không?

Mỗi câu hỏi cần baseline, dữ liệu giữ lại, tiêu chí đo, giới hạn mô hình và phân tích thất bại. Heuristic thuần là nền tối ưu hóa; nếu đồ án yêu cầu thành phần AI học từ dữ liệu, phải có thí nghiệm mô hình thực sự thay vì chỉ đổi tên thuật toán.

<a id="kien-truc"></a>

## 7. Kiến trúc và tích hợp

### 7.1. Ranh giới trách nhiệm đề xuất

| Thành phần                    | Trách nhiệm                                                             |
| ----------------------------- | ----------------------------------------------------------------------- |
| Orders                        | Cung cấp đơn và từng item đủ điều kiện, giữ trạng thái nguồn sàn        |
| Packaging catalog             | Hồ sơ SKU, thùng, công thức vật tư và phiên bản                         |
| Packaging application service | Phân quyền, snapshot đầu vào, gọi engine, lưu recommendation            |
| Packing engine                | Hàm tính toán từ dữ liệu chuẩn hóa tới candidate; không gọi Mongo/sàn   |
| Validator                     | Kiểm tra hình học, item, tải, thứ tự và quy tắc                         |
| Cost estimator                | Tính chi phí từ bảng giá có phiên bản; trả phần chưa biết               |
| Web viewer                    | Hiển thị chính xác placement backend trả, nhận lựa chọn nhân viên       |
| Fulfillment/shipping          | Ghi kết quả đóng, quản lý kiện/nhãn và tích hợp sàn theo hợp đồng riêng |

### 7.2. TypeScript hay Python?

| Tiêu chí             | TypeScript trong kiến trúc hiện tại       | Python qua adapter riêng                            |
| -------------------- | ----------------------------------------- | --------------------------------------------------- |
| Tích hợp             | Cùng hệ sinh thái NestJS và kiểu dữ liệu  | Cần hợp đồng liên tiến trình/dịch vụ                |
| Prototype heuristic  | Thuận tiện để tự viết lõi nhỏ             | Cũng khả thi, thêm môi trường chạy                  |
| Nghiên cứu ML/solver | Cần xem thư viện hoặc runtime phù hợp     | Thuận tiện thử công cụ nghiên cứu Python            |
| Vận hành             | Ít thành phần hơn, nhưng phải cách ly CPU | Thêm deploy, timeout, health check và version       |
| Quyết định           | Đề xuất mặc định để thử MVP               | Chỉ chọn sau prototype chứng minh lợi ích cần thiết |

Thiết kế một hợp đồng engine độc lập để thay implementation. Đề xuất prototype đầu bằng TypeScript, chạy công việc CPU trong worker thread có giới hạn concurrency, không chạy vòng tìm kiếm dài trên event loop HTTP. Điều này giữ API ứng dụng trong NestJS; không yêu cầu tách microservice ngay.

Nếu Python cho kết quả tốt hơn đáng kể hoặc là điều kiện cần cho nghiên cứu ML, ghi quyết định kiến trúc dựa trên benchmark rồi mới tích hợp. Tài liệu này không cài đặt hoặc chốt một package solver cụ thể thay cho bước đó.

### 7.3. Lưu trữ và tính nhất quán

Đề xuất các nhóm collection: hồ sơ sản phẩm, catalog thùng/vật tư, recommendation có snapshot, và sự kiện phản hồi. Lịch sử không tăng vô hạn bên trong Order. Mongoose schema mới dùng field `snake_case`, sub-schema rõ ràng, `HydratedDocument` và soft delete theo hướng dẫn dự án.

Trước khi viết schema, xác định query catalog theo mapping SKU và query lịch sử theo `order_id/created_at` để thiết kế index. Khóa duy nhất mapping và khóa chống xác nhận trùng cần enforce ở DB, không chỉ kiểm tra trước ở service.

Khi xác nhận: đọc lại revision đơn, hồ sơ và tồn kho; lưu lựa chọn và trừ vật tư trong transaction nếu cùng nghiệp vụ ghi nhiều collection. [Docker Compose hiện tại](../docker-compose.yml) chưa khai cấu hình replica set; môi trường Mongo phục vụ transaction cần được chuẩn bị trước. Yêu cầu replica set/sharded cluster cho transaction được mô tả trong [tài liệu MongoDB](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/).

Lời gọi sàn/in nhãn không nằm trong transaction Mongo. Sau commit, chuyển cho fulfillment xử lý có idempotency và retry; không coi timeout từ sàn là lý do trừ vật tư thêm lần nữa. Việc xác nhận kế hoạch chưa đồng nghĩa đã đóng xong và không tự đổi trạng thái nguồn sàn sang `PACKED`.

<a id="giao-dien"></a>

## 8. Giao diện 3D và quy trình kho

### 8.1. Các màn hình cần có

| Màn hình             | Nội dung                                          | Hành động chính                  |
| -------------------- | ------------------------------------------------- | -------------------------------- |
| Chuẩn bị dữ liệu     | SKU thiếu số đo, mapping chưa duyệt               | Nhập/đo và xác minh              |
| Chi tiết đóng gói    | Item đủ điều kiện, cảnh báo, thùng khả dụng       | Tạo recommendation               |
| So sánh phương án    | Số kiện, vật tư, chi phí đã biết/chưa biết, lý do | Chọn một phương án               |
| Hướng dẫn xếp        | Thùng 3D, danh sách bước và item đang chọn        | Tiến/lùi, xem mặt trên/cạnh      |
| Xác nhận và phản hồi | Vật tư thực dùng, sai lệch, lý do thay đổi        | Xác nhận hoặc tính lại           |
| Phân tích            | Baseline, kết quả thực và tỷ lệ xử lý thủ công    | Xem theo thời gian/nhóm sản phẩm |

### 8.2. Hành vi của viewer

- Xoay camera, zoom, đặt lại góc nhìn; ẩn thành thùng để nhìn bên trong.
- Màu theo SKU và nhãn theo item/bước; không truyền thông tin chỉ bằng màu.
- Chọn một dòng hàng làm nổi bật đúng instance; nhiều item cùng SKU vẫn có danh tính riêng.
- Hiển thị kích thước, hướng UP, lớp bọc và thứ tự; không chỉ vẽ khối sản phẩm trần.
- Animation thể hiện đường đặt đã kiểm tra, không tự tạo chuyển động đi xuyên các món khác.
- Chế độ 2D gồm mặt trên, mặt cạnh và bảng bước; dùng khi WebGL lỗi hoặc thiết bị yếu.

[Three.js](https://threejs.org/manual/en/creating-a-scene.html) cung cấp scene, camera, renderer và hình học khối hộp. [React Three Fiber](https://github.com/pmndrs/react-three-fiber) là React renderer cho Three.js; tài liệu dự án này nêu dòng v9 ghép với React 19. Đây là lựa chọn đề xuất cho FE hiện tại, cần kiểm tra peer dependency trước khi cài.

Engine dùng Z hướng lên; viewer có thể cấu hình camera cùng quy ước. `BoxGeometry` đặt tâm ở giữa, nên vị trí mesh là `(x + dx/2, y + dy/2, z + dz/2)` sau chuyển đơn vị. Không đưa tọa độ góc từ engine thẳng vào tâm mesh. Nếu viewer đổi trục, mọi item, nhãn và camera phải qua cùng phép biến đổi.

### 8.3. Chỉnh sửa và quyền thao tác

MVP cho chọn phương án/thùng khác và yêu cầu tính lại; chưa cần kéo-thả tọa độ tự do. P1 có thể thêm chỉnh placement, nhưng backend phải kiểm tra toàn bộ trước khi chấp nhận. Ghi rõ ai đổi, lý do và phiên bản kết quả.

Đề xuất dùng `PACKAGING_STAFF` cho tạo/chọn/xác nhận trong công việc được giao; `WAREHOUSE_STAFF` cập nhật số đo và vật tư theo quyền được cấp; `SHIPPING_COORDINATOR` xem thông tin kiện; `STORE_OWNER` xem chỉ số; `ADMIN` quản lý cấu hình. Đây là quyền đề xuất, không mô tả quyền route hiện hữu. Các route Orders hiện giới hạn Admin nên cần API đọc tối thiểu cho quy trình đóng gói, không mở toàn bộ quyền đồng bộ sàn cho nhân viên.

<a id="api"></a>

## 9. API và hợp đồng dữ liệu đề xuất

Các endpoint dưới đây **chưa tồn tại**. Không thêm prefix `/api/v1` vì repo hiện không dùng. Payload minh họa là phần dữ liệu nghiệp vụ; khi triển khai phải theo envelope và format lỗi chung của backend.

### 9.1. Endpoint tối thiểu

| Endpoint đề xuất                               | Mục đích                                           |
| ---------------------------------------------- | -------------------------------------------------- |
| `POST /packaging/recommend`                    | Backend đọc đơn/catalog, tạo và lưu recommendation |
| `GET /packaging/recommendations/:id`           | Lấy snapshot và các phương án để xem lại           |
| `POST /packaging/recommendations/:id/confirm`  | Chọn phương án sau kiểm tra phiên bản và vật tư    |
| `POST /packaging/recommendations/:id/feedback` | Ghi lý do đổi, thời gian và vật tư thực dùng       |

CRUD hồ sơ SKU/biến thể, túi/thùng/vật tư và quy cách fit là hạng mục riêng theo roadmap. Không nhét CRUD vào endpoint recommend.

Ví dụ request:

```json
{
  "order_id": "demo-order-001",
  "policy_id": "warehouse-default-v1",
  "max_candidates": 3
}
```

`demo-order-001` là ID dễ đọc cho tài liệu; API thật dùng ID theo schema hiện hữu. Frontend không gửi giá hoặc số đo làm nguồn sự thật khi tối ưu đơn thật. Backend lấy item đủ điều kiện, số đo đã duyệt và giá vật tư từ catalog.

### 9.2. Kết quả phải đủ để dựng lại và kiểm tra

| Nhóm dữ liệu        | Nội dung tối thiểu                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Recommendation      | ID, order ID, thời điểm, input revision, policy/engine version                                                           |
| Tình trạng tìm kiếm | `feasible`, `no_solution_found`, `needs_data`; cờ hết ngân sách độc lập                                                  |
| Candidate           | ID, danh sách kiện, chi phí, chỉ số, mã lý do và cảnh báo                                                                |
| Parcel              | `package_type=box`: thùng/placement; `package_type=mailer`: túi/fit profile và item; cả hai có version/vật tư/khối lượng |
| Placement           | `item_key`, vị trí góc mm, kích thước hiệu dụng sau xoay, orientation, bước                                              |
| Snapshot            | Item gốc, mapping số đo, vật tư, biểu phí và các phiên bản đã dùng                                                       |

Response rút gọn của nhánh thùng trong ví dụ ở mục 10. Nhánh túi thay `box_id`, kích thước trong và placements bằng `mailer_id`, `fit_profile_id/version`, item keys và bước gói; không bịa tọa độ 3D cho túi:

```json
{
  "recommendation_id": "demo-rec-001",
  "order_id": "demo-order-001",
  "input_revision": "demo-input-v1",
  "engine_version": "prototype-heuristic-v1",
  "status": "feasible",
  "search_budget_exhausted": false,
  "candidates": [
    {
      "candidate_id": "candidate-m",
      "parcels": [
        {
          "parcel_id": "parcel-1",
          "package_type": "box",
          "box_id": "BOX-M",
          "inner_mm": [300, 220, 120],
          "outer_mm": [310, 230, 130],
          "gross_weight_g": 920,
          "placements": [
            {
              "item_key": "demo-order-001:A1",
              "position_mm": [0, 0, 0],
              "size_mm": [200, 100, 80],
              "orientation": "LWH",
              "step": 1
            },
            {
              "item_key": "demo-order-001:A2",
              "position_mm": [0, 100, 0],
              "size_mm": [200, 100, 80],
              "orientation": "LWH",
              "step": 2
            },
            {
              "item_key": "demo-order-001:B1",
              "position_mm": [200, 0, 0],
              "size_mm": [100, 100, 100],
              "orientation": "LWH",
              "step": 3
            }
          ]
        }
      ],
      "cost": { "currency": "VND", "materials": 7000, "shipping": null, "total": null },
      "effective_volume_utilization": 0.530303,
      "warnings": ["SHIPPING_RATE_UNAVAILABLE"]
    }
  ]
}
```

`null` là chưa biết, không phải miễn phí. `size_mm` ở đây đã gồm bọc; renderer không cộng độ dày thêm lần nữa. `orientation=LWH` ánh xạ dài/rộng/cao sản phẩm sang X/Y/Z, còn hướng mặt được quản lý trong hồ sơ SKU.

### 9.3. Xác nhận và phản hồi

Request xác nhận gồm `candidate_id`, `input_revision` và khóa idempotency cho thao tác. Server đọc lại dữ liệu liên quan; dữ liệu hoặc tồn đã đổi thì trả xung đột để tính lại. Một lần bấm lại cùng khóa và cùng nội dung trả cùng kết quả; cùng khóa nhưng nội dung khác phải bị từ chối.

Không dùng một cờ “AI confidence” chung cho mọi ý nghĩa. Tách chất lượng số đo, kết quả validator, trạng thái tìm kiếm và điểm dự đoán của mô hình nếu có.

Phản hồi dùng mã lý do như `BOX_UNAVAILABLE`, `DIMENSION_MISMATCH`, `HARD_TO_PACK`, `EXTRA_PROTECTION`, `OTHER`, kèm ghi chú tùy chọn. Ghi cả phương án đã chọn thực tế; không dùng trường lý do để âm thầm sửa snapshot cũ.

<a id="vi-du"></a>

## 10. Ví dụ xuyên suốt: một đơn, ba đơn vị hàng

**Toàn bộ số đo, giá và dữ liệu trong ví dụ này là giả lập.** Các khối hiệu dụng đã gồm bao bì/bọc cần thiết; không có lót thành thùng hoặc khoảng hở bổ sung trong phép tính demo. Đây là fixture hình học, không phải quy cách đóng thực tế đã được kho duyệt.

### 10.1. Đầu vào

Fixture ngành hàng: A1/A2 là hai áo thun cùng hồ sơ gấp/bọc size M, B1 là hộp phụ kiện có quy tắc giả lập bắt buộc thùng ngoài. Nhánh túi vì vậy không đủ điều kiện. Số đo dùng kiểm tra hình học, không phải quy cách chuẩn của sản phẩm thực tế.

| Item   | SKU | Số lượng instance | Kích thước hiệu dụng mm | Khối lượng hàng/instance |
| ------ | --- | ----------------: | :---------------------: | -----------------------: |
| A1, A2 | A   |                 2 |     200 × 100 × 80      |                    250 g |
| B1     | B   |                 1 |     100 × 100 × 100     |                    200 g |

Tổng hàng: `2 × 250 + 200 = 700 g`. Tổng thể tích hiệu dụng: `2 × 200 × 100 × 80 + 100 × 100 × 100 = 4.200.000 mm³`.

| Thùng | Kích thước trong mm | Kích thước ngoài mm | Khối lượng bì | Giá thùng |
| ----- | :-----------------: | :-----------------: | ------------: | --------: |
| S     |   220 × 120 × 100   |   230 × 130 × 110   |         120 g | 4.000 VND |
| M     |   300 × 220 × 120   |   310 × 230 × 130   |         180 g | 6.000 VND |
| L     |   400 × 300 × 200   |   410 × 310 × 210   |         300 g | 9.000 VND |

Giả sử cả ba loại có tồn, tải hàng tối đa 2.000 g và giới hạn tổng khối lượng 2.500 g. Công thức vật tư demo dùng 40 g cho đơn với M hoặc L, giá 1.000 VND. Chưa có biểu phí vận chuyển.

### 10.2. Cách chọn và xếp

S có thể tích trong `2.640.000 mm³`, nhỏ hơn tổng thể tích hiệu dụng nên loại khỏi phương án **một kiện**. Điều này không có nghĩa thùng S không dùng được trong một phương án nhiều kiện.

Với M, đặt theo bảng:

| Bước | Item | Góc `(x, y, z)` mm | Kích thước sau xoay mm | Giải thích              |
| ---: | ---- | ------------------ | :--------------------: | ----------------------- |
|    1 | A1   | (0, 0, 0)          |     200 × 100 × 80     | Đặt trên đáy            |
|    2 | A2   | (0, 100, 0)        |     200 × 100 × 80     | Sát A1, không chồng lấn |
|    3 | B1   | (200, 0, 0)        |    100 × 100 × 100     | Trong phần đáy còn lại  |

Cả ba cùng nằm trên đáy, không cần giả định sức chịu tải chồng. Các mặt có thể chạm nhau theo mô hình. Với hàng thực, độ hở thao tác và dung sai cần đưa vào trước khi chấp nhận quy cách này.

Tỷ lệ sử dụng theo khối hiệu dụng của M là `4.200.000 / 7.920.000 ≈ 53,03%`. Tổng khối lượng kiện là `700 + 180 + 40 = 920 g`. Chi phí vật tư là `6.000 + 1.000 = 7.000 VND`.

L cũng chứa được cách xếp trên, tỷ lệ tương ứng là `4.200.000 / 24.000.000 = 17,5%`, khối lượng `1.040 g`, vật tư `10.000 VND`. Vì cả hai dùng một kiện, chưa có cước và M có thể tích ngoài nhỏ hơn, chính sách fallback chọn M. Riêng vật tư giảm `3.000 VND`; **chưa kết luận tiết kiệm tổng vận chuyển**.

### 10.3. Từ kết quả tới thao tác

Nhân viên mở đơn → hệ thống đối chiếu đủ A1/A2/B1 → chọn M → viewer hướng dẫn ba bước → nhân viên kiểm tra và xác nhận. Nếu kho báo M hết, yêu cầu tính lại với tồn mới; không chỉ đổi nhãn M thành L trên phương án cũ.

Nếu đo lại B thành khối 130 × 130 × 130 mm, item không vừa chiều cao trong M ở bất kỳ hoán vị nào. Recommendation cũ hết hiệu lực; thử L hoặc chuyển thủ công. Nếu A2 bị hủy trước xác nhận, tính lại với A1/B1, không đóng thêm A2 chỉ vì snapshot cũ còn nó.

<a id="chi-phi"></a>

## 11. Chi phí, vật liệu và tác động môi trường

Với ngành hàng thời trang, policy so túi/thùng sau M4A ưu tiên tổng chi phí nếu mọi candidate có đủ vật tư/cước; nếu chỉ đủ vật tư thì so vật tư và đánh dấu cước/tổng chưa biết. Nếu còn thiếu giá vật tư của một candidate, không khẳng định lựa chọn rẻ nhất toàn bộ. Khi hòa, dùng số bước quy cách rồi mã bao bì/signature. Không so kích thước phẳng của túi với thể tích trong thùng. Policy prototype chỉ-thùng ở ví dụ mục 10 vẫn ưu tiên thể tích ngoài khi chưa có cước.

Đơn chỉ có A1/A2 có thể dùng túi nếu đúng quy cách hai áo đã duyệt; thêm B1 bắt buộc thùng thì nhánh túi bị loại. Ví dụ đầy đủ hai nhánh và chi phí vật tư giả lập nằm trong [giải thích thuật toán](GIAI_THICH_THUAT_TOAN_3D_PACKAGING.md).

### 11.1. Tính theo cả đơn

```text
Chi phí biết được của đơn
= tổng giá thùng
+ tổng vật liệu bọc/chèn/ngăn
+ tổng cước từng kiện nếu có biểu phí phù hợp
+ chi phí nhân công nếu có dữ liệu và chính sách quy đổi
```

Khi một thành phần cần thiết chưa biết, hiển thị các phần đã biết và đánh dấu tổng chưa đầy đủ. Không so sánh một phương án có đầy đủ cước với một phương án thiếu cước như thể hai tổng tương đương.

Thùng nhỏ nhất không luôn có tổng chi phí thấp nhất: chia thành hai kiện có thể tăng phí cố định, dùng nhiều vật tư và thêm thao tác. Ngược lại, một thùng lớn có thể bị tính cước theo kích thước. Do đó phải so sánh cả phương án đơn hàng.

### 11.2. Biểu phí phải cấu hình theo dịch vụ

Cost estimator cần nhận kích thước ngoài, tổng khối lượng, tuyến giao và dịch vụ. Một số biểu phí có quy đổi thể tích thành khối lượng và quy tắc làm tròn; chỉ áp dụng đúng công thức, hệ số, đơn vị, phụ phí và ngày hiệu lực đã được xác minh cho dịch vụ đó. Không hardcode một hệ số chung cho tất cả hãng/sàn. Tài liệu này chưa xác minh biểu phí của đơn vị vận chuyển cụ thể.

Lưu `rate_version`, thời điểm ước tính và lý do thiếu cước. Giai đoạn đầu có thể dùng bảng giá giả lập để demo, nhưng giao diện phải ghi rõ giả lập. Khi có hóa đơn thực, đo độ lệch giữa dự kiến và thực trả.

### 11.3. Quy tắc bảo vệ và môi trường

Đề xuất bắt đầu bằng bảng công thức đã thử: loại sản phẩm → kiểu bọc → khoảng đệm → tấm ngăn → vật liệu tương thích. Không lấy “dễ vỡ=true” làm đủ dữ liệu để tính độ dày đệm chính xác. Với hàng chưa có quy cách, yêu cầu nhân viên xử lý và ghi nhận để bổ sung.

Chỉ số môi trường giai đoạn đầu nên báo lượng carton, giấy, nhựa theo đơn vị đo được. Muốn báo CO₂e phải có hệ số nguồn rõ, phạm vi và cách tính nhất quán. Giảm thể tích rỗng không trực tiếp bằng cùng phần trăm giảm phát thải.

<a id="kiem-thu"></a>

## 12. Benchmark và kiểm thử

### 12.1. Thiết kế dữ liệu đánh giá

Chuẩn bị ba nhóm: ca hình học tự tạo có đáp án kiểm tra được; đơn lịch sử đã ẩn danh và bổ sung số đo xác minh; ca đóng thử thực tế có vật tư và thời gian ghi nhận. Dữ liệu tổng hợp kiểm tra engine, nhưng không thay cho bằng chứng vận hành.

Phân tầng theo số item (1–5, 6–15, 16–30), độ đa dạng kích thước, hạn chế xoay, hàng dễ vỡ và catalog khan hiếm. Lưu seed, phiên bản dataset, engine, policy, phần cứng và giới hạn thời gian. Dùng cùng đầu vào và validator khi so thuật toán.

### 12.2. Chỉ số và cách đọc

| Chỉ số                    | Cách đo                                                     | Lưu ý                                                                                       |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Tỷ lệ phương án hợp lệ    | Qua validator / phương án được trả là dùng được             | Mục tiêu nghiệm thu: 100% trên bộ kiểm thử, không phải bảo đảm mọi tình huống ngoài thực tế |
| Tỷ lệ giải được           | Đơn có ít nhất một phương án / đơn đủ dữ liệu trong phạm vi | Không giấu đơn khó khỏi mẫu số                                                              |
| Số kiện và thể tích ngoài | Tính trên cả đơn                                            | So cùng nhu cầu giao hàng                                                                   |
| Utilization               | Tổng thể tích hiệu dụng / tổng thể tích trong               | Tách với thể tích sản phẩm trần, không coi phần bọc là hàng bán                             |
| Chi phí vật tư/cước       | Tổng có phiên bản giá; đối chiếu thực trả nếu có            | Tách ước tính và thực tế                                                                    |
| Thời gian solver/API      | p50, p95 và timeout, số request đồng thời                   | Ghi riêng tính toán với thời gian mạng/DB                                                   |
| Khả năng thao tác         | Tỷ lệ làm theo được, thời gian đóng, lý do đổi              | Cần người thực hiện và hàng thật                                                            |
| Chất lượng sau giao       | Sự cố có theo dõi / đơn theo dõi được                       | Có độ trễ và thiếu dữ liệu, không suy đoán từ im lặng                                       |

Baseline thuật toán là greedy một lượt. Baseline kinh doanh là cách đóng hiện tại của kho được ghi nhận, không tự dựng phương án thật tệ để làm đẹp mức tiết kiệm. Với ML, đo thêm sai số thời gian dự đoán và lợi ích khi thực sự dùng thứ hạng đó.

### 12.3. Các ca kiểm thử bắt buộc khi triển khai

| Ca                                                  | Kỳ vọng                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| Ví dụ A1/A2/B1 mục 10                               | Đúng tọa độ, 920 g, 53,03%, vật tư 7.000 VND                              |
| Item vừa đúng biên mô hình                          | Chấp nhận khi không khai khoảng hở thêm                                   |
| Chỉ vừa sau xoay                                    | Tìm được hướng hợp lệ; cấm hướng đó thì không dùng                        |
| Tổng thể tích đủ nhưng hình học không vừa           | Không trả một kiện không hợp lệ                                           |
| Hai khối chạm mặt và hai khối lấn 1 mm              | Chạm hợp lệ; lấn bị loại                                                  |
| Hàng + bì + vật tư vượt giới hạn kiện               | Bị loại dù riêng khối lượng hàng chưa vượt                                |
| Cấm chồng, thiếu tải cho phép, tải tích lũy quá lớn | Không xếp vật lên theo chính sách MVP                                     |
| Khối lơ lửng hoặc bắc cầu                           | Validator MVP từ chối                                                     |
| Thiếu/âm/NaN kích thước hoặc nhầm cm/mm             | Báo dữ liệu không hợp lệ; không mặc định thành 0                          |
| SKU giống nhau nhưng khác shop/biến thể             | Không tự dùng chung hồ sơ chưa mapping                                    |
| Hai unit cùng SKU, một unit bị hủy                  | Chỉ xếp unit đủ điều kiện, giữ ID gốc                                     |
| Một item bị lặp hoặc thiếu giữa hai kiện            | Validator từ chối toàn bộ phương án                                       |
| M hết tồn sau khi tính                              | Xác nhận trả xung đột, không trừ âm                                       |
| Đơn/số đo thay đổi trước xác nhận                   | Yêu cầu tính lại                                                          |
| Hai lần xác nhận đồng thời                          | Một kết quả nghiệp vụ, không trừ vật tư hai lần                           |
| Solver timeout                                      | Trả incumbent hợp lệ hoặc `no_solution_found`, không khẳng định vô nghiệm |
| Chưa có cước                                        | Shipping/total chưa biết, không hiển thị 0                                |
| Chia kiện nhưng fulfillment chưa hỗ trợ             | Không xác nhận tự động để tạo trạng thái không xử lý được                 |
| Viewer Z-up và mesh tâm                             | Vị trí hình đúng backend, nhãn item đúng instance                         |
| WebGL lỗi                                           | Có bảng bước và chế độ 2D                                                 |

Viết unit test hình học độc lập, test tính chất “mọi nghiệm trả ra đều qua validator”, integration test xác nhận/concurrency và E2E luồng kho. Hướng dẫn dự án yêu cầu `.spec.ts` cho module AI Packaging khi triển khai. Lần thay đổi tài liệu này không tạo engine hoặc các test tính năng đó.

<a id="van-hanh"></a>

## 13. Vận hành và xử lý thất bại

### 13.1. Quy tắc phản hồi lỗi

| Tình huống                      | Hành vi đề xuất                                                    |
| ------------------------------- | ------------------------------------------------------------------ |
| Thiếu số đo                     | Trả item và trường cần đo; không tự đoán                           |
| Không có thùng khả dụng         | Hướng dẫn bổ sung vật tư hoặc xử lý thủ công                       |
| Không tìm được trong ngân sách  | Báo giới hạn tìm kiếm, thử catalog/policy khác                     |
| Solver lỗi hoặc quá tải         | Giới hạn hàng đợi, phản hồi có thể thử lại; không chặn toàn bộ API |
| Rate estimator lỗi              | Có thể xem hình học, đánh dấu cước chưa biết                       |
| Người dùng không đóng theo được | Ghi lý do, yêu cầu phương án khác hoặc xử lý thủ công              |
| ML không sẵn sàng               | Quay về thứ hạng baseline, vẫn dùng validator                      |

Không dùng fallback bỏ qua hàng dễ vỡ, cấm xoay hoặc vượt tải. Khi trường hợp ngoài mô hình, nêu rõ giới hạn đó cho người thao tác.

### 13.2. Quan sát và bảo vệ dữ liệu

Log theo request/recommendation ID: phiên bản engine, policy, số item/thùng, thời gian, kết quả validator, timeout và mã lỗi. Engine không cần tên, số điện thoại hay địa chỉ đầy đủ; chỉ chuyển thuộc tính tuyến cần thiết cho cost estimator. Không đưa thông tin khách hàng vào dataset ML nếu không phục vụ mục tiêu.

Dashboard theo dõi tỷ lệ thiếu dữ liệu, không giải được, ghi đè thủ công, timeout và lệch chi phí. Cảnh báo khi các tỷ lệ tăng so với baseline vận hành đã đo. Giới hạn số item, candidate và công việc đồng thời ở backend; quyền gọi API vẫn phải kiểm tra dù hệ thống là công cụ nội bộ.

### 13.3. Cách đưa vào sử dụng

1. Chạy offline trên fixture và đơn lịch sử đã chuẩn hóa.
2. Chạy shadow: tạo đề xuất nhưng nhân viên vẫn đóng theo quy trình hiện tại, so sánh sau.
3. Pilot một nhóm hàng và ít loại thùng đã thử; nhân viên xác nhận mọi đơn.
4. Mở dần theo nhóm SKU khi chất lượng dữ liệu và tỷ lệ thao tác đạt tiêu chí.
5. Nếu có lỗi, tắt tự đề xuất bằng cấu hình và quay về quy trình thủ công; giữ lịch sử để điều tra. Rollback engine/ranker không xóa kết quả đóng đã ghi nhận.

<a id="roadmap"></a>

## 14. Roadmap và kịch bản demo

### 14.1. Thứ tự triển khai

| Giai đoạn                    | Đầu ra                                                      | Điều kiện hoàn thành                                                                    |
| ---------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 0 — Chuẩn hóa                | Catalog mẫu, đơn vị, mapping, quy tắc bọc, fixture          | Mọi item demo có số đo và nguồn xác minh/nhãn giả lập                                   |
| 1 — Prototype                | Heuristic TypeScript, validator độc lập, benchmark          | Ví dụ xuyên suốt đúng; không trả nghiệm sai trong bộ ca; ghi nhận thời gian và giới hạn |
| 2 — MVP ứng dụng             | Module recommend, lưu snapshot, viewer 3D/2D, xác nhận      | Nhân viên đi hết một đơn; phát hiện dữ liệu cũ; xác nhận không trừ trùng                |
| 2A — Bao bì thời trang (M4A) | Catalog/fit túi, kết quả box/mailer, hướng dẫn gói          | Phân loại đúng đơn áo và đơn hỗn hợp; không dùng fit sai tổ hợp                         |
| 3 — Pilot kho                | Giá vật tư, phản hồi, đo thời gian và xử lý thủ công        | Có báo cáo so với cách đóng hiện tại trên nhóm hàng đã chọn                             |
| 4 — AI có đo lường           | Dataset phiên bản hóa, ranker thử nghiệm, baseline fallback | Có tập giữ lại và kết quả chứng minh cải thiện chỉ số đã chọn                           |
| 5 — Mở rộng                  | Multi-parcel đầy đủ, tối ưu catalog/batch; nghiên cứu CV/RL | Mỗi hướng có dữ liệu, chủ sở hữu và tiêu chí riêng                                      |

Giai đoạn 1 là mốc đánh giá chọn engine dựa trên bằng chứng; giai đoạn 4 là mốc quyết định có đưa mô hình vào vận hành hay chỉ báo cáo nghiên cứu. Không đặt lịch cố định khi chưa biết năng lực nhóm và tình trạng dữ liệu.

### 14.2. Backlog để bắt đầu ngay

1. Thu thập túi/thùng thực dùng, chọn SKU quần áo/giày/phụ kiện và đo sau gấp/bọc theo biến thể.
2. Chốt hồ sơ gấp/bọc, giữ phom, chồng, quy cách túi theo tổ hợp item và định danh unit.
3. Xây fixture mục 10 cùng các ca không vừa và cấm xoay; viết validator trước.
4. Chạy heuristic một lượt, rồi multi-start trong cùng ngân sách để so sánh.
5. Tách engine khỏi NestJS I/O, lưu snapshot/version và bổ sung API đề xuất.
6. Dựng viewer theo placement đã kiểm tra, thêm bảng bước 2D.
7. Hoàn thiện xác nhận/idempotency và chuẩn bị Mongo hỗ trợ transaction.
8. Thử đóng thật, ghi lý do đổi và số liệu; dùng kết quả để chọn hướng AI tiếp theo.

### 14.3. Kịch bản demo 5–7 phút

- Mở một đơn ba item đã có số đo; chỉ ra mapping về từng item gốc.
- Tạo đề xuất đơn hỗn hợp; giải thích phụ kiện bắt buộc thùng ngoài, S thiếu thể tích và M có placement hợp lệ.
- Thử đơn chỉ có hai áo với quy cách túi đã duyệt; đổi size để chứng minh quy cách cũ không tự áp dụng.
- Xem ba bước trong 3D và bảng 2D; chỉ ra tỷ lệ 53,03% và vật tư 7.000 VND.
- Cho xem L để so sánh; giải thích chưa có cước nên tổng vẫn chưa biết.
- Mô phỏng M hết tồn hoặc B thay kích thước; chứng minh xác nhận cũ bị chặn và tính lại.
- Xác nhận phương án mới, gửi lại cùng thao tác để chứng minh không ghi/trừ trùng.
- Ghi phản hồi nhân viên và mở báo cáo benchmark; chỉ trình bày kết quả đã thực sự chạy.

Điểm nên nhấn mạnh khi bảo vệ: dữ liệu đáng tin, validator độc lập, truy vết từng item, phân biệt tối ưu hình học với khả thi vận hành, và AI được đánh giá bằng baseline rõ ràng.

<a id="nguon"></a>

## 15. Thuật ngữ và nguồn tham khảo

### 15.1. Thuật ngữ

| Thuật ngữ            | Nghĩa trong tài liệu                                              |
| -------------------- | ----------------------------------------------------------------- |
| Bin/carton           | Thùng hoặc không gian chứa                                        |
| Item instance        | Một đơn vị vật lý phải đóng, khác dòng SKU tổng hợp               |
| Placement            | Vị trí, kích thước sau xoay và hướng của một instance             |
| Effective dimensions | Kích thước dùng để kiểm tra, đã tính phần bọc theo quy tắc        |
| Heuristic            | Chiến lược tìm nghiệm thực dụng, thường không chứng minh tối ưu   |
| Candidate            | Một phương án đóng toàn bộ item được xét                          |
| Validator            | Bộ kiểm tra độc lập tính hợp lệ theo mô hình                      |
| Incumbent            | Nghiệm hợp lệ tốt nhất đã tìm được tại thời điểm hiện tại         |
| Snapshot/revision    | Bản dữ liệu và phiên bản dùng để tái hiện hoặc phát hiện thay đổi |
| Idempotency          | Gửi lại cùng thao tác không tạo hiệu ứng nghiệp vụ lặp            |
| Shadow mode          | Chạy để đối chiếu trước khi dùng kết quả điều khiển công việc     |
| Ablation             | Thử bỏ/thêm từng thành phần để đo đóng góp riêng                  |

### 15.2. Tài liệu dự án đã đối chiếu

- [README dự án](../README.md): phạm vi, tính năng và trạng thái được công bố.
- [Hướng dẫn dự án](../CLAUDE.md): quyết định kiến trúc, quy tắc dữ liệu và kiểm thử; có một số ghi chú lịch sử cần đối chiếu code.
- [Integration Guide Orders](../be/INTEGRATION_GUIDE_ORDERS.md): đơn hàng, item, route và giới hạn quyền hiện tại.
- [Order schema](../be/src/modules/orders/schemas/order.schema.ts) và [Lazada mapper](../be/src/modules/orders/mappers/lazada-order.mapper.ts): nguồn xác nhận cấu trúc item thực tế.
- [Frontend package](../fe/package.json), [AppModule](../be/src/app.module.ts), [Docker Compose](../docker-compose.yml): nền tảng tích hợp hiện tại.

### 15.3. Nguồn kỹ thuật bên ngoài

Các nguồn được tham khảo khi biên soạn; kết quả nghiên cứu của tác giả không được coi là kết quả OptiPackAI.

| Nguồn                                                                                                                              | Dùng để làm gì                                       | Giới hạn áp dụng                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| [Google OR-Tools: Bin Packing](https://developers.google.com/optimization/pack/bin_packing)                                        | Hiểu bài toán gán item, capacity và mục tiêu số bin  | Ví dụ không phải solver 3D có sẵn                                       |
| [skjolber: 3d-bin-container-packing](https://github.com/skjolber/3d-bin-container-packing)                                         | Tham khảo LAFF/brute force và cách tổ chức thư viện  | Java; phải kiểm tra license, runtime và ràng buộc trước khi tái sử dụng |
| [Online 3D Bin Packing with Constrained Deep Reinforcement Learning](https://arxiv.org/abs/2006.14978)                             | Tham khảo RL có ràng buộc                            | Bối cảnh online, không áp trực tiếp kết quả vào đơn offline             |
| [Learning Practically Feasible Policies for Online 3D Bin Packing](https://arxiv.org/abs/2108.13680)                               | Tham khảo ổn định và tính khả thi                    | Cần so giả định vật lý với hàng/thùng thật                              |
| [Three.js: Creating a scene](https://threejs.org/manual/en/creating-a-scene.html)                                                  | Nền tảng dựng viewer                                 | Hiển thị không thay thế kiểm tra vật lý                                 |
| [React Three Fiber](https://github.com/pmndrs/react-three-fiber)                                                                   | Tích hợp Three.js với React                          | Kiểm tra tương thích dependency trước khi cài                           |
| [MongoDB: Transactions production considerations](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/) | Chuẩn bị transaction khi xác nhận và cập nhật vật tư | Cần cấu hình triển khai phù hợp, không chỉ thêm code session            |

**Giả định cần kiểm chứng khi triển khai:** số đo hàng/thùng, quy cách đệm và độ hở, quyền thao tác nghiệp vụ, hỗ trợ nhiều kiện của luồng giao hàng, biểu phí vận chuyển, ngân sách solver và chất lượng dữ liệu cho ML. Các giả định này đã được đánh dấu để nhóm không nhầm ý tưởng với chức năng đã hoàn thiện.
