# OptiPackAI Backend — Integration Guide: Fulfillment & Warehouse (Package 3/4)

**Cập nhật 2026-09-11 (v3 — mở rộng đầy đủ nghiệp vụ + thiết kế DB).** Đây là tài liệu tham chiếu ĐẦY ĐỦ NHẤT cho FE hiểu **concept hệ thống**, không chỉ danh sách endpoint. Đọc kèm `API_LIST.md` (bảng route/role) và `INTEGRATION_GUIDE_ORDERS.md` (nền tảng "gộp đơn").

**Swagger UI**: `http://localhost:3000/api/docs`

---

# PHẦN A — TỔNG QUAN HỆ THỐNG

## A.1. Bài toán hệ thống giải quyết

Sau khi đơn hàng từ Lazada được đồng bộ về và gộp thành **Order Group** (xem `INTEGRATION_GUIDE_ORDERS.md`), hệ thống phải trả lời 6 câu hỏi nghiệp vụ liên tiếp:

1. **Đóng gói thế nào** — thùng cỡ nào, vật liệu gì? (Nghiệp vụ Packaging)
2. **Ai lấy hàng** — nhân viên kho nào phụ trách? (Nghiệp vụ Staff Assignment)
3. **Hàng ở đâu trong kho** — kệ nào, đi theo lộ trình nào? (Nghiệp vụ Warehouse)
4. **Lấy đủ chưa** — quét từng món, nếu thiếu thì sao? (Nghiệp vụ Picking)
5. **Đơn có gấp không** — cần ưu tiên xử lý trong bao lâu? (Nghiệp vụ Đơn Hỏa Tốc)
6. **Ai cần biết chuyện gì đang xảy ra** — báo cho đúng người, đúng lúc (Nghiệp vụ Notifications)

**5 Order Group entity chạy xuyên suốt toàn bộ tài liệu này** — tất cả nghiệp vụ bên dưới đều xoay quanh 1 document `OrderGroup` duy nhất, đi qua các trạng thái khác nhau theo thời gian.

## A.2. Actor (vai trò) và trách nhiệm thật trong hệ thống

| Actor | Trách nhiệm CHÍNH trong Fulfillment | Không làm gì |
|---|---|---|
| **Store Owner** | Đánh dấu đơn Hỏa Tốc, nhận cảnh báo (thiếu hàng, SLA, mất kết nối sàn) | KHÔNG trực tiếp thao tác lấy/đóng gói/ship |
| **Warehouse Staff** | Lấy hàng (quét/nhập tay), đóng gói, phát hiện+báo thiếu hàng, tự nhận/đổi việc | KHÔNG duyệt gợi ý AI, KHÔNG quyết định tiếp tục khi thiếu hàng |
| **Packaging Staff** | Duyệt/điều chỉnh/từ chối gợi ý đóng gói, quyết định đơn thiếu hàng có tiếp tục không | KHÔNG trực tiếp lấy/đóng gói hàng |
| **Shipping Coordinator** | Xác nhận đã ship, đã giao, ghi nhận hoàn hàng | KHÔNG tham gia khâu lấy/đóng gói |
| **Admin** | Toàn quyền mọi thao tác trên — dùng để test/vận hành khẩn cấp | — |

## A.3. Nguyên tắc thiết kế xuyên suốt (đọc để hiểu TẠI SAO hệ thống làm vậy)

1. **1 hành động quan trọng = 1 người xác nhận, không tự động hóa quá tay.** Mọi quyết định ảnh hưởng tới việc giao hàng thật (duyệt đóng gói, quyết định đơn thiếu hàng) đều BẮT BUỘC có 1 con người thật bấm nút — hệ thống không bao giờ tự ý "đoán" rồi tiến hành luôn.
2. **Optimistic Concurrency ở khắp nơi.** Vì nhiều người có thể cùng thao tác 1 Order Group (Warehouse Staff đang lấy, Admin đang xem), MỌI hành động ghi đều yêu cầu gửi kèm `version` hiện tại — sai version = bị từ chối, không âm thầm ghi đè lên thao tác của người khác.
3. **Không tự động hóa nếu thiếu thông tin.** VD: thiếu hàng → hệ thống KHÔNG tự quyết "cứ giao thiếu cho xong" — luôn dừng lại, chờ người có thẩm quyền (Packaging Staff) quyết định.

---

