# Quy Chuẩn Đóng Gói Hàng Thời Trang — OptiPackAI (AOFP-224)

> Trạng thái: **Bản nháp chờ duyệt** (31/10/2026). Chốt qua buổi hỏi–đáp với chủ dự án. Tài liệu này là quy chuẩn nghiệp vụ; phần code engine (mục 9) chỉ làm sau khi tài liệu được duyệt.
> Nguồn tham khảo bên ngoài (GHN, Lazada, thị trường bao bì VN, thực hành ngành) tổng hợp tại [`docs/research/PACKAGING_SOURCES.md`](research/PACKAGING_SOURCES.md). Con số nào ghi **(giả định)** là đề xuất ban đầu, kho phải đo kiểm và có thể chỉnh trong cài đặt.

---

## 1. Vấn đề hiện tại

- Mọi kiện đều là **thùng carton**: engine chỉ được chọn trong `SAMPLE-S/M/L/LT`. Một chiếc áo thun gập trong túi zip vẫn vào thùng S 20×15×10 cm (đầy 67%) — khối lượng quy đổi ~0,6 kg trong khi món hàng ~0,2 kg.
- Engine chấm điểm theo khối lượng quy đổi **chia 6000**, nhưng GHN tính cước **chia 5000** → engine tối ưu lệch so với tiền thật phải trả.
- Đơn gộp (cùng người nhận) chỉ gộp **khâu lấy hàng**; đóng gói vẫn tách mỗi đơn một kiện → khách nhận nhiều kiện, trả nhiều lần cước.
- Danh mục vật liệu không có giấy chèn; danh mục loại sản phẩm chưa có túi xách.

## 2. Nguyên tắc tối ưu

Thứ tự ưu tiên khi so sánh phương án đóng gói:

1. **Bảo vệ hàng — ràng buộc cứng.** Phương án làm hàng có nguy cơ móp, nhăn nặng, vỡ, ướt bị loại, dù rẻ đến đâu.
2. **Cước vận chuyển thấp nhất.** Cước GHN tính theo khối lượng tính cước = `max(khối lượng thật, D×R×C(cm) / 5000)` (kg), rồi **làm tròn lên theo bậc** (dưới 0,5 kg → 0,5 kg; trên 0,5 kg → bậc 1 kg) — xem nguồn §GHN. Hệ quả: thu nhỏ kiện chỉ giảm cước khi **vượt qua ranh giới bậc** (vd. từ 2.600 cm³ xuống ≤ 2.500 cm³ = 0,5 kg). Vì vậy engine phải so **cước theo bậc** (bảng giá GHN hoặc API Calculate Fee), không so khối lượng quy đổi liên tục như hiện nay; khối lượng quy đổi chỉ còn là tiêu chí phụ khi cùng bậc.
3. **Chi phí vật liệu + thời gian đóng** — dùng để phân định khi hai phương án ngang cước.

Ngoài ra: ít kiện hơn được ưu tiên khi chênh cước nhỏ (mục 6), vì khách nhận nhiều kiện rời dễ tưởng thiếu hàng.

## 3. Mô hình bao bì 3 lớp

| Lớp | Vai trò | Ví dụ |
|---|---|---|
| **L1 — Bao bì sản phẩm** | Giữ sạch, giữ form, định danh SKU | Túi zip (áo, quần, đầm), hộp giày gốc, túi chống bụi (túi xách), hộp kính |
| **L2 — Vật liệu chèn** | Lấp khoảng trống, chống va đập, chống nhăn | Giấy kraft vò, giấy pelure, bóng khí, túi khí, đệm góc xốp, vách ngăn |
| **L3 — Bao bì vận chuyển** | Chịu lực trên đường, mang tem vận đơn | **Túi niêm phong** (mới) hoặc **thùng carton** |

Engine 3D chỉ xếp các khối **L1** (kích thước cố định sau khi gấp + đóng túi/hộp) vào **L3**. L2 không chiếm thể tích trong mô hình — được tính theo luật (mục 7) và lấp khoảng trống còn dư.

## 4. Chọn túi niêm phong hay thùng

### 4.1. Thuộc tính `outer_requirement` của SKU

Mỗi SKU (`product_masters`) có thêm:

| Giá trị | Ý nghĩa |
|---|---|
| `mailer_ok` | Món chịu được đi trong túi niêm phong (hàng mềm, không móp, không vỡ) |
| `box_required` | Bắt buộc vào thùng (có form cứng, dễ móp/vỡ, hộp thương hiệu cần giữ nguyên) |

