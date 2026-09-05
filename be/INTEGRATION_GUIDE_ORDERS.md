# OptiPackAI Backend — Integration Guide: Orders & Marketplace Integration (FE-01, FE-02)

Tài liệu này dành cho FE tích hợp 2 module **Marketplace Integration** (kết nối sàn qua OAuth) và **Orders** (đồng bộ + gộp đơn hàng). Đọc tài liệu này **trước khi** đọc Swagger — Swagger cho biết "API nhận/trả gì", tài liệu này giải thích "vì sao nó hoạt động vậy, và FE cần xử lý gì thêm". Cùng cấp với `INTEGRATION_GUIDE.md` (Auth/Users) — đọc file đó trước nếu FE chưa quen cách BE trả lỗi và cách gắn Bearer token.

**Swagger UI (nguồn API chính thức, luôn cập nhật)**: `http://localhost:3000/api/docs`

> ⚠️ **Phạm vi hiện tại**: chỉ **Lazada** đã code và test xong end-to-end với dữ liệu thật. TikTok Shop và Tiki nằm trong roadmap nhưng **chưa có endpoint nào chạy được** — nếu Swagger có route `/marketplace/tiktok/*` hoặc `/marketplace/tiki/*` xuất hiện, đó là scaffold chưa hoàn thiện, đừng tích hợp FE vào đó cho tới khi có thông báo riêng.

---

## 1. Base URL & Header chung

```
Base URL: http://localhost:3000
Content-Type: application/json
Authorization: Bearer <access_token>   (bắt buộc cho mọi route bên dưới, TRỪ Lazada callback)
```

Không có tiền tố `/api/v1` — route thật là `/orders`, không phải `/api/v1/orders`.

Token lấy từ luồng đăng nhập ở `INTEGRATION_GUIDE.md`. Nếu request trả `401`, kiểm tra token còn hạn chưa trước khi báo lỗi (access_token sống 4h theo BE — refresh qua `/auth/refresh` như đã mô tả trong guide Auth).

---

## 2. Luồng chạy đầy đủ (end-to-end) — đọc mục này TRƯỚC khi code UI

Đây là toàn bộ hành trình từ lúc mở app tới lúc thấy đơn hàng — mọi mục sau đây chỉ là ĐI SÂU vào từng bước trong luồng này. Đọc qua 1 lượt trước để có bức tranh tổng thể, tránh code từng API riêng lẻ mà không hiểu chúng khớp nhau ở đâu.

```
1. User đăng nhập vào OptiPackAI (POST /auth/login — xem INTEGRATION_GUIDE.md)
   → có access_token, mọi bước sau đều gắn kèm header
     Authorization: Bearer <access_token>

2. Shop Lazada ĐÃ connect chưa?
   ├─ CHƯA (lần đầu, hoặc thêm shop mới)
   │    → làm mục 3 (Luồng kết nối OAuth) — CHỈ làm 1 LẦN/shop
   │
   └─ RỒI (shop cũ, mở lại app bình thường)
        → BỎ QUA mục 3, đi thẳng bước 3 dưới đây
        → FE không cần hỏi lại BE "đã connect chưa" bằng cách nào cả — cứ
          coi như đã connect, chỉ khi gọi sync/list mà nhận lỗi
          MKT_SHOP_NOT_CONNECTED (mục 8) mới cần quay lại mục 3

3. User bấm nút "Đồng bộ ngay" trên giao diện
   → FE gọi POST /orders/lazada/sync?shop_id=... (mục 4)
   → BE tự đi hỏi Lazada, lưu đơn mới vào MongoDB
   → BE trả về { fetched, upserted, newlyConsolidated }
   → FE hiện toast ngắn báo kết quả

4. FE TỰ ĐỘNG gọi tiếp GET /orders (mục 5) để load lại bảng
   → KHÔNG bắt user bấm thêm nút "tải lại" riêng — sync xong là load luôn

5. User bấm vào 1 dòng đơn trong bảng
   → FE gọi GET /orders/:id (mục 6) bằng field `id` của dòng đó
   → hiện màn hình chi tiết: sản phẩm, số lượng, giá, địa chỉ đầy đủ

6. Muốn có đơn MỚI HƠN nữa?
   → quay lại bước 3, bấm "Đồng bộ ngay" lần nữa để có ngay lập tức
   → HOẶC không cần làm gì cả — hệ thống giờ đã có lịch chạy nền TỰ ĐỘNG
     đồng bộ mọi shop đã connect mỗi 10 phút 1 lần (không cần ai bấm nút).
     Nút "Đồng bộ ngay" vẫn hữu ích khi cần thấy dữ liệu NGAY LẬP TỨC
     (VD đang demo, không muốn chờ tới đợt tự động kế tiếp) — 2 cơ chế
     tồn tại song song, không loại trừ nhau.
```

