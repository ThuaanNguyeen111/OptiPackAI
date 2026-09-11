# OptiPackAI Backend — Integration Guide cho Frontend

Tài liệu này dành cho FE tích hợp với module **Auth/Users** — phần backend duy nhất đã hoàn thiện tại thời điểm này. Đọc tài liệu này **trước khi** đọc Swagger — Swagger cho biết "API nhận/trả gì", tài liệu này giải thích "vì sao nó hoạt động vậy, và FE cần xử lý gì thêm".

**Swagger UI (nguồn API chính thức, luôn cập nhật)**: `http://localhost:3000/api/docs`

---

## 1. Base URL & Header chung

```
Base URL: http://localhost:3000
Content-Type: application/json
Authorization: Bearer <access_token>   (cho mọi route cần đăng nhập)
```

Không có tiền tố `/api/v1` — route thật là `/auth/login`, không phải `/api/v1/auth/login`.

---

## 2. Luồng đăng nhập — QUAN TRỌNG NHẤT, đọc kỹ

`POST /auth/login` trả về **1 trong 2 dạng response khác nhau**, FE **bắt buộc** phải check field nào có mặt:

### Dạng A — Đăng nhập thành công ngay (tài khoản chưa bật MFA)
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "must_change_password": false,
  "role": 1,
  "trusted_device_token": "a1b2c3..."   // CHỈ có nếu vừa verify MFA thật (xem mục 4)
}
```

### Dạng B — Tài khoản có bật MFA, cần thêm bước
```json
{ "mfa_required": true }
```
→ FE phải hiện form nhập mã 6 số, rồi gọi LẠI `POST /auth/login` **lần 2**, thêm field `mfa_token`:
```json
{ "email": "...", "password": "...", "mfa_token": "482913" }
```

### Cách FE phân biệt 2 dạng
```ts
const res = await login(email, password);
if ('mfa_required' in res) {
  // hiện form nhập mã MFA
} else {
  // lưu access_token, refresh_token, chuyển vào app
}
```

---

## 3. `role` là SỐ, không phải chữ — bảng mapping bắt buộc phải có ở FE

| Số | Tên | Ghi chú |
|---|---|---|
| `0` | Store Owner | Xem dashboard, cấu hình quy tắc |
| `1` | Warehouse Staff | Picking, quét QR |
| `2` | Packaging Staff | Duyệt gợi ý AI đóng gói |
| `3` | Shipping Coordinator | Tạo nhãn vận đơn |
| `4` | Admin | Toàn quyền quản trị |

FE nên tự định nghĩa `enum`/object mapping y hệt 5 giá trị này, **không dùng chuỗi cũ** (`"admin"`, `"manager"`...) — đã đổi hẳn sang số.

---

## 4. MFA — 3 điều FE hay hiểu nhầm

1. **MFA là opt-in, không tự động bật** — chỉ bật khi user tự gọi `POST /auth/mfa/setup` rồi `POST /auth/mfa/verify`. Đổi mật khẩu **không** liên quan gì tới MFA.
2. **`POST /auth/mfa/setup`** trả về `otpauthUrl` — FE phải **tự convert URL này thành ảnh QR** (dùng thư viện như `qrcode` phía FE, backend không trả sẵn ảnh).
3. **`POST /auth/mfa/verify`** thành công trả về **10 mã dự phòng dạng plaintext, CHỈ HIỆN ĐÚNG 1 LẦN** — FE bắt buộc phải thiết kế màn hình nhắc user lưu/in lại (backend không lưu lại được bản plaintext, chỉ lưu hash).

### Trusted Device 
Sau khi verify MFA thật (mã TOTP hoặc backup code) thành công, response **login** có thêm `trusted_device_token`. FE phải:
```ts
localStorage.setItem('device_token', res.trusted_device_token);
```
Lần login sau, **luôn gửi kèm** field này trong body `/auth/login`:
```json
{ "email": "...", "password": "...", "device_token": "a1b2c3..." }
```
Nếu còn hạn (30 ngày) và khớp đúng thiết bị → **bỏ qua hoàn toàn bước hỏi MFA**, đăng nhập thẳng dạng A.

---

## 5. Tài khoản mới tạo / vừa bị Admin reset password

Response login có `must_change_password: true` → FE **bắt buộc điều hướng thẳng** sang màn hình "Đổi mật khẩu", **ẩn hết menu khác**. Mọi API khác (trừ `/auth/change-password`, `/auth/logout`) sẽ trả về **403** cho tới khi đổi xong — đây là backend tự chặn, không phải bug.

### Khóa cứng sau 72 giờ
Nếu quá 72h kể từ lúc được cấp mà chưa đổi mật khẩu, **mọi request đều bị chặn 401/403**, kể cả `/auth/change-password`. Message trả về:
```
"Tài khoản đã bị khóa do chưa đổi mật khẩu trong 72 giờ. Vui lòng liên hệ Admin để được mở khóa."
```
→ FE nên hiển thị màn hình riêng cho tình huống này (không phải lỗi thường), hướng dẫn user liên hệ Admin — Admin gọi `POST /users/:id/reset-password` để mở lại.

---

## 6. Refresh Token — cách xoay vòng

```
POST /auth/refresh
Body: { "refresh_token": "..." }
```
Trả về **cặp token MỚI hoàn toàn** (cả access lẫn refresh). FE phải **thay thế cả 2** giá trị đã lưu, không chỉ thay access token — refresh token **cũ sẽ mất hiệu lực ngay** sau khi dùng 1 lần (rotation). Nếu FE dùng lại refresh token cũ đã hết hạn dùng → toàn bộ session của user sẽ bị thu hồi (cơ chế phát hiện đánh cắp token), bắt phải đăng nhập lại từ đầu — đây là **chủ đích bảo mật**, không phải bug.

---

## 7. Google OAuth — luồng redirect, KHÔNG PHẢI gọi API thường

```
FE bấm "Đăng nhập bằng Google" → điều hướng thẳng (window.location.href, KHÔNG PHẢI fetch/axios):
  GET http://localhost:3000/auth/google

