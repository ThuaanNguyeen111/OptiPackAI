# OptiPackAI Backend — Integration Guide: Vật liệu đóng gói & Tái sử dụng (G4)

**Phiên bản v1.0 — 27/09/2026.** Trước G4, thùng/xốp **không được quản lý như tồn kho**: thuật toán chỉ chọn 1 trong 3 cỡ thùng cố định (Small 20×15×10, Medium 35×25×20, Large 50×40×35), không có đơn giá, không trừ số lượng khi đóng gói → không có con số nào chứng minh "tối ưu chi phí". G4 thêm: danh mục vật liệu có đơn giá, tồn tách **MỚI / TÁI SỬ DỤNG**, tự trừ khi đóng gói, tự thu hồi khi kiểm hàng hoàn, và số tiền tiết kiệm cho Dashboard.

Đọc kèm: `INTEGRATION_GUIDE_SHIPPING.md` (form kiểm hàng hoàn — mục C.5).

> 📌 **Cập nhật 27/09/2026:** các tiện ích vận hành (khoảng cách giao lại, quá hạn giao, thông báo, hàng cách ly, đổi hàng, vật liệu thực tế, kho vật liệu nội bộ) được mô tả tại **`INTEGRATION_GUIDE_OPERATIONS_UTILITIES.md`**. Kịch bản trình diễn toàn hệ thống: **`DEMO_PLAYBOOK.md`**.

---

## PHẦN A — LUỒNG TỔNG

```
[Admin] Khai vật liệu (1 lần)  ──►  [Admin/Kho] Nhập vật liệu MỚI  ──►  tồn qtyNew
                                                                           │
[Packaging] bấm "Đóng gói xong" (pack) ─► hệ thống tự TRỪ theo gợi ý ───────┤
      ưu tiên hàng TÁI SỬ DỤNG → ghi số tiền tiết kiệm                       │
      hàng dễ vỡ → thùng CHỈ dùng hàng mới                                   │
                                                                           │
[Kho] kiểm hàng hoàn ─► vật liệu hạng A đã gỡ nhãn ─► cộng vào qtyReused ──┘
                                                          │
[Dashboard] GET /packaging-materials/savings ◄──────────── sổ cái vật liệu
```

## PHẦN B — CÀI ĐẶT DANH MỤC (bắt buộc làm trước khi demo)

Thùng phải khai **đúng 3 kích thước** trùng với thuật toán gợi ý, vật liệu đệm khai `match_material_type` trùng tên trong gợi ý:

```
POST /packaging-materials        (Admin)
{ "code": "BOX-S", "name": "Thùng Small",  "kind": "box", "length_cm": 20, "width_cm": 15, "height_cm": 10, "unit_cost_vnd": 3500 }
{ "code": "BOX-M", "name": "Thùng Medium", "kind": "box", "length_cm": 35, "width_cm": 25, "height_cm": 20, "unit_cost_vnd": 6500 }
{ "code": "BOX-L", "name": "Thùng Large",  "kind": "box", "length_cm": 50, "width_cm": 40, "height_cm": 35, "unit_cost_vnd": 12000 }
{ "code": "BUBBLE", "name": "Màng bóng khí", "kind": "cushioning", "match_material_type": "Bubble Wrap", "unit_cost_vnd": 1500 }
```
(Đơn giá trên là **ví dụ** — nhập giá thật của shop, nếu không số tiết kiệm là số ảo.)

Tùy chọn: `reusable` (mặc định true), `max_reuse_cycles` (mặc định 3 — thùng sóng đơn chịu ~2–4 lần dùng lại).

Nhập vật liệu mới:
```
POST /packaging-materials/BOX-M/purchase     (Admin, Warehouse)
{ "quantity": 100, "note": "Nhập NCC Bao Bì Sài Gòn" }
```

