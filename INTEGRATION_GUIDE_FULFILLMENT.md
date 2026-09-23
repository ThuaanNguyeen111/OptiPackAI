# OptiPackAI Backend — Integration Guide: Fulfillment & Warehouse (Package 3/4)

**Cập nhật 2026-09-11 (v3 — mở rộng đầy đủ nghiệp vụ + thiết kế DB).** **Cập nhật 12/09/2026 — phân biệt API đang chạy với flow mục tiêu.** **Cập nhật 16/09/2026 (v3.1)**: sửa mô tả sai quy tắc tie-break auto-assign (Nghiệp vụ 2); thêm 2 loại Notification mới + hành vi đổi của `markAsRead` (Nghiệp vụ 6); thêm mã lỗi `ORD_GROUP_ALL_ORDERS_CANCELED` (D.3). **Cập nhật thêm 16/09/2026 (v3.2)**: bổ sung hẳn mục **Nghiệp vụ 2b — Thiết lập kho** (4 bước Admin tạo kho→khu→kệ→gán SKU, trước đây CHƯA từng có hướng dẫn dù file có chữ "Warehouse" trong tên) + 3 API GET mới để xem lại + sửa lỗi `GET .../zones` + 2 mã lỗi mới (`WH_WAREHOUSE_CODE_IN_USE`, `WH_ZONE_CODE_IN_USE` — map lỗi trùng mã từ 500 thô sang 409 rõ ràng, thêm 19/09/2026). **Cập nhật 19/09/2026 (v3.3)**: mở role Warehouse Staff cho `GET /warehouse/warehouses` (trước chỉ Admin, khiến Warehouse Staff không có cách biết `warehouse_id` để gọi picking-list/pick-item/report-missing); `pick-item` giờ validate SKU thuộc group TRƯỚC khi trừ tồn kho (trước đây quét nhầm SKU vẫn trừ tồn thật) — cả 2 phát hiện từ báo cáo thật Hải Phượng. **🆕 Cập nhật 22/09/2026 (v3.8)**: engine đọc **tồn kho thùng** (chỉ chọn thùng còn trống, ghi thùng vừa hơn đã hết), multi-start 4 thứ tự xếp, `pack` trừ tồn + sổ xuất/nhập, cảnh báo sắp hết thùng; gỡ module `materials` (gộp vào `/packaging/boxes`). **🆕 Cập nhật 21/09/2026 lần 4 (v3.7)**: túi zip bọc từng món (danh mục `/packaging/bags`, hồ sơ SKU chọn túi + gập đôi, bước "cho vào túi" trong hướng dẫn) và hình 3D đại diện theo loại sản phẩm (`product_category`). **🆕 Cập nhật 21/09/2026 lần 3 (v3.6)**: hướng dẫn đóng gói từng bước cho animation 3D — engine quyết định vị trí/thứ tự, AI viết lời (Groq, bậc miễn phí), tự quay về câu mẫu khi thiếu cấu hình hoặc AI trả sai (`POST .../packaging/:recommendationId/guide`, field `packingGuide`). **🆕 Cập nhật 21/09/2026 lần 2 (v3.5)**: engine đóng gói 3D thật (greedy + validator, **mỗi đơn 1 kiện**, tọa độ xếp cho animation 3D), danh mục thùng `/packaging/boxes`, hồ sơ SKU `/product-master`, `pick-item`/`pick` đối soát số lượng theo lượt lấy, `pack` nhận cân thật từng kiện; FE có trang `/app/packing/groups` + animation — xem Nghiệp vụ 0, 1, 3, 4. **🔄 Cập nhật 21/09/2026 (v3.4)**: đồng bộ theo luồng **lấy hàng trước, đóng gói sau** (code AOFP-35 đã merge 20/09) — phân công diễn ra ngay lúc tạo group, `generate` chỉ gọi được khi group ở `picked`, `reject` quay về `picked` (không còn `awaiting_packaging`); sửa sơ đồ C.1/C.2 và thứ tự A.1. Phạm vi kiện mục tiêu vẫn là mỗi đơn một kiện (chưa triển khai). Đây là tài liệu tham chiếu ĐẦY ĐỦ NHẤT cho FE hiểu **concept hệ thống**, không chỉ danh sách endpoint. Đọc kèm `API_LIST.md` (bảng route/role) và `INTEGRATION_GUIDE_ORDERS.md` (nền tảng "gộp đơn").

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

| Trước đây | Trạng thái 21/09/2026 |
| --- | --- |
| Admin gọi generate | Vẫn Admin gọi; job tự động theo đơn/revision là BE-5 (chưa làm) |
| Approve/adjust bắt nhập cân thật dù chưa đóng | ✅ Đã sửa — approve/adjust chỉ chọn phương án; cân ở `pack`, so với hàng + bì (vật tư chưa có khối lượng) |
| Generate tính cả group thành một thùng | ✅ Đã sửa — mỗi đơn một phương án qua validator |
| Input SKU gộp, cm/kg | ✅ Engine nở thành từng đơn vị (`itemKey`), lõi mm/g; HTTP vẫn camelCase, `boxSize` cm giữ cho client cũ |
| Chỉ trả boxSize/materialType | ✅ Trả thùng + `placements` (tọa độ 3D) + ước tính; ⏳ chưa có nhánh túi mailer, snapshot hồ sơ/version |
| Pick có thể bấm ngay không đối soát | ✅ Đã sửa — `pick` đối soát đủ số lượng theo lượt; `pick-item` chặn quét dư, transaction trừ tồn + event |
| Decide-partial boolean → picked | ⏳ Một phần — `false` mở lượt lấy mới; `true` tính phương án trên số đã quét (chưa có đối soát giao thiếu với khách) |
| Pack chỉ nhận expected_version | ✅ Nhận cân thật từng kiện + cảnh báo bất thường; ⏳ chưa có attempt/revision, vật tư thực dùng |

Danh mục thùng (`/packaging/boxes`) và hồ sơ SKU (`/product-master`) đã có từ 21/09; API readiness riêng vẫn chưa có (thiếu hồ sơ báo qua 422 khi generate). Recommendation cũ thiếu snapshot phải tính lại trước xử lý mới; không tự chứng nhận hợp lệ từ trạng thái approved cũ.

---

# PHẦN B — TOÀN BỘ NGHIỆP VỤ, CHI TIẾT TỪNG TÌNH HUỐNG

