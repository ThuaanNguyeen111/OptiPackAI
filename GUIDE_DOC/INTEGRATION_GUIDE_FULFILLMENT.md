# OptiPackAI Backend — Integration Guide: Fulfillment & Warehouse (Package 3/4)

> **Trạng thái FE (21/10/2026):** ✅ đã nối đủ (nhóm đơn, lọc/phân trang, lấy hàng, báo thiếu, liên kết tay, giữ chỗ tồn). Chi tiết **đóng gói** nay ở `INTEGRATION_GUIDE_PACKING.md`; **giao/hoàn** ở `INTEGRATION_GUIDE_SHIPPING.md` — các mục tương ứng trong file này chỉ còn để tham khảo luồng tổng.
> **Thay đổi gần nhất:** 18/10 — khách trả đủ hàng: nhóm `returning` → `returned` → `canceled`; đóng gói một bước chấp nhận, lọc việc bằng `assigned_packer_id`.
> Lịch sử thay đổi theo ngày: `CLAUDE.md` (nhật ký).

**Swagger UI**: `http://localhost:3000/api/docs`

---

# PHẦN A — TỔNG QUAN HỆ THỐNG

**Đợt này cập nhật docs và lát cắt BE-1.** Backend đã bỏ mặc định số đo/độ nhạy khi thiếu và chặn input packaging nếu hồ sơ SKU chưa ở trạng thái `ready`; các phần còn lại vẫn là giới hạn cần sửa. Phần B và bảng API mô tả route đang chạy. Flow mục tiêu ở A.4/C.2 và [roadmap BE-1 → BE-5](docs/BE_PACKAGING_IMPLEMENTATION_ROADMAP.md) chưa phải endpoint hoàn chỉnh đã triển khai.

## A.1. Bài toán hệ thống giải quyết

Sau khi đơn hàng từ Lazada được đồng bộ về và gộp thành **Order Group** (xem `INTEGRATION_GUIDE_ORDERS.md`), hệ thống phải trả lời 6 câu hỏi nghiệp vụ liên tiếp:

🔄 **ĐÃ ĐỔI (21/09/2026)** — thứ tự dưới đây là thứ tự chạy thật: lấy hàng trước, đóng gói sau.

1. **Ai lấy hàng** — nhân viên kho nào phụ trách? (Nghiệp vụ Staff Assignment — tự gán ngay lúc tạo group)
2. **Hàng ở đâu trong kho** — kệ nào, đi theo lộ trình nào? (Nghiệp vụ Warehouse)
3. **Lấy đủ chưa** — quét từng món, nếu thiếu thì sao? (Nghiệp vụ Picking)
4. **Đóng gói thế nào** — thùng cỡ nào, vật liệu gì, tính trên hàng ĐÃ lấy? (Nghiệp vụ Packaging)
5. **Đơn có gấp không** — cần ưu tiên xử lý trong bao lâu? (Nghiệp vụ Đơn Hỏa Tốc)
6. **Ai cần biết chuyện gì đang xảy ra** — báo cho đúng người, đúng lúc (Nghiệp vụ Notifications)

**Code hiện tại** xử lý fulfillment theo OrderGroup. **Mục tiêu mới:** mỗi đơn có phạm vi đóng riêng; group nhiều đơn chỉ hỗ trợ lấy hàng cùng lượt, không suy thành cùng kiện/vận đơn. Group legacy đang xử lý cần rà soát khi chuyển đổi, không tự tách hoặc sửa lịch sử hoàn tất.

## A.2. Actor (vai trò) và trách nhiệm thật trong hệ thống

| Actor | Trách nhiệm CHÍNH trong Fulfillment | Không làm gì |
|---|---|---|
| **Store Owner** | Xem đơn/group, lọc đơn Hỏa Tốc, đánh dấu ưu tiên, nhận cảnh báo (thiếu hàng, SLA, mất kết nối sàn) | KHÔNG trực tiếp thao tác lấy/đóng gói/ship |
| **Warehouse Staff** | Lấy hàng (quét/nhập tay), đóng gói, phát hiện+báo thiếu hàng, tự nhận/đổi việc | KHÔNG duyệt gợi ý AI, KHÔNG quyết định tiếp tục khi thiếu hàng |
| **Packaging Staff** | Duyệt/điều chỉnh/từ chối gợi ý đóng gói, quyết định đơn thiếu hàng có tiếp tục không | KHÔNG trực tiếp lấy/đóng gói hàng |
| **Shipping Coordinator** | Xác nhận đã ship, đã giao, ghi nhận hoàn hàng | KHÔNG tham gia khâu lấy/đóng gói |
| **Admin** | Toàn quyền mọi thao tác trên — dùng để test/vận hành khẩn cấp | — |

## A.3. Nguyên tắc mục tiêu — thay đổi ngày 12/09/2026

- Kho/Admin xác nhận đã đo/thử khi nhập hồ sơ SKU; không cần Admin duyệt riêng. Dữ liệu sàn chỉ là nguồn khai báo, không ghi đè hồ sơ kho đã xác nhận.
- Đơn đủ dữ liệu được tự tính phương án; chỉ candidate qua validator mới tự thông qua. Packaging Staff/Admin xử lý ngoại lệ, không duyệt tay mọi đơn.
- Giữ ID từng item, chỉ xử lý trạng thái nguồn đã xác minh; thiếu dữ liệu không mặc định 20 cm/0,5 kg hay không dễ vỡ.
- Chọn kế hoạch, cấp vật tư và xác nhận đóng xong là ba thao tác riêng. Chọn không trừ tồn; cấp phát theo attempt/ledger nguyên tử; cân kiện thật sau đóng.
- Không tự quyết giao thiếu; thiếu hàng phải xác định unit/số lượng, dừng và xử lý lại. Bản đầu chờ bổ sung hoặc hủy/xử lý lại, chưa hỗ trợ giao thiếu tự động.
- Tự động hóa chỉ bật sau BE-1 đến BE-4. Fulfillment vẫn mô phỏng nội bộ, không gọi Pack/ReadyToShip thật lên Lazada.

## A.4. Quyền mục tiêu và chuyển đổi API

Ma trận A.2 và route ở phần B vẫn là quyền/code hiện tại. Mục tiêu cho kho/Admin quản lý hồ sơ/quy cách và xác nhận dữ liệu; Packaging Staff/Admin xử lý phương án ngoại lệ; Warehouse Staff lấy/đóng và ghi cân/đo thật; hệ thống xử lý luồng thường. Không giả mạo approved_by cho quyết định tự động; ghi nguồn system/human.

| Trước đây | Trạng thái 04/10/2026 |
| --- | --- |
| Admin gọi generate | ✅ Đã thay — job nền tự tính khi nhóm `picked` (quét 10 s), lỗi dữ liệu → kế hoạch `failed` kèm lý do |
| Approve/adjust bắt nhập cân thật dù chưa đóng | ✅ Duyệt/chỉnh tay không cân; cân thật từng kiện ở `packing-plan/pack`, so với hàng + bì + vật tư |
| Generate tính cả group thành một thùng | ✅ Mỗi đơn giải riêng, N kiện/đơn, mọi kiện qua validator |
| Input SKU gộp, cm/kg | ✅ Bộ giải nở từng đơn vị (`itemKey`), lõi mm/g; HTTP camelCase |
| Chỉ trả boxSize/materialType | ✅ Trả thùng + `placements` (toạ độ 3D) + vật tư + nhãn chứng minh; ⏳ chưa có nhánh túi mailer |
| Pick có thể bấm ngay không đối soát | ✅ `pick` đối soát đủ số lượng theo lượt; `pick-item` chặn quét dư, transaction trừ tồn + event |
| Decide-partial boolean → picked | ⏳ Một phần — `false` mở lượt lấy mới + nhập lại tồn; `true` tính kế hoạch trên số đã quét (chưa đối soát giao thiếu với khách) |
| Pack chỉ nhận expected_version | ✅ Cân thật từng kiện + cảnh báo bất thường + trừ thùng/vật tư trong 1 transaction |

Danh mục thùng (`/packaging/boxes`) và hồ sơ SKU (`/product-master`) có từ 21/09. Thiếu hồ sơ SKU báo qua kế hoạch `failed` (`failureReason`). Phương án cũ (`packaging_recommendations`) không tự hợp thức hoá — chạy script migrate hoặc tính lại.

---

# PHẦN B — TOÀN BỘ NGHIỆP VỤ, CHI TIẾT TỪNG TÌNH HUỐNG

> 🔄 **ĐÃ ĐỔI (21/09/2026) — thứ tự chạy thật:** Nghiệp vụ 2 (Phân công) → 3 (Lấy hàng) → **1 (Đóng gói)**. Số thứ tự nghiệp vụ giữ nguyên để không vỡ tham chiếu cũ.

## 🆕 Nghiệp vụ 0 — Chuẩn bị dữ liệu đóng gói (làm 1 lần, trước khi dùng engine) — 21/09/2026

Bộ giải chỉ tính được khi có **số đo thật**. Thiếu → kế hoạch của nhóm chuyển `failed` với `failureReason` nêu SKU chưa có hồ sơ (🔄 04/10; trước đây `generate` trả 422 `ORD_GROUP_PACKAGING_PROFILE_NOT_READY`). Không đoán số đo.

1. **Danh mục thùng** (Admin): `POST /packaging/boxes` — lòng thùng/ngoài thùng (mm), bì (g), tải (g), giá. Có sẵn 3 thùng mẫu `SAMPLE-S/M/L` (`isSample: true`, số giả lập) sau khi chạy `npx ts-node scripts/seed-packaging-boxes.ts`; nhập số thật qua API hoặc CSV. 🆕 (22/09/2026) **Tồn kho thùng**: mỗi thùng có `quantityOnHand` (thực có), `reserved` (phương án chưa đóng đang giữ chỗ), `available` (còn trống). Nhập thùng qua `POST /packaging/boxes/:id/stock-in` `{ quantity, note? }` (Admin/Warehouse), xem sổ qua `GET /packaging/boxes/:id/movements`. Thùng mới tạo có tồn 0 — **phải nhập tồn thì engine mới chọn được**. Seed mẫu nhập sẵn 50 thùng mỗi loại.
2. **Hồ sơ SKU** (Warehouse Staff/Admin): `GET /product-master?status=needs_measurement` → đo từng SKU **sau khi gấp/bọc** (giày đo nguyên hộp) → `PUT /product-master/:id/packaging-profile` với `length_cm`, `width_cm`, `height_cm`, `weight_kg`, `is_fragile`, `orientation_rule` (`any` / `upright_only`), `max_stack_load_kg` (bỏ trống = không cho đặt gì lên). Hồ sơ chuyển `ready`; đồng bộ Lazada không ghi đè. 🆕 (21/09/2026 lần 3) Body thêm `product_category` (**bắt buộc**), `zip_bag_code?`, `zip_bag_folded?`. **Túi zip**: quần áo thường được cho vào túi zip (có thể gập đôi túi) rồi mới xếp vào thùng — khi đó kho đo **gói đã đóng túi**, engine xếp đúng khối đó. 🆕 (22/09/2026) **Quần áo luôn nằm phẳng** (engine chỉ xoay ngang, không dựng đứng), kể cả hồ sơ cũ để `orientation_rule: any`. Body thêm `can_fold_in_half?` cho hàng mềm (trong túi zip hoặc không có hộp cứng): engine tự tính số đo gập (cạnh dài ÷ 2, độ dày × 2) và **chỉ gập khi nhờ đó dùng được thùng nhỏ hơn**; 🔄 (23/10/2026) chỉ 6 loại quần áo (áo thun, sơ mi, khoác, quần đùi, quần dài, váy/đầm) được bật; giày, dép, phụ kiện, khác → 422 `PM_FOLD_NOT_ALLOWED`. Danh mục túi ở `/packaging/bags` (Admin quản lý cùng trang `/app/admin/boxes`).

> Lấy hàng (Nghiệp vụ 3) **không** cần hồ sơ đóng gói — chỉ bước tính phương án mới cần. 🔄 21/09: `picking-list` (cả 2 bản) trả `quantity`, `picked_quantity`, `packaging_profile_ready` và số đo `null` khi SKU chưa đo, không còn 422.
>
> **Màn FE**: Admin quản lý thùng ở `/app/admin/boxes`; kho đo SKU ở `/app/inventory/packaging-profiles` (tab "Cần đo" / "Đã xác nhận", số Lazada khai chỉ hiện để tham khảo).

## Nghiệp vụ 1 + 1b — Kế hoạch đóng gói & phiên đóng gói → đã chuyển sang `INTEGRATION_GUIDE_PACKING.md`

Toàn bộ request/response, trạng thái, lỗi của kế hoạch đóng gói (tự tính, chấp nhận & đóng, chỉnh tay, từ chối, quét, niêm phong, kiện lệch cân, sự cố, tháo kiện, nguồn thùng) nằm ở **`INTEGRATION_GUIDE_PACKING.md`** — đọc ở đó. FE đã nối đủ (21/10/2026), riêng mục 3.4.1 nguồn thùng còn chờ làm.

## Nghiệp vụ 2 — Phân công nhân viên (Staff Assignment)

### Bối cảnh xảy ra
🔄 **ĐÃ ĐỔI (21/09/2026)** — ngay khi Order Group được TẠO (lúc đồng bộ/gộp đơn), hệ thống tự gán Warehouse Staff và chuyển group sang `picking` (trước đây chờ tới khi approve gợi ý đóng gói). Nếu tự gán lỗi (chưa có Warehouse Staff active), group vẫn được tạo, Admin gán tay qua `POST .../assign`. Mục đích: biết ngay **AI đi lấy hàng**. Không có bước này, đơn "trôi nổi" không ai chịu trách nhiệm xử lý.