### Cách FE tự test luồng này (không cần chờ BE dev ngồi cạnh)

1. Mở `http://localhost:3000/api/docs` (Swagger) — đăng nhập bằng tài khoản test có role Admin qua `POST /auth/login`, copy `access_token`, bấm nút "Authorize" ở góc trên Swagger, dán token vào (không cần gõ chữ `Bearer`, Swagger tự thêm).
2. Thử gọi `GET /orders` trước — nếu trả về mảng có sẵn dữ liệu (thường sẽ có, vì shop demo đã connect + sync trước đó), nghĩa là mục 2/3 có thể bỏ qua, đi thẳng test UI hiển thị danh sách.
3. Muốn thấy hiệu ứng "có đơn mới" mà không cần đặt đơn thật trên Lazada: gọi `POST /orders/lazada/sync` trước — nếu shop thật đó vừa có đơn mới, `fetched`/`upserted` sẽ > 0, gọi lại `GET /orders` sẽ thấy dòng mới.
4. Copy field `id` của 1 dòng bất kỳ trong response `GET /orders`, dán vào `GET /orders/:id` để xem chi tiết — đây là cách nhanh nhất để FE tự lấy dữ liệu mẫu dựng UI màn chi tiết mà không cần hỏi BE mẫu response.
5. Nếu cần test lỗi (403 do sai role, 404 do id không tồn tại...), đổi tạm token sang tài khoản role khác hoặc sửa tay 1 ký tự trong `:id` — Swagger cho phép thử nhanh không cần code.

---

## 3. Luồng kết nối shop Lazada (OAuth) — làm 1 LẦN mỗi shop, CHỈ Admin được làm

⚠️ **`connect` và mọi endpoint ở mục 4, 5 bên dưới đều giới hạn `@Roles(UserRole.ADMIN)`** — user role khác (Store Owner, Warehouse Staff...) gọi vào sẽ nhận `403 Forbidden`, không phải bug. FE chỉ hiện nút "Kết nối shop"/"Đồng bộ đơn"/menu Orders cho user có `role === 4` (Admin — xem bảng mapping role ở `INTEGRATION_GUIDE.md` mục 3).

Đây là bước bắt buộc trước khi gọi được bất kỳ API đơn hàng nào của shop đó. Khác với luồng Google OAuth ở module Auth (dùng `GET`, cùng cách gọi), bước khởi tạo ở đây **cũng là `GET`, không phải `POST`**:

```
Admin bấm "Kết nối shop Lazada" → gọi (có Bearer token):
  GET /marketplace/:platform/connect      (vd: GET /marketplace/lazada/connect)

→ Response 200: { "authUrl": "https://..." }   ← JSON bình thường, KHÔNG redirect ở bước này
→ FE tự điều hướng trình duyệt sang authUrl đó (window.location.href = res.authUrl),
  KHÔNG mở popup, KHÔNG fetch nội dung của authUrl

→ Seller đăng nhập & xác nhận cấp quyền trên Lazada
→ Lazada tự động điều hướng TRÌNH DUYỆT NGƯỢC LẠI thẳng vào BACKEND (không phải FE):
  GET /marketplace/:platform/callback?code=...&state=...
  (route này CÔNG KHAI — không cần Bearer token, vì trình duyệt của seller gọi trực tiếp,
   không phải FE gọi. Bảo mật dựa trên state token dùng 1 lần, không phải JWT.)
```

