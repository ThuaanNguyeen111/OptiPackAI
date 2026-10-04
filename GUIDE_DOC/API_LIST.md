# OptiPackAI — Danh sách API đầy đủ theo Role

Tài liệu này liệt kê **toàn bộ** route thật đang tồn tại trong code (đã quét trực tiếp từ `@Controller`/`@Roles` decorator, không phải từ trí nhớ/thiết kế) — dùng làm nguồn tham chiếu DUY NHẤT khi cần biết "route này ai gọi được, dùng để làm gì". Cập nhật lần cuối: 2026-10-05 (GỘP `main` + `thi_dev`: kế hoạch đóng gói `packing_plans` thay luồng `packaging` cũ, kho vật tư chung, vận chuyển có hãng/cước + chứng từ PDF, sàn AURELLE). Trước đó: 2026-10-04 (Product Master đồng bộ theo danh sách sản phẩm của shop + `POST /product-master/sync`). Trước đó: 2026-10-02 (nút pack báo "đã đóng gói" lên Lazada + route gửi lại). Trước đó: 2026-10-01 (mở quyền vận hành kho cho Warehouse Staff — mục 9; nhóm đơn trả thêm `activeOrderCount`/`canceledOrderCount` — mục 5). Trước đó: 2026-09-27 (K1–K5, G1, G3, G4 và tiện ích vận hành).

**Cách đọc**: "Bất kỳ" = mọi role đã đăng nhập đều gọi được. "Public" = không cần token.

---

## Quy ước

- Protected API dùng `Authorization: Bearer <access_token>`; `Public` không cần token.
- Mongo `_id: ObjectId` được đổi thành `id: string` ở các response có mapper.
- Request hiện dùng field `snake_case`; một số response public dùng `camelCase`.
- GET dùng path/query, không có JSON body. Error theo global exception filter và mã trong `*.errors.ts`.
- Không expose password, token hash, encrypted marketplace token hoặc `__v`.
- `planned` nghĩa là chưa implement, không phải contract đang chạy.

Error response chuẩn:

```json
{
  "success": false,
  "error_code": "VALIDATION_ERROR",
  "message": "Request không hợp lệ",
  "details": null,
  "timestamp": "2026-09-14T00:00:00.000Z",
  "path": "/orders"
}
```

---

## 0. System

