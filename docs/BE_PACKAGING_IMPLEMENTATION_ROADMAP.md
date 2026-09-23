# Backend roadmap — Điều chỉnh flow và thuật toán đóng gói

Cập nhật **12/09/2026**; 🔄 **ĐÃ ĐỔI (21/09/2026):** flow chính thức là **lấy hàng trước, tính/duyệt phương án đóng gói sau** (theo code AOFP-35 đã merge 20/09). Phạm vi kiện vẫn là **mỗi đơn nguồn một kiện**. Các mục 1, 2, 6 đã sửa tại chỗ; BE-3a/BE-4a ở mục 5–6 là lát cắt thu gọn sẽ làm trước. ✅ **Cập nhật cuối ngày 21/09/2026:** BE-3a và BE-4a **đã triển khai** (engine greedy 3D + validator mỗi đơn một kiện, danh mục thùng `/packaging/boxes`, hồ sơ SKU `/product-master`, lượt lấy `pick_round` + chặn quét dư + transaction, `pick` đối soát đủ, cân kiện tại `pack`, animation 3D trên FE `/app/packing/groups/:groupId`). Cột "hiện trạng" ở bảng mục 1/2 mô tả code TRƯỚC đợt này. Còn lại: nhánh túi mailer, danh mục vật tư/cước, snapshot/version hồ sơ, attempt/ledger vật tư, BE-5. Đây là kế hoạch sửa backend trên code hiện hữu. Lát cắt BE-1 đầu tiên đã được triển khai: không còn mặc định số đo/độ nhạy và hồ sơ chưa được kho xác nhận bị chặn khỏi input packaging; các phần còn lại chưa triển khai. Thứ tự BE-1 → BE-5 thay thế M0–M8/BE-Pxx cũ; đây là nhãn công việc nội bộ, không phải mã Jira.

## 1. Hiện trạng và đích triển khai

Đã có `product-master`, `order-groups`, `packaging`, `warehouse`, Orders sync và fulfillment nội bộ. Phát triển tiếp các module này; không tạo hệ thống packaging song song. Xem [thiết kế tổng thể](AI_3D_PACKAGING_OPTIMIZATION.md) và [giải thích thuật toán](GIAI_THICH_THUAT_TOAN_3D_PACKAGING.md).

| Hiện trạng code đã đối chiếu | Thay đổi cần làm |
| --- | --- |
| Product Master lấy số đo GetProducts, thiếu thì mặc định 20 cm/0,5 kg | Tách khai báo từ sàn với hồ sơ kho; thiếu dữ liệu phải báo thiếu |
| Đầu vào packaging dùng dòng gộp, bỏ định danh/trạng thái item | Giữ từng unit đủ điều kiện của một đơn |
| Fallback chọn ba hộp theo tổng thể tích +10% (không phải FFD, không xếp hình học), quá cỡ vẫn trả Large | Candidate phải qua validator; không trả hộp khi quá cỡ |
| Group tạo xong được auto-assign và chuyển `picking`; sau `picked` Admin gọi generate; approve/adjust bắt nhập cân thật dù chưa đóng, so với cân hàng thuần (không cộng bì) | Tự tính sau `picked`; approve chỉ chọn phương án; cân kiện tại bước `pack`, so với hàng + bì + vật tư |
| Gợi ý tính cho cả group (nhiều đơn) thành một thùng | Tách hàng đã lấy theo từng đơn, mỗi đơn một recommendation/kiện |
| Pick trừ tồn trước ghi event (không transaction); pick_events cộng dồn mọi lượt lấy; không chặn quét vượt số đặt; `pick` không kiểm tra đủ hàng; partial chỉ đổi trạng thái | Transaction, lượt lấy (round), chặn vượt số đặt, `pick` đối soát đủ, xử lý phần thiếu rõ ràng |
| Contract group ID, cm/kg, một hộp; HTTP camelCase | Adapter có phiên bản sang lõi mm/g; không đổi hợp đồng ngầm |

**Phạm vi đóng:** một đơn nguồn, một tập item được phép giao. Group nhiều đơn chỉ là nhóm lấy hàng, không đồng nghĩa một kiện/vận đơn. Bản đầu tính một bao bì ngoài cho mỗi đơn; không tìm được thì xử lý ngoại lệ, chưa tự chia kiện.