**Callback xử lý xong, BE lưu access_token/refresh_token của shop đó (mã hoá) vào MongoDB** và **trả thẳng JSON này ra ngay trình duyệt** (đã xác nhận đúng theo code, không phải suy đoán):
```json
{ "platform": "lazada", "shopId": "201171264532", "shopName": "i7Yix2IJ", "connected": true }
```

> 🔴 **Vấn đề UX thật cần FE/BE thống nhất trước khi demo**: vì `callback` do chính trình duyệt của Admin bị Lazada điều hướng tới (không phải FE gọi bằng `fetch`), và BE hiện **trả JSON thô** chứ không redirect tiếp về 1 trang FE đẹp — nghĩa là sau khi bấm "Cho phép" trên Lazada, Admin sẽ thấy **1 trang JSON trần trụi** trên trình duyệt (giống hệt việc mở thẳng 1 API bằng URL), không quay lại được giao diện OptiPackAI một cách mượt. Đây khác với luồng Google OAuth (module Auth) — Google OAuth có bước BE tự redirect tiếp về `http://localhost:5173/oauth-success?...`, còn Lazada callback ở module này **hiện CHƯA có bước redirect về FE tương tự**. FE nên bàn với BE 1 trong 2 hướng trước khi code UI: (a) BE thêm redirect về 1 route FE cố định sau khi xử lý xong callback (giống Google), hoặc (b) FE chấp nhận mở luồng connect ở tab/cửa sổ riêng và tự poll 1 API khác (chưa có) để biết đã connect xong chưa. **Đừng tự dựng UI theo giả định (a) nếu BE chưa thực sự làm redirect** — kiểm tra lại bằng Swagger/test thật trước.

Sau khi connect xong 1 lần, **`shopId` (chính là Lazada `seller_id`, ví dụ `201171264532`) là định danh dùng lại cho mọi lần gọi sync/list phía dưới** — FE nên lưu lại giá trị này (theo shop, không phải theo user) để không phải hỏi lại backend mỗi lần.

> ℹ️ **Restart server có cần connect lại không? Không.** Token Lazada lưu trong MongoDB (persistent), server tắt/bật lại không mất — shop đã connect vẫn dùng được ngay, Admin không cần bấm connect lại.
>
> ⚠️ **Nhưng nếu FE tự chạy BE ở máy local để test luồng connect (mục này, không phải sync/list)**: BE cần 1 tunnel **ngrok** để nhận callback OAuth từ Lazada (Lazada không redirect được về `localhost`). Tunnel này là 1 **process riêng, độc lập với server BE** — tắt terminal chạy ngrok (hoặc tắt máy) thì tunnel chết ngay, domain callback bị lỗi kiểu `ERR_NGROK_3200 — endpoint offline`, **dù server BE vẫn chạy bình thường**. Việc này **CHỈ ảnh hưởng khi đang connect 1 shop MỚI** — các shop đã connect từ trước vẫn sync/list `GET /orders` bình thường dù ngrok đang tắt, vì 2 luồng này không đụng gì tới ngrok cả. Nếu FE thấy nút "Kết nối shop" bị lỗi lúc test local nhưng các API khác vẫn chạy tốt, hỏi người phụ trách BE xem ngrok có đang chạy không trước khi báo bug.

---

## 4. Đồng bộ đơn hàng — `POST /orders/lazada/sync`

Gọi API này để kéo đơn hàng mới nhất từ Lazada về hệ thống. Đây **không phải** real-time webhook — Lazada Open Platform không có cơ chế webhook chính thức đáng tin cậy, nên việc đồng bộ là **polling chủ động**: FE có thể gọi nút "Đồng bộ ngay", hoặc lên lịch gọi định kỳ (khuyến nghị: mỗi 5–15 phút nếu làm auto-refresh, tuỳ mức độ khẩn của nghiệp vụ kho).

### Request

```
POST /orders/lazada/sync?shop_id=201171264532
Authorization: Bearer <access_token>
```

| Param | Type | Bắt buộc | Mô tả |
|---|---|---|---|
| `shop_id` | string (query) | Có | `shop_id` trên Lazada — chính là `seller_id` trả về lúc connect OAuth (mục 3) |