# PHẦN B — TOÀN BỘ NGHIỆP VỤ, CHI TIẾT TỪNG TÌNH HUỐNG

## Nghiệp vụ 1 — Duyệt gợi ý đóng gói (UC-04)

### Bối cảnh xảy ra
Sau khi Order Group được tạo (từ nghiệp vụ Gộp đơn), nó ở trạng thái `awaiting_packaging` — hệ thống CHƯA biết đóng gói thế nào. Cần có 1 "gợi ý đóng gói" (thùng cỡ nào, vật liệu gì) trước khi ai đó có thể bắt tay đóng gói thật.

### Ai làm gì
```
[ADMIN, tạm thời]                    [PACKAGING STAFF]
POST .../packaging/generate    →     GET .../packaging (xem gợi ý)
(tạo gợi ý bằng thuật toán           → quyết định 1 trong 3:
 fallback, chờ AI thật)                 - approve  (đồng ý)
                                         - adjust   (đổi rồi mới đồng ý)
                                         - reject   (không đồng ý)
```

### Vì sao bước `generate` hiện tại chỉ Admin gọi được
Đây **không phải** hành vi nghiệp vụ chính thức — đội AI Packaging (Package 3) đang code thuật toán thật, khi xong sẽ **TỰ ĐỘNG trigger** ngay sau khi Order Group được tạo (không ai phải bấm nút). Route hiện tại chỉ là "cửa tạm" để có dữ liệu test trong lúc chờ.

### Tình huống `approve` — con đường chính
Packaging Staff xem gợi ý, đồng ý → **BẮT BUỘC nhập kèm cân nặng THẬT** đo được (không phải số ước tính hệ thống tính sẵn). Hệ thống tự động **so sánh** cân thật vs cân ước tính:
- Lệch **≤20%**: bình thường, `is_abnormal: false`
- Lệch **>20%**: tự động đánh dấu `is_abnormal: true`, log cảnh báo — **không chặn tiến trình**, chỉ đánh dấu để sau này Dashboard/audit dùng phát hiện gợi ý AI hay sai lệch ở loại sản phẩm nào

→ Kết quả: `PackagingRecommendation.approval_status = 'approved'`, `OrderGroup.fulfillment_status = 'approved_for_packing'`, **VÀ tự động kích hoạt Nghiệp vụ 2 (Phân công nhân viên) ngay lập tức**.

### Tình huống `adjust` — Packaging Staff không đồng ý gợi ý gốc
Giống `approve` nhưng Packaging Staff tự nhập lại `box_size`/`material_type` MỚI, kèm `adjustment_reason` (1 trong 3 lý do cố định: sản phẩm dễ vỡ hơn dự kiến / thùng đề xuất không có sẵn / khác). Cũng bắt buộc cân thật, cũng tính `is_abnormal`, cũng trigger Phân công nhân viên.

### Tình huống `reject` — từ chối hoàn toàn
G��i ý bị đánh dấu `is_active: false` (KHÔNG xóa — giữ lại lịch sử để sau này tính "tỷ lệ AI bị từ chối"). `OrderGroup` quay lại `awaiting_packaging` — cần gọi lại `generate` từ đầu.

### DB liên quan — `PackagingRecommendation`

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `order_group_id` | ObjectId | Group nào sở hữu gợi ý này |
| `box_size.{length_cm,width_cm,height_cm}` | Number | Kích thước thùng — sub-object riêng, không phải object rời rạc |
| `material_type` | String | Loại vật liệu đệm (VD "Bubble Wrap", "Small Box") |
| `material_quantity` | Number | Số lượng vật liệu cần |
| `estimated_shipping_cost_vnd` | Number | AI/fallback ước tính phí ship (VNĐ) |
| `computation_time_ms` | Number | Thời gian thuật toán tính (audit hiệu năng) |
| `fallback_used` | Boolean | `true` = dùng thuật toán dự phòng, không phải AI thật |
| `approval_status` | String | `pending`/`approved`/`adjusted`/`rejected` |
| `approved_by` | ObjectId\|null | Ai đã duyệt (audit — BR-07) |
| `approved_at` | Date\|null | Lúc nào duyệt |
| `actual_measured_weight_kg` | Number\|null | Cân THẬT — chỉ có giá trị sau khi approve/adjust |
| `is_abnormal` | Boolean | Cờ tự động — cân thật lệch >20% ước tính |
| `is_active` | Boolean | `false` = đã bị reject/thay thế, giữ lại lịch sử |