> 🔄 **ĐÃ ĐỔI (21/09/2026) — thứ tự chạy thật:** Nghiệp vụ 2 (Phân công) → 3 (Lấy hàng) → **1 (Đóng gói)**. Số thứ tự nghiệp vụ giữ nguyên để không vỡ tham chiếu cũ.

## 🆕 Nghiệp vụ 0 — Chuẩn bị dữ liệu đóng gói (làm 1 lần, trước khi dùng engine) — 21/09/2026

Engine chỉ tính được khi có **số đo thật**. Thiếu → `generate` trả 422 `ORD_GROUP_PACKAGING_PROFILE_NOT_READY` (không đoán số đo).

1. **Danh mục thùng** (Admin): `POST /packaging/boxes` — lòng thùng/ngoài thùng (mm), bì (g), tải (g), giá. Có sẵn 3 thùng mẫu `SAMPLE-S/M/L` (`isSample: true`, số giả lập) sau khi chạy `npx ts-node scripts/seed-packaging-boxes.ts`; nhập số thật qua API hoặc CSV. 🆕 (22/09/2026) **Tồn kho thùng**: mỗi thùng có `quantityOnHand` (thực có), `reserved` (phương án chưa đóng đang giữ chỗ), `available` (còn trống). Nhập thùng qua `POST /packaging/boxes/:id/stock-in` `{ quantity, note? }` (Admin/Warehouse), xem sổ qua `GET /packaging/boxes/:id/movements`. Thùng mới tạo có tồn 0 — **phải nhập tồn thì engine mới chọn được**. Seed mẫu nhập sẵn 50 thùng mỗi loại.
2. **Hồ sơ SKU** (Warehouse Staff/Admin): `GET /product-master?status=needs_measurement` → đo từng SKU **sau khi gấp/bọc** (giày đo nguyên hộp) → `PUT /product-master/:id/packaging-profile` với `length_cm`, `width_cm`, `height_cm`, `weight_kg`, `is_fragile`, `orientation_rule` (`any` / `upright_only`), `max_stack_load_kg` (bỏ trống = không cho đặt gì lên). Hồ sơ chuyển `ready`; đồng bộ Lazada không ghi đè. 🆕 (21/09/2026 lần 3) Body thêm `product_category` (**bắt buộc**), `zip_bag_code?`, `zip_bag_folded?`. **Túi zip**: quần áo thường được cho vào túi zip (có thể gập đôi túi) rồi mới xếp vào thùng — khi đó kho đo **gói đã đóng túi**, engine xếp đúng khối đó. 🆕 (22/09/2026) **Quần áo luôn nằm phẳng** (engine chỉ xoay ngang, không dựng đứng), kể cả hồ sơ cũ để `orientation_rule: any`. Body thêm `can_fold_in_half?` cho hàng mềm (trong túi zip hoặc không có hộp cứng): engine tự tính số đo gập (cạnh dài ÷ 2, độ dày × 2) và **chỉ gập khi nhờ đó dùng được thùng nhỏ hơn**; bật cho giày → 422 `PM_FOLD_NOT_ALLOWED`. Danh mục túi ở `/packaging/bags` (Admin quản lý cùng trang `/app/admin/boxes`).

> Lấy hàng (Nghiệp vụ 3) **không** cần hồ sơ đóng gói — chỉ bước tính phương án mới cần. 🔄 21/09: `picking-list` (cả 2 bản) trả `quantity`, `picked_quantity`, `packaging_profile_ready` và số đo `null` khi SKU chưa đo, không còn 422.
>
> **Màn FE**: Admin quản lý thùng ở `/app/admin/boxes`; kho đo SKU ở `/app/inventory/packaging-profiles` (tab "Cần đo" / "Đã xác nhận", số Lazada khai chỉ hiện để tham khảo).

## Nghiệp vụ 1 — Tính & duyệt phương án đóng gói (UC-04)

### Bối cảnh xảy ra
Gợi ý đóng gói được tính **SAU KHI đã lấy hàng xong** (group ở `picked`), dựa trên số lượng THẬT đã quét trong lượt lấy hiện tại. 🆕 **Từ 21/09/2026 (lần 2): MỖI ĐƠN MỘT KIỆN** — hàng đã quét được chia về từng đơn nguồn trong group (đơn tạo trước được ưu tiên, không vượt số đặt của đơn), mỗi đơn có 1 phương án riêng. Gọi `generate` khi group chưa `picked` → `ORD_GROUP_INVALID_TRANSITION`.

### Engine tính gì (thay fallback thể tích cũ)
- Đổi số đo sang mm/g (món làm tròn lên, lòng thùng làm tròn xuống), mỗi đơn vị hàng là 1 khối riêng (`itemKey = sku#n`).
- **Greedy 3D**: thử các điểm đặt thấp trước (z → y → x) và các hướng xoay được phép; thử thùng theo thể tích ngoài nhỏ → lớn (hòa thì rẻ hơn), chọn thùng **nhỏ nhất** xếp được. 🆕 (22/09/2026) **Multi-start**: mỗi thùng thử 4 thứ tự xếp (thể tích, diện tích đáy, cạnh dài nhất, chiều cao — giảm dần) → xếp vừa được thùng nhỏ hơn ở những ca một thứ tự bị hụt.
- 🆕 (22/09/2026) **Đọc tồn kho thùng**: chỉ chọn thùng **còn trống > 0** (tồn − đang giữ chỗ). Thùng nhỏ hơn xếp vừa nhưng hết hàng → tự chọn thùng còn hàng kế tiếp, ghi `preferredBoxOutOfStock` (FE hiện cảnh báo "thùng X vừa hơn nhưng đã hết"). Group nhiều đơn: xếp **tuần tự**, đơn trước lấy thùng thì trừ luôn khỏi số còn trống, 2 đơn không giành 1 thùng cuối. Mọi thùng vừa đều hết → `no_fit` với lý do "kho đã hết".
- **Validator độc lập** kiểm tra mọi phương án: đủ mỗi món 1 lần, nằm trong lòng thùng, không chồng lấn, đúng hướng, đáy được đỡ toàn bộ, không vượt tải chồng từng món, không vượt tải thùng.
- Không thùng nào hợp lệ → `solutionStatus: "no_fit"` kèm `noFitReasons` theo từng thùng. **Không còn trả thùng Large khi quá cỡ.**
- Trả `placements[]` (tọa độ mm, `step` = thứ tự đặt) → FE dựng **animation 3D** từng món rơi vào thùng. 🆕 (22/09/2026) `placements[].folded = true` khi món được gập đôi (số đo đã là sau gập); hướng dẫn nói "gập đôi … trước khi đặt".
- 🆕 (22/09/2026) **Trang đóng gói từng bước** `/app/packing/groups/:groupId/orders/:recommendationId` (toàn màn hình): màn Chuẩn bị (thùng, túi zip, xốp, số món cần gập) → mỗi bước một màn (3D tới bước đó + câu hướng dẫn chữ to) → màn cuối kiểm tra và nhập cân, gọi `pack` khi group `approved_for_packing`. Nút mở ở trang phương án.
- Cân ước tính kiện = hàng + bì thùng (vật tư chưa có danh mục khối lượng). Phí ship = `null` tới khi có bảng cước thật (không dùng 15.000 đ/kg nữa).
- Đây là thuật toán tìm kiếm có kiểm chứng (heuristic), **không phải mô hình học máy**.