### Response — `201 Created`

```json
{
  "fetched": 1,
  "upserted": 1,
  "newlyConsolidated": 0
}
```

| Field | Mô tả |
|---|---|
| `fetched` | Số đơn hàng BE lấy được từ Lazada API trong lần gọi này |
| `upserted` | Số đơn được ghi mới/cập nhật vào MongoDB (đơn đã tồn tại từ lần sync trước sẽ được update, không tạo trùng) |
| `newlyConsolidated` | Số đơn **mới được gộp** vào 1 nhóm consolidation trong lần sync này (xem mục 7) |

**FE nên làm gì với response này**: hiện toast/snackbar ngắn kiểu "Đã đồng bộ {fetched} đơn, {newlyConsolidated} đơn được gộp" — không cần hiện chi tiết từng đơn ở đây, gọi tiếp `GET /orders` (mục 5) để lấy danh sách đầy đủ hiển thị bảng.

**Lỗi thường gặp — ĐÃ KIỂM TRA CODE THẬT, khác với suy đoán ban đầu**: nếu Lazada từ chối trả đơn (vd shop chưa verify đủ điều kiện bán hàng, token hết hạn, Lazada API tạm lỗi...), BE **KHÔNG có mã lỗi riêng cho từng nguyên nhân** — mọi lỗi ở bước gọi Lazada `GetOrders` đều rơi về **CÙNG 1 mã lỗi chung**:

```json
{
  "success": false,
  "error_code": "ORD_SYNC_FAILED",
  "message": "Không lấy được danh sách đơn từ Lazada cho shop 201171264532 — vui lòng thử lại.",
  "details": { "shopId": "201171264532" },
  "timestamp": "...",
  "path": "/orders/lazada/sync"
}
```
HTTP status: **502 Bad Gateway** (đúng chuẩn — lỗi từ hệ thống bên ngoài, không phải lỗi của chính OptiPackAI).

→ **FE KHÔNG thể phân biệt** "shop chưa verify" với các nguyên nhân khác chỉ từ response này — `message` luôn là câu chung chung như trên, không có field nào chỉ ra lý do cụ thể phía Lazada. FE nên hiện UI dạng "Đồng bộ thất bại, vui lòng thử lại sau hoặc kiểm tra trạng thái xác minh shop trên Lazada Seller Center" (gộp chung mọi khả năng), **không** cố tách case theo `message` hay đoán thêm error_code chưa tồn tại. Nếu sau này BE cần phân biệt rõ nguyên nhân cho FE, đó là việc cần yêu cầu BE bổ sung riêng, không phải điều đang có sẵn.

---

## 5. Danh sách đơn hàng — `GET /orders`

### Request

```
GET /orders?limit=20
Authorization: Bearer <access_token>
```

| Param | Type | Bắt buộc | Mô tả |
|---|---|---|---|
| `shop_id` | string (query) | Không | Lọc theo shop trên sàn |
| `status` | string (query) | Không | Lọc theo trạng thái đơn (giá trị cụ thể: xem Swagger — enum đang mở rộng dần) |
| `consolidated_group_id` | string, MongoDB ObjectId (query) | Không | **Mới bổ sung** — lọc lấy TẤT CẢ đơn thuộc CÙNG 1 gói hàng đã gộp. Lấy giá trị này từ field `consolidatedGroupId` trả về ở `GET /orders` hoặc `GET /orders/:id` của bất kỳ đơn nào trong nhóm đó. Chỉ trả đơn có `isConsolidated: true` |
| `before` | string, **ISO 8601 datetime** (query) | Không | Cursor phân trang — truyền lại nguyên văn `nextCursor` của trang trước (BE validate bằng `@IsDateString()`, không nhận chuỗi tuỳ ý) |
| `limit` | number (query) | Không | Số lượng đơn/trang — mặc định **20**, tối thiểu **1**, tối đa **100** (BE reject nếu FE truyền >100) |

