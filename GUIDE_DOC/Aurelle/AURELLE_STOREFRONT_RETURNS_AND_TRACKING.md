# AURELLE — Theo dõi đơn, khách hủy đơn và trả hàng (20/10/2026, bổ sung 21/10/2026 — mục 8)

Tài liệu cho nhóm FE storefront và nhóm AURELLE. Bổ sung mục 7.8 / 13 #4 của `AURELLE_MARKETPLACE_DESIGN.md`. Mọi route dưới đây đã có test và đã chạy thử với MongoDB thật (xem mục 7 để biết phần nào CHƯA chạy thật).

## 1. Tổng quan luồng

```
Khách (storefront :3001) ──► backend OptiPack :3000 (module storefront, DB storefront_*)
        ▲   webhook order_status_changed / return_requested (ký HMAC) ─────┐
        │                                                                  ▼
 Open API AURELLE (mock :4000, đọc/ghi cùng DB)  ◄── OptiPack kéo đơn, kéo yêu cầu trả hàng
        ▲   POST /order/status/update · POST /reverse/order/update ◄── hàng đợi ghi ngược (outbox)
```

- Trạng thái đơn (đã đóng gói, đang giao, đã giao, giao thất bại, hoàn về) **không do website tự đoán**: OptiPack gửi ngược qua hàng đợi `marketplace_status_outbox` (cron 15 giây), website ghi vào `storefront_orders`, `storefront_shipments`, `storefront_order_events`.
- Yêu cầu trả hàng của khách là dữ liệu của website; **OptiPack quyết định duyệt/từ chối** và báo lại qua Open API. Website không tự duyệt.

## 2. Route cho khách (cookie đăng nhập khách)

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/storefront/orders/:id` | 🔄 thêm `trackingCode`, `tripCode`, `events[]` (`status`, `label`, `reason`, `occurredAt`, `source`) — hành trình đơn, mới nhất ở cuối mảng |
| POST | `/storefront/orders/:id/cancel` | 🆕 Khách hủy đơn. Body tùy chọn `{ reason }` (≤ 300 ký tự). Chỉ khi `status = pending` **và** `fulfillmentStatus = awaiting_packaging` |
| POST | `/storefront/orders/:id/returns` | 🆕 Gửi yêu cầu trả hàng. Body `{ type: 'return_refund' \| 'refund_only', items: [{ sku, quantity, reason_code }], customer_note? }` |
| GET | `/storefront/returns` | 🆕 Yêu cầu trả hàng của khách (50 gần nhất) |
| GET | `/storefront/returns/:id` | 🆕 Chi tiết + `events[]` (tiến trình xử lý) |

`reason_code`: `size_not_fit`, `defective`, `wrong_item`, `not_as_described`, `changed_mind`, `other`.

Response yêu cầu trả hàng: `id`, `orderId`, `orderNumber`, `type`, `status` (`requested|approved|rejected|received|closed|canceled`), `statusLabel` (tiếng Việt, hiện thẳng cho khách), `items[]` (`sku`, `quantity`, `reasonCode`, `reasonLabel`), `customerNote`, `rmaCode`, `decisionNote`, `createdAt`, `updatedAt`.

### Mã lỗi mới

| Mã | HTTP | Khi nào |
|---|---|---|
| `SF_ORDER_NOT_CANCELLABLE` | 409 | Đơn đã đóng gói/giao hoặc đã hủy |
| `SF_RETURN_ORDER_NOT_DELIVERED` | 409 | Đơn chưa giao thành công |
| `SF_RETURN_WINDOW_EXPIRED` | 409 | Quá 15 ngày kể từ khi nhận hàng |
| `SF_RETURN_INVALID_ITEMS` | 400 | Sản phẩm không thuộc đơn, chọn trùng, hoặc vượt số lượng còn được trả (đã trừ các yêu cầu trước không bị từ chối/hủy) |
| `SF_RETURN_OPEN_EXISTS` | 409 | Đơn đang có yêu cầu trả hàng chưa xử lý xong (cũng chặn ở DB bằng index duy nhất — 2 lần bấm cùng lúc không tạo 2 phiếu) |
| `SF_RETURN_NOT_FOUND` | 404 | Không có / không phải của khách |

## 3. Open API mới (khuôn Lazada, ký HMAC như mọi API)

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/rest/order/status/update` | 🔄 **Nay ghi thật** (trước chỉ echo). Body `order_id`, `status` (`packed\|shipped\|delivered\|failed_delivery\|shipped_back\|returned`), `event_time` (ISO), `idempotency_key`, tùy chọn `tracking_code`, `trip_code`, `reason`, 🆕 21/10 `carrier` (tên hãng) |
| GET | `/rest/reverse/orders/get` | 🆕 Yêu cầu trả hàng của khách. Query `status`, `update_after`, `offset`, `limit` (≤ 100). `data: { returns[], count }` |
| POST | `/rest/reverse/order/update` | 🆕 OptiPack báo kết quả. Body `return_id`, `status` (`approved\|rejected\|received\|closed\|canceled`), `event_time`, `idempotency_key`, tùy chọn `rma_code`, `decision_note` |