- **Mặc định theo loại sản phẩm** (bảng 5.1); kho sửa được từng SKU (vd. mũ có vành → `box_required`).
- Món `is_fragile = true` luôn bị coi là `box_required`, bất kể giá trị đã đặt.

### 4.2. Luật chọn L3 của một kiện

- Kiện được dùng **túi niêm phong** khi **mọi món** trong kiện là `mailer_ok` **và** chồng hàng vừa một cỡ túi (4.3).
- Chỉ cần **một món** `box_required` → kiện đó phải là **thùng**.
- Hàng mềm quá nhiều không vừa túi lớn nhất → chia nhiều túi hoặc vào thùng, chọn theo cước (mục 2).

### 4.3. Kiểm tra vừa túi niêm phong

Các món `mailer_ok` trong túi được **xếp chồng phẳng** (mặt lớn nằm ngang, giống luật quần áo luôn nằm phẳng đang có).

- Gói chồng có 3 cạnh `a ≥ b` (mặt đáy lớn nhất của các món) và độ dày `t = tổng độ dày các món`.
- Vừa túi rộng `W` × dài `L` khi (thử cả hai chiều xoay túi):
  - `b + t + lề_rộng ≤ W`
  - `a + t + lề_dài ≤ L`  (lề dài gồm phần nắp dán keo)
- Thêm giới hạn: `t ≤ độ_dày_tối_đa` và `tổng khối lượng ≤ khối_lượng_tối_đa_túi`.

Đây cùng nguyên lý "nửa chu vi mặt cắt" mà `bag-fit.util.ts` đang dùng cho túi zip, chỉ khác lề và áp cho cả chồng hàng.

| Cài đặt (`packing_settings`) | Mặc định |
|---|---|
| `mailer_margin_width_mm` | 20 **(giả định)** |
| `mailer_margin_length_mm` | 30 **(giả định)** |
| `mailer_max_thickness_mm` | 80 **(giả định)** |
| `mailer_max_weight_g` | 3000 **(giả định)** |

**Kích thước tính cước của túi đã nhồi:** dài `= a + 1`, rộng `= b + 1`, cao `= t + 0,5` (cm, làm tròn lên) **(giả định)** — túi ôm sát hàng, không tính phần túi thừa. Lazada yêu cầu kiện tối thiểu 12 × 18 × 2,5 cm; GHN đo lại tại chỗ mọi kiện có cạnh > 30 cm. Khi niêm phong, nhân viên cân/đo lại như kiện thùng (luồng `reweigh` có sẵn).

### 4.4. Danh mục túi niêm phong

| Mã | Rộng × Dài (cm, không gồm nắp) | Dùng cho (gợi ý) |
|---|---|---|
| `MAILER-20x30` | 20 × 30 | 1 áo thun / quần short / phụ kiện mềm |
| `MAILER-25x35` | 25 × 35 | 1–2 áo, 1 quần dài, 1 đầm ngắn |
| `MAILER-32x45` | 32 × 45 | 2–4 món, áo khoác mỏng |
| `MAILER-38x52` | 38 × 52 | Đơn gộp nhiều món mềm, áo khoác dày |

Bốn cỡ trên là cỡ **có sẵn** trên thị trường VN (nhà sản xuất liệt kê 17×30, 20×30, 25×35, 28×42, 32×45, 38×52, 40×60); 32×43 và 40×50 ban đầu dự kiến không có hàng sẵn nên đã đổi. Túi PE 2 lớp (ngoài trắng/in logo, trong đen chống nhìn xuyên), băng keo dán sẵn kiểu rách khi bóc (lộ dấu mở). Độ dày màng nhà sản xuất không công bố — ước tính ~45–50 µm/mặt **(giả định)**. Chưa xác minh kích thước in trên túi có gồm nắp dán hay không → kho đo 1 túi thật khi nhập.

**Tem vận đơn trên túi** (theo sổ tay Lazada): khổ A6 trở lên, giấy trắng mới, dán dọc, một tem một kiện, cả mã vạch nằm trên cùng một mặt phẳng, không dán băng keo màu/nylon đè lên.

**Rủi ro chưa xác minh:** văn bản GHN hướng dẫn "quần áo bọc túi nylon rồi cho vào thùng" và không nói rõ có nhận túi niêm phong làm lớp ngoài duy nhất. Trên thực tế túi niêm phong được dùng rộng rãi khi gửi GHN, nhưng cần hỏi GHN/xác nhận qua một lần gửi thử trước khi bật mặc định.