**Phân trang là cursor-based dựa trên thời gian (`created_at`), KHÔNG phải page number và KHÔNG phải token mờ (opaque token)** — `nextCursor` thực chất chính là giá trị `created_at` (dạng ISO string) của đơn CUỐI CÙNG trong trang hiện tại. FE không tự tính `page=2,3,...`, mà luôn lấy nguyên `nextCursor` từ response trước truyền thẳng vào `before` của lần gọi kế tiếp — không tự chỉnh sửa/parse lại giá trị này. Khi `nextCursor: null` → đã hết dữ liệu, ẩn nút "Xem thêm"/tắt infinite scroll.

### Response — `200 OK`

```json
{
  "orders": [
    {
      "id": "6a9af7843c22e98f3a6105c7",
      "platform": "lazada",
      "shopId": "201171264532",
      "platformOrderId": "528609688549763",
      "platformOrderNumber": "528609688549763",
      "status": "pending",
      "recipientName": "N**n",
      "recipientCity": "Phường Gia Định",
      "isConsolidated": false,
      "consolidatedGroupId": null,
      "totalAmount": 125000,
      "currency": "VND",
      "itemCount": 1,
      "createdAt": "2026-09-04T16:53:24.904Z"
    }
  ],
  "nextCursor": null
}
```

### Giải thích field — 2 điểm FE hay hiểu nhầm

1. **`recipientName` bị Lazada TỰ MASK** (ví dụ `"N**n"`) — đây là hành vi bảo mật/PDPA phía Lazada trả về sẵn như vậy, **không phải bug BE, không phải lỗi hiển thị FE**. Đừng cố "giải mã" hay báo lỗi khi thấy tên bị che — hiển thị nguyên văn.
2. **`recipientCity` là cấp Phường/Xã** (ví dụ `"Phường Gia Định"`), không phải cấp Tỉnh/Thành như tên field gợi ý — do cấu trúc hành chính Việt Nam hiện tại (sau đợt sáp nhập, bỏ cấp Quận/Huyện) chỉ còn Tỉnh/Thành phố + Phường/Xã, và Lazada trả giá trị này đúng như vậy. `GET /orders/:id` (mục 6) trả đầy đủ hơn (`recipientAddressLine1/2`, `recipientPostalCode`) nếu FE cần hiển thị địa chỉ chi tiết.

### Field liên quan

| Field | Type | Mô tả |
|---|---|---|
| `id` | string | ObjectId MongoDB của đơn (dùng làm key khi render list/table, và là giá trị truyền vào `GET /orders/:id`) |
| `platform` | string | Sàn nguồn — hiện tại chỉ có `"lazada"` |
| `shopId` | string | shop_id/seller_id trên sàn |
| `platformOrderId` | string | Mã đơn hàng gốc trên sàn — LUÔN có |
| `platformOrderNumber` | string \| **undefined** | Mã đơn hiển thị (order_number) trên sàn — **field optional, có thể VẮNG MẶT** trong response (không phải luôn `null`, mà có thể thiếu hẳn key này). FE phải kiểm tra tồn tại trước khi hiển thị (`order.platformOrderNumber ?? order.platformOrderId` là fallback hợp lý), không được giả định luôn có như `platformOrderId`. Trong lần test thực tế 2 giá trị này trùng nhau, nhưng đó là trùng hợp của đơn cụ thể đó, không phải quy tắc đảm bảo |
| `status` | string | Trạng thái đơn — **đã xác nhận đủ 9 giá trị enum** (chuẩn hoá nội bộ, không phải string thô của Lazada): `unpaid`, `pending`, `packed`, `ready_to_ship`, `shipped`, `delivered`, `canceled`, `returned`, `failed` |
| `isConsolidated` / `consolidatedGroupId` | boolean / string\|null | Xem mục 7 |
| `totalAmount` / `currency` | number / string | Tổng tiền đơn, đơn vị tiền tệ |
| `itemCount` | number | Số lượng **dòng sản phẩm** trong đơn (đếm theo unit — xem lưu ý quan trọng ở mục 6 về cách Lazada đếm số lượng) |
| `createdAt` | string (ISO 8601) | Thời điểm đơn được ghi vào hệ thống OptiPackAI (không phải thời điểm đặt hàng trên sàn) |