### Cơ chế tự động — thuật toán "Ít việc nhất" (Least-Busy)
```
Hệ thống đếm: mỗi Warehouse Staff đang active có bao nhiêu Order Group
              CÒN Ở BƯỚC LẤY HÀNG (awaiting_packaging, picking, partial_needs_review)
              🔄 21/10/2026: trước đây đếm mọi nhóm chưa giao xong → người lấy xong
              nhiều nhóm (đã sang đóng gói/giao) bị coi là bận nhất dù đã rảnh tay
→ Chọn người có số ít nhất
→ Hòa nhau → chọn người được gán việc lần GẦN NHẤT LÂU HƠN (tính trên MỌI
  nhóm từng giao, ai "nghỉ tay" lâu nhất được ưu tiên; chưa từng được giao
  thì ưu tiên nhất) — round-robin theo thời
  gian, KHÔNG phải theo `_id` (đã sửa mô tả 16/09/2026 cho khớp code
  thật — cách này công bằng hơn `_id` cố định, tránh việc hòa điểm luôn
  ưu tiên đúng 1 người)
```
Đây là phép đếm **real-time**, KHÔNG lưu sẵn 1 con số "đang có bao nhiêu việc" cho từng nhân viên — tránh tình trạng số liệu bị lệch (quên cập nhật khi đơn hoàn thành).

### Tình huống cần đổi tay — bối cảnh thực tế
- Nhân viên đang phụ trách đột xuất nghỉ/bận việc khác
- Đơn chuyển thành Hỏa Tốc, cần người có kinh nghiệm xử lý nhanh hơn
- Nhân viên tự thấy mình đang quá tải, muốn nhường bớt việc

Cả 3 tình huống trên **dùng chung đúng 1 API** (`POST /order-groups/:id/assign`, có `staff_id`) — hệ thống KHÔNG phân biệt lý do đổi tay là gì, không cần route riêng cho từng tình huống.

### DB liên quan — field trên `OrderGroup`

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `assigned_staff_id` | ObjectId\|null | Ai đang phụ trách — `null` nghĩa là chưa gán ai |
| `assigned_at` | Date\|null | Lúc gán gần nhất |
| `assignment_type` | `'auto'\|'manual'\|null` | Lần gán gần nhất là tự động hay đổi tay — audit, KHÔNG ảnh hưởng logic nghiệp vụ nào |

---

## 🆕 Nghiệp vụ 2b — Thiết lập kho (Warehouse Setup) — MỚI, bổ sung 16/09/2026, viết lại dễ hiểu hơn 20/09/2026

> 🔄 **ĐÃ ĐỔI (26/09/2026)** — phần quản lý kho đã tách thành file riêng **`INTEGRATION_GUIDE_WAREHOUSE.md`** (thêm sửa/vô hiệu hóa kho-khu-kệ, Product Master, các lỗi mới khi thao tác trên kho đã tắt, và lộ trình làm lại kho K2-K5). Mục 2b dưới đây giữ nguyên để tham chiếu 4 bước tạo kho; mọi thay đổi mới chỉ cập nhật ở file kho.

**Vì sao mục này mới xuất hiện dù `warehouse/` đã có từ trước**: các mục khác trong file chỉ nói tới việc **DÙNG** dữ liệu kho (Picking đọc `bin_location`/`sku_bin_assignment` đã có sẵn) — nhưng chưa từng có hướng dẫn cho bước **TẠO RA** dữ liệu đó (Admin phải làm TRƯỚC KHI bất kỳ đơn nào có thể Picking). Đây là khoảng trống tài liệu thật, không phải do API mới — chỉ là tới giờ mới rà thấy.

### Hình dung bằng đời thực trước khi đọc kỹ thuật

4 bước dưới đây tương ứng đúng 4 việc bạn làm khi **mở 1 kho hàng thật ngoài đời**, theo đúng thứ tự không thể đảo:

```
1. THUÊ 1 CĂN NHÀ           → Bước 1: Tạo KHO
2. DÁN BẢNG CHIA KHU        → Bước 2: Tạo KHU (trong kho đó)
3. ĐÓNG KỆ SẮT, ĐÁNH SỐ     → Bước 3: Sinh KỆ (trong khu đó)
4. DÁN TEM SẢN PHẨM LÊN KỆ  → Bước 4: Gán SKU vào 1 kệ
```

Không thể dán tem sản phẩm lên 1 cái kệ **chưa từng được đóng** — đó là lý do 4 bước này **bắt buộc đúng thứ tự**, bước sau luôn cần "địa chỉ" do bước trước tạo ra.

### Bối cảnh — ai làm, khi nào

**Admin làm 1 LẦN lúc setup ban đầu** (hoặc mỗi khi mở kho mới/thêm SKU mới):

```
Bước 1: Tạo KHO ──► Bước 2: Tạo KHU (trong kho đó)
                              │
                              ▼
Bước 4: Gán SKU vào 1 kệ ◄── Bước 3: Sinh HÀNG LOẠT kệ (trong khu đó)
```

**Ví dụ xuyên suốt dùng cho cả 4 bước bên dưới**: bạn mở 1 kho ở Quận 7 để chứa ốp lưng điện thoại đang bán trên Lazada.

### Bước 1 — Tạo kho (= thuê 1 căn nhà)

```
POST /warehouse/warehouses
Body: { "warehouse_code": "WH-HCM-01", "warehouse_name": "Kho TP.HCM - Quận 7", "address": "123 Đường ABC, Quận 7, TP.HCM" }
→ 201: { "id": "...", "warehouseCode": "WH-HCM-01", "warehouseName": "...", "address": "...", "isActive": true }
```

Chỉ vậy — hệ thống giờ biết "có 1 kho tên WH-HCM-01", nhưng kho còn **trống trơn**, chưa chia khu, chưa có kệ nào.

Xem lại: `GET /warehouse/warehouses` — danh sách toàn bộ kho. 🔄 **ĐÃ ĐỔI (19/09/2026)** — route này giờ mở thêm cho **Warehouse Staff** (trước chỉ Admin) — vì `picking-list`/`pick-item`/`report-missing` (Warehouse Staff phải gọi hàng ngày) đều bắt buộc `warehouse_id`, cần có cách để họ tự biết ID kho mình đang làm việc, không hardcode tay.

### Bước 2 — Tạo khu TRONG kho đó (= dán bảng chia khu trong nhà kho)

```
POST /warehouse/warehouses/:warehouseId/zones
Body: { "zone_code": "A", "zone_name": "Phụ kiện điện tử", "description": "Khu chứa cáp sạc, tai nghe, phụ kiện nhỏ" }  // description optional
→ 201: { "id": "...", "warehouseId": "...", "zoneCode": "A", "zoneName": "...", "description": "..." }
```

Với ví dụ đang dùng: `zone_code: "A"`, `zone_name: "Phụ kiện điện thoại"` — giờ trong kho WH-HCM-01 có 1 khu tên "A" chuyên chứa ốp lưng/phụ kiện.

**Lưu ý dễ nhầm**: `zone_code` chỉ cần **duy nhất TRONG 1 kho**, không phải duy nhất toàn hệ thống — mở thêm 1 kho ở Hà Nội, khu ở đó cũng đặt tên "A" được bình thường, 2 kho là 2 "thế giới" tách biệt hoàn toàn (xem lý do thiết kế kỹ hơn ở tài liệu giảng giải hệ thống, mục II.7).

Xem lại: 🔄 `GET /warehouse/warehouses/:warehouseId/zones` (đã sửa lỗi 16/09/2026 — trước đây có thể không trả ra dữ liệu dù tạo thành công).

### Bước 3 — Sinh HÀNG LOẠT kệ trong khu đó (= đóng kệ sắt, đánh số từng ngăn — không đóng tay từng cái)

```
POST /warehouse/zones/:zoneId/bin-locations/generate
Body: { "aisle": "03", "rack_from": 1, "rack_to": 10, "level_from": 1, "level_to": 4 }
→ 201: { "created": 40 }   // 10 rack × 4 level = 40 kệ, sinh trong 1 lần gọi (bulkWrite, xem tài liệu giảng giải mục III.6)
```

Thay vì gọi API 40 lần để tạo tay từng ngăn kệ, chỉ cần khai "tôi muốn dãy 03, kệ số 1 tới 10, mỗi kệ 4 tầng" — hệ thống **tự sinh ra đủ 40 vị trí trong 1 lần gọi**, tự đặt tên dạng `"{zone_code}-{aisle}-{rack:02}-{level:02}"` (VD `"A-03-01-01"` = khu A, dãy 03, kệ 01, tầng 01). FE **không cần tự nghĩ tên kệ**, chỉ cần khai đúng khoảng (range).

⚠️ Gọi lại ĐÚNG khoảng đã tạo trước đó **không báo lỗi, không tạo trùng** (idempotent — `upsert`) — an toàn nếu Admin lỡ bấm 2 lần. Nhưng KHÔNG dùng tính chất này để "sinh thêm" — muốn mở rộng khoảng, gọi API MỚI với range khác (VD `rack_from: 11, rack_to: 15`), đừng gọi lại range cũ với ý định "cộng thêm".

Xem lại (🆕 MỚI 16/09/2026 — trước đây KHÔNG có cách nào xem lại):

```
GET /warehouse/zones/:zoneId/bin-locations              → kệ trong 1 khu
GET /warehouse/warehouses/:warehouseId/bin-locations    → TOÀN BỘ kệ trong 1 kho (mọi khu gộp)
→ 200: [{ "id": "...", "warehouseId": "...", "zoneId": "...", "binCode": "A-03-01-01", "aisle": "03", "rack": 1, "level": 1 }, ...]
```

### Bước 4 — Gán 1 sản phẩm CỤ THỂ vào 1 kệ CỤ THỂ (= dán tem sản phẩm lên đúng 1 ngăn kệ)

```
POST /warehouse/warehouses/:warehouseId/sku-bin-assignments
Body: {
  "platform": "lazada", "shop_id": "201171264532", "seller_sku": "OPLUNG-IP15",
  "bin_location_id": "<id của A-03-01-01, lấy từ response Bước 3 hoặc từ GET xem lại>",
  "initial_quantity": 0   // OPTIONAL, mặc định 0 — có thể gán vị trí TRƯỚC, nhập hàng SAU qua bước Restock
}
→ 201: { "id": "...", "warehouseId": "...", "platform": "lazada", "shopId": "...", "sellerSku": "OPLUNG-IP15", "binLocationId": "...", "quantityOnHand": 0 }
```

Giờ hệ thống biết chính xác: "ốp lưng iPhone 15 nằm ở đúng kệ A-03-01-01" — đây là mảnh ghép CUỐI CÙNG, sau bước này SKU đã sẵn sàng để tính vào Picking List khi có đơn.

**Nhập thêm hàng sau đó** (nghiệp vụ RIÊNG, không phải gán lại):

```
POST /warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock
Body: { "quantity": 50 }   // CỘNG DỒN vào quantityOnHand hiện có, KHÔNG ghi đè
```

🔄 **ĐÃ ĐỔI (01/10/2026)** — nhập thêm hàng, danh sách khu, danh sách ô của kho và danh sách SKU đã gán mở thêm cho **Warehouse Staff** (trước đây chỉ Admin, nhân viên kho bị `403`). Bốn bước tạo kho → khu → kệ → gán SKU ở trên vẫn chỉ Admin. Màn hình "Tồn kho theo vị trí" cho nhân viên kho: `INTEGRATION_GUIDE_WAREHOUSE.md` PHẦN B5.

Xem lại (🆕 MỚI 16/09/2026): `GET /warehouse/warehouses/:warehouseId/sku-bin-assignments` — toàn bộ SKU **ĐÃ** gán trong 1 kho. **Dễ nhầm với route đã có từ trước** `GET /warehouse/sku-bin-assignments/unassigned` — route ĐÓ trả chiều NGƯỢC LẠI: SKU nào TRONG hệ thống nhưng **CHƯA** gán vị trí nào (để Admin biết còn SKU nào cần làm Bước 4). Tóm gọn: `unassigned` = "còn việc phải làm", route mới = "đã làm xong" — 2 route trả 2 tập dữ liệu ĐỐI LẬP nhau.

### Mã lỗi riêng mục này

| Mã                            | HTTP    | Khi nào                                                                                                |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `WH_WAREHOUSE_NOT_FOUND`      | 404/400 | `warehouseId` không tồn tại hoặc sai định dạng ObjectId                                                |
| `WH_ZONE_NOT_FOUND`           | 404/400 | `zoneId` không tồn tại hoặc sai định dạng ObjectId                                                     |
| `WH_INVALID_BIN_RANGE`        | 400     | `rack_from > rack_to` hoặc `level_from > level_to` ở Bước 3                                            |
| 🆕 `WH_WAREHOUSE_CODE_IN_USE` | 409     | **MỚI (19/09/2026)** — `warehouse_code` đã tồn tại (trước đây rơi 500 thô, xem báo cáo thật đồng đội)  |
| 🆕 `WH_ZONE_CODE_IN_USE`      | 409     | **MỚI (19/09/2026)** — `zone_code` đã tồn tại TRONG CÙNG 1 kho (2 kho khác nhau vẫn đặt trùng mã được) |

---

## Nghiệp vụ 3 — Lấy hàng (Picking) — nghiệp vụ có nhiều tình huống nhất

### Bối cảnh xảy ra
🔄 **ĐÃ ĐỔI (21/09/2026)** — Order Group ở `picking` ngay sau khi tạo, đã có người phụ trách (`assigned_staff_id`) — chưa có gợi ý đóng gói (gợi ý tính sau khi lấy xong). Warehouse Staff cần đi lấy đúng sản phẩm, đúng số lượng, từ đúng vị trí kệ.

### Tình huống chính (happy path) — 2 cách làm, tùy mức độ chi tiết muốn theo dõi

