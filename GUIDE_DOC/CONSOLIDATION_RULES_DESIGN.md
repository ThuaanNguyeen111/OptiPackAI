# Thiết kế: Quy tắc gộp đơn do Admin mô tả bằng câu chữ (AI dịch, hệ thống áp cố định)

> Trạng thái: **Đã code xong BE (31/10/2026, AOFP-223)** trên nhánh `feature/consolidation-rules`. FE chưa làm (`FE_UPDATE_CHECKLIST.md` mục 6).
> Hợp đồng API chi tiết cho FE: `INTEGRATION_GUIDE_ORDERS.md` mục 7c, `API_LIST.md` mục 28.
> Liên quan: `be/src/modules/orders/utils/consolidation-key.util.ts`, `order-sync-policy.ts`,
> `order-sync-settings.service.ts`, `orders.service.ts#tryConsolidate`, mục 7c của
> [`INTEGRATION_GUIDE_ORDERS.md`](./INTEGRATION_GUIDE_ORDERS.md).

---

## 1. Bài toán

Hiện nay Admin chỉ chọn được **một bộ trường** cho khóa gom (`consolidation_key_fields`, mặc định
`phone + address_line1 + city`). Các tình huống thật cần nhiều cách gộp song song, ví dụ:

- "Cùng SĐT và cùng phường thì gộp, khác tên người nhận vẫn gộp."
- "Cùng địa chỉ chi tiết, khác SĐT (người nhà đặt hộ) cũng gộp, nhưng chỉ đơn đặt trong 6 giờ."

Admin muốn **gõ câu chữ** thay vì tự hiểu từng trường kỹ thuật.

## 2. Vì sao AI chỉ dịch câu chữ, KHÔNG tự quyết đơn nào gộp

| Tiêu chí | AI tự quyết từng đơn | **AI dịch câu → quy tắc cố định (chọn)** |
| :-- | :-- | :-- |
| Lặp lại được | Cùng dữ liệu có thể ra kết quả khác | Cùng dữ liệu luôn ra cùng kết quả |
| Tốc độ đồng bộ | 1 lần gọi AI mỗi đơn, chậm, tốn phí | Tra index O(log n), không gọi AI |
| Dữ liệu cá nhân | Phải gửi tên, SĐT, địa chỉ khách ra ngoài | Chỉ gửi câu chữ của Admin |
| Khi AI hỏng/hết key | Ngừng gộp hoặc gộp bừa | Sync vẫn chạy, Admin dựng quy tắc bằng form |
| Kiểm chứng | Khó giải thích vì sao gộp | Xem trước số nhóm và ví dụ trước khi lưu |
| Bảo vệ khi bảo vệ đồ án | "Hộp đen" | Quy tắc tường minh, có test bảng tình huống |

Gộp nhầm thì giao nhầm hàng cho khách thật, nên ưu tiên **đúng** hơn **đủ** (giữ đúng nguyên tắc
đã ghi trong `consolidation-key.util.ts`).

## 3. Luồng tổng thể

```
Admin gõ câu ──► POST /order-sync-settings/rules/translate   (gọi Groq 1 lần, chỉ gửi câu chữ)
                   │  trả { rule } hợp lệ  hoặc  { unsupported: [lý do...] }
                   ▼
              POST /order-sync-settings/rules/preview       (đọc ≤ 5.000 đơn chưa xong, không ghi DB)
                   │  "120 nhóm → 104 nhóm", ≤ 10 ví dụ (mã đơn + 3 số cuối SĐT)
                   ▼
              POST/PUT /order-sync-settings/rules           (expected_version → lưu phiên bản mới)
                   │
                   ▼
              Nền: tính lại consolidation_keys cho đơn chưa xong (lô 500)
                   │
                   ▼
              Lúc đồng bộ: tryConsolidate tìm theo $or[ khóa cơ bản, khóa theo quy tắc ]
```

## 4. Mô hình quy tắc

```ts
ConsolidationRule {
  id: string;                 // ObjectId dạng chuỗi, giữ nguyên qua các phiên bản
  name: string;               // ≤ 80 ký tự
  source_text: string | null; // câu Admin gõ (≤ 500 ký tự), null nếu dựng bằng form
  fields: { field: RuleField; match: 'normalized' | 'exact' }[];   // 1..7 phần tử, không trùng field
  platforms: string[];        // rỗng = mọi sàn trong SYNC_PLATFORMS
  max_window_hours: number | null;  // null = dùng consolidation_time_window_hours chung
  enabled: boolean;
}

RuleField = 'phone' | 'full_name' | 'address_line1' | 'city'
          | 'province_name' | 'district_name' | 'ward_name';
```