**Quyền mục tiêu:** kho/Admin xác nhận đã đo/thử khi nhập hồ sơ SKU, không có lượt Admin duyệt riêng. Packaging Staff/Admin xử lý ngoại lệ hoặc đổi phương án. Đơn thường chỉ tự thông qua sau validator; không giả mạo người duyệt khi hệ thống quyết định.

## 2. Flow và trạng thái mục tiêu

🔄 **ĐÃ ĐỔI (21/09/2026):** thay flow "tính phương án → duyệt → phân công → lấy hàng" của bản 12/09. Lý do nghiệp vụ: Packaging Staff cần thấy tập hàng thật đã lấy (kể cả khi thiếu) rồi mới chốt đóng gói; tính trước trên số lượng đặt dễ ra thùng sai khi thiếu hàng. Hệ quả chấp nhận: nhân viên kho không biết trước cần mang túi/thùng nào khi đi lấy hàng.

```text
Đồng bộ đơn + dữ liệu khai báo từ sàn
→ Gộp nhóm lấy hàng (Order Group) → Tự phân công Warehouse Staff → picking
→ Quét từng SKU, đối chiếu item/số lượng theo đơn (không vượt số đặt)
   ├─ Thiếu → partial_needs_review → Packaging Staff/Admin quyết định
   │          (tiếp tục với phần có / lấy lại lượt mới)
   └─ Đủ → picked
→ Chia hàng đã lấy về từng đơn nguồn → Tra hồ sơ kho đã xác nhận
   ├─ Thiếu hồ sơ → Chặn, chờ bổ sung, không đoán số đo
   └─ Đủ → Tính thùng/túi cho TỪNG ĐƠN → Validator
          ├─ Không có phương án hợp lệ → Ngoại lệ (adjust/xử lý tay)
          └─ Hợp lệ → pending_approval → approve/adjust → approved_for_packing
→ Đóng theo phương án từng đơn → Cân kiện thật từng đơn tại bước pack
→ packed → Bàn giao vận chuyển nội bộ
```

| Trạng thái | Nghĩa hiện tại (code 21/09) | Nghĩa mục tiêu sau BE-3a/BE-4a |
| --- | --- | --- |
| `awaiting_packaging` | Giá trị khởi tạo, chuyển ngay sang `picking` sau auto-assign; đích của decide-partial(false) | Như cũ; decide-partial(false) mở lượt lấy mới (round) |
| `picking` | Đang lấy hàng | Như cũ, quét bị chặn khi vượt số đặt |
| `partial_needs_review` | Báo thiếu, chờ quyết định | Không chuyển picked chỉ bằng boolean nếu chưa xác định tập giao |
| `picked` | Đã bấm pick (chưa đối soát); điểm gọi generate; đích của reject | Đã đối soát đủ (hoặc partial đã duyệt); điểm tính phương án |
| `pending_approval` | Có recommendation (fallback, cả group) chờ duyệt | Có recommendation theo từng đơn, đã qua validator |
| `approved_for_packing` | Đã duyệt (kèm cân nhập trước khi đóng) | Đã chốt phương án; chưa cân |
| `packed` | Chỉ đổi trạng thái | Nhận cân kiện thật từng đơn, so hàng + bì + vật tư |
| `shipped/delivered/returned` | Mô phỏng nội bộ | Như cũ, không đổi trạng thái Lazada thật |

## 3. BE-1 — Đầu vào và phạm vi đơn

- Sửa mapper: trạng thái nguồn chưa nhận diện phải được giữ để xem lại, không fallback PENDING. Bản đầu chỉ dùng đơn/item PENDING đã xác minh; canceled bị loại, trạng thái khác chặn tự động.
- Giữ order ID, platform/shop, SKU/biến thể, platform_order_item_id. Quantity >1 mở rộng ordinal; không mất danh tính khi gộp hiển thị.
- Mỗi đơn có phạm vi fulfillment/packaging riêng; không thêm đơn khác vào phạm vi đã lấy/đóng. Nhóm lấy hàng không tạo quyền giao chung.
- Backfill cả group ID null và ID có giá trị nhưng thiếu document; tạo/link idempotent khi nhiều tiến trình cùng chạy.
- Group legacy chứa nhiều đơn đang xử lý phải rà soát trước chuyển đổi. Không tự tách nhóm đang làm hoặc viết lại lịch sử hoàn tất; chặn tự động trên dữ liệu chưa xác định phạm vi.