Quy tắc phía AURELLE khi nhận cập nhật (đã kiểm với DB thật):
- **Idempotent** theo `idempotency_key` — gửi lại không ghi thêm hành trình, trả `applied: false`.
- Sự kiện **cũ hơn** trạng thái đã ghi (theo `event_time`) chỉ lưu lịch sử, không kéo đơn lùi.
- Đơn đã hủy không đổi trạng thái giao hàng nữa.
- Giao thành công (`delivered`) → đơn `completed` và COD `paid`.
- Phiếu trả hàng chỉ đi theo thứ tự `requested → approved → received → closed` (hoặc `rejected`/`canceled`); sự kiện sai thứ tự bị bỏ qua.
- **Không** phát webhook ngược về OptiPack (tránh vòng lặp).

Webhook mới `return_requested` (cùng khuôn `order_status_changed`, `data: { trade_order_id, return_id }`): OptiPack kéo ngay yêu cầu mới; cron 2 phút làm lưới an toàn.

## 4. Phía OptiPack (nhân viên)

- Phiếu do khách gửi có `source = marketplace`, `external_ref` = id yêu cầu của website, `source_order_id` = đơn gốc của khách. Hiện trong `GET /returns` như mọi phiếu; **Store Owner/Admin duyệt hoặc từ chối** bằng các route `/returns/:id/approve|reject` đã có.
- Số lượng được trả tính theo **đơn gốc của khách**, không phải cả nhóm gộp nhiều đơn.
- Yêu cầu không thể hợp lệ (nhóm chưa giao, quá hạn, sai món) được **tự từ chối kèm lý do** và báo ngược cho khách — khách không bị kẹt ở "đang chờ". Lỗi dữ liệu/hạ tầng thì giữ nguyên "đang chờ" và thử lại lượt sau.
- Nhóm đang có phiếu khác chưa xong → yêu cầu của khách chờ (`busy`), không bị từ chối.
- Kết quả xử lý (duyệt, từ chối, nhận hàng, xong, hủy) xếp hàng báo ngược trong cùng transaction với thay đổi phiếu.
- Hủy đơn của khách → OptiPack đồng bộ thấy `canceled` → nhả giữ chỗ tồn, hủy nhóm nếu hết đơn (luồng hủy có sẵn).

## 5. Bảng ánh xạ trạng thái gửi ngược

| Sự kiện OptiPack | Gửi AURELLE |
|---|---|
| 🆕 23/10 — Lần quét lấy hàng đầu tiên của nhóm | `processing` ("Kho đang chuẩn bị hàng") — 1 lần/nhóm |
| Nhóm đóng gói xong | `packed` |
| Vận đơn tạo, chờ hãng lấy (`awaiting_pickup`) | `shipped` (+ `tracking_code`, `trip_code`) — một lần mỗi lượt giao |
| 🆕 23/10 — Hãng đã lấy / trung chuyển (`in_transit`) | `in_transit` (trước 23/10 gộp vào `shipped`) |
| 🆕 23/10 — Shipper đang giao (`out_for_delivery`) | `out_for_delivery` (trước 23/10 gộp vào `shipped`) |
| Giao thành công | `delivered` |
| Giao thất bại | `failed_delivery` (+ lý do) |
| Tự hoàn về kho | `shipped_back` |
| Kho nhận hàng hoàn | `returned` |
| Huỷ vận đơn ở hãng trước khi lấy | (không gửi; nhóm về `packed` nên có dòng `packed` mới) |

Phiếu trả hàng: `awaiting_receipt → approved`, `rejected`, `received`, `closed`, `canceled`.

## 6. Tác động tới dữ liệu và luồng đã có

1. **Dữ liệu cũ**: không cần migration. `storefront_orders` thêm `fulfillment_updated_at` (null với đơn cũ), `fulfillment_status` thêm giá trị `failed_delivery`, `shipped_back`; `storefront_shipments` thêm `trip_code`; `return_requests` thêm `external_ref`, `source_order_id`, `source = marketplace`; `marketplace_status_outbox` dòng cũ coi như `kind = order_status`. Collection mới: `marketplace_status_outbox`, `storefront_order_events`, `storefront_return_requests` (index tự tạo khi BE khởi động).
2. **Route đổi hành vi**: `POST /rest/order/status/update` ghi thật; `GET /storefront/orders/:id` thêm trường. Không route nào bị bỏ.
3. **Luồng đọc/ghi chồng nhau**: mọi đường đổi trạng thái nhóm đơn/vận đơn/phiếu trả hàng đi qua 3 điểm chung (`transitionFulfillmentStatus`, `writeEvent`, `move`) nên chỉ hook ở 3 chỗ. Gửi ngược đơn AURELLE cập nhật `updated_at` của đơn → OptiPack đồng bộ lại đúng đơn đó (vô hại, upsert).
4. **Không ảnh hưởng**: đơn Lazada (không ghi ngược theo quyết định đã chốt), tính kế hoạch đóng gói, kho, giữ chỗ tồn.
5. **Lỗi có sẵn phát hiện khi làm**: index `unique + sparse` trên khóa idempotency vẫn lập chỉ mục giá trị `null` rõ ràng nên 2 sự kiện của khách sẽ đụng nhau — đã đổi sang index partial theo kiểu chuỗi (xem schema `StorefrontOrderEvent`).

