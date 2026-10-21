# AURELLE — Theo dõi đơn, khách hủy đơn và trả hàng (20/10/2026)

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
| POST | `/rest/order/status/update` | 🔄 **Nay ghi thật** (trước chỉ echo). Body `order_id`, `status` (`packed\|shipped\|delivered\|failed_delivery\|shipped_back\|returned`), `event_time` (ISO), `idempotency_key`, tùy chọn `tracking_code`, `trip_code`, `reason` |
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
| Nhóm đóng gói xong | `packed` |
| Vận đơn tạo (chờ lấy / đang đi / đang giao) | `shipped` (+ `tracking_code`, `trip_code`) — một lần mỗi lượt giao |
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
| Chưa có đổi hàng (`exchange`) trên storefront | Khách chỉ chọn `return_refund` / `refund_only` | Thêm bước chọn hàng đổi sang; phía OptiPack đã hỗ trợ `exchange` |
| Khách không tự hủy được yêu cầu trả hàng | Phải liên hệ cửa hàng | Thêm `POST /storefront/returns/:id/cancel` khi OptiPack chưa tiếp nhận + báo ngược để Store Owner `reject` |
| Hủy đơn gặp đua với đóng gói (khách bấm hủy ngay lúc OptiPack vừa đóng xong, trước khi trạng thái `packed` về website) | Đơn hủy nhưng đã đóng: nhóm đi nhánh tháo kiện (`to_unpack`) có sẵn | Chấp nhận (cửa sổ tối đa ~15 giây); nếu cần chặt hơn, kiểm tra nhóm đơn phía OptiPack trước khi nhận hủy |
| Hàng đợi ghi ngược chạy 15 giây/lượt | Khách thấy trạng thái chậm tối đa vài chục giây | Giảm chu kỳ cron hoặc kích gửi ngay sau commit |
| Một nhóm chỉ có 1 phiếu mở: 2 đơn khách khác nhau cùng nhóm trả cùng lúc phải chờ nhau | Yêu cầu thứ hai ở trạng thái "đang chờ" tới khi phiếu đầu xong | Nới quy tắc "1 phiếu mở/nhóm" thành "1 phiếu mở/đơn" cho nguồn `marketplace` |
| Hoàn tiền thật không có (COD, đúng phạm vi đồ án) | `closed` chỉ nghĩa là kho đã xử lý xong hàng | Ngoài phạm vi |