### Ai làm gì
```
[ADMIN, tạm thời]                    [PACKAGING STAFF]
POST .../packaging/generate    →     GET .../packaging (xem từng đơn + animation 3D)
(engine 3D, mỗi đơn 1 phương án)      → approve  (chốt mọi đơn — bị chặn nếu còn no_fit)
                                      → adjust   (đổi thùng 1 đơn, rồi approve)
                                      → reject   (tính lại từ đầu)
```

### `approve` — chốt phương án
Không còn nhập cân (field `actual_measured_weight_kg` deprecated, bị bỏ qua). Mọi đơn chuyển `approved` (hoặc `adjusted` nếu đã đổi thùng), group → `approved_for_packing`. Còn đơn `no_fit` → 409 `PKG_HAS_NO_FIT`.

### `adjust` — đổi thùng cho 1 đơn
Body `{ order_id, box_code, adjustment_reason, adjustment_note?, expected_group_version }`. Engine xếp lại hàng của đơn đó vào đúng thùng đã chọn; validator không chấp nhận → 422 `PKG_BOX_DOES_NOT_FIT` (không có chuyện nhập kích thước tùy ý). Lưu lý do, thùng cũ, người sửa. Group vẫn `pending_approval` — cần `approve` sau đó. Lý do `OTHER` bắt buộc ghi chú (`PKG_ADJUSTMENT_NOTE_REQUIRED`).

### `reject` — từ chối hoàn toàn
Mọi phương án active bị đánh dấu `rejected` + `is_active: false` (giữ lịch sử). `OrderGroup` quay lại `picked` — gọi lại `generate`, KHÔNG cần lấy lại hàng.

### 🆕 (21/09/2026) Hướng dẫn đóng gói từng bước — `POST .../packaging/:recommendationId/guide`
**Bối cảnh**: animation 3D cho thấy món nào rơi vào đâu, nhưng nhân viên kho cần câu chữ để làm theo (đặt góc nào, xoay ra sao, đặt lên món nào, có phải bọc xốp không).

**Chia việc (quan trọng khi trình bày)**:
- **Engine** quyết định hình học: thùng, vị trí, hướng xoay, thứ tự (`placements[].step`). Hệ thống đổi toạ độ thành dữ kiện dễ hiểu (VD "góc trái – phía trước", "đặt lên trên GIAY#1").
- **Mô hình ngôn ngữ** chỉ **viết lại lời** từ các dữ kiện đó bằng tiếng Việt, gọi qua **Groq** (bậc miễn phí, API chuẩn OpenAI). Mô hình không tính cách xếp, không thấy thông tin khách hàng (chỉ nhận SKU, kích thước, vị trí dạng chữ).
- Server kiểm tra lời AI: đủ số bước, đúng thứ tự, mỗi câu nhắc đúng mã SKU của bước đó. Sai điều nào → dùng **câu mẫu** do hệ thống tự dựng (`source: "template"`). Chưa cấu hình AI hoặc lỗi mạng cũng vậy — màn hình không bao giờ bị hỏng vì AI.

**Role**: Packaging Staff, Warehouse Staff, Admin. Giới hạn 10 lần/phút (bậc miễn phí của Groq có hạn mức lượt gọi).

**Body**: `{ "regenerate": false }` (tuỳ chọn). Đã có hướng dẫn thì trả bản đã lưu, không gọi lại AI; `true` = viết lại.

**Response**: `PackagingRecommendation` đầy đủ, trong đó field mới `packingGuide`:
```json
{
  "source": "ai",
  "model": "groq/openai/gpt-oss-120b",
  "fallbackReason": null,
  "summary": "Dùng thùng Thùng M (SAMPLE-M) cho 3 món ...",
  "steps": [
    { "step": 1, "instruction": "Đặt hộp GIAY-42 nằm ngang sát đáy, góc trái – phía trước.", "tip": "Không đặt món nào đè lên hộp này." }
  ],
  "generatedAt": "2026-09-21T10:00:00.000Z"
}
```
`model`: `nhà-cung-cấp/model` đã viết (VD `groq/openai/gpt-oss-120b`). `fallbackReason`: `null` (AI viết) | `no_api_key` | `ai_error` | `ai_invalid_output`. `steps[i].step` khớp `placements[].step` → FE hiện câu của bước đang phát ngay dưới animation.

**Khi nào hướng dẫn bị xoá**: mỗi lần `generate`/`adjust` tính lại phương án, `packingGuide` về `null` (hướng dẫn cũ không còn đúng) — FE gọi lại endpoint này. `GET .../packaging` cũng trả `packingGuide` đã lưu.

**Lỗi**: `PKG_INVALID_RECOMMENDATION_ID` (400), `PKG_RECOMMENDATION_NOT_FOUND` (404 — sai id hoặc không thuộc group/không còn active), 🆕 `PKG_GUIDE_NOT_AVAILABLE` (409 — đơn `no_fit`, chưa có cách xếp; `adjust` chọn thùng trước).

