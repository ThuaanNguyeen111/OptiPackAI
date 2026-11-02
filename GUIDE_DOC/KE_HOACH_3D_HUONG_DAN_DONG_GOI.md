# Kế hoạch dựng hình hướng dẫn đóng gói 3D

> **Ngày:** 30/10/2026. Tài liệu này để backend và frontend làm cùng một hướng.
> API đóng gói đầy đủ vẫn ở `INTEGRATION_GUIDE_PACKING.md`. File này chỉ nói phần **hình 3D từng bước** trên màn đóng gói.
> **Phạm vi:** backend gần như xong. Việc còn lại là frontend đọc dữ liệu đã có và xếp model có sẵn. Không thêm API mới để bắt đầu.

---

## 1. Kết quả cần có

Nhân viên kho bấm lấy xong. Trong khoảng 10 giây, hệ thống tính kế hoạch đóng gói cho đúng đơn đó. Màn đóng gói tải model 3D của từng món và của thùng đã chọn, rồi cho người đóng xem từng bước:

1. Chuẩn bị thùng và danh sách vật tư.
2. Gấp đôi món nếu thuật toán đã gấp.
3. Cho vào túi zip nếu hồ sơ SKU có túi.
4. Đặt món vào đúng chỗ trong thùng.
5. Gập nắp.

Cạnh hình là câu hướng dẫn của đúng bước đang xem.

Ví dụ một đơn có 1 áo polo và 1 quần dài vừa một thùng: màn hình lấy `polo.glb`, `pants.glb` và file thùng đúng mã `SAMPLE-*`, rồi xếp hai món vào lòng thùng theo tọa độ backend trả về.

---

## 2. Ai làm gì

| Việc | Backend | Frontend |
| --- | --- | --- |
| Tính thùng, số kiện, tọa độ, hướng xoay, có gấp đôi hay không | Đã có | Không tính lại |
| Chọn file `.glb` | Không làm | Làm, bảng cứng trong mục 6 |
| Xếp model vào thùng, chạy các bước | Không làm | Làm |
| Viết câu hướng dẫn | Đã có API | Gọi khi mở kiện |
| Tự viết câu lúc kế hoạch vừa xong | Tùy chọn, mục 8 | Không chờ việc này |

Backend không biết thư mục `fe/public/models`. Frontend không được tự chọn thùng khác với `box.code` trong kế hoạch.

---

## 3. "AI" trong dự án này là gì

Có hai phần, không trộn:

1. **Thuật toán xếp hộp** (BRKGA trong backend, và CP-SAT khi có `PACKER_URL`) quyết định thùng, vị trí, xoay, thứ tự, có gấp đôi hay không.
2. **Mô hình ngôn ngữ** (Groq, khi có `AI_API_KEY`) chỉ viết lại câu chữ từ các dữ kiện đó. Không có key, hoặc câu trả về sai, hệ thống dùng câu mẫu. Nhãn trên màn: `guide.source = "ai"` thì hiện model; `"template"` thì hiện "Câu mẫu". Cả hai đều dùng được.

Mô hình ngôn ngữ không được đổi vị trí, hướng xoay, tập món, hay số bước.

Trang Admin "Tham số AI" (`/app/admin/ai`) là form giả, không nối API này. Đừng đọc timeout / tỷ lệ lấp đầy trên trang đó để vẽ hình.

---

## 4. Khi nào có hình, khi nào không

Frontend chỉ dựng cảnh thật khi **đồng thời**:

- `GET /order-groups/:groupId/packing-plan` trả về một kế hoạch (`plan` khác `null`).
- Kiện đang xem có `manualLayout: false`.
- `placements` có ít nhất một món, và không phải trường hợp mọi món nằm ở `0, 0, 0` của kiện nhập tay.

Ba trường hợp sau **không** lấy model thế vào:

