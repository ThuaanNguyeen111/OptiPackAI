# FE — Việc còn phải làm để khớp Backend

> **Phiên bản 4.0 — 28/10/2026.** Đối chiếu code FE trên `main` (28/10, sau khi Thuận báo đã làm hết): **28/30 dòng cũ đã nối thật** trên màn; **dòng 30 (khung 3D) và dòng 6 (tuỳ chọn) chưa làm** → đưa lại lên bảng việc bên dưới. Cùng ngày rà luồng đơn gộp từ đầu đến giao: thêm dòng 4–5 (màn lấy hàng đơn gộp, mục 3); tối 28/10 thêm dòng 6 (khoá "Đóng nhanh" nhóm ≥ 2 đơn, mục 3.3). Phần đã xong → thu gọn vào [phụ lục ✅](#phụ-lục--đã-hoàn-thành) cuối file (bấm để mở lại chi tiết khi cần tra). Phần trên chỉ ghi **việc FE đang phải làm**.
> Lịch sử phiên bản: 3.5 (28/10, thêm 1h) · 3.4 (25/10, đối chiếu FE) · 3.3 (23/10, 1e–1g) · 3.2 (22/10 chiều, 1d) · 3.1 (22/10, 1b) · 3.0 (21/10). Lịch sử chi tiết ở `CLAUDE.md`.

**Quy ước chung (giữ nguyên):** mọi nút đổi trạng thái gửi `expected_version` = `version` đọc lần gần nhất; `409 *_CONFLICT` → tải lại rồi cho bấm lại. Lỗi luôn là `{ error_code, message, details }` — hiện `message`, rẽ nhánh theo `error_code`. `fe/src/lib/api.ts` đã tự gắn token, tự refresh khi 401, có `apiRequestBlob` để tải PDF.

---

## 0. Việc FE đang phải làm

| # | Việc | Mục | Ước lượng | Trạng thái |
|---|---|---|---|---|
| 1 | Màn Giao hàng: **điền sẵn 4 ô địa chỉ** từ `GET /shipping/recipients/:groupId` (đơn AURELLE không phải gõ tay), chip **"Địa chỉ mô phỏng #n"** cho đơn bị che, hiện `assumptions` của báo giá | 1 | ~1 giờ | ☐ Chưa làm |
| 2 | **Khung 3D dựng theo kế hoạch thật**: `Packing3DBoxViewer.tsx` hiện chỉ vẽ cảnh mẫu cố định (kích thước thùng đoán theo tên thùng, món hàng vẽ sẵn), **không đọc `parcels[].placements`** mà BE đã trả. Phải vẽ từng món theo `x, y, z, dx, dy, dz` (mm) + `orientation` + `folded`; scale đều, túi zip nằm trong ô, món đỡ | 2 | ~1–2 ngày | ☐ Chưa làm (code 3D của Việt/Thi) |
| 3 | (Tuỳ chọn) Chi tiết 1 sản phẩm Product Master `GET /product-master/:id` (FE chưa có hàm); khối doanh thu / tài chính / nhân viên ở Bảng điều khiển vẫn đọc `data/dashboard-mock.ts` (BE chưa có API) | 3 | Tuỳ | ☐ Chưa làm — tuỳ chọn |
| 4 | 🆕 Màn lấy hàng đơn gộp: **chia khay theo đơn** — mỗi đơn 1 màu + nhãn khay (A, B, C…), bảng "Khay của nhóm", quét SKU có ≥ 2 đơn thì hỏi bỏ vào khay nào và đếm còn lại từng khay (chỉ FE, không đổi BE) | 3.1 | ~nửa ngày | ☐ Chưa làm |
| 5 | 🆕 Màn lấy hàng (Warehouse Staff): **lấy chung các nhóm cùng người nhận** (khác sàn / liên kết tay) bằng `GET /warehouse/:warehouseId/picking-list?group_ids=` — hiện chỉ có ở màn Admin | 3.2 | ~nửa ngày | ☐ Chưa làm |
| 6 | 🆕 Màn đóng gói: khoá **"Đóng nhanh"** theo field mới `packScanRequired` (nhóm ≥ 2 đơn **hoặc** khác tên) thay cho `recipientNamesDiffer`; xử lý `details.reason = 'multi_order_group'` | 3.3 | ~1 giờ | ☐ Chưa làm |

Không việc nào làm hỏng màn hiện tại: dòng 1 chưa nối thì 4 ô vẫn rỗng và BE vẫn tự lấy địa chỉ của đơn; dòng 2 chưa làm thì khung 3D vẫn hiện cảnh mẫu (nhưng **không đúng kế hoạch** — không nên dùng để minh hoạ "3D bin packing" khi demo).

**Cách đối chiếu 28/10:** với từng dòng, tìm route/field/mã lỗi BE trong `fe/src` và kiểm hàm API có màn nào gọi (VD `splitOrderFromGroup` → `GroupOpsPanel.tsx`, `sellerCancelOrder` → `SellerCancelPanel.tsx`, `getPackingBoxSources` → `PackagingWorkbench.tsx`, 4 hàm in PDF → màn kho, `recipientNamesDiffer` khoá "Đóng nhanh"). Chưa bấm thử trên dữ liệu thật — ô nghiệm thu ở phụ lục vẫn là việc của người test.

---

## 1. 🆕 28/10/2026 — Điền sẵn địa chỉ gửi hãng, địa chỉ mô phỏng cho đơn bị che

**Vấn đề hiện tại:** `ShippingPage.tsx` luôn hiện 4 ô Tỉnh / Phường / Số nhà / SĐT **rỗng**. BE vốn đã tự lấy địa chỉ từ đơn khi các ô này rỗng (chúng chỉ là ô **sửa đè**), nhưng người dùng không thấy BE sẽ gửi gì nên tưởng phải gõ tay — kể cả đơn AURELLE đã có đủ địa chỉ.

**BE mới:**

- 🆕 `GET /shipping/recipients/:groupId` (Shipping Coordinator, Store Owner, Admin) → `{ recipients: RecipientPreview[] }`, mỗi đơn còn giao được của nhóm 1 dòng:

  ```ts
  interface RecipientPreview {
    orderId: string
    platformOrderId: string
    platform: string              // 'lazada' | 'aurelle' | ...
    name: string                  // tên của sàn (Lazada vẫn bị che, VD "N**n")
    phone: string | null
    street: string | null         // số nhà + đường
    wardName: string | null
    provinceName: string | null
    address: string | null        // chuỗi đầy đủ BE sẽ gửi hãng
    isDemo: boolean               // true = địa chỉ MÔ PHỎNG (đơn bị che, môi trường demo)
    demoSeq: number | null        // số thứ tự địa chỉ mô phỏng (VD 10 → "47/10 ...")
    assumptions: string[]         // câu giải thích những gì hệ thống tự bổ sung
    errorCode: string | null      // VD 'CARRIER_ADDRESS_INCOMPLETE' → phải nhập tay
    errorMessage: string | null
  }
  ```

- Đơn bị che địa chỉ (Lazada) khi BE bật `CARRIER_DEMO_RECIPIENT_ENABLED=true`: dùng **1 địa chỉ mô phỏng** (số nhà tăng dần `47/10`, `47/11`… theo thứ tự đơn + SĐT di động hợp lệ). BE **không ghi gì vào DB** — tính lại từ dữ liệu đơn nên mở lại màn, báo giá, tạo vận đơn, in nhãn đều ra cùng địa chỉ. Đơn cùng nhóm gộp dùng chung 1 địa chỉ. Đơn AURELLE (đủ địa chỉ thật) không bị ảnh hưởng.
- Nhãn vận đơn (PDF) của đơn mô phỏng in địa chỉ + SĐT mô phỏng, cuối địa chỉ có chữ "(địa chỉ mô phỏng)".
- GHN báo `To address conflict` với số nhà mô phỏng → BE tự gửi lại chỉ phường + tỉnh và thêm 1 câu vào `assumptions` của báo giá. Địa chỉ thật hoặc số nhà Coordinator gõ thì vẫn báo lỗi như cũ.

**FE cần làm (`fe/src/pages/ShippingPage.tsx`, `fe/src/api/shipping.api.ts`):**

1. Thêm hàm API:

   ```ts
   getShippingRecipients(groupId: string): Promise<{ recipients: RecipientPreview[] }>
     → GET /shipping/recipients/${encodeURIComponent(groupId)}
   ```

2. Khi chọn 1 nhóm ở trạng thái `packed` và đã chọn hãng (chỗ đang hiện 4 ô địa chỉ, khoảng dòng 1068–1095): gọi `getShippingRecipients(group.id)`, lấy dòng đầu không có `errorCode` → **điền sẵn** `addrProvince = provinceName`, `addrWard = wardName`, `addrStreet = street`, `addrPhone = phone`. Người dùng vẫn sửa được như cũ. Chỉ điền khi 4 ô đang rỗng (không ghi đè chữ người dùng vừa gõ). Đổi sang nhóm khác thì xoá rồi điền lại.
3. Dòng có `isDemo: true` → chip vàng **"Địa chỉ mô phỏng #{demoSeq}"** + tooltip `assumptions[0]`.
4. Dòng có `errorCode` → giữ 4 ô rỗng, hiện `errorMessage` dưới ô (VD "Địa chỉ đơn hàng thiếu phường/xã hoặc tỉnh/thành — nhập tay…").
5. Hiện `assumptions` của kết quả báo giá (`GET /shipping/quote/:groupId` đã trả sẵn) dạng dòng chữ nhỏ dưới bảng báo giá — có câu "đã gửi lại chỉ phường + tỉnh" khi BE tự bỏ số nhà.

**Kiểm thử tay:** đơn AURELLE → 4 ô tự có địa chỉ khách, báo giá chạy không cần gõ. Đơn Lazada (bật demo) → ô có `47/10 Nguyễn Văn Đậu`, chip "Địa chỉ mô phỏng #10"; mở lại màn vẫn là `#10` (không nhảy số); đơn Lazada thứ 2 (nhóm khác) → `#11` và SĐT khác.

---

## 2. Khung 3D dựng theo kế hoạch thật (dòng 2)

**Hiện trạng (đọc code 28/10):** `fe/src/components/packing/Packing3DBoxViewer.tsx` nhận `boxLabel` rồi đoán kích thước thùng theo chuỗi tên ("Hộp A2", "CARTON-M1"…) và vẽ vài món quần áo/phụ kiện cố định. Không file FE nào đọc `placements`; kiểu `PackingPlan` ở `fe/src/types/packing-plan.ts` chưa có trường này.

**BE đã có sẵn** (`GET /order-groups/:groupId/packing-plan`, mỗi `parcels[i]`): `box.innerMm` / `box.outerMm` (`{ lengthMm, widthMm, heightMm }`), `placements[]` = `{ itemKey, sku, step, x, y, z, dx, dy, dz, orientation, folded }` (mm, gốc tọa độ ở góc trong thùng), `fillRatio`, `manualLayout` (true = kiện nhập tay, không có tọa độ → hiện thông báo thay vì vẽ).

**FE cần làm:**
1. Thêm `placements` + `manualLayout` vào kiểu `PackingPlan`/parcel và hàm đọc response.
2. `Packing3DBoxViewer` nhận `parcel` thay cho `boxLabel`: thùng = `box.innerMm`; mỗi món = 1 khối tại `(x + dx/2, z + dz/2, y + dy/2)` cỡ `dx × dz × dy` (đổi mm → đơn vị cảnh bằng 1 hệ số chung cho cả thùng).
3. Các yêu cầu của mục 1g bước 3 (phụ lục): scale đều không kéo giãn mesh, túi zip vẽ trong ô, `folded` chỉ ở 6 loại quần áo, món đỡ = món có `z + dz` bằng `z` của món trên và hình chiếu XY giao nhau.
4. Đánh số theo `step` (thứ tự xếp) để khớp hướng dẫn đóng gói.

**Nghiệm thu:** mở 1 kế hoạch có 2 món → khung 3D hiện đúng 2 khối, đúng vị trí so với bảng số đo; kiện `manualLayout: true` → hiện "Kiện nhập tay, không có hình 3D".

---

## 3. 🆕 28/10/2026 — Màn lấy hàng cho đơn gộp (dòng 4, 5)

**Hiện trạng (đọc code `main` 28/10):** `WarehousePage.tsx` đã gom theo SKU và hiện 1 dòng chữ "Chia theo đơn: Chị Lan · 5329… ×2 · Anh Tuấn · 5330… ×1" (`allocationText`, chỉ khi SKU thuộc ≥ 2 đơn). Chưa có khay/màu theo đơn, quét xong không biết món đã vào khay nào. Lấy chung nhiều nhóm (khác sàn, liên kết tay) chỉ có ở `AdminWarehousePage.tsx` (`getWarehousePickingListForGroups`), Warehouse Staff không dùng được dù BE đã cho quyền. Luồng đơn gộp đầy đủ + giới hạn BE: `INTEGRATION_GUIDE_FULFILLMENT.md` **Nghiệp vụ 9**.

### 3.1 Chia khay theo đơn (dòng 4) — chỉ FE

Dữ liệu đã có: mỗi dòng picking list có `order_allocations: [{ order_id, platform_order_id, recipient_name, quantity }]` (tổng = `quantity` của dòng); nhóm có `orders[]` (xếp theo thời gian tạo) và `recipientNamesDiffer`.

1. **Gán khay cố định cho từng đơn của nhóm:** đơn còn hiệu lực xếp theo `orders[]` → khay **A, B, C…**; màu lấy từ `fe/src/lib/recipient-color.ts` (đang dùng ở màn đóng gói qua `parcel-order-display.ts`) để **cùng 1 đơn cùng 1 màu** ở lấy hàng và đóng gói. Nhóm chỉ 1 đơn → không hiện gì thêm (giữ màn như cũ).
2. **Bảng "Khay của nhóm"** đầu màn lấy hàng: mỗi khay 1 dòng — nhãn khay + màu, mã đơn sàn, người nhận, tổng số món phải bỏ vào, số đã bỏ (đếm tạm ở bước 4).
3. **Mỗi dòng SKU:** thay dòng chữ "Chia theo đơn" bằng các chip màu `A ×2`, `B ×1` (tooltip: tên người nhận + mã đơn). Giữ nguyên cách quét theo SKU.
4. **Quét / bấm "+1" một SKU có ≥ 2 đơn:** sau khi `pick-item` thành công, hiện hộp chọn khay (nút màu A/B/C, gợi ý khay còn thiếu nhiều nhất trước). Đếm tạm trong state của màn (khoá theo `groupId + sku + order_id`), **không gửi BE** — BE chưa có API ghi "món vào khay nào". Tải lại màn thì đếm tạm mất; ghi rõ "đếm khay chỉ để chia tay, không lưu".
5. Khay đã đủ món → chip khay đổi dấu ✓. Bấm "Hoàn tất lấy hàng" khi còn khay chưa đủ (theo đếm tạm) → hỏi xác nhận, không chặn (BE đã đối soát theo SKU).
6. Nhóm `recipientNamesDiffer = true` → banner vàng "Nhóm có nhiều người nhận — chia đúng khay, khi đóng gói phải quét từng món".

**Nghiệm thu:** nhóm 2 đơn (A: áo ×2, B: áo ×1 + quần ×1) → bảng khay A=2, B=2; quét áo 3 lần, chọn A, A, B → A ✓, B còn 1; quét quần → không hỏi (chỉ thuộc B) → B ✓; màu khay A ở màn lấy hàng trùng màu kiện của đơn A ở màn đóng gói.

### 3.2 Lấy chung các nhóm cùng người nhận (dòng 5) — BE đã có

API (quyền **Warehouse Staff**, Admin): `GET /warehouse/:warehouseId/picking-list?group_ids=G1,G2` → mảng dòng như picking list thường, **mỗi dòng có `order_group_id`** (cùng 1 SKU của 2 nhóm là 2 dòng), đã xếp theo thứ tự đi kệ. Danh sách nhóm cùng người nhận: `GET /order-groups/:id/linked` (nhóm có `linkedGroupCount > 0` hoặc `manualLink` khác null).

1. Ở thẻ/nhóm trên màn lấy hàng: `linkedGroupCount > 0` → nút **"Lấy chung N nhóm cùng người nhận"**.
2. Bấm → gọi `/linked`, chỉ giữ nhóm đang chờ lấy / đang lấy (`awaiting_packaging`, `picking`) **cùng kho** (`warehouseId` trùng hoặc null) → gọi picking list gộp với các id đó (cả nhóm hiện tại).
3. Hiện danh sách theo thứ tự đi kệ; mỗi dòng có nhãn nhóm (đuôi mã nhóm + sàn + màu nhóm). Kết hợp được với khay ở 3.1 (khay = đơn, nhãn = `nhóm·khay`).
4. Quét/`pick-item` gửi đúng `POST /order-groups/{line.order_group_id}/fulfillment/pick-item`. Báo thiếu: `report-missing` của **đúng nhóm** với `expected_version` của nhóm đó. Hoàn tất: gọi `POST /order-groups/:id/fulfillment/pick` **từng nhóm** (nhóm nào đủ thì xong nhóm đó; 409 `ORD_GROUP_PICK_INCOMPLETE` của 1 nhóm không chặn nhóm khác).
5. In PDF dùng chung: `GET /documents/picking-list/:warehouseId/:groupId` vẫn theo từng nhóm — in lần lượt hoặc ẩn nút in ở chế độ lấy chung.
6. Lỗi `ORD_GROUP_WRONG_WAREHOUSE` của 1 nhóm → bỏ nhóm đó khỏi lượt lấy chung, báo "Nhóm … đang lấy ở kho khác".

**Nghiệm thu:** 1 nhóm Lazada + 1 nhóm AURELLE liên kết tay → nút lấy chung hiện ở cả 2; danh sách gộp đúng thứ tự kệ; quét món của nhóm AURELLE chỉ trừ nhóm AURELLE; hoàn tất nhóm Lazada khi nhóm AURELLE còn thiếu vẫn thành công.

### 3.3 Khoá "Đóng nhanh" cho nhóm ≥ 2 đơn (dòng 6) — 🆕 tối 28/10

**BE đổi (AOFP-210):** mỗi đơn có vận đơn riêng, nên món bỏ nhầm sang kiện của đơn kia sẽ lệch sổ khi khách trả hàng. Trước đây chỉ nhóm **khác tên** người nhận mới bị chặn "đóng nhanh"; giờ nhóm còn **≥ 2 đơn hiệu lực** (kể cả cùng tên) cũng bị chặn.

- Response nhóm đơn (`GET /order-groups`, `GET /order-groups/:id`) có thêm `packScanRequired: boolean` = nhóm ≥ 2 đơn hiệu lực **hoặc** `recipientNamesDiffer`. Chưa gồm cài đặt chung `require_scan` của kho (FE vẫn kết hợp như đang làm).
- `POST /order-groups/:groupId/packing-plan/pack` với nhóm ≥ 2 đơn → `409 PACKING_SCAN_REQUIRED`, `details: { reason: 'multi_order_group', orderCount }`. Nhóm khác tên vẫn trả `reason: 'recipient_names_differ'` như cũ.

Việc FE (`PackagingWorkbench.tsx`):

1. `scanLocked = requireScan || Boolean(group?.packScanRequired)` (thay `recipientNamesDiffer` ở dòng ~993); thêm field vào `fe/src/types/order-groups.ts` và map trong `order-groups.api.ts` (`row.packScanRequired === true || row.pack_scan_required === true`).
2. Hai chỗ nút "Đóng nhanh" (dòng ~1571, ~1834): `disabled` theo `packScanRequired`; ghi chú: khác tên → giữ câu cũ; cùng tên → "Nhóm gộp N đơn — mỗi đơn 1 vận đơn, quét từng món vào đúng kiện rồi niêm phong".
3. Nếu vẫn gọi mà nhận `409` → hiện đúng `message` của BE.

**Nghiệm thu:** nhóm 1 đơn → "Đóng nhanh" bấm được; nhóm 2 đơn cùng tên → nút khoá, ghi chú "Nhóm gộp 2 đơn…"; gọi thẳng API → 409 `multi_order_group`.

**Không cần đổi FE cho G2, G3, G4:** trạng thái giao theo từng đơn là việc BE gửi AURELLE; nhãn PDF do BE in; khoá gộp tính lúc đồng bộ.

---

## Phụ lục ✅ — đã hoàn thành

Mỗi khối dưới đây đã xong — bấm vào dòng ✅ để mở lại chi tiết request/response và cách làm cũ.

<details>
<summary>✅ Bảng việc 21–25/10 (dòng 1–30) — 28/30 đã xong (dòng 6 và 30 chuyển lên trên)</summary>

##### Bảng việc cũ (dòng 1–30)

| # | Việc | Mục | Trạng thái |
|---|---|---|---|
| 1 | Màn đóng gói: báo trước lấy thùng ở **kệ mới hay kệ tái sử dụng**, nút **"Dùng thùng mới thay"** kèm lý do | 1.1 | ✅ Đã nối |
| 2 | 5 nút **in PDF**: tem ô kệ, tem SKU, danh sách lấy hàng, phiếu nhập kho | 1.3 | ✅ Đã nối |
| 3 | Cài đặt **người gửi** in trên nhãn vận đơn | 1.2 | ✅ Đã nối |
| 4 | Lô hàng: Picking List hiện lô xuất trước; màn Tồn theo lô; danh sách + chi tiết phiếu nhập | 2 | ✅ Việt (AOFP-185). In phiếu nhập nằm ở dòng 2 |
| 5 | Dọn mã chết (gọi route BE đã gỡ, không màn nào dùng) | 3 | ✅ Đã xoá |
| 6 | (Tuỳ chọn) Chi tiết 1 sản phẩm Product Master; số liệu giả còn lại ở Bảng điều khiển | 4 | ☐ Chưa làm — chuyển lên bảng trên (dòng 3) |
| 7 | Nhóm đơn có `warehouseId`: màn lấy hàng mở đúng kho; bắt 409 `ORD_GROUP_WRONG_WAREHOUSE` | — | ✅ Đã nối |
| 8 | Tab **"Kẹt — SKU chưa đo"** (`packingBlocked`) | 1b.1 | ✅ Đã nối |
| 9 | Tên người đóng gói (`assignedPackerName`) | 1b.2 | ✅ Đã nối |
| 10 | Ô tìm nhóm `GET /order-groups?q=` | 1b.3 | ✅ Đã nối |
| 11 | Bỏ form giả lập trả hàng | 1b.4 | ✅ Đã xoá form |
| 12 | Nút **"Ngắt kết nối"** shop | 1b.5 | ✅ Lazada + AURELLE |
| 13 | Nghỉ phép nhân viên + khoá chọn người nghỉ | 1b.6 | ✅ Đã nối |
| 14 | Thông báo `packing_blocked` | 1b.7 | ✅ Đã nối |
| 15 | SKU sàn ngừng bán / ngừng dùng + **Dùng lại** | 1c | ✅ Đã nối |
| 16 | Nút **"Hủy đơn (người bán)"** + chip | 1d | ✅ Đã nối |
| 17 | Chữ **"Giao phần có sẵn"** | 1d | ✅ Đã nối |
| 18 | Chip **Tự tạo / Tự nối** + cảnh báo tắt SKU nội bộ | 1d | ✅ Đã nối |
| 19 | Chỉ tra liên kết SKU nội bộ có thật | 1d | ✅ Đã nối |
| 20 | Xác nhận ô thứ 2 `WH_SKU_IN_OTHER_BIN` | 1d | ✅ Gán ô, kiểm hoàn, cách ly |
| 21 | Trang **Lịch sử** | 1e | ✅ Đã nối |
| 22 | Tab **Dòng thời gian** | 1e | ✅ Đã nối |
| 23 | Khoá **Đóng nhanh** khi nhiều người nhận + tên trên kiện | 1f.4 | ✅ Đã nối |
| 24 | Chip **Gộp N người nhận** + thông báo `consolidation_name_mismatch` | 1f | ✅ Đã nối |
| 25 | **Chia theo đơn** (`order_allocations`) | 1f.3 | ✅ Đã nối |
| 26 | **Tách** / **Gộp** nhóm | 1f.2 | ✅ Đã nối |
| 27 | Tên người nhận từng kiện + câu địa chỉ sửa áp mọi kiện | 1f.5 | ✅ Đã nối |
| 28 | Banner `plan.profileStale` + Tính lại | 1g bước 1 | ✅ Đã nối |
| 29 | Ô **Gập đôi** chỉ 6 loại quần áo | 1g bước 2 | ✅ Đã nối |
| 30 | Khung 3D: scale đều, túi zip, nhiều món đỡ | 1g bước 3 | ☐ Chưa làm — chuyển lên bảng trên (dòng 2) |

Không có việc nào ở trên làm **hỏng** màn hiện tại — BE chỉ thêm, chưa làm thì màn cũ vẫn chạy. Ngoại lệ đã ghi rõ: "Đóng nhanh" nhóm nhiều người nhận (dòng 23), ô gập đôi cho loại không phải quần áo (dòng 29), form giả lập trả hàng (dòng 11), đặt mã vào ô thứ 2 (dòng 20) sẽ nhận lỗi từ BE.

> **23/10/2026 — FE OptiPack KHÔNG phải sửa:** thanh tiến trình đơn bên website AURELLE (AOFP-186..188) chỉ đổi phía website + BE. Vận đơn OptiPack vẫn như cũ; riêng hàng đợi gửi AURELLE có thêm 3 mốc (`processing`, `in_transit`, `out_for_delivery`) — không màn OptiPack nào hiển thị hàng đợi này.

> **21/10/2026 — chỉ đổi nghĩa con số, FE không phải sửa:** `activeWorkload` của Warehouse Staff (`GET /order-groups/staff/search`, hiện "N việc" ở `WarehousePage.tsx`) nay chỉ đếm nhóm **còn ở bước lấy hàng** (chờ xử lý, đang lấy, thiếu hàng chờ quyết định) — số sẽ nhỏ hơn trước. Nếu màn có chữ giải thích thì sửa thành "nhóm đang lấy".

</details>

<details>
<summary>✅ 1b–1g (22–23/10): kẹt đóng gói, tên người đóng, tìm nhóm, ngắt shop, nghỉ phép, SKU ngừng dùng, người bán hủy đơn, lịch sử, đơn gộp, cờ hồ sơ đổi, gập đôi (trừ 1g bước 3 — khung 3D, xem mục 2)</summary>

#### 1b. 🆕 Mới 22/10/2026 — kẹt đóng gói, tên người đóng, tìm nhóm, bỏ giả lập trả hàng, ngắt shop, nghỉ phép

> BE đã xong (AOFP-152..158). Chưa làm FE thì màn cũ **vẫn chạy**, chỉ thiếu thông tin — riêng mục 1b.4 (bỏ form giả lập) nên làm sớm vì bấm form cũ sẽ nhận lỗi 410.
> Phần **tự tính lại thiếu hàng khi có hàng về** (AOFP-154) và **hành trình hàng đổi trên website AURELLE** (AOFP-156) KHÔNG cần sửa FE OptiPack.

##### 1b.1 Màn Đóng gói — nhóm kẹt vì SKU chưa đo

**Vấn đề hiện tại:** nhóm đã lấy xong (`picked`) mà có SKU chưa có số đo kho xác nhận thì BE không tính được kế hoạch → nhóm không nằm ở tab nào của `PackagingWorkbench`, người dùng tưởng mất đơn.

**BE trả gì:** mỗi `OrderGroup` (`GET /order-groups`, `GET /order-groups/:id`) có thêm
`packingBlocked: { reason: 'needs_measurement' | 'missing_product_master', skus: string[], at: string | null } | null`.
Lọc riêng: `GET /order-groups?packing_blocked=true`. Kho bấm "Xác nhận số đo" xong → BE tự xoá `packingBlocked` và tự tính lại kế hoạch trong ~10 giây (không cần nút "Tính lại").

**Bước 1 — tầng API** (`fe/src/types/order-groups.ts`, `fe/src/api/order-groups.api.ts`):
1. Thêm type `PackingBlocked = { reason: 'needs_measurement' | 'missing_product_master'; skus: string[]; at: string | null }`.
2. `OrderGroup` thêm `packingBlocked: PackingBlocked | null`.
3. Trong hàm map 1 dòng nhóm đơn (chỗ đang map `stockShortage`), đọc `row.packingBlocked ?? null`.
4. `ListOrderGroupsParams` thêm `packing_blocked?: boolean`; `toQuery` gửi `packing_blocked: 'true' | 'false'`.

**Bước 2 — màn** (`fe/src/components/packing/PackagingWorkbench.tsx`):
1. Trong `queueTabs` thêm tab thứ 5 **"Kẹt — SKU chưa đo"** (key `packing_blocked`, không phải "chỉ xem"), đếm = số nhóm có `packingBlocked !== null`.
2. Khi chọn tab này: gọi `listOrderGroups({ packing_blocked: true })` (Packaging Staff vẫn gửi `assigned_packer_id` như cũ? **Không** — nhóm kẹt chưa có kế hoạch nên chưa có người đóng; tab này bỏ lọc người đóng).
3. Mỗi dòng: mã nhóm + chip đỏ **"Chưa đo: SLL-BRN-37, X-1"** (từ `packingBlocked.skus`), thời điểm `packingBlocked.at`.
4. Khung chi tiết nhóm kẹt: dòng giải thích theo `reason`:
   - `needs_measurement` → "Các SKU sau chưa có số đo kho xác nhận. Vào **Cấu hình kho → Sản phẩm → Nối SKU** → lọc **Chưa đo** → **Xác nhận số đo**. Đo xong, hệ thống tự tính lại kế hoạch trong vài giây."
   - `missing_product_master` → "SKU chưa có hồ sơ sản phẩm. Bấm đồng bộ catalog ở **Cấu hình kho → Sản phẩm** rồi xác nhận số đo."
5. Admin thấy thêm nút **"Đi tới màn đo"** → `navigate('/app/admin/warehouse')` (tab Sản phẩm). Packaging Staff chỉ thấy chữ, không có nút (không có quyền màn này).
6. Ở tab này đặt hẹn giờ tải lại 15 giây (hoặc nút **Tải lại**) để nhóm tự biến khỏi tab khi đã đo xong và chuyển sang "Chờ duyệt kế hoạch".

**Bước 3 — các màn khác (tuỳ chọn):** `OrderGroupsPage.tsx` hiện chip "Kẹt đóng gói" cạnh chip "Thiếu hàng" khi `packingBlocked` khác null.

##### 1b.2 Tên người đóng gói

**BE trả gì:**
- `OrderGroup` (danh sách + chi tiết) thêm `assignedPackerId: string | null`, `assignedPackerName: string | null` (người đóng của kế hoạch đang hoạt động; null = chưa có kế hoạch / chưa giao).
- Kế hoạch đóng gói: `plan.session.assignedPackerName` (cạnh `assignedPackerId`). `GET /packing-plans/summary` thêm `assignedPackerName`.

**Bước:**
1. `fe/src/types/order-groups.ts`: `OrderGroup` thêm 2 trường trên; map trong `order-groups.api.ts`.
2. `fe/src/types/packing-plan.ts`: `session` thêm `assignedPackerName: string | null`; summary thêm `assignedPackerName`.
3. `PackagingWorkbench.tsx`:
   - Thẻ mỗi nhóm ở hàng đợi (Admin/Store Owner xem): thêm dòng nhỏ **"Người đóng: {assignedPackerName ?? 'chưa giao'}"**.
   - Khung "Gán người đóng · {6 ký tự cuối}" (khoảng dòng 1218): thay `assignedPackerId.slice(-6)` bằng `plan.session.assignedPackerName ?? plan.session.assignedPackerId?.slice(-6)`.
   - Hiện tên người đóng ngay ở phần chi tiết nhóm cả khi chưa duyệt (không chỉ trong khối `approved_for_packing`).
4. `OrderGroupsPage.tsx` (tuỳ chọn): cột "Người đóng".

##### 1b.3 Tìm nhóm đơn trên server (`?q=`)

**BE:** `GET /order-groups?q=<chuỗi>` (tối đa 64 ký tự) khớp: mã nhóm đủ 24 ký tự; **đuôi** mã nhóm 4–23 ký tự hex (VD `5beca05d93` như màn kho hiện, `f8d98931` như màn đóng gói hiện); mã đơn sàn / mã đơn AURELLE (`platformOrderId` hoặc số đơn hiển thị — khớp chính xác, không phân biệt hoa thường). Ghép được với mọi bộ lọc khác.

**Bước:**
1. `ListOrderGroupsParams` thêm `q?: string`, gửi trong `toQuery`.
2. `PackagingWorkbench.tsx` ô **"Tìm mã đơn…"**: hiện chỉ lọc trong danh sách đã tải (`groupMatchesSearch`). Giữ lọc tại chỗ; khi không khớp dòng nào và chuỗi ≥ 4 ký tự → gọi `listOrderGroups({ q })` (không truyền `fulfillment_status`) và hiện kết quả kèm trạng thái thật của nhóm, VD "Nhóm …05d93 đang **Đang lấy hàng** — chưa tới bước đóng gói". Đây là điều người dùng gặp ngày 22/10: tìm ở màn Đóng gói nhưng nhóm còn ở bước lấy hàng.
3. `OrderGroupsPage.tsx` và `WarehousePage.tsx` (ô chọn nhóm): dùng `q` thay vì lọc tại chỗ để tìm được cả nhóm ngoài trang đang tải.

##### 1b.4 Bỏ form giả lập trả hàng (làm sớm)

**BE:** `POST /returns` nay **luôn** trả `410 RMA_SIMULATION_DISABLED` cho mọi sàn. Phiếu trả/đổi chỉ còn 2 nguồn: khách gửi trên website AURELLE (tự hiện ở danh sách, `source = 'marketplace'`) và phiếu hoàn tự tạo khi giao thất bại (`source = 'failed_delivery'`). Các bước duyệt → nhận → kiểm → đóng giữ nguyên.

**Bước:**
1. `fe/src/pages/ReturnsPage.tsx`: bỏ nút **"+ Tạo phiếu RMA"** và khối `{isAdmin && createOpen ? <CreateReturnForm …/> : null}` (khoảng dòng 345–375) cùng state `createOpen`.
2. Thay bằng 1 dòng hướng dẫn ở đầu màn: "Phiếu trả/đổi do khách gửi trên website AURELLE và tự hiện ở đây. Giao thất bại thì hệ thống tự tạo phiếu hoàn."
3. Xoá `fe/src/components/returns/CreateReturnForm.tsx` và hàm `createReturn` trong `fe/src/api/returns.api.ts` (không màn nào dùng nữa) — hoặc giữ hàm nhưng không gọi.
4. Nếu còn chỗ nào gọi `createReturn`: bắt `410 RMA_SIMULATION_DISABLED` → hiện `message` của BE.
5. Lọc theo nguồn (tuỳ chọn): dropdown "Nguồn: Khách AURELLE / Giao thất bại" dựa trên `source`.

##### 1b.5 Ngắt kết nối shop

**BE:** `DELETE /marketplace/:platform/shops/:shopId` (chỉ **Admin**) → `200 { shopId, platform, isActive: false, wasActive, disconnectedAt }`. Chỉ tắt shop (`is_active=false`), dừng kéo đơn/catalog/đẩy tồn/kéo yêu cầu trả hàng; **không xoá** đơn, sản phẩm, tồn kho. Gọi lại khi đã ngắt vẫn 200 (`wasActive: false`). Shop chưa từng kết nối → `404 MKT_SHOP_NOT_FOUND`. Kết nối lại = bấm "Kết nối" OAuth như lần đầu. `GET /marketplace/:platform/shops` thêm `disconnectedAt` (null nếu không do Admin ngắt).

**Bước:**
1. `fe/src/api/marketplace.api.ts`: thêm `disconnectShop(platform, shopId)` → `DELETE /marketplace/${platform}/shops/${encodeURIComponent(shopId)}`.
2. `fe/src/types/marketplace-orders.ts`: kiểu shop thêm `disconnectedAt: string | null`.
3. `fe/src/components/marketplace/LazadaConnectPanel.tsx` (dùng cho cả AURELLE): mỗi shop đang `isActive` có nút đỏ **"Ngắt kết nối"** → hộp xác nhận "Ngắt shop {shopName}? Hệ thống ngừng đồng bộ đơn, sản phẩm, tồn kho của shop này. Dữ liệu cũ vẫn giữ." → gọi API → tải lại danh sách.
4. Shop đã ngắt: chip xám **"Đã ngắt {ngày giờ disconnectedAt}"** (hoặc "Token hết hạn" nếu `disconnectedAt` null) + nút **"Kết nối lại"** (luồng OAuth cũ).
5. Store Owner không thấy nút (route chỉ Admin).

##### 1b.6 Nghỉ phép nhân viên

**BE:**
- `PATCH /users/:id/leave` (Admin, Store Owner), body `{ on_leave: boolean, until?: ISO, note?: string (≤200) }` → trả 1 dòng nhân viên như danh sách Admin. `until` (tuỳ chọn) qua hạn thì tự tính đi làm lại. Chỉ cho Warehouse Staff / Packaging Staff / Shipping Coordinator (`422 USER_LEAVE_NOT_STAFF`); `until` đã qua → `400 USER_LEAVE_UNTIL_PAST`.
- `GET /users` mỗi dòng thêm `on_leave` (đã tính hạn), `on_leave_until`, `on_leave_note`.
- Danh sách chọn người: `GET /order-groups/staff/search` và `GET /packing/staff` mỗi dòng thêm `onLeave: boolean`, `onLeaveUntil: string | null`.
- Người nghỉ: hệ thống **không tự giao** việc lấy hàng / đóng gói; giao tay → `409 ORD_GROUP_STAFF_ON_LEAVE` (lấy hàng) / `409 PACKING_PACKER_ON_LEAVE` (đóng gói). Việc họ đang giữ **không tự chuyển** — dùng "Đổi người".

**Bước 1 — API** (`fe/src/api/users.api.ts`): thêm `setUserLeaveApi(id, { on_leave, until?, note? })`; kiểu nhân viên thêm `onLeave`, `onLeaveUntil`, `onLeaveNote` (map từ `on_leave`…).

**Bước 2 — màn Nhân viên** (`fe/src/pages/StaffManagementPage.tsx`, và bảng người dùng ở `AdminPage.tsx` nếu có cột trạng thái):
1. Cột trạng thái: thêm chip vàng **"Nghỉ phép"** (kèm "đến dd/mm" nếu có `onLeaveUntil`, tooltip `onLeaveNote`).
2. Nút **"Cho nghỉ phép"** (chỉ hiện với 3 vai trò trên) → popup: ô "Nghỉ đến" (datetime, tuỳ chọn), ô ghi chú → gọi API `on_leave: true`.
3. Người đang nghỉ: nút **"Đi làm lại"** → gọi API `on_leave: false`.
4. Store Owner hiện chỉ xem màn này (`GET /users`) — nay được bấm 2 nút trên (route cho phép Store Owner).

**Bước 3 — dropdown phân công:**
1. `WarehousePage.tsx` ("Phân công nhân viên kho" → "Chọn tay"): option của người `onLeave` hiện "(nghỉ phép)" và `disabled`.
2. `PackagingWorkbench.tsx` ("Gán người đóng" → "Chọn nhân viên"): tương tự.
3. Bắt `409 ORD_GROUP_STAFF_ON_LEAVE` / `409 PACKING_PACKER_ON_LEAVE` → hiện `message`, tải lại danh sách người.

##### 1b.7 Loại thông báo mới `packing_blocked`

1. `fe/src/types/notifications.ts`: thêm `'packing_blocked'` vào danh sách loại + nhãn `{ vi: 'Kẹt đóng gói — SKU chưa đo', en: 'Packing blocked — SKU not measured' }`.
2. `fe/src/lib/notification-nav.ts`: `packing_blocked` → Admin điều hướng `/app/packing` (tab "Kẹt — SKU chưa đo") hoặc `/app/admin/warehouse`; Store Owner → `/app/order-groups`. Gửi cho Admin + Store Owner, 1 lần mỗi lần nhóm chuyển sang kẹt.

---

#### 1c. 🆕 Mới 22/10/2026 (trưa) — SKU AURELLE theo quy tắc OptiPack, tự nối SKU, SKU sàn ngừng dùng

> BE đã xong (AOFP-159..161). Form tạo sản phẩm bên **website AURELLE** đã sửa (không thuộc FE OptiPack). FE OptiPack chỉ cần phần dưới.

**BE đổi gì (ảnh hưởng màn OptiPack):**
- SKU AURELLE mới luôn dạng `{danh mục cấp 2}-{số mẫu 3 số}-{màu}-{size}` (VD `ATHUN-005-DEN-M`). SKU sàn trùng mã một SKU nội bộ đang dùng → BE **tự nối** (không cần bấm ở màn "Nối SKU"); tạo SKU nội bộ mới trùng mã SKU sàn đã có → cũng tự nối. Liên kết tự nối có `created_by = 'system:auto-map'`.
- `GET /product-master` mỗi dòng thêm `marketplaceStatus: 'active' | 'inactive' | null` và `retired: boolean`. Mặc định **ẩn** SKU sàn đã ngừng bán (`inactive`) hoặc đã đánh dấu ngừng dùng; `?include_retired=true` để xem cả.
- "SKU chưa gán" (`GET /warehouse/sku-bin-assignments/unassigned`), "SKU chưa nối" (`GET /master-skus/unmapped-seller-skus`) cũng tự bỏ các SKU đó.
- 🆕 `PATCH /product-master/:id/retire` (Admin), body `{ retired: boolean }`.

**Bước 1 — API** (`fe/src/api/catalog.api.ts` hoặc file đang gọi `/product-master`):
1. Kiểu hồ sơ SKU thêm `marketplaceStatus`, `retired`.
2. Hàm `retireProductMaster(id, retired)` → `PATCH /product-master/${id}/retire`.
3. Hàm danh sách nhận thêm `include_retired?: boolean`.

**Bước 2 — màn** (`fe/src/pages/admin-warehouse/CatalogPanels.tsx`, bảng hồ sơ đóng gói / "Đồng bộ và nối SKU sàn"):
1. Thêm ô chọn **"Hiện cả SKU ngừng dùng"** → gọi lại danh sách với `include_retired=true`.
2. Dòng có `marketplaceStatus = 'inactive'` → chip xám **"Sàn ngừng bán"**; `retired = true` → chip **"Ngừng dùng"**.
3. Mỗi dòng có nút **"Ngừng dùng"** (khi `retired = false`) / **"Dùng lại"** (khi `true`) → gọi API → tải lại. Gợi ý cho mã cũ `SF-…` / mã mẫu của sản phẩm đã xoá bên AURELLE: gỡ khỏi kệ (kiểm kê ô về 0 → bỏ gán) rồi bấm "Ngừng dùng".
4. Màn "Nối SKU": dòng liên kết `createdBy = 'system:auto-map'` hiện nhãn **"Tự nối (trùng mã)"**.

---

#### 1d. 🆕 Mới 22/10/2026 (chiều) — Người bán hủy đơn AURELLE, giao thiếu, đồng bộ 2 bên

> BE đã xong (AOFP-163..169). Website AURELLE (khách + Admin website) đã sửa — **không thuộc FE OptiPack**. FE OptiPack chỉ cần 2 việc dưới.

**BE đổi gì (ảnh hưởng màn OptiPack):**
- 🆕 `POST /order-groups/orders/:orderId/seller-cancel` (Store Owner, Admin), body `{ reason: string }` (1–300 ký tự, **khách thấy lý do này**). Chỉ đơn **AURELLE**, chưa giao cho vận chuyển. Trả `{ order_id, status: 'canceled' }`. Lỗi:
  - `404 ORD_GROUP_ORDER_NOT_FOUND` — không có đơn.
  - `409 ORD_GROUP_SELLER_CANCEL_NOT_ALLOWED` — đơn Lazada / đơn thay thế đổi hàng / đã hủy / nhóm đã `shipped` trở đi. Hiện `message`.
- Sau khi hủy: nhóm tự xử lý như đơn bị hủy (trả hàng dư về kệ, tháo kiện nếu đang đóng, nhả giữ chỗ — giống khách hủy). Website hiện **"Người bán đã hủy đơn" + lý do**, đơn đã thanh toán chuyển "Đã hoàn tiền".
- `GET /orders/:id` thêm `sellerCanceled: boolean` và `origin: 'marketplace' | 'replacement'`.
- **Giao thiếu:** khi Packaging Staff bấm **"Đồng ý đi tiếp với phần có sẵn"** (decide-partial `approve: true`), BE tự chia số đã lấy cho từng đơn (đơn cũ trước) và báo từng đơn AURELLE bị thiếu → website hiện "Kho giao thiếu N sản phẩm — không tính tiền". **Không đổi API**, chỉ cần đổi chữ cảnh báo.

**Bước 1 — API** (`fe/src/api/orders.api.ts`, file đang gọi `GET /orders/:id`):
1. Kiểu chi tiết đơn thêm `sellerCanceled: boolean`, `origin: 'marketplace' | 'replacement'`.
2. Hàm mới:
   ```ts
   export async function sellerCancelOrder(orderId: string, reason: string) {
     return apiRequest<{ order_id: string; status: 'canceled' }>(
       `/order-groups/orders/${encodeURIComponent(orderId)}/seller-cancel`,
       { method: 'POST', body: { reason }, auth: true },
     )
   }
   ```

**Bước 2 — màn chi tiết đơn** (`fe/src/pages/OrderDetailPage.tsx` và `fe/src/pages/AdminOrderDetailPage.tsx`):
1. Hiện nút **"Hủy đơn (người bán)"** khi **đủ cả 4**: `platform === 'aurelle'`, `origin !== 'replacement'`, `status` thuộc `pending | unpaid | packed | ready_to_ship | topack | toship`, và vai trò là Store Owner / Admin.
2. Bấm nút → mở hộp thoại: ô **"Lý do (khách sẽ thấy)"** bắt buộc, gợi ý sẵn 3 lựa chọn bấm nhanh: "Sản phẩm đã hết hàng", "Không liên hệ được người nhận", "Sai thông tin địa chỉ". Dòng cảnh báo: *"Khách sẽ nhận thông báo đơn bị người bán hủy. Không hoàn tác được."*
3. Xác nhận → gọi `sellerCancelOrder` → thành công: toast "Đã hủy đơn, website đã được báo" → tải lại chi tiết đơn. 409 → hiện `message` trong hộp thoại.
4. Đơn có `sellerCanceled = true` → chip đỏ **"Người bán hủy"** cạnh trạng thái (thay cho chip "Đã hủy" thường).
5. (Tuỳ chọn) Danh sách đơn: chip giống bước 4 — cần `GET /orders` trả thêm field, hiện **chưa có**; bỏ qua.

**Bước 3 — màn đóng gói, hộp quyết định giao thiếu** (`fe/src/components/packing/PackagingWorkbench.tsx`, chỗ gọi `decidePartialOrderGroup`):
1. Đổi chữ nút "Đồng ý" thành **"Giao phần có sẵn"**.
2. Thêm 1 dòng dưới nút: *"Đơn AURELLE bị thiếu sẽ được báo cho khách và không tính tiền phần thiếu. Đơn Lazada xử lý trên Seller Center."*

**Bước 4 — màn SKU nội bộ / Nối SKU** (`fe/src/pages/admin-warehouse/CatalogPanels.tsx`, phần "SKU nội bộ" và "Nối SKU"):
1. API `GET /master-skus` và danh sách liên kết nay trả thêm `createdBy` (BE sửa 22/10 chiều — trước đó **chưa trả**, nên việc 1c bước 2.4 chỉ làm được từ bản này). Thêm `createdBy: string` vào 2 kiểu dữ liệu.
2. SKU nội bộ có `createdBy = 'system:auto-create'` → chip xanh **"Tự tạo từ AURELLE"**. Tên của SKU đó là tên sản phẩm bên website, kích thước để trống → nhắc kho bấm "Sửa" để đo bổ sung.
3. Liên kết có `createdBy = 'system:auto-map'` → nhãn **"Tự nối (trùng mã)"** (chính là việc 1c bước 2.4).
4. Nút **"Vô hiệu"** SKU nội bộ: thêm câu xác nhận *"Website AURELLE sẽ hiện Hết hàng cho mọi SKU nối với mã này (tồn đẩy sang = 0)."*

**Bước 6 — sửa log rác `MSKU_NOT_FOUND`** (`fe/src/hooks/useAdminWarehouse.ts`, `useEffect` tra `listSkuMappings`, khoảng dòng 133):
1. Hiện hook gọi `GET /master-skus/:code/mappings` cho **mọi** `row.masterSku` của dòng gán kệ. Với SKU sàn **chưa nối**, `masterSku` là chính mã SKU sàn (VD `SLL-BRN-37`) → BE trả 404 `MSKU_NOT_FOUND` mỗi lần mở màn (6 dòng WARN/lần trong log 22/10).
2. Sửa: chỉ gọi cho mã **có thật** trong danh sách SKU nội bộ — lấy `GET /master-skus` một lần (đã có trong `catalog.api.ts`), lọc `masters` theo tập mã đó trước khi `Promise.all`.
3. Không đổi hành vi màn (lỗi đang bị `.catch(() => [])` nuốt), chỉ hết log rác.

**Bước 7 — hỏi xác nhận khi đặt 1 mã vào ô thứ 2** (BE sửa 22/10 tối — **làm sớm**, chưa làm thì màn hiện lỗi và KHÔNG gán được ô thứ 2):
- BE: gán SKU vào ô (`POST /warehouse/warehouses/:id/sku-bin-assignments`), nhập hàng hoàn sau kiểm (`POST /returns/:id/inspect`, từng dòng `restock`) và nhập lại hàng cách ly (`POST /returns/:id/quarantine/:line/resolve`) — nếu **ô chọn chưa có mã đó** mà mã **đang nằm ở ô khác cùng kho** → `409 WH_SKU_IN_OTHER_BIN`, `details: { sellerSku, masterSku, binCodes: ['KA-D1-T01-T01-1'] }`. Gửi lại kèm `confirm_other_bin: true` (gán ô: ở body; inspect: ở **từng dòng** `lines[i]`; quarantine: ở body) để xác nhận.
1. `fe/src/pages/AdminWarehousePage.tsx`, hàm `submit` của `AssignTab` (khoảng dòng 2071): trong `.catch`, nếu `getApiErrorCode(err) === 'WH_SKU_IN_OTHER_BIN'` → `window.confirm(`${formatApiError(err)}\n\nVẫn đặt thêm vào ô này?`)` → đồng ý thì gọi lại `api.assignSku({ ...input, confirm_other_bin: true })`. Làm giống nhánh `WH_BIN_OVER_CAPACITY` đang có (giữ cả 2 cờ nếu đã xác nhận cả 2). Thêm `confirm_other_bin?: boolean` vào kiểu `AssignSkuInput` (`fe/src/api/warehouse.api.ts`).
2. Màn kiểm hàng hoàn (`fe/src/components/warehouse/WarehouseReturnsPanel.tsx` / `fe/src/pages/ReturnsPage.tsx`, chỗ gửi `inspect`): bắt 409 trên → hỏi xác nhận, đồng ý thì gửi lại với `confirm_other_bin: true` ở **dòng có ô bị hỏi** (hoặc mọi dòng restock cho đơn giản). Kiểu `InspectionLine` thêm field.
3. Nút "Nhập lại kho" của hàng cách ly: tương tự, cờ ở body.
4. (Gợi ý) Ở ô chọn kệ, hiện sẵn dòng phụ "Mã này đang ở: KA-…" lấy từ danh sách dòng tồn đã tải — người dùng biết trước khi bấm.

**Bước 5 — (biết để giải thích, không cần sửa màn):** website AURELLE chỉ bán SKU do kho OptiPack quản. Store Owner hỏi "sao trên web hết hàng" → kiểm tra SKU sàn đó đã nối SKU nội bộ hoặc đã gán kệ/nhập kho chưa (màn "SKU chưa nối", "SKU chưa gán").

---

#### 1e. 🆕 Mới 23/10/2026 — Lịch sử thao tác (mọi vai trò xem lại được)

> BE đã xong (AOFP-176..177). FE OptiPack cần 1 trang mới + 1 tab ở chi tiết nhóm đơn. Không đụng màn cũ.

**BE có gì:**
- `GET /history` — lịch sử **mới → cũ**, mọi vai trò dùng được, mỗi vai trò chỉ thấy loại việc của mình:

  | Vai trò | Loại xem được (`category`) |
  |---|---|
  | Admin | tất cả: `orders, picking, packing, shipping, returns, warehouse, packaging_materials, auth` |
  | Store Owner | tất cả trừ `auth` |
  | Nhân viên kho | `orders, picking, warehouse, returns, packaging_materials` |
  | Nhân viên đóng gói | `orders, picking, packing, packaging_materials` |
  | Điều phối vận chuyển | `orders, shipping, returns` |

  Query (đều tuỳ chọn): `category` (nhiều loại cách nhau dấu phẩy), `from`, `to` (ISO 8601; mặc định 30 ngày gần nhất), `before` (con trỏ trang sau), `limit` (1–100, mặc định 50), `actor_id`, `mine=true` (chỉ việc của tôi), `sku`, `order_group_id`, `order_code` (mã đơn sàn). Lọc loại không được phép → `403`.
  Trả `{ items: HistoryItem[], nextBefore: string | null, categories: [{ code, label }] }`.
- `HistoryItem`: `{ id, occurredAt, category, categoryLabel, action, summary, actor: { id, name, role } | null, orderGroupId, entity: { type, id, code } | null, skus, quantity, fromStatus, toStatus, details }`. **`summary` là câu tiếng Việt hiển thị thẳng**, VD *"Bắt đầu giao SHP-1 qua GHN · Hàng nhẹ → Nguyễn Văn A (12 Lê Lợi, …) — mã GHN123"*, *"Niêm phong kiện 1: thùng SAMPLE-S, 0.4 kg — đơn 720000001"*, *"Nhập lô LOT-… (phiếu PN-…): 30 sản phẩm, 2 mã"*. `details` là các field phụ (vận chuyển: `carrier, service, trackingCode, recipientName, recipientPhone, recipientAddress, costVnd, attempt, reason`; kho: `bin, quantityBefore, quantityAfter, reason, note`; phiếu nhập: `lotCode, receivedAt, supplier, lines`…).
- `GET /history/categories` — mảng loại vai trò hiện tại được xem.
- `GET /history/order-groups/:id/timeline` — dòng thời gian **cũ → mới** của 1 nhóm đơn: đơn về → đổi trạng thái → từng lần lấy hàng (ô, số lượng, ai lấy) → tính/duyệt/phân công/bắt đầu/niêm phong từng kiện/xong → vận chuyển (hãng, mã, người nhận, giao thất bại/lại/hoàn) → trả hàng (từng bước) → nhập lại kệ. Mọi vai trò. `{ orderGroupId, items }`.
- `GET /history/export` — CSV mở bằng Excel, cùng bộ lọc, tối đa 5.000 dòng (Admin, Store Owner).

**Bước 1 — API** (tạo `fe/src/api/history.api.ts`):
1. Kiểu `HistoryItem`, `HistoryPage = { items, nextBefore, categories }`.
2. `listHistory(params)` → `GET /history?…` (dựng query bằng `URLSearchParams`, bỏ field rỗng).
3. `getGroupTimeline(groupId)` → `GET /history/order-groups/${groupId}/timeline`.
4. `downloadHistoryCsv(params)` → dùng `apiRequestBlob` (đã có trong `fe/src/lib/api.ts`) gọi `GET /history/export?…`, tạo link tải file `lich-su-thao-tac.csv`.

**Bước 2 — trang "Lịch sử"** (tạo `fe/src/pages/HistoryPage.tsx`):
1. Route: thêm `<Route path="history" element={<HistoryPage />} />` vào **cả 2** nhóm route trong `fe/src/App.tsx` (nhóm `/app/...` cho nhân viên và nhóm `/app/admin/...`).
2. Menu: thêm mục **"Lịch sử"** (icon đồng hồ/`History` của lucide) vào `fe/src/components/portal/PortalSidebar.tsx` (mọi vai trò) và `fe/src/modules/admin/components/AdminSidebar.tsx`.
3. Thanh lọc trên cùng:
   - Chip **loại** lấy từ `categories` của response đầu tiên (chọn nhiều; không chọn = tất cả được phép).
   - Ô **Từ ngày / Đến ngày** (mặc định 7 ngày gần nhất → gửi `from`, `to`).
   - Ô tìm **SKU**, ô **Mã đơn sàn** (`order_code`).
   - Công tắc **"Chỉ việc của tôi"** (`mine=true`).
   - Admin/Store Owner: ô chọn **nhân viên** (`actor_id`, lấy danh sách từ `GET /users`) + nút **"Xuất Excel"**.
4. Danh sách: nhóm theo **ngày** (tiêu đề "Thứ Năm, 23/10/2026"). Mỗi dòng: giờ `HH:mm` · chip loại (màu riêng mỗi loại) · **`summary`** · tên + vai trò người làm (`actor.name`, `actor.role`; null → "—"). Bấm dòng → mở khung chi tiết hiện `details` dạng bảng 2 cột (ẩn giá trị null) + nút **"Xem cả đơn"** nếu có `orderGroupId` (mở tab Dòng thời gian bên dưới).
5. Cuối danh sách: nút **"Tải thêm"** khi `nextBefore` khác null → gọi lại với `before = nextBefore`, nối vào danh sách.
6. Trống: "Chưa có thao tác nào trong khoảng thời gian này."

**Bước 3 — tab "Dòng thời gian" ở chi tiết nhóm đơn** (`fe/src/pages/OrderGroupsPage.tsx`, khung chi tiết nhóm; và `fe/src/pages/order-groups/GroupOpsPanel.tsx` nếu màn đóng gói/kho mở chi tiết ở đó):
1. Thêm tab **"Dòng thời gian"** → gọi `getGroupTimeline(group.id)` khi mở tab.
2. Hiển thị dạng trục dọc (cũ ở trên, mới ở dưới): chấm màu theo `category`, giờ + ngày, `summary`, người làm. Dòng `shipping` hiện thêm 1 dòng nhỏ: `details.carrier · details.service · mã details.trackingCode`.
3. Nút "Tải lại" (lịch sử có thể vừa thêm dòng mới).

**Lưu ý hiển thị:**
- Sổ hoạt động mới (đổi trạng thái nhóm đơn, từng bước phiếu trả hàng, người bán hủy, giao thiếu) chỉ có **từ 23/10/2026**. Đơn cũ vẫn có lịch sử lấy hàng, đóng gói, vận chuyển, nhập kho (ghép từ dữ liệu sẵn có).
- `actor.id` bắt đầu bằng `system` → hiện "Hệ thống" (icon máy), không phải người.

---

#### 1f. 🆕 Mới 23/10/2026 — Đơn gộp: nhiều người nhận, chia theo đơn, tách / gộp nhóm

> BE đã xong (AOFP-183). FE OptiPack sửa 5 màn: danh sách/chi tiết nhóm đơn, lấy hàng, đóng gói, vận chuyển, thông báo. Mọi field mới đều **thêm**, chưa làm thì màn cũ vẫn chạy — riêng nút "Đóng nhanh" sẽ nhận `409` với nhóm nhiều người nhận (xem bước 4).

##### 1f.0 Nghiệp vụ — FE cần hiểu trước khi làm

**Khi nào hệ thống tự gộp đơn?** Đơn mới về được gộp vào nhóm của đơn cũ khi **cùng sàn + cùng shop + cùng khoá gộp** và nhóm cũ còn "mở":
- Khoá gộp mặc định = **SĐT + địa chỉ (dòng 1) + tỉnh/thành** — **không gồm tên**. Admin đổi được ở `/order-sync-settings` (`consolidation_key_fields`); thêm `full_name` thì 2 người khác tên **không bao giờ** tự gộp.
- Nhóm "mở" = đang `awaiting_packaging` / `picking` (Admin cấu hình `openGroupStatuses`) và **không** phải nhóm vừa tách tay (`consolidationClosed = true`). Nhóm đã lấy xong trở đi → đơn đến muộn tự lập nhóm mới.

**Cái gì làm CHUNG, cái gì làm RIÊNG từng đơn?**

| Bước | Chung cả nhóm | Riêng từng đơn |
|---|---|---|
| Lấy hàng | Danh sách gom theo SKU (đi kệ 1 lần), số đã quét tính cho cả nhóm | `order_allocations` cho biết mỗi SKU của đơn nào, người nhận nào |
| Đóng gói | 1 kế hoạch, 1 người đóng | **Mỗi kiện thuộc đúng 1 đơn** (`parcels[].orderId`) — không bao giờ có kiện chứa hàng của 2 đơn |
| Vận chuyển | 1 vận đơn nội bộ (`shipmentCode`), 1 địa chỉ sửa tay (`toLocation`) | **Mỗi kiện 1 mã vận đơn hãng**, tên người nhận = tên trên đơn sở hữu kiện |

→ 2 người khác tên cùng địa chỉ (vợ/chồng, đồng nghiệp chung văn phòng) gộp chung **là bình thường**: kho lấy 1 lượt, mỗi người vẫn nhận kiện + nhãn mang tên mình. Rủi ro duy nhất là **bỏ nhầm hàng / dán nhầm nhãn** → BE thêm cảnh báo + bắt quét từng món + in tên lên kiện.

**Khi nào cho tách / gộp tay?** Chỉ khi nhóm đang **chờ / đang lấy hàng** và **chưa quét món nào** ở lượt hiện tại. Đã quét rồi thì không tách/gộp được (hàng đã quét tính chung cho cả nhóm) — cứ lấy + đóng theo nhóm hiện tại, mỗi đơn vẫn ra kiện + vận đơn riêng.

**Hủy 1 đơn trong nhóm gộp** (đã có từ trước, không đổi): hủy trước khi đóng → thông báo `return_to_shelf` (đem hàng của đơn đó về kệ); hủy sau khi đóng → `unpack_required` (tháo kiện của đơn đó); các đơn còn lại vẫn đi tiếp.

##### 1f.1 Kiểu dữ liệu + API (làm trước)

1. `fe/src/types/order-groups.ts` — thêm vào kiểu nhóm đơn (response của `GET /order-groups`, `GET /order-groups/:id`, …):
   ```ts
   recipientNames: string[]          // tên người nhận khác nhau của đơn còn hiệu lực (không gồm tên bị che)
   recipientNamesDiffer: boolean     // true = nhóm gộp ≥ 2 người nhận khác tên
   hasMaskedRecipientName: boolean   // có đơn bị sàn che tên (không kiểm chứng được)
   splitFromGroupId: string | null   // nhóm này tách ra từ nhóm nào
   mergedIntoGroupId: string | null  // nhóm này đã bị gộp vào nhóm nào (khi đó fulfillmentStatus = 'canceled')
   consolidationClosed: boolean      // true = không tự nhận thêm đơn gom đến muộn
   ```
   So sánh tên không phân biệt hoa thường / dấu / khoảng trắng: "Nguyễn Văn A" và "nguyen van a" là **1** người.
2. Kiểu món lấy hàng (`PackableItem` trong `fe/src/types/order-groups.ts` và `WarehousePickingListItem` trong `fe/src/types/warehouse-admin.ts`) — thêm optional:
   ```ts
   order_allocations?: { order_id: string; platform_order_id: string; recipient_name: string | null; quantity: number }[]
   ```
   Tổng `quantity` các dòng = `quantity` của món. Có ở cả `GET /order-groups/:id/picking-list` lẫn `GET /warehouse/:warehouseId/picking-list/:groupId`.
3. `fe/src/api/packing-plan.api.ts` — kiểu kế hoạch: thêm `recipientName: string | null` vào **từng phần tử `orders[]`** và **từng phần tử `parcels[]`** (null với kế hoạch tính trước 23/10/2026).
4. `fe/src/types/notifications.ts` — thêm `'consolidation_name_mismatch'` vào danh sách loại.
5. `fe/src/api/order-groups.api.ts` — thêm 2 hàm:
   ```ts
   splitOrderFromGroup(groupId, orderId, body: { expected_version: number; note: string })
     → POST /order-groups/${groupId}/orders/${orderId}/split
     → { sourceGroup: OrderGroup; newGroup: OrderGroup }
   mergeOrderGroups(groupId, body: { source_group_id: string; expected_version: number; note: string })
     → POST /order-groups/${groupId}/merge
     → OrderGroup (nhóm đích sau khi gộp)
   ```
   `note` bắt buộc 3–300 ký tự. Quyền: **Store Owner, Điều phối vận chuyển, Admin** — ẩn nút với vai trò khác.

##### 1f.2 Danh sách + chi tiết nhóm đơn (`fe/src/pages/OrderGroupsPage.tsx`, `fe/src/pages/order-groups/GroupOpsPanel.tsx`)

1. **Chip cảnh báo** ở thẻ/dòng nhóm khi `recipientNamesDiffer`: nền vàng, chữ **"Gộp {recipientNames.length} người nhận"**; di chuột/bấm → hiện danh sách tên. Khi `hasMaskedRecipientName`: chip xám **"Có tên bị che"** (tooltip: "Sàn che tên — đối chiếu nhãn từng kiện khi đóng").
2. **Danh sách đơn trong chi tiết nhóm** (đang hiện `platformOrderId · status`, khoảng dòng 357 của `GroupOpsPanel.tsx`): thêm **tên người nhận** (`order.recipient.fullName`) và SĐT rút gọn. Khi nhóm có ≥ 2 tên, tô mỗi người 1 màu (dùng lại đúng màu đó ở màn lấy hàng + đóng gói — gợi ý: màu theo thứ tự xuất hiện trong `recipientNames`, so tên đã bỏ dấu/viết thường).
3. **Nút "Tách ra nhóm riêng"** cạnh từng đơn — chỉ hiện khi đủ cả 4 điều kiện:
   - vai trò Store Owner / Điều phối / Admin;
   - `fulfillmentStatus` là `awaiting_packaging` hoặc `picking`;
   - `activeOrderCount ≥ 2`;
   - đơn đó còn hiệu lực (không `canceled` / sự cố).
   Bấm → hộp thoại: "Tách đơn {platformOrderId} ({tên}) ra nhóm riêng? Nhóm mới sẽ được giao nhân viên kho và giữ hàng riêng, không tự nhận thêm đơn." + ô **Lý do** (bắt buộc) → gọi `splitOrderFromGroup(group.id, order.id, { expected_version: group.version, note })`.
   - Thành công: toast "Đã tách — nhóm mới {newGroup.id cuối 6 ký tự}", tải lại danh sách, cho nút "Mở nhóm mới".
   - Lỗi (đọc `error_code`):
     | Mã | Hiện cho người dùng |
     |---|---|
     | `ORD_GROUP_REGROUP_HAS_PICKS` | "Nhóm đã quét lấy hàng — không tách được nữa. Cứ lấy + đóng theo nhóm: mỗi đơn vẫn có kiện và vận đơn riêng." |
     | `ORD_GROUP_REGROUP_NOT_ALLOWED` | hiện `message` của BE (sai trạng thái / chỉ còn 1 đơn / đơn đã hủy) |
     | `ORD_GROUP_STATE_CONFLICT` | "Nhóm vừa được cập nhật — đã tải lại, thử lại." → tải lại nhóm |
     | `ORD_GROUP_ORDER_NOT_FOUND` | "Đơn không còn thuộc nhóm này." → tải lại |
4. **Nút "Gộp với nhóm khác"** ở đầu chi tiết nhóm — cùng điều kiện vai trò + trạng thái như trên.
   - Hộp thoại gợi ý nhóm nguồn: lấy `GET /order-groups/:id/linked` (nhóm cùng người nhận) **và** ô tìm nhóm (`GET /order-groups?q=` — mục 1b.3). Chỉ cho chọn nhóm **cùng `platform` + `shopId`**, trạng thái `awaiting_packaging`/`picking`. Hiện mỗi nhóm: mã cuối, số đơn, tên người nhận, trạng thái.
   - Ô **Lý do** bắt buộc. Câu xác nhận: "Chuyển toàn bộ đơn của nhóm {nguồn} sang nhóm này. Nhóm {nguồn} sẽ đóng lại."
   - Gọi `mergeOrderGroups(group.id, { source_group_id, expected_version: group.version, note })`.
   - Lỗi riêng: `ORD_GROUP_MERGE_SCOPE_MISMATCH` (khác sàn/shop) và `ORD_GROUP_MERGE_RECIPIENT_MISMATCH` (SĐT thật khác nhau) → hiện `message` + nút **"Liên kết thay thế"** (gọi `POST /order-groups/:id/link` đã có — 2 nhóm vẫn riêng nhưng lấy chung danh sách và giao chung chuyến). `ORD_GROUP_MERGE_SELF`, `REGROUP_HAS_PICKS`, `REGROUP_NOT_ALLOWED`, `STATE_CONFLICT` như bảng trên.
5. **Nhóm đã bị gộp** (`mergedIntoGroupId` khác null): thay chip "Đã hủy" bằng **"Đã gộp vào nhóm …{6 ký tự cuối}"** (bấm để mở nhóm đích). Mặc định ẩn các nhóm này khỏi danh sách đang làm (chúng có `activeOrderCount = 0`).
6. **Nhóm tách ra** (`splitFromGroupId` khác null): chip nhỏ "Tách từ nhóm …" (bấm mở nhóm gốc).

##### 1f.3 Màn lấy hàng (`fe/src/pages/WarehousePage.tsx`)

1. Đầu danh sách lấy hàng của nhóm: nếu `recipientNamesDiffer` → băng vàng **"Nhóm giao cho {n} người: A, B. Chia hàng vào khay riêng theo từng người khi lấy."**
2. Mỗi dòng SKU (khoảng dòng 234–242, hàm dựng danh sách từ `PackableItem | WarehousePickingListItem`): khi `order_allocations` có **≥ 2 dòng** hoặc nhóm `recipientNamesDiffer` → thêm phần mở rộng **"Chia theo đơn"**:
   ```
   AOPOLO-030-BE-L   cần 3 · đã lấy 1
     ├ 2 cái → Đơn AUR-0001 · Trần Thị B   (chấm màu của B)
     └ 1 cái → Đơn AUR-0002 · Lê Văn C     (chấm màu của C)
   ```
   `recipient_name` null hoặc có dấu `*` → hiện "Tên bị che". Nhóm 1 đơn → không hiện phần này (giữ màn gọn).
3. Không đổi cách quét: vẫn quét theo SKU như cũ (`picked_quantity` chung). Phần chia theo đơn chỉ để nhân viên chia khay.

##### 1f.4 Màn đóng gói (`fe/src/components/packing/PackagingWorkbench.tsx`, `fe/src/components/packing/PackingSessionPanel.tsx`)

1. **Đầu kiện** (`PackingSessionPanel.tsx` dòng ~111–113, đang hiện `#{parcelNo} {box.code}`): thêm dòng **"Đơn {platformOrderId} · Người nhận: {recipientName}"** (`recipientName` null → bỏ phần người nhận). Viền trái kiện tô màu của người nhận (cùng màu 1f.2).
2. Khi kế hoạch có **≥ 2 `orders[]` khác `recipientName`**: nhóm các kiện theo đơn, mỗi nhóm có tiêu đề "Đơn AUR-0001 — Trần Thị B ({k} kiện)".
3. **Nút "Đóng nhanh"** (gọi `packPlan(...)`, `PackagingWorkbench.tsx` dòng ~692): khi nhóm `recipientNamesDiffer` → **ẩn hoặc khoá** nút, ghi chú "Nhóm nhiều người nhận — quét từng món vào đúng kiện rồi niêm phong". Nếu vẫn gọi, BE trả `409 PACKING_SCAN_REQUIRED` với `details.reason = 'recipient_names_differ'`, `details.recipientNames` → hiện đúng `message` của BE.
4. Hướng dẫn trong lúc quét: món quét vào kiện nào thì chỉ thuộc đơn của kiện đó (BE đã kiểm món thuộc kiện) — chỉ cần hiện rõ tên người nhận của kiện đang mở để nhân viên không lấy nhầm khay.
5. **In tem kiện** (mục 1.3 — nút in tem/phiếu): thêm dòng **"Người nhận: {recipientName}"** + mã đơn lên mỗi tem để dán đúng.

##### 1f.5 Màn vận chuyển (`fe/src/pages/ShippingPage.tsx`)

1. Danh sách kiện của vận đơn (`carrierParcels[]`): mỗi kiện có `orderId`. Lấy tên người nhận bằng cách khớp `orderId` với `orders[]` trong `GET /order-groups/:id` (`order.recipient.fullName`, `order.recipient.phone`) → hiện "Kiện {parcelNo} · Đơn {platformOrderId} · {tên} · mã hãng {carrierOrderCode}".
2. Nhóm `recipientNamesDiffer`: băng nhắc "Vận đơn gồm kiện của {n} người nhận — mỗi kiện có mã vận đơn hãng riêng mang đúng tên người nhận."
3. **Sửa địa chỉ** (`toLocation`): áp dụng cho **mọi kiện** của vận đơn. Vì vậy BE không cho gộp 2 nhóm có SĐT thật khác nhau. Thêm câu dưới form: "Địa chỉ sửa áp dụng cho tất cả kiện của nhóm này."

##### 1f.6 Thông báo `consolidation_name_mismatch`

1. `fe/src/lib/notification-nav.ts` + `fe/src/components/portal/PortalTopBar.tsx`: nhãn **"Đơn gộp nhiều người nhận"**, mức `warning`, bấm → mở chi tiết nhóm (`relatedEntityId` = id nhóm).
2. Người nhận thông báo: Store Owner, Điều phối vận chuyển, và nhân viên kho đang giữ nhóm. Gửi khi đơn gom đến muộn hoặc gộp tay làm nhóm có ≥ 2 tên khác nhau.

##### 1f.7 Lịch sử (mục 1e) — nhãn hành động mới

Sổ hoạt động có thêm 3 `action` (loại `orders`): `order_group.split` (tách đơn), `order_group.merged` (gộp nhóm — nhóm nguồn có `fromStatus → canceled`), `order_group.recipient_names_differ` (cảnh báo khác tên). `summary` đã là câu tiếng Việt, `note` là lý do người dùng nhập.

##### 1f.8 Nghiệm thu

1. Đặt 2 đơn AURELLE cùng SĐT + địa chỉ, khác tên → 1 nhóm, chip "Gộp 2 người nhận", Store Owner nhận thông báo.
2. Màn lấy hàng: mỗi SKU có "Chia theo đơn" đúng số lượng từng người.
3. Lấy xong → kế hoạch đóng gói: mỗi kiện hiện đúng người nhận; "Đóng nhanh" bị khoá; quét + niêm phong từng kiện được.
4. Giao: mỗi kiện 1 mã GHN, tên người nhận đúng từng đơn.
5. Đơn thứ 3 khác tên vào nhóm đang `picking` chưa quét → "Tách ra nhóm riêng" → nhóm mới có nhân viên, nhóm cũ còn 2 đơn. Quét 1 món rồi thử tách → báo `REGROUP_HAS_PICKS`.
6. Gộp 2 nhóm cùng SĐT → nhóm nguồn hiện "Đã gộp vào nhóm …"; gộp 2 nhóm khác SĐT → báo lỗi + nút "Liên kết thay thế".

---

#### 1g. 🆕 Mới 23/10/2026 — Khung 3D đóng gói: cờ "hồ sơ đã đổi", chỉ quần áo được gập (từ AOFP-179..182 của Thi)

> BE đã có trên `main` (AOFP-181 `profileStale`, AOFP-179 giới hạn gập đôi). Phản hồi đầy đủ cho FE ở [FEEDBACK_3D_DONG_GOI.md](FEEDBACK_3D_DONG_GOI.md) và [HUONG_DAN_3D_DONG_GOI_BACKEND.md](HUONG_DAN_3D_DONG_GOI_BACKEND.md). Chưa làm thì màn cũ vẫn chạy, riêng ô "gập đôi" ở bước 2 sẽ nhận lỗi 422 với loại hàng không phải quần áo.

> **25/10:** bước 1 và bước 2 đã nối trên màn. Bước 3 chưa làm — khung 3D là code của Việt/Thi, để nguyên.

**Bước 1 — banner "Hồ sơ SKU đã đổi, nên tính lại"** ✅ 25/10 (`fe/src/api/packing-plan.api.ts`, `fe/src/pages/AdminPackingPlansPage.tsx`, `fe/src/components/packing/PackagingWorkbench.tsx`):
1. Kiểu `PackingPlan` thêm `profileStale: boolean` (đọc `row.profileStale === true`; kế hoạch cũ không có → `false`).
2. Chỉ `GET /order-groups/:groupId/packing-plan` tính cờ này; các route ghi luôn trả `false` → sau thao tác ghi, giữ giá trị cờ đã đọc từ lần GET gần nhất hoặc GET lại.
3. `profileStale = true` (chỉ xảy ra với kế hoạch `ready` / `approved`): hiện banner vàng phía trên khung 3D: **"Hồ sơ SKU (loại hàng, túi zip, số đo) đã được kho xác nhận lại sau khi tính kế hoạch — hình 3D có thể sai. Nên tính lại."** + nút **"Tính lại"** gọi `recomputePackingPlan(groupId, …)` (hàm đã có → `POST /order-groups/:groupId/packing-plan/recompute`). Tính xong cờ tự về `false`.
4. Kế hoạch `packing` (đang đóng dở) không bao giờ báo cờ — không cần xử lý.

**Bước 2 — ô "Gập đôi được" ở hồ sơ SKU** ✅ 25/10 (`fe/src/pages/admin-warehouse/CatalogPanels.tsx`):
1. Chỉ cho bật khi loại hàng thuộc 6 loại quần áo: `t_shirt`, `shirt`, `jacket`, `shorts`, `trousers`, `dress`. Loại khác → ẩn hoặc khoá ô, gửi `can_fold_in_half: false`, ghi chú nhỏ "Chỉ quần áo mới gập đôi được".
2. BE trả `422 PM_FOLD_NOT_ALLOWED` nếu vẫn gửi `true` cho loại khác → hiện `message`.

**Bước 3 — dựng hình 3D** — chưa đụng (khung xem 3D trong `fe/src/components/packing/Packing3DBoxViewer.tsx`):
1. `folded: true` chỉ còn ở 6 loại quần áo → không cần clip gập cho giày, dép, phụ kiện.
2. Kích thước ô lấy đúng `dx, dy, dz` + `orientation` (`WLH` hoán đổi `dx`/`dy`; món dễ vỡ đã cộng `2 × đệm` mỗi chiều) — không suy từ số đo hồ sơ.
3. **Không kéo giãn mesh theo từng trục** cho khít ô (làm méo model): scale đều theo trục lớn nhất, định vị bằng `x, y, z, dx, dy, dz`. Hàng cứng (giày, dép, phụ kiện) càng không kéo giãn.
4. Túi zip: vẽ túi mỏng **nằm trong ô** (thu vào vài mm), không phình ra ngoài (engine không cộng độ dày túi).
5. Món đỡ: 1 món có thể được **nhiều** món đỡ — món đỡ = mọi món có `z + dz` bằng `z` của món trên và hình chiếu XY giao nhau.

**Nghiệm thu:** sửa hồ sơ 1 SKU của kế hoạch đang `ready` → mở lại kế hoạch thấy banner → bấm "Tính lại" → banner mất; thử bật "gập đôi" cho dép → ô bị khoá (hoặc báo `PM_FOLD_NOT_ALLOWED`).

</details>

<details>
<summary>✅ Mục 1–5 (21/10): nguồn thùng, người gửi, in tem/phiếu kho, lô hàng FIFO, dọn mã chết, tuỳ chọn, nghiệm thu</summary>

#### 1. 🆕 Mới 21/10/2026 — nguồn thùng, người gửi, in tem/phiếu kho

##### 1.1 Màn đóng gói — báo trước lấy thùng ở kệ nào, cho chọn "dùng thùng mới thay"

Đọc: [INTEGRATION_GUIDE_PACKING.md mục 3.4.1](INTEGRATION_GUIDE_PACKING.md).

**Bước 1 — tầng API** (`fe/src/api/packing-plan.api.ts`, `fe/src/types/packing-plan.ts`):
1. Thêm type `BoxSourcePlan` = `{ parcelNo, boxCode, state: 'to_consume'|'consumed'|'inactive', reusedAllowed, planned: 'new'|'reused'|null, forcedNewReason: 'FRAGILE'|'NOT_REUSABLE'|'NO_REUSED_STOCK'|null, outOfStock, used: 'new'|'reused'|null, boxSourceOverride }` và `BoxSourcesResponse = { orderGroupId, version, allowReusedForFragile, parcels: BoxSourcePlan[], stock: { code, name, qtyNew, qtyReused, reusable }[] }`.
2. Thêm hàm `getBoxSources(groupId)` → `GET /order-groups/:groupId/packing-plan/box-sources`.
3. `PackingPlanParcel` thêm 2 trường tuỳ chọn: `boxSourceUsed?: 'new'|'reused'|null`, `boxSourceOverride?: { source, planned, reason, note, by, at } | null`.
4. `sealParcel(groupId, parcelNo, expectedVersion, weightKg, choice?)`: thêm tham số tuỳ chọn `choice?: { box_source: 'auto'|'new'|'reused'; box_source_reason?: string; box_source_note?: string }`, trải vào body. Không truyền → gửi như cũ.
5. `packPlan(...)`: kiểu phần tử `parcels` thêm 3 trường tuỳ chọn trên.
6. Hằng nhãn lý do: `REUSED_BOX_WORN` "Thùng tái sử dụng móp/rách" · `REUSED_BOX_DIRTY` "Bẩn/ẩm" · `OLD_LABEL_NOT_CLEAN` "Còn vết nhãn cũ" · `REUSED_NOT_ON_SHELF` "Kệ không còn thùng" · `HIGH_VALUE_ORDER` "Đơn giá trị cao" · `OTHER` "Khác (ghi chú)".

**Bước 2 — màn** (`fe/src/components/packing/PackingSessionPanel.tsx`):
1. Khi mở phiên đóng và sau mỗi lần niêm phong thành công: gọi `getBoxSources(groupId)`, lưu theo `parcelNo`.
2. Trên mỗi kiện `pending`, cạnh tên thùng, hiện 1 dòng:
   - `planned = 'reused'` → chip xanh **"Lấy ở kệ tái sử dụng · còn {qtyReused}"**.
   - `planned = 'new'` → chip xám **"Lấy thùng mới · còn {qtyNew}"** + lý do nhỏ theo `forcedNewReason` (`FRAGILE` "hàng dễ vỡ", `NO_REUSED_STOCK` "kệ tái sử dụng hết", `NOT_REUSABLE` "loại thùng không tái sử dụng").
   - `outOfStock = true` → chip đỏ **"Hết thùng"** + gợi ý nút đổi thùng (đã có).
3. Khi `planned = 'reused'`: thêm nút nhỏ **"Dùng thùng mới thay"** → mở popup chọn lý do (bắt buộc; "Khác" bắt buộc ghi chú) → lưu lựa chọn tạm cho kiện đó. Hiện chip "Sẽ dùng thùng mới — {lý do}" + nút "Bỏ chọn".
4. Nút **Niêm phong** của kiện: có lựa chọn tạm → gọi `sealParcel(..., { box_source: 'new', box_source_reason, box_source_note })`; không có → gọi như cũ.
5. Kiện đã niêm phong: hiện "Thùng: mới" hoặc "Thùng: tái sử dụng" từ `boxSourceUsed`; có `boxSourceOverride` thì thêm "(đổi từ tái sử dụng — {lý do})".
6. Đóng nhanh (`PackagingWorkbench.tsx`, chỗ gọi `packPlan`): chỉ cần gửi như cũ; nếu muốn, cho chọn tương tự từng dòng cân.

**Bước 3 — bắt lỗi:** `400 PACKING_BOX_SOURCE_REASON_REQUIRED` (thiếu lý do) · `409 PACKING_BOX_SOURCE_NOT_ALLOWED` (tái sử dụng cho hàng dễ vỡ) · `409 PKG_BOX_OUT_OF_STOCK` có `details.source = 'reused'` (kệ tái sử dụng vừa hết → tải lại `box-sources`) · `409 PACKING_BOX_ALREADY_CONSUMED` (kiện mở ra đóng lại — ẩn nút chọn khi `state = 'consumed'`).

**Bước 4 — báo cáo** (`PackingSettingsReports.tsx`, phần feedback): thêm thẻ **"Thùng tái sử dụng bị thay"** đọc `report.boxSource.overrides`, bảng `byReason`, `byBox`. `suggestions` có thể có thêm loại `box` (đã hiện chung với các đề xuất khác).

##### 1.2 Người gửi trên nhãn vận đơn

Đọc: [INTEGRATION_GUIDE_SHIPPING.md B.7.1 bước 4](INTEGRATION_GUIDE_SHIPPING.md).

1. `fe/src/api/shipping.api.ts`: type `ShippingSettings` thêm `sender: { name: string|null; phone: string|null; address: string|null }`; `updateShippingSettings` nhận thêm `sender_name?`, `sender_phone?`, `sender_address?`.
2. Màn cài đặt vận chuyển (Store Owner/Admin): thêm 3 ô **Tên người gửi / SĐT / Địa chỉ kho gửi**, điền sẵn từ `GET`. Ghi chú dưới form: "Bỏ trống → nhãn dùng tên + địa chỉ kho".
3. Nhãn in ra đã có khối NGƯỜI GỬI — nút in nhãn hiện tại không phải sửa.

##### 1.3 In tem và phiếu kho

Đọc: [INTEGRATION_GUIDE_WAREHOUSE.md PHẦN B9](INTEGRATION_GUIDE_WAREHOUSE.md). Dùng lại `openShippingDocument(path)` trong `fe/src/api/shipping.api.ts` (nó gọi `apiRequestBlob` rồi mở tab mới) — có thể đổi tên thành `openPdfDocument` cho đúng nghĩa.

| # | Màn | Thêm nút | Gọi |
|---|---|---|---|
| 1 | Quản lý kho → danh sách khu | **In tem ô** (mỗi khu) | `/documents/bin-labels/{warehouseId}?zone_id={zoneId}` |
| 2 | Quản lý kho → dòng 1 ô | **In lại tem** | `/documents/bin-labels/{warehouseId}?bin_ids={binId}` |
| 3 | SKU nội bộ (chọn nhiều dòng) | **In tem SKU** + ô "số bản" (1–50) | `/documents/sku-labels?codes={mã1,mã2}&copies={n}` (nhớ `encodeURIComponent` từng mã) |
| 4 | Lấy hàng (Warehouse Staff, màn Picking List) | **In danh sách lấy hàng** | `/documents/picking-list/{warehouseId}/{groupId}` |
| 5 | Phiếu nhập: sau khi tạo + trong chi tiết phiếu | **In phiếu nhập** | `/documents/stock-receipt/{warehouseId}/{receiptId}` |

Bắt lỗi (JSON như mọi route): `DOC_NO_BINS` "Khu chưa có ô nào", `DOC_TOO_MANY_LABELS` "Quá 500 tem — in theo từng khu", `DOC_NO_CODES`, `WH_RECEIPT_NOT_FOUND`.

---

#### 2. Lô hàng (FIFO) — ✅ ĐÃ XONG (23/10/2026, FE của Việt đồng bộ ở AOFP-185)

Đối chiếu code 23/10: Picking List hiện lô xuất trước (`oldest_lot`) ở `AdminWarehousePage.tsx` và màn lấy hàng `WarehousePage.tsx`; tab Tồn theo lô (`listStockLots`), danh sách + chi tiết phiếu nhập (`listStockReceipts`, `getStockReceipt`) ở `WarehouseInventoryPage.tsx`. **Chỉ còn** nút **In phiếu nhập** trong chi tiết phiếu (mục 1.3 dòng 5). Bảng dưới giữ để tra cứu.

BE: [INTEGRATION_GUIDE_WAREHOUSE.md PHẦN B8](INTEGRATION_GUIDE_WAREHOUSE.md). Đã có: form phiếu nhập (`createStockReceipt`), "Nhập thêm hàng" có ngày nhập + mã lô, xem lô của 1 dòng SKU trên ô (`listAssignmentLots`) — đều ở `WarehouseInventoryPage.tsx`.

| # | Việc | Làm ở đâu |
|---|---|---|
| 1 | **Picking List hiện lô xuất trước** "Lô LO-2610 · nhập 01/10" dưới mã ô (cả ô chính và `other_bins`) | `fe/src/api/warehouse.api.ts` → `mapPickingListItem` + `mapOtherBins`: đọc thêm `oldest_lot { lot_code, received_at, quantity_remaining }` (có thể `null`); type `WarehousePickingListItem`, `OtherBin` thêm `oldest_lot`; hiện ở bảng Picking List trong `AdminWarehousePage.tsx` (~dòng 2780) và màn lấy hàng của Warehouse Staff |
| 2 | **Màn "Tồn theo lô" của kho**, lọc SKU / mã lô | Hàm `listStockLots` **đã có, chưa màn nào dùng** → thêm tab trong `WarehouseInventoryPage.tsx` |
| 3 | **Danh sách phiếu nhập** + bấm xem chi tiết | Hàm `listStockReceipts` **đã có, chưa dùng**; thêm hàm `getStockReceipt(warehouseId, receiptId)` → `GET /warehouse/warehouses/:warehouseId/receipts/:receiptId`; chi tiết có nút **In phiếu nhập** (mục 1.3) |

---

#### 3. Dọn mã chết

Các hàm dưới đây **không màn nào gọi**, phần lớn trỏ tới route BE **đã gỡ** (gọi sẽ 404). Xoá để khỏi bị dùng nhầm:

| File | Xoá |
|---|---|
| `api/packaging.api.ts` + `types/packaging.ts` | Cả 2 file (route `/order-groups/:id/packaging*` đã gỡ 04/10) |
| `api/order-groups.api.ts` | `packOrderGroup` (`/fulfillment/pack` đã gỡ), `retryLazadaPack` + `mapLazadaPackInfo` (`/lazada-pack/retry` đã gỡ 10/10); giá trị `'pack'` trong `postFulfillmentTransition` |
| Còn sót trong code | `packagingConsumption`, `activePackagingRecommendation`, `LAZADA_PACK_STATUSES` (8 chỗ — tìm bằng grep) |

Sau khi xoá: tìm trong `fe/src` không còn `/packaging/`, `/fulfillment/pack`, `/lazada-pack` (trừ `/packaging/boxes|bags|materials` là danh mục, vẫn đúng).

---

#### 4. Tuỳ chọn

- **Chi tiết 1 sản phẩm** Product Master: `GET /product-master/:id` (chưa có hàm). Danh sách, lọc "chưa đo", lưu kích thước đóng gói **đã có**.
- **Bảng điều khiển** (`DashboardPage.tsx`): khối báo cáo đóng gói + tiết kiệm vật tư đã dùng API thật; các khối doanh thu theo kênh / tài chính / thống kê nhân viên vẫn đọc `data/dashboard-mock.ts` — **BE không có API tương ứng**, giữ nguyên nhưng nên ghi chú "số liệu mẫu" trên màn.
- `data/admin-mock.ts` (`defaultAiPackagingParams`) và `data/cartons.ts` (dựng cảnh 3D): dữ liệu tĩnh hợp lệ, không cần đổi.

---

#### 5. Nghiệm thu phần còn lại

Code đã nối (25/10). Các ô dưới đây là **bấm thử với dữ liệu thật** — chưa chạy trong phiên này.

- [x] Kiện thường, kệ tái sử dụng còn hàng → chip "Lấy ở kệ tái sử dụng"; niêm phong → kiện hiện "Thùng: tái sử dụng", trang Vật tư: cột Tái sử dụng giảm 1.
- [x] "Dùng thùng mới thay" mà không chọn lý do → không gửi được; có lý do → cột Mới giảm 1, kiện hiện "(đổi từ tái sử dụng — …)".
- [x] Kiện có hàng dễ vỡ → chip "Lấy thùng mới · hàng dễ vỡ", không có nút đổi.
- [x] Lưu người gửi → nhãn có khối NGƯỜI GỬI; xoá trắng → nhãn lấy tên + địa chỉ kho. (Form người gửi đã có ở màn quy tắc đóng gói.)
- [x] In tem ô 1 khu, tem SKU 2 bản, danh sách lấy hàng, phiếu nhập → PDF mở tab mới; quét thử tem ô ra đúng `bin_code`. (Nút in đã gắn.)
- [x] Picking List hiện lô xuất trước; màn Tồn theo lô + danh sách phiếu nhập có dữ liệu (đã có từ FE của Việt, AOFP-185).
- [x] Tìm trong `fe/src` không còn `api/packaging.api.ts`, `types/packaging.ts`, `CreateReturnForm`, `packOrderGroup`, `retryLazadaPack`. Giữ `/packaging/boxes|bags|materials`.

</details>

<details>
<summary>✅ Tóm tắt các nhóm màn đã nối trước 21/10</summary>

Đối chiếu 21/10/2026, FE đã nối đủ; chi tiết request/response vẫn ở các guide.

| Nhóm | Đã xong |
|---|---|
| Đăng nhập, người dùng, thông báo | Đủ route; "đọc hết thông báo"; 24/24 loại thông báo + điều hướng |
| Kết nối sàn, đơn hàng | Kết nối Lazada + **AURELLE**, danh sách shop, đồng bộ theo sàn (`/orders/:platform/sync`); bỏ đơn giả "demo đa sàn" |
| Cấu hình đồng bộ & gom đơn | Màn `OrderSyncSettingsPage` (xem, lưu, lịch sử) |
| Nhóm đơn, lấy hàng | Lọc + phân trang, `assigned_packer_id`, trạng thái `returning`/`canceled` (khớp enum BE), liên kết tay, giữ chỗ tồn |
| **Đóng gói** | Chuyển hết sang `packing-plan` (22 route): chấp nhận & đóng, quay lại chờ chấp nhận, quét/niêm phong/xem lại kiện lệch cân, sự cố, trả về lấy hàng, tháo kiện, đổi thùng khi đang đóng, hướng dẫn AI, gán người đóng, tóm tắt hàng chờ, cài đặt + báo cáo + feedback |
| Danh mục thùng/túi/vật tư | `/packaging/boxes|bags|materials` (+ quy tắc), `/packaging-materials` (mua, dùng nội bộ, lịch sử, khôi phục, tiết kiệm) |
| Giao hàng + GHN | Hãng, báo giá, so phương án đóng gói, chiến lược, tạo vận đơn có chọn hãng, giao chung chuyến, lịch lấy hàng, đặt/huỷ/đồng bộ/nhãn A5/sửa địa chỉ GHN, nút mô phỏng GHN, quét quá hạn; 8/8 trạng thái vận đơn; ẩn nút giao tay khi `carrierManaged`; in phiếu đóng gói / nhãn / bảng kê |
| Hoàn hàng | Đủ 12 route: tạo, duyệt/từ chối, **huỷ phiếu**, nhận, kiểm hàng **có thu hồi vật tư A/B/C**, cách ly, đơn đổi; kho nhận kiện hoàn theo vận đơn (`receive-return`). 21/10: form giả lập ẩn nhóm AURELLE (BE chặn `RMA_MARKETPLACE_MANAGED`), chi tiết phiếu hiện "Khách tự yêu cầu trên AURELLE · #`externalRef`" |
| Lô hàng (FIFO) | 23/10 (FE Việt, AOFP-185): lô xuất trước trên Picking List (2 màn), tab Tồn theo lô, danh sách + chi tiết phiếu nhập |
| Website AURELLE (storefront) | 23/10: thanh tiến trình đơn 7 bước + tự tải lại (BE + website, không dính FE OptiPack). 21/10: trang đơn hiện tên hãng vận chuyển (`carrier`); Admin sản phẩm khóa ô tồn của biến thể `stockSource = optipack` (nhãn "Kho OptiPack") |
| Kho, SKU nội bộ, Product Master | Kho/khu/ô/kệ + sửa/tắt/xoá hẳn (cả dãy kệ), gợi ý ô, gán/sửa gán/chuyển/kiểm kê/lịch sử, Picking List; SKU nội bộ (sửa, xoá hẳn, thay mã, nối SKU sàn, gộp tồn); màu; danh mục; Product Master (danh sách, đồng bộ, lọc chưa đo, lưu kích thước đóng gói); tồn khả dụng |
| Checklist 25/10 | Đã nối nốt: ngừng dùng/dùng lại SKU sàn, chip tự nối, gập đôi chỉ quần áo, xác nhận ô thứ 2 (gán + kiểm hoàn + cách ly), "Chia theo đơn", ngắt kết nối Lazada/AURELLE, xoá form trả hàng giả và mã gọi route đóng gói cũ. `tsc -b` FE sạch. Chưa đụng khung 3D (1g bước 3) và mục 4 tuỳ chọn |

</details>
