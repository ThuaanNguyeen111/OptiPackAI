# Tài liệu backend — khung 3D hướng dẫn đóng gói

Ngày: 22/10/2026 (cập nhật 23/10/2026). Người đọc: backend.

Phản hồi đối chiếu code và cách xử lý nằm ở `FEEDBACK_3D_DONG_GOI.md`. Các câu dưới đây đã sửa theo phản hồi đó.

Frontend sẽ diễn từng bước gấp một model theo loại hàng, rồi đặt model đó vào đúng ô trong thùng. Tài liệu này khóa hợp đồng dữ liệu frontend sẽ đọc. File `.glb` không đi qua backend.

## 1. Ranh giới

Engine BRKGA và CP-SAT quyết định thùng, thứ tự, tọa độ và có gập đôi hay không. Model 3D chỉ là hình minh họa của một loại hàng. Cùng loại, mọi màu và mọi size dùng chung một file.

Frontend phát hình. Backend tiếp tục trả kế hoạch như hiện tại. Không thêm collection, không thêm route upload model, không lưu đường dẫn `.glb` trong `packing_plans`.

Hướng dẫn chữ (`guide.steps`) giữ nguyên. Câu chữ và hình 3D cùng bám `placements[].step`. Route tạo guide không đổi.

## 2. Việc backend cần bảo đảm

Hồ sơ SKU kho đã xác nhận (`product_category`, kích thước cm, cân kg, `can_fold_in_half`) phải đúng trước khi tính kế hoạch. `toItemProfiles()` trong `packing-plan.service.ts` chụp loại hàng và túi zip lúc tính. Kế hoạch đã ghi không tự đổi khi sửa hồ sơ sau đó. Sửa hồ sơ xong phải tính lại kế hoạch thì hình 3D mới đổi loại.

Ánh xạ loại hàng sang file frontend:

| Hàng | `product_category` | File frontend |
| --- | --- | --- |
| Áo polo, áo thun | `t_shirt` | `/models/packing/t_shirt.glb` |
| Áo sơ mi | `shirt` | `/models/packing/shirt.glb` |
| Áo khoác | `jacket` | `/models/packing/jacket.glb` |
| Quần đùi | `shorts` | `/models/packing/shorts.glb` |
| Quần dài, jean | `trousers` | `/models/packing/trousers.glb` |
| Váy, đầm | `dress` | `/models/packing/dress.glb` |
| Giày | `shoes` | khối hoặc hộp, không clip gấp |
| Dép | `sandals` | khối, không clip gấp; backend không bao giờ gập (`folded` luôn false) |
| Phụ kiện | `accessory` | khối |
| Khác hoặc null | `other` hoặc null | khối đúng kích thước ô |

Không thêm mã `polo`. Áo polo dùng `t_shirt`. Thêm giá trị enum chỉ khi có một file model riêng và đã báo frontend. Enum nằm ở `be/src/common/enums/product-category.enum.ts`.

Số đo hồ sơ là gói đã gấp, đơn vị cm, do kho đo gói thực tế. Quần demo `DEMO-QUAN-JEAN-32` là 38×30×6 cm, chỉ là dữ liệu demo. Số đo không phụ thuộc file `.glb`: frontend co giãn model theo ô, backend không chỉnh số đo cho hợp model. Áo polo đo cùng cách: dài × rộng × độ dày của gói đã gấp.

Gập đôi (`can_fold_in_half`, `folded`) chỉ áp dụng cho sáu loại quần áo. Lưu hồ sơ bật gập cho loại khác bị từ chối (422 `PM_FOLD_NOT_ALLOWED`), và engine bỏ qua cờ này với loại khác.

## 3. API frontend đọc

`GET /order-groups/:groupId/packing-plan`. Kiểu `PackingPlanResponse` trong `packing-plan.controller.ts`. Đơn vị tọa độ và lòng thùng là mm. Hồ sơ SKU vẫn là cm. Quy đổi khi nở món là `cmToMmCeil()` trong `be/src/modules/packaging/engine/units.ts`: cm nhân 10 rồi làm tròn lên.

### 3.1. Lòng thùng

```json
"box": {
  "code": "SAMPLE-M",
  "name": "Thùng M",
  "innerMm": { "lengthMm": 300, "widthMm": 250, "heightMm": 200 }
}
```

`lengthMm` là trục X, `widthMm` là trục Y, `heightMm` là trục Z. Frontend vẽ vỏ thùng từ ba số này. Kích thước ngoài (`outerMm`) chỉ để xem, không để đặt món.

### 3.2. Một ô đặt

```json
{
  "itemKey": "DEMO-QUAN-JEAN-32#1",
  "sku": "DEMO-QUAN-JEAN-32",
  "step": 1,
  "x": 0,
  "y": 0,
  "z": 0,
  "dx": 380,
  "dy": 300,
  "dz": 60,
  "orientation": "LWH",
  "folded": false
}
```

