# Giải thích thuật toán đóng gói quần áo, giày và phụ kiện — OptiPackAI

Ngày biên soạn: **09/09/2026**. Tài liệu dành cho người muốn hiểu cách thuật toán hoạt động trước khi đọc code hoặc bắt đầu triển khai backend.

**Hệ thống dự kiến chọn bao bì cho quần áo, giày và phụ kiện bằng hai nhánh: chọn túi theo quy cách đã kiểm chứng, hoặc xếp 3D vào thùng bằng greedy có kiểm tra ràng buộc.** Đầu vào là hàng sau gấp/bọc theo hồ sơ SKU và biến thể. Prototype xây nhánh thùng trước; bản pilot ngành hàng có cả nhánh túi. Sau đó cải thiện thứ tự xếp và lựa chọn bao bì bằng benchmark.

Đây là giải thích của thiết kế trong [roadmap backend](BE_PACKAGING_IMPLEMENTATION_ROADMAP.md), **chưa phải mô tả engine đã chạy trong dự án**. Hướng prototype được đề xuất là TypeScript; lựa chọn triển khai cuối cùng cần dựa trên prototype và benchmark như roadmap đã nêu.

## 1. Thuật toán giải quyết việc gì?

**Danh mục áp dụng: quần áo, giày và phụ kiện thời trang.** Phân loại đóng gói theo đặc tính hàng: đồ mềm có thể gấp, đồ cần giữ nếp/phom, phụ kiện mềm, phụ kiện có hộp và phụ kiện cần bảo vệ bề mặt. Áo thun, quần, mũ, túi xách, thắt lưng hoặc trang sức dưới đây là ví dụ thiết kế, không phải danh sách SKU thực tế đã có trong hệ thống.

Giả sử một đơn có hai áo thun đã gấp/bọc và một hộp phụ kiện. Kho có túi giao hàng và thùng S, M, L. Hệ thống phải tìm được:

- Đơn có đủ điều kiện dùng túi không; nếu không, thùng nào phù hợp.
- Với túi: dùng quy cách gói nào; với thùng: đặt từng món ở đâu, theo hướng nào.
- Đặt món nào trước, món nào sau.
- Vì sao phương án đó hợp lệ và được ưu tiên.

Muốn trả lời, hệ thống cần biết kích thước, khối lượng, quy cách bọc, hướng xoay và những hạn chế của hàng/thùng. Tên sản phẩm hoặc ảnh sản phẩm không thay thế được số đo đã xác minh.

**Prototype thuật toán xét một đơn trong một thùng; bản pilot thời trang xét một đơn trong một bao bì ngoài — túi hoặc thùng.** Hộp bảo vệ một phụ kiện nằm bên trong vẫn là bao bì của item, không tự thành kiện giao riêng. Chia thành nhiều kiện là bước mở rộng sau, khi quy trình giao hàng hỗ trợ.

### 1.1. Phân loại sản phẩm theo nhu cầu đóng gói

Quần áo mềm, nên không dùng kích thước áo khi trải ra hoặc coi mọi sản phẩm là một vật cứng có kích thước cố định. Với prototype, **đo sau khi gấp và bọc theo một quy cách đã xác minh**, rồi lấy khối hộp bao quanh gói hàng đó để tính toán. Đây là cách đơn giản hóa hình học, không có nghĩa áo là vật cứng.

Ví dụ một SKU áo size M có hồ sơ gấp/bọc riêng. Size XL hoặc chất liệu dày hơn có thể cần hồ sơ khác; không lấy số đo size M làm mặc định. Cũng không tự giảm chiều cao một tỷ lệ tùy ý vì cho rằng quần áo nén được. Chỉ dùng trạng thái nén/gấp khác khi đã đo và được kho cho phép cho đúng sản phẩm.

| Nhóm hàng minh họa            | Dữ liệu cần đo/xác minh                     | Quy tắc đề xuất                                                                   |
| ----------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| Áo, quần, tất                 | Kích thước sau gấp/bọc theo SKU và biến thể | Chỉ dùng quy cách đã xác minh; kiểm tra có được chồng và dùng túi giao hàng không |
| Quần áo cần giữ nếp/phom      | Gói hàng sau quy trình bảo vệ               | Không tự gấp thêm hoặc ép mỏng để vừa bao bì                                      |
| Phụ kiện nhỏ có hộp           | Kích thước và khối lượng hộp hoàn chỉnh     | Xếp hộp ngoài, không xếp hình học của món bên trong                               |
| Mũ, túi cần giữ phom          | Kích thước sau chèn/bọc bảo vệ              | Kiểm tra chống ép, chống móp và điều kiện chồng riêng                             |
| Phụ kiện có chi tiết cứng/sắc | Gói đã che/bọc chi tiết tiếp xúc            | Chỉ đóng chung khi quy cách bảo vệ vải đã được xác minh                           |

Không mặc định mọi phụ kiện đều dễ vỡ hoặc mọi quần áo đều nén được. Quy tắc thuộc về hồ sơ sản phẩm, không chỉ tên nhóm hàng.

