# Quy Chuẩn Đóng Gói Hàng Thời Trang — OptiPackAI (AOFP-224)

> Trạng thái: **Bản nháp chờ duyệt** (31/10/2026). Chốt qua buổi hỏi–đáp với chủ dự án. Tài liệu này là quy chuẩn nghiệp vụ; phần code engine (mục 9) chỉ làm sau khi tài liệu được duyệt.
> Nguồn tham khảo bên ngoài (GHN, Lazada, thị trường bao bì VN, thực hành ngành) tổng hợp tại [`docs/research/PACKAGING_SOURCES.md`](research/PACKAGING_SOURCES.md). Con số nào ghi **(giả định)** là đề xuất ban đầu, kho phải đo kiểm và có thể chỉnh trong cài đặt.

---

## 1. Vấn đề hiện tại

- Mọi kiện đều là **thùng carton**: engine chỉ được chọn trong `BOX-S/M/L/LT`. Một chiếc áo thun gập trong túi zip vẫn vào thùng S 20×15×10 cm (đầy 67%) — khối lượng quy đổi ~0,6 kg trong khi món hàng ~0,2 kg.
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
| Tải tối đa mỗi túi (`max_load_g` của từng túi trong kho vật tư) | 3000 **(giả định)** |

**Kích thước tính cước của túi đã nhồi:** dài `= a + 1`, rộng `= b + 1`, cao `= t + 0,5` (cm, làm tròn lên) **(giả định)** — túi ôm sát hàng, không tính phần túi thừa. Lazada yêu cầu kiện tối thiểu 12 × 18 × 2,5 cm; GHN đo lại tại chỗ mọi kiện có cạnh > 30 cm. Khi niêm phong, nhân viên cân/đo lại như kiện thùng (luồng `reweigh` có sẵn).

### 4.4. Danh mục túi niêm phong

| Mã | Rộng × Dài (cm, không gồm nắp) | Dùng cho (gợi ý) |
|---|---|---|
| `MAILER-20X30` | 20 × 30 | Phụ kiện mềm, quần short gập nhỏ (gói rộng ≤ ~15 cm) |
| `MAILER-25X35` | 25 × 35 | 1 áo **gập đôi** (gói ~15×24×5) |
| `MAILER-32X45` | 32 × 45 | 1–2 áo nguyên khuôn gấp, 1 quần dài, đầm |
| `MAILER-38X52` | 38 × 52 | Đơn gộp nhiều món mềm, áo khoác dày |

Lưu ý luật nửa chu vi (4.3): túi rộng W chỉ chứa gói rộng tối đa `W − t − lề`. Áo gấp khuôn rộng 24 cm, dày 2,5 cm cần túi rộng ≥ 28,5 cm → 32×45; gập đôi thêm thì vừa 25×35.

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

- **Hàng cứng được nằm thẳng trên quần áo**, không lót gì ở giữa (AOFP-345, 26/11/2026, user chốt; bỏ luật 16/11 cấm hàng cứng nằm trên quần áo). Quần áo đặt lên hàng cứng vẫn hợp lệ. Hàng dễ vỡ vẫn không cho đặt gì lên.
- Món có `max_stack_load_kg = null` (vd. túi xách form cứng) không bị đặt gì lên trên — luật có sẵn. Riêng quần áo (loại nằm phẳng) để trống thì coi như chịu được 5 kg (`SOFT_DEFAULT_STACK_LOAD_G`, 13/11/2026).
- Mục tiêu lấp đầy 80% (`FILL_TARGET`, 13/11/2026) chỉ dùng để **cảnh báo**, không phải ràng buộc. Kiện lấp đầy dưới 80% được ghi thêm một câu vào `explanation` nêu lý do: kho chưa có túi niêm phong cho hàng mềm, hoặc nêu cỡ khối bao của chồng hàng để gợi ý nhập thùng sát hơn. Lý do có thể là kho chưa có túi niêm phong cho hàng mềm, hoặc là cỡ khối bao của chồng hàng (gợi ý nhập thùng sát hơn). Túi niêm phong không bị xét.
- Cắt hạ thùng chỉ để giảm cước cho đơn kẹt giữa hai cỡ thùng. Không cắt thấp hơn lòng thùng thấp nhất của danh mục (`min_cut_height_mm`, hiện 10 cm theo BOX-XS từ 26/11/2026). Xem `docs/adr/0002-cat-ha-thung-co-san-chieu-cao.md`.
- Gói đã cho vào túi zip, kể cả đã gập túi (`zip_bag_folded`), vẫn được engine gập thêm nếu bật `can_fold_in_half`: gập đôi, hoặc **gập tư** (gập đôi hai lần, AOFP-345) để nhét vào khe cạnh hàng cứng. Engine thử nguyên dạng trước, rồi gập đôi, rồi gập tư. Placement ghi `folded: true` và `fold_count: 2` khi gập tư. Số đo hồ sơ là của gói sau khi đã gập túi.
- Quần áo luôn nằm phẳng — luật có sẵn (`FLAT_CATEGORIES`).

