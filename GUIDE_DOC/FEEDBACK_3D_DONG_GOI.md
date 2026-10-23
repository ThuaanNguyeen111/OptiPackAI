# Phản hồi về khung 3D hướng dẫn đóng gói

Ngày: 23/10/2026. Người đọc: frontend và backend.

Đối chiếu `HUONG_DAN_3D_DONG_GOI_BACKEND.md` (22/10) với code. Hợp đồng response khớp code: enum 10 loại, đơn vị mm, `step`, `LWH|WLH`, `foldUnit`, `itemProfiles` chụp lúc tính, `manualLayout`, `fragileCushionMm`. Route, schema, tên field không đổi. Có một chỗ backend sai logic (đã sửa) và sáu điểm cần ghi rõ.

| # | Điểm | Cách xử lý | Ai làm | Trạng thái |
| --- | --- | --- | --- | --- |
| 1 | Gập đôi lọt vào loại FE không có clip gập | Backend: gập chỉ cho 6 loại quần áo | Backend | Đã sửa |
| 2 | `folded:false` không có nghĩa ô bằng số đo hồ sơ | Sửa câu trong guide | Backend | Đã sửa guide |
| 3 | Đệm món dễ vỡ bị nhân đôi khi gập, và kéo giãn mesh làm méo | Ghi công thức; FE scale đều | Backend ghi, FE làm | Đã ghi |
| 4 | Số đo hồ sơ không phụ thuộc file `.glb` | Ghi nguyên tắc | Backend | Đã ghi |
| 5 | Túi zip không cộng độ dày vào ô | FE vẽ túi mỏng nằm trong ô | FE | Đã ghi |
| 6 | Một món có thể được nhiều món đỡ | FE suy danh sách món đỡ | FE | Đã ghi |
| 7 | Sửa hồ sơ xong kế hoạch cũ không tự đổi | Cờ `plan.profileStale` trong `GET .../packing-plan` | Backend làm, FE hiện banner | Đã sửa |

## 1. Gập đôi chỉ cho quần áo (đã sửa)

**Vấn đề.** Guide nói dép và phụ kiện không có clip gập, nhưng backend vẫn cho `folded:true`. `product-master.service.ts` chỉ chặn `shoes`. `expandToUnits` đặt `foldable` theo cờ `can_fold_in_half` mà không xét loại. Seed demo đặt `can_fold_in_half = có túi zip`, nên `DEMO-SANDAL-39` bị gập.

**Đã sửa.**
- `FLAT_CATEGORIES` (6 loại: `t_shirt`, `shirt`, `jacket`, `shorts`, `trousers`, `dress`) được export từ `packaging/engine/units.ts`.
- Lưu hồ sơ SKU: bật `can_fold_in_half` với loại khác 6 loại này trả 422 `PM_FOLD_NOT_ALLOWED` (trước đây chỉ `shoes`).
- `expandToUnits`: `foldable = loại nằm trong FLAT_CATEGORIES && can_fold_in_half`. Hồ sơ cũ lỡ bật cờ cho dép hay phụ kiện cũng không còn gập. Không cần migration. Kế hoạch đã tính trước đó giữ nguyên cho tới khi tính lại.
- Seed `seed-ai-guide-demo.ts`: chỉ quần áo trong túi mới gập.
- Test hợp đồng: `packing/solver/contract-3d.spec.ts`.

**Với FE.** `folded:true` chỉ xuất hiện ở 6 loại quần áo. Không cần clip `FoldHalf` cho giày, dép, phụ kiện, khác.

## 2. `folded:false` không phải "bằng hồ sơ"

Guide cũ ghi ô xấp xỉ số đo hồ sơ khi `folded:false`. Không chính xác. `orientation` `WLH` hoán đổi `dx` và `dy`. Món dễ vỡ cộng thêm `2 × đệm` (mặc định 10 mm) mỗi chiều. FE đọc `orientation`, `dx`, `dy`, `dz`, không suy từ hồ sơ. Guide §6 đã sửa.