| Method | Route | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/` | Public | Không body | Chuỗi health/welcome từ `AppService` |

## 1. Auth (`/auth`)

| Method | Route                   | Role   | Mô tả                                                        |
| ------ | ----------------------- | ------ | ------------------------------------------------------------ |
| POST   | `/auth/login`           | Public | Đăng nhập — có thể trả `mfa_required` nếu tài khoản bật MFA  |
| POST   | `/auth/forgot-password` | Public | Gửi email link đặt lại mật khẩu                              |
| POST   | `/auth/reset-password`  | Public | Đặt mật khẩu mới bằng token từ email                         |
| POST   | `/auth/change-password` | Bất kỳ | Đổi mật khẩu khi đã đăng nhập                                |
| POST   | `/auth/mfa/setup`       | Bất kỳ | Bắt đầu bật MFA — trả về `otpauthUrl` để tự vẽ QR            |
| POST   | `/auth/mfa/verify`      | Bất kỳ | Xác nhận mã TOTP đầu tiên — bật MFA thật, trả 10 mã dự phòng |
| POST   | `/auth/refresh`         | Public | Lấy cặp access/refresh token mới                             |
| POST   | `/auth/logout`          | Bất kỳ | Thu hồi refresh token hiện tại                               |
| GET    | `/auth/google`          | Public | Bắt đầu luồng đăng nhập Google (redirect)                    |
| GET    | `/auth/google/callback` | Public | Google gọi lại sau khi user xác thực                         |

## 2. Users (`/users`)

| Method | Route                       | Role               | Mô tả                                      |
| ------ | --------------------------- | ------------------ | ------------------------------------------ |
| POST   | `/users`                    | Admin              | Tạo tài khoản nhân viên mới                |
| GET    | `/users`                    | Admin, Store Owner | Danh sách toàn bộ user                     |
| GET    | `/users/me`                 | Bất kỳ             | Xem thông tin chính mình                   |
| PATCH  | `/users/me`                 | Bất kỳ             | Tự sửa phone/address/avatar                |
| POST   | `/users/:id/reset-password` | Admin              | Reset mật khẩu hộ 1 user                   |
| POST   | `/users/:id/disable-mfa`    | Admin              | Tắt MFA hộ user mất thiết bị/mã dự phòng   |
| POST   | `/users/:id/reactivate`     | Admin              | Mở lại tài khoản bị khóa                   |
| PATCH  | `/users/:id`                | Admin              | Sửa tên/role/phone/address/mã NV/phòng ban |
| DELETE | `/users/:id`                | Admin              | Xóa mềm 1 user                             |

## 3. Marketplace Integration (`/marketplace`)

| Method | Route                             | Role   | Mô tả                                                    |
| ------ | --------------------------------- | ------ | -------------------------------------------------------- |
| GET    | `/marketplace/:platform/connect`  | Admin  | Tạo URL OAuth để kết nối shop 1 sàn (lazada/tiktok/tiki) |
| GET    | `/marketplace/:platform/shops`    | Admin, Store Owner | 🆕 (04/10/2026) Shop đã kết nối OAuth của 1 sàn, đọc từ DB, không kèm token |
| GET    | `/marketplace/:platform/callback` | Public | Sàn tự gọi lại sau khi seller authorize; 🔄 redirect kèm `platform` |

`platform` là enum marketplace (`lazada`, `tiktok`, `tiki`, 🆕 `aurelle` — sàn thứ 2 tự dựng tương thích khung Lazada, xem `AURELLE_MARKETPLACE_DESIGN.md`). Callback state dùng một lần để chống CSRF. Access/refresh token được mã hóa trong `marketplace_shops`, không expose.

## 3b. 🆕 Webhook AURELLE (`/marketplace/webhooks`) — 29/09/2026

| Method | Route                             | Role   | Mô tả                                                    |
| ------ | ---------------------------------- | ------ | -------------------------------------------------------- |
| POST   | `/marketplace/webhooks/:platform` | Public (không JWT) | AURELLE gọi khi có sự kiện đơn hàng — không expose Swagger |

Không dùng Bearer token — bảo mật bằng chữ ký HMAC trong header `Authorization` (không tiền tố "Bearer"), công thức `UPPER(HEX(HMAC_SHA256(app_secret, app_key + raw_body)))` (`AurelleAdapter.verifyWebhookSignature()`), so sánh bằng `timingSafeEqual`. Chữ ký sai hoặc thiếu → 401 `MKT_WEBHOOK_SIGNATURE_INVALID`. Chống replay: `|now - timestamp| > 5 phút` → cũng 401 cùng mã lỗi. Chống trùng (Rule #17, tạo record trước — bắt lỗi trùng khóa E11000 — thay vì kiểm tra rồi tạo) theo `{platform, event_id: message_id}` trong `processed_webhook_events` (TTL 7 ngày) — `message_id` đã xử lý → ack `{received:true}` ngay, không xử lý lại.

Body: `{ message_id, seller_id, message_type, timestamp, data: { trade_order_id, order_status?, status_update_time? } }`. 3 giá trị `message_type` đã biết: `order_status_changed`/`order_updated` (gọi `syncSingleOrder(platform, seller_id, trade_order_id)` — nếu shop chưa từng connect thì ack, không xử lý), `authorization_revoked` (bắn Notification `CONNECTION_LOST` cho Store Owner + Admin, KHÔNG sync). Giá trị lạ khác vẫn ack 200 (tương thích ngược). Luôn trả 2xx trong vài giây trừ 2 case từ chối ở trên; AURELLE tự retry nếu không nhận được ack.

## 4. Orders (`/orders`)

| Method | Route                    | Role                   | Mô tả                                                                               |
| ------ | ------------------------ | ---------------------- | ----------------------------------------------------------------------------------- |
| POST   | `/orders/lazada/sync`    | Admin                  | Kích hoạt tay 1 lần đồng bộ đơn từ Lazada (giữ nguyên, tương thích ngược)           |
| POST   | `/orders/:platform/sync` | Admin                  | 🆕 29/09/2026 — bản tổng quát, dùng cho MỌI sàn đã đăng ký adapter (`lazada`, `aurelle`...); `/orders/lazada/sync` giờ chỉ là alias gọi lại route này |
| GET    | `/orders`                | **Admin, Store Owner** | Danh sách đơn đã đồng bộ                                                            |
| GET    | `/orders/:id`            | **Admin, Store Owner** | Chi tiết 1 đơn hàng                                                                 |

**Chi tiết query/response**

| Query | Type | Validation/meaning |
|---|---:|---|
| `shop_id` | string | Shop trên sàn |
| `status` | `OrderStatus` | Trạng thái chuẩn hóa |
| `consolidated_group_id` | ObjectId string | Group gom đơn |
| `before` | ISO date | Cursor theo `created_at` |
| `limit` | integer | Mặc định 20, min 1, max 100 |

List item: `id`, `platform`, `shopId`, `platformOrderId`, `platformOrderNumber?`, `status`, `recipientName`, `recipientCity`, `isConsolidated`, `consolidatedGroupId`, `totalAmount`, `currency`, `itemCount`, `createdAt`.

Detail bổ sung địa chỉ nhận đầy đủ và `items[]`. Items được aggregate theo `sku + variation + status`, có quantity, unit price, line total và `platformOrderItemIds`.

## 5. Order Groups — Đọc (`/order-groups`)

| Method | Route                                 | Role                                                   | Mô tả                                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/order-groups`                       | **Store Owner**, Warehouse, Packaging, Shipping, Admin | Danh sách nhóm đơn — lọc theo `fulfillment_status`/`platform`/**`order_priority`** (MỚI — xem toàn bộ đơn Hỏa Tốc bằng `?order_priority=express`). 🔄 **01/10/2026**: mỗi nhóm có thêm `activeOrderCount` (đơn còn phải xử lý) và `canceledOrderCount` (đơn đã hủy) — xem `INTEGRATION_GUIDE_FULFILLMENT.md` Nghiệp vụ 3 |
| GET    | `/order-groups/:id`                   | **Store Owner**, Warehouse, Packaging, Shipping, Admin | Chi tiết 1 nhóm đơn — đọc `version` ở đây trước mọi request ghi. 🆕 thêm `linkedGroupCount` (nhóm khác, có thể khác sàn, cùng `recipient_key`, chưa giao xong)                                                                                                                                                                                                                                                          |
| GET    | `/order-groups/:id/picking-list`      | Warehouse, Admin                                       | Toàn bộ SKU cần lấy. 🔄 21/09: mỗi dòng có `quantity` (số đặt), `picked_quantity` (đã quét trong lượt), `packaging_profile_ready`; số đo `null` nếu SKU chưa đo — **không còn 422 khi SKU chưa có hồ sơ** |
| GET    | `/order-groups/:id/picking-list/:sku` | Warehouse, Admin                                       | Chi tiết 1 SKU riêng lẻ trong nhóm đơn                                                                                                                                                                                                                                                                                   |
| 🆕 GET | `/order-groups/:id/linked`            | **Store Owner**, Warehouse, Packaging, Shipping, Admin | **MỚI (29/09/2026, Mục 9.5)** — danh sách đầy đủ các nhóm khác cùng `recipient_key` (cùng người nhận thật, có thể khác sàn), chưa tới `delivered`/`returned`/`canceled`. Trả `{ linkedGroups: OrderGroupResponse[] }` |

## 6. Order Groups — Fulfillment (ghi trạng thái)

| Method  | Route                                          | Role                           | Mô tả                                                                                                                                                                                                     |
| ------- | ---------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/order-groups/:id/fulfillment/pick-item`      | Warehouse, Admin           | Quét/nhập tay 1 SKU — trừ tồn + ghi pick_event trong 1 transaction, chống trừ trùng khi mất mạng. 🔄 21/09: chỉ khi group `picking`; chặn quét vượt số đặt trong lượt; KHÔNG cần hồ sơ đóng gói |
| POST    | `/order-groups/:id/fulfillment/report-missing` | Warehouse, Admin               | Báo thiếu hàng lúc lấy — dừng đơn, báo Store Owner, chờ duyệt                                                                                                                                             |
| POST    | `/order-groups/:id/fulfillment/decide-partial` | Packaging, Admin | Duyệt tiếp với phần có sẵn, hoặc hủy làm lại. 🔄 Gộp 04/10: hủy = vào lại `picking` với lượt mới (`pick_round + 1`), hàng đã quét của lượt bị hủy **tự nhập lại đúng ô** (sổ kho loại `pick_cancel`) và giữ chỗ tồn lại |
| POST   | `/order-groups/:id/fulfillment/pick`           | Warehouse, Admin           | `picking → picked`: 🔄 21/09 server đối soát mọi SKU đã quét đủ số đặt trong lượt; thiếu → 409 `ORD_GROUP_PICK_INCOMPLETE` kèm danh sách |
| ~~POST~~ | ~~`/order-groups/:id/fulfillment/pack`~~ | — | 🔄 **ĐÃ GỠ khi gộp (04/10/2026)** — đóng gói xác nhận qua `POST /order-groups/:groupId/packing-plan/pack` (mục 8): cân từng kiện, trừ thùng/vật tư theo kế hoạch, rồi báo "đã đóng gói" lên Lazada (`lazadaPackSync` trong response); nhóm hủy hết → 409 `ORD_GROUP_ALL_ORDERS_CANCELED` |
| 🆕 POST | `/order-groups/:id/lazada-pack/retry`          | Packaging, Warehouse, Admin    | **MỚI (02/10/2026)** — gửi lại "đã đóng gói" lên Lazada cho nhóm `packed` chưa gửi thành công                                                                                                             |
| POST    | `/order-groups/:id/fulfillment/ship`           | Shipping, Admin                | Xác nhận đã bàn giao vận chuyển                                                                                                                                                                           |
| POST    | `/order-groups/:id/fulfillment/deliver`        | Shipping, Admin                | Xác nhận đã giao thành công tới khách                                                                                                                                                                     |
| POST    | `/order-groups/:id/fulfillment/return`         | Shipping, Warehouse, Admin     | Ghi nhận hoàn hàng (từ shipped hoặc delivered)                                                                                                                                                            |
| PATCH   | `/order-groups/:id/priority`                   | **Store Owner**, Admin         | Đánh dấu đơn Hỏa Tốc/Bình thường, tự tính hạn đóng gói                                                                                                                                                    |

**🆕 Trạng thái mới `canceled` (29/09/2026, N1 — Mục 9.6)**: KHÔNG có endpoint ghi riêng — hệ thống **tự động** chuyển 1 Order Group sang `canceled` khi MỌI đơn bên trong không còn fulfill được (đơn bị khách/sàn hủy, hoặc sự cố logistics `lost`/`damaged_by_3pl`/`package_scrapped`...), miễn nhóm đó **chưa** tới `packed`/`shipped`/`delivered` (hàng đã đóng/giao vật lý thì không tự hủy ngầm, cần luồng `return` thủ công). Trigger: mỗi lần `syncShopOrders()`/webhook cập nhật 1 đơn sang trạng thái không-fulfill-được, hệ thống tự kiểm tra và hủy nhóm nếu đủ điều kiện — không cần Warehouse/Packaging Staff xác nhận riêng (ngoại lệ có chủ đích so với nguyên tắc "người xác nhận thay đổi quan trọng" thường dùng, vì rủi ro thấp khi nhóm chưa đóng gói). Khi hủy: tự nhả giữ chỗ đóng gói (🔄 04/10: kế hoạch `packing_plans` đang hoạt động chuyển `superseded`) + bắn Notification `group_auto_canceled` cho Store Owner, Admin và người phụ trách (nếu có).

## 7. Staff Assignment — Phân công / Đổi nhân viên phụ trách

| Method | Route                        | Role                        | Mô tả                                                                                                                                                                                                                                                                   |
| ------ | ---------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/order-groups/:id/assign`   | Admin, Warehouse            | **Gán/ĐỔI nhân viên phụ trách 1 nhóm đơn.** Body rỗng = tự động chọn lại người đang ít việc nhất (Least-Busy). Truyền `staff_id` = chỉ định tay 1 người cụ thể (dùng khi cần ĐỔI người đang phụ trách, VD người cũ nghỉ đột xuất, đơn Hỏa Tốc cần người giỏi hơn xử lý) |
| GET    | `/order-groups/staff/search` | Admin, Warehouse, Packaging | Tìm nhân viên theo tên/email, kèm số việc đang xử lý (`activeWorkload`) — dùng để CHỌN AI khi muốn đổi tay ở API trên                                                                                                                                                   |

> **Lưu ý quan trọng — trả lời đúng câu hỏi "sao đơn hỏa tốc không có API đổi người"**: KHÔNG có route riêng "đổi người cho đơn hỏa tốc" — vì **không cần thiết phải tách riêng**. `POST /order-groups/:id/assign` (route ở trên) dùng được cho **MỌI đơn, kể cả hỏa tốc lẫn thường** — không phân biệt. Nếu 1 đơn đang là "express" mà người phụ trách hiện tại xử lý chậm, Admin/Warehouse Staff chỉ cần gọi ĐÚNG route này với `staff_id` của người khác — hệ thống không quan tâm đơn đó thường hay hỏa tốc khi đổi người, tách API riêng cho từng loại đơn sẽ là thừa (2 route làm cùng 1 việc).

## 8. Kế hoạch đóng gói (`/order-groups/:groupId/packing-plan`) — 🔄 ĐÃ LÀM LẠI 04/10/2026

🔄 **ĐÃ THAY ĐỔI 04/10/2026** — toàn bộ route `/order-groups/:groupId/packaging/*` (generate, approve, adjust, reject, guide, cartonization-preview) và `POST /order-groups/:id/fulfillment/pack` **đã gỡ**. Thay bằng **1 kế hoạch cho cả nhóm** (collection `packing_plans`), gồm mọi đơn và mọi kiện của nhóm:

- **Tự tính**: khi nhóm vào `picked`, job nền (quét mỗi 10 giây) tính kế hoạch rồi chuyển nhóm sang `pending_approval` và báo Packaging Staff — **không còn nút "generate"**. Kế hoạch có trạng thái riêng: `computing` → `ready` (chờ duyệt) → `approved` (chờ đóng) → `packed`; nhánh phụ `failed` (lỗi dữ liệu, kèm `failureReason`), `rejected` (chuyển xử lý ngoài hệ thống), `superseded` (bị thay bởi lần tính mới — không hiện ra API).
- **Bộ giải**: BRKGA (TypeScript, xác định — cùng đầu vào cùng kết quả) cho mọi đơn; đơn ≤ 12 món được service CP-SAT (`packer/`) kiểm tra thêm ở nền. Mỗi đơn có **nhãn chứng minh**: `optimal_global` (không thể ít kiện hơn và mọi tổ hợp thùng rẻ hơn đều không chứa được, đúng với mọi cách xếp), `optimal_in_model` (CP-SAT chứng minh mọi tổ hợp tốt hơn không xếp được theo luật chồng hàng chặt hơn thực tế), `heuristic` (phương án tốt nhất tìm được, chưa chứng minh). `proof` cấp kế hoạch = nhãn yếu nhất các đơn. `cpSatPending: true` = CP-SAT đang chạy, nhãn có thể còn nâng.
- **Không còn "Từ chối, tính lại"**: sai thì **chỉnh tay** (đổi thùng 1 kiện, chuyển món sang kiện khác cùng đơn hoặc tách kiện mới) hoặc **tính lại có điều kiện** (loại thùng, ưu tiên rẻ). `reject` giờ chỉ dùng khi nhóm phải xử lý **ngoài hệ thống** (vd cần thùng gỗ).
- **Khoá lạc quan bằng `version` của kế hoạch** (không phải version nhóm): mọi thao tác ghi gửi `expected_version`; lệch → 409 `PACKING_VERSION_CONFLICT`, tải lại kế hoạch.

| Method | Route | Role | Mô tả |
| ------ | ----- | ---- | ----- |
| GET | `/order-groups/:groupId/packing-plan` | Packaging, Warehouse, Shipping, Store Owner, Admin | `{ plan }` — kế hoạch đang hoạt động, `null` nếu chưa có (nhóm chưa lấy xong hoặc job chưa chạy tới) |
| GET | `/packing-plans/summary?group_ids=a,b,c` | Packaging, Warehouse, Shipping, Store Owner, Admin | `{ summaries[] }` tóm tắt tối đa 200 nhóm (trạng thái, version, nhãn, `cpSatPending`, số kiện, chi phí đóng gói, `failureReason`) — dùng cho bảng hàng chờ |
| POST | `/order-groups/:groupId/packing-plan/recompute` | Packaging, Admin | Tính lại, thay kế hoạch `ready`/`failed`/`rejected` hiện tại (nhóm `pending_approval` tạm về `picked` rồi tính ngay). Body `{ expected_version?, exclude_box_codes?: string[], prefer?: 'fewest_parcels' \| 'cheapest' }` — `expected_version` bắt buộc khi đã có kế hoạch |
| POST | `/order-groups/:groupId/packing-plan/approve` | Packaging, Admin | `ready → approved`, nhóm `pending_approval → approved_for_packing`. Còn đơn chưa xếp hết món → 409 `PACKING_HAS_UNPLACED` |
| POST | `/order-groups/:groupId/packing-plan/reject` | Packaging, Admin | Chuyển xử lý ngoài hệ thống: kế hoạch `rejected` (vẫn hoạt động để job không tự tính lại), nhóm về `picked`, báo Admin. Body `{ expected_version, reason }` (3–500 ký tự) |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/change-box` | Packaging, Admin | Đổi thùng 1 kiện: xếp lại đúng các món của kiện vào thùng mới, phải qua validator (không vừa → 422 `PACKING_BOX_DOES_NOT_FIT`, hết thùng → 409 `PKG_BOX_OUT_OF_STOCK`). Body `{ expected_version, box_code, reason, note? }` |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/move-item` | Packaging, Admin | Chuyển 1 món sang kiện khác **cùng đơn** (`to_parcel_no`) hoặc tách kiện mới (`to_parcel_no` bỏ trống/null — hệ thống chọn thùng). Cả 2 kiện bị ảnh hưởng xếp lại và validate. Sang kiện của đơn khác → 400 `PACKING_MOVE_ACROSS_ORDERS`. Body `{ expected_version, item_key, to_parcel_no?, reason, note? }` |
| POST | `/order-groups/:groupId/packing-plan/parcels/:parcelNo/guide` | Packaging, Warehouse, Admin | Hướng dẫn đóng gói từng bước cho 1 kiện (engine quyết định vị trí/thứ tự, AI Groq viết lời; chưa cấu hình/AI trả sai → câu mẫu). Body `{ regenerate? }`. Không cần `expected_version`, không đổi `version`. Giới hạn 10 lần/phút |
| POST | `/order-groups/:groupId/packing-plan/pack` | Packaging, Warehouse, Admin | `approved → packed`, nhóm `approved_for_packing → packed`. Body `{ expected_version, parcels: [{ parcel_no, weight_kg }] }` — **cân đủ mọi kiện, mỗi kiện đúng 1 lần** (sai → 400 `PACKING_PACK_WEIGHTS_MISMATCH`). Trừ 1 thùng/kiện + vật tư (thiếu vật tư không chặn, ghi `materialsShortfall`); lệch > 20% so với cân ước tính → `isAbnormal` + thông báo Store Owner |

`reason` của chỉnh tay: `PRODUCT_MORE_FRAGILE_THAN_EXPECTED` / `RECOMMENDED_BOX_NOT_IN_STOCK` / `OTHER` (`OTHER` bắt buộc `note`, thiếu → 400 `PACKING_NOTE_REQUIRED`). Mọi chỉnh tay ghi vào `adjustments[]`.

**Response `plan`** (camelCase, đơn vị mm và gram, trục z hướng lên): `id`, `orderGroupId`, `revision` (lần tính thứ mấy), `version`, `status`, `failureReason`, `proof`, `cpSatPending`, `orders[]` (`orderId`, `platformOrderId`, `status` `ok|partial|no_fit`, `unplaced[]` `{itemKey, code, reason}`, `proof`, `lowerBoundParcels`, `explanation[]`, `strategy`, `cpSat` `pending|done|skipped|unavailable`, 🆕 04/10 `stockSuggestion` — `null` hoặc `{parcels, packagingCostVnd, avgFill, currentParcels, currentAvgFill, savingVnd, missing[] {boxCode, boxName, needed, available}}`: nếu kho đủ các thùng ở `missing` thì đơn đóng được như vậy; chụp lúc tính, đổi thùng/chuyển món không tính lại), `parcels[]` (`parcelNo` 1..N trong cả nhóm, `orderId`, `platformOrderId`, `box` `{code, name, innerMm, outerMm, tareG, maxLoadG, priceVnd}`, `placements[]` `{itemKey, sku, step, x, y, z, dx, dy, dz, orientation, folded}`, `fillRatio`, `itemsWeightG`, `estimatedWeightG`, `volumetricWeightG`, `materials[]`, `materialsWeightG`, `materialsCostVnd`, `shippingCostVnd`, `guide`, `actualWeightKg`, `isAbnormal`, `materialsShortfall[]`), `itemProfiles[]`, `adjustments[]`, `solver` `{engineVersion, computationMs, options}`, `totals` `{parcels, packagingCostVnd, estimatedWeightG, avgFill}` (🆕 04/10 `avgFill` = tổng thể tích hàng ÷ tổng lòng thùng, 0..1), `approvedAt`, `rejectedAt`, `rejectionReason`, `packedAt`, `createdAt`, `updatedAt`.

Dữ liệu cũ: `packaging_recommendations` giữ nguyên làm lịch sử. Nhóm đang `pending_approval`/`approved_for_packing` chỉ có phương án cũ cần chạy `npx ts-node -r tsconfig-paths/register scripts/migrate-to-packing-plans.ts` (mặc định chỉ in, `--apply` mới ghi; nhãn luôn `heuristic`).

## 8b. 🆕 Danh mục thùng (`/packaging/boxes`) — 21/09/2026

| Method | Route | Role | Mô tả |
| ------ | ----- | ---- | ----- |
| GET | `/packaging/boxes?active=true` | Packaging, Warehouse, Store Owner, Admin | Danh mục thùng (mặc định chỉ thùng đang dùng) |
| POST | `/packaging/boxes` | Admin | Thêm thùng |
| PATCH | `/packaging/boxes/:id` | Admin | Sửa thùng, 🆕 `reorder_level`, `storage_location` / ngừng dùng (`is_active: false`). Không sửa được tồn |
| POST | `/packaging/boxes/:id/stock-in` | Admin, Warehouse | 🆕 22/09: nhập thêm thùng `{ quantity, note? }`, ghi 1 dòng sổ |
| GET | `/packaging/boxes/:id/movements` | Admin, Warehouse, Packaging | 🆕 22/09: sổ xuất/nhập 20 dòng gần nhất |

Body (đơn vị **mm/g**, số nguyên): `code`, `name`, `inner{length_mm,width_mm,height_mm}` (lòng thùng), `outer{...}` (≥ lòng thùng), `tare_g`, `max_load_g`, `price_vnd?`. Response có `isSample` = thùng mẫu seed tạm (số giả lập). 🆕 22/09: response có tồn kho `quantityOnHand`, `reserved` (phương án chưa đóng giữ chỗ), `available` (còn trống — engine chỉ chọn thùng `available > 0`), `reorderLevel`, `storageLocation`, `stockStatus`. Tồn chỉ đổi qua `stock-in` hoặc lúc `pack` (mỗi kiện trừ 1 thùng); thiếu thùng → 409 `PKG_BOX_OUT_OF_STOCK`. Module `/materials/cartons` cũ đã gỡ (gộp vào đây). Nhập hàng loạt từ CSV (cm/g): `npx ts-node scripts/seed-packaging-boxes.ts ./boxes.csv`.

> 🔄 **Gộp 04/10/2026 — KHO VẬT TƯ CHUNG**: `/packaging/boxes` và `/packaging/materials` giờ là 2 màn xem/sửa trên CÙNG collection `packaging_materials` của `/packaging-materials` (mục 12) — thùng = `kind: box`, vật tư chèn = `kind: cushioning`. Tồn = mới + tái sử dụng; đóng gói ưu tiên hàng tái sử dụng (ghi tiết kiệm); sổ chung `packaging_movements`. Chuyển dữ liệu cũ: `scripts/migrate-unify-packaging-materials.ts`.

## 8d. 🆕 Danh mục túi zip (`/packaging/bags`) — 21/09/2026

Túi zip bọc **từng món** (áo, quần…) trước khi xếp vào thùng — khác thùng carton (bao bì ngoài). Engine **không** dùng kích thước túi; dùng cho hướng dẫn đóng gói, cấp vật tư, chi phí.

| Method | Route | Role | Mô tả |
| ------ | ----- | ---- | ----- |
| GET | `/packaging/bags?active=true` | Packaging, Warehouse, Store Owner, Admin | Danh mục túi (mặc định chỉ túi đang dùng) |
| POST | `/packaging/bags` | Admin | Thêm túi: `code`, `name`, `width_mm`, `length_mm` (trải phẳng), `price_vnd?` |
| PATCH | `/packaging/bags/:id` | Admin | Sửa túi / ngừng dùng (`is_active: false`) |

Lỗi: `PKG_INVALID_BAG_ID` (400), `PKG_BAG_NOT_FOUND` (404), `PKG_BAG_CODE_IN_USE` (409). Phương án đóng gói (`GET .../packaging`) có thêm `itemProfiles[]` = `{ sku, productCategory, zipBagCode, zipBagFolded }` chụp từ hồ sơ SKU lúc tính.

## 8e. 🆕 Vật tư chèn (`/packaging/materials`) — 28/09/2026

Góc xốp, tấm ngăn carton, gối hơi, xốp hơi, tem cảnh báo dễ vỡ. **Số lượng trên mỗi phương án là ƯỚC LƯỢNG theo bộ luật** (loại hàng, số món, độ trống của thùng) — vật tư **không** chiếm thể tích trong hình học/validator, đừng trình bày như lượng đệm tính chính xác. Danh mục trống = engine vẫn đóng gói bình thường nhưng `materials` rỗng.

| Method | Route | Role | Mô tả |
| ------ | ----- | ---- | ----- |
| GET | `/packaging/materials?active=true` | Packaging, Warehouse, Store Owner, Admin | Danh mục vật tư + tồn (mặc định chỉ vật tư đang dùng) |
| POST | `/packaging/materials` | Admin | Thêm vật tư: `code`, `name`, `type` (`foam_corner` \| `corrugated_divider` \| `air_pillow` \| `bubble_wrap` \| `fragile_tape`), `unit`, `weight_g_per_unit`, `price_vnd_per_unit`, `reorder_level?`, `storage_location?`. Tồn ban đầu 0 |
| PATCH | `/packaging/materials/:id` | Admin | Sửa tên/đơn vị/khối lượng/giá/mức cảnh báo/vị trí hoặc ngừng dùng (`is_active: false`). Không sửa được `code`, `type`, tồn |
| POST | `/packaging/materials/:id/stock-in` | Admin, Warehouse | Nhập thêm `{ quantity, note? }`, ghi 1 dòng sổ |
| GET | `/packaging/materials/:id/movements` | Admin, Warehouse, Packaging | Sổ xuất/nhập 20 dòng gần nhất (`reason`: `stock_in` \| `pack`) |
| GET | `/packaging/materials/rules` | Packaging, Warehouse, Store Owner, Admin | Bộ luật chọn vật tư hiện hành. `version: null` + `isDefault: true` = luật mặc định trong code |
| PUT | `/packaging/materials/rules` | Admin | Lưu bộ luật mới `{ rules[] }` (tạo version kế tiếp, bản cũ tắt — giữ lịch sử). Áp dụng từ lần tính kế hoạch sau |

Luật (`rules[]`): `material_type`, `applies_to` (`fragile` \| `shoes` \| `fragile_or_shoes` \| `any`), `min_units?`, `basis` (`per_unit` \| `per_extra_unit` \| `per_carton` \| `void_band`), `quantity?`, `void_bands?` (`[{ min_void_ratio, quantity }]`, chỉ dùng cho `void_band`).

Response vật tư: `id, code, name, type, unit, weightGPerUnit, priceVndPerUnit, quantityOnHand, reorderLevel, storageLocation, isSample, isActive, stockStatus` (`in_stock` \| `low_stock` \| `out_of_stock`). **Khác thùng:** không có `reserved/available` — vật tư không giữ chỗ mềm.

**Trừ tồn + thiếu vật tư:** vật tư được trừ lúc đóng gói (🔄 04/10: `POST .../packing-plan/pack`) (cùng transaction với thùng, mỗi lần 1 dòng sổ). Thiếu vật tư **không chặn** đóng gói (khác thùng: hết thùng → 409 `PKG_BOX_OUT_OF_STOCK`) — trừ phần có, phần thiếu ghi vào `materialsShortfall` của kiện và bắn Notification `low_material_stock` cho Admin + Store Owner (cũng bắn khi tồn rơi xuống ≤ `reorderLevel`).

Phương án đóng gói (`GET .../packaging`) — 🔄 ĐÃ ĐỔI 28/09: `materials[]` giờ là `{ type, quantity, code, name, unit, weightG, costVnd }` (bản ghi trước 28/09 chỉ có `type` + `quantity`, các field còn lại `null`/`0`); thêm `materialsWeightG`, `materialsCostVnd`, `materialsShortfall[]` (`{ code, missing }`). `estimatedPackageWeightG` **đã cộng** khối lượng vật tư (hàng + bì thùng + vật tư).

Lỗi: `PKG_INVALID_MATERIAL_ID` (400), `PKG_MATERIAL_NOT_FOUND` (404), `PKG_MATERIAL_CODE_IN_USE` (409), `PKG_MATERIAL_RULES_CONFLICT` (409 — 2 Admin lưu luật cùng lúc, tải lại rồi lưu lại).

> 🔄 **Gộp 04/10/2026 — KHO VẬT TƯ CHUNG**: `/packaging/boxes` và `/packaging/materials` giờ là 2 màn xem/sửa trên CÙNG collection `packaging_materials` của `/packaging-materials` (mục 12) — thùng = `kind: box`, vật tư chèn = `kind: cushioning`. Tồn = mới + tái sử dụng; đóng gói ưu tiên hàng tái sử dụng (ghi tiết kiệm); sổ chung `packaging_movements`. Chuyển dữ liệu cũ: `scripts/migrate-unify-packaging-materials.ts`.

## 9. Warehouse (`/warehouse`)

🔄 **ĐÃ ĐỔI (16/09/2026)** — thêm 3 route GET còn thiếu (trước đây chỉ tạo được, không xem lại được); sửa `GET .../zones` không trả dữ liệu dù đã tạo thành công (ép kiểu `ObjectId` tường minh).

| Method    | Route                                                                          | Role                   | Mô tả                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST      | `/warehouse/warehouses`                                                        | Admin                  | Tạo kho mới (bước 1/4)                                                                                                                                                                                                |
| GET       | `/warehouse/warehouses`                                                        | Admin, Warehouse Staff | 🔄 Danh sách kho — **mở thêm Warehouse Staff (19/09/2026)**: trước đây chỉ Admin xem được, nhưng picking-list/pick-item/report-missing đều bắt buộc `warehouse_id`, Warehouse Staff không có cách nào biết ID kho nào |
| POST      | `/warehouse/warehouses/:warehouseId/zones`                                     | Admin                  | Tạo khu trong kho (bước 2/4)                                                                                                                                                                                          |
| GET       | `/warehouse/warehouses/:warehouseId/zones`                                     | Admin, Warehouse Staff | 🔄 Danh sách khu trong 1 kho — **sửa lỗi 16/09/2026**: trước đây có thể không trả ra dữ liệu dù tạo thành công. 🔄 **Mở thêm Warehouse Staff (01/10/2026)**                                                           |
| POST      | `/warehouse/zones/:zoneId/bin-locations/generate`                              | Admin                  | Tạo HÀNG LOẠT kệ theo dãy/rack/tầng (bước 3/4)                                                                                                                                                                        |
| 🆕 GET    | `/warehouse/zones/:zoneId/bin-locations`                                       | Admin                  | **MỚI (16/09/2026)** — Danh sách kệ đã tạo trong 1 khu (trước đây chỉ tạo được, không xem lại được)                                                                                                                   |
| 🆕 GET    | `/warehouse/warehouses/:warehouseId/bin-locations`                             | Admin, Warehouse Staff | **MỚI (16/09/2026)** — Danh sách TOÀN BỘ kệ trong 1 kho (gộp mọi khu). 🔄 **Mở thêm Warehouse Staff (01/10/2026)**                                                                                                    |
| POST      | `/warehouse/warehouses/:warehouseId/sku-bin-assignments`                       | Admin                  | Gán 1 SKU vào 1 kệ, kèm số lượng ban đầu (bước 4/4)                                                                                                                                                                   |
| 🆕 GET    | `/warehouse/warehouses/:warehouseId/sku-bin-assignments`                       | Admin, Warehouse Staff | **MỚI (16/09/2026)** — Danh sách SKU đã gán vị trí trong 1 kho, kèm số lượng từng ô (trước đây chỉ GET được danh sách CHƯA gán, không GET được danh sách ĐÃ gán). 🔄 **Mở thêm Warehouse Staff (01/10/2026)**         |
| POST      | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock` | Admin, Warehouse Staff | Nhập thêm hàng (cộng dồn, không ghi đè; ghi sổ cái `receive`). 🔄 **Mở thêm Warehouse Staff (01/10/2026)**                                                                                                            |
| GET       | `/warehouse/sku-bin-assignments/unassigned`                                    | Admin                  | SKU đã có trong hệ thống nhưng CHƯA gán kệ                                                                                                                                                                            |
| GET       | `/warehouse/:warehouseId/picking-list/:groupId`                                | Warehouse, Admin       | Picking list CÓ vị trí kệ thật, đã sắp xếp theo lộ trình đi                                                                                                                                                           |
| 🆕 GET    | `/warehouse/warehouses/:warehouseId`                                           | Admin, Warehouse       | **K1 (26/09/2026)** — chi tiết 1 kho (kể cả đã tắt)                                                                                                                                                                   |
| 🆕 PATCH  | `/warehouse/warehouses/:warehouseId`                                           | Admin                  | K1 — sửa tên/địa chỉ, KHÔNG sửa mã                                                                                                                                                                                    |
| 🆕 DELETE | `/warehouse/warehouses/:warehouseId`                                           | Admin                  | K1 — vô hiệu hóa (xóa mềm) + dây chuyền khu/kệ; 409 nếu còn hàng                                                                                                                                                      |
| 🆕 POST   | `/warehouse/warehouses/:warehouseId/reactivate`                                | Admin                  | K1 — bật lại CHỈ kho                                                                                                                                                                                                  |
| 🆕 PATCH  | `/warehouse/zones/:zoneId`                                                     | Admin                  | K1 — sửa tên/mô tả khu                                                                                                                                                                                                |
| 🆕 DELETE | `/warehouse/zones/:zoneId`                                                     | Admin                  | K1 — vô hiệu hóa khu + kệ; 409 nếu còn hàng                                                                                                                                                                           |
| 🆕 POST   | `/warehouse/zones/:zoneId/reactivate`                                          | Admin                  | K1 — bật lại khu + kệ (kho phải đang bật)                                                                                                                                                                             |
| 🆕 DELETE | `/warehouse/bin-locations/:binId`                                              | Admin                  | K1 — vô hiệu hóa 1 kệ; 409 nếu còn hàng                                                                                                                                                                               |
| 🆕 POST   | `/warehouse/bin-locations/:binId/reactivate`                                   | Admin                  | K1 — bật lại 1 kệ (khu phải đang bật)                                                                                                                                                                                 |

> 🔄 **ĐÃ ĐỔI (26/09/2026, K1)**: các GET danh sách kho/khu/kệ nhận thêm `?include_inactive=true` (mặc định chỉ trả mục đang hoạt động); response khu/kệ có thêm `isActive`; tạo khu, sinh kệ, gán SKU, nhập hàng, Picking List bị chặn `409` khi kho/khu/kệ đã tắt; gán SKU giờ kiểm tra kệ tồn tại + thuộc đúng kho. Chi tiết: **`INTEGRATION_GUIDE_WAREHOUSE.md`**.

| 🆕 POST | `/warehouse/zones/:zoneId/racks` | Admin | **K2 (26/09/2026)** — tạo kệ chuẩn mới `KA-D1-P02-T03-1` + toàn bộ ô |
| 🆕 PATCH | `/warehouse/bin-locations/:binId` | Admin | K2 — sức chứa + danh mục/size/màu đăng ký của ô |
| 🆕 GET | `/warehouse/warehouses/:warehouseId/bin-suggestions` | Admin, Warehouse | K2 — gợi ý ô theo danh mục/size/màu |

> 🔄 **ĐÃ ĐỔI (01/10/2026)**: 4 route vận hành kho (danh sách khu, danh sách ô của kho, tồn theo ô, nhập thêm hàng) mở thêm cho Warehouse Staff. Nguyên tắc: route **cấu hình** kho chỉ Admin; route **vận hành** kho mở cho Admin và Warehouse Staff. Request/response không đổi. Chi tiết và màn hình gợi ý: `INTEGRATION_GUIDE_WAREHOUSE.md` PHẦN B5.

> 🔄 **ĐÃ ĐỔI (K2)**: `zone_code` mới bắt buộc `KA..KZ`; gán SKU/nhập hàng có thể trả `409 WH_BIN_OVER_CAPACITY` (gửi lại kèm `force: true`); Picking List sắp theo lộ trình hình rắn; `POST .../bin-locations/generate` deprecated. Route cũ `POST .../bin-locations/generate` bị chặn `409 WH_ZONE_V2_USE_RACKS` ở khu `KA..KZ`; đổi đăng ký ô đang có hàng bị chặn `409 WH_BIN_HAS_STOCK_DESIGNATION`.

## 9c. 🆕 Categories (`/categories`) — K2 (26/09/2026)

| Method | Route                          | Role                                     | Mô tả                             |
| ------ | ------------------------------ | ---------------------------------------- | --------------------------------- |
| GET    | `/categories`                  | Admin, Store Owner, Warehouse, Packaging | Cây danh mục 2 cấp                |
| GET    | `/categories/:code`            | (như trên)                               | Chi tiết                          |
| POST   | `/categories`                  | Admin                                    | Tạo (cấp 2 bắt buộc `size_scale`) |
| PATCH  | `/categories/:code`            | Admin                                    | Tên + thang size                  |
| DELETE | `/categories/:code`            | Admin                                    | Vô hiệu hóa                       |
| POST   | `/categories/:code/reactivate` | Admin                                    | Kích hoạt lại                     |

## 9b. Product Master (`/product-master`) — 🔄 gộp 04/10/2026

| Method | Route | Role | Mô tả |
| ------ | ----- | ---- | ----- |
| GET | `/product-master` | Warehouse, Packaging, Store Owner, Admin | Danh sách hồ sơ SKU (mảng, tối đa 200): `?status=needs_measurement\|ready&shop_id=&search=` |
| GET | `/product-master/:id` | Warehouse, Packaging, Store Owner, Admin | Chi tiết 1 hồ sơ |
| PUT | `/product-master/:id/packaging-profile` | Warehouse, Admin | Kho xác nhận số đo thật sau gấp/bọc + quy cách xếp → `ready` (writer DUY NHẤT của `dimension`) |
| POST | `/product-master/sync` | Admin | Đồng bộ ngay catalog từ sàn: `?shop_id=&platform=lazada\|aurelle&full=true`. Bỏ `shop_id` = mọi shop của mọi sàn hỗ trợ. Cron tự chạy mỗi giờ (tăng dần) + 3h sáng (toàn bộ) |

> 🔄 **Quyết định khi gộp**: số đo từ sàn chỉ ghi vào `marketplaceDimension` (tham khảo). Engine đóng gói chỉ dùng `dimension` do **kho xác nhận**; thiếu thì báo thiếu, không mặc định 20 cm/0,5 kg. Đã **bỏ** `PATCH /product-master/:id` và `DELETE /product-master/:id/manual-override` của main — sửa số đo đi qua `PUT .../packaging-profile`.

## 10. Notifications (`/notifications`)

| Method | Route                         | Role   | Mô tả                                                       |
| ------ | ----------------------------- | ------ | ----------------------------------------------------------- |
| GET    | `/notifications`              | Bất kỳ | Danh sách thông báo của chính user đang login               |
| GET    | `/notifications/unread-count` | Bất kỳ | Số chưa đọc — FE gọi định kỳ (polling) cho chuông thông báo |
| PATCH  | `/notifications/:id/read`     | Bất kỳ | Đánh dấu 1 thông báo đã đọc                                 |

---

## Ma trận theo Role

> 🔄 Gộp 04/10/2026 — thay đổi quyền chính: **Packaging Staff** duyệt/chỉnh/đóng kế hoạch qua `/order-groups/:groupId/packing-plan/*` (không còn `/packaging/*` cũ); **Warehouse Staff** xác nhận hồ sơ SKU (`PUT /product-master/:id/packaging-profile`) và cũng đóng gói được; **Shipping Coordinator** thêm `/shipping/*`, `POST /shipments/batch`, `PATCH /shipments/:id/pickup`, `/documents/*`; **Store Owner** xem `/product-master`, `/shipping/quote`, đổi `/shipping/settings`. Chi tiết route ở từng mục trên.

### 👑 Admin

Toàn quyền — gọi được mọi route liệt kê ở trên.

### 🏪 Store Owner

```
GET   /users                          Xem danh sách nhân viên
GET   /orders, /orders/:id            MỚI (2026-09-11) — xem đơn hàng của shop mình
GET   /order-groups, /:id             MỚI (2026-09-11) — xem tổng quan nhóm đơn + fulfillment
PATCH /order-groups/:id/priority      Đánh dấu Hỏa Tốc — DUY NHẤT role này (ngoài Admin)
GET   /notifications*                 Nhận cảnh báo thiếu hàng, SLA breach, sync failed
+ 6 route tự phục vụ (me, change-password, mfa, logout)
```

### 📦 Warehouse Staff

```
GET   /order-groups, /:id, /picking-list, /picking-list/:sku    Xem việc cần làm
POST  .../pick-item, /pick, /pack, /return, /report-missing     Thao tác lấy/đóng gói
POST  /order-groups/:id/assign                                  Tự nhận việc HOẶC đổi cho đồng nghiệp khác
GET   /order-groups/staff/search                                Tìm đồng nghiệp để chuyển việc
GET   /warehouse/:warehouseId/picking-list/:groupId              Picking list có vị trí kệ
GET   /warehouse/warehouses, /:id, /:id/zones                    Chọn kho, xem khu (zones mở 01/10/2026)
GET   /warehouse/warehouses/:id/bin-locations, /sku-bin-assignments   Xem ô và tồn theo ô (mở 01/10/2026)
POST  .../sku-bin-assignments/:assignmentId/restock, /adjust, /transfer   Nhập hàng (mở 01/10/2026), kiểm kê, chuyển ô
GET   /notifications*
```

### 🎁 Packaging Staff

```
GET   /order-groups, /:id, /:groupId/packaging       Xem đơn cần duyệt
POST  .../packaging/approve, /adjust, /reject         Duyệt gợi ý đóng gói
POST  .../fulfillment/decide-partial                  Quyết định đơn thiếu hàng
GET   /order-groups/staff/search                       Xem tải việc của Warehouse Staff (tham khảo)
GET   /notifications*
```

### 🚚 Shipping Coordinator

```
GET   /order-groups, /:id, /:groupId/packaging
POST  .../fulfillment/ship, /deliver, /return
GET   /notifications*
```

**Ghi chú**: Shipping Coordinator hiện có ít route riêng nhất — chưa có API chọn carrier/lên lịch pickup/tracking thật (Tầng 2, chưa code).

---

## Bảng mã lỗi

Xem chi tiết đầy đủ ở `INTEGRATION_GUIDE_FULFILLMENT.md` PHẦN D.3 (đã đổi cấu trúc từ "mục 1-10" sang "PHẦN A-D" từ bản v3) — không lặp lại ở đây tránh 2 nguồn dễ lệch nhau.

### Mã lỗi bổ sung khi gộp thi_dev (04/10/2026)

Xem chi tiết đầy đủ ở `INTEGRATION_GUIDE_FULFILLMENT.md` PHẦN D.3 (đã đổi cấu trúc từ "mục 1-10" sang "PHẦN A-D" từ bản v3) — không lặp lại ở đây tránh 2 nguồn dễ lệch nhau.

Bảng tra nhanh theo module (chi tiết "khi nào xảy ra" vẫn ở guide trên):

| Module | Codes |
|---|---|
| Auth/Google | `AUTH_*`, `GOOGLE_*` theo service và `GoogleOAuthErrorCode` |
| Marketplace | `MKT_OAUTH_STATE_INVALID`, `MKT_ADAPTER_NOT_REGISTERED`, `MKT_SHOP_NOT_CONNECTED`, `MKT_TOKEN_EXCHANGE_FAILED`, `MKT_TOKEN_REFRESH_FAILED`, `MKT_TOKEN_DECRYPT_FAILED`, `MKT_WEBHOOK_SIGNATURE_INVALID`, `MKT_SHOP_LOOKUP_FAILED`, `MKT_SERVER_ERROR` |
| Orders | `ORD_SYNC_FAILED`, `ORD_UNSUPPORTED_PLATFORM`, `ORD_INVALID_ORDER_ID`, `ORD_ORDER_NOT_FOUND` |
| Order Groups | `ORD_GROUP_INVALID_ID`, `ORD_GROUP_NOT_FOUND`, `ORD_GROUP_STATE_CONFLICT`, `ORD_GROUP_INVALID_TRANSITION`, `ORD_GROUP_INSUFFICIENT_STOCK`, `ORD_GROUP_ITEM_NOT_IN_GROUP`, `ORD_GROUP_PACKAGING_PROFILE_NOT_READY`, `ORD_GROUP_ALL_ORDERS_CANCELED`, 🆕 21/09: `ORD_GROUP_PICK_NOT_ALLOWED`, `ORD_GROUP_PICK_EXCEEDS_ORDERED`, `ORD_GROUP_PICK_INCOMPLETE`, `ORD_GROUP_NO_PICK_EVENTS` |
| Staff assignment | `ORD_GROUP_NO_STAFF_AVAILABLE`, `ORD_GROUP_STAFF_NOT_FOUND`, `ORD_GROUP_STAFF_INACTIVE` |
| Shipping 🆕 30/09 | `SHIP_INVALID_CARRIER_ID`, `SHIP_CARRIER_NOT_FOUND`, `SHIP_CARRIER_CODE_IN_USE`, `SHIP_SERVICE_NOT_FOUND`, `SHIP_INVALID_RATE_TABLE`, `SHIP_NO_PARCELS`, `SHIP_SETTINGS_SERVICE_INVALID` |
| Documents 🆕 30/09 | `DOC_NO_ORDERS`, `DOC_SHIPMENT_NOT_FOUND`, `DOC_TRIP_NOT_FOUND` |
| Shipments 🆕 29/09 | `SHP_PICKUP_IN_PAST`, `SHP_SHIPMENT_NOT_FOUND`, `SHP_EMPTY_GROUP_LIST`, `SHP_GROUP_NOT_PACKED`, `SHP_RECIPIENT_MISMATCH`, `SHP_GROUP_ALREADY_SHIPPED` |
| Packaging (danh mục) | `PKG_INVALID_BOX_ID`, `PKG_BOX_NOT_FOUND`, `PKG_BOX_CODE_IN_USE`, `PKG_BOX_INVALID_DIMENSIONS`, `PKG_BOX_OUT_OF_STOCK`, `PKG_INVALID_BAG_ID`, `PKG_BAG_NOT_FOUND`, `PKG_BAG_CODE_IN_USE`, `PKG_INVALID_MATERIAL_ID`, `PKG_MATERIAL_NOT_FOUND`, `PKG_MATERIAL_CODE_IN_USE`, `PKG_MATERIAL_RULES_CONFLICT` (🔄 04/10: các mã của phương án cũ — `PKG_*RECOMMENDATION*`, `PKG_HAS_NO_FIT`, `PKG_ADJUSTMENT_NOTE_REQUIRED`, `PKG_CARTON_NOT_FOUND`... — đã gỡ) |
| Kế hoạch đóng gói 🆕 04/10 | `PACKING_INVALID_ID` (400), `PACKING_PLAN_NOT_FOUND` (404), `PACKING_PLAN_COMPUTING` (409), `PACKING_WRONG_PLAN_STATUS` (409), `PACKING_VERSION_CONFLICT` (409), `PACKING_HAS_UNPLACED` (409), `PACKING_PARCEL_NOT_FOUND` (404), `PACKING_ITEM_NOT_IN_PARCEL` (404), `PACKING_MOVE_ACROSS_ORDERS` (400), `PACKING_BOX_DOES_NOT_FIT` (422), `PACKING_NOTE_REQUIRED` (400), `PACKING_PACK_WEIGHTS_MISMATCH` (400), `PACKING_GUIDE_NOT_AVAILABLE` (409) |
| Product Master | 🆕 21/09: `PM_INVALID_ID`, `PM_NOT_FOUND` |
| Warehouse | `WH_WAREHOUSE_NOT_FOUND`, `WH_ZONE_NOT_FOUND`, `WH_INVALID_BIN_RANGE`, `WH_WAREHOUSE_CODE_IN_USE`, `WH_ZONE_CODE_IN_USE` (2 mã cuối 🆕 19/09/2026 — trùng mã kho/khu, trả 409 thay vì 500), `WH_INVALID_GROUP_IDS` (🆕 29/09/2026 — 400, `group_ids` rỗng/sai định dạng ở picking-list gộp) |
| Notifications | `NOTI_INVALID_ID`, `NOTI_NOT_FOUND` |

## 9d. 🆕 K3 — Sổ cái kho, kiểm kê, chuyển ô (27/09/2026)

| Method | Route                                                                            | Role                          | Mô tả                                                  |
| ------ | -------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------ |
| POST   | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/adjust`    | Admin, Warehouse              | Kiểm kê: số đếm thực tế + lý do, ghi sổ cái            |
| POST   | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/transfer`  | Admin, Warehouse              | Chuyển hàng sang ô khác (1 transaction, 2 dòng sổ cái) |
| DELETE | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId`           | Admin                         | Bỏ gán SKU khỏi ô (tồn phải = 0)                       |
| GET    | `/warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/movements` | Admin, Warehouse, Store Owner | Sổ cái của SKU trên ô                                  |

> 🔄 K3: gán SKU vào ô khác nay là THÊM ô (không còn dời); Picking List có `bin_location_id` + `other_bins`; `pick-item` nhận thêm `bin_location_id`. **Phải chạy `scripts/migrate-sku-bin-assignment-multibin.ts` trên mỗi môi trường.**

## 10. 🆕 Giao hàng (`/shipments`) — G1 (27/09/2026)

| Method | Route                           | Role                                       | Mô tả                                            |
| ------ | ------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| GET    | `/shipments/reason-codes`       | Admin, Coordinator, Store Owner, Warehouse | Lý do giao thất bại                              |
| GET    | `/shipments` · `/shipments/:id` | Admin, Coordinator, Store Owner, Warehouse | Danh sách / chi tiết vận đơn                     |
| GET    | `/shipments/:id/events`         | Admin, Coordinator, Store Owner, Warehouse | Tracking dạng dòng thời gian                     |
| POST   | `/shipments`                    | Coordinator, Admin                         | Bắt đầu giao (nhóm đơn packed). 🆕 tùy chọn `carrier_code` + `service_code` (+ `pickup_at`) → ghi cước/ETA lên vận đơn và từng kiện |
| POST   | `/shipments/:id/deliver`        | Coordinator, Admin                         | Giao thành công                                  |
| POST   | `/shipments/:id/fail`           | Coordinator, Admin                         | Giao thất bại (lần 2 / khách từ chối -> tự hoàn) |
| POST   | `/shipments/:id/retry`          | Coordinator, Admin                         | Giao lại                                         |
| POST   | `/shipments/:id/receive-return` | Warehouse, Admin                           | Kho nhận kiện hoàn (tự tạo phiếu hoàn)           |
| 🆕 POST | `/shipments/batch` | Coordinator, Admin | **Gộp từ thi_dev** — giao chung chuyến 1..N nhóm `packed` trong 1 transaction, chung `tripCode`; ≥2 nhóm phải cùng `recipient_key`. **Bắt buộc** `carrier_code` + `service_code`. Mỗi vận đơn đi đúng vòng đời G1 (`out_for_delivery`, có lịch sử + SLA) |
| 🆕 GET | `/shipments/group/:groupId` | Admin, Coordinator, Store Owner, Warehouse | Vận đơn của 1 nhóm (`null` nếu chưa có) |
| 🆕 PATCH | `/shipments/:id/pickup` | Coordinator, Admin | Đặt/đổi lịch hãng đến lấy hàng `{ pickup_at }` (chỉ lưu lịch) |

> 🔄 G1: `POST /order-groups/:id/fulfillment/ship|deliver|return` giữ nguyên URL/body/response nhưng nay đi qua vận đơn (deprecated). Chi tiết: **`INTEGRATION_GUIDE_SHIPPING.md`**.

> 🆕 Gộp 04/10/2026: response vận đơn có thêm `tripCode`, `trackingCode` (= `shipmentCode`), `carrierCode/Name`, `serviceCode/Name`, `parcelCount`, `chargeableWeightG`, `estimatedCostVnd`, `isSampleRate`, `etaFrom/To`, `pickupAt` (null khi giao đội xe nhà). `GET /shipments` lọc thêm `trip_code`, `carrier_code`. Lỗi mới: `SHP_EMPTY_GROUP_LIST`, `SHP_RECIPIENT_MISMATCH`, `SHP_PICKUP_IN_PAST`, `SHP_CARRIER_REQUIRED`. Đã bỏ collection/route giao chung chuyến riêng của thi_dev — dùng chung `shipments` của G1.

## 10b. 🆕 Vận chuyển — hãng, bảng cước, báo giá (`/shipping`) — 30/09/2026

Báo giá đọc các **kiện thật** của nhóm (phương án đóng gói đã duyệt/đã đóng): cân thực = cân đo lúc `pack` nếu có, chưa pack thì cân ước tính; cân quy đổi = thể tích ngoài của thùng ÷ hệ số của hãng; **cước mỗi kiện = bậc cước theo max(cân thực, cân quy đổi)**, vượt bậc cuối cộng theo mỗi 500 g. Hãng/bảng cước hiện là **số mẫu** (`is_sample`) — Admin thay bằng số thật.

| Method | Route | Role | Mô tả |
| ------ | ----- | ---- | ----- |
| GET | `/shipping/carriers?active=false` | Shipping, Store Owner, Warehouse, Admin | Danh mục hãng + dịch vụ + bảng cước (mặc định chỉ hãng đang dùng) |
| POST | `/shipping/carriers` | Admin | Tạo hãng (`code`, `name`, `volumetric_divisor`, `services[]` gồm `bands[]`, `eta_min_days/eta_max_days`, `extra_price_vnd_per_500g`) |
| PATCH | `/shipping/carriers/:id` | Admin | Sửa hãng (không đổi `code`; `is_active:false` = ngừng dùng) |
| GET | `/shipping/quote/:groupId` | Shipping, Store Owner, Admin | Báo giá MỌI dịch vụ cho nhóm: `{ groupId, parcelCount, strategy, quotes[], recommended }` |
| GET | `/shipping/settings` | Shipping, Store Owner, Admin | Chiến lược chọn hãng: `cheapest` / `fastest` / `fixed` (+ hãng/dịch vụ mặc định) |
| PUT | `/shipping/settings` | Store Owner, Admin | Đổi chiến lược |

Lỗi: `SHIP_INVALID_CARRIER_ID`, `SHIP_CARRIER_NOT_FOUND`, `SHIP_CARRIER_CODE_IN_USE`, `SHIP_SERVICE_NOT_FOUND`, `SHIP_INVALID_RATE_TABLE`, `SHIP_NO_PARCELS` (nhóm chưa có kiện hợp lệ để báo giá), `SHIP_SETTINGS_SERVICE_INVALID`. Seed hãng mẫu: `npx ts-node -r tsconfig-paths/register scripts/seed-shipping-carriers.ts`.

## 10c. 🆕 Chứng từ in PDF (`/documents`) — 30/09/2026

Trả `application/pdf` (font DejaVu nhúng nên đủ tiếng Việt). FE cần gửi Bearer nên tải bằng `fetch` → blob → mở tab mới (xem `fe/src/api/shipping.api.ts::openDocument`), không mở thẳng bằng thẻ `<a>`.

| Method | Route | Role | Nội dung |
| ------ | ----- | ---- | -------- |
| GET | `/documents/packing-slip/:groupId` | Warehouse, Packaging, Store Owner, Admin | Phiếu đóng gói — mỗi đơn 1 trang A5: người nhận, hàng (ô tích), các kiện/thùng, barcode nhóm |
| GET | `/documents/shipping-label/:groupId` | Shipping, Warehouse, Admin | Nhãn 100×150 mm — **mỗi kiện 1 nhãn** (k/n), barcode Code128 + QR mã vận đơn, hãng, ETA. Cần đã có vận đơn |
| GET | `/documents/manifest/:tripCode` | Shipping, Store Owner, Admin | Bảng kê chuyến A4 — mọi vận đơn cùng mã chuyến, tổng kiện/cân/cước, chỗ ký giao nhận |

Lỗi: `DOC_NO_ORDERS` (409, nhóm không còn đơn hợp lệ), `DOC_SHIPMENT_NOT_FOUND` (404, chưa có vận đơn), `DOC_TRIP_NOT_FOUND` (404).

## 11. 🆕 Trả hàng (`/returns`) — G3 (27/09/2026)

| Method | Route                                                 | Role                                       | Mô tả                                                        |
| ------ | ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| GET    | `/returns/reason-codes` · `/returns` · `/returns/:id` | Admin, Store Owner, Warehouse, Coordinator |                                                              |
| POST   | `/returns`                                            | Admin (đóng vai khách)                     | Yêu cầu trả hàng / hoàn tiền (nhóm đơn delivered, ≤15 ngày)  |
| POST   | `/returns/:id/approve`                                | Store Owner, Admin                         | Duyệt (người tạo không tự duyệt)                             |
| POST   | `/returns/:id/reject`                                 | Store Owner, Admin                         | Từ chối (bắt buộc lý do)                                     |
| POST   | `/returns/:id/receive`                                | Warehouse, Admin                           | Hàng trả về kho                                              |
| POST   | `/returns/:id/inspect`                                | Warehouse, Admin                           | Kiểm hàng: restock (nhập lại, sổ cái) / quarantine / discard |

> Gộp 04/10/2026: route nhận hàng hoàn riêng của thi_dev (`POST /order-groups/:id/fulfillment/return-receive`, collection `return_receipts`) **đã bỏ** — dùng luồng `/returns` ở trên (có kiểm chất lượng và ghi sổ kho).

## 12. 🆕 Vật liệu đóng gói (`/packaging-materials`) — G4 (27/09/2026)

| Method         | Route                                            | Role                                     | Mô tả                                                         |
| -------------- | ------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------- |
| GET            | `/packaging-materials` · `/:code` · `/movements` | Admin, Store Owner, Warehouse, Packaging | Danh mục + tồn mới/tái sử dụng, sổ cái                        |
| GET            | `/packaging-materials/savings`                   | Admin, Store Owner                       | Tổng tiết kiệm, tỷ lệ dùng lại                                |
| POST           | `/packaging-materials`                           | Admin                                    | Khai vật liệu (thùng: 3 kích thước; đệm: match_material_type) |
| PATCH · DELETE | `/packaging-materials/:code`                     | Admin                                    | Sửa tên/đơn giá · vô hiệu hóa (chặn nếu còn tồn)              |
| POST           | `/packaging-materials/:code/reactivate`          | Admin                                    |                                                               |
| POST           | `/packaging-materials/:code/purchase`            | Admin, Warehouse                         | Nhập vật liệu mới                                             |

> 🔄 Gộp 04/10/2026: đây là **kho vật tư chung** — engine đóng gói đọc thùng (`kind: box` có `inner`/`outer` mm, `tare_g`, `max_load_g`) và vật tư chèn (`kind: cushioning` có `material_type`, `weight_g_per_unit`) từ đây; xác nhận đóng gói (`packing-plan/pack`) trừ tồn theo từng kiện, ưu tiên hàng tái sử dụng. Thùng hết → 409 `PKG_BOX_OUT_OF_STOCK`; vật tư chèn thiếu → không chặn, chỉ báo. `POST /returns/:id/inspect` nhận thêm `packaging[]`. Chi tiết: **`INTEGRATION_GUIDE_PACKAGING_MATERIALS.md`**.

## 13. 🆕 Màu & SKU nội bộ (`/colors`, `/master-skus`) — K4a (27/09/2026)

| Method                | Route                                                                  | Role                                     | Mô tả                                      |
| --------------------- | ---------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| GET                   | `/colors`                                                              | Admin, Store Owner, Warehouse, Packaging | Danh mục màu chuẩn                         |
| POST · PATCH · DELETE | `/colors` · `/colors/:code`                                            | Admin                                    |                                            |
| POST                  | `/colors/:code/reactivate`                                             | Admin                                    |                                            |
| GET                   | `/master-skus` · `/master-skus/:code` · `/:code/mappings`              | Admin, Store Owner, Warehouse, Packaging |                                            |
| GET                   | `/master-skus/unmapped-seller-skus`                                    | Admin, Store Owner                       | SKU sàn chưa nối                           |
| POST                  | `/master-skus`                                                         | Admin                                    | Tạo — hệ thống tự ghép mã                  |
| PATCH · DELETE        | `/master-skus/:code`                                                   | Admin                                    | Sửa thuộc tính mô tả · vô hiệu hóa         |
| POST                  | `/master-skus/:code/reactivate` · `/:code/replace` · `/:code/mappings` | Admin                                    | Kích hoạt lại · Thay thế SKU · Nối SKU sàn |
| DELETE                | `/master-skus/mappings/:id`                                            | Admin                                    | Bỏ nối                                     |

> 🔄 K4a: `pick-item` + Picking List lọc thêm platform/shop_id; pick-item chạy trong 1 transaction. Request/response không đổi.

## 14. 🆕 K4b + K5 — Tồn chung theo SKU nội bộ & chống bán lố (27/09/2026)

| Method | Route                                             | Role                          | Mô tả                                                            |
| ------ | ------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| GET    | `/master-skus/unpooled-stock`                     | Admin, Store Owner            | Dòng tồn > 0 chưa tính theo SKU nội bộ (chưa nối / chưa đồng bộ) |
| POST   | `/master-skus/sync-stock`                         | Admin                         | Gắn nhãn/gộp tồn cho mọi liên kết (idempotent)                   |
| GET    | `/stock-availability?platform&shop_id&seller_sku` | Admin, Store Owner, Warehouse | Tồn thực / đã giữ / khả dụng                                     |
| GET    | `/order-groups/:id/stock-reservation`             | Admin, Store Owner, Warehouse | Giữ chỗ theo SKU                                                 |
| POST   | `/order-groups/:id/stock-reservation/recheck`     | Admin, Store Owner            | Tính lại giữ chỗ                                                 |
| POST   | `/order-groups/:id/stock-reservation/release`     | Admin                         | Nhả giữ chỗ                                                      |

> 🔄 K4b: nối SKU sàn tự gắn nhãn/gộp tồn; bỏ nối chặn khi tồn gộp > 0 (`MAP_HAS_POOLED_STOCK`); dòng tồn + sổ cái có `masterSku`; Picking List có `master_sku`; pick-item tự trừ vào tồn chung (request/response không đổi). 🔄 K5: nhóm đơn có `stockShortage`, `stockShortageItems`. Chi tiết + demo: **`INTEGRATION_GUIDE_SKU_STOCK_K4_K5.md`**.

## 15. 🆕 Tiện ích vận hành (27/09/2026)

| Method | Route                                        | Role                                       | Mô tả                                    |
| ------ | -------------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| POST   | `/shipments/overdue-scan`                    | Admin                                      | Quét vận đơn quá hạn ngay                |
| GET    | `/shipments?overdue=true`                    | Admin, Coordinator, Store Owner, Warehouse | Lọc vận đơn quá hạn                      |
| GET    | `/returns/quarantine`                        | Admin, Store Owner, Warehouse, Coordinator | Danh sách hàng cách ly chờ xử lý         |
| POST   | `/returns/:id/quarantine/:lineIndex/resolve` | Warehouse, Admin                           | Nhập lại kho / loại bỏ hàng cách ly      |
| POST   | `/returns/:id/create-replacement`            | Admin                                      | Tạo lại đơn thay thế khi tạo tự động lỗi |
| POST   | `/packaging-materials/:code/internal-use`    | Admin, Warehouse                           | Xuất vật liệu hạng B dùng nội bộ         |

> 🔄 Trường tùy chọn mới: `fail` nhận `reschedule_at`; `retry` nhận `override_reason`; `pack` nhận `materials_used`; `POST /returns` nhận `type: exchange` + `exchange_items`. Response bổ sung: vận đơn `nextAttemptNotBefore`, `dueAt`, `isOverdue`; phiếu trả `exchangeItems`, `replacementStatus`, `replacementGroupId`, `replacementError`; nhóm đơn `origin`, `sourceReturnId`; vật liệu `qtyInternal`. Chi tiết: **`INTEGRATION_GUIDE_OPERATIONS_UTILITIES.md`**.