## 7. Hạn chế hiện tại và hướng khắc phục

| Hạn chế | Ảnh hưởng | Hướng khắc phục |
|---|---|---|
| **Chưa chạy thử trọn luồng BE ↔ mock ↔ storefront** bằng đơn thật đi từ lấy hàng đến giao | Phần Open API + DB đã chạy thật; outbox, kéo phiếu, webhook mới có unit test và khởi động thật (`BOOT_OK`) | Chạy `npm run start:dev` (3000) + mock (4000) + storefront (3001), kết nối shop AURELLE, đặt 1 đơn, đi hết luồng, gửi yêu cầu trả |
| ~~Chưa có đổi hàng trên storefront~~ | ✅ 21/10/2026 — xem mục 9.1 | |
| ~~Khách không tự hủy được yêu cầu trả hàng~~ | ✅ 21/10/2026 — xem mục 9.2 | |
| Hủy đơn gặp đua với đóng gói (khách bấm hủy ngay lúc OptiPack vừa đóng xong, trước khi trạng thái `packed` về website) | Đơn hủy nhưng đã đóng: nhóm đi nhánh tháo kiện (`to_unpack`) có sẵn | Chấp nhận (cửa sổ tối đa ~15 giây); nếu cần chặt hơn, kiểm tra nhóm đơn phía OptiPack trước khi nhận hủy |
| Hàng đợi ghi ngược chạy 15 giây/lượt | Khách thấy trạng thái chậm tối đa vài chục giây | Giảm chu kỳ cron hoặc kích gửi ngay sau commit |
| ~~Một nhóm chỉ có 1 phiếu mở~~ | ✅ 21/10/2026 — 1 phiếu mở / đơn, xem mục 9.3 | |
| Khách đổi hàng không thấy hành trình giao hàng đổi | Website chỉ hiện phiếu "Hoàn tất xử lý"; đơn thay thế `EXC-…` chỉ có ở OptiPack | Báo tiến độ đơn thay thế về yêu cầu trả hàng (thêm trạng thái "đang giao hàng đổi") |
| Hoàn tiền thật không có (COD, đúng phạm vi đồ án) | `closed` chỉ nghĩa là kho đã xử lý xong hàng | Ngoài phạm vi |

## 8. Bổ sung 21/10/2026 — tồn kho, tên hãng vận chuyển, chặn giả lập

### 8.1 Trừ giữ chỗ tồn khi hàng rời kho

Trước đây website chỉ **trả lại** phần giữ chỗ khi khách hủy; đơn đã gửi/giao thì `reserved_quantity` không bao giờ giảm → "còn bán được" giảm dần, Admin không hạ được tồn.

- Mỗi đơn có `stock_state`: `reserved` (mặc định, đơn cũ không có field cũng coi là reserved) → `deducted` (hàng rời kho) hoặc `released` (khách hủy).
- Khi OptiPack báo `shipped`, `delivered`, `failed_delivery`, `shipped_back` hoặc `returned`, website trừ **cả** `reserved_quantity` lẫn `quantity_on_hand` của từng biến thể, không âm, đúng **1 lần** (đổi `stock_state` có điều kiện trước rồi mới trừ). Gửi lại / gửi trùng không trừ lần 2.
- Khách hủy đơn: cổng hủy nguyên tử đặt luôn `stock_state: released`.
- Dữ liệu cũ: `be/scripts/fix-storefront-reservations.ts` (chạy thử mặc định, `--apply` mới ghi) đặt `stock_state` cho đơn cũ và tính lại `reserved_quantity` = tổng các đơn còn giữ chỗ. Đơn cũ đã giao chỉ được đánh dấu `deducted`, **không** trừ `quantity_on_hand` (không biết Admin đã chỉnh tay hay chưa).

### 8.2 Tên hãng vận chuyển + mã vận đơn đúng kiện

- `POST /rest/order/status/update` nhận thêm tùy chọn `carrier` (VD "Giao Hàng Nhanh"). Có → `storefront_shipments.carrier` ghi tên hãng; không có (tự giao / bản gửi cũ) → vẫn "OptiPack".
- OptiPack gửi `tracking_code` là **mã GHN của kiện chứa đơn đó** (nhóm gộp nhiều đơn / nhiều kiện thì mỗi đơn đúng mã của mình; không tìm thấy kiện riêng thì gửi mọi mã của vận đơn). Vận đơn GHN chưa có mã (đang đặt ở hãng) → dòng `shipped` chờ lượt sau (30 giây), để khách không thấy mã nội bộ.
- `GET /storefront/orders/:id` thêm `carrier` (bản ghi cũ ghi "OptiPack" trả `null`). Trang đơn hiện "Đơn vị vận chuyển: … · Mã vận đơn: …".