## 5. Quy định theo loại sản phẩm

### 5.1. Bảng tổng hợp

| Loại (`product_category`) | L1 — Bao bì sản phẩm | L2 — Chèn | `outer_requirement` mặc định |
|---|---|---|---|
| `t_shirt` áo thun | Gấp theo khuôn (5.2) → túi zip theo size | — | `mailer_ok` |
| `shirt` sơ mi | Gấp quanh bìa cứng giữ form cổ → túi zip | — | `mailer_ok` |
| `shorts`, `trousers` | Gấp theo khuôn → túi zip | — | `mailer_ok` |
| `dress` đầm | Lót giấy pelure, gấp (đầm dài gấp 3) → túi zip | Giấy pelure | `mailer_ok` |
| `jacket` áo khoác | Gấp → túi zip cỡ lớn | — | `mailer_ok` (quá dày so với túi → thùng, do kiểm tra vừa túi quyết định) |
| `shoes` giày | **Giữ nguyên hộp giày gốc** (giấy nhồi trong giày của nhà sản xuất giữ nguyên) | Đệm góc, giấy kraft lấp khe | `box_required` — **không dán tem vận đơn trực tiếp lên hộp thương hiệu** |
| `sandals` | Có hộp → như giày. Không hộp → túi zip | Không hộp: bóng khí quấn quai/đế | Có hộp `box_required`; không hộp `mailer_ok` |
| `bag` túi xách **(loại mới)** | Túi chống bụi; nhồi giấy bên trong giữ form; quai gập vào trong | Giấy kraft vò quanh | Form cứng `box_required`; túi vải/mềm `mailer_ok` |
| `accessory` dễ vỡ (kính, trang sức có hộp) | Hộp/bao riêng của sản phẩm | Bóng khí | `box_required` (đi theo `is_fragile`) |
| `accessory` mềm (khăn, tất, thắt lưng cuộn) | Túi zip | — | `mailer_ok` |
| `other` | — | — | `box_required` (an toàn trước, kho tự hạ xuống) |

Quy tắc xếp trong cùng một thùng:

- **Hàng mềm luôn nằm trên hàng cứng**, không bao giờ đặt dưới hộp giày/túi xách.
- Món có `max_stack_load_kg = null` (vd. túi xách form cứng) không bị đặt gì lên trên — luật có sẵn.
- Quần áo luôn nằm phẳng — luật có sẵn (`FLAT_CATEGORIES`).

### 5.2. Khuôn gấp chuẩn (giả định — kho đo kiểm)

Kích thước **sau khi gấp và cho vào túi zip** (D × R × dày, cm). Đây là giá trị mặc định khi tạo hồ sơ SKU; kho ghi đè bằng số đo thật (`package_*_cm`) và khi đó số đo thật được dùng.

| Loại | S | M | L | XL | Cách gấp |
|---|---|---|---|---|---|
| Áo thun | 22×28×2 | 24×30×2.5 | 25×32×3 | 27×33×3.5 | Bảng gấp: gập 2 tay ra sau, gập 2 bên vào giữa, gập đôi thân |
| Sơ mi | 24×30×3 | 25×32×3 | 26×33×3.5 | 27×34×4 | Cài cúc, đặt bìa cứng sau lưng, gập 2 bên + tay, gập thân 1 lần |
| Quần short | 20×25×2 | 22×26×2.5 | 23×28×3 | 24×29×3 | Gập đôi theo chiều dọc, gập đôi chiều dài |
| Quần dài | 25×32×3 | 27×34×3.5 | 28×36×4 | 30×37×4.5 | Gập đôi dọc, gập 3 chiều dài |
| Đầm ngắn | 24×30×2.5 | 25×32×3 | 26×33×3.5 | 27×34×4 | Lót pelure, gập 2 bên vào, gập đôi thân |
| Đầm dài | 25×35×3 | 26×36×3.5 | 27×37×4 | 28×38×4.5 | Lót pelure, gập 2 bên vào, gập 3 thân |
| Áo khoác | 28×34×5 | 30×35×6 | 32×38×7 | 33×40×8 | Kéo khoá, gập tay chéo, gập 2 bên, gập đôi |

Túi zip theo khuôn: chọn túi nhỏ nhất vừa gói bằng `suggestBag` có sẵn (lỗi `PM_ZIP_BAG_TOO_SMALL` gợi ý túi khác).