---

## 6. Chi tiết 1 đơn hàng — `GET /orders/:id` (MỚI)

Dùng cho màn hình chi tiết đơn — trả đầy đủ địa chỉ người nhận và **danh sách sản phẩm đã đặt**, thứ mà `GET /orders` (mục 5) KHÔNG có (chỉ có `itemCount` là con số).

### Request

```
GET /orders/6a9af7843c22e98f3a6105c7
Authorization: Bearer <access_token>
```

`:id` là giá trị field `id` lấy từ `GET /orders`. Nếu gửi id sai định dạng ObjectId (VD gõ tay nhầm), nhận `400` với `error_code: "ORD_INVALID_ORDER_ID"`; nếu đúng định dạng nhưng không tồn tại, nhận `404` với `error_code: "ORD_ORDER_NOT_FOUND"` — 2 mã lỗi **tách riêng có chủ đích**, giúp FE phân biệt "tự gửi sai" và "dữ liệu thật sự không có".

### Response — `200 OK`

```json
{
  "id": "6a9af7843c22e98f3a6105c7",
  "platform": "lazada",
  "shopId": "201171264532",
  "platformOrderId": "528609688549763",
  "platformOrderNumber": "528609688549763",
  "status": "pending",
  "recipientName": "N**n",
  "recipientPhone": "84xxxxxxxx",
  "recipientAddressLine1": "123 Đường ABC",
  "recipientAddressLine2": null,
  "recipientCity": "Phường Gia Định",
  "recipientPostalCode": null,
  "recipientCountry": "VN",
  "isConsolidated": false,
  "consolidatedGroupId": null,
  "totalAmount": 125000,
  "currency": "VND",
  "itemCount": 1,
  "items": [
    {
      "sku": "ABC-123",
      "name": "Tên sản phẩm",
      "variation": null,
      "status": "pending",
      "quantity": 1,
      "unitPrice": 125000,
      "lineTotal": 125000,
      "platformOrderItemIds": ["987654321"]
    }
  ],
  "createdAt": "2026-09-04T16:53:24.904Z"
}
```

### 🔴 Điểm QUAN TRỌNG NHẤT khi hiển thị `items[]` — cách Lazada đếm số lượng khác trực giác

Lazada **không có khái niệm "1 dòng sản phẩm với quantity=3"**. Nếu khách đặt 3 cái cùng SKU, Lazada trả về trong `GetOrderItems` **3 phần tử RIÊNG BIỆT** (3 `order_item_id` khác nhau) — mỗi phần tử luôn là ĐÚNG 1 đơn vị. BE đã **gộp sẵn** các đơn vị cùng SKU + cùng `status` thành 1 dòng `items[]` duy nhất với `quantity` đã cộng dồn đúng — **FE không cần tự gộp gì thêm**, chỉ hiển thị nguyên `items[]` trả về là đúng.

Có 1 hệ quả cần biết: **nếu 1 đơn có 2 cái cùng SKU nhưng 1 cái bị hủy riêng lẻ (1 cái `pending`, 1 cái `canceled`)**, `items[]` sẽ trả về **2 dòng riêng biệt cho cùng 1 SKU đó** (khác `status`) — đây **không phải trùng lặp/bug**, mà là thể hiện đúng thực tế 2 đơn vị đang ở 2 trạng thái khác nhau. FE nên hiển thị badge status riêng cho từng dòng thay vì giả định 1 SKU = 1 dòng duy nhất.

`platformOrderItemIds` (mảng, không phải 1 giá trị) — giữ lại toàn bộ mã đơn vị gốc của Lazada trong dòng đã gộp, dùng khi cần thao tác chi tiết theo từng đơn vị sau này (Package 4 — Fulfillment), FE hiện tại chưa cần dùng tới field này.

---

## 7. Gộp đơn (Consolidation) — cách FE hiển thị đúng

Hệ thống tự động phát hiện các đơn hàng **có khả năng cùng 1 khách/cùng điểm giao** (dựa trên `consolidation_key` tính từ thông tin người nhận — logic chi tiết nằm ở BE, FE không cần biết công thức) và gộp nhóm lại để nhân viên đóng gói có thể xử lý chung 1 lần thay vì tách lẻ nhiều gói.