### 8.3 Tồn kho do OptiPack quản (phương án A)

- OptiPack đẩy tồn bán được sang website **mỗi phút** (và nút `POST /marketplace-writeback/stock/push`, Admin/Store Owner): số đẩy = tồn thực trong kho OptiPack − đang giữ chỗ mọi kênh. Website đặt `quantity_on_hand = số đẩy + giữ chỗ của website`.
- Chỉ SKU kho OptiPack đã có ô (kể cả đang 0). SKU kho chưa từng nhập → website tự quản như cũ.
- Biến thể được đẩy tồn có `stock_source: optipack`; Admin website thấy số + nhãn "Kho OptiPack", ô nhập bị khóa, và BE bỏ qua số tồn gửi lên khi lưu sản phẩm. Nhập/kiểm kê làm ở OptiPack.

### 8.4 Chặn giả lập trả hàng cho đơn AURELLE

`POST /returns` (Admin đóng vai khách) với nhóm đơn AURELLE → 409 `RMA_MARKETPLACE_MANAGED`. Màn tạo phiếu giả lập của OptiPack ẩn nhóm AURELLE và ghi chú lý do; chi tiết phiếu do khách gửi hiện "Khách tự yêu cầu trên AURELLE · #<id yêu cầu>". Đơn Lazada vẫn giả lập như cũ.

### 8.5 Tác động

1. Không migration bắt buộc; field mới có mặc định. Script ở 8.1 chỉ cần chạy 1 lần cho dữ liệu cũ.
2. Đổi hành vi: website trừ tồn khi hàng rời kho; Admin website không sửa được tồn của SKU kho quản; `POST /returns` chặn nhóm AURELLE.
3. Không ảnh hưởng đơn Lazada, kế hoạch đóng gói, giữ chỗ phía OptiPack.
4. Hạn chế: đẩy tồn nhớ "đã gửi" trong bộ nhớ (khởi động lại BE thì gửi lại 1 lượt — an toàn vì ghi đè); hàng hoàn của SKU **website tự quản** không tự cộng lại `quantity_on_hand` (SKU kho quản thì OptiPack nhập lại rồi đẩy sang).

## 9. Bổ sung 21/10/2026 (tối) — đổi hàng, khách tự hủy, phiếu mở theo đơn

### 9.1 Đổi hàng trên website

- **Route mới (khách):** `GET /storefront/orders/:id/exchange-options` → mỗi sản phẩm trong đơn kèm các biến thể **đang bán** của chính sản phẩm đó:
  `[{ sku, options: [{ sku, variantName, color, size, available }] }]` (`available` = tồn − đang giữ chỗ, cộng mọi kho website).
- **`POST /storefront/orders/:id/returns`** nhận thêm `type: "exchange"` và `exchange_items: [{ sku, quantity }]`. Quy tắc:
  - Phải có ít nhất 1 dòng đổi sang; tổng số lượng đổi sang **bằng** tổng số lượng trả.
  - Chỉ đổi sang biến thể đang bán của **cùng sản phẩm** với món trả (khác size/màu) → sai: 400 `SF_EXCHANGE_INVALID`.
  - Biến thể đổi sang phải còn đủ hàng → thiếu: 400 `SF_OUT_OF_STOCK`.
  - Website **không giữ chỗ** hàng đổi sang lúc gửi yêu cầu; OptiPack giữ chỗ khi tạo đơn thay thế (sau khi kiểm hàng trả).
- Response yêu cầu trả hàng thêm `exchangeItems: [{ sku, quantity }]` (rỗng với 2 loại cũ).
- **Open API** `GET /rest/reverse/orders/get`: phiếu `type = "exchange"` có thêm `exchange_items: [{ seller_sku, quantity }]`.
- **OptiPack:** tạo phiếu `exchange` (`exchange_items`). SKU đổi sang không có trong danh mục shop → tự **từ chối** kèm lý do (không treo). Kiểm hàng xong → tạo đơn thay thế `EXC-<RMA>` đi lại luồng lấy → đóng → giao như cũ. Đơn thay thế **không** gửi trạng thái về website (website không có đơn đó).
- **Giao diện website:** form trả hàng có lựa chọn "Đổi sang size / màu khác"; mỗi món đã chọn có ô chọn biến thể (biến thể hết hàng bị khóa). Trang chi tiết yêu cầu hiện "Đổi sang: …".

### 9.2 Khách tự hủy yêu cầu trả hàng

