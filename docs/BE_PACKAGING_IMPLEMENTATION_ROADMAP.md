# Backend roadmap — Triển khai và cải thiện thuật toán 3D Packaging

Cập nhật: **09/09/2026**. Phạm vi: **backend OptiPackAI**, bao gồm engine, dữ liệu, API, kiểm thử, benchmark và vận hành. Không triển khai frontend, viewer 3D, mobile, camera hoặc robot trong roadmap này.

Tài liệu này cụ thể hóa [tài liệu ý tưởng tổng thể](AI_3D_PACKAGING_OPTIMIZATION.md). Các module, interface và endpoint bên dưới là **kế hoạch triển khai**, chưa tồn tại trong code. Mã công việc `BE-Pxx` là nhãn nội bộ của tài liệu, không phải Jira ticket đã tạo.

**Đích backend cho ngành hàng:** từ đơn quần áo/giày/phụ kiện, trả túi hoặc thùng phù hợp với hồ sơ gấp/bọc, vật tư và danh sách item truy vết được. Prototype M4 kiểm chứng nhánh thùng; M4A bổ sung chọn túi theo quy cách đã duyệt trước pilot M6. Mỗi loại có validator riêng, sau đó mới cải thiện bằng benchmark và ML.

## 1. Hướng triển khai mặc định và hiện trạng

**Danh mục áp dụng: quần áo, giày và phụ kiện thời trang.** Dữ liệu được tổ chức theo đồ mềm gấp được, đồ cần giữ phom/nếp, phụ kiện mềm và phụ kiện có hộp/bảo vệ bề mặt. Tên sản phẩm mẫu là minh họa, không phải danh sách SKU đã nhập vào hệ thống.

M0/M1 xây hồ sơ gấp/bọc theo SKU/size/biến thể, phiên bản số đo, điều kiện dùng túi, yêu cầu thùng ngoài, giữ phom và chồng hàng. V1 dùng một hồ sơ đã duyệt cho mỗi biến thể; không tự nén hàng hoặc suy kích thước từ size. Khối hộp chỉ là mô hình của trạng thái hàng sau gấp/bọc.

Hai nhánh nghiệp vụ: `box` dùng greedy 3D trên gói hàng chuẩn hóa; `mailer` chọn túi bằng quy cách khớp toàn bộ tổ hợp profile/version/số lượng đã được thử. Hộp bảo vệ item không tự đồng nghĩa bắt buộc thùng ngoài. Xem [giải thích thuật toán](GIAI_THICH_THUAT_TOAN_3D_PACKAGING.md) cho quy tắc phân nhánh và hai ví dụ.

Từ M0, định nghĩa kết quả phân biệt `package_type` để không phải sửa hợp đồng thùng khi thêm túi ở M4A. Tọa độ XYZ/inner dimensions chỉ thuộc nhánh box; nhánh mailer trả mã túi, fit profile/version, item và bước gói. Snapshot, cost, tồn kho và confirmation hỗ trợ cả hai.

### Giày và hộp giày trong phạm vi backend

Giữ nguyên giày trong hộp sản phẩm ở v1. Một đơn vị bán là một đôi giày có hộp được chuẩn hóa thành một `PackingItem` duy nhất. ID item nguồn vẫn là định danh giao hàng; hộp gốc là thành phần của profile, không phải thêm một item cần giao hoặc một thùng ngoài.

Profile giày cần: SKU/biến thể, phiên bản hộp gốc, kích thước ngoài sau bảo vệ, hướng nắp được phép, tải chồng đã xác minh, khối lượng giày + hộp và phần bảo vệ đã gồm/chưa gồm. Chốt một giá trị khối lượng hiệu dụng cho engine từ các thành phần có nguồn rõ; không cộng bì hộp gốc hai lần. Trừ tồn chỉ cho vật tư mới cấp như thùng ngoài, túi giao, chèn hoặc hộp thay thế.

Mặc định đề xuất cho pilot: giữ hộp gốc, dùng thùng ngoài (`box_required=true`), không tận dụng khoảng trống trong hộp, không tách hai chiếc và không giao trực tiếp bằng hộp gốc. Ngoại lệ túi ngoài cần profile cho phép và fit đã duyệt đúng tổ hợp; validator giữ các yêu cầu bảo vệ hộp. Thiếu thông số chồng thì không cho vật khác nằm trên hộp.

Phần này thuộc M0–M3/P01–P05, không để giày thành một tính năng mở rộng sau MVP. M4A kiểm tra thêm quy cách túi nếu có; M6 phát hiện thay phiên bản/số đo hộp trước confirm.

### 1.1. Những lựa chọn dùng để lập kế hoạch

| Vấn đề            | Hướng đề xuất                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Engine đầu tiên   | TypeScript thuần, nằm trong module packaging, không phụ thuộc NestJS/Mongoose ở lõi            |
| Bài toán đầu tiên | Offline, một đơn, một thùng; gói quần áo/giày/phụ kiện chuẩn hóa bằng khối hộp không biến dạng |
| Cách xếp ban đầu  | Greedy thử điểm đặt tại các tọa độ mặt khối, kiểm tra từng bước                                |
| Cải thiện lần một | Nhiều thứ tự item, local search có giới hạn, giữ nghiệm tốt nhất                               |
| Cải thiện lần hai | Multi-parcel có điều kiện, xếp hạng theo tổng chi phí                                          |
| AI học từ dữ liệu | Ranker sau khi có dữ liệu thao tác và baseline đo được                                         |
| Thực thi HTTP     | API đồng bộ có giới hạn thời gian, solver chạy trong worker pool                               |
| Đơn vị nội bộ     | Kích thước mm nguyên, khối lượng g nguyên, tiền VND nguyên                                     |
| Kết quả           | Phương án tốt nhất tìm được; không tuyên bố tối ưu toàn cục                                    |

