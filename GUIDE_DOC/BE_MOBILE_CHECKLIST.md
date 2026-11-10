# BE — Việc phải làm để app mobile chạy được

> **Phiên bản 1.2 — 10/11/2026 tối** (1.1 — 10/11/2026; 1.0 — 09/11/2026). 1.2: xong push FCM (mục 3), thêm mục 11–12 theo `MOBILE_BE_REQUESTS.md`. Danh sách việc phía **backend** (`be/`) để app mobile (Flutter, BM04 RF-07) dùng được. Việc phía app nằm ở `MOBILE_UPDATE_CHECKLIST.md`; việc phía web nằm ở `FE_UPDATE_CHECKLIST.md`.
> Làm xong mục nào thì đổi `- [ ]` thành `- [x]` và ghi ngày + mã commit vào phần Ghi chú. Mỗi mục là chức năng mới: hỏi Thuận chốt trước khi code. Các mục đã chốt ghi ở dòng **Đã chốt**.

---

## A. Chặn mobile — làm trước khi làm app

- [x] **1. Tra ô kệ theo mã quét**
  - Route mới `GET /warehouse/warehouses/:warehouseId/bins/by-code/:binCode` (Admin, Warehouse Staff): trả ô kèm các SKU đang gán và tồn trên ô.
  - Vì sao: màn nhập thêm / kiểm kê / chuyển ô bắt đầu bằng quét mã ô. Hiện chỉ có `GET .../sku-bin-assignments` trả toàn bộ SKU của kho, không lọc theo mã ô.
  - Độ lớn: nhỏ. Ghi chú: xong 09/11/2026 (AOFP-251). Response `{ bin, zoneCode, zoneName, assignments[] }`; 404 `WH_BIN_NOT_FOUND`. Mã quét được bỏ khoảng trắng, thử cả bản viết hoa. Thêm index `{ warehouse_id, bin_location_id }`.

- [x] **2. Giới hạn gọi API theo user thay vì theo IP**
  - Đổi khóa đếm của throttler sang `user id` khi đã đăng nhập (chưa đăng nhập thì vẫn theo IP).
  - Vì sao: cả kho chung một wifi (một IP), 600 lần/phút (`THROTTLE_LIMIT_PER_MINUTE`) bị chia cho mọi máy, dễ bị 429.
  - Độ lớn: nhỏ. Ghi chú: xong 09/11/2026 (AOFP-252). `common/throttle/throttle-tracker.ts`: token hợp lệ (đúng chữ ký, còn hạn) → `user:<id>`; không có / sai → `ip:<ip>`.

