# Tích hợp Giao Hàng Nhanh (GHN) vào OptiPack AI

> Phiên bản 1.0 — 07/10/2026. Tài liệu thiết kế và hướng dẫn từng bước.
> Nguồn: tài liệu chính thức GHN tại `https://developer.ghn.vn/en/docs/...` (đã đọc từng trang ngày 07/10/2026).
> Trạng thái: **THIẾT KẾ — CHƯA CODE.**

---

## 0. Tóm tắt quyết định

| Nội dung | Trước (G1, 27/09) | Từ 07/10/2026 |
|---|---|---|
| Ai giao hàng | Đội giao của shop (Shipping Coordinator bấm nút) | **Đơn vị vận chuyển thứ ba — GHN trước, có thể thêm GHTK/Viettel Post sau** |
| Phí ship | Không tính | **Lấy từ API Calculate Fee / Create Order của GHN** |
| Mã vận đơn | `SHP-...` nội bộ | Giữ `SHP-...` nội bộ **và** lưu thêm `carrier_order_code` của GHN |
| Đổi trạng thái giao | Nhân viên bấm nút trên màn hình quản trị | **Webhook của GHN**. Khi demo: **màn hình mobile giả lập shipper** gửi đúng định dạng webhook GHN |
| Cột "Đơn vị vận chuyển" | Không có | Có: `GHN` / `Lazada` / `Tự giao` |

Lý do (góp ý của giảng viên hướng dẫn): shop thực tế không tự vận hành đội giao; gọi đơn vị vận chuyển qua API mới phản ánh đúng nghiệp vụ và cho phép tính được phí ship thật — đầu vào cho bài toán tối ưu chi phí đóng gói.

**Nguyên tắc demo:** *phần "tiền" gọi GHN thật (môi trường test), phần "di chuyển" giả lập.* Môi trường test của GHN không có shipper thật đi lấy hàng, nên đơn sẽ không tự đổi trạng thái; tài liệu GHN cũng không nói môi trường test có tự gửi webhook hay không.

---

## 1. Luồng mới sau khi đóng gói

```
[Nhóm đơn PACKED]
      │  (Packaging Staff bấm "Đóng gói xong" — cân thật + kích thước kiện thật)
      ▼
(1) Kiểm tra địa chỉ người nhận đã đổi được sang mã GHN chưa
      │   chưa đổi được → trạng thái "Cần xác nhận địa chỉ" → nhân viên chọn tay Tỉnh/Quận/Phường
      ▼
(2) Calculate Fee (+ so sánh phương án đóng gói / hãng nếu có nhiều hãng)
      ▼
(3) Preview Order  → hiện phí + ngày giao dự kiến để Shipping Coordinator xác nhận
      ▼
(4) Create Order   → nhận order_code GHN, total_fee, expected_delivery_time
      │                 Shipment: status = awaiting_pickup, carrier = ghn
      ▼
(5) Print Order    → in nhãn GHN (A5 / 80×80 / 52×70) dán lên kiện
      ▼
(6) Trạng thái giao đến qua webhook (thật: GHN gọi; demo: trang giả lập shipper gọi)
      picked → transporting → delivering → delivered
                                       └→ delivery_fail → (giao lại) → ... → returned → RMA (G3)
      ▼
(7) Huỷ: nếu nhóm đơn bị huỷ trước khi GHN lấy hàng → Cancel Order
```

Nhóm đơn (`order_groups`) vẫn giữ trạng thái thô `packed → shipped → delivered/returned`. Mọi chi tiết vận chuyển nằm ở `shipments`.

---

## 2. Các API GHN được dùng

Tất cả endpoint có tiền tố `/shiip/public-api`. Mọi request gửi header:

```
Content-Type: application/json
Token: <GHN_TOKEN>
ShopId: <GHN_SHOP_ID>      (số nguyên)
```

| Môi trường | Base URL |
|---|---|
| Test (staging) | `https://dev-online-gateway.ghn.vn` |
| Thật (production) | `https://online-gateway.ghn.vn` |

> Mở Base URL bằng trình duyệt sẽ thấy `404 page not found` — đây là địa chỉ API, không phải trang web. Đó là hành vi bình thường.

### 2.1. Bảng tổng hợp