**Ràng buộc quan trọng**: 1 Order Group tại 1 thời điểm chỉ có ĐÚNG 1 `PackagingRecommendation` với `is_active: true` (index unique có điều kiện) — nhưng có thể có NHIỀU bản `is_active: false` (lịch sử các lần reject trước đó).

---

## Nghiệp vụ 2 — Phân công nhân viên (Staff Assignment)

### Bối cảnh xảy ra
Ngay khi Order Group chuyển `approved_for_packing` (Nghiệp vụ 1 xong) — cần biết **AI đi lấy hàng**. Không có bước này, đơn "trôi nổi" không ai chịu trách nhiệm xử lý.

### Cơ chế tự động — thuật toán "Ít việc nhất" (Least-Busy)
```
Hệ thống đếm: mỗi Warehouse Staff đang active có bao nhiêu Order Group
              ĐANG XỬ LÝ DỞ (fulfillment_status CHƯA tới delivered/returned)
→ Chọn người có số ít nhất
→ Hòa nhau → chọn theo thứ tự _id (ổn định, giải thích lại được nếu cần tra soát)
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

## Nghiệp vụ 3 — Lấy hàng (Picking) — nghiệp vụ có nhiều tình huống nhất

### Bối cảnh xảy ra
Order Group đã `approved_for_packing`, đã có người phụ trách (`assigned_staff_id`) — Warehouse Staff cần đi lấy đúng sản phẩm, đúng số lượng, từ đúng vị trí kệ.

### Tình huống chính (happy path) — 2 cách làm, tùy mức độ chi tiết muốn theo dõi

**Cách A — theo dõi từng món (khuyến nghị, có audit đầy đủ)**:
```
1. GET /order-groups/:id/picking-list           → xem cần lấy SKU nào, số lượng bao nhiêu
2. GET /warehouse/:warehouseId/picking-list/:groupId → BẢN CÓ VỊ TRÍ KỆ, đã sắp xếp theo lộ trình đi
3. Với MỖI SKU: POST .../fulfillment/pick-item   → quét/nhập tay, trừ tồn kho NGAY
4. Sau khi lấy hết: POST .../fulfillment/pick    → xác nhận xong, group chuyển "picked"
```

**Cách B — đơn giản, không theo dõi tồn kho từng món**:
```
POST .../fulfillment/pick    → chuyển thẳng "picked", bỏ qua bước quét từng SKU
```
→ Dùng khi kho nhỏ, chưa cần độ chính xác tồn kho cao, hoặc giai đoạn demo/test nhanh.

### Tình huống quét thất bại — nhân viên phải làm gì

| Tình huống | Cách xử lý |
|---|---|
| Camera hỏng/lag | Nhập tay mã SKU (`scan_method: "manual"`) |
| Tem mã vạch rách/mờ | Nhập tay, hệ thống ghi nhận `scan_method: "manual"` để sau này Admin biết cần in lại tem |
| **Mất mạng đúng lúc quét** | App lưu tạm trên máy, tự gửi lại khi có mạng — dùng `client_event_id` (mã tự sinh ngay lúc quét) để server nhận biết "đây là CÙNG 1 lần quét", KHÔNG trừ tồn kho 2 lần dù gửi lại nhiều lần |
| Quét nhầm mã (SKU không thuộc đơn này) | Hệ thống tự kiểm tra, từ chối ngay (không thuộc phạm vi endpoint hiện tại — cần FE tự validate SKU nằm trong picking-list trước khi gửi) |

### Tình huống THIẾU HÀNG — nghiệp vụ quan trọng nhất trong Picking

**Bối cảnh thật**: nhân viên tới đúng kệ nhưng hàng thực tế không đủ (đã bán hết trên hệ thống nhưng chưa cập nhật kho, hoặc hàng lỗi phải loại bỏ).

**KHÔNG được tự ý xử lý** — quy trình bắt buộc:
```
1. POST .../fulfillment/report-missing
   { sku, missing_quantity, warehouse_id, note?, expected_version }
   → OrderGroup.fulfillment_status = "partial_needs_review"
   → Store Owner NHẬN THÔNG BÁO NGAY (in-app + email, mức "critical")
   → ĐƠN DỪNG LẠI HOÀN TOÀN — không endpoint fulfillment nào khác gọi được

