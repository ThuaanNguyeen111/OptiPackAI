# Nguồn và giấy phép model 3D

Mọi file `.glb` trong thư mục này phải có một dòng ở đây trước khi commit. Model dùng giấy phép CC-BY thì phải hiện dòng ghi công trên giao diện, ở màn có dùng model đó.

Cột "Thông tin trong file" đọc từ phần `asset` của file GLB. Cột "Nguồn" và "Giấy phép" do người thêm file điền. Để trống nghĩa là **chưa xác minh**, chưa được commit.

## Model hướng dẫn đóng gói (màn đóng gói)

| File | Dùng cho | Thông tin trong file | Nguồn | Giấy phép |
| --- | --- | --- | --- | --- |
| `sampleS.glb` | Thùng `BOX-S` | Xuất từ Blender (glTF I/O 5.2.41); node `carton_*_box` + 4 nắp `flap_*` | | |
| `sampleM.glb` | Thùng `BOX-M` | Như trên | | |
| `sampleL.glb` | Thùng `BOX-L` | Như trên | | |
| `sampleLT.glb` | Thùng `BOX-LT` | Như trên | | |
| `polo.glb` | Không dùng từ 01/11/2026 (loại `shirt` chuyển sang `somi.glb`) | Xuất từ Blender; có khung xương, clip `PackPolo` khoảng 21 s; kèm node tay, túi zip, túi nilon, băng keo, nhãn (ẩn khi đặt vào thùng). Mesh áo đã giảm xuống khoảng 18 nghìn tam giác | | |
| `tshirt.glb` | `t_shirt` | Dựng lại từ `polo.glb` (bỏ cổ polo, hàng nút, túi ngực; cổ tròn có viền bo); clip `PackTshirt`; cùng cấu trúc `polo.glb` | | |
| `somi.glb` | `productCategory = shirt` | Bản `tshirt.glb` cũ (áo sơ mi dài tay, clip `PackShirt`); mesh áo đã giảm xuống khoảng 18 nghìn tam giác; thêm node `shirt_card` (bìa cứng 210×247 mm sau lưng áo, tự dựng bằng Blender) | | |
| `pants.glb` | `trousers` | Cùng cấu trúc `polo.glb`; clip `PackPants`; mesh đã giảm xuống khoảng 18 nghìn tam giác | | |
| `shorts.glb` | `shorts` | Cùng cấu trúc `polo.glb`; clip `PackShorts`; mesh đã giảm xuống khoảng 18 nghìn tam giác | | |
| `dress.glb` | `dress` | Dựng lại: tấm váy hai lớp gấp bằng khung xương, kèm node `tissue_sheet` (giấy lót); clip `PackDress`; cùng cấu trúc `polo.glb` | | |
| `bomber.glb` | `jacket` | Cùng cấu trúc `polo.glb`; clip `PackBomber`; mesh đã giảm xuống khoảng 18 nghìn tam giác | | |
| `shoepack.glb` | `shoes` | Xuất từ Blender; hộp giày có 2 chiếc (mesh giày đã giảm xuống khoảng 9 nghìn tam giác), giấy, túi chống ẩm; clip `PackShoes` | | |
| `handbag.glb` | `bag` | Tự dựng bằng Blender, không dùng asset ngoài; node `bag_body`, `bag_handle`, `dustbag`, `stuffing`; clip `PackBag` 7,5 s | Tự dựng bằng Blender, không dùng asset ngoài | |
| `mailer.glb` | Kiện `box.kind = mailer` (túi niêm phong) | Tự dựng bằng Blender, không dùng asset ngoài; node `mailer_body`, `mailer_flap`, `shipping_label`; clip `PackMailer` 7,5 s | Tự dựng bằng Blender, không dùng asset ngoài | |

## Model trang giới thiệu (`Hero3DCanvas`)

| File | Nguồn | Giấy phép |
| --- | --- | --- |
| `shirt.glb` | | |
| `trousers.glb` | | |
| `backpack.glb` | | |
| `hat.glb` | | |
| `glasses.glb` | | |

Không ghi đè các file này bằng model của màn đóng gói. Trang giới thiệu dùng tỉ lệ co chỉnh riêng cho từng file trong `fe/src/utils/packing-scene.ts`.

## Model vật tư đóng gói (`materials/`)

Tự dựng bằng Blender 5.2 từ script `fe/blender/make_packing_materials.py`, không dùng asset ngoài. Đơn vị mét, trục Y hướng lên, đáy nằm ở y = 0. Chạy lại script để dựng lại cả 9 file.

| File | Dùng cho (`materials[].type` của BE) | Kích thước thật | Ghi chú |
| --- | --- | --- | --- |
| `materials/bubble_wrap.glb` | `bubble_wrap` — xốp hơi bọc hàng | 300 × 200 mm | Màng trong có bong bóng; vật liệu trong suốt |
| `materials/air_pillow.glb` | `air_pillow` — gối hơi lấp trống | 120 × 80 × 26 mm | 3 khoang phồng, có van; vật liệu trong suốt |
| `materials/fragile_label.glb` | `fragile_tape` — tem cảnh báo hàng dễ vỡ | 80 × 50 mm | Tem đỏ, ly vỡ, chữ FRAGILE / HANDLE WITH CARE; nằm phẳng, mặt hướng lên |
| `materials/foam_corner.glb` | `foam_corner` — góc xốp | 50 × 50 × 50 mm | 3 vách dày 8 mm, mở ở góc trong |
| `materials/corrugated_divider.glb` | `corrugated_divider` — vách ngăn carton sóng | 300 × 200 × 4 mm | Lộ lớp sóng ở một dải mép |
| `materials/kraft_paper.glb` | `kraft_paper` — giấy kraft vò độn | đường kính khoảng 100 mm | Bóng giấy vò |
| `materials/tissue_paper.glb` | `tissue_paper` — giấy lót | 250 × 180 mm | Chồng 3 tờ gợn sóng |
| `materials/tape_roll.glb` | Băng keo dán thùng (không có trong danh mục vật tư) | ⌀ 76 × 48 mm | Cuộn băng keo, lõi giấy |
| `materials/accessory_case.glb` | `productCategory = accessory` (hộp kính / đồ nhỏ dễ vỡ) | 160 × 60 × 80 mm | Hộp cứng có nắp, khoá gài, bản lề; bọc xốp hơi + dán băng keo trước khi đặt vào thùng |