Engine vẫn được thử **gập đôi thêm** (biến thể `foldUnit` có sẵn) nếu SKU bật `can_fold_in_half` và việc gập giúp vào túi/thùng nhỏ hơn.

## 6. Đơn có cả hàng mềm và hàng cứng

Ví dụ: 1 áo thun + 1 đôi giày.

Engine sinh và so sánh ít nhất hai phương án:

- **A — Một thùng chung:** giày dưới, áo nằm phẳng trên.
- **B — Tách:** giày vào thùng, các món `mailer_ok` vào túi niêm phong.

Chọn **B** chỉ khi `tổng_chi_phí(B) ≤ tổng_chi_phí(A) − split_min_saving_vnd`, với tổng chi phí = cước ước tính (theo khối lượng tính cước) + bao bì + vật liệu chèn. Ngược lại chọn A.

| Cài đặt | Mặc định |
|---|---|
| `split_min_saving_vnd` | 5000 |

Giới hạn số kiện mỗi đơn (`max_parcels_per_order`) giữ nguyên.

## 7. Vật liệu chèn (L2)

Bổ sung vào `MATERIAL_TYPES`:

| Mã | Dùng khi |
|---|---|
| `kraft_paper` (mới) | Lấp khoảng trống trong thùng; nhồi giữ form túi xách; chèn khe quanh hộp giày. Ưu tiên trước túi khí |
| `tissue_paper` (mới) | Lót đầm, bọc túi xách — chống nhăn, chống trầy |
| `air_pillow` | Dự phòng khi khoảng trống rất lớn (tỉ lệ rỗng ≥ 0,7) hoặc hết giấy |
| `bubble_wrap`, `foam_corner`, `corrugated_divider`, `fragile_tape` | Giữ như luật hiện tại (dễ vỡ, giày) |

Túi niêm phong **không** dùng vật liệu chèn (trừ `tissue_paper` theo L1 của đầm/túi xách).

## 8. Đơn gộp nhiều đơn

### 8.1. AURELLE — đóng chung kiện

- Các đơn AURELLE trong cùng nhóm gộp (cùng `consolidation_key`, tức cùng người nhận) được **giải chung một bài đóng gói**: engine gom toàn bộ hàng rồi áp mục 4–6.
- Một kiện có thể chứa hàng của nhiều đơn → kiện mang `order_ids[]`.
- **Một vận đơn GHN cho một kiện**; tiền thu hộ (COD) = tổng COD các đơn có hàng trong kiện (kiện đầu tiên mang COD nếu nhiều kiện). Mã vận đơn ghi ngược về **từng đơn** AURELLE (outbox writeback).
- Trong kiện: mỗi món vẫn có túi zip riêng (định danh SKU); **mỗi đơn một phiếu đóng gói** (mã đơn + danh sách món) kẹp trong kiện chứa hàng của đơn đó.
- Đơn Hỏa tốc 3h, đơn đổi hàng `EXC-`, đơn bị che thông tin — vốn không sinh khóa gộp → không bao giờ đóng chung.

### 8.2. Lazada — mỗi đơn một kiện

Mỗi đơn Lazada có mã vận đơn riêng; giữ nguyên hành vi hiện tại (giải bài theo từng đơn, kiện mang 1 `order_id`).

### 8.3. Hủy / trả trong kiện gộp

- **Hủy một đơn trước khi niêm phong:** tính lại kế hoạch cho các đơn còn lại.
- **Hủy sau khi niêm phong:** dùng luồng **tháo kiện** (`unseal`) có sẵn → lấy hàng của đơn bị hủy ra → tính lại kế hoạch → niêm phong lại.
- **Trả hàng:** theo từng món kèm mã đơn — không phụ thuộc kiện gộp.

## 9. Thay đổi kỹ thuật cần làm (sau khi duyệt)