| Tình huống | Dữ liệu | Màn hình |
| --- | --- | --- |
| Mới lấy xong, job chưa tính xong | `plan` null hoặc trạng thái nhóm chưa có kế hoạch `ready` | "Đang tính", tải lại khoảng mỗi 3 giây |
| SKU chưa có hồ sơ đóng gói `ready` (thiếu số đo hoặc chưa xác nhận) | Kế hoạch `failed`, nhóm có `packingBlocked` | Giữ tab "Kẹt — SKU chưa đo" và link hồ sơ SKU. Model áo quần không phải số đo |
| Kiện nhập tay mà bộ giải không xếp được | `manualLayout: true`. Mọi món ghi `x = y = z = 0`, `orientation = "LWH"`, `folded = false` | Chỉ liệt kê SKU. Vẽ model ở góc đó sẽ trông như một cách xếp thật |

SKU chưa đo: kho xác nhận hồ sơ (dài, rộng, cao, cân, loại hàng, túi zip nếu có). Backend tự xóa cờ kẹt và tính lại. Frontend chỉ cần tải lại kế hoạch.

---

## 5. Hợp đồng dữ liệu frontend phải đọc

Route: `GET /order-groups/:groupId/packing-plan`. Response bọc trong `{ plan }`. Field camelCase.

Hiện `fe/src/types/packing-plan.ts` **cắt mất** các field dưới đây. Việc đầu tiên của frontend là map chúng vào type, không đổi backend.

### 5.1 Trên từng kiện `plan.parcels[]`

```ts
box: {
  code: string          // "SAMPLE-S" | "SAMPLE-M" | "SAMPLE-L" | "SAMPLE-LT" hoặc mã thùng kho đã tạo
  name: string
  innerMm: { lengthMm, widthMm, heightMm }  // lòng thùng — dùng để co model thùng
  outerMm: { lengthMm, widthMm, heightMm }
}
manualLayout: boolean
fillRatio: number
placements: {
  itemKey: string       // "SKU#1", "SKU#2" — hai cái cùng SKU là hai món
  sku: string
  step: number          // thứ tự đặt, bắt đầu từ 1
  x: number             // mm, góc gần gốc của món
  y: number
  z: number
  dx: number            // mm, kích thước SAU KHI đã xoay, theo trục x/y/z
  dy: number
  dz: number
  orientation: 'LWH' | 'WLH' | 'LHW' | 'HLW' | 'WHL' | 'HWL'
  folded: boolean       // true = thuật toán đã gấp đôi để vừa thùng nhỏ hơn
}[]
materials: { name: string; quantity: number; code: string | null; unit: string }[]
guide: {
  source: 'ai' | 'template'
  model: string | null
  fallbackReason: string | null
  summary: string
  steps: { step: number; instruction: string; tip: string | null }[]
} | null
```

`materials` chỉ có số lượng. Không có tọa độ. Không nhét xốp, túi khí, tấm ngăn, băng keo vào khoảng trống trong thùng.

### 5.2 Trên kế hoạch `plan.itemProfiles[]`

Nối với `placements` theo `sku` (không theo `itemKey`). Hai món cùng SKU dùng chung một hồ sơ.

```ts
itemProfiles: {
  sku: string
  productCategory: string | null   // xem mục 6
  zipBagCode: string | null        // có mã = bước túi zip
  zipBagFolded: boolean            // gập đôi túi sau khi cho hàng vào
}[]
```

### 5.3 Hệ trục

Người đóng đứng trước thùng. Đơn vị mm, số nguyên.

- `x`: chiều dài, trái → phải
- `y`: chiều rộng, phía người đóng → phía sau
- `z`: hướng lên

`orientation` là thứ tự cạnh gốc của gói đã đo (L dài, W rộng, H cao) nằm dọc theo trục x, y, z.

- `LWH`: dài theo x, rộng theo y, cao theo z
- `WLH`: rộng theo x, dài theo y, cao theo z

`dx`, `dy`, `dz` đã là kích thước khối chiếm chỗ sau khi xoay. Đặt model sao cho hộp bao quanh đúng khối đó, góc min tại `(x, y, z)`.

Hàng mềm (áo, quần, váy, khoác) kéo giãn theo từng trục cho khít khối `dx × dy × dz`. Hàng cứng (giày, dép) thu phóng đều, không méo. Không có file model thì vẽ một khối màu đúng kích thước đó.