- **Route mới (khách):** `POST /storefront/returns/:id/cancel` — chỉ khi yêu cầu còn `requested` (cửa hàng chưa xử lý). Đã xử lý → 409 `SF_RETURN_NOT_CANCELLABLE`; không phải của khách → 404. Đổi trạng thái có điều kiện nên bấm 2 lần / đua với kết quả duyệt chỉ 1 bên thắng.
- Website ghi hành trình "Yêu cầu trả hàng đã được hủy" và gửi webhook **`return_canceled`**.
- **OptiPack:** webhook `return_canceled` kích hoạt 1 lượt kéo; cron 2 phút cũng kéo các yêu cầu `canceled` cập nhật trong **3 ngày** gần nhất. Phiếu bên kho:
  - `requested` hoặc `awaiting_receipt` (đã duyệt, hàng chưa về) → **hủy** (`canceled`, ghi "Khách đã hủy yêu cầu trả hàng trên website."), nhóm đơn về `delivered` nếu trước đó đã chuyển trả đủ.
  - `received` (hàng đã về kho) → giữ phiếu, ghi cảnh báo trong log để kho xử lý tiếp.
  - Đã kết thúc → bỏ qua.
- Trang chi tiết yêu cầu có nút **"Hủy yêu cầu"** khi trạng thái `requested`.

### 9.3 Phiếu trả hàng mở theo đơn

- Phiếu của khách trên sàn: **1 phiếu mở / đơn** (trước: 1 / nhóm gộp). 2 đơn khác nhau trong cùng nhóm trả song song được.
- Chặn ở tầng DB: index duy nhất `uniq_open_return_per_order` trên `return_requests` (`order_group_id + source_order_id`, chỉ phiếu `requested/awaiting_receipt/received`, nguồn `simulated/marketplace`). Phiếu giả lập (không gắn đơn) vẫn 1 / nhóm. Phiếu hoàn do giao thất bại không thuộc index.
- 2 lần tạo đồng thời: bên thua nhận 409 `RMA_OPEN_EXISTS` (phiếu của khách: "đang chờ", lượt sau thử lại).
- **Trước khi deploy:** chạy `npx ts-node -r dotenv/config scripts/check-open-return-duplicates.ts` (chỉ đọc). Có cặp trùng → hủy/từ chối phiếu thừa rồi khởi động lại backend, nếu không index không tạo được.

### 9.4 Tác động

1. Dữ liệu cũ: yêu cầu trả hàng cũ không có `exchange_items` → mặc định `[]`. Không migration.
2. Đổi hành vi: thêm 2 route khách, 1 loại webhook, 1 loại phiếu từ website; OptiPack kéo thêm yêu cầu `canceled`.
3. Không ảnh hưởng: trả hàng Lazada (giả lập), phiếu giao thất bại, giữ chỗ, đóng gói, giao hàng.
4. Hạn chế: khách chưa thấy hành trình giao hàng đổi (mục 7).

## 10. Bổ sung 22/10/2026 — hành trình hàng đổi, bỏ giả lập trả hàng

### 10.1 Khách theo dõi hàng đổi trên website
Trước đây: kiểm hàng xong, OptiPack tạo đơn thay thế `EXC-<mã phiếu>` và giao như đơn thường, nhưng đơn này không có trên website (hàng đợi ghi ngược bỏ qua `origin: replacement`) → khách chỉ thấy yêu cầu "Đã xong", không biết hàng đổi đang ở đâu.

Nay:
1. Đơn thay thế đổi trạng thái `packed | shipped | delivered | failed_delivery` → dòng `marketplace_status_outbox` của nhóm đơn thay thế được gửi qua Open API mới **`POST /rest/reverse/exchange/shipment/update`** (ký như mọi API khác) với `return_id` = mã yêu cầu trên website (`external_ref` của phiếu OptiPack), `status`, `event_time`, `carrier`, `tracking_code`, `reason` (khi giao thất bại), `idempotency_key` = `<khóa dòng outbox>:exchange:<return_id>`.
2. Chỉ gửi cho phiếu **đổi hàng do khách gửi trên AURELLE** (`source = marketplace`, `type = exchange`). Phiếu không phải đổi hàng → mock trả 400; không có → 404; vận đơn hãng thật chưa có mã → hẹn lượt sau như đơn thường.
3. Website lưu `storefront_return_requests.exchange_shipment = { status, carrier, tracking_code, updated_at }` (chỉ tiến, "đã giao" rồi thì không lùi; giao thất bại rồi giao lại vẫn nhận) và 1 dòng lịch sử `return_exchange_<status>` trong `storefront_order_events` (cùng tiền tố `return_` nên tự hiện ở "Hành trình yêu cầu").
4. `GET /storefront/returns/:id` trả thêm `exchangeShipment` + `events[].trackingCode`; trang `/account/returns/[id]` hiện khối **Hàng đổi** (trạng thái, hãng, mã vận đơn) và câu "Hàng đổi đang được chuẩn bị" khi yêu cầu đã xong mà chưa gửi.

Hàm dùng chung: `be/src/modules/storefront/aurelle-return-api.ts` (`applyExchangeShipmentUpdate`, `EXCHANGE_SHIPMENT_LABELS`); mock: `be/scripts/aurelle-mock-server.ts`, `be/scripts/aurelle-portal/storefront-store.ts` (`applyExchangeShipment`).