- Lưu trong `order_sync_settings.consolidation_rules[]` (sub-schema `_id: false`, quy tắc DB #1).
  Tối đa **10 quy tắc** (mỗi quy tắc là 1 phần tử trong `consolidation_keys`, cần chặn phình mảng).
- Mặc định rỗng → hệ thống chạy **y hệt hiện nay**.

### 4.1. Cách so khớp

- `phone`: luôn qua `normalizePhoneNumber` (bỏ qua `match`).
- Trường chữ: `normalized` = bỏ dấu, gập `đ→d`, chữ thường, gộp khoảng trắng (`normalizeAddressFragment`);
  `exact` = chỉ `trim()`.
- Khóa = `sha256("rule|<platform>|<rule.id>|<v1>|<v2>|...")`, thứ tự trường cố định theo `RuleField`
  (không phụ thuộc thứ tự Admin chọn). Có `rule.id` trong khóa nên 2 quy tắc khác nhau không bao giờ trùng khóa.

### 4.2. Giới hạn an toàn

| # | Giới hạn | Lý do |
| :-: | :-- | :-- |
| 1 | Mỗi quy tắc phải có `phone` **hoặc** `address_line1` | "Chỉ cùng tỉnh/phường/tên" gom nhầm người khác (giống kiểm tra đã có cho khóa cơ bản) |
| 2 | Trường trống hoặc chứa `*` (bị che) → quy tắc **không áp** cho đơn đó | Lazada che SĐT/tỉnh/quận theo PDPA; không sinh khóa thì không thể gộp nhầm |
| 3 | SĐT `isUnusablePhone` (< 9 số) → coi như trống | Như quy tắc G4 hiện có |
| 4 | Đơn hỏa tốc và đơn đổi hàng (`EXC-`) → không sinh khóa theo quy tắc | Hai loại này đã có khóa gom riêng, phải giữ nhóm riêng |
| 5 | Chỉ gộp cùng `platform` + `shop_id`, chỉ vào nhóm còn mở | Giữ nguyên điều kiện của `tryConsolidate` |
| 6 | Nhóm đã tạo không bị đổi khi sửa quy tắc | Chỉ đơn **mới vào** mới dùng quy tắc mới |
| 7 | `consolidation_enabled = false` → tắt cả quy tắc | Một công tắc tổng duy nhất |

### 4.3. Địa giới hành chính (đã chốt)

Cho phép `province_name`, `district_name`, `ward_name` nhưng chỉ để **thu hẹp thêm** (giới hạn #1 vẫn áp).
Đơn Lazada thường bị che tỉnh/quận nên quy tắc dùng các trường này phần lớn chỉ tác dụng với AURELLE.
Preview sẽ báo số đơn bị bỏ qua do thiếu dữ liệu để Admin thấy rõ.

### 4.4. Giới hạn thời gian (đã chốt)

Mặc định dùng `consolidation_time_window_hours` chung. Quy tắc có `max_window_hours` riêng thì dùng
giá trị riêng (1..720). Khóa cơ bản vẫn dùng giới hạn chung.

## 5. Thay đổi dữ liệu và thuật toán

### 5.1. `orders.consolidation_keys: string[]`

- Mỗi quy tắc đang bật và áp được cho đơn → 1 phần tử `"<rule.id>:<hash>"`. Tiền tố `rule.id`
  giúp lọc thời gian theo từng quy tắc sau khi tra index.
- Index multikey **partial** giống `consolidation_key`: chỉ đơn có `status ∈ UNFULFILLED_ORDER_STATUSES`.
- Đơn cũ không có trường → coi như `[]`.

### 5.2. `tryConsolidate`

```
find({
  platform, shop_id, status ∈ UNFULFILLED (đúng partial index), status ∈ consolidatable,
  _id ≠ order._id, is_active: true,
  $or: [
    { consolidation_key: order.consolidation_key, created_at ≥ window_chung },
    { consolidation_keys: k_r, created_at ≥ window_r }   // mỗi quy tắc 1 nhánh
  ]
}).sort({ created_at: 1 }).limit(20)
```

- Mỗi nhánh `$or` dùng index riêng (Mongo chạy `OR` gồm nhiều `IXSCAN`), kiểm bằng `explain`.
- Đơn khớp nhiều nhóm mở qua các quy tắc khác nhau → vào nhóm **cũ nhất** (sort `created_at`).
  Hai nhóm đó **không** bị hợp nhất tự động (giữ giới hạn #6, Admin vẫn `merge` tay được).
- Log ghi rõ quy tắc nào gây gộp (`rule.name`) để tra lại.

### 5.3. Tính lại khóa

`recomputeConsolidationKeys` hiện tính lại `consolidation_key` khi đổi trường cơ bản. Mở rộng: khi
thêm/sửa/xóa/bật/tắt quy tắc → tính lại cả `consolidation_keys` cho đơn chưa xong, `bulkWrite` lô 500,
chạy nền (không chặn response).

## 6. API dự kiến

Quyền: **Admin** sửa; **Store Owner** chỉ xem (`GET`). Tất cả nằm dưới `/order-sync-settings`.

| Method | Path | Mô tả |
| :-- | :-- | :-- |
| GET | `/rules` | Danh sách quy tắc + `version` hiện hành |
| POST | `/rules` | Thêm quy tắc. Body: rule (không `id`) + `expected_version` |
| PUT | `/rules/:ruleId` | Sửa quy tắc. Body: rule + `expected_version` |
| DELETE | `/rules/:ruleId?expected_version=N` | Xóa quy tắc |
| POST | `/rules/translate` | `{ text }` → `{ rule }` hoặc `{ unsupported: string[] }`. Giới hạn 10 lần/phút |
| POST | `/rules/preview` | `{ rules: RuleDraft[] }` → số nhóm trước/sau, số đơn bị bỏ qua, ≤ 10 ví dụ |

- Mỗi lần ghi tạo **1 phiên bản `order_sync_settings` mới** (cách đang làm). `expected_version` khác
  phiên bản hiện hành → `409 ORD_SYNC_SETTINGS_CONFLICT` (mã đã có), FE tải lại.
- Mã lỗi mới (khai trong `orders.errors.ts`): `ORD_CONSOLIDATION_RULE_NOT_FOUND`,
  `ORD_CONSOLIDATION_RULE_INVALID`, `ORD_CONSOLIDATION_RULE_LIMIT`, `ORD_CONSOLIDATION_RULE_AI_UNAVAILABLE`.

### 6.1. Dịch câu chữ (`/rules/translate`)

- Theo khuôn `packaging/packing-guide-ai.service.ts`: Groq, `response_format` JSON schema chặt;
  bị 400 thì thử lại `json_object`; BE **luôn tự kiểm lại** kết quả bằng cùng hàm validate của form.
- Prompt chỉ chứa câu chữ của Admin và danh sách trường được phép. **Không** gửi dữ liệu đơn/khách.
- Yêu cầu không làm được (theo giá trị đơn, theo SKU, theo sàn khác nhau...) → AI trả `unsupported`.
- Thiếu `AI_API_KEY`, AI lỗi hoặc trả sai định dạng → `503 ORD_CONSOLIDATION_RULE_AI_UNAVAILABLE`
  kèm `details.suggestions`: 4 quy tắc mẫu dựng sẵn để Admin chọn hoặc dùng form.
- AI trả đúng định dạng nhưng vi phạm giới hạn an toàn (VD chỉ cùng tỉnh) → `200` với `rule: null` và
  `unsupported` = lý do từ `validateConsolidationRule` (đây là yêu cầu không làm được, không phải AI hỏng).

### 6.2. Xem trước (`/rules/preview`)

- Đọc tối đa 5.000 đơn chưa xong (`.lean()`, `.select()` tối thiểu), mô phỏng gộp trong bộ nhớ theo
  đúng thuật toán `tryConsolidate` (theo thứ tự `created_at`), **không ghi DB**.
- Trả: `currentGroups` (thực tế), `baselineGroups` (mô phỏng không quy tắc), `projectedGroups` (mô phỏng có quy tắc),
  `groupsMergedByRules`, `ordersScanned`, `truncated`, `skippedMissingData[]` (theo từng quy tắc),
  `examples[]` tối đa 10: `{ ruleNames, platformOrderIds, phoneLast3 }`.
  Có `baselineGroups` vì `currentGroups` chứa cả lịch sử gộp tay/tách tay, không so trực tiếp với mô phỏng được.
- Mô phỏng tính từ đầu trên tập đơn hiện có nên là **ước lượng**: thực tế nhóm cũ không bị đổi.

## 7. Kế hoạch triển khai (mỗi bước 1 commit, chạy tsc + lint + jest)

1. Tài liệu này.
2. Lõi: schema/policy/DTO `consolidation_rules`, `computeRuleKeys`, `consolidation_keys` + index,
   `tryConsolidate` theo `$or`, tính lại khóa. Test bảng tình huống: khác tên, bị che, nhiều quy tắc,
   hỏa tốc, đổi hàng, khác shop, giới hạn thời gian riêng.
3. API CRUD quy tắc + xung đột phiên bản.
4. API xem trước.
5. API dịch câu chữ bằng AI + quy tắc mẫu dự phòng.
6. Tài liệu FE: `API_LIST.md`, `INTEGRATION_GUIDE_ORDERS.md` mục 7c, `FE_UPDATE_CHECKLIST.md`
   (màn quản lý quy tắc), cập nhật `CLAUDE.md`.

FE OptiPack không sửa trong đợt này.