| Tình huống | Lỗi |
|---|---|
| Thùng thiếu kích thước / đệm thiếu `match_material_type` | `400 PKG_MATERIAL_INVALID_DEFINITION` |
| Trùng mã | `409 PKG_MATERIAL_CODE_IN_USE` |
| Sửa `code`/`kind`/kích thước | 400 (không cho sửa — đã gắn với gợi ý và lịch sử) |
| Vô hiệu hóa khi còn tồn | `409 PKG_MATERIAL_HAS_STOCK` |

## PHẦN C — TỰ TRỪ KHI ĐÓNG GÓI 🔄

> 🔄 **ĐÃ THAY ĐỔI (gộp 04/10 + phiên đóng gói 05/10/2026)** — đoạn dưới mô tả route cũ `POST /order-groups/:id/fulfillment/pack` (đã gỡ, giữ làm lịch sử). Hiện nay:
> - Thùng + vật tư trừ theo **từng kiện lúc niêm phong**: `POST /order-groups/:groupId/packing-plan/parcels/:no/seal` (hoặc lối tắt `POST .../packing-plan/pack`). Sổ `packaging_movements` có `packing_plan_id` + `parcel_no`. Hết thùng → 409 `PKG_BOX_OUT_OF_STOCK` (không niêm phong); thiếu vật tư chèn không chặn (`materialsShortfall` trên kiện).
> - Luật dễ vỡ: kiện có hàng dễ vỡ (`parcels[].hasFragile`) **chỉ lấy thùng mới**, trừ khi `PUT /packing/settings {allow_reused_box_for_fragile: true}`. Kiện khác vẫn ưu tiên thùng tái sử dụng (ghi tiết kiệm).
> - Mở kiện đóng lại (`review reopen`) không trừ thùng lần 2.
> - 🆕 **Thu hồi khi tháo kiện** (đơn hủy sau khi đóng): `POST .../packing-plan/parcels/:no/unpack {box_condition: "reusable"}` → `qty_reused + 1`, sổ `recover`; `damaged` → sổ `discard`. Vật tư chèn không thu hồi.
> - Field `packagingConsumption` trong response cũ không còn; xem kiện trong `GET .../packing-plan`.

`POST /order-groups/:id/fulfillment/pack` (cũ) **giữ nguyên body và các field cũ**, response **thêm** 1 field:

```json
{
  "...các field nhóm đơn như cũ...": "",
  "packagingConsumption": {
    "consumed": [ { "materialCode": "BOX-M", "condition": "reused", "quantity": 1, "savingVnd": 6500 } ],
    "warnings": []
  }
}
```

Quy tắc hệ thống tự áp:

| Tình huống | Hệ thống làm |
|---|---|
| Có thùng tái sử dụng cùng cỡ | Dùng thùng tái sử dụng trước, ghi tiết kiệm = đơn giá thùng mới |
| Hàng **dễ vỡ** (gợi ý dùng Bubble Wrap) | Thùng **chỉ** dùng hàng mới (thùng đã qua sử dụng giảm sức chịu nén); Bubble Wrap trừ theo số lượng gợi ý |
| Bấm pack lại (mạng chậm) | Không trừ lần 2 |
| Chưa khai vật liệu / hết hàng | **Không chặn pack** — `warnings` ghi lý do. FE nên hiện cảnh báo vàng "Nhập thêm vật liệu" |

## PHẦN D — THU HỒI KHI KIỂM HÀNG HOÀN

Trong `POST /returns/:id/inspect` thêm mảng tùy chọn `packaging` (xem `INTEGRATION_GUIDE_SHIPPING.md` C.5):
```json
"packaging": [
  { "material_code": "BOX-M", "quantity": 1, "grade": "A", "reuse_cycle_seen": 1, "old_label_removed": true },
  { "material_code": "BUBBLE", "quantity": 2, "grade": "C" }
]
```

| Hạng | Nghĩa | Kết quả |
|---|---|---|
| A | Còn giao lại được (góc không móp, vách không rách, không ẩm/mốc, nắp đóng khít) | Vào kho tái sử dụng — **nếu** đã gỡ nhãn và chưa quá số lần |
| B | Không đủ chắc để giao, dùng nội bộ được | Chỉ ghi nhận |
| C | Tái chế / bỏ | Chỉ ghi nhận |