**Cách A — theo dõi từng món (khuyến nghị, có audit đầy đủ)**:
```
1. GET /order-groups/:id/picking-list           → xem cần lấy SKU nào, số lượng bao nhiêu
2. GET /warehouse/:warehouseId/picking-list/:groupId → BẢN CÓ VỊ TRÍ KỆ, đã sắp xếp theo lộ trình đi
3. Với MỖI SKU: POST .../fulfillment/pick-item   → quét/nhập tay, trừ tồn kho NGAY
4. Sau khi lấy hết: POST .../fulfillment/pick    → server đối soát đủ số lượng, group chuyển "picked"
```

🔄 **ĐÃ SỬA (07/10/2026)** — trước ngày này bước 2 có thể trả `bin_code: "CHƯA GÁN VỊ TRÍ"` và bước 3 trả `409 ORD_GROUP_INSUFFICIENT_STOCK` **dù kho đã gán đúng và còn hàng**: BE truy vấn `warehouse_id` dạng chuỗi trong khi schema bị Mongoose hiểu là kiểu Mixed nên không tự đổi sang ObjectId. Đã sửa ở BE (schema 35 trường id + truy vấn), kèm 2 cải tiến từ nhánh `feature/viet_befe`: (a) SKU đã nối SKU nội bộ nhưng tồn chưa "Đồng bộ tồn" vẫn được tìm thấy; (b) so `seller_sku` không phân biệt hoa thường. FE giữ nguyên cách gọi: gửi `warehouse_id` là chuỗi id kho, `sku` là mã sản phẩm trong đơn (`item.sku`), `bin_location_id` lấy từ dòng Picking List. Dòng có `bin_location_id = null` nên khóa nút quét (xem `INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md` mục 0b.5). Chi tiết lỗi và việc chạy script chuyển dữ liệu: `INTEGRATION_GUIDE_WAREHOUSE.md` PHẦN B6.

🔄 **ĐÃ ĐỔI (15/09/2026)** — cả 2 API lấy danh sách ở trên đều tự động **loại bỏ SKU thuộc đơn đã `canceled` hoặc gặp sự cố logistics** (`lost`, `damaged_by_3pl`... xem `INTEGRATION_GUIDE_ORDERS.md` mục 7b) khỏi danh sách cần lấy — trước đây KHÔNG lọc, nhân viên có thể bị yêu cầu đi lấy hàng cho đơn đã hủy/mất. Trường hợp TOÀN BỘ đơn trong group đều rơi vào 2 nhóm này (group rỗng sau khi lọc) → API trả lỗi `ORD_GROUP_ALL_ORDERS_CANCELED` (409) thay vì trả về danh sách rỗng — FE nên bắt riêng mã lỗi này, hiện thông báo rõ ràng ("Nhóm đơn này không còn gì cần lấy") thay vì hiểu nhầm là màn hình trắng/lỗi tải dữ liệu.

### 🆕 Phân biệt nhóm đơn có đơn đã hủy ngay trên danh sách (01/10/2026)

**Vấn đề trước đây:** danh sách nhóm đơn chỉ có `orderCount`. Hệ thống đã lọc đơn hủy ở tầng hàng cần lấy (Picking List, gợi ý đóng gói), nhưng trên **danh sách** thì nhóm bình thường, nhóm hủy một phần và nhóm hủy hết trông giống nhau — nhân viên phải mở từng nhóm mới biết.

**Từ 01/10/2026**, mọi response nhóm đơn (`GET /order-groups`, `GET /order-groups/:id` và các route thao tác trả về nhóm đơn) có thêm 2 trường:

| Trường               | Ý nghĩa                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `activeOrderCount`   | Số đơn **còn phải xử lý** — cùng quy tắc với Picking List: đơn không bị hủy và không gặp sự cố vận chuyển |
| `canceledOrderCount` | Số đơn có trạng thái `canceled`                                                                           |

Ví dụ nhóm 2 đơn, khách hủy 1 đơn:

```json
{ "id": "6a9c18292fced4f442f6e1b1", "orderCount": 2, "activeOrderCount": 1, "canceledOrderCount": 1, "fulfillmentStatus": "picking", ... }
```

🆕 **(09/10/2026) Xem đơn nào bị hủy, món gì:** `GET /order-groups/:id` trả thêm `orders[]` — mỗi đơn có `platformOrderId`, `status`, `recipient` (`fullName`, `phone`, `addressLine1`, `addressLine2`, `city`) và `items[]` đã gộp theo SKU + biến thể + trạng thái (`sku`, `name`, `variation`, `status`, `quantity`, `unitPrice`, `lineTotal`, `platformOrderItemIds`). Gồm cả đơn đã hủy. Warehouse/Packaging/Shipping xem được (không cần quyền `GET /orders`).

🆕 **(09/10/2026) Lọc + phân trang danh sách:** `GET /order-groups?fulfillment_status=picking&assigned_staff_id=<id>` = "việc của tôi"; `stock_shortage=true` = nhóm thiếu hàng; `is_overdue=true` = hỏa tốc quá hạn. Danh sách vẫn là mảng mới nhất trước, mặc định 100 dòng (`limit` tối đa 200); trang kế gửi `before=<createdAt của dòng cuối>`.

**Quy tắc hiển thị trên FE:**

| Điều kiện                                        | Hiển thị                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `canceledOrderCount === 0`                       | Bình thường                                                                                                                                                  |
| `activeOrderCount > 0 && canceledOrderCount > 0` | Nhãn **"Một phần đã hủy"** (ví dụ "1/2 đơn đã hủy"). Nhóm vẫn lấy hàng bình thường; Picking List đã tự bỏ hàng của đơn hủy                                   |
| `activeOrderCount === 0`                         | **"Không còn hàng cần xử lý"** — ẩn khỏi hàng đợi "Cần lấy", đưa sang tab "Đã hủy". Mở Picking List của nhóm này sẽ nhận `409 ORD_GROUP_ALL_ORDERS_CANCELED` |

`orderCount − activeOrderCount − canceledOrderCount` = số đơn gặp sự cố vận chuyển (`lost`, `damaged_by_3pl`...). Thường bằng 0.

**Cách demo:** chọn 1 nhóm có 2 đơn Lazada → hủy 1 đơn trên Lazada (hoặc dùng dữ liệu có sẵn đơn `canceled`) → chờ đồng bộ (tối đa 10 phút, hoặc Admin bấm đồng bộ tay) → tải lại danh sách: nhóm hiện nhãn "Một phần đã hủy", `activeOrderCount: 1`, `canceledOrderCount: 1`. Mở Picking List: chỉ còn hàng của đơn chưa hủy.

**Nguồn số liệu:** API luôn đếm trực tiếp từ trạng thái đơn trong collection `orders` tại thời điểm gọi, nên số trả cho FE luôn đúng, kể cả nhóm đơn tạo từ trước.

**Bản lưu sẵn trong DB:** mỗi document `order_groups` có thêm `active_order_count`, `canceled_order_count` và `order_counts_refreshed_at`. Các trường này được cập nhật mỗi lần đồng bộ chạm tới nhóm (đơn mới, đơn đổi trạng thái, đơn gộp đến muộn, đơn đổi hàng `EXC-`), dùng để xem trực tiếp trong Compass và làm nền cho bộ lọc phía BE sau này. FE **không** đọc các trường này; FE dùng `activeOrderCount` / `canceledOrderCount` trong response.

**Dữ liệu cũ:** nhóm đơn tạo trước ngày 01/10/2026 chưa có bản lưu sẵn (giá trị `null` hoặc không có trường) cho tới khi được đồng bộ lại. Chạy script một lần cho mỗi môi trường để điền đủ:

```bash
cd be
npx ts-node -r dotenv/config scripts/backfill-order-group-counts.ts
```

Script chạy lại nhiều lần vẫn an toàn (tính lại từ đầu, ghi đè cùng giá trị), không đổi trường nào khác và không tăng `__v` của nhóm đơn, nên không ảnh hưởng `expected_version` FE đang giữ. API vẫn trả số đúng dù chưa chạy script.

**Hạn chế hiện tại và hướng khắc phục:**

| Hạn chế                                                                                                                     | Ảnh hưởng                                                                                                                                                                                                                                       | Hướng khắc phục                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Nhóm hủy hết **chưa có trạng thái riêng**: vẫn giữ `fulfillmentStatus` cũ, vẫn giữ chỗ tồn kho (K5), vẫn giao cho nhân viên | Ẩn khỏi màn hình nhưng tồn khả dụng vẫn bị trừ                                                                                                                                                                                                  | Bước sau: trạng thái `cancelled`, giải phóng giữ chỗ, gỡ phân công, phiếu cất hàng đã lấy về kệ            |
| Chưa lọc được ở BE (ví dụ `?exclude_fully_canceled=true`)                                                                   | FE ẩn nhóm hủy hết sau khi nhận danh sách → số dòng hiển thị có thể ít hơn giới hạn 100                                                                                                                                                         | Số đếm đã được lưu sẵn trên nhóm đơn (01/10/2026). Bộ lọc phía BE sẽ thêm cùng bước trạng thái `cancelled` |
| Hủy **một phần** không giải phóng phần giữ chỗ của đơn đã hủy                                                               | Tồn khả dụng thấp hơn thực tế cho tới khi Admin/Store Owner bấm "Tính lại giữ chỗ" (`POST /order-groups/:id/stock-reservation/recheck`) hoặc nhóm được lấy hàng xong. Với nhóm hủy hết, tính lại cũng không nhả được (không còn hàng cần xử lý) | Làm cùng bước trạng thái `cancelled`                                                                       |

🔄 **ĐÃ ĐỔI (19/09/2026, báo cáo thật Hải Phượng)** — bước 3 (`POST .../fulfillment/pick-item`) giờ **kiểm tra SKU quét THẬT SỰ thuộc group này** TRƯỚC KHI trừ tồn kho — trước đây trừ tồn thẳng theo mã vạch quét được, không hỏi lại SKU đó có nằm trong đơn nào của group không (quét nhầm mã vạch SKU bất kỳ, miễn còn tồn kho, vẫn trừ tồn thật, sai lệch dữ liệu). Nếu SKU không thuộc group → trả lỗi `ORD_GROUP_ITEM_NOT_IN_GROUP` (404), **KHÔNG đụng tới tồn kho**. FE nên bắt riêng mã lỗi này khi quét (VD hiện "Mã vạch này không thuộc đơn đang lấy, kiểm tra lại") — khác hẳn lỗi `ORD_GROUP_INSUFFICIENT_STOCK` (409, SKU đúng nhưng không đủ hàng).

🆕 **ĐÃ ĐỔI (21/09/2026, BE-4a)** — luồng lấy hàng được server kiểm soát chặt:
- `pick-item` chỉ chạy khi group đang `picking` (khác → 409 `ORD_GROUP_PICK_NOT_ALLOWED`).
- Tổng đã quét của 1 SKU trong **lượt lấy hiện tại** không được vượt số đặt → 409 `ORD_GROUP_PICK_EXCEEDS_ORDERED` (details: `orderedQuantity`, `alreadyPicked`).
- Trừ tồn + ghi `pick_event` trong **1 transaction** (lỗi ghi event thì tồn kho rollback); 2 lần quét đồng thời bị tuần tự hóa; gửi lại cùng `client_event_id` trả kết quả cũ.
- `pick-item` **không cần hồ sơ đóng gói** (trước đây SKU chưa đo cũng chặn luôn việc lấy hàng).
- **Đường tắt "bấm pick không quét" đã bị chặn**: `pick` đối soát mọi SKU đã quét đủ; thiếu → 409 `ORD_GROUP_PICK_INCOMPLETE`, `details.missing = [{ sku, orderedQuantity, pickedQuantity }]` → dùng `report-missing`.

### Tình huống quét thất bại — nhân viên phải làm gì

| Tình huống | Cách xử lý |
|---|---|
| Camera hỏng/lag | Nhập tay mã SKU (`scan_method: "manual"`) |
| Tem mã vạch rách/mờ | Nhập tay, hệ thống ghi nhận `scan_method: "manual"` để sau này Admin biết cần in lại tem |
| **Mất mạng đúng lúc quét** | Client giữ `client_event_id` và gửi lại. 🔄 21/09: trừ tồn + ghi event cùng transaction, unique `client_event_id`; gửi lại (kể cả đồng thời) trả kết quả lần đầu, không trừ lần 2. (Chưa so khớp nội dung khi cùng key nhưng khác SKU/số lượng.) |
| Quét nhầm mã (SKU không thuộc đơn này) | Server chặn `ORD_GROUP_ITEM_NOT_IN_GROUP` (19/09), không chạm tồn kho; quét dư số đặt → `ORD_GROUP_PICK_EXCEEDS_ORDERED` (21/09) |

### Tình huống THIẾU HÀNG — nghiệp vụ quan trọng nhất trong Picking

**Bối cảnh thật**: nhân viên tới đúng kệ nhưng hàng thực tế không đủ (đã bán hết trên hệ thống nhưng chưa cập nhật kho, hoặc hàng lỗi phải loại bỏ).

**KHÔNG được tự ý xử lý** — quy trình bắt buộc:
```
1. POST .../fulfillment/report-missing
   { sku, missing_quantity, warehouse_id, note?, expected_version }
   → OrderGroup.fulfillment_status = "partial_needs_review"
   → Store Owner + 🔄 (09/10) Packaging Staff NHẬN THÔNG BÁO NGAY (in-app + email, mức "critical")
   → Group đổi trạng thái chờ xem lại; 🔄 21/09: pick-item bị chặn khi group không ở `picking`

2. [PACKAGING STAFF, không phải Warehouse Staff] xem lại, quyết định:
   POST .../fulfillment/decide-partial
   { approve: true }   → "picked" với phần đã lấy; phương án đóng gói tính trên số đã quét
                         (đơn không nhận được món nào sẽ không có phương án)
   { approve: false }  → hủy lượt, quay lại "picking" và MỞ LƯỢT LẤY MỚI
                         (`pick_round + 1` — số đã quét của lượt cũ không còn được cộng).
                         🔄 (gộp 04/10, sửa tài liệu 09/10) Hàng đã quét của lượt cũ TỰ CỘNG LẠI
                         đúng ô đã lấy (sổ kho loại `pick_cancel`); lần quét cũ không lưu ô thì kho đối soát tay.
```