**Nghiệm thu:** không nhầm SKU giữa shop; không đóng item canceled; trạng thái lạ bị chặn; hai unit có hai key; phục hồi group thiếu document; backfill lặp không tạo trùng.

## 4. BE-2 — Hồ sơ, catalog và readiness

### Dữ liệu chuẩn hóa

Product Master lưu số đo khai báo và nguồn/thời điểm đồng bộ. Hồ sơ kho riêng lưu version, nháp/đã xác nhận, người/thời điểm xác nhận, bước gấp/bọc và số đo đầu ra, khối lượng hiệu dụng, hướng UP/xoay, tải chồng, giữ phom, chống trầy/chống sốc và loại bao bì ngoài cho phép. Chưa biết độ nhạy không đồng nghĩa không dễ vỡ; thiếu tải chồng thì không đặt vật lên.

Thay quy cách tạo version mới; nháp không thay bản đang dùng. Đồng bộ sàn không ghi đè hồ sơ đã xác nhận. Mapping unique theo `(platform, shop_id, sku, variation)`, chuẩn hóa variation thiếu/rỗng thống nhất.

| Catalog | Dữ liệu cần có |
| --- | --- |
| Carton | Trong sử dụng được/ngoài, lót cố định, bì, tải hàng/tổng kiện riêng, giá/tồn |
| Túi zip | Kích thước phẳng/phần sử dụng được, kiểu đáy, bì/giá/tồn; vai trò bọc item hoặc bao bì ngoài |
| Vật tư | Đơn vị, khối lượng/giá quy đổi; lượng đã nằm trong gói và lượng cấp thêm |
| Quy cách item | Hộp sản phẩm có sẵn khác vật tư kho cấp mới; hộp giày/trang sức không thành item bán thêm |

Lõi dùng mm/g và VND nguyên, kiểm tra Number.isSafeInteger. Prototype: tối đa 30 unit, 20 loại thùng, mỗi cạnh 5.000 mm. Adapter đổi cm/kg, làm tròn kích thước item lên và không gian trong xuống; giữ số gốc, sai số đo và độ hở riêng. Thiếu dữ liệu không dùng mặc định 20 cm/0,5 kg.

### API và nối Orders

Mở rộng module hiện hữu bằng CRUD profile/mapping/bao bì/vật tư và thao tác xác nhận đã đo/thử cho kho/Admin. Packaging Staff đọc catalog. Dùng sub-schema Mongoose, soft delete, revision, phân trang và error_code hiện hữu.

Đề xuất mới `GET /packaging/orders/:orderId/readiness` cho Admin/kho/Packaging Staff. Orders cung cấp projection tối thiểu, không PII. Trả `ready_for_evaluation`, issues có mã/item/field, phiên bản nguồn và input_revision. GET báo thiếu dữ liệu bằng báo cáo HTTP 200; recommend thiếu dữ liệu trả 422 — hai nghiệp vụ khác nhau.

Readiness không chứng minh xếp vừa/bảo vệ vật lý. Thiếu fit túi thì nhánh túi not_evaluated; thiếu vật tư bắt buộc cấp item phải báo thiếu; vật tư theo kiện đợi engine đánh giá. Revision hash nội dung đóng gói, không hash PII/thời gian poll đơn thuần.

**Nghiệm thu:** áo trong zip, giày nguyên hộp, trang sức chống sốc; nháp không dùng; xác nhận đủ làm readiness đổi; đồng bộ sàn không sửa hồ sơ kho; profile mới làm revision đổi.

## 5. BE-3 — Validator, engine và snapshot

### Lõi và tìm kiếm

Contract thuần TS chứa unit/profile version, catalog và policy. Result có status/candidate/trạng thái từng nhánh. Candidate `box` có placement; `mailer` có fit recipe, item keys và bước gói. Cả hai có vật tư, tổng khối lượng, chi phí biết/chưa biết và lý do. Engine không gọi DB/sàn.

Validator độc lập kiểm tra đủ mỗi item một lần, biên, AABB, hướng, tải hàng/tổng kiện gồm bì/vật tư, tiếp xúc/cấm chồng và khoảng đệm. Support v1: sàn hoặc một vật đỡ toàn đáy, cộng tải descendants, cấm chu trình. Kiểm tra đường hạ từ miệng thùng không xuyên vật đã đặt. Fallback và phương án sửa tay cũng phải qua validator.