### 5.4 Câu hướng dẫn

```
POST /order-groups/:groupId/packing-plan/parcels/:parcelNo/guide
Role: Packaging Staff, Warehouse Staff, Admin
Body: { "regenerate": false }     // true = viết lại
→ { "plan": … }                   // đọc plan.parcels[n].guide
```

- Gọi một lần khi mở kiện nếu `guide` đang `null`.
- Nút "Viết lại" gửi `regenerate: true`.
- Không tăng `plan.version`.
- Tối đa 10 lần/phút. Quá thì `429`.
- Kiện `manualLayout: true` → `409 PACKING_GUIDE_NOT_AVAILABLE`. Không gọi lại liên tục.
- `step` trong `guide.steps` khớp `placements[].step`. Hiện câu của bước đang xem.

---

## 6. Bảng file model (chỉ frontend)

File nằm trong `fe/public/models/`, trình duyệt tải bằng đường dẫn `/models/<tên>.glb`.

| Dữ liệu trên kế hoạch | File |
| --- | --- |
| `box.code = SAMPLE-S` | `/models/sampleS.glb` |
| `SAMPLE-M` | `/models/sampleM.glb` |
| `SAMPLE-L` | `/models/sampleL.glb` |
| `SAMPLE-LT` | `/models/sampleLT.glb` |
| `productCategory = shirt` | `/models/polo.glb` |
| `trousers` | `/models/pants.glb` |
| `t_shirt` | `/models/tshirt.glb` |
| `shorts` | `/models/shorts.glb` |
| `dress` | `/models/dress.glb` |
| `jacket` | `/models/bomber.glb` |
| `shoes` | `/models/shoepack.glb` |
| `sandals`, `accessory`, `other`, hoặc `productCategory` null | Khối màu, không cần file |
| Mã thùng không có trong bảng | Vẽ thùng bằng code theo `innerMm` |

Không có loại `polo`. Áo polo trên kho phải gắn `productCategory = "shirt"` thì mới ra `polo.glb`. Hai SKU cùng loại dùng chung một file. Mỗi món scale theo `dx`, `dy`, `dz` của chính nó.

Các file `shirt.glb`, `trousers.glb`, `backpack.glb`, `hat.glb`, `glasses.glb` đang phục vụ trang giới thiệu (`Hero3DCanvas`, `utils/packing-scene.ts`). Không đưa vào bảng này và không ghi đè. Áo thun dùng cho đóng gói là file riêng `tshirt.glb`.

Mã thùng do seed mẫu là `SAMPLE-S` (lòng 200×150×100 mm), `SAMPLE-M` (350×250×200), `SAMPLE-L` (500×400×350), `SAMPLE-LT` (500×400×200). Kho có thể có mã khác. Khi đó dùng nhánh "vẽ thùng bằng code".

Một đơn có thể nhiều kiện. Mỗi kiện một thùng và một danh sách `placements`. Không giả định hai món luôn chung một thùng.

---

## 7. Các bước trên giao diện

Mỗi bước một lần bấm Tiếp. `step` của món là thứ tự **đặt vào thùng**. Các thao tác gấp và túi zip là bước phụ của món đó, tính trên frontend, không có thêm field backend.

Với từng món theo `step` tăng dần:

1. Nếu `folded === true`: diễn gấp đôi. Model là một tư thế, cử chỉ gấp làm bằng code.
2. Nếu hồ sơ SKU có `zipBagCode`: hiện túi trong suốt và đường khóa. `zipBagFolded === true` thì thêm một nhịp gập túi. Túi không đổi `x, y, z`. Kích thước đặt vào thùng vẫn là `dx, dy, dz` (số đo sau gấp/bọc mà kho đã đo).
3. Đưa món tới `(x, y, z)` với kích thước `dx × dy × dz`.
4. Hiện `guide.steps` có cùng `step`. Có `tip` thì hiện dưới câu chính.