| Quy tắc | Kết quả |
|---|---|
| Hạng A mà `old_label_removed` ≠ true | `400 PKG_OLD_LABEL_NOT_REMOVED` — nhãn cũ có tên/SĐT/địa chỉ khách trước (bảo vệ dữ liệu cá nhân) |
| `reuse_cycle_seen` ≥ `max_reuse_cycles` | **Tự hạ hạng C**, không vào kho (kết quả ghi trong phiếu) |
| Hạng A cho vật liệu không tái sử dụng được | `400 PKG_MATERIAL_NOT_REUSABLE` |

Nhân viên đánh dấu R1/R2/R3 lên nắp thùng mỗi lần dùng lại, lúc kiểm nhập đúng số thấy trên thùng.

## PHẦN E — SỐ LIỆU & SỔ CÁI

```
GET /packaging-materials                       danh mục + qtyNew / qtyReused
GET /packaging-materials/movements?material_code=BOX-M&limit=100
GET /packaging-materials/savings               (Admin, Store Owner)
→ { "totalSavingVnd": 13000, "unitsConsumedNew": 6, "unitsConsumedReused": 2, "unitsRecovered": 3, "reuseRate": 25 }
```
`reuseRate` = % số lần đóng gói dùng vật liệu tái sử dụng.

## PHẦN F — HẠN CHẾ HIỆN TẠI VÀ HƯỚNG KHẮC PHỤC

1. **1 tồn chung cho cả shop**, chưa tách theo kho (đủ cho demo 1 kho).
2. **Chưa có kiểm kê vật liệu** (điều chỉnh khi đếm lệch) — chỉ có nhập mới, tiêu hao, thu hồi.
3. **Trừ vật liệu chạy SAU khi chuyển `packed`**, không chung transaction với nhóm đơn — lỗi giữa chừng thì nhóm đơn đã `packed` mà vật liệu chưa trừ (có cảnh báo trong log; bấm pack lại không trừ trùng).
4. **Nhân viên có thể dùng thùng khác gợi ý** ngoài đời — hệ thống vẫn trừ theo gợi ý đã duyệt. Chưa có chỗ khai "thực tế dùng thùng gì".
5. **Hạng B chỉ ghi nhận**, chưa có kho "vật liệu nội bộ".
6. Gợi ý đóng gói **chưa hiển thị trước** "có thùng tái sử dụng sẵn" — chỉ biết sau khi pack.

## PHẦN G — THAM CHIẾU

| Method | Route | Role |
|---|---|---|
| GET | `/packaging-materials` · `/:code` · `/movements` | Admin, Store Owner, Warehouse, Packaging |
| GET | `/packaging-materials/savings` | Admin, Store Owner |
| POST | `/packaging-materials` | Admin |
| PATCH · DELETE | `/packaging-materials/:code` | Admin |
| POST | `/packaging-materials/:code/reactivate` | Admin |
| POST | `/packaging-materials/:code/purchase` | Admin, Warehouse |

Checklist test:
- [ ] Khai 3 thùng + Bubble Wrap, nhập 10 thùng Medium mới
- [ ] Pack 1 nhóm đơn gợi ý Medium → `consumed` BOX-M `new`, tồn mới giảm 1
- [ ] Hoàn 1 kiện, kiểm hàng kèm BOX-M hạng A đã gỡ nhãn → `qtyReused` +1
- [ ] Pack nhóm đơn Medium tiếp theo → dùng `reused`, `savingVnd` = đơn giá; `/savings` tăng
- [ ] Nhóm đơn hàng dễ vỡ → thùng dùng `new` dù có `reused`
- [ ] Hạng A chưa gỡ nhãn → `PKG_OLD_LABEL_NOT_REMOVED`; đã dùng 3/3 lần → không vào kho
- [ ] Pack khi chưa khai vật liệu → pack vẫn thành công, `warnings` có nội dung