Đây là mặc định **đề xuất cho prototype**, không thay thế quyết định kiến trúc bằng một thay đổi code ngầm. Hướng dẫn repo hiện chưa chốt JS/Python; hoàn tất benchmark prototype rồi ghi quyết định trước khi tích hợp engine vào API. Python/OR-Tools vẫn là phương án nghiên cứu nếu bằng chứng cho thấy cần thiết.

### 1.2. Những điểm phải bám code hiện tại

- [OrdersModule](../be/src/modules/orders/orders.module.ts) đã export `OrdersService`; packaging lấy dữ liệu đơn qua service, không đăng ký lại schema Orders trong module mình.
- [OrderItem](../be/src/modules/orders/schemas/order.schema.ts) chưa có số đo và khối lượng. Phải bổ sung catalog đóng gói SKU và mapping; không lấy dòng đã gộp ở response làm danh tính vật lý.
- Route Orders đang giới hạn `ADMIN`. API packaging cần quyền riêng; không mở quyền đồng bộ Lazada cho nhân viên đóng gói.
- [AppException](../be/src/common/exceptions/app-exception.ts) và global exception filter đã định dạng lỗi theo `error_code`. Giữ cơ chế này cho module mới.
- [Backend package](../be/package.json) khai NestJS 11, Mongoose `^9.9.2`, Jest 30, ts-jest 29; phiên bản khai báo không đồng nghĩa mọi tổ hợp đã được kiểm chứng. Chạy test smoke trước khi dựa vào test harness.
- Script lint backend có `--fix`. Khi cần kiểm tra không sửa file, dùng ESLint trực tiếp không có `--fix`.
- Build hiện ra `dist`, script production gọi `dist/src/main.js`; worker phải được kiểm tra bằng output build thực tế, không giả định đường dẫn `.ts` dùng được khi deploy.

## 2. Roadmap theo giai đoạn và tiêu chí hoàn thành

| Mốc | Công việc                                           | Đầu ra review được                                               | Điều kiện đi tiếp                                                  |
| --- | --------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| M0  | Chuẩn hóa bài toán, contract, fixture, test harness | Input/output box/mailer, policy v1, fixture thời trang có đáp án | Không còn mơ hồ đơn vị, ID item, điều kiện đủ để đóng              |
| M1  | Catalog và chuẩn hóa đầu vào                        | Hồ sơ gấp/bọc theo biến thể, catalog bao bì/vật tư, snapshot     | Không lẫn size/shop; không tự nén hoặc dùng số đo chưa duyệt       |
| M2  | Validator hình học                                  | Lõi kiểm tra thuần TS và unit test                               | Biên, overlap, xoay, tải, support, thứ tự đều được kiểm tra        |
| M3  | Greedy baseline một kiện                            | Engine `greedy-v1`, CLI benchmark                                | Tìm được fixture mẫu; mọi nghiệm trả ra hợp lệ                     |
| M4  | API, worker, snapshot và phân quyền                 | Recommend/get/readiness API, Swagger, integration test           | Gọi API end-to-end không cần FE; không chặn event loop bằng solver |
| M4A | Chọn túi và phân nhánh bao bì                       | Fit profile, mailer validator, kết quả box/mailer                | Đúng tổ hợp đã duyệt; không suy dung tích từ túi phẳng             |
| M5  | Multi-start và local search                         | Engine `search-v2`, báo cáo so sánh v1/v2                        | Có cải thiện đo được, không phá bộ ca bảo vệ                       |
| M6  | Xác nhận và phản hồi                                | Idempotency, kiểm tra revision, cập nhật vật tư nguyên tử        | Đồng thời/hủy/thử lại không gây trừ trùng hoặc dùng dữ liệu cũ     |
| M7  | Nhiều kiện và chi phí đầy đủ                        | Engine `multi-parcel-v3`, hợp đồng fulfillment                   | Không thiếu/trùng item; số kiện và tracking xử lý được             |
| M8  | Ranker ML và pilot                                  | Dataset, mô hình phiên bản hóa, baseline fallback                | Kết quả tốt trên tập giữ lại và pilot, đủ để biện minh vận hành    |

**Prototype API thùng dừng ở M4; MVP API phù hợp ngành hàng dừng ở M4A. MVP vận hành có xác nhận dừng ở M6.** M5 tăng chất lượng; M7/M8 không phải điều kiện để hoàn tất một bản backend đầu tiên dùng được.

Thứ tự ưu tiên thực tế: M0 → M1 → M2 → M3 → M4 → M4A → M5 → M6. Chỉ bắt đầu M7 khi fulfillment sẵn sàng; chỉ bắt đầu M8 khi có dữ liệu đủ để đánh giá. Không đặt lịch tuần cố định khi chưa có số đo và benchmark đầu tiên.

## 3. M0–M1: Hợp đồng dữ liệu và nền tảng catalog

### 3.1. Hợp đồng engine

Chỉ truyền plain object vào worker. Không truyền Mongoose document, HTTP request, service instance hoặc thông tin định danh khách hàng.

| Type đề xuất       | Dữ liệu cần có                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `PackingItem`      | `item_key`, ID nguồn, SKU/biến thể, packing profile/version, kích thước sau gấp/bọc, khối lượng, hướng, giữ phom/chồng/tương thích bao bì |
| `PackingBox`       | ID/version, kích thước trong dùng được và kích thước ngoài, bì, tải hàng, giới hạn tổng kiện, giá, tồn khả dụng                           |
| `PackingPolicy`    | ID/version, giới hạn item/thùng/kiện, thời gian, thứ tự ưu tiên, quy tắc ổn định và bọc                                                   |
| `PackingInput`     | Item[], box[], snapshot vật tư, policy, input revision                                                                                    |
| `Placement`        | Item key, box instance, góc XYZ, kích thước sau xoay, orientation, step, vật đỡ nếu có                                                    |
| `PackingCandidate` | Parcel[] có `package_type`: box có placement; mailer có fit profile/version, item và bước gói; cả hai có vật tư/chi phí/lý do             |
| `PackingResult`    | Status, candidates, lý do không tìm được, thời gian, engine version, cờ hết ngân sách                                                     |