| Field | Ý nghĩa backend phải giữ |
| --- | --- |
| `itemKey` | Một đơn vị vật lý. Hai cái cùng SKU là `SKU#1` và `SKU#2` (`expandToUnits`). Frontend diễn từng key, không gộp theo SKU. |
| `sku` | Khóa sang `itemProfiles`. |
| `step` | Thứ tự đặt, bắt đầu từ 1 trong kiện. Frontend diễn đúng thứ tự này. |
| `x, y, z` | Góc dưới-trái-đáy của ô, mm, trong lòng thùng. `z = 0` là đáy. |
| `dx, dy, dz` | Kích thước ô sau khi đã xoay và đã gập, mm. Với quần áo, `dz` là độ dày. |
| `orientation` | Cách các cạnh hồ sơ map vào `dx, dy, dz`. |
| `folded` | `true` khi engine đã gọi `foldUnit()` cho món này. |

`itemProfiles` là một dòng mỗi SKU, không phải mỗi `itemKey`:

```json
{
  "sku": "DEMO-QUAN-JEAN-32",
  "productCategory": "trousers",
  "zipBagCode": "DEMO-ZIP-L",
  "zipBagFolded": true
}
```

`productCategory` chọn file. `zipBagCode` và `zipBagFolded` chỉ để câu chữ và lớp túi minh họa. Engine không cộng độ dày túi vào `dx, dy, dz`. Giữ nguyên điều đó. Frontend vẽ túi mỏng nằm trong ô, không phình ra ngoài, để không chồng lấn món kề.

`manualLayout: true` là kiện nhập tay, `placements` không phải tọa độ xếp thật. Frontend không dựng 3D kiện đó. Giữ cờ này đúng nghĩa.

## 4. Hệ trục

Gốc là góc trong của thùng. X tăng theo chiều dài (`inner.length_mm`). Y tăng theo chiều sâu (`inner.width_mm`). Z tăng từ đáy lên nắp (`inner.height_mm`).

Một ô hợp lệ nằm trọn trong lòng thùng: `x ≥ 0`, `y ≥ 0`, `z ≥ 0`, `x + dx ≤ lengthMm`, `y + dy ≤ widthMm`, `z + dz ≤ heightMm`. Validator hiện đã kiểm điều này. Frontend tin các số này và không tự sửa cho vừa thùng.

Hai món chồng khi mặt trên món dưới chạm mặt dưới món trên: `z_dưới + dz_dưới = z_trên`, và hình chữ nhật XY giao nhau. Một món có thể được nhiều món đỡ cùng lúc (áo vắt qua hai hộp giày; validator cộng diện tích đỡ). Frontend suy danh sách món đỡ từ tọa độ, không giả định một món. Món đỡ luôn có `step` nhỏ hơn món nằm trên. Không có field `restsOn` trên API. Đừng thêm field nếu quy tắc này còn đúng.

Hai món cạnh nhau khi cùng `z` và hình chữ nhật XY không giao.

Câu vị trí trong guide dùng cùng trục: X chia trái / giữa / phải, Y chia trước / giữa / sau (`describePosition`). Hình 3D và câu chữ phải khớp nhau, nên backend không đảo nghĩa X với Y.

Frontend dùng Three.js, trục đứng là Y. Phía frontend tự map Z của kế hoạch sang Y của cảnh. Response giữ Z là độ cao.

## 5. `orientation`

Mã và cạnh, theo `orientedDims()`:

| Mã | `dx` | `dy` | `dz` |
| --- | --- | --- | --- |
| `LWH` | dài | rộng | dày |
| `WLH` | rộng | dài | dày |
| `LHW` | dài | dày | rộng |
| `HLW` | dày | dài | rộng |
| `WHL` | rộng | dày | dài |
| `HWL` | dày | rộng | dài |

Quần áo (`t_shirt`, `shirt`, `jacket`, `shorts`, `trousers`, `dress`) luôn nằm phẳng. `expandToUnits()` chỉ cho hai mã `LWH` và `WLH`, kể cả hồ sơ cũ ghi xoay tự do. `LWH` là để nguyên, mặt trên hướng lên. `WLH` là xoay 90° trong mặt phẳng, mặt trên vẫn hướng lên.

Giày, dép, phụ kiện có thể dùng cả sáu mã. Model mềm không được nhận `LHW`, `HLW`, `WHL`, `HWL`. Nếu một bản sửa engine gán các mã đó cho quần áo, hình sẽ dựng đứng trên cạnh vải.

## 6. `folded` và animation

Có hai mức gấp. Backend chỉ lưu mức thứ hai.

Mức 1, clip `Fold`, nằm trong file `.glb`. Model diễn từ vải trải phẳng tới gói đúng số đo hồ sơ. Backend không lưu keyframe, không lưu thời lượng. Tư thế nghỉ của file đã là gói hồ sơ.

Mức 2, `folded: true`, là `foldUnit()`:

