# Storefront admin

Trang quản lý sản phẩm: `http://localhost:3001/admin`. Trang đăng nhập: `/admin/login`.

## Cấu hình tài khoản

Thêm vào `be/.env` (không đưa mật khẩu, hash hoặc secret lên Git):

```dotenv
STOREFRONT_ADMIN_EMAIL=admin@example.com
STOREFRONT_ADMIN_PASSWORD_HASH='<bcrypt hash>'
STOREFRONT_ADMIN_JWT_SECRET=<secret riêng, ít nhất 32 ký tự>
```

Tạo hash bằng bcrypt đã có trong dự án. Trong PowerShell, nhập mật khẩu qua prompt để không lưu mật khẩu vào lịch sử lệnh:

```powershell
$adminPassword = Read-Host 'Mật khẩu admin' -AsSecureString
$adminCredential = [System.Net.NetworkCredential]::new('', $adminPassword)
$env:STOREFRONT_PASSWORD_TO_HASH = $adminCredential.Password
node -e "require('bcrypt').hash(process.env.STOREFRONT_PASSWORD_TO_HASH, 12).then(console.log)"
Remove-Item Env:STOREFRONT_PASSWORD_TO_HASH
$adminCredential = $null
$adminPassword = $null
```

Mật khẩu nên từ 12 ký tự và không quá 72 byte UTF-8 (giới hạn bcrypt). Tạo secret riêng:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Chạy `npm run dev` tại thư mục gốc hoặc khởi động lại backend sau khi đổi cấu hình. Thiếu cấu hình sẽ không cho đăng nhập; không có tài khoản hay mật khẩu mặc định. Phiên dùng cookie HttpOnly riêng, thời hạn 8 giờ, không dùng tài khoản khách hàng hoặc OptiPack.

## Sử dụng

- Thêm sản phẩm: nhập tên, chọn danh mục có sẵn, tải ảnh, nhập giá và tồn kho, rồi lưu. Sản phẩm mới mặc định đang bán; có thể chọn bản nháp hoặc ẩn.
- Chọn ảnh đại diện bằng nút dưới ảnh. Bỏ ảnh chỉ bỏ liên kết khỏi sản phẩm; file được giữ cho lịch sử đơn hàng.
- Thêm dòng size/màu khi cần. SKU tự sinh, slug và SKU không thay đổi khi sửa. Tồn kho là tổng lượng hàng thực tế; không được thấp hơn số lượng đang giữ chỗ.
- Xóa sản phẩm hoặc bỏ biến thể sẽ ngừng bán và giữ dữ liệu cũ. Các trường ngoài form (bảng size, kích thước đóng gói, giá so sánh…) được giữ nguyên.

Ảnh JPEG/PNG/WebP, tối đa 5 MB mỗi file, 30 ảnh mỗi sản phẩm, được lưu trong collection `storefront_images` của MongoDB. Cách này phù hợp catalog nhỏ; ảnh đã bỏ và ảnh tải lên nhưng chưa lưu sản phẩm vẫn chiếm dung lượng.

## Docker / triển khai

Backend dùng MongoDB Atlas hoặc replica set như cấu hình dự án vì thao tác lưu/xóa chạy trong transaction. Docker Compose đã đọc `be/.env`; đặt hash trong dấu nháy đơn để Compose giữ nguyên các ký tự `$`. Kubernetes đọc Secret backend hiện có; giá trị hash trong Secret phải không có dấu nháy bao ngoài. Không cần volume cho ảnh.

Storefront và API cần cùng site (ví dụ `shop.example.com` và `api.example.com`), dùng HTTPS khi `NODE_ENV=production`. Thêm đúng origin của storefront vào `CORS_ORIGIN`; POST/PATCH/DELETE từ origin khác hoặc thiếu Origin sẽ bị từ chối. `NEXT_PUBLIC_API_URL` được nhúng lúc build storefront; đổi địa chỉ API phải build lại.

API quản trị nằm tại `/storefront/admin/auth/{login,me,logout}`, `/storefront/admin/products`, `/storefront/admin/products/:id` và `/storefront/admin/images`. PATCH nhận toàn bộ các trường của form, với ID cho biến thể hiện có. Ảnh được phục vụ tại `/storefront/images/:id`. Catalog công khai chỉ dùng dữ liệu backend, không tự thay bằng sản phẩm demo khi có lỗi.

## Kiểm thử

```powershell
npm run test --workspace be -- --runInBand --testPathPatterns='storefront-admin-auth|storefront-images'
```

Kiểm thử lưu/xóa/rollback/seed cần MongoDB replica set riêng. Suite luôn tạo database mới với tên `storefront_admin_test_*`, không dùng database mặc định trong URI:

```powershell
$env:STOREFRONT_ADMIN_TEST_URI = 'mongodb://127.0.0.1:27029/?directConnection=true&replicaSet=rs0'
npm run test --workspace be -- --runInBand --testPathPatterns=storefront-admin.integration
Remove-Item Env:STOREFRONT_ADMIN_TEST_URI
```