- `isConsolidated: false, consolidatedGroupId: null` → đơn độc lập, không thuộc nhóm nào.
- `isConsolidated: true, consolidatedGroupId: "<id>"` → đơn thuộc 1 nhóm gộp — FE nên **hiển thị badge/nhãn riêng** (ví dụ "Đơn gộp") trên các đơn có cùng `consolidatedGroupId`, và có thể cho phép nhóm chúng lại thành 1 khối trực quan trong bảng thay vì hiện rời rạc.

**Chỉ đơn CHƯA fulfill xong mới được xét gộp** — cụ thể BE chỉ so khớp `consolidation_key` giữa các đơn có `status` thuộc nhóm `unpaid | pending | packed | ready_to_ship`. Đơn đã `shipped/delivered/canceled/returned/failed` **không bao giờ** được gộp thêm (kể cả nếu trùng khách với 1 đơn mới) — hợp lý về nghiệp vụ (đơn cũ đã xử lý xong, không nên gộp ngược). FE không cần tự lọc lại theo status khi hiển thị gộp — BE đã đảm bảo điều này ở tầng dữ liệu.

> ⚠️ Tính năng gộp mới xác nhận đúng logic ở mức "không gộp nhầm đơn lẻ" (test với 1 đơn duy nhất). **Case thực sự có 2 đơn được gộp làm 1 nhóm chưa được test bằng dữ liệu thật** — nếu FE thấy `newlyConsolidated` từ mục 4 luôn = 0 dù đặt nhiều đơn cùng khách, đó có thể là điều đang chờ BE verify tiếp, không mặc định là bug FE.

---

## 8. Format lỗi chung

Giống hệt module Auth (xem `INTEGRATION_GUIDE.md` mục 9) — mọi lỗi đều theo format `AppException` thống nhất qua `GlobalExceptionFilter`:

```json
{
  "success": false,
  "error_code": "MKT_SHOP_NOT_CONNECTED",
  "message": "Shop chưa được kết nối hoặc đã bị ngắt kết nối.",
  "details": null,
  "timestamp": "2026-09-04T10:00:00.000Z",
  "path": "/orders/lazada/sync"
}
```

Prefix `error_code` theo module: `MKT_` (marketplace-integration — lỗi liên quan kết nối/token sàn), `ORD_` (orders — lỗi liên quan logic đơn hàng/gộp đơn). FE nên switch theo `error_code` để hiện đúng UI, **không parse `message`** (message có thể đổi câu chữ, `error_code` mới là hợp đồng ổn định).

**Toàn bộ mã lỗi hiện có (lấy trực tiếp từ code, đầy đủ — không có mã nào khác ngoài danh sách này)**:

| `error_code` | Module | Khi nào xảy ra |
|---|---|---|
| `MKT_OAUTH_STATE_INVALID` | marketplace-integration | State token ở callback sai/hết hạn/dùng lại lần 2 — nghi CSRF hoặc user bấm back rồi authorize lại |
| `MKT_ADAPTER_NOT_REGISTERED` | marketplace-integration | Gọi `:platform` không tồn tại adapter (hiện chỉ có lazada, tiktok/tiki có enum nhưng chưa chắc có adapter thật — xem mục "Phạm vi hiện tại" đầu file) |
| `MKT_SHOP_NOT_CONNECTED` | marketplace-integration | Gọi sync/list cho `shop_id` chưa từng connect OAuth thành công |
| `MKT_TOKEN_EXCHANGE_FAILED` | marketplace-integration | Đổi `code` lấy access_token thất bại ở bước callback |
| `MKT_TOKEN_REFRESH_FAILED` | marketplace-integration | Refresh token hết hạn/không hợp lệ — cần Admin connect lại từ đầu |
| `MKT_TOKEN_DECRYPT_FAILED` | marketplace-integration | Lỗi giải mã token đã lưu trong DB (sự cố hạ tầng, hiếm) |
| `MKT_WEBHOOK_SIGNATURE_INVALID` | marketplace-integration | Chưa dùng tới ở luồng Lazada hiện tại (Lazada polling, không webhook) |
| `MKT_SHOP_LOOKUP_FAILED` | marketplace-integration | Không tìm/đọc được shop trong DB |
| `ORD_SYNC_FAILED` | orders | **Bất kỳ** lỗi nào khi gọi Lazada GetOrders thất bại (gộp chung mọi nguyên nhân phía Lazada — xem mục 4) |
| `ORD_UNSUPPORTED_PLATFORM` | orders | Gọi sync cho 1 platform chưa hỗ trợ (hiện chỉ `lazada` có route sync thật) |
| `ORD_INVALID_ORDER_ID` | orders | **Mới** — `:id` ở `GET /orders/:id` (hoặc `consolidated_group_id` ở `GET /orders`) sai định dạng ObjectId, HTTP 400 |
| `ORD_ORDER_NOT_FOUND` | orders | **Mới** — `:id` đúng định dạng nhưng không có đơn nào khớp (hoặc đơn đã bị vô hiệu hóa), HTTP 404 |