- [x] **3. Push thông báo (FCM)**
  - Route đăng ký / gỡ token thiết bị (`POST /notifications/devices`, `DELETE /notifications/devices/:token`), collection lưu token theo user, gửi push trong `NotificationsService.notify()` cùng lúc với in-app và email; token hết hạn thì tự xóa.
  - Vì sao: báo việc mới và việc có hạn chót mà app không phải hỏi liên tục (tốn pin).
  - Phân việc: **BE** lưu token, gửi push qua Firebase Admin, dọn token hết hạn. **App** xin quyền thông báo, lấy token từ Firebase gửi lên BE, hiện thông báo và mở đúng màn khi bấm. Web FE không liên quan.
  - **Đã chốt — nguyên tắc chọn loại push** (theo hướng dẫn thông báo của Android): chỉ push việc **phải làm ngay hoặc có hạn chót**; không push tác vụ nền hệ thống tự xử lý, lỗi tự phục hồi, thông tin không gấp. Không chia theo mức `severity` (VD `packing_assigned` là `info` nhưng cần push nhất).
  - **Đã chốt (10/11/2026) — Thuận duyệt bảng loại push:**

    | Khâu | Push (19 loại) | Chỉ hiện trong app (8 loại) |
    |---|---|---|
    | Kho | `missing_item`, `return_to_shelf`, `sla_warning` (hạn đóng), `stock_shortage` | — |
    | Đóng gói | `packing_assigned`, `pending_approval`, `packing_parcel_held`, `packing_issue`, `unpack_required`, `packing_blocked` | `packaging_plan_invalidated` (tự tính lại), `packaging_rejected`, `abnormal_package`, `low_box_stock`, `low_material_stock` |
    | Giao hàng | `delivery_failed`, `delivery_overdue`, `sla_warning` / `sla_breach` (hạn giao) | `delivery_returning` |
    | Store Owner / Admin | `cancel_confirmation_required`, `marketplace_confirm_required`, `connection_lost`, `return_requested`, `group_auto_canceled` (chỉ cho nhân viên đang làm nhóm đó), `mfa_disabled` | `sync_failed` (lượt sau tự chạy lại), `consolidation_name_mismatch`, `group_auto_canceled` (cho Owner) |

  - **Đã chốt (10/11/2026) — thêm `picking_assigned` (push đích danh):** `staff-assignment.service.ts` (phân công tự động / thủ công) không gọi `notify()`, nên Warehouse Staff không được báo khi có nhóm đơn mới. Đã thêm loại `picking_assigned` (push, gửi đích danh người được giao), giống `packing_assigned` bên đóng gói.
  - **Cần trước khi chạy thật (Thuận làm):** repo hiện chưa có gì của Firebase (không có `google-services.json`, `firebase` trong `pubspec.yaml`, `firebase-admin` trong `be/package.json`, biến môi trường). Các bước:
    1. Tạo project tại console.firebase.google.com — gói **Spark miễn phí** là đủ cho FCM (chỉ Cloud Storage mới bắt gói Blaze).
    2. Add app **Android**, package name `vn.optipack.optipack_mobile` (đúng `applicationId` trong `mobile/android/app/build.gradle`), tải `google-services.json` đặt vào `mobile/android/app/`.
    3. Project settings → Service accounts → Generate new private key: file JSON này là khóa bí mật của BE, **để ngoài repo**; điền đường dẫn tuyệt đối vào `FCM_SERVICE_ACCOUNT_FILE` trong `be/.env`.
    4. iOS bỏ qua cho demo (push trên iPhone cần tài khoản Apple Developer trả phí).
  - Độ lớn: vừa. Ghi chú: xong 10/11/2026 (AOFP-265). Gửi qua FCM HTTP v1 bằng service account (tự ký JWT, không thêm `firebase-admin`). Route `POST /notifications/devices` (`{ token, platform, app_version? }`, tối đa 10 máy/người), `DELETE /notifications/devices/:token` (chỉ token của mình). Collection `device_tokens` (`token` unique). Bảng loại push ở `notifications/push/push-policy.ts`; `data` push = `notification_id`, `type`, `severity`, `related_entity_type`, `related_entity_id`; kênh Android `optipack_alerts`. Token chết (`UNREGISTERED` / `INVALID_ARGUMENT`) tự xoá. Chưa có `FCM_SERVICE_ACCOUNT_FILE` → không gửi push, in-app + email vẫn chạy. **Chưa gửi thử push thật** (chờ project Firebase).

- [x] **4. Upload ảnh bằng chứng**
  - Route upload ảnh, thêm `photo_urls` cho: giao thành công / thất bại (`/shipments/:id/deliver`, `/fail`), kiểm hàng hoàn (`/returns/:id/inspect`), báo lỗi kiện (`packing-plan/report-issue`). `shipment-event.schema.ts` đã chừa chỗ `proof{photo_urls}`.
  - Vì sao: màn giao Hỏa Tốc, nhận hàng hoàn, báo lỗi kiện có nút chụp ảnh.
  - **Đã chốt (10/11/2026):**
    - Lưu ảnh trên **Cloudinary** (gói Free: 25 credit/tháng, 1 credit = 1 GB lưu hoặc 1 GB băng thông hoặc 1.000 lần xử lý ảnh). Chọn vì đăng ký nhanh, SDK Node chính thức, tự nén và thu nhỏ ảnh. Đã so sánh và loại: ImageKit (hết băng thông thì ngừng hiện ảnh), Supabase Storage (project tạm dừng sau 1 tuần không dùng), Cloudflare R2 (tự cấu hình bucket, không nén ảnh), Firebase Storage (bắt buộc gói Blaze có thẻ từ 03/02/2026).
    - **Tối đa 10 MB mỗi ảnh** (giới hạn ảnh của gói Free Cloudinary), chỉ nhận JPG, PNG, WebP, HEIC. **Tối đa 3 ảnh mỗi thao tác.** App nên nén ảnh trước khi gửi.
    - Bắt buộc ảnh (theo cách các hãng giao hàng làm: GHN chụp ảnh gói hàng khi giao thành công; khi giao thất bại GHN bắt buộc liên hệ shop và người nhận, không bắt buộc ảnh):
      - Đơn tự giao — **giao thành công: bắt buộc ≥ 1 ảnh**.
      - Đơn tự giao — **giao thất bại: không bắt buộc ảnh, bắt buộc chọn lý do**; có ảnh thì đính kèm.
      - Kiểm hàng hoàn, báo lỗi kiện: không bắt buộc ảnh.
      - Đơn GHN: ảnh nằm bên GHN, BE không xử lý.
  - **Cần trước (Thuận làm):** tạo tài khoản Cloudinary, điền `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` vào `be/.env` (không commit). Chưa điền thì route upload trả lỗi "chưa cấu hình", các chức năng khác vẫn chạy.
  - Độ lớn: vừa. Ghi chú: xong 10/11/2026 (AOFP-261). Module `proof-photos`: `POST /proof-photos` (field `files`, 1–3 ảnh) gửi thẳng Cloudinary bằng REST có chữ ký (dùng `axios` sẵn có, không thêm thư viện), thu nhỏ ≤ 1600 px, lưu JPG ở thư mục `optipack/proof`. `photo_urls` chỉ nhận URL đúng cloud + thư mục (decorator `@IsProofPhotoUrls`). Lưu ảnh: `shipment_events.photo_urls`, `return_requests.inspection_photo_urls`, `packing_plans.issues[].photo_urls`. Thiếu ảnh khi shop tự giao thành công → 400 `SHP_PROOF_PHOTO_REQUIRED`. Route cũ `order-groups/:id/fulfillment/deliver` (legacy) không kiểm ảnh. **Web FE phải thêm chụp/tải ảnh ở nút Giao thành công** (`FE_UPDATE_CHECKLIST.md` dòng 17), nếu không sẽ bị chặn với vận đơn shop tự giao.