2. [PACKAGING STAFF, không phải Warehouse Staff] xem lại, quyết định:
   POST .../fulfillment/decide-partial
   { approve: true }   → tiếp tục với phần CÓ SẴN, chuyển "picked"
   { approve: false }  → hủy, quay lại "awaiting_packaging" — làm lại từ Nghiệp vụ 1
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

### DB liên quan — `quantity_on_hand` trên `SkuBinAssignment` (đã có ở Nghiệp vụ Warehouse, nhắc lại vì Picking trực tiếp thay đổi field này)

Trừ bằng lệnh atomic — kiểm tra ĐỦ HÀNG và trừ trong CÙNG 1 lệnh MongoDB (`findOneAndUpdate` kèm điều kiện `quantity_on_hand: {$gte: số_lượng}`) — tránh tình huống 2 nhân viên quét cùng lúc 1 SKU sắp hết mà cả 2 đều "trừ được" (race condition).

---

## Nghiệp vụ 4 — Đóng gói vật lý & Vận chuyển

### Bối cảnh
Sau `picked`, nhân viên đóng gói vật lý theo đúng gợi ý đã duyệt (Nghiệp vụ 1), rồi bàn giao vận chuyển.

```
[WAREHOUSE STAFF] POST .../fulfillment/pack    → "packed"
[SHIPPING COORDINATOR] POST .../fulfillment/ship     → "shipped"
[SHIPPING COORDINATOR] POST .../fulfillment/deliver  → "delivered"
```

Đây là 3 bước tuyến tính đơn giản, không có tình huống rẽ nhánh đặc biệt — mỗi bước chỉ cần đúng `version` hiện tại (Optimistic Concurrency).

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

| Sự kiện | Ai nhận | Mức độ |
|---|---|---|
| Báo thiếu hàng (Nghiệp vụ 3) | Store Owner (toàn bộ) | critical |
| Sắp quá hạn Hỏa Tốc (<1h) | Đúng 1 người đang phụ trách | warning |
| Đã quá hạn Hỏa Tốc | Store Owner (toàn bộ) | critical |

### Cách FE nhận — Polling (không cần WebSocket)
```
GET /notifications/unread-count    (gọi mỗi 15-30 giây) → { "count": 3 }
GET /notifications?is_read=false   (khi user bấm vào chuông)
PATCH /notifications/:id/read      (khi user đọc xong)
```
Mỗi thông báo có `relatedEntityType`/`relatedEntityId` — bấm vào **điều hướng thẳng** tới đúng Order Group, không chỉ hiện chữ suông.

### DB liên quan — `Notification`

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `recipient_user_id` | ObjectId\|null | Gửi đích danh 1 người — 1 trong 2 với `recipient_role`, KHÔNG bao giờ cả 2 cùng có giá trị |
| `recipient_role` | UserRole\|null | HOẶC gửi broadcast cho cả 1 role |
| `type` | String | 1 trong 7 loại (`missing_item`, `sla_warning`, `sla_breach`...) |
| `severity` | `'info'\|'warning'\|'critical'` | Mức độ hiển thị (màu sắc/icon) |
| `title`/`message` | String | Nội dung — văn phong chuyên nghiệp, dựng sẵn từ backend, FE không tự ghép chuỗi |
| `related_entity_type`/`related_entity_id` | String\|null / ObjectId\|null | Điều hướng khi bấm vào |
| `is_read` | Boolean | Đã đọc chưa |
| `channels_sent` | String[] | Đã gửi qua kênh nào (audit — `['in_app']` hoặc `['in_app', 'email']`) |

---

# PHẦN C — SƠ ĐỒ TỔNG THỂ