### 10.2 Bỏ giả lập trả hàng cho mọi sàn
`POST /returns` (OptiPack) trả `410 RMA_SIMULATION_DISABLED` cho cả Lazada lẫn AURELLE. Nguồn phiếu còn lại: khách gửi trên website (mục 9) và phiếu hoàn tự tạo khi giao thất bại. Mục 8.4 (chỉ chặn đơn AURELLE) nay áp cho mọi sàn. Demo: `DEMO_PLAYBOOK.md` Phần F.

### 10.3 Tác động
- Không migration: yêu cầu cũ không có `exchange_shipment` = null.
- Cần chạy lại mock AURELLE (:4000) bản mới để có route `/reverse/exchange/shipment/update`; mock cũ trả 404 → dòng outbox thử lại rồi `failed` sau 8 lần, không ảnh hưởng đơn thường.

## 11. Bổ sung 22/10/2026 (trưa) — SKU theo quy tắc OptiPack, tự nối, luôn cùng số tồn

### 11.1 Tạo sản phẩm trên Admin website
1. Form có mục **"Mã SKU theo quy tắc OptiPack"**: chọn **danh mục cấp 2** (lấy từ OptiPack, kèm thang size) và nhập **số mẫu** (1–999).
2. Mỗi biến thể mới chọn **màu** (danh mục màu OptiPack) và **size** (thang size của danh mục) bằng dropdown; cột SKU hiện trước mã sẽ tạo, VD `ATHUN-005-DEN-M`.
3. Lưu: BE kiểm lại toàn bộ (không tin form) — thiếu phần nào, size ngoài thang, màu không có, trùng mã → báo lỗi, không lưu.
4. Đã có biến thể theo mã: danh mục + số mẫu của sản phẩm và màu/size của biến thể đó bị khoá (đổi = SKU khác). Muốn bán màu/size khác → thêm biến thể mới.
5. Biến thể cũ (`SF-…`, mã mẫu như `SLL-BRN-37`) giữ nguyên mã và cách sửa cũ.

Điều kiện: OptiPack phải có sẵn danh mục cấp 2 (có thang size) và màu — tạo ở OptiPack **Cấu hình kho → Sản phẩm → Danh mục & màu**.

### 11.2 Tự đồng bộ với kho OptiPack
1. Lưu xong, website phát webhook `product_updated` → OptiPack kéo hồ sơ SKU mới ngay (cron catalog mỗi giờ vẫn bù).
2. SKU trùng mã **SKU nội bộ** đang dùng của OptiPack → **tự nối**: tồn tính chung theo SKU nội bộ (gộp với listing Lazada cùng sản phẩm nếu có).
3. Lượt đẩy tồn kế tiếp (≤ 1 phút) đưa số **bán được** của kho OptiPack sang website và khoá ô tồn trên Admin website → 2 bên luôn cùng số (kể cả khi kho = 0).
4. Chưa có SKU nội bộ cùng mã: SKU vẫn về OptiPack như SKU sàn thường (gán kệ, đo); tạo SKU nội bộ cùng mã sau này thì cũng tự nối.

### 11.3 Mã cũ / sản phẩm đã xoá
- Xoá sản phẩm hoặc bỏ biến thể trên website = xoá mềm; Open API báo `Status: inactive` → OptiPack tự ẩn SKU đó khỏi "SKU chưa gán", "Chưa đo", "SKU chưa nối" và không đẩy tồn.
- Dọn mã cũ ở kho: kiểm kê ô về 0 → bỏ gán khỏi kệ → (nếu cần) bấm "Ngừng dùng" SKU sàn (`PATCH /product-master/:id/retire`).

## 12. Bổ sung 22/10/2026 (chiều) — 2 bên luôn khớp: tồn, hủy, giao thiếu, hoàn tiền, danh mục

### 12.1 Tồn website chỉ lấy từ kho OptiPack
- Website **chỉ bán** biến thể có tồn do kho OptiPack quản (`stock_source = optipack`: đã nối SKU nội bộ hoặc kho đã nhập). Biến thể website tự quản hiện **"Hết hàng"**, nút "Thêm vào giỏ" tắt, đặt hàng/đổi hàng trả `OUT_OF_STOCK`.
- Admin website thấy cảnh báo đỏ dưới ô tồn: "Chưa nối kho OptiPack — khách thấy Hết hàng".
- Tắt quy tắc (demo cũ): `STOREFRONT_REQUIRE_OPTIPACK_STOCK=false` trong `be/.env`.
- SKU AURELLE đúng quy tắc mà OptiPack chưa có SKU nội bộ → OptiPack **tự tạo** SKU nội bộ (nếu danh mục/màu/size hợp lệ) rồi tự nối → lượt đẩy tồn kế tiếp mở bán.
- SKU nội bộ bị vô hiệu ở OptiPack → website nhận tồn 0.