Trước món đầu: màn chuẩn bị — tên thùng, `box.code`, và danh sách `materials` (tên × số lượng). Xốp góc, tấm ngăn, màng khí, băng keo nằm ở danh sách này, không chiếm chỗ trong hình xếp.

Sau món cuối: gập nắp thùng.

Đếm ngược / khóa "đóng nhanh" và đơn hỏa tốc là việc khác, đã nối trên màn đóng gói. File này không đổi các việc đó.

---

## 8. Backend — chỉ một việc tùy chọn

Không cần route mới. Không cần chọn file GLB. Không cần gửi thêm tọa độ vật tư.

Việc tùy chọn, làm sau khi frontend đã vẽ được:

Khi kế hoạch chuyển sang `ready` và kiện có `manualLayout: false`, gọi sẵn `getOrCreateGuide` cho từng kiện. Nhân viên khỏi bấm "Viết hướng dẫn kiện". Frontend vẫn phải chịu `guide: null` (kế hoạch cũ, gọi AI lỗi giữa chừng) bằng cách tự `POST .../guide` lúc mở kiện.

Không gọi guide cho kiện `manualLayout: true`.

---

## 9. Frontend — thứ tự làm

1. Thêm vào type và mapper: `placements`, `box.innerMm`, `manualLayout`, `itemProfiles`. Giữ nguyên các field màn đang dùng.
2. Viết bảng file mục 6 trong một module, ví dụ `fe/src/components/packing/product-models.ts`.
3. Thay cảnh trong `Packing3DBoxViewer` (đang đo thùng từ chữ trên nhãn và vẽ vài khối cố định) bằng cảnh đọc `placements`. `PackagingWorkbench` truyền cả kiện và `itemProfiles`, không chỉ `boxLabel`.
4. Chặn ba trường hợp mục 4 trước khi tải GLB.
5. Xếp theo mục 5.3 và chạy bước theo mục 7.
6. Khi mở kiện, nếu `guide` null và `manualLayout` false, gọi `requestParcelGuide` một lần. Hiện câu cạnh bước hiện tại. Nút viết lại giữ `regenerate: true`.
7. Thiếu file GLB hoặc WebGL lỗi: khối màu hoặc báo trong khung hình. Không làm trắng cả trang đóng gói.

Trang giới thiệu (`Hero3DCanvas`) giữ nguyên. Animation ở đó thả model theo kịch bản có sẵn, không đọc kế hoạch.

---

## 10. Nghiệm thu

- Đơn 1 áo `shirt` + 1 quần `trousers`, kế hoạch 1 kiện `manualLayout: false`: thấy đúng hai model và đúng mã thùng, món nằm trong lòng thùng, không chồng cùng một góc.
- `folded: true`: có bước gấp trước khi đặt. `folded: false`: không có bước đó.
- SKU có `zipBagCode`: có bước túi. SKU không có: không có.
- Câu trên màn chứa đúng SKU của bước. `source: "template"` vẫn hiện câu, nhãn "Câu mẫu".
- Nhóm kẹt vì SKU chưa đo: không tải `polo.glb` / `pants.glb` để thế.
- Kiện `manualLayout: true`: danh sách chữ, không có cảnh xếp. Gọi guide trả 409 thì không vẽ.
- Đơn ra 2 kiện: đổi tab kiện thì đổi thùng và đổi tập món.
- Danh sách vật tư hiện tên và số lượng. Hình xếp không phình ra vì xốp hay túi khí.
- Tắt WebGL hoặc file GLB 404: khung 3D báo lỗi, các nút duyệt / đóng gói vẫn bấm được.

---

## 11. Không làm trong đợt này

- Không thêm loại hàng `polo` trên backend.
- Không để mô hình ngôn ngữ chọn thùng hoặc tọa độ.
- Không vẽ xốp, túi khí, tấm ngăn, băng keo thành vật có chỗ đứng trong thùng. Các thứ đó là ước lượng theo luật, không có hình học.
- Không dùng số đo mặc định khi SKU chưa `ready`.
- Không sửa trang giới thiệu cho khớp đơn hàng thật.