## B. Nên làm thêm — không chặn

- [x] **5. `GET /health`** kiểm tra kết nối MongoDB + Redis (app biết server sống hay lỗi). Nhỏ. Ghi chú: xong 09/11/2026 (AOFP-252). Công khai, không tính giới hạn gọi; 200 `{ status: 'ok', mongo: 'up', redis: 'up', uptime_s, time }`, có cái lỗi thì 503 `status: 'degraded'`.
- [x] ~~**6. `GET /app/version`**~~ — **Bỏ (10/11/2026):** app không đưa lên CH Play / App Store; demo chạy `flutter run` từ máy tính nên điện thoại luôn có bản mới nhất. Chỉ cần lại khi phát hành app cho nhiều người cài.
- [x] **7. Tắt Swagger khi production; bật `enableShutdownHooks()`** trong `main.ts`. Nhỏ.
  - **Đã chốt (10/11/2026):** Swagger luôn bật khi chạy dev; khi `NODE_ENV=production` mặc định tắt, bật lại bằng `SWAGGER_ENABLED=true` (vì `docker-compose.yml`, `be/Dockerfile`, `k8s` đều đặt sẵn `NODE_ENV=production`). App mobile không dùng Swagger nên không ảnh hưởng. `enableShutdownHooks()`: khi server khởi động lại (deploy, k8s đổi pod) thì xử lý nốt request đang chạy rồi mới đóng Mongo / Redis — thao tác ghi từ app không bị đứt giữa chừng.
  - Ghi chú: xong 10/11/2026 (AOFP-256). `common/utils/swagger-enabled.util.ts` (`isSwaggerEnabled`), `.env.example` thêm `SWAGGER_ENABLED`.
- [x] **8. Cache `GET /dashboard/summary` bằng Redis.** Hiện mỗi lần mở dashboard BE chạy lại khoảng 8 truy vấn đếm / tổng hợp. Nhỏ.
  - **Đã chốt (10/11/2026): cache 5 giây.** Để thấp không làm sai số liệu, chỉ giảm tác dụng đỡ tải; để cao (30–60 giây) thì số liệu chậm, người xem tưởng hệ thống lỗi.
  - Ghi chú: xong 10/11/2026 (AOFP-257). `DashboardService.cachedSummary()` lưu trong bộ nhớ tiến trình thay vì Redis: giữ đúng kiểu Date, gộp các request đến cùng lúc vào 1 lượt tính, Redis lỗi không ảnh hưởng. Lần tính lỗi không được lưu.