**Tại sao Warehouse Staff không tự quyết định được** (thiết kế có chủ đích, không phải giới hạn kỹ thuật): quyết định "giao thiếu hàng cho khách" là quyết định kinh doanh (ảnh hưởng trải nghiệm khách hàng, có thể cần bồi thường/giải thích) — không nên để 1 nhân viên kho tự ý quyết ngay tại chỗ.

### DB liên quan — `PickEvent` (log mỗi lần quét, KHÔNG phải trạng thái, chỉ để audit + chống trùng)

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `order_group_id` | ObjectId | Nhóm đơn nào |
| `seller_sku` | String | SKU nào |
| `scanned_quantity` | Number | Số lượng đã quét/nhập lần này |
| `scan_method` | `'barcode'\|'manual'` | Quét thật hay nhập tay — audit |
| `client_event_id` | String\|null | Chỉ có nếu Mobile App gửi (offline-sync) — unique có điều kiện, chống trừ trùng |
| `remaining_stock_after` | Number | Tồn kho CÒN LẠI sau lần trừ này — snapshot tại thời điểm đó |
| `pick_round` | Number | 🆕 21/09 — lượt lấy hàng của group lúc quét (event cũ = 0) |

### DB liên quan — `quantity_on_hand` trên `SkuBinAssignment` (đã có ở Nghiệp vụ Warehouse, nhắc lại vì Picking trực tiếp thay đổi field này)

Trừ bằng lệnh atomic — kiểm tra ĐỦ HÀNG và trừ trong CÙNG 1 lệnh MongoDB (`findOneAndUpdate` kèm điều kiện `quantity_on_hand: {$gte: số_lượng}`) — tránh tình huống 2 nhân viên quét cùng lúc 1 SKU sắp hết mà cả 2 đều "trừ được" (race condition).

---

## Nghiệp vụ 4 — Đóng gói vật lý & Vận chuyển

### Bối cảnh
Kế hoạch đã duyệt (nhóm `approved_for_packing`) → nhân viên đóng gói vật lý theo từng bước, cân từng kiện, rồi bàn giao vận chuyển.

🆕 **05/10/2026:** cách chính là **phiên đóng gói theo từng kiện** (quét → niêm phong + cân, kiện lệch chờ xem lại) — xem **Nghiệp vụ 1b**. Mục dưới mô tả lối tắt `pack` (vẫn dùng được).

```
[PACKAGING STAFF/ADMIN] approve → packing; [PACKAGING STAFF, WAREHOUSE STAFF, ADMIN] scan → seal từng kiện (hoặc lối tắt POST .../packing-plan/pack) → "packed"
[SHIPPING COORDINATOR] POST /shipments/batch (hoặc .../fulfillment/ship) → "shipped"
[SHIPPING COORDINATOR] POST .../fulfillment/deliver  → "delivered"
```

🔄 **ĐÃ THAY ĐỔI 04/10/2026** — `POST .../fulfillment/pack` đã gỡ, thay bằng `POST /order-groups/:groupId/packing-plan/pack`:
```json
{ "expected_version": 4,
  "parcels": [ { "parcel_no": 1, "weight_kg": 6.2 }, { "parcel_no": 2, "weight_kg": 5.9 } ] }
```
- `expected_version` là **version của kế hoạch** (không phải version nhóm).
- Phải cân **đủ mọi kiện, mỗi kiện đúng 1 lần** (thiếu/trùng/sai số kiện → 400 `PACKING_PACK_WEIGHTS_MISMATCH`). `parcel_no` đánh số 1..N trong **cả nhóm**, không đếm lại theo đơn.
- Cùng 1 transaction: kế hoạch `packed`, nhóm `packed`, **trừ 1 thùng/kiện** (hết thùng → 409 `PKG_BOX_OUT_OF_STOCK`, không chuyển gì) và trừ vật tư (thiếu vật tư **không chặn**: trừ phần có, ghi `materialsShortfall`, thông báo `low_material_stock`). Tồn rơi xuống ≤ ngưỡng → `low_box_stock`.
- ~~Mỗi kiện so với `estimatedWeightG` (hàng + bì + vật tư): lệch > 20% → `parcels[i].isAbnormal: true` + thông báo Store Owner (`abnormal_package`), **không chặn**.~~ 🔄 **ĐÃ ĐỔI 05/10/2026:** lệch quá ngưỡng (mặc định 20%, chỉnh ở `/packing/settings`) → kiện `held`, nhóm **chưa** `packed` tới khi người khác xem lại (Nghiệp vụ 1b); thông báo `packing_parcel_held` cho Packaging Staff + Store Owner. Lối tắt chỉ cân cho các kiện **chưa niêm phong**; response thêm `completed`.
- Response `{ plan, completed }` (🔄 10/10/2026: chỉ ghi trạng thái đóng gói trong OptiPack). Màn FE: nút "Bắt đầu đóng gói" ở `/app/packing/:groupId` mở chế độ toàn màn hình (Nghiệp vụ 1). Ship/deliver vẫn mô phỏng nội bộ theo phạm vi đồ án.

### ❌ ĐÃ BỎ (10/10/2026) — Báo "đã đóng gói" lên Lazada

Trạng thái `packed` chỉ ghi trong OptiPack, không ghi ngược lên Lazada. Response không còn `lazadaPackSync`/`lazadaPack`; route `POST /order-groups/:id/lazada-pack/retry` đã xoá. FE xoá mã còn sót (`FE_UPDATE_CHECKLIST.md` mục 3).

### Hoàn hàng — có thể xảy ra ở 2 thời điểm khác nhau

```
Từ "shipped"   → return: khách từ chối nhận / hủy giữa đường
Từ "delivered" → return: khách trả hàng SAU KHI đã nhận (đổi ý, hàng lỗi phát hiện muộn)
```
Cả 2 tình huống dùng chung `POST .../fulfillment/return` — role cho phép CẢ Shipping Coordinator (phát hiện lúc giao) LẪN Warehouse Staff (phát hiện lúc soạn lại hàng hoàn về kho).

---

## Nghiệp vụ 5 — Đơn Hỏa Tốc & Cảnh báo SLA

### Bối cảnh xảy ra
Có những đơn cần xử lý NHANH HƠN bình thường (khách yêu cầu giao gấp, đơn VIP...). **Đã xác minh 2 lần độc lập bằng doc thật của Lazada**: sàn KHÔNG cung cấp tín hiệu tự động để biết đơn nào gấp — nên đây LUÔN LÀ quyết định do con người đưa ra.

### Luồng
```
[STORE OWNER hoặc ADMIN]
PATCH /order-groups/:id/priority
{ order_priority: "express", deadline_hours: 4 }   // deadline_hours mặc định 4 nếu bỏ trống

→ Hệ thống tự tính packaging_deadline = NGAY BÂY GIỜ + 4 GIỜ LÀM VIỆC
  (8h-17h, TÍNH CẢ THỨ 7, KHÔNG tính Chủ Nhật — nếu tạo lúc 16h, phần dư giờ
   tự động cộng dồn sang 8h sáng ngày làm việc kế tiếp, KHÔNG được cộng
   đơn giản kiểu "16h + 4h = 20h")
```

### 🆕 29/10/2026 — Hỏa tốc do khách AURELLE chọn (shop tự giao 3 giờ)

Khác đơn Lazada đánh dấu tay ở trên (vẫn giữ nguyên): khách tự chọn "Giao hỏa tốc" trên website khi phường thuộc danh sách và đặt 8:00–14:00 thứ 2 – thứ 7.

```
Khách đặt lúc T  →  website lưu promised_delivery_at = T + 3h, gửi sang OptiPack qua Open API
OptiPack nhận đơn → 1 đơn = 1 nhóm (không gộp với đơn khác), tự gắn:
    order_priority = express, requires_self_delivery = true,
    packaging_deadline = T + 1h, delivery_deadline = T + 3h
→ nhóm ghim đầu mọi hàng chờ (lấy, đóng, tạo vận đơn)
→ đóng xong → Coordinator tạo vận đơn TỰ GIAO, chọn shipper (tài khoản Shipping Coordinator)
    POST /shipments { order_group_id, shipper_id }   (không chọn hãng, không gộp chuyến)
→ chỉ shipper đó (hoặc Admin) bấm giao thành công / thất bại / giao lại
→ tên + SĐT shipper gửi về website cùng trạng thái giao
```

Vì sao tự giao: GHN chỉ nhận dịch vụ Hàng nhẹ (2) và Hàng nặng (5), nội tỉnh giao trong ngày, không có gói 2–3 giờ (kiểm 28–29/10 bằng `be/scripts/ghn-check-services.ts`).

### Cron cảnh báo — 🔄 ĐÃ THAY ĐỔI 29/10/2026 (trước: 10 phút/lần, 2 mốc, không xét trạng thái nhóm → nhóm đã đóng/giao xong vẫn bị báo "QUÁ HẠN")
```
Mỗi PHÚT, mỗi mốc chỉ báo 1 lần (ghi mốc sla_*_at có điều kiện):
  1. Sắp hết hạn đóng gói (hỏa tốc AURELLE: còn ≤ 15 phút; Lazada tay: còn ≤ 1 giờ),
     nhóm CHƯA đóng xong          → nhân viên lấy hàng + người đóng gói (chưa giao ai → cả 2 vai trò)
  2. Quá hạn đóng gói, chưa đóng   → Store Owner + Shipping Coordinator, is_overdue = true
  3. Còn ≤ 15 phút tới giờ hẹn giao, chưa giao xong (chỉ nhóm có delivery_deadline)
                                   → shipper của vận đơn + Shipping Coordinator
  4. Quá giờ hẹn giao, chưa giao   → Store Owner + Admin + shipper, is_overdue = true
Website tự hiện "Trễ" theo giờ hẹn đã lưu trên đơn — không cần OptiPack báo.
```

### DB liên quan — field trên `OrderGroup`

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `order_priority` | `'normal'\|'express'` | Loại đơn |
| `packaging_deadline` | Date\|null | Hạn chót đóng gói — CHỈ có giá trị nếu `express` (AURELLE: giờ đặt + 1 giờ) |
| `is_overdue` | Boolean | Đã quá hạn (đóng gói hoặc giao) — 🔄 29/10 không còn dùng làm cờ "đã báo" |
| 🆕 `requires_self_delivery` | Boolean | Hỏa tốc AURELLE: shop tự giao, bắt buộc chọn shipper, không gộp |
| 🆕 `delivery_deadline` | Date\|null | Giờ hẹn giao khách (giờ đặt + 3 giờ) |
| 🆕 `sla_pack_warned_at`, `sla_pack_breached_at`, `sla_delivery_warned_at`, `sla_delivery_breached_at` | Date\|null | Mốc đã báo — chống báo lặp. Đổi ưu tiên tay thì xoá về null |

Trên vận đơn (`shipments`): 🆕 `shipper_id`, `shipper_name`, `shipper_phone`. Trên đơn (`orders`): 🆕 `delivery_option`, `promised_delivery_at`.

---

## Nghiệp vụ 6 — Thông báo (Notifications)

### Bối cảnh — khi nào hệ thống chủ động báo

| Sự kiện                                                                                                                          | Ai nhận                     | Mức độ   |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------- |
| Báo thiếu hàng (Nghiệp vụ 3) — 🔄 09/10/2026: báo thêm Packaging Staff (người quyết `decide-partial`)                             | Store Owner + Packaging Staff (toàn bộ) | critical |
| 🆕 **09/10/2026** `packing_issue` — kế hoạch bị từ chối được trả về lấy hàng (`back-to-picking`), kèm SKU × số lượng phải lấy lại | Người lấy hàng được giao (không có thì mọi Warehouse Staff) | warning |
| Sắp quá hạn Hỏa Tốc (<1h)                                                                                                        | Đúng 1 người đang phụ trách | warning  |
| Đã quá hạn Hỏa Tốc                                                                                                               | Store Owner (toàn bộ)       | critical |
| **MỚI (15/09/2026)** — Buyer yêu cầu hủy đơn, seller có hạn phản hồi (`cancel_trigger_time`) trước khi Lazada tự động hủy        | Store Owner + Admin (cả 2)  | critical |
| **MỚI (16/09/2026)** — Đồng bộ Lazada thất bại liên tục (VD token hết hạn) — có cơ chế chống spam, tối đa 1 lần/20 phút mỗi shop | Store Owner                 | warning  |
| 🆕 **MỚI (21/09/2026)** — Có kế hoạch đóng gói mới chờ duyệt (🔄 04/10: sau khi job tự tính xong)                                                       | Packaging Staff (toàn bộ)   | info     |
| 🆕 **MỚI (21/09/2026)** — Gợi ý đóng gói bị từ chối, kèm lý do (sau `reject`)                                                    | Admin (toàn bộ)             | warning  |
| 🆕 **05/10/2026** `packing_assigned` — được giao đóng 1 nhóm | Đúng người được giao | info |
| 🆕 **05/10/2026** `packing_parcel_held` — kiện lệch cân chờ xem lại | Packaging Staff + Store Owner | warning |
| 🆕 **05/10/2026** `packing_issue` — món hỏng/thiếu/sai lúc đóng | Store Owner (+ Warehouse Staff khi trả về lấy hàng) | warning |
| 🆕 **05/10/2026** `unpack_required` — đơn hủy sau khi đóng, phải tháo kiện | Packaging Staff + người đóng được giao | warning |
| 🆕 **05/10/2026** `return_to_shelf` — đơn hủy trước khi đóng, đem hàng đã lấy về kệ (kèm SKU, số lượng, mã ô) | Warehouse Staff + người lấy hàng được giao | warning |