| # | API | Method + đường dẫn | Dùng ở bước | Demo |
|---|---|---|---|---|
| 1 | Get Province (cũ) | `GET /master-data/province` | Đồng bộ danh mục địa chỉ | Gọi thật |
| 2 | Get District (cũ) | `GET /master-data/district?province_id=` | Đồng bộ danh mục địa chỉ | Gọi thật |
| 3 | Get Ward (cũ) | `GET /master-data/ward?district_id=` | Đồng bộ danh mục địa chỉ | Gọi thật |
| 4 | Get Province (mới) | `GET /v3/master-data/province/all` | Địa chỉ 2 cấp sau 07/2025 | Gọi thật |
| 5 | Get Ward (mới) | `GET /v3/master-data/ward/all-by-province-id?province_id=&offset=&limit=` | Địa chỉ 2 cấp | Gọi thật |
| 6 | Get Shop | `GET /v2/shop/all` | Lấy địa chỉ kho lấy hàng (district/ward của shop) | Gọi thật |
| 7 | Get Service | `POST /v2/shipping-order/available-services` | Chọn gói dịch vụ cho tuyến | Gọi thật |
| 8 | **Calculate Fee** | `POST /v2/shipping-order/fee` | Tính phí, tối ưu đóng gói | **Gọi thật** |
| 9 | Leadtime | `POST /v2/shipping-order/leadtime` | Ngày giao dự kiến | Gọi thật (tuỳ chọn) |
| 10 | **Preview Order** | `POST /v2/shipping-order/preview` | Kiểm tra trước khi tạo | **Gọi thật** |
| 11 | **Create Order** | `POST /v2/shipping-order/create` | Tạo vận đơn | **Gọi thật** |
| 12 | Print Order | `POST /v2/a5/gen-token` rồi mở `/a5/public-api/printA5?token=` | In nhãn | Gọi thật |
| 13 | Order Info | `GET /v2/shipping-order/detail?order_code=` | Đối soát, dự phòng khi mất webhook | Gọi thật |
| 14 | Order Info theo mã shop | `GET /v2/shipping-order/detail-by-client-code?client_order_code=` | Chống tạo trùng khi lỗi mạng | Gọi thật |
| 15 | **Cancel Order** | `POST /v2/switch-status/cancel` | Huỷ vận đơn | **Gọi thật** |
| 16 | **Order Status Callback** | GHN gọi vào endpoint của OptiPack | Cập nhật trạng thái | **Giả lập** |
| — | Order Status Codes, Reason Codes | Bảng tra cứu | Map trạng thái và lý do | Hằng số trong code |

Chưa dùng ở giai đoạn này: Update Order, Update COD, Return Order, Delivery Again, Fee of Order Info, Get Station, Pick Shift, Create Shop, Tickets, Affiliate.

### 2.2. Chi tiết từng API

#### (8) Calculate Fee — `POST /v2/shipping-order/fee`

| Field | Kiểu | Bắt buộc | Ý nghĩa |
|---|---|---|---|
| `weight` | Int | Có | Trọng lượng kiện (gram), khác 0 |
| `to_district_id` | Int | Có | Mã quận/huyện nhận (từ Get District) |
| `to_ward_code` | String | Có | Mã phường/xã nhận (từ Get Ward) |
| `from_district_id`, `from_ward_code` | Int / String | Không | Mặc định = địa chỉ shop đã đăng ký |
| `service_type_id` | Int | Có | `2` = dưới 20 kg, `5` = từ 20 kg hoặc nhiều kiện |
| `length`, `width`, `height` | Int | Không | cm — **luôn gửi** để GHN tính trọng lượng quy đổi |
| `insurance_value` | Int | Không | Giá trị khai báo (VND) |
| `cod_value` | Int | Không | Tiền thu hộ (VND) |
| `coupon` | String | Không | Mã giảm giá |
| `items` | Object[] | Không | Hàng nặng |

Response: `total`, `service_fee`, `insurance_fee`, `cod_fee`, `pick_station_fee`, `coupon_value`, `r2s_fee`, `return_again`, `document_return`, `double_check`, `pick_remote_areas_fee`, `deliver_remote_areas_fee`, `cod_failed_fee`, `change_to_address_fee`, `change_return_address_fee`, `return`.

> **Lưu ý quan trọng:** Calculate Fee và Leadtime **chỉ nhận địa chỉ kiểu cũ** (`to_district_id` + `to_ward_code`); tài liệu không có field cho địa chỉ 2 cấp mới. Vì vậy OptiPack **bắt buộc** phải đổi địa chỉ người nhận sang mã quận + mã phường của GHN (xem mục 3.3).

#### (11) Create Order — `POST /v2/shipping-order/create`

**Người nhận**

| Field | Bắt buộc | Ghi chú |
|---|---|---|
| `to_name` | Có | ≤ 1024 ký tự |
| `to_phone` | Có | Sai định dạng → `PHONE_INVALID` |
| `to_address` | Có | Địa chỉ đầy đủ, ≤ 1024 ký tự |
| `to_ward_name` | Có | Tên phường/xã |
| `to_district_name` | Có nếu `is_new_to_address=false` | Tên quận/huyện |
| `to_province_name` | Có | Tên tỉnh/thành |
| `is_new_to_address` | Không | `true` = dùng địa chỉ 2 cấp mới (không có quận) |

**Người gửi / địa chỉ hoàn:** `from_*`, `return_*` — không bắt buộc, mặc định lấy hồ sơ shop. OptiPack không gửi các field này (dùng địa chỉ kho đã đăng ký với GHN).

**Kiện hàng:** `weight` (g, ≤ 50.000), `length`, `width`, `height` (cm, ≤ 200) — **đều bắt buộc**.

**Thông tin đơn**