### 5.2. Độ dày quần áo tính từ GSM (13/11/2026, user chốt)

Bảng khuôn gấp cũ (áo thun dày 2–3,5 cm) đã **bỏ**. Bảng đó chỉ là giả định và dày gấp nhiều lần thực tế: một áo thun gập trong túi zip dày dưới 1 cm. Kho vẫn đo **dài × rộng** sau khi gấp và cho vào túi. **Độ dày** tính theo trọng lượng vải:

```
dày (cm) = max(0,3 ; làm tròn lên 0,1 cm của  số lớp × GSM ÷ mật độ vải ÷ 10 000)
```

- **GSM** (g/m²) là trọng lượng của **1 lớp** vải, lưu theo SKU ở trường `fabric_gsm` (không bắt buộc). SKU bỏ trống thì dùng GSM mặc định theo loại.
- GSM ÷ mật độ vải (g/cm³) ÷ 10 000 = độ dày 1 lớp vải (cm).
- **Số lớp** là số lớp vải chồng lên nhau sau khi gấp theo cách gấp chuẩn của loại đó.
- **Sàn 0,3 cm**: chừa phần cổ áo, cúc áo và vỏ túi zip.
- **Không xét size.** Size lớn hay nhỏ không đổi số lớp; chênh lệch thật được bù bằng `fabric_gsm` của SKU hoặc số đo tay.

| Loại | GSM mặc định | Mật độ vải (g/cm³) | Số lớp | Dày mặc định | Cách gấp (ra số lớp) |
|---|---|---|---|---|---|
| `t_shirt` áo thun | 180 | 0,30 (thun dệt kim) | 8 | 0,5 cm | 2 lớp thân, gập 2 bên vào (4), gập đôi thân (8) |
| `shirt` sơ mi | 120 | 0,50 (dệt thoi) | 8 | 0,3 cm (sàn) | Cài cúc, gập 2 bên + tay (4), gập thân 1 lần (8) |
| `shorts` quần short | 200 | 0,40 | 8 | 0,4 cm | 2 ống chồng (4), gập đôi dọc, gập đôi chiều dài (8) |
| `trousers` quần dài/jean | 350 | 0,55 (denim) | 12 | 0,8 cm | 2 ống chồng (4), gập 3 chiều dài (12) |
| `dress` váy/đầm | 150 | 0,40 | 8 | 0,3 cm | Gập 2 bên vào (4), gập đôi thân (8) |
| `jacket` áo khoác | 300 | 0,25 (có lớp đệm) | 8 | 1,0 cm | Kéo khoá, gập 2 bên + tay (4), gập đôi (8) |

Mật độ vải và số lớp là **giả định**, kho hiệu chỉnh sau khi đo thực tế (code: `GARMENT_FABRIC` trong `be/src/modules/product-master/garment-thickness.ts`).

**Khi kho xác nhận hồ sơ quần áo** (`PUT /product-master/:id/packaging-profile`):
- `height_cm` **bỏ trống**: BE tính độ dày theo công thức trên và ghi vào `dimension.package_height_cm`. Engine đóng gói không đổi. Sửa GSM xong phải xác nhận lại hồ sơ thì độ dày mới được tính lại.
- `height_cm` **có nhập** mà lệch quá 50% so với số tính từ GSM (dày hơn hay mỏng hơn đều tính): vẫn lưu số đo tay, response trả thêm `warnings[]` để FE hiện. Không chặn, không lưu cờ vào DB.
- Hàng không phải quần áo vẫn **bắt buộc** nhập `height_cm`. Không có GSM.