> 🔄 **Bug đã sửa (21/09/2026)** — thông báo gửi theo ROLE (broadcast, không đích danh) trước đây có thể "biến mất" ở phía nhận do lệch kiểu dữ liệu (`recipient_role` lưu dạng chuỗi thay vì số) — đã sửa cả schema lẫn logic so khớp, dữ liệu cũ đã chạy migration cập nhật lại. FE không cần đổi gì, chỉ cần biết chuông thông báo giờ đáng tin cậy hơn cho các loại broadcast-theo-role.

> ⚠️ **Hành vi đổi (15/09/2026)** — `PATCH /notifications/:id/read` giờ kiểm tra quyền sở hữu: chỉ đánh dấu đọc được thông báo gửi ĐÍCH DANH mình hoặc gửi BROADCAST cho đúng role của mình. Gọi với ID của thông báo KHÔNG thuộc về mình (dù ID hợp lệ) → trả **404 `NOTI_NOT_FOUND`**, y hệt trường hợp ID sai — FE không nên coi đây là bug nếu test chéo giữa 2 tài khoản khác role.

### Cách FE nhận — Polling (không cần WebSocket)
```
GET /notifications/unread-count    (gọi mỗi 15-30 giây; không bị giới hạn request) → { "count": 3 }
GET /notifications?is_read=false   (khi user bấm vào chuông)
GET /notifications?before=<created_at dòng cuối>&limit=50   (🆕 09/10: trang kế)
PATCH /notifications/:id/read      (khi user đọc xong)
PATCH /notifications/read-all      (🆕 09/10: "Đánh dấu tất cả đã đọc" → { "updated": 5 })
```

🔄 **ĐÃ ĐỔI (09/10/2026)** — response đã map (không còn `_id`, `__v`, `recipient_*`, `read_by`, `channels_sent`); `GET` trả **mảng** mới nhất trước, `PATCH .../read` trả 1 phần tử cùng dạng:

```json
{ "id": "…", "type": "missing_item", "severity": "critical", "title": "…", "message": "…",
  "related_entity_type": "order_group", "related_entity_id": "…", "is_read": false, "created_at": "2026-10-09T02:00:00.000Z" }
```

- `is_read` là trạng thái **của người gọi**. Thông báo broadcast theo role giờ **mỗi người đọc riêng** (lưu `read_by`) — trước đây 1 người bấm đọc là cả role mất thông báo. Thông báo role đã đọc trước 09/10 vẫn coi là đã đọc với mọi người.
- `limit` 1–100 (mặc định 50); `before` phải là thời điểm ISO (sai → 400 `VALIDATION_ERROR`).

Mỗi thông báo có `related_entity_type`/`related_entity_id` (snake_case) — bấm vào **điều hướng thẳng** tới đúng Order Group, không chỉ hiện chữ suông.

🔄 **ĐÃ ĐỔI (07/10/2026)** — `related_entity_id` luôn là id (ObjectId) hoặc `null`. Thông báo `sync_failed` (`related_entity_type: "marketplace_shop"`) trước đây mang **mã shop Lazada** (vd `201171264532`), nay mang **id của shop đã kết nối**; mã shop Lazada vẫn có trong `title`.

### DB liên quan — `Notification`