## 3. Đệm và gập

`foldUnit` chạy sau khi đã cộng đệm. Cạnh dài hơn chia đôi, độ dày nhân 2, nên đệm cũng nhân đôi. Với món dễ vỡ gập được: `dz = 2 × (dày + 2 × đệm)`. Backend giữ hành vi này vì hình học đã qua validator và CP-SAT. Hiện chỉ quần áo gập được, và quần áo không dễ vỡ, nên trường hợp này chưa xảy ra. Guide ghi để sau này không bất ngờ.

FE: không kéo giãn mesh theo từng trục để khít ô, vì làm méo model. Scale đều theo trục lớn nhất, dùng `x, y, z, dx, dy, dz` để định vị. Hàng cứng (giày, dép, phụ kiện) càng không được kéo giãn.

## 4. Số đo hồ sơ không phụ thuộc model

Guide cũ nói quần demo 38×30×6 cm "là tư thế nghỉ của file quần". Đó là dữ liệu demo chọn cho khớp file. Hồ sơ thật do kho đo gói thực tế (đã gấp, đã vào túi). FE co giãn model theo ô, không yêu cầu backend chỉnh số đo cho hợp model. Số demo giữ nguyên, chỉ dùng cho demo.

## 5. Túi zip không có độ dày

Engine không cộng độ dày túi vào `dx, dy, dz` (guide §3.2). Nếu FE vẽ túi bao ngoài món, lớp túi chồng lấn mép món kề bên khi xếp sát. FE vẽ túi mỏng nằm trong ô (thu vào vài mm), không phình ra ngoài. Không đổi engine.

## 6. Món đỡ

Guide §4 mô tả "chồng khi `z_dưới + dz_dưới = z_trên` và hình XY giao nhau". Đúng với một món đỡ, nhưng validator cho phép một món đỡ bởi nhiều món (cộng diện tích đỡ, `validator.ts` `directSupporters`). Ví dụ áo vắt qua hai hộp giày. FE suy danh sách món đỡ: mọi món có `z + dz` bằng `z` của món trên và XY giao nhau. Món đỡ luôn có `step` nhỏ hơn món nằm trên (test `contract-3d.spec.ts` khóa điều này). Không thêm field `restsOn` vào response.

## 7. Kế hoạch cũ không tự cập nhật loại hàng (đã xử lý bằng cờ `profileStale`)

**Vấn đề.** `itemProfiles` chụp lúc tính. Sửa hồ sơ SKU xong, kế hoạch đã ghi vẫn mang loại cũ, và frontend không có dấu hiệu nào cho biết. Hình 3D có thể dựng sai loại (khối thay vì model quần).

**Đã làm.** `GET /order-groups/:groupId/packing-plan` trả thêm `plan.profileStale: boolean`.
- `true` khi có hồ sơ SKU trong kế hoạch có `profile_confirmed_at` mới hơn thời điểm tạo kế hoạch (`created_at`).
- Chỉ xét kế hoạch `ready` và `approved`. Các trạng thái khác luôn `false`, vì đã niêm phong kiện thì không tính lại được.
- Một truy vấn `$in` theo `platform + shop_id + seller_sku` (dùng index unique sẵn có). Không migration, không route mới.
- Chỉ route GET tính cờ. Route ghi trả `false`.

**Với FE.** Đọc `plan.profileStale` từ GET. Khi `true` hiện banner "Hồ sơ SKU đã đổi sau khi tính kế hoạch, nên tính lại" kèm nút gọi `POST .../recompute` (đã có). Sau khi tính lại, kế hoạch mới có `created_at` mới hơn nên cờ tự về `false`.

**Chấp nhận.** Báo nhầm khi kho xác nhận lại hồ sơ mà không đổi giá trị: bấm Tính lại cho kết quả y như cũ, không hại. Kế hoạch đang đóng (`packing`) không được báo, kể cả khi hồ sơ đã đổi.
