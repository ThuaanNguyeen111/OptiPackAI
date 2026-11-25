# Kế hoạch nâng cao tối ưu đóng gói (24/11/2026)

Tiếp theo audit [PACKING_SOLVER_AUDIT_2026-11-20.md](PACKING_SOLVER_AUDIT_2026-11-20.md). Bộ giải đã gần hết dư địa
(CP-SAT chỉ đổi phương án 5/300 đơn; 54 đơn chưa chứng minh chỉ thiếu nhãn, không tốn tiền hơn). Chỗ lệch thật
nằm ở **dữ liệu đầu vào** và **cách ước tính cước**. Kế hoạch dưới đây xếp theo thứ tự làm, không theo mức tác động:
việc nào làm được ngay mà không chờ ai thì làm trước.

| Bước | Việc | Ai | Công | Chờ gì |
|---|---|---|---|---|
| 0 | Push + PR commit audit `19719d1` | Claude | 0,5 giờ | Số ticket Jira (đang tạm AOFP-341) |
| 1 | Bộ kiểm thử bằng đơn thật | Claude | 0,5 ngày | — |
| 2 | Mô phỏng danh mục thùng | Claude | 1 ngày | Bước 1 (dùng chung bộ đơn thật) |
| 3 | Danh sách SKU chặn nhiều đơn nhất + đo lại | Claude (code) + kho (đo) | 2 giờ code | Kho đo |
| 4 | Báo cáo phản hồi nhân viên | Claude | 0,5 ngày | — |
| 5 | Cước theo tuyến khi so phương án | Claude | 1 ngày | Product quyết Q1; đủ vận đơn thật để kiểm |
| — | Q1/Q2 trong audit | Product | — | — |

Mỗi bước một ticket, một nhánh, một PR (`type(AOFP-n): …`, dòng body ≤ 100 ký tự). Script mới đều **chỉ đọc DB**.

## Kết quả (24/11/2026)

| Bước | Trạng thái | Kết quả |
|---|---|---|
| 0 | Chờ số ticket | Commit `19719d1` trên `fix/AOFP-341-packing-solver-accuracy`, chưa push |
| 1 | Xong | `scripts/export-real-orders.ts` → `datasets/packing/real-v1.jsonl`: 41 nhóm đơn → 34 case (bỏ 3 có SKU chưa `ready`; ~½ là shop `DEMO-*`). `dataset:packing check` (CI) chạy kèm: 34/34 hợp lệ, 0 thùng tốt hơn bị bỏ sót, 0 nhãn mâu thuẫn |
| 2 | Xong | `scripts/simulate-box-catalog.ts` — bảng dưới |
| 3 | Xong phần code | `scripts/report-blocked-skus.ts`: **chỉ 1 nhóm đơn đang bị chặn** (1 SKU, từ 29/10). 797 SKU "cần đo" phần lớn chưa có đơn → không phải việc gấp như đánh giá ban đầu. Kho: đo SKU đó + cân lại bì BOX-M |
| 4 | Không cần code | `buildFeedback` (packing-feedback.service.ts) đã có và có API `GET packing-plans/reports/feedback`. Trên 93 kế hoạch: làm theo 96,8%, 2 kế hoạch chỉnh tay (1 đổi thùng vì BOX-M hết hàng, 1 mở kiện "khác"), 4 lần báo lỗi cân, **1 từ chối "thùng quá rộng" đang mở và quá hạn** — khớp với bước 2 (khoảng trống giữa BOX-M và BOX-LT) |
| 5 | Hoãn | Mọi kế hoạch (93/93) và cài đặt đều dùng `fewest_parcels`; làm báo giá GHN cho `lowest_total_vnd` lúc này không đổi kế hoạch nào mà thêm lời gọi GHN. Làm khi Product bật chế độ này (Q1) |

### Mô phỏng danh mục thùng trên 34 đơn thật (bước 2)

Cước ước tính theo biểu cước phẳng; bì và giá cỡ mới ước theo đường khớp diện tích bìa (cần báo giá thật).