| Field                                     | Kiểu                            | Ý nghĩa                                                                                                                                                               |
| ----------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recipient_user_id`                       | ObjectId\|null                  | Gửi đích danh 1 người — 1 trong 2 với `recipient_role`, KHÔNG bao giờ cả 2 cùng có giá trị                                                                            |
| `recipient_role`                          | UserRole\|null                  | HOẶC gửi broadcast cho cả 1 role                                                                                                                                      |
| `type`                                    | String                          | Chuỗi snake_case, danh sách đầy đủ ở `be/src/modules/notifications/enums/notification-type.enum.ts` (🔄 09/10: `connection_lost` = mất kết nối sàn; `abnormal_package` có trong enum nhưng không được phát). Bản cũ ghi: 1 trong 10 loại (`missing_item`, `sla_warning`, `sla_breach`, `sync_failed`, `cancel_confirmation_required`, `mfa_disabled`...) — **MỚI (15/09/2026)**: `cancel_confirmation_required`; 🆕 **22/09/2026**: `low_box_stock` (thùng carton xuống ≤ mức cảnh báo sau khi đóng gói, gửi Admin + Store Owner, `relatedEntityType: 'packaging_box'`, `relatedEntityId` = mã thùng) |
| `severity`                                | `'info'\|'warning'\|'critical'` | Mức độ hiển thị (màu sắc/icon)                                                                                                                                        |
| `title`/`message`                         | String                          | Nội dung — văn phong chuyên nghiệp, dựng sẵn từ backend, FE không tự ghép chuỗi                                                                                       |
| `related_entity_type`/`related_entity_id` | String\|null / ObjectId\|null   | Điều hướng khi bấm vào                                                                                                                                                |
| `is_read`                                 | Boolean                         | Đã đọc chưa — dùng cho thông báo đích danh (và thông báo role cũ trước 09/10)                                                                                          |
| `read_by` 🆕 09/10                        | ObjectId[]                      | Thông báo theo role: những người đã đọc. Không trả ra API — FE đọc `is_read` đã tính theo người gọi                                                                    |
| `channels_sent`                           | String[]                        | Đã gửi qua kênh nào (audit — `['in_app']` hoặc `['in_app', 'email']`)                                                                                                 |

---

## Nghiệp vụ 7 — 🆕 Liên kết cùng người nhận, giao chung chuyến & hủy nhóm tự động (Mục 9.5 + N1) — MỚI (29/09/2026)

### Bối cảnh xảy ra

> 🔄 **28/10/2026:** câu "1 đơn = 1 Order Group" bên dưới là thiết kế 29/09. Hiện nay đơn **cùng sàn** cùng người nhận được **gộp vào 1 Order Group** (`consolidation_key`, có tách/gộp tay); mỗi đơn vẫn có **kiện riêng** khi đóng gói. Liên kết ở mục này dùng cho nhóm **khác sàn** hoặc dữ liệu bị che. Toàn bộ luồng đơn gộp: **Nghiệp vụ 9**.

OptiPackAI giờ đồng bộ đơn từ **2 sàn** (Lazada + AURELLE, xem `INTEGRATION_GUIDE_ORDERS.md`). Vì mỗi đơn nguồn vẫn giữ phạm vi đóng gói RIÊNG (1 đơn = 1 Order Group, không tự gộp kiện — xem A.1/quyết định roadmap), một khách hàng THẬT mua ở cả 2 sàn cùng lúc sẽ có 2 Order Group HOÀN TOÀN tách biệt, dù cùng 1 người nhận/1 địa chỉ. Đây là 2 nhu cầu nghiệp vụ khác nhau nảy sinh từ đó:

1. **Biết được** 2 group đó là cùng 1 người (để Shipping Coordinator chủ động cân nhắc giao chung 1 chuyến, tiết kiệm chi phí/thời gian) — nhưng KHÔNG được tự động gộp/ép giao chung (an toàn — có thể 2 đơn cần giao khác thời điểm).
2. **Tùy chọn** tạo 1 "chuyến giao" thật gộp nhiều group lại nếu Shipping Coordinator xác nhận đúng là cùng 1 người, cùng 1 lần đi.

### `recipient_key` — chìa khóa liên kết, KHÁC HẲN `consolidation_key`

| | `consolidation_key` (đã có từ trước) | `recipient_key` (🆕 mới) |
|---|---|---|
| Công thức | `sha256(platform + tên/SĐT/địa chỉ/tỉnh đã chuẩn hóa)` | `sha256(tên/SĐT/địa chỉ/tỉnh đã chuẩn hóa)` — **KHÔNG kèm platform** |
| Mục đích | TỰ ĐỘNG gộp nhiều đơn CÙNG SÀN thành 1 Order Group (đơn hàng, đã có từ đầu) | CHỈ dùng để LIÊN KẾT — không bao giờ tự gộp — các Order Group có thể KHÁC SÀN |
| Khi nào tính | Lúc `tryConsolidate()` xử lý 1 đơn mới | Lúc `getOrCreateGroupForOrder()` tạo Order Group MỚI (tính 1 lần, không đổi lại sau) |

Vì KHÔNG kèm platform, 1 đơn Lazada và 1 đơn AURELLE của CÙNG 1 khách (tên/SĐT/địa chỉ/tỉnh khớp sau chuẩn hóa) sẽ ra CÙNG 1 `recipient_key` — đây chính là cơ chế liên kết xuyên sàn.

### Luồng xem liên kết (không cần thao tác gì, chỉ đọc)

```
GET /order-groups/:id            → response có thêm linkedGroupCount (số nhóm khác cùng người nhận, chưa giao xong)
GET /order-groups/:id/linked     → { linkedGroups: OrderGroupResponse[] } — chi tiết đầy đủ từng nhóm đó
```

"Chưa giao xong" = `fulfillment_status` chưa tới `delivered`/`returned`/`canceled` — nhóm đã giao/hủy xong thì không còn ý nghĩa cảnh báo "lệch nhịp" nữa.

### Cảnh báo lệch nhịp lúc ship — không chặn hành động

```
POST /order-groups/:id/fulfillment/ship
→ response thêm linkedPending: [{ id, fulfillmentStatus }]
```

Nếu Shipping Coordinator ship 1 group trong khi CÒN group khác cùng người nhận CHƯA đóng gói xong (`fulfillmentStatus` chưa tới `packed`), `linkedPending` sẽ liệt kê các group đó — FE nên hiện cảnh báo dạng "Khách này còn 1 đơn khác (Lazada) đang chờ đóng gói, cân nhắc giao chung 1 chuyến?" — **KHÔNG chặn** hành động ship, chỉ là gợi ý tham khảo (đúng nguyên tắc "không tự động hóa quá tay" ở A.3, nhưng đảo ngược: ở ĐÂY hệ thống chủ động BÁO chứ không ép chờ).

### Giao chung chuyến — `POST /shipments/batch` (module mới, tách khỏi Order Group)

```
POST /shipments/batch
{ "order_group_ids": ["G1"], "note": "Giao giờ hành chính" }        ← 1 group, dùng thay ship() nếu muốn có mã vận đơn thật
{ "order_group_ids": ["G1", "G2"], "note": "..." }                  ← ≥2 group, PHẢI cùng recipient_key
```

- Mỗi group truyền vào PHẢI đang ở `packed` (chưa đóng gói xong thì chưa có gì để giao).
- Với ≥2 group: TẤT CẢ phải cùng `recipient_key` khác null — khác nhau hoặc thiếu (`null`) → 409 `SHP_RECIPIENT_MISMATCH` (an toàn, không tự đoán liên kết khi không chắc chắn).
- Thành công: mỗi group được tạo 1 `Shipment` (mã theo dõi RIÊNG `OPK-XXXXXXXXXX`), TẤT CẢ shipment tạo trong 1 lần gọi CHUNG 1 `tripCode` (`TRIP-yymmdd-XXXX`), và MỖI group tự chuyển `packed → shipped` (giống hệt hiệu ứng gọi `fulfillment/ship`, nhưng giờ có thêm bản ghi vận đơn thật + `tripCode` để 2 group biết "cùng đi 1 chuyến").
- Toàn bộ chạy trong 1 giao dịch DB — hoặc tất cả group đều chuyển trạng thái + có vận đơn, hoặc không group nào bị đổi (Rule #6).
- Đây là **lựa chọn CỘNG THÊM**, không bắt buộc — `POST .../fulfillment/ship` (Nghiệp vụ 4) vẫn dùng được bình thường cho ship đơn lẻ không cần vận đơn thật.

### Hủy nhóm tự động (N1) — không phải thao tác của FE, chỉ cần HIỂU để không hoang mang khi thấy trạng thái `canceled`

**Bối cảnh**: khách hủy đơn qua sàn (hoặc sự cố logistics: hàng thất lạc/hư hỏng), và đây là đơn DUY NHẤT trong Order Group đó (hoặc mọi đơn trong group đều rơi vào tình huống tương tự) — nếu không có cơ chế nào xử lý, nhóm đơn đó sẽ TREO MÃI ở trạng thái cũ (VD `picking`) dù thực tế không còn gì để lấy/đóng gói.

**Hành vi hệ thống**: mỗi lần đồng bộ đơn (cron polling HOẶC webhook AURELLE) phát hiện 1 đơn chuyển sang trạng thái không-fulfill-được (`canceled`, `lost`, `damaged_by_3pl`...), hệ thống TỰ KIỂM TRA — nếu **TOÀN BỘ** đơn trong Order Group đó không còn đơn nào fulfill được, VÀ nhóm **CHƯA** tới `packed`/`shipped`/`delivered` (hàng chưa đóng/giao vật lý), hệ thống **TỰ ĐỘNG** chuyển nhóm sang `canceled` — KHÔNG chờ Warehouse/Packaging Staff xác nhận (ngoại lệ có chủ đích so với nguyên tắc "1 người xác nhận" ở A.3 — rủi ro thấp vì nhóm chưa đóng gói, không có gì để "hủy nhầm" mất công sức vật lý đã bỏ ra).

Khi tự hủy, hệ thống đồng thời:
- Nhả giữ chỗ đóng gói (nếu có 1 phương án đang `pending_approval`/`approved_for_packing` chờ xử lý — đánh `isActive: false`, KHÔNG xóa, giữ lịch sử).
- Bắn Notification `group_auto_canceled` (severity `warning`) cho Store Owner, Admin, và người đang phụ trách (nếu có gán `assignedStaffId`).

**Nếu nhóm ĐÃ `packed`/`shipped`/`delivered`** khi đơn bị hủy muộn — hệ thống KHÔNG tự hủy (hàng đã đóng/giao vật lý, không thể "hủy ngầm") — trường hợp này cần xử lý qua luồng `return` thủ công (Nghiệp vụ 4) như bình thường.

FE chỉ cần: (1) hiển thị đúng badge cho `fulfillmentStatus: "canceled"` (trạng thái cuối, không còn hành động nào gọi được — `getAllowedNextStatuses` trả `[]`), (2) xử lý đúng Notification `group_auto_canceled` trong chuông thông báo (Nghiệp vụ 6).

---

## Nghiệp vụ 9 — 🆕 Đơn gộp từ đầu đến cuối (rà soát code BE + FE ngày 28/10/2026)

**Kết luận ngắn:** BE đã chạy đủ luồng đơn gộp từ đồng bộ → lấy hàng → đóng gói → giao → hủy/hoàn. **Gộp đơn là gộp lượt lấy hàng, không gộp kiện**: mỗi đơn có kiện và vận đơn GHN riêng — **đúng thiết kế, Thuận chốt 28/10/2026** (khách trả 1 đơn thì xử lý theo đúng vận đơn của đơn đó). Vì vậy gộp đơn **không** giảm phí ship. 🔄 Cùng ngày đã sửa G2, G3, G4 và thêm G7 (9.4); còn 3 việc FE (9.5).

### 9.1 Hai cơ chế — đừng nhầm

| | Gộp nhóm (`consolidation_key`) | Liên kết (`recipient_key` / liên kết tay) |
|---|---|---|
| Phạm vi | Đơn **cùng sàn, cùng shop** | Nhóm **khác sàn**, hoặc cùng sàn mà hệ thống không tự nhận ra (dữ liệu bị che) |
| Khoá | `sha256(sàn | SĐT | address_line1 | city)` — trường do Admin chọn ở cấu hình đồng bộ (mặc định SĐT, địa chỉ, phường/thành phố; tuỳ chọn thêm tên); có cửa sổ thời gian | `sha256(tên | SĐT | địa chỉ | tỉnh)` không kèm sàn; hoặc `POST /order-groups/:id/link` |
| Kết quả | Nhiều đơn trong **1 Order Group**: 1 giữ chỗ, 1 nhân viên, 1 lượt lấy | Các nhóm **riêng** nhưng hiện "Đi cùng", lấy chung được, giao chung chuyến (`POST /shipments/batch`) |
| Sửa tay | Tách `POST /:id/orders/:orderId/split`, gộp `POST /:id/merge` (chỉ khi **chưa quét món nào**, bắt buộc lý do) | Bỏ liên kết `DELETE /:id/link` |

Đơn đến muộn chỉ vào nhóm **chưa bắt đầu quét**; nhóm đã quét thì đơn mới tạo nhóm mới; nếu cùng tên + SĐT + địa chỉ (`recipient_key`) thì 2 nhóm tự hiện **liên kết** ("Đi cùng"), không thì liên kết tay. Cùng khoá mà khác tên người nhận → vẫn gộp, `recipientNamesDiffer = true`, gửi thông báo `consolidation_name_mismatch`.

### 9.2 Từng bước — BE làm gì, màn nào dùng

| Bước | BE | Màn FE (`main` 28/10) | Tình trạng |
|---|---|---|---|
| 1. Đồng bộ + gộp | `tryConsolidate` → `getOrCreateGroupForOrder` ngay trong lượt sync; `orders[]`, `recipientNamesDiffer`, `linkedGroupCount`, `manualLink` trong response nhóm | `OrderGroupsPage.tsx`: chip "Gộp N người nhận", danh sách đơn + người nhận | ✅ |
| 2. Tách / gộp / liên kết | 3 route trên + sổ hoạt động `order_group.split`, `order_group.merged` | `GroupOpsPanel.tsx` (tách, gộp, liên kết thay thế khi bị từ chối) | ✅ |
| 3. Giữ chỗ + phân công | Giữ chỗ theo **tổng số đặt của mọi đơn** trong nhóm, thiếu → `stock_shortage`; tự giao người ít việc nhất | Màn kho / nhóm đơn | ✅ |
| 4. Lấy hàng | Picking list gom theo SKU + `order_allocations`; quét theo SKU; đủ cả nhóm mới `pick` | `WarehousePage.tsx`: dòng chữ "Chia theo đơn" | 🟡 chưa có khay theo đơn (9.5) |
| 4b. Lấy chung nhóm liên kết | `GET /warehouse/:warehouseId/picking-list?group_ids=` (Warehouse Staff, Admin) | Chỉ `AdminWarehousePage.tsx` | 🟡 Warehouse Staff chưa dùng được (9.5) |
| 5. Thiếu hàng | `report-missing` → `partial_needs_review` → `decide-partial`; duyệt giao thiếu: phần thiếu trừ vào **đơn cũ nhất trước**, AURELLE nhận `short_shipped` | Màn lấy hàng + hộp "Giao phần có sẵn" ở đóng gói | ✅ |
| 6. Kế hoạch đóng gói | Mỗi **đơn** N kiện (kiện không chứa món của đơn khác — `PACKING_MOVE_ACROSS_ORDERS`) | Màn đóng gói: tên người nhận trên từng kiện / tem kiện | ✅ (đúng thiết kế 12/09, xem G1) |
| 7. Đóng gói | 🔄 28/10 (G7): nhóm **≥ 2 đơn** hoặc khác tên người nhận → bắt quét từng món (`409 PACKING_SCAN_REQUIRED`, `details.reason` = `multi_order_group` / `recipient_names_differ`); response nhóm có `packScanRequired` | Khoá "Đóng nhanh" đang theo `recipientNamesDiffer` | 🟡 FE đổi sang `packScanRequired` (checklist dòng 6) |
| 8. Báo giá + tạo vận đơn | 1 Shipment / nhóm, **mỗi kiện 1 vận đơn GHN** (địa chỉ, SĐT từng đơn; đơn bị che dùng địa chỉ mô phỏng chung cho cả nhóm); giao chung chuyến nhiều nhóm bằng `/shipments/batch` (cùng `recipient_key`) | `ShippingPage.tsx`: tên người nhận từng kiện, "Giao chung chuyến (N)"; địa chỉ sửa áp mọi kiện | 🟡 chưa điền sẵn địa chỉ (checklist dòng 1) |
| 9. Nhãn + chứng từ | Nhãn PDF 100×150 mỗi kiện 1 nhãn, mã GHN đúng kiện; 🔄 28/10 (G3) **người nhận in theo đơn của từng kiện** | Nút in | ✅ |
| 10. Giao / thất bại / hoàn | Trạng thái Shipment vẫn gộp từ mọi kiện (để điều phối); 🔄 28/10 (G2) **báo AURELLE theo từng đơn** từ kiện của đơn đó | Màn giao hàng, trả hàng | ✅ (không đổi FE) |
| 11. Hủy 1 đơn | Theo giai đoạn (9.3) | Thông báo + trạng thái nhóm | ✅ |
| 12. Trả hàng | Phiếu trả **theo từng đơn** (mở 1 phiếu / đơn) | `ReturnsPage.tsx` | ✅ |

### 9.3 Một đơn trong nhóm bị hủy (khách hủy trên sàn, webhook AURELLE, hoặc người bán hủy AURELLE)

| Nhóm đang ở | Hệ thống tự làm |
|---|---|
| Chờ lấy / đang lấy, chưa quét | Tính lại giữ chỗ theo các đơn còn lại, bỏ kế hoạch đóng gói cũ |
| Đã quét một phần / lấy xong, chưa đóng | **Trả hàng dư về kệ**, bỏ kế hoạch cũ, tính lại cho đơn còn lại |
| Đang đóng / đã đóng | Kiện của đơn bị hủy → **"phải tháo"**, báo Packaging Staff tháo kiện, trả hàng, ghi tình trạng thùng; kiện đơn khác giữ nguyên |
| Đã giao cho vận chuyển | Không hủy được — đi luồng hoàn hàng |
| Mọi đơn đều hủy | Nhóm tự `canceled`, nhả giữ chỗ, báo Store Owner + Admin + người phụ trách |

### 9.4 Các điểm đã rà — 🔄 cập nhật 28/10/2026 (tối)

| # | Điểm | Quyết định / đã làm | Hành vi bây giờ |
|---|---|---|---|
| G1 | Không gộp kiện giữa các đơn của cùng nhóm (`PlanParcel.order_id` bắt buộc, `PACKING_MOVE_ACROSS_ORDERS`); mỗi kiện = 1 vận đơn GHN | ✅ **Đúng thiết kế — Thuận chốt 28/10:** mỗi đơn 1 vận đơn, dù cùng người nhận; trả hàng xử lý theo vận đơn của đúng đơn đó. Không làm "đóng chung 1 kiện" | Gộp đơn tiết kiệm **lượt lấy hàng**, không tiết kiệm phí ship — không trình bày "gộp đơn giảm phí ship" khi demo |
| G2 | Báo AURELLE 1 trạng thái gộp cho cả nhóm | ✅ **Đã sửa (AOFP-207).** Sự kiện GHN của 1 kiện → tính trạng thái của **riêng đơn có kiện đó** (`carrierStatusOfOrder`, chỉ các kiện của đơn) → đổi thì xếp hàng báo sàn cho đúng đơn (outbox có `order_id` + `shipment_id`, khoá `ord:<orderId>:<status>:<lượt đặt>.<thời điểm>`). Không báo lùi (luật `canCarrierMove`). Trạng thái gộp của Shipment không còn gửi sàn khi do hãng báo. Dòng của cả vận đơn (VD kho quét nhận hàng hoàn → `returned`) **bỏ qua đơn mà các kiện đã giao xong** | Kiện A giao xong, kiện B còn chạy → website: A "đã giao", B "đang vận chuyển". Kiện B thất bại → chỉ B "giao thất bại". Mỗi đơn kèm mã GHN của chính nó |
| G3 | Nhãn PDF in người nhận của đơn đầu cho mọi kiện | ✅ **Đã sửa (AOFP-208).** `ShippingLabelData.parcels[].recipient` = người nhận của đơn có kiện đó (đơn bị che vẫn in địa chỉ mô phỏng đã gửi hãng) | Nhóm cùng SĐT + địa chỉ, khác tên (Lan, Hùng) → nhãn kiện đơn B in "Hùng", khớp đơn GHN của kiện |
| G4 | Khoá gộp dùng SĐT Lazada bị che (`8**5` → `085`) | ✅ **Đã sửa (AOFP-209).** `isUnusablePhone` (có `*` hoặc < 9 chữ số) → khi Admin gộp theo SĐT, khoá dùng `unusable-phone:<shop>:<mã đơn>` thay cho SĐT → đơn **không tự gộp**; vẫn liên kết tay được. Áp cả khi Admin đổi trường gộp (tính lại khoá) | Đơn Lazada bị che không còn tự vào chung nhóm với khách khác. Nhóm đã gộp từ trước giữ nguyên (tách tay nếu chưa quét). Chưa kiểm chứng Lazada che địa chỉ theo kiểu nào — nếu Admin bỏ SĐT khỏi trường gộp thì chỉ còn địa chỉ quyết định |
| G5 | Tách / nhập đơn chỉ khi nhóm **chưa quét món nào** | Giữ nguyên — chấp nhận được | Sau khi quét đã trừ tồn và ghi lượt quét theo nhóm; gộp nhầm thường thấy trước khi đi lấy |
| G6 | BE không ghi món nào vào khay đơn nào | Không làm — FE đếm tạm (checklist dòng 4); thay bằng G7 | Tải lại trang thì mất số đếm khay, tổng đã lấy vẫn ở BE |
| G7 | 🆕 Nhóm ≥ 2 đơn **cùng tên** vẫn "đóng nhanh" được (chỉ khác tên mới bắt quét) → món có thể vào nhầm kiện đơn khác, trả hàng sẽ lệch | ✅ **Đã thêm (AOFP-210).** `quickPack` chặn khi nhóm còn ≥ 2 đơn: `409 PACKING_SCAN_REQUIRED`, `details: { reason: 'multi_order_group', orderCount }`. Response nhóm thêm `packScanRequired` (= ≥ 2 đơn hiệu lực **hoặc** khác tên) | Nhóm 1 đơn đóng nhanh như cũ; nhóm 2+ đơn phải quét từng món vào đúng kiện rồi niêm phong |

### 9.5 Việc FE còn lại cho đơn gộp

`FE_UPDATE_CHECKLIST.md` dòng 4 (chia khay theo đơn, mục 3.1), dòng 5 (lấy chung nhóm liên kết cho Warehouse Staff, mục 3.2), dòng 6 (khoá "Đóng nhanh" theo `packScanRequired`, mục 3.3), dòng 1 (điền sẵn địa chỉ ở màn Giao hàng). G2, G3, G4 không cần đổi FE.

---

# PHẦN C — SƠ ĐỒ TỔNG THỂ

## Nghiệp vụ 8 — 🆕 Vận chuyển thật, chứng từ in, hoàn hàng & nhập lại tồn (30/09/2026)

### Bối cảnh xảy ra
Đơn đóng gói xong (`packed`) cần: chọn hãng theo cước/thời gian, tạo vận đơn, in nhãn từng kiện, hẹn hãng lấy hàng; nếu hàng bị hoàn thì kho phải nhận lại, kiểm chất lượng và nhập lại tồn. Trước đây `ship` chỉ đổi trạng thái, không có cước/hãng/chứng từ.

### Luồng cho Shipping Coordinator
```
GET  /order-groups?fulfillment_status=packed          → nhóm chờ giao
GET  /shipping/quote/:groupId                         → báo giá mọi dịch vụ (theo KIỆN thật), có `recommended`
POST /shipments/batch { order_group_ids, carrier_code, service_code, pickup_at? }
                                                       → tạo vận đơn, group → shipped, ghi cước lên phương án đóng gói