**🆕 Túi zip + hình 3D theo loại sản phẩm (21/09/2026 lần 3)**: món có túi zip → câu hướng dẫn bắt đầu bằng "Cho … vào túi zip …, gập đôi túi" (chỉ nhắc gập khi `zipBagFolded`); câu gọi món theo loại ("áo thun", "quần dài/jean"…). Animation hiện **mô hình 3D đại diện** theo `itemProfiles[].productCategory` (áo thun, áo khoác, quần, giày, sandal, kính…; váy/đầm và "Khác" vẫn là khối hộp), thu phóng đều nằm gọn trong khối engine tính; túi zip vẽ thành lớp nhựa trong có đường khoá kéo (và nếp gập nếu gập đôi), giày có hộp carton. Nguồn mô hình + giấy phép: `fe/public/models/CREDITS.md` (Poly Pizza, CC-BY 3.0/CC0 — màn hình có dòng ghi công).

**FE hiện có** (`/app/packing/groups/:groupId`): tự tạo hướng dẫn lần đầu khi mở đơn; nhãn "AI · model" hoặc "Câu mẫu"; nút "Viết lại bằng AI"; câu của bước hiện tại + lưu ý hiện dưới khung 3D; món của bước hiện tại được làm nổi, món các bước trước mờ đi.

### DB liên quan — `PackagingRecommendation` (1 bản active / đơn)

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `order_group_id` / `order_id` | ObjectId | Group + đơn nguồn của kiện (`order_id: null` = bản legacy cấp group trước 21/09) |
| `platform_order_id` | String | Mã đơn Lazada để hiển thị |
| `solution_status` / `no_fit_reasons[]` | `'ok'\|'no_fit'` / array | Có thùng hợp lệ hay không, lý do từng thùng |
| `box_code`, `box_name`, `box_inner_mm`, `box_outer_mm` | String / sub-doc | Thùng đã chọn (mm) |
| `box_size` | sub-doc (cm) | Giữ cho client cũ |
| `placements[]` | sub-doc | `item_key, sku, step, x, y, z, dx, dy, dz, orientation, folded` — tọa độ xếp (🆕 22/09 `folded`) |
| `materials[]`, `material_type`, `material_quantity` | | Vật tư (hiện: bubble wrap theo số món dễ vỡ) |
| `items_weight_g`, `estimated_package_weight_g`, `volumetric_weight_g`, `fill_ratio` | Number | Ước tính |
| `estimated_shipping_cost_vnd` | Number\|null | `null` khi chưa có bảng cước |
| `engine_version`, `computation_time_ms`, `fallback_used` | | Audit engine |
| `approval_status`, `approved_by`, `approved_at` | | Duyệt (BR-07) |
| `adjustment_reason`, `adjustment_note`, `adjusted_from_box_code`, `adjusted_by` | | Lịch sử đổi thùng |
| `actual_measured_weight_kg`, `packed_at`, `packed_by`, `is_abnormal` | | Cân thật lúc `pack` |
| `is_active` | Boolean | `false` = đã bị reject/thay thế |

**Ràng buộc**: mỗi ĐƠN chỉ 1 bản `is_active: true` (unique có điều kiện `uniq_active_per_order`). ⚠️ DB cũ còn index unique `order_group_id_1` → **phải chạy 1 lần** `npx ts-node scripts/migrate-packaging-recommendation-index.ts` (drop index cũ, vô hiệu bản legacy đang chờ duyệt). Group đang `pending_approval` với bản legacy → `reject` rồi `generate` lại.

---

## Nghiệp vụ 2 — Phân công nhân viên (Staff Assignment)

### Bối cảnh xảy ra
🔄 **ĐÃ ĐỔI (21/09/2026)** — ngay khi Order Group được TẠO (lúc đồng bộ/gộp đơn), hệ thống tự gán Warehouse Staff và chuyển group sang `picking` (trước đây chờ tới khi approve gợi ý đóng gói). Nếu tự gán lỗi (chưa có Warehouse Staff active), group vẫn được tạo, Admin gán tay qua `POST .../assign`. Mục đích: biết ngay **AI đi lấy hàng**. Không có bước này, đơn "trôi nổi" không ai chịu trách nhiệm xử lý.

### Cơ chế tự động — thuật toán "Ít việc nhất" (Least-Busy)
```
Hệ thống đếm: mỗi Warehouse Staff đang active có bao nhiêu Order Group
              ĐANG XỬ LÝ DỞ (fulfillment_status CHƯA tới delivered/returned)
→ Chọn người có số ít nhất
→ Hòa nhau → chọn người được gán việc lần GẦN NHẤT LÂU HƠN (ai "nghỉ tay"
  lâu nhất trong số đang hòa điểm được ưu tiên) — round-robin theo thời
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

## 🆕 Nghiệp vụ 2b — Thiết lập kho (Warehouse Setup) — MỚI, bổ sung 16/09/2026

**Vì sao mục này mới xuất hiện dù `warehouse/` đã có từ trước**: các mục khác trong file chỉ nói tới việc **DÙNG** dữ liệu kho (Picking đọc `bin_location`/`sku_bin_assignment` đã có sẵn) — nhưng chưa từng có hướng dẫn cho bước **TẠO RA** dữ liệu đó (Admin phải làm TRƯỚC KHI bất kỳ đơn nào có thể Picking). Đây là khoảng trống tài liệu thật, không phải do API mới — chỉ là tới giờ mới rà thấy.

### Bối cảnh — ai làm, khi nào

**Admin làm 1 LẦN lúc setup ban đầu** (hoặc mỗi khi mở kho mới/thêm SKU mới) — **PHẢI làm ĐÚNG THỨ TỰ 4 bước**, bước sau phụ thuộc bước trước (không thể tạo khu khi chưa có kho, không thể gán SKU khi chưa có kệ):

```
Bước 1: Tạo KHO ──► Bước 2: Tạo KHU (trong kho đó)
                              │
                              ▼