Greedy sort thể tích giảm dần → cạnh lớn nhất → item key. Điểm X/Y/Z gồm 0 và các mặt cuối item đã đặt; thử z/y/x rồi orientation ổn định. Mỗi cỡ thùng bắt đầu rỗng; duyệt lười, có deadline. Không trả phần hàng xếp dở thành candidate đầy đủ.

Túi khớp toàn bộ profile/version/quantity theo quy cách đã thử, có tải, cách đóng khóa/miệng và yêu cầu bảo vệ. Không suy hộp 3D từ túi phẳng hoặc áp fit hai áo cho ba áo. Pilot đo tỷ lệ tổ hợp có fit.

Prototype chỉ-thùng chưa có cước: thể tích ngoài → vật tư đã biết → mã/signature. Khi so túi/thùng: tổng chi phí nếu đủ, nếu chỉ đủ vật tư thì so vật tư và ghi cước/tổng chưa biết. Không so thể tích hộp với diện tích túi; không dùng 15.000 VND/kg như cước thực.

### BE-3a — lát cắt thu gọn làm trước (21/09/2026)

Engine thuần TS trong `packaging/engine/`: đổi cm/kg → mm/g (item làm tròn lên, lòng thùng làm tròn xuống), mở số lượng thành unit có `item_key`, catalog thùng có kích thước trong/ngoài/bì/tải, validator (đủ unit, biên, AABB, vật đỡ, tải), greedy như trên với tối đa 30 unit; không có thùng hợp lệ → `no_fit`, không trả Large. Fallback thể tích giữ làm lưới an toàn nhưng kết quả cũng phải qua validator. Recommendation tính theo từng đơn (`order_id`), adjust phải qua validator và lưu lý do. Chưa làm: hồ sơ kho có version, nhánh túi, worker, snapshot đầy đủ.

### Thực thi và tương thích

- Prototype TS, quyết định engine sau benchmark trước tích hợp. Worker pool khởi đầu 1 worker/instance, queue 8, chờ 1 giây, solver 2 giây, watchdog 3 giây; cần đo lại.
- `no_solution_found` không chứng minh vô nghiệm; timeout chỉ trả candidate hoàn chỉnh đã validate. Worker lỗi/queue đầy là lỗi hệ thống.
- Snapshot lưu order/unit, profile/mapping, catalog/policy/engine version và revision. Tạo recommendation, thay active và liên kết trạng thái trong transaction; failure không làm mất bản hợp lệ cũ.
- Adapter giữ contract cũ cm/kg và route group tới khi client chuyển. Không ép candidate túi thành box giả. Giữ HTTP camelCase hiện hữu; contract mới có phiên bản, không đổi tên ngầm.
- Recommendation legacy thiếu snapshot phải tính lại trước xử lý mới; giữ lịch sử. Adjust phải validate/tính lại chi phí và lưu lý do, phương án cũ/mới.

**Nghiệm thu:** giữ fixture A1/A2/B1: M, 920 g, 53,03%; SH1/T1: 1.480 g khi đủ tải chồng. Món 100×1×1 cm không vào hộp 20×15×10; món cạnh 200 cm không được trả Large; input rỗng bị chặn. Test thiếu/trùng unit, lấn 1 mm, xoay/support, bì vượt tải, padding, fit sai, timeout, worker sau build. Benchmark có seed/policy/số bước/p50/p95, tỷ lệ hợp lệ và đơn chưa giải được; không chỉ so output với implementation.

## 6. BE-4 — Picking, vật tư và xác nhận