### 12.2 Người bán hủy đơn
1. Store Owner/Admin OptiPack mở chi tiết đơn AURELLE (chưa giao vận chuyển) → **Hủy đơn (người bán)** + lý do.
2. OptiPack xử lý nhóm như đơn bị hủy; hàng đợi ghi ngược gửi `canceled_by_seller` (≤ 1 phút).
3. Website: đơn "Người bán đã hủy", khung cam ghi lý do; đã thanh toán → "Đã hoàn tiền"; giữ chỗ tồn được nhả.
4. Lượt đồng bộ đơn chạy trước khi website nhận tin cũng **không hồi sinh** đơn (nhận raw `seller_canceled`).

### 12.3 Giao thiếu
1. Kho báo thiếu → Packaging bấm "Giao phần có sẵn".
2. OptiPack chia số đã lấy cho các đơn trong nhóm (đơn cũ trước); mỗi đơn AURELLE thiếu nhận `short_shipped` với số giao được theo SKU.
3. Website: dòng hàng ghi "Giao thiếu N — không tính tiền", tóm tắt thanh toán có "Giảm trừ do giao thiếu"; giữ chỗ phần thiếu được nhả, lúc hàng rời kho chỉ trừ phần giao thật. Thiếu toàn bộ → coi như người bán hủy.

### 12.4 Hoàn tiền khi trả hàng
- Yêu cầu trả hàng `closed` → website tính tiền hoàn = đơn giá thực × số trả (đổi hàng = 0), ghi `refundAmount`, `refundedAt`; đơn cộng `refundedAmount`, trạng thái thanh toán "Đã hoàn tiền" / "Đã hoàn tiền một phần".
- Trang yêu cầu hiện "Đã hoàn …₫".
- Giao thất bại, kiện về kho (`returned`) → website cộng lại tồn đã trừ (1 lần).

### 12.5 Danh mục website nối danh mục OptiPack
- Admin website → cuối trang **Danh mục**: thêm/sửa/ẩn danh mục, chọn **Danh mục OptiPack (cấp 2)** cho từng danh mục.
- Chọn danh mục đã nối khi tạo sản phẩm → mã danh mục SKU tự điền; chọn sai mã → báo lỗi.
- Biến thể có thêm **kích thước kiện** (nặng/dài/rộng/cao) → OptiPack nhận làm số đo tham khảo của sàn.
- Biến thể cũ chưa có đơn: chạy `npx ts-node -r dotenv/config scripts/normalize-storefront-variants.ts` (thêm `--apply` để ghi) → đổi sang SKU quy tắc. Sau đó ở OptiPack: SKU sàn cũ (nếu đã gán kệ) kiểm kê về 0 → bỏ gán → "Ngừng dùng".

### 12.6 Ghi chú kiến trúc — website và OptiPack dùng chung 1 database
- Website AURELLE (`storefront_*`) và OptiPack nằm **chung 1 MongoDB** và chung tiến trình BE (module `storefront`). Lý do: đồ án demo, 1 máy chủ.
- Ranh giới vẫn giữ như 2 hệ thống thật: OptiPack **chỉ** đọc/ghi website qua Open API mock (`:4000`, ký HMAC) + webhook; website **chỉ đọc** 2 bảng tra cứu của OptiPack (`categories` cấp 2, `colors`) để dựng form SKU.
- Ngoại lệ có chủ đích: khi tách 2 hệ thống thật, 2 bảng tra cứu trên phải chuyển thành API của OptiPack (VD `GET /open/sku-options`) và form Admin website gọi qua đó. Mọi luồng còn lại không đổi.

## 13. Bổ sung 23/10/2026 — Thanh tiến trình đơn cho khách (7 bước cố định)

**Vấn đề:** trang "Chi tiết đơn" chỉ liệt kê mốc đã xảy ra. Mới đặt thì không có khối hành trình (mốc đầu tiên là "Đã đóng gói"), đóng gói xong mới hiện, giao rồi mới có mã vận đơn → khách thấy mỗi giai đoạn như một màn khác. Cả chặng vận chuyển gộp 1 dòng "Đang giao hàng"; nhãn đầu trang (trạng thái đơn) lệch nhãn ô "Giao hàng" (trạng thái giao); trang không tự cập nhật.