---

## 9. Bảng route đầy đủ (2 module)

| Method | Route | Cần đăng nhập? | Role | Ghi chú |
|---|---|---|---|---|
| GET | `/marketplace/:platform/connect` | Có | **Admin** | `:platform` = `lazada` (tiktok/tiki: enum có nhưng chưa xác nhận hoạt động — xem đầu file). Trả `{ authUrl }` |
| GET | `/marketplace/:platform/callback` | **Không** (sàn tự điều hướng trình duyệt tới) | — | Public — bảo mật bằng state token 1 lần. Trả JSON thô, KHÔNG redirect về FE (xem cảnh báo UX ở mục 3) |
| POST | `/orders/lazada/sync` | Có | **Admin** | Query `shop_id` bắt buộc |
| GET | `/orders` | Có | **Admin** | Cursor pagination (`before`/`nextCursor` là ISO datetime), filter `shop_id`/`status`/`consolidated_group_id` |
| GET | `/orders/:id` | Có | **Admin** | **Mới** — chi tiết 1 đơn, có `items[]` đã gộp theo SKU (xem mục 6) |

---

## 10. Checklist nhanh trước khi FE bắt đầu code

- [ ] Đã chỉ hiện nút Connect/Sync/menu Orders cho user role **Admin (4)** — role khác gọi vào sẽ bị 403
- [ ] Đã dùng đúng method **GET** cho `/marketplace/:platform/connect` (không phải POST)
- [ ] Đã bàn với BE về vấn đề UX callback trả JSON thô (mục 3) trước khi thiết kế màn hình connect — chưa tự giả định có redirect về FE
- [ ] Đã dùng cursor `nextCursor`/`before` (ISO datetime string) cho phân trang `GET /orders`, không tự tính page number, không tự sửa giá trị cursor
- [ ] Đã xử lý đúng field `platformOrderNumber` có thể VẮNG MẶT (optional), không giả định luôn tồn tại như `platformOrderId`
- [ ] Đã xử lý đúng 2 field dễ hiểu nhầm: `recipientName` bị mask sẵn, `recipientCity` là cấp Phường/Xã
- [ ] Đã hiểu `items[]` ở `GET /orders/:id` là ĐÃ GỘP theo SKU+status sẵn từ BE — không tự gộp lại lần nữa, và hiểu vì sao 1 SKU có thể xuất hiện 2 dòng nếu khác status (mục 6)
- [ ] Đã hiểu rằng lỗi sync Lazada CHỈ có 1 mã chung `ORD_SYNC_FAILED` (502) — không cố phân biệt "chưa verify" khỏi các lỗi khác qua response
- [ ] Đã switch theo `error_code` (không parse `message`) cho mọi lỗi từ 2 module này — dùng đúng bảng mã lỗi đầy đủ ở mục 8
- [ ] Chỉ tích hợp route Lazada — chưa đụng route TikTok/Tiki nếu thấy xuất hiện trên Swagger (roadmap, chưa xong)