| Phương án | Kiện | Cân tính cước | Tổng cước + thùng | Chênh | Đơn đổi |
|---|---|---|---|---|---|
| Hiện tại (S, M, LT, L) | 40 | 150 kg | 1.734.500đ | — | — |
| Bỏ BOX-M | 40 | 191 kg | 1.966.500đ | +232.000đ | 18 |
| Bỏ BOX-LT | 40 | 155 kg | 1.795.500đ | +61.000đ | 14 |
| Bỏ BOX-L | 42 | 151 kg | 1.788.500đ | +54.000đ | 1 |
| Bỏ BOX-S | 40 | 155 kg | 1.765.500đ | +31.000đ | 3 |
| Thêm 35×25×10 | 40 | 150 kg | 1.722.800đ | −11.700đ | 13 (chỉ rẻ thùng; M đã cắt hạ được) |
| Thêm 30×20×15 | 40 | 144,5 kg | 1.693.800đ | −40.700đ | 12 |
| **Thêm 42×32×20** | 40 | 133 kg | 1.639.000đ | **−95.500đ (−5,5%)** | 11 |
| Thêm 42×32×25 | 40 | 133 kg | 1.649.600đ | −84.900đ | 12 |
| Thêm 42×32×25 + 30×20×15 | 40 | 127,5 kg | 1.605.800đ | −128.700đ (−7,4%) | 23 |
| Thay BOX-LT bằng 42×32×25 | 39 | 136,5 kg | 1.647.600đ | −86.900đ | 16 |

Đọc: mọi thùng đang có đều đáng giữ. Một cỡ **khoảng 42×32×20 cm** (giữa M và LT) giảm ~11% cân tính cước; thêm
cả 30×20×15 giảm ~15%. Trước khi đặt mua: lấy báo giá + cân bì thật, chạy lại script với số thật
(`--scenarios=...`), và chạy lại khi có thêm đơn (34 đơn còn ít).

---

## Bước 1 — Bộ kiểm thử bằng đơn thật

**Vì sao trước:** benchmark và `dataset:packing` hiện toàn đơn sinh ngẫu nhiên. Bước 2 và mọi thay đổi bộ giải sau
này cần đo trên đơn thật.

**Làm:**
1. Script `be/scripts/export-real-orders.ts` (chỉ đọc): lấy kế hoạch mới nhất của mỗi nhóm đơn trong
   `packing_plans`, đếm số món theo SKU từ `parcels[].placements[].sku`, ghép hồ sơ SKU hiện tại trong
   `product_master` thành `PackableItem` giống `mapSkuQuantitiesToPackableItems` (order-groups.service.ts).
2. Ghi ra `be/scripts/datasets/packing/real-v1.jsonl` cùng định dạng `v1.jsonl`. **Ẩn danh**: không mã đơn, không
   shop_id, không tên khách; SKU đổi thành mã băm ngắn.
3. Chụp kèm danh mục thùng đang dùng (`packaging_materials`, kích thước + bì + tải + giá) vào cùng file, để chạy lại
   không phụ thuộc DB.
4. `dataset:packing check` chạy thêm bộ này: hợp lệ 100%, 0 nhãn tối ưu mâu thuẫn, không thùng tốt hơn bị bỏ sót.

**Xong khi:** CI chạy được bộ đơn thật; ghi số đơn, số kiện, tổng cước ước tính làm mốc.

**Rủi ro:** chỉ có ~93 kế hoạch, nhiều đơn 1 món. Hồ sơ SKU lấy theo hiện tại, không theo lúc đóng — ghi rõ trong
file. SKU có hồ sơ chưa `ready` thì bỏ đơn đó và đếm số đơn bị bỏ.

## Bước 2 — Mô phỏng danh mục thùng

**Câu hỏi trả lời được:** thêm/bỏ/đổi cỡ thùng nào thì tổng cước và số kiện thay đổi bao nhiêu trên đơn thật.

**Làm:**
1. Script `be/scripts/simulate-box-catalog.ts`: đọc bộ đơn thật (bước 1) + một file phương án danh mục, ví dụ
   ```json
   [{ "name": "hiện tại" },
    { "name": "thêm BOX-ML 35×25×15", "add": [{ "code": "BOX-ML", "inner_mm": [350, 250, 150], "tare_g": 180, "price_vnd": 4500 }] },
    { "name": "bỏ BOX-S", "remove": ["BOX-S"] }]
   ```
2. Mỗi phương án: chạy `solveWithMailers` cho mọi đơn với cùng cài đặt đóng gói và túi niêm phong đang dùng, bỏ qua
   tồn kho (giả định đủ thùng).
3. In bảng: tổng kiện, tổng cân tính cước, tổng cước ước tính, tổng tiền thùng + vật tư, số đơn đổi thùng, đơn nào
   tốt lên/xấu đi nhiều nhất; tần suất dùng từng cỡ thùng.
4. Chế độ tự gợi ý (tuỳ chọn, chỉ khi bước 3 có kết quả): thử lưới chiều cao cho 1 cỡ mới giữa hai cỡ đang dùng.

**Xong khi:** có bảng so sánh ít nhất 4 phương án trên đơn thật, đưa Product/kho chọn.

