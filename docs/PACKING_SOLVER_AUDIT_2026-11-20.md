# Audit bộ giải đóng gói OptiPackAI (brkga-ems-v2)

Ngày: 20/11/2026

**Kết luận:** không tìm thấy phương án nào sai luật: 300/300 đơn dataset v1 và 12 ca biên tự dựng đều qua validator. Lỗi nằm ở **bước chọn phương án**:

- Một bug chọn thùng to, cước cao hơn, dù đã thử qua thùng nhỏ hơn hợp lệ.
- Nhãn `optimal_global` gắn cả cho những lựa chọn sai đó.
- Hàm mục tiêu chưa khớp tiêu chí "tốt hơn" của `docs/PACKAGING_STANDARD.md` §2.

## Trạng thái triển khai (20/11/2026, chưa commit)

| Issue | Trạng thái | Thay đổi |
|---|---|---|
| OPT-1 | Xong | `decoder.ts`: co thùng thử mọi thùng còn tồn, giữ kiện tốt nhất theo `compareObjective` (`parcelBetter` trong `DecodeContext`) |
| OPT-3 | Xong | `proof.ts`: xét bậc cước bằng cận dưới cước mỗi thùng (cắt hạ thấp nhất có thể); `cp-sat.ts` chỉ nhận `optimal_in_model` khi không còn tổ hợp nào có thể tốt hơn |
| OPT-5 | Xong | `solve-order.ts` `mergeParcels`: thử mọi cặp kiện, vơi nhất trước, cùng ngân sách |
| OPT-6 | Xong | `solve-order.ts` `tooLargeReason`: nói rõ do luật hướng hay do đệm dễ vỡ |
| OPT-3b | Xong | `proof.ts`: thùng đơn lẻ chỉ "có thể tốt hơn" khi chồng hàng thấp tới chiều cao cắt xuống bậc cước dưới (`beatHeight`), kiểm thùng đã hạ đó + kiểm từng cặp món; CP-SAT nhận đúng thùng đã hạ. Nhãn `optimal_global` 115 → 160/300 |
| OPT-7 | Xong | `npm run dataset:packing -- check` (CI) dò thùng tốt hơn bị bỏ sót, đỏ khi nhãn tối ưu mâu thuẫn; `evaluate --probe` cho cả 300 đơn. Solver cũ: 3 ca bỏ sót, 1 nhãn sai; mới: 0/0 |
| OPT-4 | Xong (chưa bật) | Chế độ `prefer = lowest_total_vnd`: tổng cước theo bậc từng kiện + bao bì + vật tư → số kiện → … Biểu cước lấy từ packing settings. Mặc định vẫn `fewest_parcels`; FE có thêm lựa chọn "Tổng tiền thấp nhất". Chưa có ngưỡng "ít kiện khi chênh nhỏ" và hệ số gập (Q1/Q2) |
| OPT-2 (phần nhẹ) | Xong | Kế hoạch ghi lời giải thích khi kiện dùng thùng/túi giá 0đ. Chặn tạo thùng không giá vẫn chờ Q4 |
| OPT-8 (dữ liệu) | Không còn việc | `scripts/report-stack-load-gaps.ts` (chỉ đọc). Số 797 SKU ghi ngày 20/11 là **đếm sai**: cả 797 đều chưa ở trạng thái `ready` nên bị chặn trước bộ giải. Đã sửa script chỉ đếm SKU `ready`; DB 22/11: 0 SKU hàng cứng đã đo mà trống sức chịu đè |
| Dữ liệu SKU (22/11) | Xong phần code | 66 hồ sơ cũ không có `packaging_profile_status` bị engine chặn nhưng không hiện trong danh sách "cần đo" — lọc `status=needs_measurement` nay bắt cả trường vắng, API trả `needs_measurement`. Đo và gán loại cho 797 SKU là việc của kho |
| Báo cáo độ chính xác (22/11) | Có báo cáo | `utils/packing-accuracy.util.ts` (+ test) và `scripts/report-packing-accuracy.ts` (chỉ đọc). DB 22/11: 26 kiện đã cân, lệch trung bình 20 g (2,6%, engine đoán nhẹ hơn), 24/26 lệch ≤ 10%, 26/26 đúng bậc cước. BOX-M lệch +13% trên 4 kiện → nên cân lại bì BOX-M. Cước GHN 6 kiện: phụ thuộc tuyến (190 g = 60.500đ, 1.020 g = 20.900đ) nên biểu cước phẳng 22.000đ + 2.500đ/bậc không hiệu chỉnh được từng này dữ liệu. Chưa SKU nào đủ ≥ 2 kiện một SKU để đề xuất sửa cân |
| CP-SAT đơn lớn (22/11) | Giữ nguyên cấu hình | `cpsat-benchmark.ts` 300 đơn: 12 món/6 s → 70 heuristic, p95 7,3 s; 20 món/12 s → 66 heuristic, p95 13,7 s. Thêm 4 nhãn không đáng gấp đôi thời gian chờ. So code trước audit: 46 heuristic / 204 optimal_global, CP-SAT cải thiện 1 đơn; sau audit: 70 / 157, cải thiện **5 đơn** (nhãn cũ có ca sai, xem OPT-7). 23/11: tổ hợp nhiều thùng cùng số kiện cũng gửi CP-SAT thùng đã hạ (`beatHeights`: mỗi thùng cao tối đa sao cho tổng cước, với các thùng kia ở mức thấp nhất, còn dưới mục tiêu) → 66 heuristic, p95 6,6 s, xác định 20/20 — bằng mức của cấu hình 20 món/12 s mà không tốn thêm thời gian. Trong 8 ca chưa giải đầu tiên còn 3 ca "xếp được nhưng không tốt hơn" (mỗi thùng đủ thấp riêng lẻ nhưng cộng lại vượt) và các ca CP-SAT hết giờ |
| CP-SAT chia ngân sách cước (23/11) | Xong | `billSplits`: tổ hợp ≥ 2 thùng chia tổng cước còn tốt hơn thành trần cho từng thùng; mỗi cách chia gửi CP-SAT thùng đã hạ lòng (theo quy đổi) và hạ tải (= trần − bì, `catalog_max_load_g` để `uncutBox` trả lại tải gốc) → cách xếp CP-SAT tìm được chắc chắn rẻ hơn. Tối đa 8 cách chia (24 không thêm nhãn, lệch xác định 1/20), dừng duyệt ở 200 để không tràn bộ nhớ. **Sửa lỗi** `cp-sat.ts`: lọc hướng xoay theo thùng đã gộp theo mã, nên khi cùng mã có thùng nguyên và thùng đã hạ thì có thể mất hướng xoay → 422 hoặc CP-SAT báo "không xếp được" sai; số 66 ở trên và 54 lúc thử đều bị lỗi này thổi phồng. Sau sửa: 63 heuristic, p95 7,2 s, xác định 40/40. Còn: tổ hợp khác mã (BOX-M + BOX-L) thường > 8 cách chia nên dùng cách cũ |
| Kiểm tra chia món vào thùng (23/11) | Xong | `assignReject` trong `cheapReject` (tổ hợp ≥ 2 thùng): duyệt cách giao mỗi món cho 1 thùng thoả vừa thùng, thể tích, tải và từng cặp món cùng thùng đặt chung được; không cách nào → loại trước CP-SAT (≤ 40 món, trần 5.000 bước). Trần 8 cách chia áp SAU kiểm tra này. Benchmark: 63 → **54** heuristic, optimal_global 157 → 159, p95 6,7 s, xác định 40/40; đơn #12, #37 hết "xếp được nhưng không tốt hơn". Còn lại đều là CP-SAT hết giờ |
| Ràng buộc cumulative trong CP-SAT (23/11) | Đã thử, **đã gỡ** | Ràng buộc dư "tổng tiết diện các món cắt qua một mặt phẳng ≤ tiết diện thùng" (mỗi thùng, mỗi trục) trong `packer/feasibility.py`: 54 → 52 heuristic, p95 không đổi (6,8 s) nhưng lệch xác định 1/20 (chạm trần thời gian thật trước trần thời gian xác định). Không đáng đổi lấy kết quả không lặp lại → trả file về như cũ. Lưu ý khi thử lại: demand của `add_cumulative` phải là 1 biến, không phải tổng |
| OPT-9, OPT-10 | Chưa làm | — |

