# Luồng dữ liệu vào AI đóng gói — trả lời hội đồng (05/11/2026)

> Tài liệu chuẩn bị bảo vệ. Mô tả đúng hệ thống đang chạy trên nhánh `trunthi_dev`.
> Mã nguồn: `be/src/modules/packing/` (bộ giải, kế hoạch), `be/src/modules/packaging/packing-guide-ai.service.ts` (LLM).

## 0. "AI" trong hệ thống gồm 2 phần tách bạch

```
MongoDB ──(đọc trực tiếp mỗi lần tính)──► BỘ GIẢI TỐI ƯU ──► kế hoạch (thùng, vị trí, hướng, gập, vật tư)
  packaging_materials (thùng, túi, vật tư)      BRKGA (TypeScript)              │
  packaging_material_rules (luật vật tư)        + CP-SAT OR-Tools (Python)      │ dữ kiện từng bước (GuideStepFacts)
  product_master (số đo, cân, dễ vỡ, gập)       + validator độc lập             ▼
  shipping_carriers (luật cước)                                        MÔ HÌNH NGÔN NGỮ (Groq)
                                                                       chỉ diễn đạt thành câu tiếng Việt
                                                                                │
                                                       parseGuide(): đủ bước, đúng thứ tự, đúng SKU
                                                       sai → câu mẫu buildTemplateGuide()
```

| Phần | Bản chất | Quyết định gì |
|---|---|---|
| Bộ giải tối ưu | Thuật toán tối ưu tổ hợp (không phải học máy) | Chọn thùng, số kiện, vị trí, hướng xoay, gập, vật tư chèn; có nhãn chứng minh `optimal_global` / `optimal_in_model` / `heuristic` |
| Mô hình ngôn ngữ | LLM có sẵn (mặc định `openai/gpt-oss-120b` qua Groq), không fine-tune | Chỉ viết lời hướng dẫn từ dữ kiện đã tính |

**Lý do thiết kế:** LLM không đảm bảo đúng hình học (có thể "xếp" món to hơn thùng). Vì vậy phần tính toán giao cho thuật toán có kiểm chứng, còn LLM chỉ làm phần ngôn ngữ.

## 1. Dữ liệu từ DB được đưa vào AI thế nào?

**Bộ giải: truy xuất trực tiếp DB** mỗi lần tính kế hoạch. Không qua prompt, không cache.

| Dữ liệu | Hàm đọc | Collection |
|---|---|---|
| Thùng đang dùng (lòng, ngoài, bì, tải, giá) | `PackagingBoxService.listActiveSpecs()` | `packaging_materials` (`kind: box`) |
| Túi niêm phong | `listActiveMailerSpecs()` | `packaging_materials` (`kind: mailer`) |
| Vật tư chèn + luật chọn vật tư | `PackagingMaterialService.planningData()` | `packaging_materials` (`kind: cushioning`), `packaging_material_rules` |
| Tồn thùng trống | `listAvailability()` | `packaging_materials` trừ giữ chỗ ở `packing_plans` |
| Số đo, cân, dễ vỡ, gập được của hàng | `allocatePickedItemsToOrders()` | `product_master` (hồ sơ đóng gói) |
| Luật cân tính cước | `resolveChargeRule()` | `shipping_carriers`, `shipping_settings` |

Service CP-SAT (Python) nhận dữ liệu này trong **thân request HTTP**.

**LLM: dữ liệu đi trong nội dung tin nhắn (Chat Completions)**, theo 3 lớp:
1. **System prompt**: luật viết cố định (giữ đúng số bước, mỗi câu có SKU, không đổi vị trí…). Không chứa dữ liệu DB.
2. **Ví dụ mẫu (few-shot)**: tối đa 2 cặp *dữ kiện → hướng dẫn* đã được nhân viên chấm tốt (mục 3).
3. **User message**: JSON dữ kiện của kiện cần viết, gồm `box` (mã, tên, lòng thùng), `fill_ratio`, `materials` (tên + số lượng vật tư), `steps[]` (SKU, loại sản phẩm, túi zip, gập, dễ vỡ, vị trí dạng chữ, cách xoay, món đỡ bên dưới, kích thước).

LLM **không** truy vấn DB và **không** nhận thông tin khách hàng.