**Rủi ro:** cước ước tính dùng biểu cước phẳng (xem bước 5) — so **cân tính cước** đáng tin hơn so tiền. Ít đơn nên
chênh lệch nhỏ có thể là nhiễu; ghi kèm số đơn bị ảnh hưởng.

## Bước 3 — SKU chặn nhiều đơn nhất

**Hiện trạng:** 797 SKU chưa `ready`. `order_groups.packing_blocked_skus` đã lưu SKU đang chặn từng nhóm (có
index), `GET order-groups` đã trả về `skus` của từng nhóm.

**Làm:**
1. Thêm vào `report-stack-load-gaps.ts` (hoặc script riêng) bảng: SKU → số nhóm đơn đang bị chặn, số món đang chờ,
   đã có số đo sàn (`marketplace_dimension`) chưa. Sắp giảm dần để kho đo trước.
2. Nếu Admin cần xem trên web: thêm lọc/sắp theo số nhóm bị chặn vào màn "cần đo" (`GET product-master?status=
   needs_measurement`) — chỉ làm khi kho yêu cầu.
3. Kho cân lại bì BOX-M (cân thật lệch +13% trên 4 kiện), cập nhật kho vật tư.

**Xong khi:** kho có danh sách ưu tiên; chạy lại `report-packing-accuracy.ts` sau khi sửa bì BOX-M.

## Bước 4 — Báo cáo phản hồi nhân viên

**Hiện trạng:** `packing_plans.adjustments[]` lưu `kind` (đổi thùng, chuyển món, xếp tay, đổi thùng trong phiên, mở
kiện…), `reason`, `skus`, `box_codes`; `packing-feedback.service.ts` đã gom `byReason`, `bySku`, `byBox`,
`followedRate`.

**Làm:**
1. Script chỉ đọc (dùng lại hàm gom của feedback service nếu tách được thành hàm thuần) in: tỉ lệ làm theo kế hoạch,
   lý do lặp lại theo SKU và theo thùng, cặp "thùng gợi ý → thùng thật dùng" hay gặp.
2. Quy tắc gợi ý: SKU có ≥ 2 lần đổi thùng vì "chật" → đề xuất đo lại; thùng có ≥ 2 lần "móp/hỏng" → kiểm tải tối
   đa; luôn đổi từ X sang Y → xem lại luật xếp chồng hoặc kích thước X.

**Xong khi:** có danh sách đề xuất sửa dữ liệu, đưa Admin duyệt (không tự sửa).

## Bước 5 — Cước theo tuyến khi so phương án

**Hiện trạng:** chế độ `lowest_total_vnd` dùng biểu cước phẳng 22.000đ + 2.500đ/bậc. Cước GHN thật phụ thuộc tuyến
(190 g = 60.500đ, 1.020 g = 20.900đ). `live-carrier.service.ts` đã gọi báo giá GHN (`preview.fee.total`).

**Làm:**
1. Khi `prefer = lowest_total_vnd` và nhóm đơn có địa chỉ giao: lấy 2–3 phương án đứng đầu (theo `objectiveOf`),
   gọi báo giá GHN cho từng kiện của từng phương án, xếp lại theo tổng tiền thật. Lỗi/hết giờ → giữ thứ hạng cũ.
2. Giới hạn số lần gọi (cache theo tuyến + cân + kích thước trong vài phút) để không chạm hạn mức API GHN.
3. Ghi vào lời giải thích kế hoạch: "đã so báo giá GHN: A 44.000đ, B 62.000đ".

**Chờ:** Product trả lời Q1 (ưu tiên ít kiện khi chênh tiền nhỏ không, ngưỡng bao nhiêu). Cần thêm vận đơn thật
(hiện 6 kiện có cước) để kiểm lại bằng `report-packing-accuracy.ts`.

**Rủi ro:** tính kế hoạch chậm thêm thời gian gọi GHN; phải chạy khi đã có địa chỉ, nên chỉ áp cho chế độ này.

---

## Không làm

- Đào sâu CP-SAT cho 54 đơn còn hết giờ: đã thử tăng thời gian và thêm ràng buộc cumulative — tối đa +2–4 nhãn,
  đổi lại chờ gấp đôi hoặc mất tính xác định (audit, mục 23/11).

## Cần Product quyết (audit Q1/Q2)

- **Q1:** khi 2 phương án chênh tiền nhỏ, có ưu tiên phương án ít kiện hơn không? Ngưỡng bao nhiêu đồng?
- **Q2:** một lần gập áo tính tương đương bao nhiêu tiền (để so với phương án không gập)?