| Field | Bắt buộc | OptiPack gửi |
|---|---|---|
| `client_order_code` | Không (≤ 50) | `shipment_code` (VD `SHP-261007-8F3A1C`) — dùng để chống tạo trùng |
| `content` | Có nếu không gửi `items` | Tóm tắt hàng |
| `service_type_id` | Có | `2` (quần áo, giày dép đều dưới 20 kg) |
| `payment_type_id` | Có | `1` = shop trả phí ship (đơn sàn đã thu phí của khách) |
| `cod_amount` | Không (≤ 50 triệu) | `0` với đơn Lazada đã thanh toán; tổng tiền với đơn COD |
| `insurance_value` | Không (≤ 5 triệu) | Giá trị hàng (giới hạn 5 triệu) |
| `required_note` | Có | `CHOXEMHANGKHONGTHU` (mặc định, cấu hình được). Các giá trị: `KHONGCHOXEMHANG`, `CHOXEMHANGKHONGTHU`, `CHOTHUHANG` |
| `note` | Không | Ghi chú cho shipper |
| `items[]` | Không với `service_type_id=2` | `{ name, code (master SKU), quantity, price }` |

Response: `data.order_code` (mã vận đơn GHN), `data.fee` (chi tiết phí), `data.total_fee`, `data.expected_delivery_time` (ISO 8601).

Lỗi: `USER_ERR_COMMON`, `PHONE_INVALID`, `CLIENT_NOT_OWNER_OF_SHOP`, `ROUTE_NOT_FOUND_SERVICE` (không có tuyến giữa quận gửi và quận nhận), `SERVICE_NOT_FOUND_CONFIG_FEE`, `SERVER_ERROR_COMMON`.

#### (10) Preview Order — `POST /v2/shipping-order/preview`
Cùng body và cùng kiểm tra như Create Order, **không tạo đơn**; `order_code` trả về rỗng. Dùng để hiển thị phí và ngày giao trước khi Shipping Coordinator xác nhận.

#### (15) Cancel Order — `POST /v2/switch-status/cancel`
Body: `{ "order_codes": ["..."], "reason_code": "GHN-CO002", "reason": "..." }`.
- Chỉ một mã sai hoặc không thuộc tài khoản → **cả request bị từ chối**. OptiPack gửi từng mã một.
- `result: false` trong `data` = trạng thái hiện tại không cho huỷ (GHN đã lấy hàng).
- Mã lý do huỷ: `GHN-CO001` lấy hàng quá lâu, `GHN-CO002` hết hàng, `GHN-CO003` người nhận không muốn nhận, `GHN-CANCEL-OTHER` khác.

#### (12) Print Order — `POST /v2/a5/gen-token`
Body `{ "order_codes": ["..."] }` → token dùng được khoảng 30 phút. Mở một trong các URL:
- `https://<host>/a5/public-api/printA5?token=<token>`
- `https://<host>/a5/public-api/print80x80?token=<token>`
- `https://<host>/a5/public-api/print52x70?token=<token>`

Một mã sai làm hỏng cả lô. Token chỉ có hạn 30 phút nên BE **không lưu URL**, mỗi lần in gọi lại `gen-token`.

#### (7) Get Service — `POST /v2/shipping-order/available-services`
Body `{ "shop_id": <int>, "from_district": <int>, "to_district": <int> }` → mảng `{ service_id, short_name, service_type_id }`. Response rỗng (HTTP 200, không có body) nghĩa là không tìm thấy shop.

#### (1)–(5) Danh mục địa chỉ

| API | Field trả về cần dùng |
|---|---|
| Get Province (cũ) | `ProvinceID`, `ProvinceName` |
| Get District (cũ) | `DistrictID`, `DistrictName`, `SupportType` (0 khoá, 1 chỉ lấy, 2 chỉ giao, 3 cả hai) |
| Get Ward (cũ) | `WardCode` (**chuỗi, giữ số 0 ở đầu**), `WardName`, `SupportType` |
| Get Province (mới) | `_id`, `name`, `extension_names`, `status` (1 hoạt động) — 34 tỉnh |
| Get Ward (mới) | `_id`, `name` (dùng nguyên văn làm `to_ward_name`), `extension_names`, `parent_id`, `status`; tối đa 200 bản ghi/lần |

#### (16) Order Status Callback (webhook)

- Đăng ký: Developer Portal → menu tài khoản → **Webhook configuration** → tab **Order** → dán URL → **Create webhook**. Có hiệu lực sau khoảng 15 phút (GHN cache). Cấu hình test và thật tách riêng.
- OptiPack phải trả **HTTP 2xx**. 4xx (trừ 408, 429) → GHN bỏ, không gửi lại. 5xx / 408 / 429 / quá thời gian → GHN gửi lại (từ 30 giây đến 12 giờ, tối đa 11 lần). **Hệ quả:** lỗi do OptiPack (VD không tìm thấy vận đơn) vẫn nên trả 200 và ghi log, chỉ trả 5xx khi muốn GHN gửi lại.
- Tài liệu **không mô tả chữ ký** cho callback → OptiPack bảo vệ endpoint bằng secret riêng (header tuỳ chỉnh hoặc tham số trên URL — xem mục 3.5).
- Payload mẫu (nguyên văn từ tài liệu GHN):