**Trường hợp trang sức cần chống sốc:** dùng quy cách đã duyệt để cố định món hàng trong hộp nhỏ, bảo vệ bề mặt và bọc chống sốc, rồi đo gói hoàn chỉnh để xếp vào thùng ngoài. Khoảng đệm chưa nằm trong khối gói phải được giữ riêng khi xếp. Thuật toán loại các phương án thiếu bảo vệ trước khi so chi phí; không giảm đệm hoặc bỏ quy tắc cấm đè để vừa hộp. Nếu thiếu quy cách/vật tư hoặc chưa tìm được phương án phù hợp, chuyển xử lý thủ công kèm lý do. Xem [yêu cầu và quy trình chi tiết](AI_3D_PACKAGING_OPTIMIZATION.md#hang-de-vo-chong-soc).

### 1.2. Khi nào xét túi, khi nào xét thùng?

Với ngành hàng này, **chọn túi giao hàng hay thùng** cần được đưa vào bài toán. Greedy 3D đã mô tả là nhánh xếp vào thùng; nhánh túi cần một bộ kiểm tra phù hợp riêng.

Đề xuất phát triển: làm prototype thùng để kiểm tra engine, sau đó bổ sung chọn túi sớm sau MVP API. Túi chỉ được đề xuất khi toàn bộ item được phép dùng túi và có quy cách gói/túi đã thử thực tế, gồm độ dày gói, miệng túi và phần cần chừa để đóng kín. Không biến kích thước phẳng dài × rộng của túi thành một thùng 3D có chiều cao tự đoán.

Đơn chỉ có quần áo đã có quy cách dùng túi sẽ thử các túi đủ điều kiện; đơn có phụ kiện cần bảo vệ cứng xét thùng hoặc quy cách hộp bảo vệ đã duyệt. Nếu chưa có dữ liệu đủ để xác nhận túi vừa, vẫn có thể xét thùng và ghi rõ chưa đánh giá được nhánh túi. Đây là giới hạn dữ liệu, không phải kết luận thùng là phương án tốt nhất cho mọi đơn thời trang.

### 1.3. Giày có hộp: xếp nguyên hộp sản phẩm

Giày có hộp là một nhóm hàng của dự án. **Mặc định thiết kế giữ nguyên đôi giày trong hộp gốc**, dùng kích thước ngoài của hộp cùng phần bảo vệ thêm làm kích thước hiệu dụng. Không xếp từng chiếc giày rời, tháo hộp hoặc tận dụng khoảng trống trong hộp để nhét áo/phụ kiện khi chưa có quy cách riêng được duyệt.

Phân biệt hai lớp bao bì:

| Lớp                    | Vai trò                                  | Cách đưa vào thuật toán                                  |
| ---------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Hộp giày sản phẩm      | Chứa đôi giày, giữ phom và hình thức hộp | Thuộc item giày; dùng kích thước ngoài sau bảo vệ để xếp |
| Bao bì giao hàng ngoài | Túi hoặc thùng để giao cả đơn            | Là candidate cần lựa chọn, có giá, tồn và tải riêng      |

Một đơn vị bán là một đôi giày thì engine tạo **một item giày có hộp**. Hai đôi là hai instance, mỗi instance gắn ID item nguồn; không đếm hai chiếc thành hai đơn vị bán hoặc thêm hộp gốc thành một item độc lập.

Số đo hộp phải gắn với SKU/biến thể và phiên bản hồ sơ. Size giày hoặc mẫu khác có thể dùng hộp khác; không suy kích thước hộp từ số size. Hướng nắp, tải được đặt phía trên và yêu cầu chống móp đều là thuộc tính cần xác minh. Thiếu tải chồng thì không đặt hàng khác lên hộp.

Trong pilot, hồ sơ giày có hộp được đề xuất mặc định `box_required=true` để dùng thùng ngoài cho tới khi có quy cách khác được duyệt. Túi ngoài chỉ được xét nếu hồ sơ cho phép và quy cách fit đúng tổ hợp đã được thử, bảo vệ được hộp và đóng kín được. Việc một hộp giày lọt vào túi chưa đủ để chứng minh không bị móp khi giao.

Chưa tự dùng hộp giày gốc làm kiện giao trực tiếp. Hộp gốc nằm trong khối lượng item; chỉ cộng thêm bao bì bảo vệ/giao hàng chưa tính. Hộp đi kèm sản phẩm không trừ lần nữa từ tồn thùng giao hàng; hộp thay thế do kho cấp mới cần định mức vật tư riêng.

## 2. Tên và ý nghĩa của cách làm

Toàn hệ thống là **bộ chọn bao bì theo quy tắc kết hợp heuristic 3D packing**. Nhánh túi kiểm tra hồ sơ gói đã duyệt; nhánh thùng dùng greedy và điểm đặt ứng viên. Không áp phép kiểm tra thể tích thùng cho túi mềm.

| Khái niệm         | Hiểu đơn giản                                                              |
| ----------------- | -------------------------------------------------------------------------- |
| Heuristic         | Một cách tìm lời giải thực dụng, không hứa luôn tìm được lời giải tốt nhất |
| Greedy            | Tại mỗi bước, chọn vị trí hợp lệ được ưu tiên nhất lúc đó rồi tiếp tục     |
| Điểm đặt ứng viên | Những góc có thể thử đặt món tiếp theo, sinh từ sàn và các mặt hàng đã xếp |
| Validator         | Bộ kiểm tra độc lập xem phương án có tuân thủ quy tắc hay không            |
| Multi-start       | Chạy lại quá trình xếp với nhiều thứ tự sản phẩm khác nhau                 |
| Local search      | Thay đổi nhỏ một thứ tự xếp rồi thử lại để cải thiện phương án             |

Cách sinh điểm trong prototype là quy tắc riêng đã mô tả trong roadmap. Không gọi nó là bản triển khai đầy đủ của một thuật toán Extreme Points chuẩn khi chưa thực hiện và đối chiếu thuật toán đó.

## 3. Dữ liệu thuật toán cần nhận

### 3.1. Mỗi đơn vị sản phẩm

| Dữ liệu              | Ví dụ                                   | Lý do cần                                       |
| -------------------- | --------------------------------------- | ----------------------------------------------- |
| ID đơn vị hàng       | A1, A2                                  | Hai món cùng SKU vẫn phải được theo dõi riêng   |
| Kích thước hiệu dụng | 200 × 100 × 80 mm                       | Không gian món hàng chiếm sau khi tính phần bọc |
| Khối lượng           | 250 g                                   | Kiểm tra tải và khối lượng cả kiện              |
| Hướng được phép      | Giữ mặt trên hoặc cho xoay một số hướng | Không lật hộp phụ kiện nếu quy cách cấm         |
| Quy tắc chồng        | Không chịu hàng phía trên               | Tránh dùng món đó làm vật đỡ                    |

**Kích thước hiệu dụng** là kích thước dùng để xếp. Ví dụ món hàng dài 180 mm, bọc thêm 10 mm mỗi đầu thì chiều dài hiệu dụng là 200 mm. Nếu số đo ban đầu đã gồm lớp bọc đó, không cộng lần nữa.

Đối với quần áo, bổ sung `packing_profile_id` và phiên bản để nhận biết quy cách gấp/bọc đã dùng; lưu khả năng dùng túi, yêu cầu giữ phom và quy tắc chồng. Nếu sau này thử nhiều cách gấp, đó là các hồ sơ thay thế của **cùng một item**, không phải thêm item mới vào đơn. V1 chọn một hồ sơ đã duyệt cho mỗi biến thể để giữ tìm kiếm đơn giản.

### 3.2. Mỗi loại bao bì ngoài

Thuật toán cần kích thước trong dùng được, kích thước ngoài, khối lượng bì, tải hàng cho phép, giới hạn tổng khối lượng, giá và tồn khả dụng. Kích thước trong phục vụ xếp hàng; kích thước ngoài phục vụ so sánh kiện và ước tính vận chuyển.

Catalog túi lưu kích thước phẳng của nhà cung cấp, bì, giá, tồn và liên kết quy cách đóng đã xác minh. Kích thước phẳng dùng để nhận diện loại túi, không đủ để khẳng định chứa được gói hàng có độ dày.

Mỗi quy cách túi chỉ áp dụng cho tập `packing_profile_id + version + quantity` đã thử, cùng thứ tự gói, giới hạn tải và cách đóng kín. Ví dụ quy cách cho hai áo thun không tự áp cho một áo thun và một quần jean, hoặc cho ba áo cùng SKU. Trong bản đầu, so khớp đúng tổ hợp; trường hợp mới cần kho thử và duyệt quy cách mới.

Backend lấy dữ liệu đã duyệt từ catalog. Thiếu hồ sơ sản phẩm thì báo bổ sung; chỉ thiếu quy cách túi thì nhánh túi trả `not_evaluated` và vẫn có thể xét thùng.

## 4. Biểu diễn hàng trong không gian 3D

Quy ước của engine:

- `x`: vị trí theo chiều dài thùng.
- `y`: vị trí theo chiều rộng thùng.
- `z`: độ cao tính từ đáy thùng.
- `(0, 0, 0)`: một góc dưới của không gian trong thùng dùng được.

Mỗi món được mô hình hóa bằng khối hộp. Placement gồm **tọa độ góc nhỏ nhất**, **kích thước sau xoay** và **hướng đặt**.

Ví dụ một món tại `(200, 0, 0)`, kích thước `(100, 100, 100)` chiếm:

```text
x từ 200 đến 300 mm
y từ   0 đến 100 mm
z từ   0 đến 100 mm
```

Đó là dữ liệu backend cần trả. Vẽ khối hộp lên giao diện là công việc của viewer, không phải cách backend quyết định phương án hợp lệ.

## 5. Luồng quyết định cho một đơn thời trang

1. Lấy từng đơn vị hàng và hồ sơ gấp/bọc đúng SKU, size, chất liệu hoặc biến thể tương ứng.
2. Kiểm tra yêu cầu giữ phom, bề mặt, chồng hàng và quy tắc đi chung. Thuộc tính phải được xác minh; không suy ra chỉ từ tên danh mục.
3. Nếu không có item bắt buộc dùng thùng ngoài, tìm các quy cách túi khớp toàn bộ tổ hợp hàng và còn hiệu lực.
4. Đồng thời thử nhánh thùng bằng greedy 3D; item trong hộp bảo vệ được xếp theo kích thước ngoài của hộp đó.
5. Kiểm tra candidate theo đúng loại bao bì, rồi xếp hạng các phương án hợp lệ có đủ cơ sở so sánh.
6. Trả phương án cùng quy cách gấp/bọc và cảnh báo phần chưa đánh giá; khi xác nhận đọc lại dữ liệu/tồn kho.

`box_required` nghĩa bắt buộc **thùng ngoài**; `protective_case_required` chỉ yêu cầu hộp bảo vệ cho item. Hai điều kiện không đồng nghĩa: phụ kiện đã có hộp vẫn có thể dùng túi ngoài nếu quy cách đó được duyệt. Đơn chỉ có quần áo cũng không mặc định dùng túi nếu cần giữ phom hoặc chưa có quy cách phù hợp.

Trong prototype chỉ có thùng, xếp hạng như bước G bên dưới. Khi bật nhánh túi: nếu có đủ cước và vật tư cho mọi candidate, so tổng chi phí; nếu chỉ đủ vật tư, so chi phí vật tư và ghi rõ cước/tổng chưa biết. Nếu chi phí vật tư của candidate còn thiếu, không tự tuyên bố phương án rẻ nhất trong toàn bộ lựa chọn. Hòa điểm dùng số bước thao tác trong quy cách rồi mã bao bì/chữ ký phương án. Không so thể tích trong của thùng với kích thước phẳng của túi.

### 5.1. Nhánh thùng chạy từng bước như thế nào?

### Bước A — Kiểm tra và chuẩn hóa đầu vào

Đọc đơn và từng item đủ điều kiện đóng; đối chiếu hồ sơ SKU, đổi về mm/g, tính kích thước hiệu dụng và lượng vật tư. Mỗi món vật lý có một ID riêng. Nếu dữ liệu thiếu hoặc không hợp lệ, dừng và trả lý do để bổ sung.

Lưu snapshot đầu vào để sau này biết kết quả được tính từ số đo, catalog và quy tắc nào.

### Bước B — Lọc những thùng chắc chắn không phù hợp

Loại thùng hết tồn, không chứa nổi một món ở bất kỳ hướng được phép nào, hoặc vượt tải theo dữ liệu đã biết. Với bài toán một kiện, tổng thể tích hàng hiệu dụng lớn hơn thể tích trong thùng cũng đủ để loại thùng đó.

**Qua bước lọc chưa có nghĩa xếp được.** Ví dụ thùng 100 × 100 × 100 mm và hai khối lập phương cạnh 60 mm: tổng thể tích chỉ 432.000 mm³, nhỏ hơn 1.000.000 mm³ của thùng. Nhưng để hai khối không chồng lấn, phải đặt tách nhau trên ít nhất một trục; trục đó cần 120 mm, vượt cạnh thùng. Không thể xếp cả hai theo mô hình xoay vuông góc này.

### Bước C — Sắp thứ tự món hàng

Bản `greedy-v1` sắp theo:

1. Thể tích hiệu dụng giảm dần.
2. Nếu bằng thể tích: cạnh lớn nhất giảm dần.
3. Nếu vẫn bằng nhau: ID item theo thứ tự cố định.

Mục đích của việc đặt món lớn trước là tránh lấp đầy các vị trí thuận lợi bằng món nhỏ rồi không còn chỗ cho món lớn. Đây là chiến lược khởi đầu, không phải quy luật luôn đúng cho mọi đơn.

### Bước D — Sinh các điểm đặt ứng viên

Khi thùng còn trống, chỉ có điểm `(0, 0, 0)`.

Sau khi đặt hàng, tạo ba tập tọa độ:

```text
X = {0} cộng các giá trị x + dx của những món đã đặt
Y = {0} cộng các giá trị y + dy của những món đã đặt
Z = {0} cộng các giá trị z + dz của những món đã đặt
```

Trong đó `dx`, `dy`, `dz` là kích thước sau xoay. Lấy các tổ hợp trong `X × Y × Z` làm điểm thử; loại điểm trùng và ngoài biên. Không tạo trước toàn bộ danh sách lớn nếu có thể duyệt từng điểm.

Ví dụ đã đặt A1 kích thước 200 × 100 × 80 tại gốc, ta có:

```text
X = {0, 200}
Y = {0, 100}
Z = {0, 80}
```

Một số điểm được thử là `(200, 0, 0)`, `(0, 100, 0)` và `(0, 0, 80)`. Chúng gợi ý đặt cạnh bên hoặc phía trên A1. Điểm nằm trong vùng bị chiếm hoặc không có vật đỡ vẫn phải bị validator loại bỏ.

### Bước E — Thử hướng xoay và kiểm tra từng vị trí

Các điểm được ưu tiên theo `z` tăng dần, rồi `y`, rồi `x`: thử ở thấp trước, sau đó theo thứ tự trên mặt đáy. Với mỗi điểm, thử các orientation được phép theo thứ tự cố định.

Một khối 200 × 100 × 80 có tối đa sáu hoán vị kích thước theo ba trục. Tuy nhiên, sản phẩm có thể chỉ cho phép một phần trong số đó. Nếu phải giữ mặt UP, orientation cần lưu nghĩa của mặt sản phẩm; ba con số kích thước không đủ để biểu diễn việc có bị lật hay không.

Chọn vị trí/hướng hợp lệ đầu tiên theo thứ tự này rồi chuyển sang món tiếp theo. V1 không quay ngược sửa những món đã đặt trong cùng lượt greedy.

### Bước F — Kiểm tra toàn bộ phương án

Khi tất cả món đã được đặt, chạy validator toàn bộ candidate lần nữa. Nếu một món không đặt được, lượt thử thùng đó thất bại; phần hàng đã xếp không được trả như một phương án hoàn chỉnh.

Thử các loại thùng khác từ trạng thái rỗng. Chỉ giữ những phương án chứa đủ hàng và qua validator.

### Bước G — So sánh kết quả trong prototype chỉ có thùng

Trong bản một kiện chưa có cước thật, so phương án theo:

1. Thể tích ngoài của thùng nhỏ hơn.
2. Nếu bằng nhau: chi phí vật tư đã biết thấp hơn.
3. Nếu vẫn bằng nhau: mã thùng và chữ ký placement theo thứ tự cố định.

Có thể trả tối đa ba phương án khác nhau. Shipping và tổng chi phí chưa biết để `null`, không ghi là 0. Khi có biểu phí đầy đủ ở giai đoạn sau, cách xếp hạng sẽ chuyển sang tổng chi phí đơn theo policy được phiên bản hóa.

## 6. Validator kiểm tra những gì?

| Kiểm tra                    | Ví dụ bị loại                                              |
| --------------------------- | ---------------------------------------------------------- |
| Trong biên thùng            | Món kết thúc ở x = 320 nhưng thùng chỉ dài 300 mm          |
| Không chồng lấn             | Hai món chiếm cùng một vùng thể tích                       |
| Đúng hướng cho phép         | Hộp phụ kiện cần giữ mặt trên bị lật                       |
| Đủ từng item đúng một lần   | A1 xuất hiện hai lần, A2 bị bỏ sót                         |
| Không vượt tải              | Riêng hàng vừa tải nhưng cộng bì/vật tư vượt giới hạn kiện |
| Có vật đỡ                   | Món ở z = 80 nhưng bên dưới trống                          |
| Không vi phạm quy tắc chồng | Đặt món khác lên hàng cấm chịu tải                         |
| Thứ tự đặt khả thi          | Cần luồn một món qua vùng đang bị món khác chắn            |

Kiểm tra không chồng lấn dùng hộp song song trục, thường gọi là AABB: hai khối phải tách nhau hoặc chỉ chạm mặt trên ít nhất một trục. Chỉ chạm mặt là hợp lệ trong mô hình; xuyên vào nhau dù 1 mm cũng không hợp lệ.

**Quy tắc đỡ của v1:** mỗi món nằm trên sàn hoặc được một món khác đỡ toàn bộ đáy. Món đỡ phải cho phép chịu tải; tổng tải phía trên được cộng dồn. Chưa cho phép bắc cầu lên nhiều món. Với cách hạ hàng từ trên xuống, kiểm tra đường đi và yêu cầu vật đỡ được đặt trước.

Đây là kiểm tra tính hợp lệ theo mô hình quy tắc. Nó chưa mô phỏng đầy đủ độ bền hộp, rung, rơi hoặc trượt khi giao hàng; quy cách bao bì vẫn cần được kho thử thực tế.

## 7. Ví dụ chạy tay từ đầu đến cuối

### 7.1. Dữ liệu giả lập

Để theo dõi chính xác các bước greedy, **ví dụ này chỉ cho phép hướng LWH cho cả ba item**, nghĩa là dài/rộng/cao lần lượt theo X/Y/Z; không thử hướng khác. Các số đo đã gồm phần bọc, chưa cộng khoảng hở thao tác bổ sung.

Trong fixture này, A1/A2 là hai áo thun đã gấp/bọc theo cùng hồ sơ size M; B1 là hộp phụ kiện có quy tắc giả lập `box_required=true`. Vì B1 yêu cầu thùng ngoài, nhánh túi bị loại. Số đo chỉ dùng minh họa, không phải quy cách chuẩn của áo hay hộp phụ kiện thực tế.

| Item | Kích thước hiệu dụng mm | Thể tích mm³ | Khối lượng hàng |
| ---- | ----------------------- | ------------ | --------------- |
| A1   | 200 × 100 × 80          | 1.600.000    | 250 g           |
| A2   | 200 × 100 × 80          | 1.600.000    | 250 g           |
| B1   | 100 × 100 × 100         | 1.000.000    | 200 g           |

| Thùng | Kích thước trong mm | Kích thước ngoài mm |
| ----- | ------------------- | ------------------- |
| S     | 220 × 120 × 100     | 230 × 130 × 110     |
| M     | 300 × 220 × 120     | 310 × 230 × 130     |
| L     | 400 × 300 × 200     | 410 × 310 × 210     |

Giả sử các thùng còn tồn và tải cho phép đủ. Các món không được đặt hàng khác lên trên trong fixture này; phương án dùng sàn nên không cần sức chịu tải chồng.

### 7.2. Lọc S và sắp thứ tự

Tổng thể tích hiệu dụng là `4.200.000 mm³`. S chỉ có `2.640.000 mm³`, nên không thể chứa toàn bộ hàng trong một kiện.

A1/A2 lớn hơn B1. A1 đứng trước A2 theo ID, nên thứ tự thử là **A1 → A2 → B1**.

### 7.3. Đặt vào M

**Đặt A1:** thùng trống, vị trí `(0, 0, 0)` hợp lệ. A1 kết thúc ở `(200, 100, 80)`.

**Đặt A2:** thử lại `(0, 0, 0)` thì bị overlap. Điểm tiếp theo trên hàng y = 0 là `(200, 0, 0)`, nhưng cạnh dài 200 khiến A2 kết thúc ở x = 400, vượt thùng M dài 300. Chuyển sang `(0, 100, 0)`: A2 kết thúc ở `(200, 200, 80)`, vừa thùng, nằm trên sàn và không giao A1.

**Đặt B1:** `(0, 0, 0)` bị A1 chiếm. Tại `(200, 0, 0)`, B1 kết thúc ở `(300, 100, 100)` nên hợp lệ. Vì tìm được chỗ trên sàn, không cần xét các điểm phía trên.

| Bước | Item | Góc đặt XYZ mm | Kích thước sau xoay mm |
| ---- | ---- | -------------- | ---------------------- |
| 1    | A1   | (0, 0, 0)      | 200 × 100 × 80         |
| 2    | A2   | (0, 100, 0)    | 200 × 100 × 80         |
| 3    | B1   | (200, 0, 0)    | 100 × 100 × 100        |

Validator kiểm tra đủ A1/A2/B1, trong biên, không overlap và cùng nằm trên đáy. M có phương án hợp lệ.

### 7.4. Vì sao chọn M thay vì L?

L cũng có thể xếp đủ ba món. Lượt greedy trong L có thể cho vị trí khác M: A2 vừa tại `(200, 0, 0)` vì thùng dài 400 mm. Thuật toán phải tính độc lập cho từng thùng, không sao chép tọa độ M rồi mặc định đó là kết quả greedy của L.

M có thể tích ngoài `310 × 230 × 130 = 9.269.000 mm³`, nhỏ hơn L là `410 × 310 × 210 = 26.691.000 mm³`. Cả hai đều một kiện, nên policy v1 ưu tiên M.

Tỷ lệ sử dụng thể tích trong M là `4.200.000 / (300 × 220 × 120) ≈ 53,03%`. Nếu khối lượng bì M là 180 g và vật tư dùng thêm 40 g, tổng kiện là `250 + 250 + 200 + 180 + 40 = 920 g`. Phần vật tư 40 g được tính một lần, không cộng lại vào khối lượng hàng trong ví dụ này.

Đây là kết quả giả lập kiểm tra logic. Tỷ lệ 53,03% không có nghĩa đã đạt tối ưu toàn cục hoặc chứng minh mức tiết kiệm vận chuyển.

### 7.5. Ví dụ thêm một đôi giày và một áo

Fixture riêng, toàn bộ số liệu giả lập:

| Item/bao bì                             | Kích thước dùng trong engine                                     | Khối lượng                      |
| --------------------------------------- | ---------------------------------------------------------------- | ------------------------------- |
| SH1 — đôi giày trong hộp gốc, đã bảo vệ | 330 × 220 × 120 mm                                               | 1.000 g, đã gồm giày và hộp gốc |
| T1 — áo đã gấp/bọc                      | 280 × 200 × 40 mm                                                | 250 g, đã gồm túi bọc áo        |
| Thùng giao hàng ngoài                   | Trong thùng: 350 × 240 × 180 mm                                  | Bì thùng: 200 g                 |
| Vật tư chèn thêm                        | Theo quy cách demo, không thay đổi kích thước hiệu dụng hai item | 30 g                            |

Giả sử chỉ cho hướng LWH, thùng còn tồn, tải hàng/tổng kiện đều đủ và hộp SH1 được phép đỡ T1 với tải tối đa 300 g theo quy cách giả lập. Greedy xét SH1 trước vì thể tích lớn hơn, đặt SH1 tại `(0, 0, 0)`. T1 không vừa các điểm cạnh hộp trên sàn, nhưng vừa tại `(0, 0, 120)`: toàn bộ đáy áo được hộp đỡ và mặt trên kết thúc ở z = 160 mm, thấp hơn thùng 180 mm.

Tổng khối lượng kiện là `1.000 + 250 + 200 + 30 = 1.480 g`; không cộng hộp giày lần hai. Đây là phương án mẫu đã tính theo quy tắc, không phải xác nhận sức chịu tải hộp thật. Nếu profile hộp chưa có tải chồng hoặc chỉ cho dưới 250 g, placement T1 trên hộp phải bị loại; thử thùng khác đủ đặt cạnh nhau hoặc chuyển xem lại.

Nếu đơn có thêm một đôi giày, engine phải thêm instance SH2 và tính lại toàn bộ. Không tự chồng hộp thứ hai lên SH1, không gộp hai đôi thành một khối không có số đo và không tự tách nhiều kiện trước khi luồng fulfillment hỗ trợ.

## 8. Ví dụ nhánh túi và pseudocode tổng thể

### 8.1. Đơn chỉ có hai áo thun

Một đơn khác chỉ có A1/A2, không có B1. Giả sử kho đã thử và duyệt quy cách `FIT-2TEE-M-v1`: đúng hai item dùng hồ sơ `TEE-M-FOLD-v1`, mỗi item có túi bọc riêng, gói cùng trong túi giao hàng `MAILER-M` và đóng kín được. Đây là dữ liệu demo, không phải kích thước túi chuẩn của ngành.

Backend kiểm tra tổ hợp hàng khớp quy cách, túi còn tồn, hồ sơ còn hiệu lực và tải cho phép phù hợp. Sau đó tạo candidate loại `mailer` gồm mã túi, ID từng áo, quy cách/version và các bước gói; không tạo tọa độ XYZ giả.

Giả sử vật tư đã biết: túi ngoài 1.200 VND và hai túi bọc áo tổng 400 VND, thành 1.600 VND. Phương án thùng hợp lệ có thùng 6.000 VND và cùng hai túi bọc 400 VND, thành 6.400 VND, không cần vật tư thêm theo fixture. Policy vật tư ưu tiên túi, giảm 4.800 VND **riêng vật tư**. Cước và tổng chi phí vẫn chưa biết.

Nếu đổi một áo sang size XL hoặc thêm một thắt lưng, quy cách hai áo size M không còn khớp. Không tự khẳng định túi chật hay vừa: đánh dấu nhánh túi chưa đánh giá tổ hợp mới, thử quy cách khác hoặc thùng.

### 8.2. Pseudocode

```text
recommend(order):
    input = normalize_fashion_items_and_profiles(order)
    candidates = []

    if mailer_branch_enabled:
        if any_item_requires_outer_box(input):
            mailer_status = ineligible
        else:
            recipes = find_exact_approved_recipes(input.item_profiles)
            mailer_status = not_evaluated_if_no_matching_recipe
            for recipe in recipes:
                candidate = build_mailer_candidate(input, recipe)
                if validate_mailer(input, candidate).has_no_violations:
                    candidates.append(candidate)

    deadline = start_shared_box_search_budget()
    items = sort_by_volume_then_largest_edge_then_id(input.items)

    for box in eligible_boxes_in_stable_order(input):
        if deadline_expired():
            break
        placed = []
        for item in items:
            placement = find_first_valid_position_and_orientation(
                item, box, placed, deadline
            )
            if placement_missing_or_search_stopped(placement):
                break
            placed.append(placement)

        if every_item_was_placed(placed, items):
            candidate = build_box_candidate(box, placed, input.materials)
            if validate_box(input, candidate).has_no_violations:
                candidates.append(candidate)

    if candidates_is_empty():
        return no_solution_found_with_branch_statuses()

    return rank_candidates_with_available_costs_and_policy(candidates)
```

Validator túi kiểm tra đúng toàn bộ tổ hợp profile/version/số lượng, item không thiếu/trùng, tương thích bao bì, quy cách bảo vệ, tải và vật tư. Validator thùng kiểm tra thêm tọa độ, overlap, support và thứ tự đặt. Cả hai không được phép bỏ một món khỏi đơn để tạo phương án rẻ hơn.

Thiếu dữ liệu sản phẩm là lỗi tiền xử lý. Không có quy cách túi là chưa đánh giá được nhánh túi; worker lỗi là lỗi hệ thống. Các trạng thái này không phải bằng chứng đơn hàng vô nghiệm. Nếu solver thùng timeout, chỉ dùng candidate hoàn chỉnh đã kiểm tra; candidate túi hợp lệ đã có vẫn có thể trả kèm giới hạn tìm kiếm nhánh thùng.

## 9. Vì sao còn cần multi-start và local search?

### 9.1. Điểm yếu của greedy

Greedy có thể đặt một món vào chỗ hợp lệ ngay bây giờ nhưng làm mất chỗ của món sau. Nó cũng chỉ xét tập điểm ứng viên đã định nghĩa, nên có thể bỏ lỡ một cách xếp khác.

Vì vậy, “lượt greedy thất bại” chỉ có nghĩa **chưa tìm được cách xếp bằng lượt thử đó**. Không được kết luận chắc chắn đơn không có lời giải.

### 9.2. Multi-start: thử nhiều thứ tự

Thay vì chỉ thử thể tích giảm dần, chạy thêm thứ tự theo cạnh lớn nhất và diện tích đáy giảm dần. Mỗi lượt bắt đầu lại từ thùng rỗng và có thể tìm ra cách xếp khác.

Ví dụ các lượt có thể là A → B → C, B → A → C và C → A → B. Một lượt thất bại không loại kết quả hợp lệ của lượt trước; luôn giữ phương án tốt nhất đã tìm được.

Các lượt chia sẻ một ngân sách thời gian chung. Không cấp lại toàn bộ 2 giây cho từng lượt rồi để tổng thời gian tăng không giới hạn.

### 9.3. Local search: thay đổi nhỏ rồi xếp lại

Sau các lượt ban đầu, thử đổi chỗ hai item trong thứ tự hoặc chuyển một item sang vị trí khác, rồi chạy lại quá trình đóng cả thùng. Mục tiêu là tìm được thùng nhỏ hơn hoặc phương án được policy ưu tiên hơn.

Không chỉ di chuyển một khối trên kết quả cũ rồi giữ nguyên mọi thứ mà bỏ qua kiểm tra. Bất kỳ candidate mới nào cũng phải qua validator.

**Bản cải thiện chỉ được dùng khi benchmark cho thấy có ích:** giải thêm được đơn, giảm thể tích thùng/chi phí theo policy hoặc giảm thời gian mà không làm xuất hiện phương án sai. Giữ greedy-v1 làm mốc so sánh.

## 10. Phần nào là AI?

**Greedy, multi-start và local search ở trên là thuật toán tìm kiếm tối ưu hóa; chúng không tự học từ dữ liệu.** Đây là nền cho chức năng đóng gói của OptiPackAI.

Thành phần machine learning được đề xuất ở giai đoạn sau là **xếp hạng những phương án đã hợp lệ**. Khi có lịch sử thời gian đóng, số lần đổi phương án và vật tư thực dùng, mô hình có thể dự đoán phương án nào dễ thao tác hoặc nhanh hơn.

Ví dụ engine tạo ba cách xếp hợp lệ. Mô hình dự đoán thời gian thao tác cho từng cách; hệ thống dùng dự đoán cùng policy để ưu tiên cách phù hợp. Validator vẫn kiểm tra tính hợp lệ; mô hình không được tự cho phép vượt tải hoặc đặt hàng xuyên nhau.

Không cần LLM/ChatGPT để tính tọa độ bản đầu. Nếu dùng LLM về sau để diễn đạt lời giải thích, dữ liệu giải thích phải lấy từ kết quả đã kiểm tra. Không để mô hình tự bịa kích thước, tải hoặc giá cước.

## 11. Backend dùng thuật toán này như thế nào?

1. Nhận yêu cầu recommendation theo ID đơn.
2. Đọc đơn, hồ sơ gấp/bọc đúng biến thể, catalog túi/thùng/vật tư, quy cách túi và policy.
3. Chuẩn hóa, xét quy cách túi và gửi dữ liệu thuần vào worker để tìm cách xếp thùng.
4. Kiểm tra kết quả, xếp hạng và lưu snapshot cùng engine version.
5. Trả `package_type=box` kèm placement hoặc `package_type=mailer` kèm quy cách gói; cả hai có danh sách item, vật tư, lý do và trạng thái từng nhánh.
6. Khi nhân viên xác nhận, kiểm tra lại dữ liệu/tồn kho vì chúng có thể đã thay đổi sau lúc tính.

Worker là cách tổ chức thực thi để công việc tìm kiếm nặng CPU không chiếm vòng xử lý HTTP của NestJS; nó không làm thuật toán tự tìm nghiệm tốt hơn. Giới hạn prototype trong roadmap là 30 đơn vị hàng, 20 loại thùng và ngân sách solver 2 giây, cần đo lại trên máy chạy thật.

## 12. Những giới hạn cần nhớ khi triển khai

- Mô hình khối hộp chưa xử lý chính xác vật thể cong, túi mềm hoặc hàng có thể nén.
- Với quần áo, khối hộp chỉ bao quanh một trạng thái gấp/bọc đã đo; thuật toán v1 không mô phỏng vải biến dạng. Nhánh túi dùng quy cách vừa túi đã xác minh, tách khỏi phép kiểm tra thùng.
- Xoay vuông góc không bao gồm mọi góc xoay có thể làm ngoài đời.
- Quy tắc một vật đỡ toàn đáy chủ động bỏ qua một số cách chồng phức tạp.
- Vừa trong mô hình chưa chứng minh nhân viên thao tác thoải mái; phải khai độ hở và thử đóng thật.
- Một kiện không giải được chưa có nghĩa nhiều kiện cũng không giải được.
- Thùng nhỏ hơn không tự động có cước thấp hơn; bản có biểu phí cần tối ưu chi phí theo cả đơn.
- Độ chính xác số đo, thuật toán tìm kiếm và khả năng bảo vệ hàng là ba phần cần kiểm tra riêng.

Để bắt đầu code, đọc tiếp [roadmap backend](BE_PACKAGING_IMPLEMENTATION_ROADMAP.md), đặc biệt **M0–M3**: chốt contract/fixture → chuẩn hóa dữ liệu → validator → greedy baseline. Phần ý tưởng sản phẩm, chi phí và các hướng nghiên cứu rộng hơn nằm trong [tài liệu tổng thể](AI_3D_PACKAGING_OPTIMIZATION.md).