Đo trên 300 đơn dataset v1, trước → sau:

| Chỉ số | Trước | Sau |
|---|---|---|
| Phương án hợp lệ | 300/300 | 300/300 |
| Tổng kiện | 418 | 417 |
| Tổng VND ước tính | 21.967.000 | 21.966.000 (6 đơn rẻ hơn, 2 đơn đắt hơn) |
| Số lần gập | 153 | 149 |
| Nhãn `optimal_global` | 213 (một phần gắn sai) | 115 |
| p95 / tổng thời gian | 855 ms / 60 s | 975 ms / 65 s |

Dataset v1 có giá thùng tăng dần theo cỡ nên F1 ít lộ. Ca thật trong test (bảng 4 thùng kho, 2 áo): trước vào BOX-M gập 2 lần, cước 4000 g, nhãn "tối ưu"; sau vào BOX-LT cắt hạ, cước 2500 g, không gập (~44.000đ → ~38.000đ).

Trong 185 ca heuristic: 85 ca chỉ còn đúng bộ thùng đang chọn (chưa chứng minh được không có cách xếp nào cắt hạ thấp hơn), 39 ca còn bộ thùng khác cùng số kiện, 61 ca còn tổ hợp ít kiện hơn.

## 1. Hiện trạng

Luồng thực tế, từ đơn đã nhặt đến kế hoạch lưu:

1. **Đầu vào:** `PackingPlanService` (`be/src/modules/packing/packing-plan.service.ts`) chỉ tính khi nhóm đơn đã `picked`; `allocatePickedItemsToOrders` chia hàng về từng đơn.
2. **Chuẩn hóa món** (rule, `packaging/engine/units.ts` `expandToUnits`): cm/kg → mm/g làm tròn lên; đệm dễ vỡ 2×5 mm; quần áo nằm phẳng, `upright_only` đặt đứng, quần áo gập được sinh thêm biến thể gập. Hàng cứng để trống `max_stack_load` = không chịu gì; quần áo trống = 5 kg.
3. **Danh mục thùng** (rule): `listActiveSpecs` + `listAvailability` trả thùng còn tồn. Thùng không nhập giá được lưu 0đ (`packaging-box.service.ts:308`).
4. **Sinh phương án** (thuật toán, không AI/ML, `packing/solver/solve-order.ts`): loại món không xếp được; ≤3 món vét cạn, lớn hơn dùng BRKGA. Bộ giải mã (`decoder.ts`) xếp EMS/DFTRC rồi "co thùng" (`decoder.ts:140`); sau đó gộp cặp kiện và chia đều tải.
5. **Kiểm tra ràng buộc:** `ParcelState.check` trong lúc xếp, `validatePlan` kiểm lại độc lập; sai là ném lỗi, không lưu.
6. **Chấm điểm** (rule, `objectiveTierOrder` ở `objective.ts:182`): `fewest_parcels` (mặc định) so không xếp được → số kiện → tổng gram tính cước → giá bao bì → cân quy đổi → số lần gập → lệch tải → trọng tâm. `cheapest` đưa tổng gram lên trước số kiện.
7. **Túi niêm phong** (`solveWithMailers`): đơn toàn hàng mềm so bằng `compareObjective`; đơn trộn mềm/cứng so bằng VND ước tính (`estimateTotalVnd`).
8. **Chứng minh** (`proof.ts`): điều kiện cần (thể tích, cân, diện tích sàn) trên các tổ hợp thùng rẻ hơn theo giá; đơn ≤12 món có CP-SAT (`packer/`) kiểm thêm.
9. **AI:** Groq chỉ viết lời hướng dẫn (`packing-guide-ai.service.ts`), không tham gia chọn thùng.

**Phương án hợp lệ** (theo code) thỏa tất cả:

- Mỗi món đúng 1 lần, trong lòng thùng, không chồng lấn; đúng hướng cho phép.
- Đỡ đủ 100% đáy (quần áo 80%); hàng cứng không nằm trên quần áo trừ hàng dễ vỡ.
- Không vượt tải chồng, không đè lên món dễ vỡ; không vượt tải thùng và tồn.
- Túi đủ lề và độ dày; Lazada mỗi đơn một kiện, AURELLE cùng người nhận được đóng chung.
- `max_parcels_per_order` chỉ là cảnh báo.

**Phương án tốt hơn** đang được tài liệu và code hiểu khác nhau:

- Tài liệu §2: bảo vệ hàng → cước VND thấp nhất → vật tư và thời gian đóng; ít kiện hơn chỉ ưu tiên khi chênh cước nhỏ.
- Code: số kiện trước, rồi tổng gram tính cước. Tổng gram bỏ qua cước bậc đầu tính cho mỗi kiện; thời gian thao tác chỉ có qua số lần gập, ở bậc 6.

