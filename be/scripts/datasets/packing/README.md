# Dataset đóng gói v1

## Chạy pipeline

Từ PowerShell, tại thư mục `be`:

```powershell
npm.cmd run dataset:packing -- generate --orders=300 --seed=20261117
npm.cmd run dataset:packing -- evaluate --input=scripts/datasets/packing/v1.jsonl --report=scripts/datasets/packing/results-v1.json
npm.cmd run dataset:packing -- check
```

`generate` tạo JSONL tái lập với 70% train, 15% validation và 15% test; mỗi split dùng seed riêng. Mỗi dòng chứa đầu vào món, danh mục thùng, tùy chọn solver, phiên bản schema, split và điều kiện “mọi món đều phải được xếp”. `evaluate` replay từng case qua solver, kiểm validator độc lập, rồi ghi kết quả theo từng case và split.

## Dùng dữ liệu

v1 là dữ liệu tổng hợp, phù hợp để kiểm độ ổn định, luật cứng và hiệu năng. Nó **chưa phải nhãn để học ưu tiên đóng gói**: số kiện/giá solver tự tạo không thể dùng làm đáp án chuẩn cho chính solver đó. Tập test nên được giữ nguyên giữa các lần sửa rule.

Case production chỉ nên thêm sau khi có snapshot đầu vào đầy đủ và nhãn nhân viên đã xác nhận. Bản ghi hiện tại lưu dấu vân tay catalog cùng kết quả placement; dấu vân tay không khôi phục được toàn bộ lựa chọn thùng lúc solver chạy. Khi nhập case thực tế, loại bỏ thông tin nhận diện khách hàng và chia split theo nhóm đơn, không theo từng kiện.

## Đơn thật (`real-v1.jsonl`, 24/11/2026)

```powershell
npx ts-node --transpile-only -r dotenv/config scripts/export-real-orders.ts   # chỉ đọc DB, ghi real-v1.jsonl
npm.cmd run dataset:packing -- evaluate --input=scripts/datasets/packing/real-v1.jsonl --probe --report=scripts/datasets/packing/results-real-v1.json
```

- Mỗi case = 1 bài giải của kế hoạch mới nhất (1 đơn, hoặc các đơn AURELLE cùng người nhận), `source: "production"`.
- Số món lấy từ kế hoạch; hồ sơ SKU lấy từ `product_master` **hiện tại**, không phải lúc đóng. Bài có SKU chưa
  `ready` bị bỏ (lần xuất 24/11: 41 nhóm đơn → 34 case, bỏ 3).
- Danh mục thùng chụp từ `packaging_materials` lúc xuất, kèm sàn cắt hạ như `PackagingBoxService`.
- Ẩn danh: không mã đơn, không shop; SKU và nhóm đơn là mã băm ngắn. Split 70/15/15 theo nhóm đơn.
- Chưa có túi niêm phong (pipeline chỉ giải bằng thùng carton), nên kết quả có thể khác kế hoạch thật ở đơn dùng túi.
- Khoảng một nửa nhóm đơn thuộc shop demo (`DEMO-*`) — dữ liệu dựng tay nhưng đi đúng luồng thật.
- `dataset:packing -- check` (CI) chạy kèm file này: phải 0 case lỗi và 0 nhãn tối ưu mâu thuẫn.

Mốc 24/11 (`results-real-v1.json`): 34/34 hợp lệ, 0 thùng tốt hơn bị bỏ sót, 0 nhãn mâu thuẫn.

## Các bước tiếp theo

1. Xem báo cáo v1 làm baseline cho solver hiện tại.
2. Bổ sung snapshot có version của đầu vào đầy đủ khi tạo kế hoạch đóng gói.
3. Thu thập case đã chỉnh/từ chối có lý do và xác nhận phương án đóng thực tế; giữ riêng nguồn nhãn và độ tin cậy.
4. Tune các tiêu chí mềm trên train, chọn cấu hình trên validation, rồi chạy test cố định. Không học hoặc tự thay đổi các ràng buộc an toàn.
5. So cấu hình mới ở chế độ shadow trước khi đưa vào production.

Pipeline này không đọc DB, không gọi mạng và không tự huấn luyện hoặc triển khai cấu hình.