Bước 4: Gán SKU vào 1 kệ ◄── Bước 3: Sinh HÀNG LOẠT kệ (trong khu đó)
```

### Bước 1 — Tạo kho

```
POST /warehouse/warehouses
Body: { "warehouse_code": "WH-HCM-01", "warehouse_name": "Kho TP.HCM - Quận 7", "address": "123 Đường ABC, Quận 7, TP.HCM" }
→ 201: { "id": "...", "warehouseCode": "WH-HCM-01", "warehouseName": "...", "address": "...", "isActive": true }
```

Xem lại: `GET /warehouse/warehouses` — danh sách toàn bộ kho. 🔄 **ĐÃ ĐỔI (19/09/2026)** — route này giờ mở thêm cho **Warehouse Staff** (trước chỉ Admin) — vì `picking-list`/`pick-item`/`report-missing` (Warehouse Staff phải gọi hàng ngày) đều bắt buộc `warehouse_id`, cần có cách để họ tự biết ID kho mình đang làm việc, không hardcode tay.

### Bước 2 — Tạo khu TRONG 1 kho

```
POST /warehouse/warehouses/:warehouseId/zones
Body: { "zone_code": "A", "zone_name": "Phụ kiện điện tử", "description": "Khu chứa cáp sạc, tai nghe, phụ kiện nhỏ" }  // description optional
→ 201: { "id": "...", "warehouseId": "...", "zoneCode": "A", "zoneName": "...", "description": "..." }
```

`zone_code` chỉ cần **duy nhất TRONG 1 kho** — 2 kho khác nhau vẫn đặt trùng "A" được bình thường (xem lý do thiết kế ở tài liệu giảng giải hệ thống, mục II.7).

Xem lại: 🔄 `GET /warehouse/warehouses/:warehouseId/zones` (đã sửa lỗi 16/09/2026 — trước đây có thể không trả ra dữ liệu dù tạo thành công).

### Bước 3 — Sinh HÀNG LOẠT kệ (không tạo tay từng cái)

```
POST /warehouse/zones/:zoneId/bin-locations/generate
Body: { "aisle": "03", "rack_from": 1, "rack_to": 10, "level_from": 1, "level_to": 4 }
→ 201: { "created": 40 }   // 10 rack × 4 level = 40 kệ, sinh trong 1 lần gọi (bulkWrite, xem tài liệu giảng giải mục III.6)
```

`bin_code` tự sinh dạng `"{zone_code}-{aisle}-{rack:02}-{level:02}"` (VD `"A-03-01-01"`) — FE **không cần tự đặt tên kệ**, chỉ cần khai đúng khoảng (range).

⚠️ Gọi lại ĐÚNG khoảng đã tạo trước đó **không báo lỗi, không tạo trùng** (idempotent — `upsert`) — an toàn nếu Admin lỡ bấm 2 lần, nhưng KHÔNG dùng tính chất này để "sinh thêm" — nếu cần mở rộng khoảng, gọi API MỚI với range khác (VD `rack_from: 11, rack_to: 15`), không gọi lại range cũ.

Xem lại (🆕 MỚI 16/09/2026 — trước đây KHÔNG có cách nào xem lại):

```
GET /warehouse/zones/:zoneId/bin-locations              → kệ trong 1 khu
GET /warehouse/warehouses/:warehouseId/bin-locations    → TOÀN BỘ kệ trong 1 kho (mọi khu gộp)
→ 200: [{ "id": "...", "warehouseId": "...", "zoneId": "...", "binCode": "A-03-01-01", "aisle": "03", "rack": 1, "level": 1 }, ...]
```

### Bước 4 — Gán 1 SKU vào 1 kệ cụ thể

```
POST /warehouse/warehouses/:warehouseId/sku-bin-assignments
Body: {
  "platform": "lazada", "shop_id": "201171264532", "seller_sku": "ABC-123",
  "bin_location_id": "<id lấy từ bước 3>",
  "initial_quantity": 0   // OPTIONAL, mặc định 0 — có thể gán vị trí TRƯỚC, nhập hàng SAU qua bước Restock
}
→ 201: { "id": "...", "warehouseId": "...", "platform": "lazada", "shopId": "...", "sellerSku": "ABC-123", "binLocationId": "...", "quantityOnHand": 0 }
```

**Nhập thêm hàng sau đó** (nghiệp vụ RIÊNG, không phải gán lại):

```
POST /warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock
Body: { "quantity": 50 }   // CỘNG DỒN vào quantityOnHand hiện có, KHÔNG ghi đè
```

Xem lại (🆕 MỚI 16/09/2026): `GET /warehouse/warehouses/:warehouseId/sku-bin-assignments` — toàn bộ SKU đã gán trong 1 kho. Phân biệt với route đã có từ trước `GET /warehouse/sku-bin-assignments/unassigned` — route ĐÓ trả **SKU nào TRONG hệ thống nhưng CHƯA gán vị trí nào** (để Admin biết cần làm Bước 4 cho SKU nào); route MỚI trả **SKU ĐÃ gán rồi** (để Admin xem lại/đối chiếu) — 2 route trả tập dữ liệu **ĐỐI LẬP nhau**, đừng nhầm.

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

🔄 **ĐÃ ĐỔI (15/09/2026)** — cả 2 API lấy danh sách ở trên đều tự động **loại bỏ SKU thuộc đơn đã `canceled` hoặc gặp sự cố logistics** (`lost`, `damaged_by_3pl`... xem `INTEGRATION_GUIDE_ORDERS.md` mục 7b) khỏi danh sách cần lấy — trước đây KHÔNG lọc, nhân viên có thể bị yêu cầu đi lấy hàng cho đơn đã hủy/mất. Trường hợp TOÀN BỘ đơn trong group đều rơi vào 2 nhóm này (group rỗng sau khi lọc) → API trả lỗi `ORD_GROUP_ALL_ORDERS_CANCELED` (409) thay vì trả về danh sách rỗng — FE nên bắt riêng mã lỗi này, hiện thông báo rõ ràng ("Nhóm đơn này không còn gì cần lấy") thay vì hiểu nhầm là màn hình trắng/lỗi tải dữ liệu.

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
   → Store Owner NHẬN THÔNG BÁO NGAY (in-app + email, mức "critical")
   → Group đổi trạng thái chờ xem lại; 🔄 21/09: pick-item bị chặn khi group không ở `picking`

2. [PACKAGING STAFF, không phải Warehouse Staff] xem lại, quyết định:
   POST .../fulfillment/decide-partial
   { approve: true }   → "picked" với phần đã lấy; phương án đóng gói tính trên số đã quét
                         (đơn không nhận được món nào sẽ không có phương án)
   { approve: false }  → hủy lượt, quay lại "awaiting_packaging" và MỞ LƯỢT LẤY MỚI
                         (`pick_round + 1` — số đã quét của lượt cũ không còn được cộng).
                         Tồn kho đã trừ ở lượt cũ KHÔNG tự cộng lại — kho cần đối soát/restock tay.
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
Sau `picked`, nhân viên đóng gói vật lý theo đúng gợi ý đã duyệt (Nghiệp vụ 1), rồi bàn giao vận chuyển.

```
[WAREHOUSE STAFF] POST .../fulfillment/pack    → "packed"   (cân thật từng kiện)
[SHIPPING COORDINATOR] POST .../fulfillment/ship     → "shipped"
[SHIPPING COORDINATOR] POST .../fulfillment/deliver  → "delivered"
```

🆕 (22/09/2026) **`pack` trừ tồn thùng thật**: mỗi kiện trừ 1 thùng đúng loại đã duyệt, ghi 1 dòng sổ, cùng transaction với việc chuyển `packed`. Kho không còn thùng đó → 409 `PKG_BOX_OUT_OF_STOCK`, **không** chuyển `packed` (nhập thêm thùng hoặc `adjust` sang thùng khác). Tồn vừa rơi xuống ≤ `reorderLevel` → thông báo `low_box_stock` (warning) cho Admin + Store Owner, chỉ báo lần vượt ngưỡng đầu tiên. `adjust` sang thùng không còn trống → 409 `PKG_BOX_OUT_OF_STOCK` (không tính chỗ chính phương án đó đang giữ).

🆕 **ĐÃ ĐỔI (21/09/2026)** — `pack` nhận cân THẬT của từng kiện sau khi đóng:
```json
{ "packages": [{ "order_id": "…", "actual_weight_kg": 0.45 }], "expected_version": 7 }
```
Phải gửi đủ mọi kiện đã duyệt, mỗi đơn đúng 1 lần (sai → 400 `PKG_PACK_PACKAGES_MISMATCH`). Mỗi kiện so với `estimatedPackageWeightG` (hàng + bì): lệch > 20% → `isAbnormal: true` + thông báo Store Owner (`abnormal_package`), **không chặn** packed. Response: `{ fulfillmentStatus, version, recommendations[] }`. Màn đóng gói FE hiện animation 3D để nhân viên xếp theo đúng thứ tự. Chưa có: đối soát vật tư thực dùng, attempt/revision. Ship/deliver vẫn mô phỏng nội bộ theo phạm vi đồ án.

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

### Cron cảnh báo — chạy ngầm, không cần FE gọi gì
```
Mỗi 10 phút, hệ thống tự quét toàn bộ đơn "express":
  - Còn DƯỚI 1 GIỜ tới hạn  → cảnh báo (severity: warning) TỚI ĐÚNG người đang phụ trách
  - ĐÃ QUÁ HẠN               → escalate (severity: critical) TỚI Store Owner,
                                tự đánh dấu is_overdue: true (chỉ báo 1 LẦN DUY NHẤT
                                cho mỗi lần quá hạn, không spam lặp lại mỗi 10 phút)