GET  /documents/shipping-label/:groupId               → PDF nhãn, mỗi kiện một trang
GET  /documents/manifest/:tripCode                    → PDF bảng kê chuyến
PATCH /shipments/:id/pickup { pickup_at }             → đổi lịch hãng lấy hàng
```
Màn hình đã nối API thật: `/app/shipping/dispatch` (`fe/src/pages/ShippingDispatchPage.tsx`). Màn `/app/shipping` cũ vẫn là dữ liệu mock.

**Cách tính cước** (để FE giải thích cho người dùng): mỗi kiện lấy `max(cân thực, cân quy đổi)`, cân quy đổi = thể tích ngoài (cm³) ÷ hệ số hãng; tra bậc cước, vượt bậc cuối cộng mỗi 500 g. Tổng cước = cộng các kiện. Nhãn `isSample`/"cước mẫu" nghĩa là số tự đặt, **chưa phải cước thật của hãng**. `trackingCode` là **mã nội bộ**, chưa gọi API hãng.

### Chứng từ in
`GET /documents/packing-slip/:groupId` (phiếu đóng gói, mỗi đơn 1 trang), `shipping-label/:groupId` (cần đã có vận đơn), `manifest/:tripCode`. Trả PDF — cần Bearer nên tải bằng `fetch` → blob (xem `openDocument` trong `fe/src/api/shipping.api.ts`).

### Hoàn hàng — kho nhận lại và nhập tồn
🔄 Gộp 05/10/2026: route `POST /order-groups/:id/fulfillment/return-receive` (bản thi_dev) **đã bỏ**. Dùng luồng `/returns` (G3): `POST /returns/:id/receive` rồi `POST /returns/:id/inspect` — mỗi dòng chọn `restock` (nhập lại tồn qua sổ kho, loại `return_restock`) / `quarantine` / `discard`, kèm thu hồi thùng/vật tư đóng gói (`packaging[]`). Chi tiết: `INTEGRATION_GUIDE_SHIPPING.md`.

### Nhập lại tồn khi hủy lượt lấy hàng
`decide-partial` với `approve:false` (mở lượt lấy mới) **tự nhập lại** hàng đã quét ở lượt bị hủy vào đúng ô đã lấy (idempotent qua `restocked_at`; 🔄 gộp 05/10: theo tồn gộp SKU nội bộ nếu đã nối, ghi sổ kho loại `pick_cancel`, rồi tính lại giữ chỗ). Lần quét cũ không có `warehouse_id` (dữ liệu trước 30/09) **không tự nhập được** — hệ thống ghi log để kho đối soát tay. Giả định: nhân viên đã trả hàng về kệ.

### Mã lỗi mới
`SHIP_*` (báo giá/hãng), `SHP_PICKUP_IN_PAST`, `SHP_RECIPIENT_MISMATCH`, `SHP_CARRIER_REQUIRED`, `DOC_*` — xem `GUIDE_DOC/API_LIST.md` mục 10–10c và bảng mã lỗi.

### Giới hạn cần nói thật
Cước là bảng mẫu; chưa gọi API hãng vận chuyển thật; chưa có tracking trạng thái từ hãng; vật tư chèn vẫn là **ước lượng theo luật**; chia kiện cân bằng theo tải nhưng là heuristic, không chứng minh tối ưu.

---

## C.1. Code hiện tại — còn các giới hạn ở phần B

🔄 **ĐÃ ĐỔI (21/09/2026)** — vẽ lại theo luồng lấy hàng trước (AOFP-35).

```
   (tạo group khi sync/gộp đơn)
                    ┌─────────────────────────┐
                    │  awaiting_packaging      │◄───────────────────┐
                    └────────────┬─────────────┘                     │ decide-partial(false)
                                 │ tự động: auto-assign + chuyển      │ (lấy lại từ đầu)
                                 ▼                                    │
                    ┌─────────────────────────┐   report-missing  ┌──┴───────────────────┐
                    │  picking                 │─────────────────►│ partial_needs_review  │
                    └────────────┬─────────────┘                   └──┬───────────────────┘
                    pick-item×N → pick                                │ decide-partial(true)
                                 ▼                                    │
                    ┌─────────────────────────┐◄─────────────────────┘
                    │  picked                  │◄──────────────┐
                    └────────────┬─────────────┘                │ reject
                                 │ job tự tính kế hoạch (10 s)    │ reject / đơn bị hủy
                                 ▼                                │
                    ┌─────────────────────────┐                 │
                    │  pending_approval        │─────────────────┘
                    └────────────┬─────────────┘
                                 │ approve (trước đó có thể đổi thùng / chuyển món / tính lại)
                                 ▼
                    ┌─────────────────────────┐
                    │  approved_for_packing    │
                    └────────────┬─────────────┘
                                 │ packing-plan/pack (cân thật từng kiện)
                                 ▼
                    ┌───────────┐
                    │  packed   │
                    └─────┬─────┘
                          │ ship
                          ▼
                    ┌───────────┐  return   ┌───────────┐
                    │  shipped  │──────────►│ returned  │ (hoàn do giao thất bại)
                    └─────┬─────┘           └───────────┘
                          │ deliver               ▲
                          ▼                        │ return
                    ┌───────────┐──────────────────┘
                    │ delivered │
                    └───────────┘
