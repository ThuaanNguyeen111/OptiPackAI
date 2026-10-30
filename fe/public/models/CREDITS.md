# Nguồn và giấy phép model 3D

Mọi file `.glb` trong thư mục này phải có một dòng ở đây trước khi commit. Model dùng giấy phép CC-BY thì phải hiện dòng ghi công trên giao diện, ở màn có dùng model đó.

Cột "Thông tin trong file" đọc từ phần `asset` của file GLB. Cột "Nguồn" và "Giấy phép" do người thêm file điền. Để trống nghĩa là **chưa xác minh**, chưa được commit.

## Model hướng dẫn đóng gói (màn đóng gói)

| File | Dùng cho | Thông tin trong file | Nguồn | Giấy phép |
| --- | --- | --- | --- | --- |
| `sampleS.glb` | Thùng `SAMPLE-S` | Xuất từ Blender (glTF I/O 5.2.41); node `carton_*_box` + 4 nắp `flap_*` | | |
| `sampleM.glb` | Thùng `SAMPLE-M` | Như trên | | |
| `sampleL.glb` | Thùng `SAMPLE-L` | Như trên | | |
| `sampleLT.glb` | Thùng `SAMPLE-LT` | Như trên | | |
| `polo.glb` | `productCategory = shirt` | Xuất từ Blender; có khung xương, clip `PackPolo` khoảng 13 s; kèm node tay, túi nilon, băng keo, nhãn (ẩn khi đặt vào thùng) | | |
| `tshirt.glb` | `t_shirt` | Cùng cấu trúc `polo.glb` | | |
| `pants.glb` | `trousers` | Cùng cấu trúc `polo.glb` | | |
| `shorts.glb` | `shorts` | Cùng cấu trúc `polo.glb` | | |
| `dress.glb` | `dress` | Cùng cấu trúc `polo.glb` | | |
| `bomber.glb` | `jacket` | Cùng cấu trúc `polo.glb` | | |
| `shoepack.glb` | `shoes` | Xuất từ Blender; hộp giày có 2 chiếc, giấy, túi chống ẩm | | |

## Model trang giới thiệu (`Hero3DCanvas`)

| File | Nguồn | Giấy phép |
| --- | --- | --- |
| `shirt.glb` | | |
| `trousers.glb` | | |
| `backpack.glb` | | |
| `hat.glb` | | |
| `glasses.glb` | | |

Không ghi đè các file này bằng model của màn đóng gói. Trang giới thiệu dùng tỉ lệ co chỉnh riêng cho từng file trong `fe/src/utils/packing-scene.ts`.