- Cạnh dài hơn trong dài và rộng chia đôi, làm tròn lên.
- Cạnh kia giữ nguyên.
- Độ dày nhân 2.
- Cân không đổi.
- Chỉ bật khi nhờ gập mới xếp được vào thùng nhỏ hơn.

Ví dụ hồ sơ 380×300×60 mm. Cạnh dài hơn là 380. Sau gập: 190×300×120 mm, `folded: true`. Frontend phát `Fold` trước, rồi `FoldHalf` cho tới ô 190×300×120.

`folded: false` thì frontend dừng sau `Fold`. Ô placement là số đo hồ sơ quy ra mm, sau khi xoay theo `orientation` (`WLH` hoán `dx` và `dy`) và cộng đệm nếu món dễ vỡ. Frontend đọc `orientation`, `dx`, `dy`, `dz`, không suy từ hồ sơ.

Đừng dùng `folded` cho việc "đã gấp vào túi". Gấp túi là `zipBagFolded`.

## 7. Số đo ô có thể lớn hơn hồ sơ

Món `is_fragile` được cộng đệm mỗi mặt trước khi xếp. Mặc định `DEFAULT_FRAGILE_CUSHION_MM = 5`, tức mỗi chiều thêm 10 mm (`2 * cushion`). Số này chụp trong `solver.options.fragileCushionMm` của kế hoạch. Ô `dx, dy, dz` của món dễ vỡ là số đo đã cộng đệm, không phải số cm trên hồ sơ.

Frontend scale đều model theo trục lớn nhất của ô và dùng `x, y, z` để định vị, không kéo giãn từng trục (làm méo model). Đệm làm hình hơi lớn hơn hàng thật.

`foldUnit` chạy sau khi cộng đệm, nên với món dễ vỡ gập được, `dz = 2 × (dày + 2 × đệm)`. Hiện chỉ quần áo gập được và quần áo không dễ vỡ, nên chưa xảy ra. Backend giữ đệm trong hình học như hiện tại. Đổi số đệm mặc định làm các kế hoạch tính lại có ô khác kích thước. Kế hoạch cũ giữ số đã chụp.

`cmToMmCeil` làm tròn lên từng cạnh. Hồ sơ 38 cm thành 380 mm. Hồ sơ 28,1 cm thành 281 mm. Frontend không tự nhân 10 từ cm.

## 8. Trình tự một kiện, để backend hình dung phía hình

Quần `trousers`, ô `0,0,0`, `380×300×60`, `folded: false`, `step: 1`. Áo polo `t_shirt`, ô `0,0,60`, `360×260×50`, `folded: false`, `step: 2`. Lòng thùng cao hơn 110 mm.

1. Tải `trousers.glb`. Phát `Fold`. Đặt mesh khít 380×300×60, đáy tại `z = 0`.
2. Tải `t_shirt.glb`. Phát `Fold`. Đặt khít 360×260×50, đáy tại `z = 60`, tức lên trên quần vì `0 + 60 = 60` và hai hình chữ nhật XY giao nhau.
3. Quần giữ nguyên trong lúc áo đang gấp và rơi xuống.
4. Sau món cuối, frontend vẽ xốp theo `materials`, rồi nắp và keo. Các thứ này không có trong `placements`.

Nếu áo có `folded: true`, bước 2 phát thêm `FoldHalf` và ô áo là kích thước đã gập, độ dày gấp đôi.

Hai chiếc quần cùng SKU là hai `itemKey`, hai step, có thể hai ô khác nhau, cùng một file `trousers.glb`.

## 9. Những field và hành vi cần giữ nguyên

- Tên field camelCase trên response: `innerMm`, `lengthMm`, `itemKey`, `productCategory`, `zipBagFolded`, `manualLayout`.
- Đơn vị mm trên placement và lòng thùng.
- `step` tăng trong một kiện, mỗi món một step.
- `itemKey` dạng `sku#số`, số bắt đầu từ 1.
- `z` là độ cao, gốc ở đáy thùng.
- Quần áo chỉ `LWH` hoặc `WLH`.
- `folded` chỉ có nghĩa `foldUnit()` đã chạy.
- `itemProfiles` chụp lúc tính kế hoạch, một dòng mỗi SKU.
- `manualLayout: true` nghĩa là không có tọa độ dùng được.
- Tính lại, đổi thùng, chuyển món ghi placement mới qua cùng kiểu response. Frontend chỉ đọc lại kế hoạch.

Sửa tên field, đổi mm sang cm, hoặc đảo X với Y làm hình lệch câu hướng dẫn và lệch validator.

## 10. Nằm ngoài phạm vi backend

- Xuất và lưu `.glb`, tên clip `Fold` và `FoldHalf`.
- Vẽ thùng, túi, xốp, nắp, keo.
- Map trục Z sang trục Y của Three.js.
- Nối nút trên `/app/packing`.
- Đổi thuật toán để "khớp hình". Hình khớp ô. Ô không khớp hình.