Hợp đồng lõi: `solve(input, searchControl) -> PackingResult`; adapter worker cung cấp API bất đồng bộ cho NestJS. Validator: `validate(input, candidate) -> violations[]`, trong đó mỗi vi phạm có mã và item/parcel liên quan.

Đầu vào dùng mm/g nguyên dương, kiểm tra `Number.isSafeInteger` và giới hạn nghiệp vụ trước khi tính thể tích. Đề xuất giới hạn prototype: 30 item, 20 loại thùng, mỗi cạnh tối đa 5.000 mm. Ngưỡng này là cấu hình server, không cho client tăng tùy ý. Thể tích tích lũy cũng phải nằm trong miền số nguyên an toàn.

### 3.2. Catalog tối thiểu

- Hồ sơ SKU/biến thể: số đo hàng sau gấp, quy trình gấp/bọc, kích thước hiệu dụng, khối lượng, hướng mặt, tải chồng, giữ phom, điều kiện dùng túi, yêu cầu thùng ngoài và version/người duyệt. Ghi rõ phần bao bì đã được tính để tránh cộng trùng.
- Mapping: `(platform, shop_id, sku, variation)` → hồ sơ; chuẩn hóa `variation` rỗng thống nhất và unique index theo tuple. Không nối chuỗi bằng dấu phân cách để tạo khóa có thể va chạm.
- Thùng: kích thước trong/ngoài, lót cố định, khối lượng bì, giới hạn tải với nghĩa rõ, giá, tồn khả dụng, active/version.
- Túi giao hàng: mã, kích thước phẳng để nhận diện, khối lượng bì, giá/tồn và quy cách fit. Quy cách fit lưu đúng tổ hợp packing profile/version/quantity đã thử, cách gói và đóng kín; không suy rộng sang tổ hợp chưa thử.
- Vật tư: quy cách, đơn vị sử dụng, giá và khối lượng quy đổi. Công thức bọc trả kích thước hiệu dụng và lượng vật tư; validator/cost dùng cùng snapshot quy cách, không suy lượng giấy từ thể tích trống.
- Policy: version bất biến sau khi dùng; đổi quy tắc tạo version mới. Chưa cần API sửa trọng số tùy ý cho nhân viên.

Mongoose dùng field `snake_case`, sub-schema cụ thể, `HydratedDocument`, soft delete theo hướng dẫn repo. Tách version nội dung đóng gói khỏi thay đổi metadata không liên quan. Chưa cần import CSV trong MVP nếu CRUD và fixture seed đủ để chạy thử.

### 3.3. Xây snapshot từ Orders

Thêm phương thức đọc chuyên biệt vào `OrdersService`, trả projection tối thiểu cho packaging. M0–M6 chỉ cho đơn `PENDING` và item `PENDING` được xét; item canceled loại bỏ. Các item ở trạng thái khác trong cùng đơn khiến luồng tự động yêu cầu xem lại, tránh đóng lại item đã xử lý. Không tái sử dụng tập `UNFULFILLED_ORDER_STATUSES`, vì tập đó phục vụ consolidation và có cả unpaid/packed.

Giữ từng `platform_order_item_id`. Nếu nguồn tương lai lưu quantity lớn hơn một, mở rộng thành từng instance có ordinal. Khi quantity không hợp lệ hoặc không còn item cần đóng, trả lỗi nghiệp vụ.

`input_revision` dựa trên nội dung ảnh hưởng đóng gói đã canonicalize: item ID/status/quantity, mapping và phiên bản số đo, thùng/vật tư được xét, policy. Không hash thời điểm sync đơn thuần hoặc thông tin khách hàng không liên quan. Lưu snapshot để đọc lại lịch sử mà không phải tính lại bằng catalog hiện tại.

**Nghiệm thu M1:** cùng SKU khác shop không lẫn dữ liệu; sai đơn vị bị phát hiện; số đo thiếu không dùng mặc định; hai unit cùng SKU vẫn có hai key; canceled không nằm trong snapshot giao hàng.

### Bổ sung M0–M6: hàng dễ vỡ, chống sốc và trang sức