**Bằng chứng xem được:** `GET /order-groups/:groupId/packing-plan/parcels/:parcelNo/guide/trace` trả đúng system prompt, JSON dữ kiện đã gửi, phản hồi thô của model và các ví dụ mẫu đã dùng. Lưu ở collection `packing_guide_logs`, tự xoá sau 30 ngày.

## 2. Admin CRUD vật liệu mới thì AI cập nhật bằng cách nào?

**Không cần công cụ đồng bộ, không huấn luyện lại.** Mỗi lần tính kế hoạch, bộ giải đọc lại DB nên dữ liệu mới có hiệu lực ngay ở lần tính sau. Thùng hoặc vật tư mới chỉ được dùng khi **đang bật và đủ số đo** (thùng: lòng/ngoài/bì/tải; vật tư chèn: loại + cân mỗi đơn vị). Thiếu trường nào thì bộ giải bỏ qua.

**Kế hoạch đã tính là ảnh chụp tại thời điểm tính.** Từ 05/11:
- Mỗi kế hoạch lưu `solver.inputs`: danh sách mã thùng, túi, vật tư đã dùng, kèm dấu vân tay số đo/bì/tải/giá, phiên bản luật vật tư và luật cước.
- `GET .../packing-plan` so `solver.inputs` với danh mục hiện tại. Nếu có thay đổi thì trả `catalogStale: true` và `catalogChanges[]` nêu đích danh, VD *"Thùng M2 mới được thêm"*, *"Luật vật tư chèn: phiên bản 3 → 4"*.
- Người dùng bấm **Tính lại** (`POST .../recompute`) để áp dụng. Hệ thống không tự đổi kế hoạch người khác đang xem hoặc đang đóng.
- Tồn kho thay đổi không tính là danh mục đổi.

## 3. AI dựa trên Data Model / Dataset nào để sinh các bước?

**Thứ tự và nội dung các bước do bộ giải tính,** dựa trên mô hình dữ liệu nghiệp vụ:
- `PackingUnit`: món hàng (mm, g, dễ vỡ, giới hạn đè, hướng cho phép, gập được).
- `BoxSpec` / `MailerSpec`: thùng và túi.
- Luật vật tư, luật cước.

Kết quả là toạ độ từng món. Hàm `describePackingSteps()` chuyển toạ độ thành dữ kiện từng bước (`GuideStepFacts`).

**LLM là mô hình huấn luyện sẵn của nhà cung cấp,** không fine-tune và không RAG trên tài liệu. "Dataset" riêng của hệ thống là **bộ ví dụ mẫu do chính kho tạo ra** (từ 05/11):
- Nhân viên đóng gói chấm từng hướng dẫn: 👍 *Dễ làm theo* / 👎 *Khó hiểu* (`POST .../guide/rating`).
- Hướng dẫn do AI viết được chấm 👍 (≤ 8 bước) vào collection `packing_guide_examples`, kèm đúng JSON dữ kiện lúc viết. Chấm 👎 thì gỡ ra.
- Lần viết sau, BE chọn tối đa 2 ví dụ có **loại sản phẩm trùng nhiều nhất** rồi gửi kèm dạng few-shot. Model "học" văn phong kho chấp nhận mà không cần huấn luyện lại.

**Kiểm soát chất lượng:** mọi phản hồi của LLM phải qua `parseGuide()` (đủ số bước, đúng thứ tự, mỗi câu chứa đúng SKU, ≤ 400 ký tự). Sai một điều thì dùng câu mẫu. Thiếu API key hoặc gọi lỗi cũng dùng câu mẫu; màn hình đóng gói không bao giờ hỏng vì AI.

## 4. Kịch bản demo (≈ 3 phút)

1. Mở 1 nhóm đơn đã có kế hoạch → `GET .../packing-plan`: chỉ ra `solver.inputs` (danh mục đã đọc) và `parcels[].boxComparison` (vì sao chọn thùng này, điểm từng thùng).
2. Mở hướng dẫn 1 kiện → `GET .../parcels/1/guide/trace`: chỉ ra system prompt (luật), `userPayload` (dữ kiện từ DB đã tính), `rawResponse` (lời model).
3. Admin thêm 1 thùng mới ở danh mục vật tư → `GET .../packing-plan` lại: `catalogStale: true`, `catalogChanges` nêu tên thùng → bấm Tính lại → bảng so sánh có dòng thùng mới.
4. Chấm 👍 hướng dẫn → `savedAsExample: true` → viết hướng dẫn kiện khác cùng loại hàng → trace có `examplesUsed: 1`.