Skill Matt Pocock đã áp dụng: `grilling` (câu hỏi Q1–Q4 ở mục 4) và `domain-modeling`. `GLOSSARY.md` chưa định nghĩa "phương án hợp lệ", "phương án tốt hơn", "cước ước tính" — đây là chỗ tài liệu và code đang lệch nhau.

## 2. Bảng phát hiện

Đã chạy: `jest` solver + engine 247/247 pass; sweep 300 đơn dataset v1 (giải lại từng kiện với thùng rẻ hơn, từng cặp kiện vào 1 thùng, ngân sách ×5 với 3 seed); 12 ca biên tự dựng.
Trạng thái: **đã chạy** = tái hiện được; **code** = xác nhận qua đọc code; **giả thuyết** = chưa kiểm.

| Ưu tiên | Trạng thái | Ca cụ thể | Kết quả hiện tại | Nguyên nhân và bằng chứng | Cách cải thiện | Cách đo |
|---|---|---|---|---|---|---|
| P0 | Đã chạy | Danh mục mẫu + thùng XL 600×500×400 chưa nhập giá (0đ); đơn 1 kính / 1 áo / 1 giày | Cả 3 bị dồn vào XL: cước 1000→4500 g, 1000→2500 g, 2500→8500 g; tổng ước tính +15.000đ, +3.000đ, +25.500đ; nhãn vẫn `optimal_global` | "Co thùng" (`decoder.ts:140`) đổi sang thùng rẻ hơn theo giá (`cheaper()`, `decoder.ts:61`) mà không so bậc cước; giá trống lưu thành 0 (`packaging-box.service.ts:308`) | Co thùng chỉ nhận khi `compareObjective` của kiện mới tốt hơn; thùng chưa có giá bị chặn hoặc loại | Test hồi quy danh mục giá không đơn điệu; probe phải về đúng thùng cũ |
| P0 | Đã chạy | Món 30×20×15 cm 0,5 kg: TO-RẺ 500×400×350 2000đ vs NHỎ-ĐẮT 310×210×160 6000đ | Chọn TO, cước 7000 g thay vì 2500 g (~54.000đ vs ~33.000đ), nhãn `optimal_global` | Như trên; thêm: `proof.ts:36` chỉ xét tổ hợp rẻ hơn theo giá thùng, không xét bậc cước nên tuyên bố tối ưu sai | Chứng minh xét đúng thứ tự bậc, có cận dưới cước mỗi thùng (tính cả cắt hạ) | Không ca nào vừa có nhãn `optimal_*` vừa bị sweep tìm ra phương án tốt hơn |
| P1 | Đã chạy | 2 thùng hàng 30×20×12 1 kg chồng được, chế độ `cheapest`: S1 1500đ vs M2 4500đ | 2 kiện S1, ~62.000đ, thay vì 1 kiện M2 ~44.000đ | Bậc `billable_g` cộng gram (2000+2000 = 4000) nên hòa, bỏ qua cước bậc đầu 22.000đ mỗi kiện; đơn trộn lại dùng VND (`solve-with-mailers.ts:376`) | Thay `billable_g` bằng bậc `est_total_vnd` (cước từng kiện + bao bì + vật tư); cần Q1 | Sweep: VND/đơn, kiện/đơn trước và sau |
| P1 | Đã chạy | `SYN-validation-20261118-0021`: 2 hộp giày + 1 jean + 2 kính | M+L (2 kiện) dù 1 thùng L chứa đủ; `SYN-train-20261117-0127` (8 món) 3 kiện, ngân sách ×5 ra 2 | Gộp kiện (`solve-order.ts:471`) chỉ ghép kiện vơi nhất với từng kiện khác, mỗi lần 400 lượt (`:399`) | Gộp mọi cặp; phần hợp ≤8 món giải với ngân sách lớn hơn, thử từng thùng đơn | 19/87 ca heuristic cải thiện khi ×5 ngân sách (2 giảm kiện, 13 giảm cước); mục tiêu ~0 |
| P1 | Đã chạy | 4 hộp giày tải chồng 0,3 kg (giá trị dataset) | 2 kiện L ~110.000đ; nếu chịu 5 kg: 1 kiện ~80.000đ. 9 hộp giày ra 5 kiện (cận dưới 4) | Dữ liệu: hộp giày 0,9 kg không đặt lên nhau được; hàng cứng để trống = không chịu gì | Kho chốt tải chồng thực tế (Q3); báo thiếu dữ liệu | Kiện/đơn của đơn giày trước và sau |
| P2 | Đã chạy | Món dễ vỡ 19,5×14,5×9,5 trong thùng 20×15×10; món `upright_only` chỉ vừa khi nằm | `ITEM_TOO_LARGE` "không vừa… mọi hướng, kể cả khi gập" | Thông báo sai nguyên nhân: thực ra do đệm 5 mm/mặt hoặc luật đặt đứng (`solve-order.ts:154`) | Thử lại không đệm / mọi hướng rồi ghi đúng lý do | Test lý do theo từng nguyên nhân |
| P2 | Code | Nhóm nhiều đơn Lazada tranh thùng nhỏ cuối cùng | Đơn giải trước lấy thùng trước | Phân bổ tồn tham lam theo thứ tự (`packing-plan.service.ts:577`) | Chỉ làm khi dữ liệu cho thấy hay xảy ra | Đếm kế hoạch có `RECOMMENDED_BOX_NOT_IN_STOCK` |
| P2 | Đã chạy | Bộ kịch bản `order-scenarios.ts` | `scenario-runner.spec.ts` chạy engine cũ (`packOrder`), không phải `solveOrder` | Thiếu test hồi quy cho bộ giải production; không có danh mục giá không đơn điệu | Chạy kịch bản qua `solveWithMailers`, đưa sweep vào CI | CI đỏ khi có bỏ sót |
| P3 | Giả thuyết | 6 món 4 kg | Kiện L 20 kg + kiện S 1 món | Lệch tải đứng sau giá bao bì; chưa có trần cân thao tác | Chờ Q4 | — |