```json
{
  "ShopID": 196560,
  "Time": "2026-07-15T04:49:47.811Z",
  "OrderCode": "LADFYR",
  "ClientOrderCode": "SHOP-2026-00193",
  "Type": "switch_status",
  "Description": "Cập nhật trạng thái đơn hàng",
  "Status": "delivered",
  "Reason": "",
  "ReasonCode": "",
  "CODAmount": 285000,
  "CODTransferDate": null,
  "Weight": 600,
  "ConvertedWeight": 800,
  "Length": 25,
  "Width": 20,
  "Height": 8,
  "PaymentType": 2,
  "IsPartialReturn": false,
  "PartialReturnCode": "",
  "Fee": {},
  "TotalFee": 0,
  "Warehouse": "",
  "ShipperName": "",
  "ShipperPhone": "",
  "PodURL": ""
}
```

- `Type`: `create`, `switch_status`, `update_weight`, `update_cod`, `update_fee`, `update_payment_type`, `cod`, `update_partial_return`. OptiPack xử lý `switch_status` (đổi trạng thái) và `update_weight` / `update_fee` (cập nhật trọng lượng quy đổi, phí thật — dữ liệu đối soát chi phí). Các loại khác chỉ ghi log.

---

## 3. Thay đổi trong OptiPack

### 3.1. Mô hình dữ liệu

**`orders.recipient`** — thêm địa chỉ có cấu trúc (hiện chỉ có `address_line1/2`, `city`; Lazada trả `address3/4/5` nhưng mapper đang bỏ):

| Field mới | Nguồn Lazada | Ghi chú |
|---|---|---|
| `province_name` | `address3` | Cần đối chiếu response thật trước khi chốt |
| `district_name` | `address4` | Có thể rỗng nếu Lazada đã chuyển sang địa chỉ 2 cấp |
| `ward_name` | `address5` | |

~~Collection mới `carrier_locations`~~ — **bỏ (10/10/2026)**, xem mục 3.3.

**`shipments`** — thêm field (chỉ THÊM, vận đơn cũ không bị ảnh hưởng):

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `carrier` | `'ghn' \| 'lazada' \| 'self'` | Mặc định `'self'` cho vận đơn cũ |
| `carrier_order_code` | String \| null | `order_code` của GHN, unique khi khác null |
| `carrier_status` | String \| null | Trạng thái gốc của GHN (`picked`, `delivering`…) |
| `carrier_fee` | Object \| null | `{ total, service_fee, insurance_fee, cod_fee, ... }` lúc tạo đơn |
| `carrier_final_fee` | Number \| null | Phí sau cập nhật (webhook `update_fee`) |
| `parcel` | Object | `{ weight_g, length_cm, width_cm, height_cm, converted_weight_g }` |
| `to_location` | Object | `{ street, ward_name, province_name, district_id, ward_code }` — địa chỉ đã gửi GHN (sửa theo mục 3.3) |
| `expected_delivery_at` | Date \| null | Từ GHN |
| `cod_amount` | Number | |

**`shipment_events`** — thêm `source: 'ghn_webhook' | 'simulator' | 'manual' | 'system'`, `carrier_status`, `reason_code`, `raw_payload` (lưu nguyên payload để đối soát).

**Collection mới `carrier_webhook_events`** — chống xử lý trùng (GHN có thể gửi lại): khoá `OrderCode + Type + Status + Time`.

### 3.2. Trạng thái vận đơn

Bổ sung 2 trạng thái đầu luồng vào `ShipmentStatus`:

| Mới | Ý nghĩa |
|---|---|
| `awaiting_pickup` | Đã tạo vận đơn GHN, chờ shipper đến lấy (`ready_to_pick`, `picking`) |
| `in_transit` | GHN đã lấy hàng, đang trung chuyển (`picked`, `storing`, `sorting`, `transporting`) |
| `cancelled` | Đã huỷ vận đơn GHN |

Bảng map trạng thái GHN → OptiPack:

| GHN | OptiPack `shipments.status` | Nhóm đơn |
|---|---|---|
| `ready_to_pick`, `picking`, `money_collect_picking` | `awaiting_pickup` | `packed` |
| `picked`, `storing`, `sorting`, `transporting` | `in_transit` | `shipped` |
| `delivering`, `money_collect_delivering` | `out_for_delivery` | `shipped` |
| `delivered` | `delivered` | `delivered` |
| `delivery_fail` | `delivery_failed` (lưu `ReasonCode` GHN-DFC…/DCD…) | `shipped` |
| `waiting_to_return`, `return`, `return_transporting`, `return_sorting`, `returning`, `return_fail` | `returning_to_warehouse` | `shipped` |
| `returned` | `returned_to_warehouse` → tạo RMA `failed_delivery` (G3) | `returned` |
| `cancel` | `cancelled` | quay về `packed` (tạo lại vận đơn được) |
| `exception`, `lost`, `damage`, `scrap` | Giữ trạng thái cũ + cờ `incident` + thông báo Store Owner | — |