Hồ sơ cũ đo dày bất thường được sửa bằng `be/scripts/migrate-garment-thickness.ts`. Mặc định chỉ chạy thử, `--apply` mới ghi, có file backup.

Túi zip theo khuôn: chọn túi nhỏ nhất vừa gói bằng `suggestBag` có sẵn (lỗi `PM_ZIP_BAG_TOO_SMALL` gợi ý túi khác).

Engine vẫn được thử **gập đôi thêm** (biến thể `foldUnit` có sẵn) nếu SKU bật `can_fold_in_half` và việc gập giúp vào túi/thùng nhỏ hơn.

### 5.3. Khuôn gấp và thông số chuẩn (AOFP-343, 26/11/2026, user chốt)

Quần áo gấp về **khuôn gấp** của loại: mọi size chung dài × rộng, độ dày tính theo 5.2, size chỉ đổi cân nặng. Khuôn lớn **30 × 22 cm** (áo thun, sơ mi, áo khoác, đầm, váy, quần dài) vừa túi ZIP-S. Khuôn nhỏ **22 × 15 cm** (quần short) bằng nửa khuôn lớn. BOX-S đổi lòng sang **31 × 23 × 12 cm** để vừa khuôn lớn và mũ lưỡi trai.

Thông số 39 SKU của shop Lazada `201182096267` được nạp bằng `be/scripts/apply-standard-packing-specs.ts`. Script này cũng là bảng thông số gốc. Đã chạy thử 1.364 tổ hợp đơn 1–4 món: tất cả đều vừa 1 kiện (issue #211). Cân nặng và kích thước mũ, dép là ước lượng, kho đo lại thì xác nhận lại hồ sơ.

## 6. Đơn có cả hàng mềm và hàng cứng

Ví dụ: 1 áo thun + 1 đôi giày.

Engine sinh và so sánh ít nhất hai phương án:

- **A — Một thùng chung:** giày dưới, áo nằm phẳng trên.
- **B — Tách:** giày vào thùng, các món `mailer_ok` vào túi niêm phong.

Chọn **B** chỉ khi `tổng_chi_phí(B) ≤ tổng_chi_phí(A) − split_min_saving_vnd`, với tổng chi phí = cước ước tính (theo khối lượng tính cước) + bao bì + vật liệu chèn. Ngược lại chọn A.

| Cài đặt | Mặc định |
|---|---|
| `split_min_saving_vnd` | 5000 |
| `est_fee_first_step_vnd` — cước ước tính bậc đầu, chỉ để so tách/gộp | 22000 **(giả định)** |
| `est_fee_per_extra_step_vnd` — cước ước tính mỗi bậc 0,5 kg thêm | 2500 **(giả định)** |

Giới hạn số kiện mỗi đơn (`max_parcels_per_order`) giữ nguyên.

## 7. Vật liệu chèn (L2)

Bổ sung vào `MATERIAL_TYPES`:

| Mã | Dùng khi |
|---|---|
| `kraft_paper` (mới) | Nhồi giữ form túi xách; chèn khe quanh hộp giày |
| `tissue_paper` (mới) | Lót đầm, bọc túi xách — chống nhăn, chống trầy |
| `air_pillow` | Lấp khoảng trống trong thùng tới **độ kín 90%** (luật `void_fill`, xem dưới) |
| `bubble_wrap`, `foam_corner`, `corrugated_divider`, `fragile_tape` | Giữ như luật hiện tại (dễ vỡ, giày) |

Túi niêm phong **không** dùng vật liệu chèn (trừ `tissue_paper` theo L1 của đầm/túi xách).

**Chèn kín (AOFP-344, 26/11/2026, user chốt).** Mục tiêu là khách mở thùng không thấy rỗng, nên không ép tỉ lệ hàng / thùng. Với 11 mẫu đang bán, kể cả thùng may đo vừa khít khối hàng, chỉ 23% đơn đạt ≥ 70%: quần áo rất mỏng, hàng cứng cao, và luật xếp chồng buộc nhiều món nằm đáy. Thay vào đó, luật `void_fill` đặt đủ gối hơi để **hàng + vật liệu chèn** lấp ≥ 90% lòng thùng:

```
số gối = làm tròn lên( max(0 ; 0,9 − lấp đầy hàng) × thể tích lòng thùng ÷ 800 ml )
```

Độ kín 90% và 800 ml/gối nằm trong luật vật tư (màn Vật tư, Admin sửa được). 800 ml là giả định, kho đo gối thật rồi sửa. Ước tính trên 915 tổ hợp đóng thùng: trung vị 9 gối/kiện (~3.600 đ), 90% kiện ≤ 15 gối. Cùng đợt thêm **BOX-XS** lòng 24 × 23 × 10 cm cho đơn nhỏ để bớt khoảng trống phải chèn.

**Chỉ chèn kiện có hàng dễ vỡ (AOFP-345, 26/11/2026, user chốt).** Luật `void_fill` áp cho nhóm `fragile`: kiện chỉ có quần áo, túi xách, mũ, dép không chèn gối. Để kiện thường vẫn đầy, AOFP-345 thêm gập tư quần áo và các cỡ thùng chuẩn ở mục 5.4.

## 8. Đơn gộp nhiều đơn

### 8.1. AURELLE — đóng chung kiện

- Các đơn AURELLE trong cùng nhóm gộp (cùng `consolidation_key`, tức cùng người nhận) được **giải chung một bài đóng gói**: engine gom toàn bộ hàng rồi áp mục 4–6.
- Một kiện có thể chứa hàng của nhiều đơn → kiện mang `order_ids[]` (đơn chủ `order_id` = đơn sớm nhất có hàng trong kiện), mỗi món ghi `order_id` của đơn sở hữu, và mã món có tiền tố mã đơn sàn: `AUR-A/TEE#1` (2 đơn cùng SKU không trùng mã khi quét/chuyển món/tháo kiện). Các kiện cùng bài gộp có chung `share_group`; chuyển món được giữa các kiện cùng `share_group`.
- **Một vận đơn GHN cho một kiện** (hệ thống vốn đã tạo mỗi kiện một đơn GHN qua `shipment.carrier_parcels`, nên không cần `service_type_id = 5`). Kiện vận đơn mang `order_ids[]`; mã vận đơn và trạng thái giao của kiện ghi ngược về **mọi đơn** trong kiện (outbox writeback). Thu hộ (COD) hiện luôn = 0 (thanh toán trước), nên chưa phải cộng COD.
- Trong kiện: mỗi món vẫn có túi zip riêng (định danh SKU); **mỗi đơn một phiếu đóng gói** (mã đơn + danh sách món) kẹp trong kiện chứa hàng của đơn đó.
- Đơn Hỏa tốc 3h, đơn đổi hàng `EXC-`, đơn bị che thông tin — vốn không sinh khóa gộp → không bao giờ đóng chung.

### 8.2. Lazada — mỗi đơn một kiện

Mỗi đơn Lazada có mã vận đơn riêng; giữ nguyên hành vi hiện tại (giải bài theo từng đơn, kiện mang 1 `order_id`).

### 8.3. Hủy / trả trong kiện gộp

- **Hủy một đơn trước khi niêm phong:** tính lại kế hoạch cho các đơn còn lại.
- **Hủy sau khi niêm phong:** dùng luồng **tháo kiện** (`unseal`) có sẵn → lấy hàng của đơn bị hủy ra → tính lại kế hoạch → niêm phong lại.
- **Trả hàng:** theo từng món kèm mã đơn — không phụ thuộc kiện gộp.

## 9. Thay đổi kỹ thuật cần làm (sau khi duyệt)

> Tiến độ (31/10/2026): **T1–T8 xong ở backend** (nhánh `feature/packaging-standard`); T9 (FE) chưa làm. Túi niêm phong mặc định **tắt** (`packing_settings.mailer_enabled = false`) tới khi xác nhận GHN nhận túi làm lớp ngoài; bật bằng `PUT /packing/settings` `{ "mailer_enabled": true }` sau khi chạy `npx ts-node scripts/seed-packaging-mailers.ts`. Kiện gộp (T6–T7) chưa qua bước chứng minh CP-SAT (chỉ BRKGA), và chỉ áp cho kế hoạch tính mới — kế hoạch cũ đọc `order_ids` rỗng như `[order_id]`, không cần migrate.

| # | Thay đổi | Phạm vi |
|---|---|---|
| T1 | Solver lấy `volumetric_divisor` từ hãng vận chuyển (GHN 5000) thay vì mặc định 6000, và so **cước theo bậc làm tròn** (bảng bậc trong cấu hình hãng) trước khối lượng quy đổi | `packing-plan.service.ts`, `solver/objective.ts` |
| T2 | `packaging_materials.kind` thêm `'mailer'` (rộng, dài, giá, tồn kho); seed 4 cỡ | `packaging-materials` |
| T3 | `product_masters.outer_requirement` + mặc định theo loại; thêm `ProductCategory.bag` (đăng ký FLAT/không FLAT, mô hình 3D) | `product-master`, `common/enums` |
| T4 | Hàm thuần `mailerFits(stack, mailer, settings)` + kích thước tính cước túi đã nhồi; có unit test | `packaging/` |
| T5 | Solver: sinh phương án túi niêm phong + so sánh A/B (mục 6) theo tổng chi phí | `packing/solver/` |
| T6 | `PlanParcel.box.kind: 'box' \| 'mailer'`; thêm `order_ids[]`, `share_group`, `placements[].order_id` (giữ `order_id` = đơn chủ để tương thích; dữ liệu cũ `order_ids` rỗng = `[order_id]`) | `packing-plan.schema.ts`, `utils/shared-parcel.util.ts` |
| T7 | Gộp bài toán theo nhóm AURELLE cùng khóa gộp (Lazada giữ mỗi đơn một bài); `carrier_parcels[].order_ids`; mã vận đơn + trạng thái giao ghi ngược cho mọi đơn trong kiện; phiếu đóng gói in cho mọi đơn có hàng trong kiện, tem vận đơn in "A + B"; hủy 1 đơn → tháo cả kiện gộp | `packing`, `shipments`, `marketplace-writeback`, `documents`, `order-groups` |
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
| 1 áo thun M (24×30×2,5) | Không vừa thùng S (24 > 20 cm, gập đôi 24×15 vẫn > 20) → thùng M 35,6×25,6×20,6 = 18.774 cm³ → 3,75 kg → **bậc 4 kg** | Gập đôi (24×15×5) → `MAILER-25X35`, nhồi 25×16×5,5 = 2.200 cm³ → 0,44 kg → **bậc 0,5 kg** |
| 1 áo thun L (25×32×3) | Thùng M → **bậc 4 kg** | Nguyên dạng cần `MAILER-32X45` (nhồi 33×26×3,5 → 0,60 kg); gập đôi vừa `MAILER-25X35` (nhồi 26×17×6,5 → 0,57 kg) — cùng **bậc 1 kg**, engine chọn túi rẻ hơn (25×35, gập đôi) |
| 2 áo thun + 1 quần dài | Thùng M | Chồng dày t = 3 + 3 + 3.5 = 9.5 cm > 8 cm → không vừa 1 túi; engine so 2 túi niêm phong với 1 thùng, chọn theo mục 2 + 6 |
| 1 áo + 1 đôi giày | Thùng M | So A/B mục 6 — thường A (1 thùng) |
| 2 đơn AURELLE cùng người nhận, mỗi đơn 1 áo M | 2 thùng M, 2 vận đơn | Chồng dày 5 cm → 1 túi `MAILER-32X45` (nhồi 31×25×5,5 → 0,85 kg, bậc 1 kg), 1 vận đơn, 2 phiếu đóng gói |

> Số trong mục 11 là minh hoạ, dùng khuôn gấp giả định ở 5.2; số chính xác do engine tính sau khi code xong.