Yêu cầu thiết kế bổ sung **11/09/2026**, xem [quy cách bảo vệ và ví dụ trang sức](AI_3D_PACKAGING_OPTIMIZATION.md#hang-de-vo-chong-soc). Đây là backlog triển khai, chưa phải khả năng hiện có của backend.

- **M0–M1:** bổ sung yêu cầu dễ vỡ, chống sốc, chống trầy, cấm đè/tải chồng và giới hạn bao bì vào hồ sơ SKU/biến thể; liên kết quy cách bảo vệ có phiên bản, vật liệu/định lượng, số đo sau bảo vệ và trạng thái duyệt. Phân biệt vật tư đã nằm trong gói với vật tư cấp thêm để tránh cộng khối lượng/chi phí hai lần.
- **M2–M3:** validator và engine dùng kích thước hiệu dụng sau bảo vệ; giữ khoảng đệm riêng chưa tính vào khối item, kiểm tra chồng và tương thích quy cách. Chỉ xếp hạng chi phí sau khi phương án qua các ràng buộc bảo vệ.
- **M4–M4A:** snapshot lưu quy cách/version, vật tư và hướng dẫn thao tác; trả lý do cần xử lý thủ công khi thiếu hồ sơ hoặc không tìm được phương án phù hợp. Túi chỉ được xét nếu hồ sơ và quy cách tổ hợp đã xác minh cho phép.
- **M6:** khi xác nhận, kiểm tra lại phiên bản và tồn vật tư bảo vệ; cấp phát vật tư bổ sung theo cơ chế nguyên tử/idempotency hiện hành.

Các ca nghiệm thu cần bổ sung vào fixture/benchmark:

| Ca | Kết quả mong đợi |
| --- | --- |
| Trang sức có hộp, lớp lót và chống sốc đã duyệt | Xếp theo số đo sau bảo vệ, xuất đủ vật tư và thứ tự thao tác |
| Sản phẩm trần vừa hộp nhưng gói sau bảo vệ không vừa | Loại hộp đó, không tự giảm đệm |
| Đóng chung với item có quy tắc cấm đè | Không đặt món khác lên item được bảo vệ |
| Có cờ dễ vỡ nhưng thiếu quy cách đã duyệt | Yêu cầu xử lý thủ công, không tự đoán lớp chống sốc |
| Thiếu vật tư bảo vệ bắt buộc | Không xác nhận phương án thiếu bảo vệ; trả lý do cụ thể |
| Khối lượng đã bao gồm hộp và đệm của item | Không cộng lại; vẫn tính vật tư bổ sung ở cấp kiện |
| Túi vừa hình học nhưng hồ sơ không cho phép | Loại túi dù giá thấp hơn thùng |

## 4. M2: Viết validator trước engine

### 4.1. Các hàm thuần cần có

1. Sinh orientation từ tập hướng được phép; loại hoán vị kích thước trùng nhưng giữ đúng nghĩa mặt UP.
2. Kiểm tra khối trong biên thùng, dùng `x + dx <= L` và tương tự cho Y/Z.
3. Kiểm tra overlap AABB; chạm mặt hợp lệ, giao phần thể tích dương bị loại.
4. Kiểm tra đủ item đúng một lần trên toàn candidate, kích thước đúng profile/orientation và không có item lạ.
5. Kiểm tra khối lượng hàng, bì và vật tư với từng loại giới hạn tương ứng.
6. Kiểm tra support, tải chồng và cấm đi chung.
7. Kiểm tra thứ tự: vật đỡ phải được đặt trước; đường hạ thẳng đứng qua miệng thùng không xuyên vật đã đặt.

**Support v1:** nằm trên sàn hoặc toàn bộ đáy được đỡ bởi một item có mặt trên cùng độ cao và được phép chịu tải. Không cho bắc cầu qua nhiều item. Thiếu dữ liệu chịu tải đồng nghĩa không đặt vật khác lên. Cộng dồn tải của các descendants trong cây đỡ; cấm self-reference và chu trình. Khối lượng dùng cho tải gồm phần bọc gắn với vật đó.

Hướng đơn giản này có thể bỏ lỡ cách xếp khả thi ngoài đời. Nó là chính sách prototype, không phải mô phỏng đầy đủ độ bền carton hay rung/rơi khi giao.

### 4.2. Bộ ca phải có

Biên vừa đúng; lấn 1 mm; chỉ vừa khi xoay; cấm lật; thể tích đủ nhưng cạnh không vừa; hai item lặp ID; item thiếu; floating; bridge; quá tải cộng dồn; đường đưa vào bị chắn; item nằm ngoài thùng; giới hạn do bì/vật tư.

Validator không gọi lại heuristic để xác định kết quả đúng. Test kiểm tra quy tắc và đáp án fixture, không chỉ assert rằng output giống chính implementation.

## 5. M3: Greedy baseline có thể tái hiện

### 5.1. Cách sinh và chọn vị trí

Để prototype dễ viết và kiểm tra, dùng **điểm ứng viên từ các tọa độ mặt khối**, chưa tuyên bố đây là triển khai chuẩn của một thuật toán Extreme Points cụ thể:

```text
X = {0} và các tọa độ x + dx của item đã đặt
Y = {0} và các tọa độ y + dy của item đã đặt
Z = {0} và các tọa độ z + dz của item đã đặt

Thử các điểm trong X × Y × Z theo thứ tự z, y, x tăng dần.
Với mỗi điểm, thử orientation theo thứ tự ổn định.
Loại điểm ngoài biên, lặp hoặc bước đặt vi phạm validator.
Chọn bước hợp lệ có tuple (z, y, x, orientation_id) nhỏ nhất.
```

Duyệt lười và kiểm tra deadline trong các vòng lặp; không tạo toàn bộ tích Descartes lớn khi không cần. Danh sách điểm chỉ là không gian tìm kiếm heuristic, không bao phủ mọi placement có thể tồn tại.

V1 sắp item theo thể tích hiệu dụng giảm dần, hòa thì cạnh lớn nhất giảm dần, rồi `item_key`. Với mỗi loại thùng còn tồn và qua điều kiện cần, chạy lại từ thùng rỗng. Không loại thùng chỉ bằng thể tích rồi coi các thùng còn lại chắc chắn vừa.

Khi một item không đặt được, lượt thử đó thất bại; không trả các item đã đặt thành một recommendation hoàn chỉnh. Xác thực toàn bộ candidate ở cuối bằng validator độc lập.

### 5.2. Xếp hạng giữa các thùng

M3 chưa tích hợp cước thật. Mọi phương án dùng một kiện nên so tuple: **thể tích ngoài → chi phí vật tư đã biết → mã thùng → signature placement**. Chi phí shipping/total để `null`; chưa tuyên bố tiết kiệm cước.

Lưu candidate signature từ thùng, item key, vị trí và hướng sau canonicalization để loại kết quả trùng. Tối đa ba candidate được trả; không lặp cùng phương án chỉ để đủ số lượng.

### 5.3. Giới hạn và kết quả

Ngân sách mặc định đề xuất: solver 2.000 ms, 30 unit, 20 loại thùng. Cùng fixture/policy/seed và **ngân sách số bước** cho kết quả tái hiện; wall-clock timeout có thể dừng ở bước khác khi tải máy khác. Benchmark cần lưu cả số bước đã xét lẫn thời gian.

`feasible` nghĩa có ít nhất một candidate hợp lệ. `no_solution_found` nghĩa chưa tìm được trong không gian/ngân sách đã thử, không phải chứng minh vô nghiệm. Cờ `search_budget_exhausted` độc lập với hai trạng thái đó.

**Nghiệm thu M3:** fixture A1/A2/B1 của tài liệu tổng thể được xếp hợp lệ vào M; validator độc lập xác nhận; thay đổi thứ tự input không thay kết quả khi policy sort cố định; có báo cáo thất bại và thời gian.

## 6. M4: NestJS API, worker và lưu recommendation

### 6.1. Ranh giới module đề xuất

```text
be/src/modules/packaging/
  domain/          contracts, normalization, rules, validator
  engine/          candidate points, greedy, ranking, search control
  workers/         worker entry, bounded pool, message contract
  services/        catalog, snapshot, recommendation, cost
  schemas/         profiles, mappings, boxes, materials, recommendations
  dto/             request validation và response DTO
  packaging.controller.ts
  packaging.module.ts
  packaging.errors.ts
```

Đăng ký `PackagingModule` vào AppModule; import OrdersModule để dùng service đã export. Lõi engine dùng import tương đối để worker JavaScript đã build không phụ thuộc alias chỉ được ts-node xử lý.

### 6.2. API tối thiểu

| Route đề xuất                              | Quyền                  | Hành vi                                                                  |
| ------------------------------------------ | ---------------------- | ------------------------------------------------------------------------ |
| `GET /packaging/orders/:orderId/readiness` | ADMIN, PACKAGING_STAFF | Kiểm tra điều kiện đơn/số đo; trả thiếu gì, không lộ PII không cần thiết |
| `POST /packaging/recommend`                | ADMIN, PACKAGING_STAFF | Nhận order_id, policy_id, max_candidates; backend dựng input             |
| `GET /packaging/recommendations/:id`       | ADMIN, PACKAGING_STAFF | Đọc snapshot/candidate đã lưu, không tự chạy lại                         |
| CRUD `/packaging/catalog/...`              | ADMIN                  | Quản lý profile, mapping, boxes, materials; DELETE là soft delete        |

Giữ các ID Mongo theo convention hiện hữu, validate ở biên. Query catalog có limit/cursor, index thiết kế cùng query. Recommendation list nếu thêm sau dùng `(order_id, created_at, _id)` làm cơ sở phân trang ổn định.

DTO/catalog/persistence dùng tên rõ đơn vị; public packaging DTO đề xuất `snake_case` nhất quán với ví dụ docs. Không sửa hợp đồng camelCase hiện hữu của Orders chỉ để đồng nhất một module mới.

### 6.3. Worker và ngân sách vận hành

Worker threads phù hợp công việc JavaScript nặng CPU; Node khuyến nghị pool cho công việc lặp thay vì tạo worker mới cho từng request. Tham khảo [Node.js worker_threads](https://nodejs.org/api/worker_threads.html). Chỉ dùng API tương thích runtime dự án, không mặc định tất cả API mới trên trang docs đều khả dụng.

Đề xuất môi trường pilot: một worker hoạt động mỗi instance API, hàng chờ tối đa 8 job; chờ quá 1 giây trả `PACKAGING_BUSY`. Solver tự kiểm tra deadline 2 giây. Parent có watchdog 3 giây kể từ khi dispatch để terminate và thay worker nếu không phản hồi. Các ngưỡng là giá trị khởi đầu cần benchmark, không phải SLA đã đo.

Worker gửi incumbent **hoàn chỉnh đã kiểm tra** khi cải thiện. Nếu hết deadline có incumbent thì parent kiểm tra lại rồi trả; worker crash không có kết quả dùng được thì lỗi hệ thống, không đổi thành “không xếp được”. Dọn listener/timer đúng một lần; shutdown dừng nhận job, giải quyết/reject job chờ và đóng worker.

Viết smoke test sau `build`: xác nhận file worker `.js` tồn tại tại đường dẫn adapter resolve và chạy được một fixture. Unit test import solver trực tiếp không chứng minh worker production chạy đúng.

### 6.4. Mã lỗi và kết quả tìm kiếm

| Tình huống                                     | HTTP / mã đề xuất                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| Request sai/giới hạn vượt                      | 400 qua validation hoặc `PACKAGING_INPUT_LIMIT`                      |
| ID đúng dạng nhưng không có đơn/recommendation | 404 `PACKAGING_RESOURCE_NOT_FOUND`                                   |
| Đơn không đủ điều kiện hoặc dữ liệu đã đổi     | 409 `PACKAGING_ORDER_NOT_READY` / `PACKAGING_INPUT_CHANGED`          |
| Thiếu số đo/catalog                            | 422 `PACKAGING_DATA_INCOMPLETE`, details liệt kê item/field          |
| Chưa tìm được phương án                        | Kết quả nghiệp vụ đã lưu có `status=no_solution_found`; POST trả 201 |
| Hàng đợi đầy/hết thời gian chờ                 | 503 `PACKAGING_BUSY`                                                 |
| Worker lỗi                                     | 503 `PACKAGING_ENGINE_UNAVAILABLE`, log chi tiết ở server            |

Thiếu dữ liệu được API báo bằng AppException trước khi dispatch; lõi normalize có thể biểu diễn `needs_data` nội bộ. Không trả cả HTTP thành công và lỗi thiếu dữ liệu theo hai cách bất định cho cùng endpoint.

**Nghiệm thu M4:** Swagger/Postman gọi hết readiness → recommend → get; sai role bị chặn; worker timeout không treo request; recommendation đọc lại giữ nguyên phiên bản; unit/integration/build-worker smoke đều pass.

### 6.5. M4A: API chọn túi cho đơn thời trang

Dùng cùng endpoint recommend, thêm bộ đánh giá túi vào application service. Khi profile thiếu thì readiness báo thiếu dữ liệu; khi chỉ thiếu quy cách fit thì nhánh túi `not_evaluated`, thùng vẫn được xét. Item bắt buộc thùng ngoài khiến nhánh túi `ineligible`. Quy cách fit phải khớp toàn bộ đơn, không chỉ kiểm tra từng item riêng rồi suy ra gộp lại cũng vừa.

Validator mailer kiểm tra tổ hợp item/profile/version/số lượng, tải, bảo vệ và vật tư. Candidate mailer không chứa placement thùng, `inner_mm` hoặc box ID giả. Stock và tổng khối lượng tính cả túi ngoài và bao bì từng item đúng một lần.

Khi so cả túi và thùng: có đầy đủ vật tư/cước thì ưu tiên tổng chi phí; chỉ có đủ vật tư thì ưu tiên vật tư và ghi rõ shipping/total chưa biết. Nếu phần vật tư còn thiếu, candidate đó cần xem lại và không tuyên bố lựa chọn rẻ nhất toàn bộ. Hòa dùng số bước đã định nghĩa rồi mã bao bì/signature; không so thể tích thùng với kích thước phẳng túi.

M4A hoàn tất khi test đủ ba ca: hai áo có quy cách túi hợp lệ; đơn áo kèm hộp phụ kiện bắt buộc thùng; đổi size/số lượng khiến quy cách túi cũ không còn khớp. Đọc lại recommendation phải giữ nguyên loại bao bì và snapshot. Benchmark nhánh túi báo tỷ lệ có quy cách áp dụng và chưa đánh giá, tách khỏi tỷ lệ greedy tìm được nghiệm.

## 7. M5: Cải thiện thuật toán bằng benchmark

### 7.1. Nâng từ greedy-v1 lên search-v2

Giữ v1 làm baseline không thay đổi. Mỗi candidate v2 vẫn qua validator v1/policy hiện hành.

1. Multi-start: thử thứ tự theo thể tích, cạnh lớn nhất và diện tích đáy giảm dần; tie-break bằng item key. Các lượt chia sẻ cùng deadline, không cấp lại 2 giây cho mỗi lượt.
2. Local search: đổi chỗ hai item liền nhau hoặc chuyển một item sang vị trí khác trong thứ tự, rồi repack toàn bộ thùng. Duyệt cặp/index theo thứ tự cố định; chỉ lưu candidate tốt hơn hoặc phương án khác cần cho top-k.
3. Ưu tiên thử thùng có thể cải thiện incumbent trước; điều kiện cắt nhánh chỉ được dùng khi có lập luận đúng. Thùng có thể tích lớn hơn chưa chắc đắt hơn nếu sau này xếp hạng theo tổng chi phí.
4. Tối ưu tốc độ sau profiling: loại orientation trùng, loại điểm lặp/ngoài biên, cache tính chất bất biến của item. Giữ validator cuối và giới hạn số bước.

Thay cấu trúc sinh điểm bằng Extreme Points/Maximal Spaces là một thí nghiệm riêng sau đó. Không đồng thời đổi generator, score và policy ổn định trong một PR khiến không biết phần nào tạo cải thiện. Có thể tham khảo [LAFF/brute force của skjolber](https://github.com/skjolber/3d-bin-container-packing); đó là thư viện Java, không phải dependency TS trực tiếp.

### 7.2. Quy trình chấp nhận cải thiện

```text
Đóng băng dataset + policy + baseline
→ Viết giả thuyết: thay đổi này cải thiện chỉ số nào?
→ Chạy cùng tập, máy và ngân sách
→ So chất lượng, số đơn giải được, thời gian, timeout
→ Kiểm tra các ca v1 tốt nhưng v2 xấu hơn
→ Ghi báo cáo và quyết định bật/tắt engine version mới
```

Bộ benchmark ban đầu: fixture đúng/sai hình học, 200 đơn tổng hợp seed cố định chia theo số item, cộng đơn thật đã đo khi có. Tách một tập khóa để không tinh chỉnh trên tập đánh giá; tăng kích thước tập theo độ đa dạng hàng, không coi con số 200 là đủ cho ML.

Chỉ bật v2 khi: tất cả candidate công bố hợp lệ; bộ ca bảo vệ không mất nghiệm đã biết; không tăng lỗi/timeout vượt ngân sách pilot; cải thiện ít nhất một chỉ số chất lượng đã chọn và báo rõ tradeoff còn lại. Nếu không có lợi ích đáng kể thì giữ v1, không nâng version chỉ vì thuật toán phức tạp hơn.

### 7.3. Script và báo cáo cần bổ sung

Đề xuất `npm run packaging:benchmark --workspace=be -- --engine=greedy-v1 --seed=42` và tùy chọn engine v2. Script chưa có trong package hiện tại; tạo ở công việc benchmark, runner trả nonzero khi có candidate sai validator.

Output JSON/CSV gồm dataset/policy/engine version, seed, input hash, số item/thùng, số bước, status, số kiện, thể tích ngoài, chi phí đã biết, runtime và violation count. Báo cáo tổng hợp p50/p95, tỷ lệ giải được và các ca hồi quy; không chỉ đưa trung bình đẹp.

## 8. M6: Xác nhận, đồng thời và dữ liệu phản hồi

### 8.1. Xác nhận là một nghiệp vụ riêng

Thêm `POST /packaging/recommendations/:id/confirm` và `/feedback`; ADMIN/PACKAGING_STAFF. Confirm nhận candidate ID, input revision và idempotency key. Kết quả lựa chọn nằm trong trạng thái packaging riêng, chưa tự đổi trạng thái Lazada thành packed.

Tài liệu tổng thể đề xuất trừ vật tư khi confirm. Ở roadmap này, **confirm là thời điểm nhận vật tư cho một lần đóng gói**, không chỉ nhấn “thích phương án”. Nếu quy trình kho thực tế muốn chọn trước và lấy vật tư sau, phải tách hai nghiệp vụ trước khi triển khai M6.

Trong transaction: xác nhận đơn/item vẫn đủ điều kiện, phiên bản profile/policy còn phù hợp, candidate hợp lệ, tồn đủ; ghi confirmation, ledger vật tư và giảm tồn có điều kiện. Unique constraint bảo vệ một confirmation đang hoạt động cho một lần đóng của đơn. Cùng key/nội dung trả lại cùng kết quả, kể cả sau retry mạng; cùng key khác nội dung trả 409.

### 8.2. Chặn thay đổi đồng thời đúng cách

Đọc snapshot trong transaction chưa đủ để bảo vệ khỏi một tiến trình khác cập nhật đơn. M6 cần version nghiệp vụ cho nội dung ảnh hưởng đóng gói; mọi writer liên quan, gồm sync Orders và cập nhật catalog, phải cập nhật version theo cùng quy tắc. Confirm thực hiện conditional write/touch các tài liệu phụ thuộc trong transaction để tạo xung đột ghi nếu dữ liệu bị đổi đồng thời; không chỉ đọc rồi so hash ở ngoài transaction.

Revision nội dung không tăng chỉ vì poll lại dữ liệu giống nhau. Stock được kiểm tra/cập nhật nguyên tử; không yêu cầu số tồn bằng snapshot cũ nếu tồn hiện tại vẫn đủ. Retry transaction phải chạy lại kiểm tra, tránh dùng candidate đã stale mà vẫn commit.

Khi thêm quy tắc này, test cả Orders sync và packaging; không chỉ test mock service. Chuẩn bị Mongo hỗ trợ transaction theo yêu cầu đã nêu trong [thiết kế tổng thể](AI_3D_PACKAGING_OPTIMIZATION.md#kien-truc).

### 8.3. Hủy, đóng lại và phản hồi

Sau confirm, retry không tạo lần trừ mới. Nếu cần hủy/đổi thùng, thêm thao tác hủy có lý do và ledger bù trừ theo **số vật tư thực trả về**; vật tư đã dùng/hỏng không tự cộng lại. Một lần đóng lại tạo attempt mới và phải đóng/hủy attempt đang hoạt động trước; không sửa lịch sử cũ.

Feedback lưu: recommendation/candidate/attempt ID, lựa chọn thực tế, lý do đổi, thời gian bắt đầu/kết thúc, vật tư thực dùng, người thao tác. Không coi phương án nhân viên chọn mặc định là tối ưu. Đây là nền cho M8; không cần huấn luyện mô hình trong M6.

**Nghiệm thu M6:** hai confirm đồng thời không trừ trùng; sync hủy item cạnh tranh với confirm không lọt kiểm tra; catalog thay đổi bị phát hiện; retry trả cùng confirmation; transaction rollback không để lại ledger hoặc tồn dở dang; hủy/đóng lại có truy vết.

## 9. M7–M8: Các bước nâng cao có điều kiện

### 9.1. Nhiều kiện và tối ưu chi phí

M7 mở rộng `PackingCandidate.parcels[]` đã có trong contract. Thử đóng item vào kiện đang mở trước, rồi mở kiện mới từ catalog còn khả dụng; tìm kiếm giới hạn có thể đổi loại thùng, chuyển item hoặc repack hai kiện. Đây là heuristic multi-bin cần benchmark riêng.

Validator kiểm tra đủ từng item **trên toàn bộ các kiện**, tồn theo tổng số thùng dùng, tải từng kiện và quy tắc đi chung. Tính chi phí trên cả đơn, tránh chọn hai thùng rẻ nhưng tổng cước đắt hơn một thùng lớn. Khi chưa có cước, dùng thứ tự ưu tiên fallback trong tài liệu tổng thể và hiển thị total chưa biết.

Không xác nhận nhiều kiện cho đơn Lazada nếu fulfillment chưa có contract parcel/tracking và xác minh hỗ trợ của luồng sàn. Có thể benchmark multi-parcel offline trước khi bật cho đơn thật.

Muốn dùng solver chính xác cho một tập nhỏ để so chất lượng, phải mô hình hóa 3D đầy đủ. [Ví dụ bin packing OR-Tools](https://developers.google.com/optimization/pack/bin_packing) chỉ gán item theo dung lượng, không cung cấp sẵn tọa độ/ổn định. Không dùng nghiệm 1D đó làm “đáp án tối ưu 3D”.

### 9.2. ML ranker

M8 chỉ thay thứ hạng giữa các candidate hợp lệ; không cho mô hình bỏ qua validator. Bắt đầu bằng dự đoán thời gian đóng từ đặc trưng dễ kiểm tra: số item/lớp, số lần xoay, số loại vật tư, độ đa dạng kích thước. Chi phí/độ hợp lệ vẫn lấy từ công thức và quy tắc.

Chuẩn bị tập thời gian đo đáng tin, chia theo thời gian và nhóm đơn để tránh leakage; thêm tập tổ hợp SKU chưa gặp. Chọn mô hình nhỏ làm baseline ML, so với xếp hạng quy tắc; việc chọn thư viện/runtime cụ thể là đầu ra thí nghiệm trước tích hợp, không tự dựng service Python từ đầu roadmap.

Chạy shadow, ghi model/features version và fallback về heuristic khi lỗi hoặc dữ liệu không phù hợp. Chỉ promote khi tập giữ lại và pilot cho lợi ích. RL, camera và hình bất quy tắc nằm ngoài lộ trình backend đầu tiên; không cần chúng để chứng minh MVP hoạt động.

## 10. Backlog chia PR và cách nghiệm thu

Các công việc dưới đây áp dụng trực tiếp cho danh mục quần áo/giày/phụ kiện. Test regression gồm: size khác có hồ sơ khác, không tự nén vải, không dùng hai hồ sơ như hai instance của cùng item, không ép đồ giữ phom vào túi trái quy tắc và không dùng quy cách túi cho tổ hợp chưa thử. Revision phải bao gồm hồ sơ gấp/bọc và fit túi.

**Bộ ca giày bắt buộc:** một đôi có hộp là một item; hai đôi giữ hai ID; hộp gốc không bị cộng khối lượng/trừ tồn hai lần; đổi size hoặc phiên bản hộp làm profile cũ hết áp dụng; không mở hộp để nhét áo; thiếu tải chồng không đặt áo/hộp khác lên trên; hộp vừa túi nhưng chưa có fit bảo vệ không được xác nhận nhánh túi. Dùng fixture SH1 + T1 trong [giải thích thuật toán](GIAI_THICH_THUAT_TOAN_3D_PACKAGING.md): tổng 1.480 g, áo chỉ được đặt trên hộp khi tải chồng đã duyệt đủ 250 g. Bổ sung các ca này vào benchmark, readiness và confirm.

### 10.1. Các PR theo thứ tự

| Nhãn    | Nội dung một PR hoặc nhóm PR nhỏ                                            | Phụ thuộc                           |
| ------- | --------------------------------------------------------------------------- | ----------------------------------- |
| BE-P01  | Contract, policy v1, fixture, test smoke                                    | Không                               |
| BE-P02  | Profile/mapping/box/material schema + CRUD + index                          | P01                                 |
| BE-P03  | Orders projection, eligibility, normalization, snapshot                     | P02                                 |
| BE-P04  | Validator và test hình học/support/tải/thứ tự                               | P01                                 |
| BE-P05  | Greedy-v1, ranking, CLI benchmark                                           | P03, P04                            |
| BE-P06  | Worker pool, deadline, crash recovery, build smoke                          | P05                                 |
| BE-P07  | Recommend/readiness/get API, persistence, Swagger/RBAC                      | P06                                 |
| BE-P07A | Catalog/fit túi, mailer validator, policy so box/mailer và test API         | P07; hồ sơ gấp/bọc từ P02/P03       |
| BE-P08  | Multi-start/local search và báo cáo so v1                                   | P07                                 |
| BE-P09  | Revision đồng bộ, transaction, confirm/idempotency, ledger túi/thùng/vật tư | P07A; dùng engine đã được chấp nhận |
| BE-P10  | Hủy/đóng lại có kiểm soát, feedback, log/metrics, pilot                     | P09                                 |
| BE-P11  | Multi-parcel và cost adapter, fulfillment contract                          | P08, P10 và fulfillment sẵn sàng    |
| BE-P12  | Dataset/ranker/shadow/promotion                                             | P10 và dữ liệu đủ chất lượng        |

Mỗi PR thuật toán kèm fixture mới khi sửa lỗi, benchmark trước/sau nếu thay tìm kiếm, engine version và mô tả giới hạn. Không thay schema, generator, API và ML cùng một PR lớn.

### 10.2. Các lệnh kiểm tra

Các lệnh sẵn có để dùng khi code được triển khai:

```bash
npm run test --workspace=be -- --runInBand packaging
npm run build --workspace=be
```

Khi thay Orders, chạy thêm test Orders và bộ regression phù hợp. Từ thư mục `be`, kiểm tra lint không tự sửa bằng `npx eslint "src/modules/packaging/**/*.ts"` cùng các file Orders/AppModule đã sửa. Test integration dùng DB replica set biệt lập; không trỏ tới dữ liệu shop đang dùng. Benchmark và worker smoke cần được bổ sung thành script trong các PR tương ứng.

### 10.3. Tiêu chí hoàn tất backend đầu tiên

- Có thể chuẩn bị hồ sơ quần áo/giày/phụ kiện và chạy recommend/get/confirm bằng API cho cả box/mailer; quy cách túi chưa biết được báo rõ.
- Mỗi unit được truy về ID gốc, số đo và policy snapshot; shipping chưa có được ghi là chưa biết.
- Candidate công bố đều qua validator; không biến search timeout thành tuyên bố vô nghiệm.
- Worker sau build chạy được, request quá tải có giới hạn, API khác vẫn đáp ứng trong load test pilot.
- Xác nhận có quyền, kiểm tra dữ liệu cạnh tranh, idempotency và tồn kho nguyên tử.
- Có baseline benchmark, fixture regression và báo cáo trung thực về những đơn chưa giải được.
- Có đường quay về engine trước/quy trình thủ công; lịch sử recommendation và ledger được giữ nguyên.

**Việc bắt đầu đầu tiên là BE-P01 và BE-P02.** Chưa cần train AI, tích hợp cước thật hoặc làm frontend để kiểm chứng thuật toán baseline và API của backend.
