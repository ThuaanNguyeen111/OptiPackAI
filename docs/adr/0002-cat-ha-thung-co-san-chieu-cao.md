# Cắt hạ thùng để giảm cước, không cắt thấp hơn thùng thấp nhất

Ngày 08/11/2026 chúng tôi cho bộ giải cắt hạ thùng carton xuống sát chồng hàng (`cutBoxToLoad`, bỏ được ≥ 5 cm), để **giảm cân quy đổi cước** cho đơn có thể tích **kẹt giữa hai cỡ thùng**. Ví dụ đơn DEMO-3D-1 có 43,5 L hàng, thùng L thấp chỉ chứa 40 L còn thùng L chứa 70 L. Tăng tỉ lệ lấp đầy chỉ là hệ quả, không phải mục tiêu. Ngày 13/11/2026, quần áo chuyển sang tính độ dày từ GSM (khoảng 0,5–1 cm). Từ đó luật không có sàn bắt đầu cắt thùng M xuống còn 1 cm cho một chiếc áo: một khay dẹt không gập nắp được, không bảo vệ được hàng, còn tỉ lệ lấp đầy thì bị đẩy lên giả. Vì vậy chúng tôi đặt sàn: **chiều cao lòng sau cắt không thấp hơn lòng thùng thấp nhất đang dùng trong danh mục** (hiện là thùng S, 10 cm). Sàn tự đổi theo danh mục, không phải hằng số.

## Các phương án đã cân nhắc

- **Sàn cố định (vd 5 cm).** Bỏ, vì không gắn với thùng thật nào. Kho đổi danh mục thì con số thành vô nghĩa.
- **Bỏ hẳn cắt hạ.** Bỏ, vì mất phần giảm cước cho đúng loại đơn mà luật này được tạo ra để xử lý.
- **Đo lấp đầy theo thùng chưa cắt.** Bỏ. Có sàn rồi thì lấp đầy sau cắt phản ánh đúng thùng mang đi gửi.

## Hệ quả

- Hàng mềm mỏng (1–3 áo) trong thùng sẽ có lấp đầy rất thấp (5–15%). Đây là con số **thật**: những đơn này phải đi **túi niêm phong**, không phải thùng. Cảnh báo "< 80%" nói rõ lý do khi kho chưa có túi.
- Sàn đi theo thùng: `PackagingBoxService.listActiveSpecs` gắn `min_cut_height_mm` cho mọi `BoxSpec`. Kiện lưu lại `box.min_cut_height_mm` để chỉnh tay hoặc xếp lại không cắt thấp hơn. Kế hoạch tính trước 13/11 không có trường này nên không bị chặn sàn.
- Đừng thêm bậc mục tiêu "lấp đầy" hay cho phép cắt thấp hơn sàn để kéo số lấp đầy lên. Muốn đổi luật thì viết ADR mới thay ADR này.