**Sửa:**
1. **Mốc mới OptiPack gửi sang** (`POST /rest/order/status/update`, từ vựng `PARTNER_STATUSES`): `processing` (lần quét lấy hàng đầu tiên của nhóm — ghi outbox trong transaction của `pickItem`, khóa `grp:<id>:processing:first_pick`), `in_transit`, `out_for_delivery` (tách từ `shipped`; khóa idempotency gồm status nên mỗi chặng 1 dòng). `shipped` nay chỉ còn nghĩa "đã tạo vận đơn, chờ hãng lấy". Hàng ĐỔI (EXC-…) vẫn chỉ nhận `packed|shipped|delivered|failed_delivery` (2 chặng mới bị bỏ qua, không báo trùng).
2. **Website ghi nhận:** `storefront_orders.tracking_stage` = chặng mới nhất (mọi mốc giao + `processing`). `fulfillment_status` giữ enum cũ để không vỡ luật hủy/trả: `processing` không đổi (vẫn `awaiting_packaging` → khách còn tự hủy), `in_transit`/`out_for_delivery` → `shipped`. Vận đơn website: `status = in_transit`, `shipped_at` = mốc "đang đi" đầu tiên. Trừ giữ chỗ tồn: thêm 2 chặng mới vào nhóm "đã rời kho".
3. **API khách** (`GET /storefront/orders`, `GET /storefront/orders/:id`): mỗi đơn có `trackingStage` + `displayStatus { label, tone: info|success|warning|danger, isFinal }` — **1 nhãn chung** cho danh sách và chi tiết. Chi tiết có thêm `progress { steps[7] { key, label, state: done|current|upcoming|problem|skipped, at }, branch { key: canceled|failed_delivery|shipped_back|returned, label, reason, at } | null, hint, displayStatus }`. Hàm thuần `storefront/storefront-order-progress.ts`; mốc "Đặt hàng" lấy `placed_at` (đơn cũ: `created_at`).
4. **Website:** component `OrderProgressBar` ngay dưới tiêu đề đơn — 7 bước ngang (điện thoại: dọc), bước đã qua có giờ, bước hiện tại nổi bật, nhánh hủy/giao thất bại/hoàn hàng hiện ô lý do; dòng hãng + mã vận đơn. Danh sách mốc bên dưới đổi tên "Chi tiết từng mốc". Tự tải lại 30 giây/lần khi đơn chưa xong và tab đang mở.

| Bước | Đạt khi |
|---|---|
| Đặt hàng | khách đặt xong |
| Đang chuẩn bị | `processing` |
| Đã đóng gói | `packed` |
| Chờ hãng lấy hàng | `shipped` |
| Đang vận chuyển | `in_transit` |
| Đang giao tới bạn | `out_for_delivery` (giao thất bại → bước này báo lỗi) |
| Đã nhận hàng | `delivered` |

**Tác động:** không migration — đơn cũ không có `tracking_stage` thì suy từ `fulfillment_status` + mốc hành trình. Hàng đợi ghi ngược có thêm tối đa 3 dòng/đơn. Nhãn `shipped` trong hành trình đổi thành "Đã tạo vận đơn — chờ đơn vị vận chuyển lấy hàng" cho mốc mới (mốc cũ giữ nhãn đã lưu).

## 14. Bổ sung 29/10/2026 — Giao hỏa tốc 3 giờ (shop tự giao)

**Khách:** trang thanh toán có 2 lựa chọn lấy từ `GET /storefront/delivery-options` (tên tỉnh, tên phường, tạm tính): Giao tiêu chuẩn 30.000₫ (GHN) và Giao hỏa tốc 45.000₫ (shop giao trong 3 giờ); đơn từ 1 triệu miễn phí cả hai. Hỏa tốc bị khoá kèm lý do khi thiếu địa chỉ, phường ngoài danh sách, hoặc ngoài 8:00–14:00 thứ 2 – thứ 7 (giờ VN); trang tải lại lựa chọn mỗi phút. Checkout gửi `delivery_option`; BE kiểm lại, không đạt → 400 `SF_EXPRESS_UNAVAILABLE`.

**Theo dõi đơn:** đơn hỏa tốc lưu `promised_delivery_at` = giờ đặt + 3 giờ. Trang chi tiết hiện "Giao hỏa tốc — dự kiến giao trước HH:mm", tên + SĐT người giao (OptiPack gửi `shipper_name`, `shipper_phone` cùng cập nhật trạng thái). Quá giờ hẹn mà chưa giao (hoặc giao sau giờ hẹn) → `isLate: true`: khung vàng "Giao chậm hơn dự kiến", danh sách đơn có nhãn "Trễ". Không hoàn tiền khi trễ.

**Admin website:** mục "Giao hỏa tốc" dưới Danh mục — chọn phường TP.HCM được giao hỏa tốc (mặc định 91 phường: 16 quận nội thành cũ, TP Thủ Đức, Thủ Dầu Một, Thuận An, Dĩ An — suy từ bảng chuyển đổi phường cũ → mới của `vietnam-divisions-js@3`; Phường Bình Dương và Phường Phú An gồm cả phần ngoài vùng cũ), lưu/quay về mặc định, và bảng đơn hỏa tốc 7 ngày có nhãn "Trễ".

**OptiPack:** mỗi đơn hỏa tốc thành 1 nhóm riêng, ghim đầu hàng chờ, đóng gói trước giờ đặt + 1 giờ, giao bởi 1 Shipping Coordinator được chọn làm shipper (không qua GHN). Chi tiết: `INTEGRATION_GUIDE_FULFILLMENT.md` Nghiệp vụ 5, `API_LIST.md` mục 27.