```

### DB liên quan — field trên `OrderGroup`

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `order_priority` | `'normal'\|'express'` | Loại đơn |
| `packaging_deadline` | Date\|null | Hạn chót đóng gói — CHỈ có giá trị nếu `express` |
| `is_overdue` | Boolean | Đã quá hạn chưa — dùng để tránh cảnh báo lặp lại |

---

## Nghiệp vụ 6 — Thông báo (Notifications)

### Bối cảnh — khi nào hệ thống chủ động báo

| Sự kiện                                                                                                                          | Ai nhận                     | Mức độ   |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------- |
| Báo thiếu hàng (Nghiệp vụ 3)                                                                                                     | Store Owner (toàn bộ)       | critical |
| Sắp quá hạn Hỏa Tốc (<1h)                                                                                                        | Đúng 1 người đang phụ trách | warning  |
| Đã quá hạn Hỏa Tốc                                                                                                               | Store Owner (toàn bộ)       | critical |
| **MỚI (15/09/2026)** — Buyer yêu cầu hủy đơn, seller có hạn phản hồi (`cancel_trigger_time`) trước khi Lazada tự động hủy        | Store Owner + Admin (cả 2)  | critical |
| **MỚI (16/09/2026)** — Đồng bộ Lazada thất bại liên tục (VD token hết hạn) — có cơ chế chống spam, tối đa 1 lần/20 phút mỗi shop | Store Owner                 | warning  |

> ⚠️ **Hành vi đổi (15/09/2026)** — `PATCH /notifications/:id/read` giờ kiểm tra quyền sở hữu: chỉ đánh dấu đọc được thông báo gửi ĐÍCH DANH mình hoặc gửi BROADCAST cho đúng role của mình. Gọi với ID của thông báo KHÔNG thuộc về mình (dù ID hợp lệ) → trả **404 `NOTI_NOT_FOUND`**, y hệt trường hợp ID sai — FE không nên coi đây là bug nếu test chéo giữa 2 tài khoản khác role.

### Cách FE nhận — Polling (không cần WebSocket)
```
GET /notifications/unread-count    (gọi mỗi 15-30 giây) → { "count": 3 }
GET /notifications?is_read=false   (khi user bấm vào chuông)
PATCH /notifications/:id/read      (khi user đọc xong)
```
Mỗi thông báo có `relatedEntityType`/`relatedEntityId` — bấm vào **điều hướng thẳng** tới đúng Order Group, không chỉ hiện chữ suông.

### DB liên quan — `Notification`

| Field                                     | Kiểu                            | Ý nghĩa                                                                                                                                                               |
| ----------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recipient_user_id`                       | ObjectId\|null                  | Gửi đích danh 1 người — 1 trong 2 với `recipient_role`, KHÔNG bao giờ cả 2 cùng có giá trị                                                                            |
| `recipient_role`                          | UserRole\|null                  | HOẶC gửi broadcast cho cả 1 role                                                                                                                                      |
| `type`                                    | String                          | 1 trong 10 loại (`missing_item`, `sla_warning`, `sla_breach`, `sync_failed`, `cancel_confirmation_required`, `mfa_disabled`...) — **MỚI (15/09/2026)**: `cancel_confirmation_required`; 🆕 **22/09/2026**: `low_box_stock` (thùng carton xuống ≤ mức cảnh báo sau khi đóng gói, gửi Admin + Store Owner, `relatedEntityType: 'packaging_box'`, `relatedEntityId` = mã thùng) |
| `severity`                                | `'info'\|'warning'\|'critical'` | Mức độ hiển thị (màu sắc/icon)                                                                                                                                        |
| `title`/`message`                         | String                          | Nội dung — văn phong chuyên nghiệp, dựng sẵn từ backend, FE không tự ghép chuỗi                                                                                       |
| `related_entity_type`/`related_entity_id` | String\|null / ObjectId\|null   | Điều hướng khi bấm vào                                                                                                                                                |
| `is_read`                                 | Boolean                         | Đã đọc chưa                                                                                                                                                           |
| `channels_sent`                           | String[]                        | Đã gửi qua kênh nào (audit — `['in_app']` hoặc `['in_app', 'email']`)                                                                                                 |