| # | Thay đổi | Phạm vi |
|---|---|---|
| T1 | Solver lấy `volumetric_divisor` từ hãng vận chuyển (GHN 5000) thay vì mặc định 6000, và so **cước theo bậc làm tròn** (bảng bậc trong cấu hình hãng) trước khối lượng quy đổi | `packing-plan.service.ts`, `solver/objective.ts` |
| T2 | `packaging_materials.kind` thêm `'mailer'` (rộng, dài, giá, tồn kho); seed 4 cỡ | `packaging-materials` |
| T3 | `product_masters.outer_requirement` + mặc định theo loại; thêm `ProductCategory.bag` (đăng ký FLAT/không FLAT, mô hình 3D) | `product-master`, `common/enums` |
| T4 | Hàm thuần `mailerFits(stack, mailer, settings)` + kích thước tính cước túi đã nhồi; có unit test | `packaging/` |
| T5 | Solver: sinh phương án túi niêm phong + so sánh A/B (mục 6) theo tổng chi phí | `packing/solver/` |
| T6 | `PlanParcel`: `box` → thêm `outer.kind: 'box' \| 'mailer'`; `order_id` → `order_ids[]` (giữ `order_id` = đơn đầu để tương thích, migrate dữ liệu cũ) | `packing-plan.schema.ts`, `shipments` |
| T7 | Gộp bài toán theo nhóm AURELLE cùng khóa gộp; COD cộng, writeback mã vận đơn từng đơn. Lưu ý API GHN: một vận đơn nhiều kiện phải dùng `service_type_id = 5` với kích thước/khối lượng từng kiện trong `items[]`; kiện gộp COD ≥ 2.000.000đ phải cho xem hàng + niêm phong đúng chuẩn | `packing`, `shipments`, `marketplaces/aurelle` |
| T8 | Vật liệu `kraft_paper`, `tissue_paper` + luật chèn mới | `material-selector.ts`, seed |
| T9 | Cài đặt mới mục 4.3, 6 trong `packing_settings` | `packing` |

Mỗi thay đổi schema theo quy tắc 23–24 trong `CLAUDE.md` (khai báo `type:` tường minh, `SchemaTypes.ObjectId` + đăng ký `objectid-fields.ts`).

## 10. Hướng dẫn 3D cho túi niêm phong (dành cho FE)

BE trả trong kiện: `outer.kind = 'mailer'`, mã túi, kích thước túi trải phẳng (W×L) và kích thước sau nhồi (mục 4.3), danh sách món theo thứ tự xếp chồng (dưới → trên).

Các bước hướng dẫn (BE sinh, AI chỉ viết lại lời):

1. Chuẩn bị túi niêm phong `<mã>` (+ phiếu đóng gói từng đơn nếu là kiện gộp).
2. Gấp từng món theo khuôn, cho vào túi zip (các bước hiện có).
3. Xếp chồng phẳng các gói zip: món lớn/nặng dưới, nhỏ trên.
4. Cho chồng hàng vào túi niêm phong, đặt phiếu đóng gói lên trên.
5. Ép bớt không khí, bóc lớp giấy bảo vệ keo, gập nắp dán kín.
6. Dán tem vận đơn lên mặt phẳng lớn của túi.

Phía FE cần dựng mô hình túi niêm phong (trạng thái trải phẳng → phồng theo `t` → dán nắp) và gắn vào luồng animation hiện có.

## 11. Ví dụ đối chiếu

| Đơn | Trước | Sau |
|---|---|---|
| 1 áo thun M (24×30×2,5) | Thùng S 20,6×15,6×10,6 = 3.406 cm³ → 0,68 kg → **bậc 1 kg** | Túi `MAILER-25x35`, nhồi 25×31×3 = 2.325 cm³ → 0,47 kg → **bậc 0,5 kg** — giảm 1 bậc cước, bao bì rẻ hơn |
| 1 áo thun L (25×32×3) | Thùng S → bậc 1 kg | Túi `MAILER-25x35`, nhồi 26×33×3,5 = 3.003 cm³ → 0,60 kg → vẫn **bậc 1 kg**; lợi ở giá bao bì và kiện nhẹ. Nếu gập đôi lọt bậc 0,5 kg thì engine chọn gập |
| 2 áo thun + 1 quần dài | Thùng M | Chồng dày t = 3 + 3 + 3.5 = 9.5 cm > 8 cm → không vừa 1 túi; engine so 2 túi niêm phong với 1 thùng, chọn theo mục 2 + 6 |
| 1 áo + 1 đôi giày | Thùng M | So A/B mục 6 — thường A (1 thùng) |
| 2 đơn AURELLE cùng người nhận, mỗi đơn 1 áo | 2 thùng S, 2 vận đơn | 1 túi `MAILER-25x35`, 1 vận đơn, 2 phiếu đóng gói |

> Số trong mục 11 là minh hoạ, dùng khuôn gấp giả định ở 5.2; số chính xác do engine tính sau khi code xong.
