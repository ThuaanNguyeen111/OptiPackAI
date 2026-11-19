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

## Các bước tiếp theo

1. Xem báo cáo v1 làm baseline cho solver hiện tại.
2. Bổ sung snapshot có version của đầu vào đầy đủ khi tạo kế hoạch đóng gói.
3. Thu thập case đã chỉnh/từ chối có lý do và xác nhận phương án đóng thực tế; giữ riêng nguồn nhãn và độ tin cậy.
4. Tune các tiêu chí mềm trên train, chọn cấu hình trên validation, rồi chạy test cố định. Không học hoặc tự thay đổi các ràng buộc an toàn.
5. So cấu hình mới ở chế độ shadow trước khi đưa vào production.

Pipeline này không đọc DB, không gọi mạng và không tự huấn luyện hoặc triển khai cấu hình.