---

# PHẦN C — SƠ ĐỒ TỔNG THỂ

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
                                 │ generate (Admin, engine 3D)   │ (tính lại, không lấy lại)
                                 ▼                                │
                    ┌─────────────────────────┐                 │
                    │  pending_approval        │─────────────────┘
                    └────────────┬─────────────┘
                                 │ approve (adjust = đổi thùng 1 đơn trước đó)
                                 ▼
                    ┌─────────────────────────┐
                    │  approved_for_packing    │
                    └────────────┬─────────────┘
                                 │ pack (cân thật từng kiện)
                                 ▼
                    ┌───────────┐
                    │  packed   │
                    └─────┬─────┘
                          │ ship
                          ▼
                    ┌───────────┐  return   ┌───────────┐
                    │  shipped  │──────────►│ returned  │ (trạng thái cuối)
                    └─────┬─────┘           └───────────┘
                          │ deliver               ▲
                          ▼                        │ return
                    ┌───────────┐──────────────────┘
                    │ delivered │
                    └───────────┘
```

---

## C.2. Flow mục tiêu — chưa triển khai

```text
Sync đơn/catalog sàn → Gộp nhóm lấy hàng → Tự phân công → picking
→ Quét từng SKU, không vượt số đặt; đủ theo lượt lấy hiện tại → picked
  Thiếu → partial_needs_review → tiếp tục với phần có / mở lượt lấy mới
→ Chia hàng đã lấy về TỪNG ĐƠN → Hồ sơ kho đã xác nhận
  Thiếu dữ liệu → chặn, kho bổ sung → tính lại
  Đủ dữ liệu → Tính thùng/túi mỗi đơn → Validator
    Không có phương án hợp lệ → ngoại lệ (adjust qua validator)
    Hợp lệ → pending_approval → approve/adjust (không cân) → approved_for_packing
→ Đóng từng đơn → pack nhận cân kiện thật từng đơn
  Lệch cân ước tính (hàng + bì + vật tư) → đánh dấu bất thường + thông báo