**Khác với G1:** khi `carrier = 'ghn'`, số lần giao lại, thời gian giữa các lần giao và việc tự hoàn hàng **do GHN quyết định**. OptiPack chỉ ghi nhận. Các luật `MAX_DELIVERY_ATTEMPTS`, `SHIPMENT_MIN_RETRY_GAP_MINUTES` chỉ áp dụng cho `carrier = 'self'`. Webhook GHN được phép "nhảy" trạng thái (VD từ `awaiting_pickup` thẳng tới `delivered`) vì có thể mất hoặc đến không đúng thứ tự — bảng chuyển trạng thái chặt của G1 không áp dụng cho nguồn GHN, chỉ chặn đi lùi khỏi trạng thái kết thúc.

### 3.3. Địa chỉ gửi GHN (đã đổi thiết kế 10/10/2026 sau khi test thật)

**Vấn đề:** Lazada che số nhà/đường của mọi đơn (`***`), chỉ còn **phường mới** (sau sáp nhập 07/2025) và tỉnh. Calculate Fee của GHN chỉ nhận mã quận/phường kiểu cũ.

**Kết quả test thật trên staging** (`be/scripts/ghn-preview-new-address.ts`, API Preview, không tạo vận đơn):

| Gửi lên GHN (`is_new_to_address=true` trừ dòng cuối) | Kết quả |
|---|---|
| Phường Bình Lợi Trung + tỉnh, **không số nhà** | ✅ 20.900đ |
| "47/88 Nguyễn Văn Đậu" + Phường Bình Lợi Trung | ❌ `To address conflict` |
| "47/88 Nguyễn Văn Đậu" + Phường Gia Định | ✅ 20.900đ |
| "47/88 Nguyễn Văn Đậu" + Phường Bình Thạnh | ❌ `To address conflict` |
| Kiểu cũ: mã Quận Bình Thạnh 1462 + mã phường | ✅ 20.900đ |

**Thiết kế chốt:**

1. **Không làm** bảng `carrier_locations` và bộ đồng bộ danh mục như kế hoạch cũ: GHN nhận thẳng tên phường mới + tỉnh.
2. Mặc định gửi **kiểu mới 2 cấp**: `is_new_to_address=true`, `to_ward_name`, `to_province_name` (tên tỉnh dạng trần, VD "Hồ Chí Minh"). Lấy từ `orders.recipient` (C1). Kiểu cũ (mã quận + mã phường) giữ làm dự phòng khi có đủ mã.
3. **Báo phí bằng API Preview** (trả `total_fee`, nhận địa chỉ mới). Calculate Fee chỉ dùng cho so sánh phương án đóng gói (C6) với mã cũ.
4. Số nhà/đường: lấy từ đơn nếu sàn không che; Lazada che thì Shipping Coordinator nhập thêm (không bắt buộc ở demo).
5. GHN tự đối chiếu số nhà/đường với phường. Lệch → BE trả `CARRIER_ADDRESS_CONFLICT` (422) kèm thông báo "Số nhà/đường không thuộc phường đã chọn". Coordinator sửa phường, hoặc bỏ số nhà rồi gửi lại.
6. Đơn thiếu phường hoặc tỉnh → `CARRIER_ADDRESS_INCOMPLETE` (422), Coordinator nhập tay phường và tỉnh.

Code: `carriers/utils/recipient-address.util.ts` (`buildCarrierRecipient`, `toCarrierProvinceName`), `ghn.adapter.ts` (`toAddressFields`).

### 3.4. Module mới `carriers/`

```
be/src/modules/carriers/
├── carriers.module.ts
├── carrier-adapter.interface.ts     # calculateFee, preview, createOrder, cancel, getOrder, printLabel
├── adapters/
│   ├── ghn.adapter.ts               # gọi HTTP GHN
│   └── mock.adapter.ts              # không gọi mạng, phí theo công thức — dự phòng khi demo
├── ghn/
│   ├── ghn-status.map.ts            # bảng map mục 3.2
│   ├── ghn-reason-codes.ts
│   └── ghn-location-sync.service.ts # đồng bộ carrier_locations
├── address-resolver.service.ts      # mục 3.3
├── carrier-webhook.controller.ts    # POST /carriers/ghn/webhook
├── shipper-simulator.controller.ts  # chỉ bật khi SHIPPER_SIMULATOR_ENABLED=true
└── schemas/ (carrier-location, carrier-webhook-event)
```

`ShipmentsService` gọi `CarrierAdapter` qua interface; thêm hãng mới = thêm 1 adapter, không sửa luồng.

### 3.5. Endpoint OptiPack mới

| Method | Route | Role | Mục đích |
|---|---|---|---|
| POST | `/shipments/:id/carrier/quote` | Shipping Coordinator, Admin | Calculate Fee + Preview, trả phí và ngày giao dự kiến |
| POST | `/shipments/:id/carrier/create` | Shipping Coordinator, Admin | Create Order GHN |
| POST | `/shipments/:id/carrier/cancel` | Shipping Coordinator, Admin | Cancel Order (kèm `reason_code`) |
| GET | `/shipments/:id/carrier/label` | Shipping Coordinator, Packaging Staff | Gọi `gen-token`, trả URL in (không lưu) |
| POST | `/shipments/:id/carrier/sync` | Shipping Coordinator, Admin | Gọi Order Info, cập nhật trạng thái (dự phòng mất webhook) |
| PATCH | `/shipments/:id/to-location` | Shipping Coordinator | Sửa địa chỉ gửi GHN: số nhà, phường, tỉnh (mục 3.3) |
| POST | `/carriers/ghn/webhook?secret=...` | **Public** + secret | Nhận callback GHN |
| GET | `/shipper-simulator/shipments` | Shipper giả lập | Danh sách vận đơn GHN đang chạy |
| POST | `/shipper-simulator/shipments/:id/events` | Shipper giả lập | Gửi sự kiện, BE dựng payload GHN rồi đi cùng đường xử lý với webhook |