- [x] **9. Tìm nhóm đơn theo đuôi mã không quét cả bảng** (hiện dùng `$expr` + `$toString` `_id`). Nhỏ.
  - **Đã chốt (10/11/2026): cách (a)** — mỗi nhóm đơn lưu thêm mã ngắn (ký tự cuối của `_id`) có index; nhân viên vẫn gõ 6–8 ký tự cuối như hiện nay. Kèm script bổ sung mã ngắn cho nhóm đơn cũ.
  - Ghi chú: xong 10/11/2026 (AOFP-258). Field `order_groups.id_reversed` = mã nhóm viết ngược (đuôi mã thành đầu chuỗi → regex `^…` dùng được index, tìm được mọi đuôi 4–23 ký tự). Nhóm mới tự ghi khi tạo; nhóm cũ: `scripts/backfill-order-group-id-reversed.ts` (chạy thử, rồi `--apply`) — chưa chạy thì vẫn tìm được theo cách cũ.
- [x] **10. Sửa mock trong test cũ thiếu hàm mới** (log `clearPackingBlocked is not a function`, `scheduleShortageRecheck is not a function`, `autoCreateFromSellerSkus is not a function`) để test kiểm tra thật nhánh đó. Nhỏ. Không cần chốt. Ghi chú: xong 10/11/2026 (AOFP-259). Thêm hàm vào mock và 1 assert cho mỗi nhánh: `packing-plan.service.spec.ts`, `returns.service.spec.ts`, `storefront-sku-rule.spec.ts`, `master-skus.service.spec.ts` (`productMasterModel.find`). Còn `order-groups.service.recipientKeyAndCancel.spec.ts` in `orderModel.find / aggregate`, `pickEventModel.find`, `autoAssign is not a function` (mock rỗng cho nhiều nhánh best-effort) — chưa sửa.

---

- [x] **11. Lọc vận đơn theo shipper** (`MOBILE_BE_REQUESTS.md` mục 2) — màn "Việc của tôi" của shipper Hỏa Tốc. Nhỏ.
  - **Đã chốt (10/11/2026):** chỉ thêm bộ lọc, **không** thu hẹp quyền xem (web vẫn cho Coordinator xem mọi vận đơn).
  - Ghi chú: xong 10/11/2026 (AOFP-264). `GET /shipments?shipper_id=me|<userId>&status=…&before=<updatedAt>&limit=`; có `before` thì bỏ qua `page` (con trỏ theo `updated_at`), `total` vẫn là tổng theo bộ lọc. Index `{ shipper_id, status, updated_at }` (partial).
- [ ] **12. Đăng nhập Google cho app mobile** (`MOBILE_BE_REQUESTS.md` mục 6). Vừa.
  - **Đã chốt (10/11/2026): làm sau push**, theo cách 1: `POST /auth/google/mobile` nhận `id_token`, kiểm với Google, áp đúng luật web (chỉ tài khoản đã có; `ACCOUNT_NOT_REGISTERED`, `ACCOUNT_INACTIVE`, `ACCOUNT_LOCKED`, `EMAIL_NOT_VERIFIED`), trả cùng dạng `POST /auth/login`.
  - **Cần trước (Thuận làm):** tạo OAuth client Android trong Google Cloud (package `vn.optipack.optipack_mobile` + SHA-1 của khoá ký app), cho BE biết client id.
  - Ghi chú: _

**Giữ nguyên đã chốt khi đối chiếu `MOBILE_BE_REQUESTS.md` (10/11/2026):** mục 6 `GET /app/version` vẫn **bỏ** (file mobile ghi "phát cho người dùng thật" nhưng Thuận chốt app không đưa lên store); link ảnh bằng chứng **giữ công khai** (link Cloudinary ngẫu nhiên, khó đoán; không ký hạn).

## Thứ tự đề xuất

1. ✅ Đã xong 10/11/2026: **10, 7, 8, 9**.
2. ✅ Đã xong 10/11/2026: **4**.
3. ✅ Đã xong 10/11/2026 tối: **3** (code), **11**. Chạy thật **3** khi Thuận tạo project Firebase và điền `FCM_SERVICE_ACCOUNT_FILE`.
4. **12** — đăng nhập Google cho mobile, sau khi có OAuth client Android.

## Đã có sẵn — mobile dùng được ngay (không cần làm)

- Đăng nhập, MFA, refresh token trả trong body (có xoay vòng), phân quyền theo role.
- `client_event_id` chống ghi trùng: `pick-item`, quét món khi đóng gói, `restock`, `adjust`, `transfer`.
- `expected_version` + 409 cho các thao tác ghi khác.
- Phân trang `before` + `limit`, lọc "việc của tôi" theo `assigned_staff_id`.
- Danh sách lấy hàng sắp theo đường đi trong kho; báo thiếu hàng; đơn Hỏa Tốc; thông báo in-app; dashboard; nhãn PDF.