Hiệu năng trên 300 đơn: p50 14 ms, p95 524 ms, max 2,6 s; chạy 2 lần cho cùng kết quả.
Các ca đã đúng: vừa nhờ xoay; 10/20/40 áo thun; hết tồn trả `OUT_OF_STOCK`; đơn trộn giày + áo giữ thùng khi tách không đủ rẻ.

**Chưa kiểm:** `packer/` (Python CP-SAT) vì máy thiếu `pytest`/`ortools`; bảng so sánh thùng trên FE. Dataset v1 là dữ liệu tổng hợp; VND dùng biểu phí giả định 22.000đ + 2.500đ/bậc 500 g, không phải cước GHN thật.

## 3. Backlog

Sửa lỗi chọn sai (OPT-1–3) trước, rồi mới tối ưu chi phí và tốc độ (OPT-4–8), ML để sau cùng.

| Issue | Phạm vi và file | Phụ thuộc | Nghiệm thu |
|---|---|---|---|
| OPT-1 Co thùng theo mục tiêu | `decoder.ts` `decode()` vòng co thùng: thử mọi thùng còn tồn mà `packInto` vừa, giữ thùng có `compareObjective(summarizePlacements(...))` tốt nhất | — | Ca XL-0đ và TO-RẺ ra đúng thùng nhỏ; 247 test cũ vẫn xanh; p95 sweep tăng ≤20% |
| OPT-2 Giá thùng bắt buộc | `packaging-box.service.ts:308`: bỏ `?? 0`; thùng `price_vnd` null bị loại khỏi `listActiveSpecs`, cảnh báo cho Admin | Q4 | Tạo thùng không giá bị từ chối hoặc gắn cờ; không kế hoạch nào dùng thùng chưa có giá |
| OPT-3 Nhãn chứng minh trung thực | `proof.ts` `proveOptimality`: tập tổ hợp "tốt hơn" xét theo bậc (số kiện → cận dưới cước → giá) | OPT-1 | Không ca nào có nhãn `optimal_*` mà sweep vẫn tìm ra phương án tốt hơn |
| OPT-4 Mục tiêu bằng VND | `objective.ts` thêm `est_total_vnd`, đổi `objectiveTierOrder`; `solve-with-mailers.ts` dùng chung thước đo | Q1, Q2, OPT-1 | Ca `cheapest` ra 1 kiện 44.000đ; §2 tài liệu khớp code |
| OPT-5 Gộp kiện mạnh hơn | `solve-order.ts` `mergeParcels`: mọi cặp, ngân sách theo cỡ phần hợp, thử từng thùng đơn; chỉ cho ca heuristic | OPT-1 | `validation-0021` ra 1 kiện; ca cải thiện khi ×5 ngân sách từ 19 xuống ≤3; p95 ≤1 s |
| OPT-6 Lý do không xếp được | `solve-order.ts` bước 1: phân biệt do đệm / do hướng / do kích thước | — | Test 3 nguyên nhân |
| OPT-7 Harness hồi quy | Chuyển `scenario-runner` sang `solveWithMailers`; đưa sweep vào `scripts/` + CI, thêm danh mục giá không đơn điệu | — | CI đỏ khi bỏ sót thùng hoặc bỏ sót gộp |
| OPT-8 Dữ liệu tải chồng | Product Master: mặc định tải chồng theo loại hàng cứng | Q3 | Kiện của đơn giày giảm, không tăng tỷ lệ báo hàng móp |
| OPT-9 Snapshot và nhãn cho ML | Lưu đầu vào đầy đủ (món, thùng, tồn, cài đặt) vào `packing_plans`; nối với điều chỉnh, từ chối, cân thực tế lúc niêm phong | — | Replay một kế hoạch cũ ra đúng kết quả cũ |
| OPT-10 Xếp hạng ML (shadow) | Học xếp hạng top-K phương án hợp lệ do solver sinh; không học ràng buộc cứng | OPT-9, đủ dữ liệu | Offline: dự báo việc nhân viên đổi thùng tốt hơn luật bậc trên tập test cố định; shadow ≥4 tuần |