Màn hình danh sách vận chuyển thêm cột **Đơn vị vận chuyển**, **Mã vận đơn GHN**, **Phí ship**, **Ngày giao dự kiến**.

### 3.6. Tác động lên dữ liệu và luồng cũ (theo quy tắc 26/09)

| Đối tượng | Tác động | Cách xử lý |
|---|---|---|
| Vận đơn G1 đã có | Không có `carrier` | Đọc như `'self'`; nút G1 cũ vẫn chạy cho vận đơn `self` |
| Nút giao/thất bại/giao lại (G1) | Trùng vai trò với webhook | Chặn với vận đơn `carrier='ghn'` (409 `SHIPMENT_MANAGED_BY_CARRIER`); vẫn dùng cho `self` |
| Cron quá hạn giao (15 phút) | Hạn giao do GHN cung cấp | Với `ghn`: `due_at = expected_delivery_at`; logic quét giữ nguyên |
| Đơn cũ thiếu `province/district/ward_name` | Không tự khớp được | Script backfill đọc lại từ Lazada khi sync lần tới; còn lại chọn tay |
| RMA thất bại giao (G3) | Trước do nút "Kho nhận hàng hoàn" | Với `ghn`: webhook `returned` đưa vận đơn về `returned_to_warehouse`; Warehouse Staff **vẫn phải quét nhận** để tạo RMA và kiểm hàng (hàng chưa chắc đã về kho thật) |
| Lazada Pack (02/10) | Độc lập | Giữ nguyên; Pack báo Lazada "đã đóng gói", GHN lo vận chuyển |

---

## 4. Tối ưu chi phí đóng gói và vận chuyển

Mục tiêu đổi từ "thùng nhỏ nhất" sang **tổng chi phí nhỏ nhất**:

```
Tổng chi phí = giá bao bì + vật liệu chèn + phí ship GHN (theo trọng lượng tính cước) + rủi ro hư hỏng ước tính
Trọng lượng tính cước = max(trọng lượng thật, trọng lượng quy đổi)
```

GHN trả `ConvertedWeight` trong webhook, nên OptiPack đo được trọng lượng quy đổi thật thay vì đoán hệ số.

Cách làm cụ thể:
1. **Tính phí cho từng phương án đóng gói.** Bộ gợi ý đóng gói sinh 2–3 phương án (túi niêm phong, thùng nhỏ, thùng vừa) → gọi Calculate Fee cho mỗi phương án (cache theo `to_district + trọng lượng + kích thước`) → xếp hạng theo tổng chi phí. Đây là số liệu trả lời câu hỏi "vì sao chọn thùng A".
2. **Ưu tiên túi niêm phong cho hàng mềm** (quần áo): kích thước nhỏ, trọng lượng quy đổi thấp.
3. **Tránh vượt bậc cước:** nếu kiện vượt ngưỡng một chút, thử phương án gọn hơn.
4. **Gom đơn:** 1 vận đơn thay cho nhiều vận đơn — ghi lại số tiền ship tiết kiệm (phí từng đơn riêng − phí kiện gộp) cho dashboard.
5. **So sánh nhiều hãng** khi có thêm adapter GHTK.
6. **Đối soát:** so `carrier_fee.total` lúc tạo với `carrier_final_fee` (webhook `update_fee` / `update_weight`). Chênh lệch lớn nghĩa là kích thước/khối lượng khai báo sai → cảnh báo cho Packaging Staff.

---

## 5. Hướng dẫn từng bước

### Bước 1 — Đăng ký tài khoản môi trường test

1. Mở **`https://developer.ghn.dev`** (cổng developer môi trường test).
2. Bấm **Log in** ở góc phải trên.
3. Đăng nhập bằng số điện thoại (hoặc Google / Apple), nhập mã OTP gửi về điện thoại.
4. Nếu được yêu cầu, tạo cửa hàng với địa chỉ **kho lấy hàng** (dùng địa chỉ kho demo của nhóm). Đây là địa chỉ GHN dùng làm điểm gửi mặc định.

> Tài khoản test và tài khoản thật (`developer.ghn.vn`) **tách biệt**. Token test không dùng được ở môi trường thật.

### Bước 2 — Lấy Token và ShopId

1. Mở menu tài khoản ở góc phải → **Manage token**.
2. Ở thẻ **Token API** bấm biểu tượng con mắt → nhập OTP 6 số gửi về điện thoại → token hiện ra → bấm biểu tượng sao chép.
3. **ShopId** nằm trong phần thông tin tài khoản / cửa hàng.
4. Lưu Token vào trình quản lý mật khẩu của nhóm. **Không** dán vào chat, tài liệu, commit hay log.

