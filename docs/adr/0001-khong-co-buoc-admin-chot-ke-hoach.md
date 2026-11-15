# Không có bước Admin chốt kế hoạch đóng gói

Khi nhóm đơn lấy hàng xong, backend tự tính kế hoạch đóng gói (cron ~10 giây), tự giao cho nhân viên đóng gói ít việc nhất và gửi thông báo; người duy nhất xác nhận là nhân viên đóng gói khi **chấp nhận** kế hoạch (xem `GLOSSARY.md`). Chúng tôi bỏ bước Admin "chốt" vì nó chỉ gọi lại đúng lệnh tính lại mà cron đã chạy, thêm một chỗ chờ người cho mọi nhóm đơn, và hàng chờ "Chờ chốt" gần như luôn rỗng vì nhóm chỉ ở `picked` vài giây.

## Hệ quả

- Không thêm lại trang `/app/admin/packing-plans` hay API "tạo/chốt kế hoạch". Link cũ chuyển hướng sang `/app/packing`; Admin dùng chung trang đó để xem, giao lại người hoặc tính lại.
- Trang này từng bị gỡ rồi quay lại qua một lần merge từ `main` (gỡ lại ở commit `efb4a82`, AOFP-292). Khi merge có xung đột ở `fe/src/App.tsx`, `AdminSidebar.tsx` hoặc `AdminPackingPlansPage.tsx`, giữ bản đã gỡ.
- Muốn có bước người duyệt trước khi đóng thì phải viết ADR mới thay thế ADR này: tắt tự tính/tự giao ở `packing-job.service.ts` và sửa `INTEGRATION_GUIDE_PACKING.md`.