→ Backend redirect sang Google → user đăng nhập → Google redirect NGƯỢC LẠI vào backend
  (GET /auth/google/callback, FE không cần biết route này)

→ Backend redirect LẦN CUỐI về đúng URL FE, kèm dữ liệu qua QUERY STRING (không phải JSON body):

  Thành công: http://localhost:5173/oauth-success?access_token=...&refresh_token=...&role=1&must_change_password=false
  Thất bại:   http://localhost:5173/oauth-success?error=account_not_registered
```
FE cần có sẵn 1 route `/oauth-success`, tự đọc `URLSearchParams` từ URL để lấy token — **không** gọi API nào thêm ở bước này.

### Bảng mã lỗi Google OAuth (param `error=`)

| Mã | Ý nghĩa | FE nên hiển thị |
|---|---|---|
| `missing_code` | Google không gửi kèm `code` (hiếm gặp) | "Đăng nhập Google thất bại, thử lại" |
| `invalid_state` | Phiên hết hạn hoặc có dấu hiệu giả mạo | "Phiên đăng nhập hết hạn, thử lại" |
| `email_not_verified` | Email Google chưa xác thực | "Vui lòng xác thực email Google trước" |
| `account_not_registered` | **Chưa được Admin tạo tài khoản** — tình huống phổ biến nhất | "Tài khoản chưa tồn tại, liên hệ Admin" |
| `account_inactive` | Tài khoản đã bị vô hiệu hóa | "Tài khoản đã bị khóa, liên hệ Admin" |
| `account_locked` | Khóa cứng do quá 72h | Giống mục 5 |
| `server_error` | Lỗi hệ thống không xác định | "Có lỗi xảy ra, thử lại sau" |

⚠️ Đăng nhập Google **KHÔNG BAO GIỜ tự tạo tài khoản mới** — chỉ hoạt động cho email **đã được Admin tạo sẵn** từ trước qua `POST /users`.

---

## 8. Bảng route đầy đủ

| Method | Route | Cần đăng nhập? | Role |
|---|---|---|---|
| POST | `/auth/login` | Không | — |
| POST | `/auth/forgot-password` | Không | — |
| POST | `/auth/reset-password` | Không | — |
| POST | `/auth/change-password` | Có | Bất kỳ |
| POST | `/auth/mfa/setup` | Có | Bất kỳ |
| POST | `/auth/mfa/verify` | Có | Bất kỳ |
| POST | `/auth/refresh` | Không (dùng refresh_token) | — |
| POST | `/auth/logout` | Có | Bất kỳ |
| GET | `/auth/google` | Không | — |
| GET | `/auth/google/callback` | Không (Google gọi) | — |
| POST | `/users` | Có | Admin |
| GET | `/users` | Có | Admin, Store Owner |
| GET | `/users/me` | Có | Bất kỳ |
| PATCH | `/users/me` | Có | Bất kỳ (chỉ sửa phone/address/avatar) |
| POST | `/users/:id/reset-password` | Có | Admin |
| POST | `/users/:id/disable-mfa` | Có | Admin |
| POST | `/users/:id/reactivate` | Có | Admin |
| PATCH | `/users/:id` | Có | Admin (sửa tên/role/phone/address/mã NV/phòng ban) |
| DELETE | `/users/:id` | Có | Admin (xóa mềm) |

---

## 9. Format lỗi chung

Mọi lỗi trả về đều theo format NestJS chuẩn:
```json
{
  "statusCode": 401,
  "message": "Email hoặc mật khẩu không chính xác.",
  "error": "Unauthorized"
}
```
Riêng lỗi validate (body sai định dạng) — `message` là **mảng chuỗi**, không phải 1 chuỗi:
```json
{
  "statusCode": 400,
  "message": ["email must be an email", "password should not be empty"],
  "error": "Bad Request"
}
```
FE nên xử lý cả 2 trường hợp `message` là `string` hoặc `string[]`.

---

## 10. Checklist nhanh trước khi FE bắt đầu code

- [ ] Đã có bảng mapping `role` số ↔ tên hiển thị
- [ ] Đã xử lý 2 dạng response của `/auth/login` (dạng A/B)
- [ ] Đã lưu + tự động gửi lại `device_token` sau lần verify MFA đầu tiên
- [ ] Đã có màn hình riêng cho `must_change_password: true` và khóa cứng 72h
- [ ] Đã có route `/oauth-success` đọc query string, xử lý đủ 7 mã lỗi ở mục 7
- [ ] Refresh token: thay **cả 2** token mỗi lần gọi `/auth/refresh`, không chỉ access token