### Bước 3 — Cấu hình `.env` của BE

```env
# ===== Đơn vị vận chuyển =====
CARRIER_MODE=ghn_staging           # ghn_staging | ghn_production | mock
GHN_BASE_URL=https://dev-online-gateway.ghn.vn
GHN_TOKEN=<token từ Bước 2>
GHN_SHOP_ID=<shop id từ Bước 2>
GHN_DEFAULT_SERVICE_TYPE_ID=2
GHN_DEFAULT_REQUIRED_NOTE=CHOXEMHANGKHONGTHU
GHN_WEBHOOK_SECRET=<chuỗi ngẫu nhiên ≥ 32 ký tự>
SHIPPER_SIMULATOR_ENABLED=true     # PHẢI là false trên môi trường thật
```

Thêm các khoá này (giá trị để trống) vào `.env.example`.

### Bước 4 — Gọi thử từng API bằng Postman

Tạo một Postman Environment có biến `ghn_base`, `ghn_token`, `ghn_shop_id`. Mọi request đặt header `Token: {{ghn_token}}`, `ShopId: {{ghn_shop_id}}`, `Content-Type: application/json`.

**4.1. Kiểm tra token — Get Shop**
```
GET {{ghn_base}}/shiip/public-api/v2/shop/all
```
Kỳ vọng: thấy cửa hàng vừa tạo, ghi lại `district_id` và `ward_code` của kho.

**4.2. Lấy địa chỉ người nhận thử**
```
GET {{ghn_base}}/shiip/public-api/master-data/province
GET {{ghn_base}}/shiip/public-api/master-data/district?province_id=<ProvinceID>
GET {{ghn_base}}/shiip/public-api/master-data/ward?district_id=<DistrictID>
```
Chọn 1 tỉnh, 1 quận, 1 phường bất kỳ (ví dụ trong TP. Hồ Chí Minh), ghi lại `DistrictID` và `WardCode` (giữ nguyên dạng chuỗi).

**4.3. Lấy gói dịch vụ**
```
POST {{ghn_base}}/shiip/public-api/v2/shipping-order/available-services
{ "shop_id": <ShopId>, "from_district": <district kho>, "to_district": <DistrictID nhận> }
```
Kỳ vọng: có phần tử `service_type_id: 2`.

**4.4. Tính phí — so sánh 2 cách đóng gói**
```
POST {{ghn_base}}/shiip/public-api/v2/shipping-order/fee
{ "service_type_id": 2, "to_district_id": <DistrictID>, "to_ward_code": "<WardCode>",
  "weight": 300, "length": 30, "width": 25, "height": 4 }
```
Gửi lại với `"length": 40, "width": 30, "height": 20` → so sánh `total`. Đây chính là số liệu demo cho phần tối ưu đóng gói.

**4.5. Xem trước đơn**
```
POST {{ghn_base}}/shiip/public-api/v2/shipping-order/preview
{
  "payment_type_id": 1, "required_note": "CHOXEMHANGKHONGTHU", "service_type_id": 2,
  "to_name": "Nguyen Van A", "to_phone": "0900000000",
  "to_address": "1 Duong Thu Nghiem", "to_ward_name": "<WardName>",
  "to_district_name": "<DistrictName>", "to_province_name": "<ProvinceName>",
  "weight": 300, "length": 30, "width": 25, "height": 4,
  "client_order_code": "TEST-0001", "content": "Ao polo x1", "cod_amount": 0
}
```
Kỳ vọng: có `total_fee`, `expected_delivery_time`, `order_code` rỗng.

**4.6. Tạo vận đơn thật trên môi trường test** — cùng body, đổi đường dẫn sang `/v2/shipping-order/create`. Ghi lại `order_code`.

**4.7. Xem đơn**
```
GET {{ghn_base}}/shiip/public-api/v2/shipping-order/detail?order_code=<order_code>
GET {{ghn_base}}/shiip/public-api/v2/shipping-order/detail-by-client-code?client_order_code=TEST-0001
```
Ghi lại trạng thái (dự kiến `ready_to_pick`). Đợi vài giờ rồi gọi lại để xác nhận môi trường test có tự đổi trạng thái hay không, rồi ghi kết quả vào mục 7.

**4.8. In nhãn**
```
POST {{ghn_base}}/shiip/public-api/v2/a5/gen-token
{ "order_codes": ["<order_code>"] }
```
Mở `{{ghn_base}}/a5/public-api/printA5?token=<token>` bằng trình duyệt.

**4.9. Huỷ đơn**
```
POST {{ghn_base}}/shiip/public-api/v2/switch-status/cancel
{ "order_codes": ["<order_code>"], "reason_code": "GHN-CO002" }
```

Lưu bộ request thành Postman Collection `GHN-Staging` để cả nhóm dùng chung (không lưu token trong collection, chỉ trong Environment cá nhân).

### Bước 5 — Đăng ký webhook (tuỳ chọn ở môi trường test)

Chỉ cần nếu muốn thử GHN gọi thật. Khi demo bằng trang giả lập thì **bỏ qua bước này**.