```
                    ┌─────────────────────────┐
                    │  awaiting_packaging      │◄──────────────┐
                    └────────────┬─────────────┘                │ reject /
                                 │ generate                      │ decide-partial(false)
                                 ▼                                │
                    ┌─────────────────────────┐                 │
                    │  pending_approval        │─────────────────┘
                    └────────────┬─────────────┘
                                 │ approve / adjust
                                 │ (TỰ ĐỘNG gán Staff)
                                 ▼
                    ┌─────────────────────────┐
                    │  approved_for_packing    │
                    └────────────┬─────────────┘
                    pick ─┬─ pick-item×N ─ pick        report-missing
                          │                              │
                          ▼                              ▼
                    ┌───────────┐              ┌──────────────────────┐
                    │  picked   │◄─────────────│ partial_needs_review  │
                    └─────┬─────┘  decide(true) └──────────────────────┘
                          │ pack
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

# PHẦN D — THAM CHIẾU KỸ THUẬT (API, lỗi, test)

## D.1. Response format — đã thống nhất camelCase (2026-09-10)

Cả 5 module (`order-groups`/`packaging`/`warehouse`/`staff-assignment`/`notifications`) đều trả camelCase sạch, không lộ `_id`/`__v`. **Ngoại lệ duy nhất**: `PackableItem` (trong `picking-list`) giữ nguyên snake_case (`length_cm`...) — đây là hợp đồng interface đã bàn giao cho AI Packaging, cố ý không đổi.

## D.2. Optimistic Concurrency — bắt buộc cho MỌI endpoint ghi

Luôn đọc `version` từ `GET /order-groups/:id` gần nhất trước khi gọi bất kỳ action ghi nào. Sai `version` → 409 `ORD_GROUP_STATE_CONFLICT` → gọi lại GET lấy version mới, KHÔNG tự động retry.

## D.3. Bảng mã lỗi

| `error_code` | HTTP | Khi nào |
|---|---|---|
| `ORD_GROUP_INVALID_ID` | 400 | `:id` sai định dạng |
| `ORD_GROUP_NOT_FOUND` | 404 | Group không tồn tại |
| `ORD_GROUP_STATE_CONFLICT` | 409 | Version không khớp |
| `ORD_GROUP_INVALID_TRANSITION` | 400 | Sai thứ tự trạng thái |
| `ORD_GROUP_INSUFFICIENT_STOCK` | 409 | pick-item không đủ hàng — gợi ý report-missing |
| `ORD_GROUP_ITEM_NOT_IN_GROUP` | 404 | SKU không thuộc group |
| `ORD_GROUP_NO_STAFF_AVAILABLE` | 409 | Auto-assign không có staff active |
| `ORD_GROUP_STAFF_NOT_FOUND` | 404 | `staff_id` không hợp lệ |
| `PKG_NO_ACTIVE_RECOMMENDATION` | 404 | Chưa từng generate |
| `PKG_ALREADY_DECIDED` | 409 | Recommendation đã được quyết định trước đó |
| `WH_WAREHOUSE_NOT_FOUND` / `WH_ZONE_NOT_FOUND` / `WH_INVALID_BIN_RANGE` | — | Xem chi tiết Swagger |
| `NOTI_INVALID_ID` / `NOTI_NOT_FOUND` | 400/404 | Module notifications |

## D.4. Checklist test bắt buộc cho FE — theo từng nghiệp vụ

- [ ] **Nghiệp vụ 1**: `reject` xong, kiểm tra `GET .../packaging` vẫn thấy được bản REJECTED cũ (không bị xóa)
- [ ] **Nghiệp vụ 1**: `approve` với cân lệch >20% → xác nhận `isAbnormal: true`
- [ ] **Nghiệp vụ 2**: `approve` xong → `GET /order-groups/:id` → `assignedStaffId` ĐÃ tự có giá trị, không cần gọi `/assign`
- [ ] **Nghiệp vụ 3**: `pick-item` vượt tồn kho → 409, UI gợi ý report-missing
- [ ] **Nghiệp vụ 3**: `report-missing` → thử gọi `pick`/`pack` trực tiếp → phải bị chặn `ORD_GROUP_INVALID_TRANSITION`
- [ ] **Nghiệp vụ 3**: `decide-partial(false)` → xác nhận quay đúng về `awaiting_packaging`
- [ ] **Nghiệp vụ 5**: `PATCH .../priority` express → `packagingDeadline` hợp lý (không null, đúng khoảng giờ làm việc)
- [ ] **Nghiệp vụ 6**: sau `report-missing` → `unread-count` của Store Owner tăng lên

## D.5. Checklist FE trước khi bắt đầu code

- [ ] Đã đọc PHẦN A — hiểu 6 câu hỏi nghiệp vụ hệ thống trả lời, không chỉ học thuộc endpoint
- [ ] Đã hiểu rõ SƠ ĐỒ TỔNG THỂ (Phần C) — biết chính xác nút nào bấm được ở trạng thái nào
- [ ] Đã implement đầy đủ nhánh `partial_needs_review`, không chỉ happy path
- [ ] Đã tích hợp polling `unread-count`
- [ ] Đã đối chiếu `API_LIST.md` đúng role cho từng màn hình đang build