**Về ML:** nhãn đã có sẵn (lý do điều chỉnh/từ chối như `BOX_TOO_TIGHT`, `TOO_MANY_PARCELS`; đổi nguồn thùng; `actual_weight_kg` lúc niêm phong) nhưng chưa đủ để train vì chưa lưu snapshot đầu vào. Việc ML có giá trị sớm nhất, rủi ro thấp: hồi quy cân thực tế so với cân ước tính để sửa `billable_g`, không đụng luật xếp.

| Chỉ số | Đo được khi nào |
|---|---|
| Tỷ lệ hợp lệ, kiện/đơn, VND ước tính/đơn, khoảng cách tới cận dưới, tỷ lệ nhãn chứng minh, p95 | Ngay, trên dataset v1 + probe |
| Tỷ lệ nhân viên đổi thùng, chênh lệch cân lại, cước GHN thực tế, thời gian đóng mỗi kiện, tỷ lệ hư hỏng | Cần dữ liệu vận hành (sau OPT-9) |

## 4. Ba việc nên làm trước

1. **OPT-1 + OPT-2** trong một PR nhỏ. Đây là lỗi chọn sai thật: chỉ cần một thùng to giá 0 hoặc giá rẻ là mọi đơn nhỏ bị đẩy sang thùng to. Danh mục hiện có giá tăng dần theo cỡ nên lỗi đang tiềm ẩn, nhưng một thao tác nhập liệu là kích hoạt.
2. **OPT-3.** Hội đồng và Admin đang đọc nhãn "tối ưu toàn cục"; nhãn sai mất uy tín hơn là để nhãn heuristic.
3. **OPT-4, rồi OPT-5.** Đưa hàm mục tiêu về VND như tài liệu, sau đó gộp kiện mạnh hơn. OPT-4 bị chặn bởi Q1.

### Câu hỏi cần Product / đội kho chốt

Mỗi câu ghi khuyến nghị; trả lời "có" là chấp nhận khuyến nghị.

| Câu hỏi | Khuyến nghị | Ảnh hưởng |
|---|---|---|
| Q1 – Tiêu chí số 1: chọn theo tổng VND ước tính (cước từng kiện + bao bì + vật tư), chỉ ưu tiên ít kiện khi chênh nhỏ hơn `split_min_saving_vnd`, đúng §2? | Có | OPT-4, OPT-5. `cheapest` hết chọn 2 kiện đắt hơn; `fewest_parcels` bỏ hoặc giữ làm ngưỡng |
| Q2 – Thời gian thao tác: mỗi lần gập có được quy ra tiền (ví dụ 500đ/lần) để vào cùng thước đo VND? | Có, hệ số nhỏ cấu hình được | OPT-4. Nếu không, gập tiếp tục chỉ là tiêu chí phụ |
| Q3 – Hộp giày có được chồng 2–3 hộp (khoảng 3–5 kg) thay vì 0,3 kg? | Có | OPT-8. Đơn 4 đôi từ 2 kiện còn 1 (−30.000đ ước tính) |
| Q4 – Thùng chưa nhập giá: chặn khi tạo thay vì tạm lấy giá mặc định? Có trần cân mỗi kiện (ví dụ 15 kg) làm ràng buộc cứng? | Có cho cả hai | OPT-2 và ca kiện 20 kg (P3). Nếu không có trần cân, kiện 20 kg vẫn được chọn khi rẻ hơn |