→ packed → Bàn giao vận chuyển nội bộ
```

Cân ước tính phải gồm hàng + bao bì + vật tư đúng một lần. Chưa có giá/cước phù hợp thì ghi chưa biết, không dùng 15.000 đồng/kg như cước thực. Đổi hộp phải validate và tính lại; không chấp nhận chỉ vì nhân viên nhập kích thước mới.

# PHẦN D — THAM CHIẾU KỸ THUẬT (API, lỗi, test)

## D.1. Response format — đã thống nhất camelCase (2026-09-10)

Cả 5 module (`order-groups`/`packaging`/`warehouse`/`staff-assignment`/`notifications`) đều trả camelCase sạch, không lộ `_id`/`__v`. **Ngoại lệ duy nhất**: `PackableItem` (trong `picking-list`) giữ nguyên snake_case (`length_cm`...) — đây là hợp đồng interface đã bàn giao cho AI Packaging, cố ý không đổi.

## D.2. Optimistic Concurrency — kiểm tra theo từng endpoint hiện hữu

Luôn đọc `version` từ `GET /order-groups/:id` gần nhất trước khi gọi bất kỳ action ghi nào. Sai `version` → 409 `ORD_GROUP_STATE_CONFLICT` → gọi lại GET lấy version mới, KHÔNG tự động retry.

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
| `ORD_GROUP_ALL_ORDERS_CANCELED`                                                                                                                        | 409     | **Mới (15/09/2026)** — toàn bộ đơn trong group đã bị hủy/gặp sự cố logistics (xem `INTEGRATION_GUIDE_ORDERS.md` mục 7b) — không còn gì để đóng gói/lấy hàng. Xảy ra ở `packaging/generate` và `picking-list` |
| `ORD_GROUP_NO_STAFF_AVAILABLE`                                                                                                                         | 409     | Auto-assign không có staff active                                                                                                                                                                            |
| `ORD_GROUP_STAFF_NOT_FOUND`                                                                                                                            | 404     | `staff_id` không hợp lệ                                                                                                                                                                                      |
| 🆕 `ORD_GROUP_PICK_NOT_ALLOWED` | 409 | 21/09 — quét khi group không ở `picking` |
| 🆕 `ORD_GROUP_PICK_EXCEEDS_ORDERED` | 409 | 21/09 — tổng đã quét trong lượt vượt số đặt |
| 🆕 `ORD_GROUP_PICK_INCOMPLETE` | 409 | 21/09 — bấm `pick` khi còn SKU chưa đủ (`details.missing`) |
| 🆕 `ORD_GROUP_NO_PICK_EVENTS` | 409 | 21/09 — `generate` khi lượt hiện tại chưa quét gì |
| 🆕 `PKG_HAS_NO_FIT` | 409 | 21/09 — `approve` khi còn đơn không có thùng hợp lệ |
| 🆕 `PKG_BOX_DOES_NOT_FIT` | 422 | 21/09 — `adjust` chọn thùng không xếp vừa (`details.violations`) |
| 🆕 `PKG_ORDER_NOT_IN_PLAN` | 404/409 | 21/09 — `order_id` không có phương án active / không còn hàng |
| 🆕 `PKG_PACK_PACKAGES_MISMATCH` | 400 | 21/09 — danh sách cân không khớp các kiện |
| 🆕 `PKG_ADJUSTMENT_NOTE_REQUIRED` | 400 | 21/09 — lý do `OTHER` thiếu ghi chú |
| 🆕 `PKG_GUIDE_NOT_AVAILABLE` | 409 | 21/09 — xin hướng dẫn đóng gói cho đơn `no_fit` |
| 🆕 `PM_ZIP_BAG_NOT_FOUND` | 422 | 21/09 — hồ sơ SKU chọn túi zip không có/ngừng dùng |
| 🆕 `PM_FOLD_NOT_ALLOWED` | 422 | 22/09 — bật "có thể gập đôi" cho giày (hộp cứng) |
| 🆕 `PKG_BAG_NOT_FOUND` / `PKG_BAG_CODE_IN_USE` / `PKG_INVALID_BAG_ID` | 404/409/400 | 21/09 — danh mục túi zip |
| 🆕 `PKG_BOX_NOT_FOUND` / `PKG_BOX_CODE_IN_USE` / `PKG_BOX_INVALID_DIMENSIONS` / `PKG_INVALID_BOX_ID` | 404/409/400/400 | 21/09 — danh mục thùng |
| 🆕 `PKG_BOX_OUT_OF_STOCK` | 409 | 22/09 — `adjust` sang thùng không còn trống, hoặc `pack` khi kho đã hết thùng đó |
| 🆕 `PM_INVALID_ID` / `PM_NOT_FOUND` | 400/404 | 21/09 — hồ sơ SKU |
| `PKG_NO_ACTIVE_RECOMMENDATION`                                                                                                                         | 404     | Chưa từng generate                                                                                                                                                                                           |
| `PKG_ALREADY_DECIDED`                                                                                                                                  | 409     | Recommendation đã được quyết định trước đó                                                                                                                                                                   |
| `WH_WAREHOUSE_NOT_FOUND` / `WH_ZONE_NOT_FOUND` / `WH_INVALID_BIN_RANGE` / `WH_WAREHOUSE_CODE_IN_USE` / `WH_ZONE_CODE_IN_USE` (2 mã cuối 🆕 19/09/2026) | —       | Xem chi tiết Nghiệp vụ 2b (Warehouse Setup)                                                                                                                                                                  |
| `NOTI_INVALID_ID` / `NOTI_NOT_FOUND`                                                                                                                   | 400/404 | Module notifications                                                                                                                                                                                         |

## D.4. Checklist test bắt buộc cho FE — theo từng nghiệp vụ

Các mục dưới đây kiểm tra route/flow legacy đang có trong code. Checklist nghiệm thu flow mục tiêu nằm ở D.6.

- [ ] **Nghiệp vụ 1**: `reject` xong, kiểm tra `GET .../packaging` vẫn thấy được bản REJECTED cũ (không bị xóa)
- [ ] 🔄 **Nghiệp vụ 4**: `pack` với cân lệch >20% so với `estimatedPackageWeightG` → `isAbnormal: true` (approve không còn nhận cân)
- [ ] 🆕 **Nghiệp vụ 1**: group 2 đơn → `GET .../packaging` trả 2 phần tử, mỗi phần tử có `placements[]`; đơn quá cỡ → `solutionStatus: no_fit` và `approve` bị 409
- [ ] 🔄 **Nghiệp vụ 2**: ngay khi group được tạo → `assignedStaffId` đã có giá trị và group ở `picking`
- [ ] **Nghiệp vụ 3**: `pick-item` vượt tồn kho → 409, UI gợi ý report-missing
- [ ] **Nghiệp vụ 3**: `report-missing` → thử gọi `pick`/`pack` trực tiếp → phải bị chặn `ORD_GROUP_INVALID_TRANSITION`
- [ ] **Nghiệp vụ 3**: `decide-partial(false)` → quay về `awaiting_packaging`; lấy lại lượt mới không bị cộng số của lượt cũ
- [ ] 🆕 **Nghiệp vụ 3**: `pick` khi chưa quét đủ → 409 `ORD_GROUP_PICK_INCOMPLETE`; quét dư → 409 `ORD_GROUP_PICK_EXCEEDS_ORDERED`
- [ ] **Nghiệp vụ 5**: `PATCH .../priority` express → `packagingDeadline` hợp lý (không null, đúng khoảng giờ làm việc)
- [ ] **Nghiệp vụ 6**: sau `report-missing` → `unread-count` của Store Owner tăng lên

## D.5. Checklist FE trước khi bắt đầu code

- [ ] Đã đọc PHẦN A — hiểu 6 câu hỏi nghiệp vụ hệ thống trả lời, không chỉ học thuộc endpoint
- [ ] Đã hiểu rõ SƠ ĐỒ TỔNG THỂ (Phần C) — biết chính xác nút nào bấm được ở trạng thái nào
- [ ] Đã implement đầy đủ nhánh `partial_needs_review`, không chỉ happy path
- [ ] Đã tích hợp polling `unread-count`
- [ ] Đã đối chiếu `API_LIST.md` đúng role cho từng màn hình đang build
- [ ] 🔄 **ĐÃ ĐỔI (19/09)** — Warehouse Staff giờ gọi được `GET /warehouse/warehouses` (trước chỉ Admin) — màn hình Warehouse Staff nên tự lấy `warehouse_id` từ đây, không hardcode tay
- [ ] 🔄 **ĐÃ ĐỔI (19/09)** — `pick-item` có thể trả `ORD_GROUP_ITEM_NOT_IN_GROUP` (404) khi quét nhầm SKU — FE cần bắt riêng, khác với lỗi hết hàng (`ORD_GROUP_INSUFFICIENT_STOCK`)
- [ ] 🆕 **MỚI (16/09)** — Đã xử lý 2 loại Notification mới (`cancel_confirmation_required`, `sync_failed`) trong UI chuông thông báo (Nghiệp vụ 6)
- [ ] 🔄 **ĐÃ ĐỔI (16/09)** — Đã biết `PATCH /notifications/:id/read` trả 404 nếu gọi nhầm ID không thuộc về mình (không phải bug khi test chéo role)

## D.6. Nghiệm thu flow mục tiêu (BE-1 → BE-5)

Áo trong zip dùng số đo gói áo; giày giữ hộp gốc; trang sức thiếu quy cách chống sốc bị chặn; canceled không vào tập hàng. Thiếu số đo không được mặc định; quá cỡ không trả hộp giả. Quét sai/quá lượng bị server chặn; retry cạnh tranh không trừ trùng. Partial phải xử lý lại tập hàng; chọn kế hoạch không bắt cân, pack mới cân/đo kiện. Recommendation stale/legacy chưa được xác minh không tự đi tiếp.