```

**4 khác biệt cốt lõi so với thiết kế ban đầu** (đọc kỹ nếu đã quen sơ đồ cũ):

1. `awaiting_packaging` giờ chỉ là trạng thái THOÁNG QUA lúc mới tạo group — auto-assign Warehouse Staff xảy ra NGAY, không cần ai Approve gì trước. 🆕 (09/10/2026) Nếu bước sang `picking` lúc tạo bị lỗi, cron 5 phút tự đưa nhóm kẹt `awaiting_packaging` sang `picking` (hết đơn hợp lệ thì hủy tự động) — FE không cần nút xử lý.
2. Khối "Đóng gói" giờ nằm SAU khối "Lấy hàng" — trước đây ngược lại. 🔄 04/10: không còn bước `generate` thủ công — vào `picked` là job tự tính; duyệt/chỉnh tay/đóng đi qua `/packing-plan`.
3. Reject quay về `picked` (không phải `awaiting_packaging`) — hàng đã lấy xong rồi. 🔄 04/10: reject chỉ còn nghĩa "xử lý ngoài hệ thống", kế hoạch `rejected` giữ lại nên job không tự tính lại; muốn quay lại hệ thống thì `recompute`. 🔄 08–09/10/2026: kế hoạch `rejected` có 3 lối ra — `recompute`, `manual`, và 🆕 `back-to-picking` (cạnh mới `picked → picking`: rút món hỏng/lấy nhầm, kho lấy lại) — xem `INTEGRATION_GUIDE_PACKING.md` mục 2.5.
4. 🆕 **(29/09/2026)** — MỌI trạng thái từ `awaiting_packaging` tới `approved_for_packing` (bao gồm cả `partial_needs_review`) có thêm 1 đường TỰ ĐỘNG (không do FE gọi) sang **`canceled`** (trạng thái cuối, không sơ đồ tiếp) khi mọi đơn trong nhóm không còn fulfill được — xem Nghiệp vụ 7 (N1). Từ `packed` trở đi KHÔNG có đường này.

---

## C.2. Flow mục tiêu (12/09/2026) — đã triển khai

Flow mục tiêu viết ngày 12/09 (BE-1 → BE-5) đã được làm và thay thế bởi luồng hiện tại: sơ đồ C.1, kế hoạch đóng gói (`INTEGRATION_GUIDE_PACKING.md`), giao/hoàn qua vận đơn (`INTEGRATION_GUIDE_SHIPPING.md`).

# PHẦN D — THAM CHIẾU KỸ THUẬT (API, lỗi, test)

## D.1. Response format — đã thống nhất camelCase (2026-09-10)

Mọi module (`order-groups`/`packing`/`packaging`/`warehouse`/`staff-assignment`) đều trả camelCase sạch, không lộ `_id`/`__v`. 🔄 (09/10/2026, sửa cho đúng code) `POST /order-groups/:id/assign` trước đây trả document thô — nay đã map như mọi route nhóm đơn. `notifications` trả dạng đã map nhưng giữ **snake_case** (`id`, `related_entity_type`, `is_read`, `created_at`) — xem Nghiệp vụ 6. **Ngoại lệ duy nhất**: `PackableItem` (trong `picking-list`) giữ nguyên snake_case (`length_cm`...) — đây là hợp đồng interface đã bàn giao cho AI Packaging, cố ý không đổi.

## D.2. Optimistic Concurrency — kiểm tra theo từng endpoint hiện hữu

Luôn đọc `version` từ `GET /order-groups/:id` gần nhất trước khi gọi bất kỳ action ghi nào của nhóm. Sai `version` → 409 `ORD_GROUP_STATE_CONFLICT` → gọi lại GET lấy version mới, KHÔNG tự động retry.

🔄 **04/10/2026 — kế hoạch đóng gói có version RIÊNG**: mọi route `/packing-plan/*` có ghi (approve, reject, recompute, change-box, move-item, pack) gửi `expected_version` = `plan.version` từ `GET .../packing-plan` (hoặc từ `plan` vừa trả về ở thao tác trước). Sai → 409 `PACKING_VERSION_CONFLICT` → tải lại kế hoạch. Đang có lần tính khác → 409 `PACKING_PLAN_COMPUTING`. `guide` không cần version.

## D.3. Bảng mã lỗi

| `error_code`                                                                                                                                           | HTTP    | Khi nào                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ORD_GROUP_INVALID_ID`                                                                                                                                 | 400     | `:id` sai định dạng                                                                                                                                                                                          |
| `ORD_GROUP_NOT_FOUND`                                                                                                                                  | 404     | Group không tồn tại                                                                                                                                                                                          |
| `ORD_GROUP_STATE_CONFLICT`                                                                                                                             | 409     | Version không khớp                                                                                                                                                                                           |
| `ORD_GROUP_INVALID_TRANSITION`                                                                                                                         | 400     | Sai thứ tự trạng thái                                                                                                                                                                                        |
| `ORD_GROUP_INSUFFICIENT_STOCK`                                                                                                                         | 409     | pick-item không đủ hàng — gợi ý report-missing                                                                                                                                                               |
| `ORD_GROUP_ITEM_NOT_IN_GROUP`                                                                                                                          | 404     | SKU không thuộc group — 🔄 từ 19/09/2026 áp dụng thêm cho `pick-item` (trước chỉ dùng ở API item-detail)                                                                                                     |
| `ORD_GROUP_PACKAGING_PROFILE_NOT_READY` | 422 | SKU thiếu hồ sơ kho `ready`, số đo hoặc độ nhạy đã xác nhận |
| `ORD_GROUP_ALL_ORDERS_CANCELED`                                                                                                                        | 409     | **Mới (15/09/2026)** — toàn bộ đơn trong group đã bị hủy/gặp sự cố logistics (xem `INTEGRATION_GUIDE_ORDERS.md` mục 7b) — không còn gì để đóng gói/lấy hàng. Xảy ra ở `picking-list` và lúc tính kế hoạch (🔄 04/10) |
| `ORD_GROUP_NO_STAFF_AVAILABLE`                                                                                                                         | 409     | Auto-assign không có staff active                                                                                                                                                                            |
| `ORD_GROUP_STAFF_NOT_FOUND`                                                                                                                            | 404     | `staff_id` không hợp lệ                                                                                                                                                                                      |
| 🆕 `ORD_GROUP_PICK_NOT_ALLOWED` | 409 | 21/09 — quét khi group không ở `picking` |
| 🆕 `ORD_GROUP_PICK_EXCEEDS_ORDERED` | 409 | 21/09 — tổng đã quét trong lượt vượt số đặt |
| 🆕 `ORD_GROUP_PICK_INCOMPLETE` | 409 | 21/09 — bấm `pick` khi còn SKU chưa đủ (`details.missing`) |
| 🆕 `ORD_GROUP_NO_PICK_EVENTS` | 409 | 21/09 — tính kế hoạch khi lượt hiện tại chưa quét gì (🔄 04/10: hiện ở `failureReason` của kế hoạch) |
| 🆕 `PACKING_INVALID_ID` / `PACKING_PLAN_NOT_FOUND` | 400/404 | 04/10 — `groupId` sai / nhóm chưa có kế hoạch đang hoạt động |
| 🆕 `PACKING_PLAN_COMPUTING` | 409 | 04/10 — đang có lần tính khác của cùng nhóm |
| 🆕 `PACKING_WRONG_PLAN_STATUS` | 409 | 04/10 — thao tác không hợp trạng thái kế hoạch (vd duyệt kế hoạch đã `approved`, đóng kế hoạch còn `ready`) |
| 🆕 `PACKING_VERSION_CONFLICT` | 409 | 04/10 — `expected_version` lệch `plan.version` |
| 🆕 `PACKING_HAS_UNPLACED` | 409 | 04/10 — duyệt khi còn đơn chưa xếp hết món |
| 🆕 `PACKING_PARCEL_NOT_FOUND` / `PACKING_ITEM_NOT_IN_PARCEL` | 404 | 04/10 — `parcelNo`/`item_key` không có trong kế hoạch |
| 🆕 `PACKING_MOVE_ACROSS_ORDERS` | 400 | 04/10 — chuyển món sang kiện của đơn khác |
| 🆕 `PACKING_BOX_DOES_NOT_FIT` | 422 | 04/10 — đổi thùng/chuyển món mà validator không chấp nhận (`details.violations`) |
| 🆕 `PACKING_NOTE_REQUIRED` | 400 | 04/10 — lý do `OTHER` thiếu ghi chú |
| 🆕 `PACKING_PACK_WEIGHTS_MISMATCH` | 400 | 04/10 — danh sách cân không khớp đúng các kiện |
| 🆕 `PACKING_GUIDE_NOT_AVAILABLE` | 409 | 04/10 — xin hướng dẫn cho kiện không xếp được |
| 🆕 `PM_ZIP_BAG_NOT_FOUND` | 422 | 21/09 — hồ sơ SKU chọn túi zip không có/ngừng dùng |
| 🆕 `PM_ZIP_BAG_TOO_SMALL` | 422 | 08/10 — túi chọn không vừa gói đã đo; `details.suggestedZipBagCode` = túi nhỏ nhất còn vừa |
| 🆕 `PM_FOLD_NOT_ALLOWED` | 422 | 22/09 — bật "có thể gập đôi" cho loại không phải quần áo (giày, dép, phụ kiện, khác; 23/10 mở rộng từ chỉ giày) |
| 🆕 `PKG_BAG_NOT_FOUND` / `PKG_BAG_CODE_IN_USE` / `PKG_INVALID_BAG_ID` | 404/409/400 | 21/09 — danh mục túi zip |
| 🆕 `PKG_BOX_NOT_FOUND` / `PKG_BOX_CODE_IN_USE` / `PKG_BOX_INVALID_DIMENSIONS` / `PKG_INVALID_BOX_ID` | 404/409/400/400 | 21/09 — danh mục thùng |
| 🆕 `PKG_BOX_OUT_OF_STOCK` | 409 | 22/09 — đổi thùng sang thùng không còn trống, hoặc `pack` khi kho đã hết thùng đó |
| 🆕 `PM_INVALID_ID` / `PM_NOT_FOUND` | 400/404 | 21/09 — hồ sơ SKU |
| `WH_WAREHOUSE_NOT_FOUND` / `WH_ZONE_NOT_FOUND` / `WH_INVALID_BIN_RANGE` / `WH_WAREHOUSE_CODE_IN_USE` / `WH_ZONE_CODE_IN_USE` (2 mã cuối 🆕 19/09/2026) | —       | Xem chi tiết Nghiệp vụ 2b (Warehouse Setup)                                                                                                                                                                  |
| 🆕 `WH_INVALID_GROUP_IDS`                                                                                                                              | 400     | 29/09/2026 — `GET /warehouse/:warehouseId/picking-list?group_ids=` rỗng hoặc có phần tử không phải ObjectId hợp lệ                                                                                          |
| 🆕 `SHP_EMPTY_GROUP_LIST` / `SHP_GROUP_NOT_PACKED` / `SHP_RECIPIENT_MISMATCH` / `SHP_GROUP_ALREADY_SHIPPED`                                            | 400/409 | 29/09/2026 — module `shipments/`, xem Nghiệp vụ 7                                                                                                                                                            |
| `NOTI_INVALID_ID` / `NOTI_NOT_FOUND`                                                                                                                   | 400/404 | Module notifications                                                                                                                                                                                         |
| 🆕 `PACKING_SCAN_WRONG_PARCEL` / `PACKING_SCAN_OVER` / `PACKING_SCAN_NOT_IN_PLAN` / `PACKING_SCAN_NOT_FOUND` | 409/409/404/404 | 05/10 — quét món vào kiện (Nghiệp vụ 1b) |
| 🆕 `PACKING_PARCEL_WRONG_STATUS` / `PACKING_PARCEL_NOT_FULLY_SCANNED` / `PACKING_NOT_COMPLETE` | 409 | 05/10 — thao tác không hợp trạng thái kiện, niêm phong khi chưa quét đủ, hoàn tất khi còn kiện chưa xong |
| 🆕 `PACKING_SELF_REVIEW_FORBIDDEN` / `PACKING_WEIGHT_REQUIRED` | 403/400 | 05/10 — tự chấp nhận kiện mình niêm phong; cân lại thiếu `weight_kg` |
| 🆕 `PACKING_SCAN_REQUIRED` / `PACKING_PARCEL_LIMIT_EXCEEDED` / `PACKING_SETTINGS_CONFLICT` | 409/422/409 | 05/10 — cài đặt bắt buộc quét; vượt số kiện tối đa khi duyệt; lưu cài đặt trùng version |
| 🆕 `PACKING_ISSUE_HAS_SEALED_PARCELS` / `PACKING_REPLACEMENT_WAREHOUSE_REQUIRED` | 409/400 | 05/10 — sự cố lúc đóng |
| 🆕 `PACKING_PACKER_INVALID` / `PACKING_NO_PACKER_AVAILABLE` / `PACKING_INVALID_DATE_RANGE` | 422/409/400 | 05/10 — giao người đóng; báo cáo |
| 🆕 `SHP_PARCELS_TO_UNPACK` / `ORD_GROUP_STAFF_WRONG_ROLE` | 409/422 | 05/10 — còn kiện phải tháo khi giao; gán tay lấy hàng cho người không phải Warehouse Staff |
| 🆕 `PACKING_RECOVER_MATERIAL_INVALID` / `PKG_MATERIAL_NOT_REUSABLE` | 400/400 | 05/10 tối — thu hồi vật tư chèn không có trong kiện/vượt số; vật tư chưa bật `reusable` |

🆕 29/10/2026 — `ORD_GROUP_MERGE_EXPRESS` (409, gộp nhóm hỏa tốc AURELLE), `ORD_GROUP_PRIORITY_LOCKED` (409, đổi ưu tiên nhóm hỏa tốc AURELLE), `SHP_SHIPPER_REQUIRED` (400), `SHP_EXPRESS_SELF_DELIVERY_REQUIRED` (409), `SHP_SHIPPER_INVALID` (422), `SHP_NOT_ASSIGNED_SHIPPER` (403).

## D.4. Checklist test bắt buộc cho FE — theo từng nghiệp vụ

Các mục dưới đây kiểm tra route/flow legacy đang có trong code. Checklist nghiệm thu flow mục tiêu nằm ở D.6.

- [ ] 🔄 **Nghiệp vụ 1** (04/10): nhóm vừa `picked` → trong ~10 s `GET .../packing-plan` có kế hoạch `ready`, nhóm `pending_approval`, Packaging Staff nhận thông báo `pending_approval`
- [ ] 🔄 **Nghiệp vụ 1**: đơn ≤ 12 món → `cpSatPending: true` lúc đầu, vài giây sau `false` và `proof` không tệ hơn ban đầu
- [ ] 🔄 **Nghiệp vụ 1**: `change-box` sang thùng quá nhỏ → 422 `PACKING_BOX_DOES_NOT_FIT`, kế hoạch không đổi; sang thùng hợp lệ → `version` tăng, `adjustments[]` có 1 dòng
- [ ] 🔄 **Nghiệp vụ 1**: `move-item` sang kiện của đơn khác → 400 `PACKING_MOVE_ACROSS_ORDERS`; bỏ trống `to_parcel_no` → có thêm 1 kiện
- [ ] 🔄 **Nghiệp vụ 1**: gửi `expected_version` cũ → 409 `PACKING_VERSION_CONFLICT`
- [ ] 🔄 **Nghiệp vụ 1**: `reject` → kế hoạch `rejected`, nhóm `picked`, job KHÔNG tự tính lại; `recompute` → kế hoạch mới `ready`
- [ ] 🔄 **Nghiệp vụ 4**: `pack` thiếu 1 kiện → 400 `PACKING_PACK_WEIGHTS_MISMATCH`; cân lệch > 20% → `parcels[i].isAbnormal: true`; đủ kiện → trừ đúng số thùng (sổ `/packaging/boxes/:id/movements`)
- [ ] 🆕 **Nghiệp vụ 1b** (05/10): kế hoạch vừa `ready` → `session.assignedPackerId` có giá trị (nếu có Packaging Staff), người đó nhận `packing_assigned`
- [ ] 🆕 **Nghiệp vụ 1b**: quét món của kiện 2 vào kiện 1 → 409 `PACKING_SCAN_WRONG_PARCEL` có `belongsToParcels`; quét quá số món → 409 `PACKING_SCAN_OVER`; gửi lại cùng `client_event_id` → `duplicate: true`, `scannedCount` không đổi
- [ ] 🆕 **Nghiệp vụ 1b**: `seal` khi chưa quét đủ → 409 `PACKING_PARCEL_NOT_FULLY_SCANNED` có `missing[]`; niêm phong đủ mọi kiện → `completed: true`, nhóm `packed`, `session.packMode = "scan"`
- [ ] 🆕 **Nghiệp vụ 1b**: cân lệch > ngưỡng → kiện `held`, nhóm vẫn `approved_for_packing`; cùng người `accept` → 403; người khác `accept` → hoàn tất
- [ ] 🆕 **Nghiệp vụ 1b**: `review reopen` rồi `seal` lại → sổ `/packaging/boxes/:id/movements` chỉ có 1 dòng xuất cho kiện đó
- [ ] 🆕 **Nghiệp vụ 1b**: `report-issue replace` → món đó phải quét lại; `back_to_picking` khi đã niêm phong 1 kiện → 409 `PACKING_ISSUE_HAS_SEALED_PARCELS`
- [ ] 🆕 **Nghiệp vụ 1b**: hủy 1 đơn (sync) khi kế hoạch `packing` → kiện của đơn `to_unpack`, các kiện khác giữ nguyên; tạo vận đơn → 409 `SHP_PARCELS_TO_UNPACK`; `unpack` → kiện `voided`, tồn ô tăng lại
- [ ] 🆕 **Nghiệp vụ 1b** (05/10 tối): nhóm 2 đơn đã `picked`, hủy 1 đơn (sync) → tồn các ô đã lấy hàng của đơn đó tăng lại, sổ kho có dòng `cancel_return`, Warehouse Staff nhận `return_to_shelf` có mã ô; kế hoạch tính lại chỉ còn đơn kia
- [ ] 🆕 **Nghiệp vụ 1b** (05/10 tối): `unpack` với `recovered_materials` 3/4 góc xốp → kho tái sử dụng của vật tư tăng 3; gửi 5 → 400 `PACKING_RECOVER_MATERIAL_INVALID`
- [ ] 🆕 **Nghiệp vụ 1b**: `PUT /packing/settings {require_scan: true}` → `pack` trả 409 `PACKING_SCAN_REQUIRED`; `GET /packing/reports/summary` có số liệu sau khi đóng vài nhóm
- [ ] 🔄 **Nghiệp vụ 2**: ngay khi group được tạo → `assignedStaffId` đã có giá trị và group ở `picking`
- [ ] **Nghiệp vụ 3**: `pick-item` vượt tồn kho → 409, UI gợi ý report-missing
- [ ] **Nghiệp vụ 3**: `report-missing` → thử gọi `pick` trực tiếp → phải bị chặn
- [ ] **Nghiệp vụ 3**: `decide-partial(false)` → về `picking` (lượt mới, 🔄 30/09); lấy lại lượt mới không bị cộng số của lượt cũ
- [ ] 🆕 **Nghiệp vụ 3**: `pick` khi chưa quét đủ → 409 `ORD_GROUP_PICK_INCOMPLETE`; quét dư → 409 `ORD_GROUP_PICK_EXCEEDS_ORDERED`
- [ ] 🆕 **Nghiệp vụ 3** (01/10/2026): nhóm 2 đơn có 1 đơn `canceled` → `GET /order-groups` trả `activeOrderCount: 1`, `canceledOrderCount: 1`, nhãn "Một phần đã hủy"; nhóm hủy hết → `activeOrderCount: 0`, không hiện trong "Cần lấy"
- [ ] 🔄 **Nghiệp vụ 4** (10/10/2026): `POST .../packing-plan/pack` trả `{ plan, completed }`, không có `lazadaPackSync`, Seller Center không đổi; nhóm hủy hết → 409 `ORD_GROUP_ALL_ORDERS_CANCELED`; `lazada-pack/retry` → 404
- [ ] 🆕 **Nghiệp vụ 3** (gộp 05/10/2026): `decide-partial(false)` → sổ kho có dòng `pick_cancel` trả đúng ô đã quét; giữ chỗ tồn của nhóm được tính lại
- [ ] **Nghiệp vụ 5**: `PATCH .../priority` express → `packagingDeadline` hợp lý (không null, đúng khoảng giờ làm việc)
- [ ] **Nghiệp vụ 6**: sau `report-missing` → `unread-count` của Store Owner tăng lên
- [ ] 🆕 **Nghiệp vụ 6**: kế hoạch tự tính xong → `unread-count` của Packaging Staff tăng; sau `packing-plan/reject` → `unread-count` của Admin tăng
- [ ] 🆕 **Nghiệp vụ 7** (mới 29/09/2026): tạo 2 đơn cùng người nhận nhưng KHÁC sàn (1 Lazada + 1 AURELLE) → `GET /order-groups/:id` của mỗi bên phải có `linkedGroupCount: 1`, `GET .../linked` phải thấy nhau
- [ ] 🆕 **Nghiệp vụ 7**: `POST /shipments/batch` với 2 group KHÁC `recipient_key` → 409 `SHP_RECIPIENT_MISMATCH`, không group nào bị đổi trạng thái
- [ ] 🆕 **Nghiệp vụ 7**: đưa 1 group về `picking`, cho toàn bộ đơn bên trong về `canceled` (qua sync/webhook) → group tự chuyển `canceled`, nhận được Notification `group_auto_canceled`

## D.5. Checklist FE trước khi bắt đầu code

✅ FE đã làm xong các mục của checklist này (đối chiếu 21/10/2026). Việc còn lại: `FE_UPDATE_CHECKLIST.md`.

## D.6. Nghiệm thu flow mục tiêu (BE-1 → BE-5)

Đã thay bằng nghiệm thu trong `INTEGRATION_GUIDE_PACKING.md` (checklist cuối file) và `FE_UPDATE_CHECKLIST.md` mục 5.