1. Chạy BE và ngrok (`ngrok http --url=<domain> 3000`).
2. Developer Portal → menu tài khoản → **Webhook configuration** → tab **Order**.
3. Dán `https://<domain ngrok>/carriers/ghn/webhook?secret=<GHN_WEBHOOK_SECRET>` → **Create webhook**.
4. Đợi khoảng 15 phút cho GHN cập nhật cache.

### Bước 6 — Demo bằng trang giả lập shipper

1. Đặt `SHIPPER_SIMULATOR_ENABLED=true`, khởi động lại BE.
2. Trên điện thoại (cùng mạng Wi-Fi với máy chạy BE, hoặc qua ngrok) mở trang giả lập.
3. Chọn vận đơn GHN vừa tạo, bấm lần lượt:

| Nút | Trạng thái GHN gửi đi | Màn hình quản trị |
|---|---|---|
| Đã lấy hàng | `picked` | Đang trung chuyển |
| Đang giao | `delivering` | Đang giao |
| Giao thành công | `delivered` | Giao thành công, nhóm đơn `delivered` |
| Giao thất bại (chọn lý do) | `delivery_fail` + `ReasonCode` (VD `GHN-DFC1A4`) | Giao thất bại |
| Đang hoàn về | `returning` | Đang hoàn về kho |
| Đã hoàn về shop | `returned` | Đã hoàn — Warehouse Staff quét nhận, tạo RMA |

Mỗi lần bấm, BE dựng payload theo đúng định dạng webhook GHN và xử lý qua cùng hàm với webhook thật; sự kiện được ghi `source: 'simulator'`.

### Bước 7 — Chuyển sang môi trường thật (sau đồ án)

Đăng ký tài khoản ở `developer.ghn.vn`, lấy Token/ShopId thật, đổi `CARRIER_MODE=ghn_production`, `GHN_BASE_URL=https://online-gateway.ghn.vn`, `SHIPPER_SIMULATOR_ENABLED=false`, đăng ký webhook với domain thật.

---

## 6. Kế hoạch triển khai

| Đợt | Nội dung | Trạng thái |
|---|---|---|
| C1 | `orders.recipient` thêm `province_name/district_name/ward_name` + mapper Lazada + backfill | ✅ `feat(AOFP-66)` |
| C2 | Module `carriers/`: interface, `ghn.adapter`, `mock.adapter`, cấu hình env | ✅ `feat(AOFP-67)` |
| C3 | Địa chỉ 2 cấp mới (`is_new_to_address`), dựng địa chỉ từ đơn, mã lỗi `ADDRESS_CONFLICT` / `ADDRESS_INCOMPLETE` — **thu gọn**, bỏ `carrier_locations` (mục 3.3) | ✅ code xong 10/10 |
| C4 | Mở rộng `shipments`, route quote/create/cancel/label/sync/to-location, chặn nút G1 cho vận đơn GHN | Chưa làm |
| C5 | Webhook GHN + chống trùng + map trạng thái + nút giả lập trạng thái cho Coordinator | Chưa làm |
| C6 | Tính phí theo nhiều phương án đóng gói | Chưa làm |

Số AOFP gán lúc commit (tăng dần). Mỗi đợt kiểm tra đủ `npx tsc --noEmit`, `npm run lint`, `npm run test` trước khi giao.

---

## 7. Hạn chế hiện tại và hướng khắc phục

| Hạn chế | Hướng khắc phục |
|---|---|
| Môi trường test GHN nhiều khả năng không tự đổi trạng thái | Trang giả lập shipper gửi đúng định dạng webhook; kiểm chứng ở Bước 4.7 |
| Calculate Fee chỉ nhận mã quận + mã phường kiểu cũ | Bắt buộc đổi địa chỉ sang mã GHN; địa chỉ 2 cấp mới khớp không được thì chọn tay |
| Định dạng `address3/4/5` của Lazada sau sáp nhập 07/2025 chưa được kiểm chứng bằng response thật | Ghi log response thật của 1 đơn trước khi chốt mapper (C1) |
| Webhook GHN không có chữ ký | Secret trên URL / header tuỳ chỉnh; chỉ nhận đơn có `ShopID` khớp `GHN_SHOP_ID` và `OrderCode` có trong DB |
| Bảo hiểm tối đa 5 triệu, COD tối đa 50 triệu | Kiểm tra trước khi gọi, báo lỗi rõ cho nhân viên |
| Đơn Lazada giao bằng GHN: Lazada không biết mã vận đơn GHN | Ngoài phạm vi demo; ghi nhận làm hướng phát triển |
| Chỉ có 1 hãng | Interface `CarrierAdapter` sẵn sàng cho GHTK |

## 8. Các câu hỏi đã chốt

1. `required_note` mặc định: `CHOXEMHANGKHONGTHU` — **đã chốt**.
2. Shipping Coordinator xem phí rồi bấm xác nhận tạo vận đơn GHN — **đã chốt**.
3. Mọi đơn (Lazada và AURELLE) đều gửi qua GHN — **đã chốt**.
4. Demo chỉ trên web: Coordinator bấm các nút trạng thái giả lập; nút đi qua cùng hàm xử lý với webhook GHN thật — **đã chốt**.