- Server kiểm tra đơn/group, trạng thái, warehouse/shop/platform, SKU/unit thuộc đơn và lượng còn phải lấy. Lần lấy đầu sang picking; chỉ picked khi đủ tập item. Không dựa vào FE để ngăn quét sai.
- Trừ tồn, ghi pick event và cập nhật tiến độ trong một transaction. Idempotency key bắt buộc khi trừ tồn: cùng key/nội dung trả kết quả cũ, khác nội dung trả 409. Unique index + transaction bảo vệ request đồng thời.
- Thiếu hàng lưu unit/số lượng và dừng. Bản đầu chờ bổ sung hoặc hủy/xử lý lại, chưa giao thiếu tự động. Partial không chuyển picked khi chưa xác định tập giao, xử lý phần còn lại và tính lại. Đối soát hàng đã lấy/vật tư đã dùng, không tự cộng tồn khi quay lại.
- Tách chọn phương án khỏi nhận vật tư và đóng xong. Cấp vật tư lúc bắt đầu đóng theo attempt riêng, ledger + trừ nguyên tử; kết thúc đối soát thực dùng/trả lại. Đổi bao bì phải tính lại, không ghi đè lịch sử/trừ lần hai khi retry.
- 🔄 ĐÃ ĐỔI (21/09/2026): picking diễn ra trước khi có phương án; `picked` chỉ được đặt khi đã đối soát đủ theo lượt lấy hiện tại (round). **BE-4a (làm trước):** lượt lấy, chặn quét vượt số đặt, transaction trừ tồn + ghi event, `pick` kiểm tra đủ hàng, cân kiện từng đơn tại `pack`.
- Approve/adjust kế hoạch bỏ yêu cầu cân sau đóng. Pack nhận cân/đo kiện thật, attempt/revision, vật tư thực dùng; so với hàng + bao bì + vật tư đúng một lần. Lệch policy thì chờ xem lại, chưa tự packed. Ngưỡng 20% hiện có chỉ là khởi đầu cần thử, không chứng minh đủ hàng.
- Recheck item/profile/recommendation trước cấp vật tư và đóng xong. Writer cập nhật revision nghiệp vụ và conditional write trong transaction để phát hiện sync hủy hàng cạnh tranh; chỉ đọc/so ngoài transaction chưa đủ.

**Nghiệm thu:** chặn SKU ngoài đơn/quá số lượng; hai retry không trừ trùng; event lỗi rollback tồn; partial không giữ phương án cũ đi tiếp; cân sau đóng; hủy/đổi có ledger; dữ liệu đổi đồng thời trả xung đột. Integration test trên Mongo replica set biệt lập.

## 7. BE-5 — Tự động hóa và pilot

Chỉ bật khi BE-1 đến BE-4 đạt nghiệm thu. Sau lưu đơn, upsert yêu cầu đánh giá bền vững theo order + revision; worker khóa job, retry có giới hạn, có job đối soát phục hồi. Không chỉ dùng event trong bộ nhớ dễ mất khi restart. Lỗi packaging không rollback sync; API kiểm tra lại dùng cùng service.

Sau `picked`, đủ dữ liệu và candidate hợp lệ thì tự tạo phương án theo từng đơn và có thể tự approved_for_packing, ghi actor system (phân công đã diễn ra lúc tạo group, không lặp lại ở đây). Thiếu/không có phương án giữ chờ có reason; catalog liên quan đổi tạo lượt đánh giá mới. Revision đã xử lý không tạo/trừ trùng. Group đã approved_for_packing trở đi không bị job mới tự thay phương án.

Pilot theo SKU đã đo, có cờ tắt tự thông qua và đường ngoại lệ qua validator; không quay về số đo bịa/thuật toán thể tích cũ. Theo dõi thiếu dữ liệu, bao phủ fit túi, lỗi/timeout, stale revision, sai lệch cân và thời gian đóng; log không chứa PII không cần thiết.

**Nghiệm thu:** đơn đủ tự có phương án; SKU thiếu được đánh giá lại sau bổ sung; restart không mất job; retry không lặp quyết định; nguồn đổi chặn bản cũ. Chưa gọi Pack/ReadyToShip thật của Lazada.

## 8. Tài liệu, kiểm thử và mở rộng

Cập nhật README/CLAUDE và hai bản root/be của guide Orders/Fulfillment/API list. Giữ bảng route hiện hữu; endpoint mục tiêu ghi chưa triển khai. Lát cắt BE-1 không migrate dữ liệu; hồ sơ cũ không có trạng thái `ready` sẽ chờ đo/xác nhận. Cần dry-run legacy groups và kiểm tra quan hệ trước bật flow mới.

Chạy test từng đợt, toàn backend khi đổi contract/flow, build và ESLint không --fix. Test cũ còn kỳ vọng sai rằng quá cỡ vẫn trả Large. Lượt rà trước cập nhật docs đạt 16/16 test packaging và tái hiện các phản ví dụ; đây không phải bằng chứng production an toàn.

Sau pilot mới cân nhắc multi-start/local search trong cùng ngân sách, nhiều kiện khi fulfillment sẵn sàng và ML ranker trên candidate hợp lệ. Giữ baseline benchmark; greedy không phải mô hình học. Frontend/3D viewer, cước thật và giao hàng thật có đợt riêng.
