# OptiPackAI Backend — Integration Guide: Fulfillment & Warehouse (Package 3/4)

**🆕 Cập nhật 05/10/2026 tối (v7.2):** đơn bị hủy **trước khi bắt đầu đóng** (nhóm đang lấy hàng, đã lấy xong, hoặc kế hoạch mới tính/duyệt) → hàng đã lấy của đơn đó **tự trả về đúng ô** + thông báo `return_to_shelf` cho kho (Nghiệp vụ 1b, 3, 6); tháo kiện thu hồi được **vật tư chèn** (`recovered_materials`, vật tư phải bật `reusable`); giữ chỗ tồn kho khớp hàng thật khi loại món hỏng. Xem D.3, D.4.

**🆕 Cập nhật 05/10/2026 chiều (v7.1 — PHIÊN ĐÓNG GÓI):** đóng gói giờ theo **từng kiện**: quét từng món vào đúng kiện (sai kiện/thừa bị chặn), niêm phong + cân từng kiện (trừ thùng + vật tư lúc này), kiện lệch cân **bị giữ** chờ người KHÁC xem lại (không còn thành packed ngay), báo món hỏng/thiếu/sai lúc đóng, **tháo kiện** khi đơn bị hủy sau khi đã bắt đầu đóng (hàng về đúng ô, thùng tốt vào kho tái sử dụng, chặn giao tới khi tháo xong), cài đặt đóng gói có phiên bản (`/packing/settings`), tự giao người đóng (Packaging Staff), báo cáo hiệu suất (`/packing/reports/summary`). `POST .../packing-plan/pack` vẫn giữ làm **lối tắt**. Xem **Nghiệp vụ 1b** (mới), Nghiệp vụ 4, 6, D.3, D.4. **Lưu ý FE:** nhánh `thi_dev` đã khôi phục FE về bản `main`; màn đóng gói của `main` còn gọi `/packaging/*` + `fulfillment/pack` (đã gỡ) — bảng ánh xạ route cũ → mới ở `API_LIST.md` mục 8a.7.

**🔄 Cập nhật 05/10/2026 (v7.0 — GỘP `main` + `thi_dev`):** giữ kế hoạch đóng gói `packing_plans` (mục Nghiệp vụ 1) thay luồng `/packaging/*` cũ; `POST .../fulfillment/pack` đã gỡ — đóng gói qua `POST /order-groups/:groupId/packing-plan/pack`, sau khi commit tự báo "đã đóng gói" lên Lazada (`lazadaPackSync`, cầu dao `LAZADA_WRITE_APIS_ENABLED`, gửi lại `POST /order-groups/:id/lazada-pack/retry`). Kho vật tư **chung** `packaging_materials` (thùng + vật tư chèn, tồn mới/tái sử dụng). Lấy hàng theo kho K1–K5 của main (SKU nội bộ, ô, giữ chỗ tồn) cộng lượt lấy + chặn quét vượt số đặt; `decide-partial(false)` vào lại `picking` lượt mới và **tự nhập lại tồn đúng ô**. Giao hàng dùng `shipments` (G1) + chọn hãng/cước + giao chung chuyến (`POST /shipments/batch`); hoàn hàng dùng `/returns` (G3) — đã bỏ `return-receive`. Chi tiết route: `GUIDE_DOC/API_LIST.md`.

**🔄 Cập nhật 04/10/2026 (v6.0 — LÀM LẠI KẾ HOẠCH ĐÓNG GÓI):** gỡ toàn bộ `/order-groups/:groupId/packaging/*` (generate/approve/adjust/reject/guide/cartonization-preview) và `POST .../fulfillment/pack`; thay bằng **1 kế hoạch/nhóm** `packing_plans` ở `/order-groups/:groupId/packing-plan` — **tự tính khi lấy hàng xong** (không còn nút generate), bộ giải BRKGA + CP-SAT có **nhãn chứng minh tối ưu** (`optimal_global`/`optimal_in_model`/`heuristic`), **chỉnh tay** (đổi thùng 1 kiện, chuyển món giữa kiện) + tính lại có điều kiện thay cho "từ chối, tính lại", khoá lạc quan bằng `version` của kế hoạch, `pack` cân theo `parcel_no`. FE mới: `/app/packing` (hàng chờ) + `/app/packing/:groupId` (màn làm việc + chế độ đóng gói toàn màn hình). Xem Nghiệp vụ 1, 4 và sơ đồ C.1. Các đoạn bên dưới còn nhắc `generate`/`adjust`/`PKG_*` là lịch sử. **🆕 Cập nhật 30/09/2026 (v5.0 — ĐA KIỆN + engine đóng gói mới):** quyết định "mỗi đơn một kiện" được **thay bằng mỗi đơn N kiện** — đơn vừa 1 thùng vẫn 1 kiện (không đổi gì), đơn quá lớn/quá nặng/nhiều món được chia nhiều kiện; mỗi kiện có thùng, tọa độ 3D, cân ước tính, vật tư, hướng dẫn và **cân thật riêng**. Response phương án thêm `cartons[]` + `cartonCount` (field cấp phương án phản chiếu kiện 0 nên client cũ chạy nguyên); `adjust`, `guide`, `pack` nhận thêm `carton_index`; mỗi kiện giữ và trừ 1 thùng; `noFitReasons[]` có `code` + `itemKey`; engine `ep-3d-v2` bỏ trần 30 món/thùng (xem Nghiệp vụ 1, 4). **🆕 Cập nhật 30/09/2026 (rà business rule, Phase 1–3):** `pick-item` trừ tồn theo đúng phạm vi kho + sàn + shop + SKU; `POST .../fulfillment/pick` chỉ dùng khi nhóm đang `picking` (nhóm `partial_needs_review` phải đi qua `decide-partial`, không thể bỏ qua bước duyệt); `decide-partial {approve:false}` đưa nhóm về **`picking`** (lượt mới, `pick_round + 1`) thay vì `awaiting_packaging`; `packaging/adjust` **tăng version của nhóm** — FE phải tải lại nhóm rồi mới `approve` (nếu không sẽ 409), và 2 người cùng đổi thùng thì người sau bị 409; đơn mới chỉ được gộp vào nhóm còn ở `awaiting_packaging`/`picking` (từ `picked` trở đi tự lập nhóm mới), và chỉ gộp đơn cùng sàn + shop; khi hủy nhóm (N1) mọi phương án đóng gói active đều được nhả; khi một đơn bị hủy mà nhóm còn đơn khác và đã có phương án (`pending_approval`/`approved_for_packing`), phương án bị vô hiệu, nhóm quay về `picked` và bắn thông báo `packaging_plan_invalidated` cho Packaging Staff + Admin. **🆕 Cập nhật 29/09/2026 (Mục 9.5 + N1 — `AURELLE_MARKETPLACE_DESIGN.md`):** Order Group có thêm trạng thái tự động **`canceled`** (N1 — hệ thống TỰ hủy khi mọi đơn trong nhóm không còn fulfill được, KHÔNG cần người xác nhận riêng, chỉ áp dụng cho nhóm CHƯA `packed`); `GET /order-groups/:id` thêm `linkedGroupCount`, `GET /order-groups/:id/linked` (mới) trả danh sách nhóm khác — có thể khác sàn — cùng người nhận thật, chưa giao xong; `POST .../fulfillment/ship` thêm `linkedPending[]` (cảnh báo, không chặn); module `shipments/` mới (`POST /shipments/batch`) tạo vận đơn thật (mã chuyến + mã theo dõi) cho 1 hoặc nhiều group "giao chung chuyến" — xem Nghiệp vụ 7. **Cập nhật 28/09/2026 (vật tư chèn):** phương án đóng gói trả `materials[]` đầy đủ (mã/tên/đơn vị/khối lượng/giá) theo danh mục + bộ luật ở `/packaging/materials` (xem `API_LIST.md` mục 8e); `estimatedPackageWeightG` đã cộng vật tư; thiếu vật tư lúc `pack` **không chặn** đóng gói (ghi `materialsShortfall` + Notification `low_material_stock`). Số lượng vật tư là ước lượng theo luật, không tính từ hình học. **Cập nhật 2026-09-11 (v3 — mở rộng đầy đủ nghiệp vụ + thiết kế DB).** **Cập nhật 12/09/2026 — phân biệt API đang chạy với flow mục tiêu.** **Cập nhật 16/09/2026 (v3.1)**: sửa mô tả sai quy tắc tie-break auto-assign (Nghiệp vụ 2); thêm 2 loại Notification mới + hành vi đổi của `markAsRead` (Nghiệp vụ 6); thêm mã lỗi `ORD_GROUP_ALL_ORDERS_CANCELED` (D.3). **Cập nhật thêm 16/09/2026 (v3.2)**: bổ sung hẳn mục **Nghiệp vụ 2b — Thiết lập kho** (4 bước Admin tạo kho→khu→kệ→gán SKU, trước đây CHƯA từng có hướng dẫn dù file có chữ "Warehouse" trong tên) + 3 API GET mới để xem lại + sửa lỗi `GET .../zones` + 2 mã lỗi mới (`WH_WAREHOUSE_CODE_IN_USE`, `WH_ZONE_CODE_IN_USE` — map lỗi trùng mã từ 500 thô sang 409 rõ ràng, thêm 19/09/2026). **Cập nhật 19/09/2026 (v3.3)**: mở role Warehouse Staff cho `GET /warehouse/warehouses` (trước chỉ Admin, khiến Warehouse Staff không có cách biết `warehouse_id` để gọi picking-list/pick-item/report-missing); `pick-item` giờ validate SKU thuộc group TRƯỚC khi trừ tồn kho (trước đây quét nhầm SKU vẫn trừ tồn thật) — cả 2 phát hiện từ báo cáo thật Hải Phượng. **🆕 Cập nhật 23/09/2026 (v4.2 — gộp nhánh `main`)**: `reject` **bắt buộc** `rejection_reason` (3–500 ký tự) và tự thông báo Admin; `generate` tự thông báo Packaging Staff có kế hoạch chờ duyệt; `pack` mở thêm role Packaging Staff; response phương án có thêm `rejectionReason`. **🆕 Cập nhật 22/09/2026 (v3.8)**: engine đọc **tồn kho thùng** (chỉ chọn thùng còn trống, ghi thùng vừa hơn đã hết), multi-start 4 thứ tự xếp, `pack` trừ tồn + sổ xuất/nhập, cảnh báo sắp hết thùng; gỡ module `materials` (gộp vào `/packaging/boxes`). **🆕 Cập nhật 21/09/2026 lần 4 (v3.7)**: túi zip bọc từng món (danh mục `/packaging/bags`, hồ sơ SKU chọn túi + gập đôi, bước "cho vào túi" trong hướng dẫn) và hình 3D đại diện theo loại sản phẩm (`product_category`). **🆕 Cập nhật 21/09/2026 lần 3 (v3.6)**: hướng dẫn đóng gói từng bước cho animation 3D — engine quyết định vị trí/thứ tự, AI viết lời (Groq, bậc miễn phí), tự quay về câu mẫu khi thiếu cấu hình hoặc AI trả sai (`POST .../packaging/:recommendationId/guide`, field `packingGuide`). **🆕 Cập nhật 21/09/2026 lần 2 (v3.5)**: engine đóng gói 3D thật (greedy + validator, **mỗi đơn 1 kiện**, tọa độ xếp cho animation 3D), danh mục thùng `/packaging/boxes`, hồ sơ SKU `/product-master`, `pick-item`/`pick` đối soát số lượng theo lượt lấy, `pack` nhận cân thật từng kiện; FE có trang `/app/packing/groups` + animation — xem Nghiệp vụ 0, 1, 3, 4. **🔄 Cập nhật 21/09/2026 (v3.4)**: đồng bộ theo luồng **lấy hàng trước, đóng gói sau** (code AOFP-35 đã merge 20/09) — phân công diễn ra ngay lúc tạo group, `generate` chỉ gọi được khi group ở `picked`, `reject` quay về `picked` (không còn `awaiting_packaging`); sửa sơ đồ C.1/C.2 và thứ tự A.1. Phạm vi kiện mục tiêu vẫn là mỗi đơn một kiện (chưa triển khai). Đây là tài liệu tham chiếu ĐẦY ĐỦ NHẤT cho FE hiểu **concept hệ thống**, không chỉ danh sách endpoint. Đọc kèm `API_LIST.md` (bảng route/role) và `INTEGRATION_GUIDE_ORDERS.md` (nền tảng "gộp đơn").

**🆕 Cập nhật 30/09/2026 (v5.1):** thêm Nghiệp vụ 8 — vận chuyển thật (hãng/cước/ETA/lịch lấy hàng), chứng từ PDF, nhận hàng hoàn, tự nhập lại tồn khi hủy lượt lấy. `POST /shipments/batch` nay **bắt buộc** `carrier_code` + `service_code`.

**Cập nhật 2026-09-11 (v3 — mở rộng đầy đủ nghiệp vụ + thiết kế DB).** **Cập nhật 16/09/2026 (v3.1)**: sửa mô tả sai quy tắc tie-break auto-assign (Nghiệp vụ 2); thêm 2 loại Notification mới + hành vi đổi của `markAsRead` (Nghiệp vụ 6); thêm mã lỗi `ORD_GROUP_ALL_ORDERS_CANCELED` (D.3). **Cập nhật thêm 16/09/2026 (v3.2)**: bổ sung hẳn mục **Nghiệp vụ 2b — Thiết lập kho** (4 bước Admin tạo kho→khu→kệ→gán SKU, trước đây CHƯA từng có hướng dẫn dù file có chữ "Warehouse" trong tên) + 3 API GET mới để xem lại + sửa lỗi `GET .../zones` + 2 mã lỗi mới (`WH_WAREHOUSE_CODE_IN_USE`, `WH_ZONE_CODE_IN_USE` — map lỗi trùng mã từ 500 thô sang 409 rõ ràng, thêm 19/09/2026). **Cập nhật 19/09/2026 (v3.3)**: mở role Warehouse Staff cho `GET /warehouse/warehouses` (trước chỉ Admin, khiến Warehouse Staff không có cách biết `warehouse_id` để gọi picking-list/pick-item/report-missing); `pick-item` giờ validate SKU thuộc group TRƯỚC khi trừ tồn kho (trước đây quét nhầm SKU vẫn trừ tồn thật) — cả 2 phát hiện từ báo cáo thật Hải Phượng. **Cập nhật 20-21/09/2026 (v4.0 — ĐẢO LUỒNG CỐT LÕI)**: viết lại toàn bộ Nghiệp vụ 1/2/3/4 + sơ đồ PHẦN C theo đúng thứ tự MỚI (Lấy hàng làm TRƯỚC, Đóng gói làm SAU — trước đây ngược lại); thêm ghi chú `GET .../packaging` trả `null` không phải `404`. **Cập nhật 21-22/09/2026 (v4.1)**: hoàn tất toàn bộ phần FE báo còn thiếu ở v4.0 — `generate`/`approve`/`adjust` fallback an toàn khi thiếu `pick_events` (không còn 409 khi Warehouse xác nhận hàng loạt); `generate` + `reject` tự động notify (Packaging Staff / Admin); `reject` bắt buộc `rejection_reason`; `pack` mở thêm role Packaging Staff; group tạo NGAY sau sync (không chờ cron, trước đây tối đa 15 phút); sửa bug `recipient_role` lưu sai kiểu dữ liệu khiến thông báo broadcast-theo-role có thể không tới nơi. **Cập nhật 02/10/2026 (v4.3)**: nút `pack` tự báo "đã đóng gói" lên Lazada, chặn đóng gói nhóm hủy hết, thêm route gửi lại (Nghiệp vụ 4). **Cập nhật 01/10/2026 (v4.2)**: mở quyền vận hành kho cho Warehouse Staff (Nghiệp vụ 2b); response nhóm đơn thêm `activeOrderCount`/`canceledOrderCount` để phân biệt nhóm hủy một phần/hủy hết trên danh sách (Nghiệp vụ 3). Đây là tài liệu tham chiếu ĐẦY ĐỦ NHẤT cho FE hiểu **concept hệ thống**, không chỉ danh sách endpoint. Đọc kèm `API_LIST.md` (bảng route/role) và `INTEGRATION_GUIDE_ORDERS.md` (nền tảng "gộp đơn").

**Swagger UI**: `http://localhost:3000/api/docs`

---

# PHẦN A — TỔNG QUAN HỆ THỐNG

**Đợt này cập nhật docs và lát cắt BE-1.** Backend đã bỏ mặc định số đo/độ nhạy khi thiếu và chặn input packaging nếu hồ sơ SKU chưa ở trạng thái `ready`; các phần còn lại vẫn là giới hạn cần sửa. Phần B và bảng API mô tả route đang chạy. Flow mục tiêu ở A.4/C.2 và [roadmap BE-1 → BE-5](docs/BE_PACKAGING_IMPLEMENTATION_ROADMAP.md) chưa phải endpoint hoàn chỉnh đã triển khai.

## A.1. Bài toán hệ thống giải quyết

Sau khi đơn hàng từ Lazada được đồng bộ về và gộp thành **Order Group** (xem `INTEGRATION_GUIDE_ORDERS.md`), hệ thống phải trả lời 6 câu hỏi nghiệp vụ liên tiếp:

🔄 **ĐÃ ĐỔI (21/09/2026)** — thứ tự dưới đây là thứ tự chạy thật: lấy hàng trước, đóng gói sau.

1. **Ai lấy hàng** — nhân viên kho nào phụ trách? (Nghiệp vụ Staff Assignment — tự gán ngay lúc tạo group)
2. **Hàng ở đâu trong kho** — kệ nào, đi theo lộ trình nào? (Nghiệp vụ Warehouse)
3. **Lấy đủ chưa** — quét từng món, nếu thiếu thì sao? (Nghiệp vụ Picking)
4. **Đóng gói thế nào** — thùng cỡ nào, vật liệu gì, tính trên hàng ĐÃ lấy? (Nghiệp vụ Packaging)
5. **Đơn có gấp không** — cần ưu tiên xử lý trong bao lâu? (Nghiệp vụ Đơn Hỏa Tốc)
6. **Ai cần biết chuyện gì đang xảy ra** — báo cho đúng người, đúng lúc (Nghiệp vụ Notifications)

**Code hiện tại** xử lý fulfillment theo OrderGroup. **Mục tiêu mới:** mỗi đơn có phạm vi đóng riêng; group nhiều đơn chỉ hỗ trợ lấy hàng cùng lượt, không suy thành cùng kiện/vận đơn. Group legacy đang xử lý cần rà soát khi chuyển đổi, không tự tách hoặc sửa lịch sử hoàn tất.

## A.2. Actor (vai trò) và trách nhiệm thật trong hệ thống

| Actor | Trách nhiệm CHÍNH trong Fulfillment | Không làm gì |
|---|---|---|
| **Store Owner** | Xem đơn/group, lọc đơn Hỏa Tốc, đánh dấu ưu tiên, nhận cảnh báo (thiếu hàng, SLA, mất kết nối sàn) | KHÔNG trực tiếp thao tác lấy/đóng gói/ship |
| **Warehouse Staff** | Lấy hàng (quét/nhập tay), đóng gói, phát hiện+báo thiếu hàng, tự nhận/đổi việc | KHÔNG duyệt gợi ý AI, KHÔNG quyết định tiếp tục khi thiếu hàng |
| **Packaging Staff** | Duyệt/điều chỉnh/từ chối gợi ý đóng gói, quyết định đơn thiếu hàng có tiếp tục không | KHÔNG trực tiếp lấy/đóng gói hàng |
| **Shipping Coordinator** | Xác nhận đã ship, đã giao, ghi nhận hoàn hàng | KHÔNG tham gia khâu lấy/đóng gói |
| **Admin** | Toàn quyền mọi thao tác trên — dùng để test/vận hành khẩn cấp | — |

## A.3. Nguyên tắc mục tiêu — thay đổi ngày 12/09/2026

- Kho/Admin xác nhận đã đo/thử khi nhập hồ sơ SKU; không cần Admin duyệt riêng. Dữ liệu sàn chỉ là nguồn khai báo, không ghi đè hồ sơ kho đã xác nhận.
- Đơn đủ dữ liệu được tự tính phương án; chỉ candidate qua validator mới tự thông qua. Packaging Staff/Admin xử lý ngoại lệ, không duyệt tay mọi đơn.
- Giữ ID từng item, chỉ xử lý trạng thái nguồn đã xác minh; thiếu dữ liệu không mặc định 20 cm/0,5 kg hay không dễ vỡ.
- Chọn kế hoạch, cấp vật tư và xác nhận đóng xong là ba thao tác riêng. Chọn không trừ tồn; cấp phát theo attempt/ledger nguyên tử; cân kiện thật sau đóng.
- Không tự quyết giao thiếu; thiếu hàng phải xác định unit/số lượng, dừng và xử lý lại. Bản đầu chờ bổ sung hoặc hủy/xử lý lại, chưa hỗ trợ giao thiếu tự động.
- Tự động hóa chỉ bật sau BE-1 đến BE-4. Fulfillment vẫn mô phỏng nội bộ, không gọi Pack/ReadyToShip thật lên Lazada.

## A.4. Quyền mục tiêu và chuyển đổi API

Ma trận A.2 và route ở phần B vẫn là quyền/code hiện tại. Mục tiêu cho kho/Admin quản lý hồ sơ/quy cách và xác nhận dữ liệu; Packaging Staff/Admin xử lý phương án ngoại lệ; Warehouse Staff lấy/đóng và ghi cân/đo thật; hệ thống xử lý luồng thường. Không giả mạo approved_by cho quyết định tự động; ghi nguồn system/human.

| Trước đây | Trạng thái 04/10/2026 |
| --- | --- |
| Admin gọi generate | ✅ Đã thay — job nền tự tính khi nhóm `picked` (quét 10 s), lỗi dữ liệu → kế hoạch `failed` kèm lý do |
| Approve/adjust bắt nhập cân thật dù chưa đóng | ✅ Duyệt/chỉnh tay không cân; cân thật từng kiện ở `packing-plan/pack`, so với hàng + bì + vật tư |
| Generate tính cả group thành một thùng | ✅ Mỗi đơn giải riêng, N kiện/đơn, mọi kiện qua validator |
| Input SKU gộp, cm/kg | ✅ Bộ giải nở từng đơn vị (`itemKey`), lõi mm/g; HTTP camelCase |
| Chỉ trả boxSize/materialType | ✅ Trả thùng + `placements` (toạ độ 3D) + vật tư + nhãn chứng minh; ⏳ chưa có nhánh túi mailer |
| Pick có thể bấm ngay không đối soát | ✅ `pick` đối soát đủ số lượng theo lượt; `pick-item` chặn quét dư, transaction trừ tồn + event |
| Decide-partial boolean → picked | ⏳ Một phần — `false` mở lượt lấy mới + nhập lại tồn; `true` tính kế hoạch trên số đã quét (chưa đối soát giao thiếu với khách) |
| Pack chỉ nhận expected_version | ✅ Cân thật từng kiện + cảnh báo bất thường + trừ thùng/vật tư trong 1 transaction |

Danh mục thùng (`/packaging/boxes`) và hồ sơ SKU (`/product-master`) có từ 21/09. Thiếu hồ sơ SKU báo qua kế hoạch `failed` (`failureReason`). Phương án cũ (`packaging_recommendations`) không tự hợp thức hoá — chạy script migrate hoặc tính lại.

---

# PHẦN B — TOÀN BỘ NGHIỆP VỤ, CHI TIẾT TỪNG TÌNH HUỐNG

> 🔄 **ĐÃ ĐỔI (21/09/2026) — thứ tự chạy thật:** Nghiệp vụ 2 (Phân công) → 3 (Lấy hàng) → **1 (Đóng gói)**. Số thứ tự nghiệp vụ giữ nguyên để không vỡ tham chiếu cũ.

## 🆕 Nghiệp vụ 0 — Chuẩn bị dữ liệu đóng gói (làm 1 lần, trước khi dùng engine) — 21/09/2026

Bộ giải chỉ tính được khi có **số đo thật**. Thiếu → kế hoạch của nhóm chuyển `failed` với `failureReason` nêu SKU chưa có hồ sơ (🔄 04/10; trước đây `generate` trả 422 `ORD_GROUP_PACKAGING_PROFILE_NOT_READY`). Không đoán số đo.

1. **Danh mục thùng** (Admin): `POST /packaging/boxes` — lòng thùng/ngoài thùng (mm), bì (g), tải (g), giá. Có sẵn 3 thùng mẫu `SAMPLE-S/M/L` (`isSample: true`, số giả lập) sau khi chạy `npx ts-node scripts/seed-packaging-boxes.ts`; nhập số thật qua API hoặc CSV. 🆕 (22/09/2026) **Tồn kho thùng**: mỗi thùng có `quantityOnHand` (thực có), `reserved` (phương án chưa đóng đang giữ chỗ), `available` (còn trống). Nhập thùng qua `POST /packaging/boxes/:id/stock-in` `{ quantity, note? }` (Admin/Warehouse), xem sổ qua `GET /packaging/boxes/:id/movements`. Thùng mới tạo có tồn 0 — **phải nhập tồn thì engine mới chọn được**. Seed mẫu nhập sẵn 50 thùng mỗi loại.
2. **Hồ sơ SKU** (Warehouse Staff/Admin): `GET /product-master?status=needs_measurement` → đo từng SKU **sau khi gấp/bọc** (giày đo nguyên hộp) → `PUT /product-master/:id/packaging-profile` với `length_cm`, `width_cm`, `height_cm`, `weight_kg`, `is_fragile`, `orientation_rule` (`any` / `upright_only`), `max_stack_load_kg` (bỏ trống = không cho đặt gì lên). Hồ sơ chuyển `ready`; đồng bộ Lazada không ghi đè. 🆕 (21/09/2026 lần 3) Body thêm `product_category` (**bắt buộc**), `zip_bag_code?`, `zip_bag_folded?`. **Túi zip**: quần áo thường được cho vào túi zip (có thể gập đôi túi) rồi mới xếp vào thùng — khi đó kho đo **gói đã đóng túi**, engine xếp đúng khối đó. 🆕 (22/09/2026) **Quần áo luôn nằm phẳng** (engine chỉ xoay ngang, không dựng đứng), kể cả hồ sơ cũ để `orientation_rule: any`. Body thêm `can_fold_in_half?` cho hàng mềm (trong túi zip hoặc không có hộp cứng): engine tự tính số đo gập (cạnh dài ÷ 2, độ dày × 2) và **chỉ gập khi nhờ đó dùng được thùng nhỏ hơn**; bật cho giày → 422 `PM_FOLD_NOT_ALLOWED`. Danh mục túi ở `/packaging/bags` (Admin quản lý cùng trang `/app/admin/boxes`).

> Lấy hàng (Nghiệp vụ 3) **không** cần hồ sơ đóng gói — chỉ bước tính phương án mới cần. 🔄 21/09: `picking-list` (cả 2 bản) trả `quantity`, `picked_quantity`, `packaging_profile_ready` và số đo `null` khi SKU chưa đo, không còn 422.
>
> **Màn FE**: Admin quản lý thùng ở `/app/admin/boxes`; kho đo SKU ở `/app/inventory/packaging-profiles` (tab "Cần đo" / "Đã xác nhận", số Lazada khai chỉ hiện để tham khảo).

## Nghiệp vụ 1 — Kế hoạch đóng gói: tự tính, duyệt, chỉnh tay (UC-04) — 🔄 LÀM LẠI 04/10/2026

> 🔄 **ĐÃ THAY ĐỔI 04/10/2026 — đọc kỹ nếu đã quen bản cũ.** Bản cũ (1 phương án/đơn ở `packaging_recommendations`, Admin bấm `generate`, Packaging Staff `approve`/`adjust`/`reject`, đóng gói qua `fulfillment/pack`) **đã gỡ toàn bộ**. Giờ mỗi nhóm có **đúng 1 kế hoạch** (`packing_plans`) chứa mọi đơn và mọi kiện; kế hoạch **tự tính** khi lấy hàng xong; sai thì **chỉnh tay** chứ không "từ chối rồi tính lại". Route mới ở `API_LIST.md` mục 8.

### Bối cảnh xảy ra
Lấy hàng xong (group `picked`, Nghiệp vụ 3) thì hệ thống biết chính xác từng đơn có những món gì. Việc còn lại: quyết định **dùng thùng nào, bao nhiêu kiện, món nào đặt ở đâu, theo thứ tự nào**, sao cho ít kiện nhất và rẻ nhất, rồi để người duyệt kiểm tra trước khi đóng thật.

### Ai làm gì
```
[HỆ THỐNG — job nền mỗi 10 giây]
  nhóm `picked` chưa có kế hoạch → tính kế hoạch (status `computing` → `ready`)
  → nhóm `pending_approval` + thông báo Packaging Staff (`pending_approval`)
  → (nền) CP-SAT kiểm tra thêm đơn ≤ 12 món, có thể nâng nhãn chứng minh

[PACKAGING STAFF / ADMIN] — màn /app/packing/:groupId
  GET  .../packing-plan                     xem mọi kiện + 3D + "Vì sao phương án này?"
  POST .../packing-plan/approve             chốt → kế hoạch `approved`, nhóm `approved_for_packing`
  POST .../parcels/:no/change-box           đổi thùng 1 kiện (xếp lại + validator)
  POST .../parcels/:no/move-item            chuyển 1 món sang kiện khác cùng đơn / tách kiện mới
  POST .../packing-plan/recompute           tính lại có điều kiện (loại thùng, ưu tiên rẻ)
  POST .../packing-plan/reject              từ chối: lý do theo mã, có người xử lý + hạn
  POST .../packing-plan/manual              đóng gói thủ công sau khi từ chối (người khác duyệt)
```

### Thuật toán — nói đúng khi trình bày
- Hàng đã quét được **chia về từng đơn** (đơn tạo trước ưu tiên, không vượt số đặt). Mỗi đơn được giải riêng; một đơn có thể ra **N kiện**.
- Mỗi đơn vị hàng là 1 khối riêng (`itemKey = sku#n`), số đo mm/g lấy từ hồ sơ SKU đã xác nhận (Nghiệp vụ 0). Hàng dễ vỡ được chừa đệm 5 mm mỗi phía; quần áo luôn nằm phẳng; hàng mềm chỉ gập đôi khi dạng gốc không còn chỗ.
- **Bộ giải BRKGA** (thuật toán di truyền khóa ngẫu nhiên, Gonçalves & Resende 2013) chạy trên TypeScript, xếp bằng không gian trống cực đại (EMS); đơn ≤ 3 món thì vét cạn. Ngân sách đếm theo số lần thử, **không theo đồng hồ** → cùng đầu vào luôn ra cùng kết quả.
- Mục tiêu so theo thứ tự: **số kiện → chi phí thùng + vật tư → cân quy đổi → số món phải gập → ổn định**.
- Mọi kết quả phải qua **validator độc lập** (đủ mỗi món 1 lần, trong lòng thùng, không chồng lấn, đỡ đáy đủ, không vượt tải chồng/tải thùng, không vượt tồn thùng) trước khi lưu.
- **Nhãn chứng minh** từng đơn (`orders[].proof`), không nói "tối ưu" chung chung:
  - `optimal_global` — số kiện bằng cận dưới và mọi tổ hợp thùng rẻ hơn đều bị loại bằng điều kiện cần (thể tích, cân, kích thước, diện tích đáy). Đúng với **mọi** cách xếp.
  - `optimal_in_model` — service CP-SAT (Google OR-Tools, `packer/`) chứng minh mọi tổ hợp tốt hơn **không xếp được** theo luật chồng hàng **chặt hơn** thực tế (vd chỉ cho tối đa 2 vật đỡ). Không phải tối ưu tuyệt đối.
  - `heuristic` — phương án tốt nhất tìm được, chưa chứng minh; xem `lowerBoundParcels` để biết còn cách cận dưới bao xa.
- `orders[].explanation[]` ghi lời giải thích từng tổ hợp thùng ("SAMPLE-S: không thể — món JEAN#1 không vừa…") để trả lời câu "vì sao không dùng thùng nhỏ hơn". `cpSatPending: true` = CP-SAT còn đang chạy (FE nên thăm dò lại vài giây).
- Đây là **tối ưu tổ hợp có chứng minh**, không phải học máy. Hướng dẫn bằng chữ (Groq) chỉ **viết lời** từ toạ độ bộ giải đã tính.

### `approve` — chốt kế hoạch
Body `{ "expected_version": 3 }`. Kế hoạch `ready → approved`, nhóm `pending_approval → approved_for_packing`. Còn đơn chưa xếp hết món (`orders[].status !== 'ok'`) → 409 `PACKING_HAS_UNPLACED` — chuyển món/đổi thùng/tính lại trước.

### Chỉnh tay — thay cho "từ chối, tính lại"
- **Đổi thùng 1 kiện** `POST .../parcels/:parcelNo/change-box` `{ expected_version, box_code, reason, note? }`: xếp lại đúng các món của kiện đó vào thùng mới; không vừa → 422 `PACKING_BOX_DOES_NOT_FIT` (kèm `details.violations`); thùng không còn trống → 409 `PKG_BOX_OUT_OF_STOCK`. Kế hoạch giữ nguyên các kiện khác.
- **Chuyển món** `POST .../parcels/:parcelNo/move-item` `{ expected_version, item_key, to_parcel_no?, reason, note? }`: sang kiện khác **cùng đơn**, hoặc bỏ trống `to_parcel_no` để tách kiện mới (hệ thống chọn thùng). Cả 2 kiện bị ảnh hưởng xếp lại và qua validator. Sang kiện của đơn khác → 400 `PACKING_MOVE_ACROSS_ORDERS` (một đơn nguồn là một phạm vi đóng).
- `reason` (🔄 mở rộng 08/10/2026): `PRODUCT_MORE_FRAGILE_THAN_EXPECTED`, `RECOMMENDED_BOX_NOT_IN_STOCK`, `ITEM_DIMENSION_WRONG`, `ITEM_WEIGHT_WRONG`, `BOX_TOO_TIGHT`, `BOX_TOO_LOOSE`, `BOX_SPEC_WRONG`, `TOO_MANY_PARCELS`, `ITEM_DAMAGED`, `OTHER` (bắt buộc `note`, thiếu → 400 `PACKING_NOTE_REQUIRED`). Lý do là dữ liệu để Admin cải thiện gợi ý — xem "Vòng phản hồi" bên dưới. Mỗi lần chỉnh ghi 1 dòng `adjustments[]` (ai, lúc nào, vì sao) và **tăng `version`** — FE dùng `plan` trả về cho thao tác kế tiếp.
- **Tính lại có điều kiện** `POST .../packing-plan/recompute` `{ expected_version, exclude_box_codes?, prefer? }`: dùng khi thực tế khác dữ liệu (thùng hỏng → loại thùng; muốn rẻ hơn → `prefer: "cheapest"`, chế độ này không chạy chứng minh). Kế hoạch cũ chuyển `superseded`, tính mới ngay (đồng bộ, vài trăm ms tới vài giây).
- **`reject`** (🔄 ĐÃ ĐỔI 08/10/2026) `{ expected_version, reason, note?, owner_id? }`: `reason` là **mã** (không còn chữ tự do). Kế hoạch `rejected` vẫn giữ để job không tự tính lại; nhóm về `picked`. Có **hạn xử lý 2 giờ làm việc** (`rejection.dueAt`); quá hạn hệ thống nhắc 1 lần (Admin, Store Owner, người được giao). Thông báo `packaging_rejected` gửi Admin + Store Owner, hoặc đích danh `owner_id`. **Từ chối không còn là ngõ cụt** — phải kết thúc bằng một trong 3 cách:
  1. **Sửa dữ liệu rồi tính lại** `POST .../recompute` (ghi `rejection.resolution = 'recompute'`).
  2. **Đóng gói thủ công** `POST .../packing-plan/manual` `{ expected_version, parcels: [{ order_id, box_code, item_keys[] }], note }`: người xử lý nhập kiện thật (thùng nhân viên thực tế dùng + các món trong từng kiện). Hệ thống kiểm: mỗi món đúng 1 kiện, thùng còn tồn, không quá tải thùng (không kiểm hình học). Cố gắng xếp 3D vào thùng đó; không xếp được thì kiện `manualLayout: true` (không có tọa độ thật). Tạo kế hoạch mới `source: 'manual'` ở `ready` → người **khác** duyệt (hai cặp mắt) → quét, niêm phong, trừ thùng/vật tư, cân, báo sàn như luồng thường.
  3. **Trả về lấy hàng** khi hàng hỏng: `POST .../packing-plan/report-issue` (đã có).

### 🆕 Đổi thùng khác có tốn vật liệu không? (08/10/2026)
| Thời điểm | Đổi thùng | Tốn gì |
| --------- | --------- | ------ |
| Chưa duyệt (`ready`) | `POST .../parcels/:no/change-box` | **Không tốn gì** — chỉ giữ chỗ mềm, chưa trừ tồn |
| Đang đóng, kiện chưa niêm phong (`approved`/`packing`) | `POST .../parcels/:no/change-box-in-session` + `old_box_outcome` | `unused`: không tốn (thùng cũ về kệ). `damaged`: trừ 1 thùng cũ khỏi tồn, ghi sổ `waste` + chi phí hao hụt |
| Đã niêm phong | Hoàn tác niêm phong trước (`POST .../parcels/:no/unseal`), rồi đổi thùng | Thùng đã trừ tồn lúc niêm phong: `reusable` dùng lại không tốn; `damaged` coi như mất (đã trừ), niêm phong lại trừ cái mới |
Thùng chỉ bị trừ **lúc niêm phong**, theo thùng ghi trên kiện — nên đổi thùng trước khi niêm phong thì hệ thống trừ đúng thùng thật. Hệ thống xếp lại các món vào thùng mới qua validator và **giữ nguyên các lần quét đã có**. Thùng mới không xếp vừa → 422; hết tồn → 409. Hao hụt hiện trong `GET /packing/reports/feedback` (`waste`).

### 🆕 Hoàn tác xác nhận đóng gói (08/10/2026)
`POST .../packing-plan/parcels/:parcelNo/unseal` `{ expected_version, reason, note?, box_condition, rescan? }` — mở lại 1 kiện đã niêm phong (hoặc đang bị giữ vì lệch cân) để đóng lại.
| Tình huống | Ai làm được | Kết quả |
| ---------- | ----------- | ------- |
| Kế hoạch còn `packing` (các kiện khác chưa xong) | Packaging, Warehouse, Store Owner, Admin | Kiện về `pending`; có thể quét lại / đổi thùng / niêm phong lại |
| Nhóm đã `packed`, chưa giao | **Chỉ Admin / Store Owner** | Kế hoạch `packed → packing`, nhóm `packed → approved_for_packing`; đóng lại kiện đó thì tự `packed` lần nữa |
| Đã giao (`shipped` trở đi) | Không ai | 409 — dùng luồng hoàn hàng |
`box_condition`: `reusable` (thùng còn tốt, niêm phong lại **không trừ tồn lần 2**) hoặc `damaged` (thùng + vật tư lần trước coi như mất vì đã trừ lúc niêm phong; niêm phong lại sẽ trừ cái mới; ghi hao hụt vào báo cáo feedback). `rescan: true` = xóa các lần quét, quét lại từ đầu. Mỗi lần ghi 1 dòng `adjustments[]` (`kind: "unseal"`) + `activity[]`, và tính vào `GET /packing/reports/feedback`.
**Lazada:** API Pack của Lazada không có hoàn tác. Nếu nhóm đã báo "Đã đóng gói" lên Lazada, response có `warnings[]`; trạng thái trên sàn giữ nguyên, niêm phong lại không báo lại (món đã `packed` bị bỏ qua). Hiển thị cảnh báo này cho người bấm.

### 🆕 Vòng phản hồi — nhân viên làm khác gợi ý thì Admin cải thiện gì (08/10/2026)
Gợi ý chỉ là gợi ý: nhân viên có thể đổi thùng, chuyển món, từ chối. Mỗi lần làm khác đều có **mã lý do** + SKU + thùng bị chạm. `GET /packing/reports/feedback?from&to&min_count` (Store Owner, Admin) gom theo lý do × SKU × thùng và sinh **đề xuất**, ví dụ:
| Lặp lại | Admin làm gì |
| ------- | ------------ |
| `ITEM_DIMENSION_WRONG`, `BOX_TOO_TIGHT/LOOSE` trên 1 SKU | Đo lại hồ sơ SKU (`PUT /product-master/:id/packaging-profile`) |
| `ITEM_WEIGHT_WRONG`, lệch cân vì `PRODUCT_WEIGHT_WRONG` | Sửa cân nặng SKU |
| `PRODUCT_MORE_FRAGILE_THAN_EXPECTED`, `ITEM_DAMAGED` | Bật dễ vỡ / giảm tải chồng của SKU, hoặc tăng đệm trong `/packing/settings` |
| `RECOMMENDED_BOX_NOT_IN_STOCK` trên 1 thùng | Nhập thùng, tăng `reorder_level` |
| `BOX_SPEC_WRONG` | Sửa số đo thùng trong danh mục |
| `TOO_MANY_PARCELS`, `SPECIAL_PACKING_NEEDED`, `PLAN_UNREALISTIC` | Xem cài đặt đóng gói, thêm cỡ thùng |
Hệ thống **chỉ đề xuất**, Admin tự quyết. "AI" tốt lên nhờ dữ liệu đầu vào và tham số đúng hơn — không tự học máy; dùng `followedRate` (tỷ lệ kế hoạch được làm đúng gợi ý) so trước/sau mỗi lần sửa để chứng minh.

**Tác động (08/10/2026):** (1) Dữ liệu cũ: không migration; kế hoạch cũ `source = solver`, `rejection_reason` chữ tự do đọc bình thường (`rejection.reasonCode = null`). (2) Đổi hành vi: `reject` đổi `reason` từ chữ tự do sang **mã** (FE phải gửi mã + `note`), thông báo từ chối giờ gửi cả Store Owner; `recompute` từ kế hoạch `rejected` ghi `resolution`. (3) Xung đột: `manual` thay kế hoạch `rejected` bằng kế hoạch mới trong 1 transaction, khóa `version`. (4) Không ảnh hưởng: tính kế hoạch, quét/niêm phong, giữ chỗ thùng (kế hoạch `rejected` không giữ chỗ). (5) Giới hạn: kiện `manualLayout` không dựng được 3D/hướng dẫn từng bước; báo cáo feedback tính trực tiếp (tối đa 5.000 kế hoạch).

**Tác động bước 2 (đổi thùng lúc đóng, 08/10/2026):** (1) Dữ liệu cũ: không migration; `adjustments[]` cũ không có `oldBoxOutcome` (null), sổ vật tư thêm loại `waste`. (2) Route mới, route cũ không đổi. (3) Xung đột: trừ hao hụt + cập nhật kế hoạch cùng transaction, khóa `version` của kế hoạch; kiện đã niêm phong/đã trừ thùng bị chặn nên không trừ trùng. (4) Không ảnh hưởng: niêm phong, trừ thùng, giữ chỗ thùng (kiện đổi sang thùng mới thì giữ chỗ chuyển theo). (5) Giới hạn: tồn thùng cũ không đủ để trừ hết hao hụt thì chỉ trừ phần có (ghi chú trong sổ); đổi thùng kiện đã niêm phong phải hoàn tác niêm phong trước.

**Tác động bước 3 (hoàn tác niêm phong, 08/10/2026):** (1) Dữ liệu cũ: không migration; thêm loại `adjustments.kind = unseal` và `activity.kind = unseal`; bảng chuyển trạng thái nhóm thêm cạnh `packed → approved_for_packing` (các cạnh cũ không đổi). (2) Route mới, route cũ không đổi. (3) Xung đột: cập nhật kế hoạch + chuyển trạng thái nhóm cùng transaction, khóa `version`; `reusable` giữ `box_consumed` nên không trừ trùng; giữ chỗ thùng chỉ tính kiện chưa trừ nên `damaged` (box_consumed=false) giữ chỗ lại đúng. (4) Không ảnh hưởng: giao hàng (nhóm phải `packed` mới bắt đầu giao; về `approved_for_packing` thì chưa giao được cho tới khi đóng lại), tháo kiện do đơn hủy, quét/niêm phong thường. (5) Giới hạn: Lazada không hoàn tác Pack; vật tư chèn của lần niêm phong trước KHÔNG tự thu hồi khi `damaged` (coi mất) — muốn thu hồi dùng luồng tháo kiện.

### 🆕 Gợi ý kho thùng, chia đều kiện, đơn lớn (04/10/2026)
- **Gợi ý kho thùng** (`orders[].stockSuggestion`): khi kho hết thùng vừa hơn nên đơn phải dùng thùng to/nhiều kiện, lúc tính hệ thống giải thêm 1 lần "giả định kho đủ thùng". Nếu cách đó tốt hơn (theo đúng thứ tự mục tiêu), kế hoạch ghi thùng nào thiếu (`needed` vs `available` — `available` đã trừ thùng nhóm khác đang giữ chỗ), số kiện và lấp đầy TB trước/sau, tiền chênh (`savingVnd`). Kèm 1 dòng trong `explanation`. Màn `/app/packing/:groupId` hiện thẻ "Gợi ý kho thùng" (Admin có link tới danh mục thùng). Nhãn chứng minh vẫn đúng: phương án là tối ưu **với thùng đang có**; gợi ý cho biết nhập thêm thùng thì tốt hơn bao nhiêu. Nhập thùng xong bấm "Tính lại…" để dùng.
- **Chia đều kiện** (bộ giải `brkga-ems-v2`): sau khi chọn số kiện/thùng, bộ giải thử xếp lại cặp kiện lệch tải nhất với **đúng các thùng đó** — không bao giờ thêm kiện, đổi sang thùng đắt hơn hay gập thêm món chỉ để chia đều. Hiệu quả vừa phải: trên 300 đơn mẫu, chênh cân TB giữa kiện nặng nhất và nhẹ nhất giảm 1,40 → 1,30 kg.
- **Đơn lớn hơn giới hạn CP-SAT (12 món)** mà chưa chứng minh được: `explanation` ghi rõ cận dưới chỉ tính theo thể tích/cân/diện tích đáy nên có thể thấp hơn mức xếp được thật. Chứng minh số kiện tối thiểu cho đơn lớn (gập + xoay) chưa làm được bằng cận dưới thông thường — đã thử cận Fekete–Schepers, không đủ mạnh.
- `totals.avgFill` (header màn làm việc: "lấp đầy x%"). Ví dụ đơn sỉ 40 áo + 12 quần: chỉ có thùng L → 5 kiện, 63%; thêm thùng `SAMPLE-LT` 50×40×20 → 3 L + 2 L thấp, 76%, rẻ hơn 4.000 đ.

### Khi nào kế hoạch bị thay
- Một đơn trong nhóm bị hủy sau khi đã có kế hoạch → kế hoạch `superseded`, nhóm về `picked`, thông báo `packaging_plan_invalidated` (Packaging Staff + Admin) → job tự tính lại cho phần còn lại.
- Cả nhóm bị hủy (N1, Nghiệp vụ 7) → kế hoạch `superseded`, nhả giữ chỗ thùng.
- Lỗi dữ liệu lúc tính (vd hồ sơ SKU chưa `ready`) → kế hoạch `failed` + `failureReason`, **không tự tính lặp**; kho sửa dữ liệu rồi bấm "Tính lại".

### Hướng dẫn đóng gói từng bước — `POST .../parcels/:parcelNo/guide`
**Chia việc**: bộ giải quyết định hình học (thùng, vị trí, hướng, thứ tự `placements[].step`); hệ thống đổi toạ độ thành dữ kiện dễ hiểu ("góc trái – phía trước", "đặt lên trên GIAY#1"); **Groq** chỉ viết lại thành câu tiếng Việt. Server kiểm lời AI (đủ bước, đúng thứ tự, đúng SKU từng bước); sai/lỗi mạng/chưa cấu hình → **câu mẫu** (`source: "template"`). Mô hình không thấy thông tin khách hàng.

Role: Packaging, Warehouse, Admin; 10 lần/phút. Body `{ "regenerate": false }`; đã có thì trả bản đã lưu. Không cần `expected_version`, không đổi `version`. Response = `{ plan }`, hướng dẫn ở `parcels[i].guide`:
```json
{
  "source": "ai",
  "model": "groq/openai/gpt-oss-120b",
  "fallbackReason": null,
  "summary": "Dùng thùng M (SAMPLE-M) cho 3 món ...",
  "steps": [
    { "step": 1, "instruction": "Đặt hộp GIAY-42 nằm ngang sát đáy, góc trái – phía trước.", "tip": "Không đặt món nào đè lên hộp này." }
  ],
  "generatedAt": "2026-10-04T10:00:00.000Z"
}
```
`fallbackReason`: `null` | `no_api_key` | `ai_error` | `ai_invalid_output`. Đổi thùng/chuyển món làm hướng dẫn của kiện đó về `null` — FE gọi lại. Đơn chưa xếp được → 409 `PACKING_GUIDE_NOT_AVAILABLE`.

### Màn FE (04/10/2026)
- `/app/packing` — **hàng chờ đóng gói** 4 cột (Đang tính / Chờ duyệt / Chờ đóng / Đã đóng) + dải "Cần xử lý" (kế hoạch lỗi hoặc đã chuyển xử lý tay); dữ liệu từ `GET /order-groups` + `GET /packing-plans/summary`, tự làm mới 10 s.
- `/app/packing/:groupId` — **một màn làm việc**: trái danh sách kiện theo đơn, giữa khung 3D (thùng carton mở nắp, vách phía camera tự mờ, X-ray, tách lớp, lọc lớp theo độ cao, công tắc mô hình sản phẩm, chế độ Đẹp/Nhẹ), phải thao tác theo trạng thái. Đang tính → thăm dò 3 s. Link cũ `/app/packing/groups/:id(/orders/:x)` tự chuyển hướng.
- **Chế độ đóng gói toàn màn hình** (khi kế hoạch `approved`): mỗi kiện = chuẩn bị (thùng, hàng, vật tư, tóm tắt hướng dẫn) → từng món (3D món rơi vào + câu chữ to) → cân kiện → cuối cùng xác nhận cả nhóm (gọi `pack`). Phím ←/→, Esc.

### DB liên quan — `packing_plans` (1 bản hoạt động / nhóm)

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `order_group_id`, `is_active` | ObjectId, Boolean | Unique có điều kiện: mỗi nhóm đúng 1 kế hoạch `is_active: true` — đồng thời là khoá chống 2 job cùng tính |
| `revision` | Number | Lần tính thứ mấy của nhóm (tăng mỗi lần `recompute`/tính lại) |
| `version` | Number | Khoá lạc quan cho mọi thao tác ghi (khác `__v` của nhóm) |
| `status` | String | `computing` / `ready` / `approved` / 🆕 `packing` (05/10 — đang đóng) / `packed` / `rejected` / `failed` / `superseded` |
| `failure_reason` | String\|null | Lý do khi `failed` |
| `orders[]` | sub-doc | Mỗi đơn: `order_id`, `platform_order_id`, `status` (`ok`/`partial`/`no_fit`), `unplaced[]` `{item_key, code, reason}`, `proof`, `lower_bound_parcels`, `explanation[]`, `strategy`, `cp_sat` |
| `parcels[]` | sub-doc | Mỗi kiện: `parcel_no` (1..N trong cả nhóm), `order_id`, `box` (chụp `code`, `name`, `inner_mm`, `outer_mm`, `tare_g`, `max_load_g`, `price_vnd` lúc tính), `placements[]`, `fill_ratio`, `items_weight_g`, `estimated_weight_g` (hàng + bì + vật tư), `volumetric_weight_g`, `materials[]`, `materials_weight_g`, `materials_cost_vnd`, `shipping_cost_vnd` (ghi khi tạo vận đơn), `guide`, `actual_weight_kg`, `is_abnormal`, `materials_shortfall[]` |
| `item_profiles[]` | sub-doc | Loại hàng + túi zip theo SKU (cho 3D và lời hướng dẫn) |
| `adjustments[]` | sub-doc | Lịch sử chỉnh tay: `kind`, `detail`, `reason`, `note`, `by`, `at` |
| `solver` | sub-doc | `engine_version`, `computation_ms`, `options` (`exclude_box_codes`, `prefer`) |
| `approved_by/at`, `rejected_by/at`, `rejection_reason`, `packed_by/at` | | Audit |

`packaging_recommendations` (bản cũ) giữ nguyên làm lịch sử, không còn API. Nhóm đang `pending_approval`/`approved_for_packing` mà chỉ có phương án cũ: chạy `scripts/migrate-to-packing-plans.ts` (mặc định chỉ in kết quả; `--apply` mới ghi; nhãn luôn `heuristic`).

🆕 **Trường thêm 05/10/2026** (tất cả có mặc định, bản ghi cũ đọc bình thường, không cần migration): `orders[].over_parcel_limit`, `orders[].status` thêm `canceled`; mỗi `parcels[]` thêm `status` (`pending`/`sealed`/`held`/`to_unpack`/`voided`), `has_fragile`, `scans[]`, `box_consumed`, `sealed_by/at`, `weighings[]`, `reviews[]`, `unpack`; cấp kế hoạch thêm `approve_override_reason`, `assigned_packer_id/at`, `packing_started_by/at`, `pack_mode`, `issues[]`, `activity[]`, `solver.options.fragile_cushion_mm`. Kế hoạch `packed` cũ không có `parcels[].status` → API trả `sealed`. Index mới `{status, packed_at}` (báo cáo) và `{assigned_packer_id, is_active, status}` (giao việc).

---

## 🆕 Nghiệp vụ 1b — Phiên đóng gói: quét, niêm phong, kiện lệch cân, sự cố, tháo kiện (05/10/2026)

### Bối cảnh xảy ra
Trước đây "đóng gói" chỉ là 1 lần gửi cân cho cả nhóm. Không ai kiểm món nào đã vào thùng nào, kiện lệch cân vẫn thành `packed` ngay (chỉ báo Store Owner), món hỏng phát hiện lúc đóng không có cách báo, và đơn bị hủy sau khi đã đóng thì hàng nằm trong thùng không ai trả về kệ.

### Ai làm gì

| Bước | Ai | Route | Kết quả |
|---|---|---|---|
| 0. Được giao việc | Hệ thống | (tự động khi kế hoạch `ready`) | `session.assignedPackerId` = Packaging Staff ít việc nhất; tính lại giữ người cũ; người được giao nhận `packing_assigned` |
| 0b. Đổi người | Packaging, Admin | `POST .../packing-plan/assign` | `{mode: auto}` hoặc `{mode: manual, staff_id}` |
| 1. Bắt đầu | Packaging, Warehouse, Admin | `POST .../packing-plan/start` | Kế hoạch `approved → packing`, ghi người + giờ. Quét món đầu tiên cũng tự bắt đầu |
| 2. Quét món | như trên | `POST .../parcels/:no/scan` | Mỗi lần quét gắn 1 món (`item_key`) chưa quét của kiện. Sai kiện → 409 kèm kiện đúng |
| 3. Niêm phong + cân | như trên | `POST .../parcels/:no/seal` | Quét đủ mới cho niêm phong. Trừ thùng + vật tư của kiện. Trong ngưỡng → `sealed`; lệch → `held` |
| 4. Xem lại kiện lệch | Packaging (người KHÁC), Admin | `POST .../parcels/:no/review` | `accept` / `reweigh` / `reopen` |
| 5. Hoàn tất | Hệ thống | (cùng transaction với kiện cuối) | Mọi kiện còn giao `sealed` → kế hoạch + nhóm `packed`, báo Lazada |

**Ví dụ** — nhóm có 2 kiện: kiện 1 (2 áo TEE-M, 1 quần JEAN-30), kiện 2 (1 hộp giày SHOE-40):
1. Quét `TEE-M` ở kiện 2 → 409 `PACKING_SCAN_WRONG_PARCEL`, `details.belongsToParcels: [1]` — màn hình báo "món này của kiện 1".
2. Quét `tee-m` (chữ thường) 2 lần, `JEAN-30` 1 lần vào kiện 1 → `remainingInParcel: 0`. Quét `TEE-M` lần 3 → 409 `PACKING_SCAN_OVER`.
3. `seal` kiện 1 với 0,93 kg (ước tính 0,90 kg) → `sealed`. `seal` kiện 2 với 1,6 kg (ước tính 1,1 kg, lệch 45%) → `held`, Packaging Staff + Store Owner nhận `packing_parcel_held`; nhóm **chưa** `packed`.
4. Người niêm phong bấm `accept` → 403 `PACKING_SELF_REVIEW_FORBIDDEN`. Đồng nghiệp mở kiện, thấy dư 1 túi khí lớn → `review {action: "accept", reason: "MATERIALS_HEAVIER"}` → kiện `sealed`, response `completed: true`, nhóm `packed`.

### Lối tắt `POST .../packing-plan/pack`
Vẫn dùng được (demo nhanh, hoặc FE chưa làm màn quét): cân cho **đủ các kiện chưa niêm phong**, món chưa quét ghi `method: "bypass"`, kế hoạch ghi `packMode: "quick"` (báo cáo thấy được tỷ lệ đóng không quét). **Đổi hành vi:** kiện lệch cân **không còn thành packed** — vào `held` như đường quét. Bật cài đặt `require_scan` → 409 `PACKING_SCAN_REQUIRED`.

### Sự cố lúc đóng — `POST .../packing-plan/report-issue`
Kiện phải đang `pending` (kiện `held` thì `review {action: "reopen"}` trước).
- **`resolution: "replace"`** — lấy 1 món thay từ kệ ngay tại bàn đóng: cần `warehouse_id` (tùy chọn `bin_location_id`). Hệ thống: bớt món cũ khỏi số "đã lấy" (món hỏng không trả kệ), trừ tồn 1 món mới (sổ kho `pack_replace`), xóa lần quét của món đó — **quét lại** rồi niêm phong. Kho hết → 409 `ORD_GROUP_INSUFFICIENT_STOCK` → dùng cách dưới.
- **`resolution: "back_to_picking"`** — kế hoạch bị thay, nhóm `approved_for_packing → picking`, Warehouse lấy món thay bằng `pick-item` như bình thường; lấy đủ → `pick` → hệ thống tự tính lại kế hoạch. Chỉ khi **chưa niêm phong kiện nào** (409 `PACKING_ISSUE_HAS_SEALED_PARCELS`) — vì thùng đã trừ tồn.
- Mỗi sự cố ghi `issues[]` + thông báo `packing_issue` (Store Owner; `back_to_picking` thêm Warehouse Staff).

### Đơn hủy sau khi đã bắt đầu đóng — tháo kiện
- Đồng bộ đơn thấy 1 đơn chuyển hủy/sự cố khi kế hoạch đang `packing`/`packed`: đơn đó `orders[].status = "canceled"`, **mọi kiện của đơn** → `to_unpack` (kể cả kiện chưa niêm phong — hàng đã lấy khỏi kệ). Kiện đơn khác giữ nguyên, không tính lại. Thông báo `unpack_required`.
- Tất cả đơn đều hủy → nhóm `canceled` (kể cả từ `packed`), kế hoạch giữ tới khi tháo xong.
- `POST .../parcels/:no/unpack {box_condition: "reusable"|"damaged", recovered_materials?: [{code, quantity}]}`: hàng về **đúng ô đã lấy** (sổ kho `cancel_unpack`), thùng `reusable` → kho tái sử dụng, `damaged` → ghi bỏ; kiện `voided`. 🆕 Vật tư chèn còn dùng được khai trong `recovered_materials` → cộng kho tái sử dụng (ví dụ kiện có 4 góc xốp, 3 cái còn nguyên → `[{"code": "FOAM-CORNER", "quantity": 3}]`; 1 cái còn lại coi như đã dùng). Vật tư phải bật `reusable` ở `/packaging/materials` (400 `PKG_MATERIAL_NOT_REUSABLE`); mã không có trong kiện hoặc vượt số → 400 `PACKING_RECOVER_MATERIAL_INVALID`. `withoutLocation > 0` = có món lấy từ lần quét cũ không lưu ô — kho phải tự đặt lại và đối soát.
- Còn kiện `to_unpack` → **không giao được** (409 `SHP_PARCELS_TO_UNPACK`). Kiện đã tháo không xuất hiện trong báo giá, phiếu, nhãn, tổng kiện.
- Nếu đơn cuối cùng còn kiện chưa đóng bị hủy khiến các kiện còn lại đều đã `sealed` nhưng kế hoạch chưa tự `packed` → gọi `POST .../packing-plan/finish`.

### 🆕 Đơn hủy TRƯỚC khi bắt đầu đóng — hàng đã lấy tự trả kệ (05/10/2026 tối)
Áp dụng khi nhóm đang `picking`, `picked`, `pending_approval` hoặc `approved_for_packing` (chưa ai bấm bắt đầu/quét).
- Hệ thống tính **hàng dư** = đã lấy (lượt hiện tại) − số đặt của các đơn còn lại, theo từng SKU. Phần dư **tự cộng lại tồn** đúng ô đã lấy (ô lấy sau cùng trả trước), sổ kho loại `cancel_return`.
- Warehouse Staff + người lấy hàng được giao nhận `return_to_shelf`: *"Đem hàng đã lấy trong giỏ trả về kệ: TEE-M ×2 → ô KA-D1-P01-T03-2; …"*. Thuận chốt cách này (tự cộng tồn + báo kho), không có bước xác nhận — giống `decide-partial` từ chối.
- Hủy hết nhóm → mọi món đã lấy được trả. Lần quét cũ không lưu ô → thông báo ghi "không rõ ô, đối soát tay".
- Kế hoạch đã tính/duyệt vẫn bị thay và tính lại như trước; khi tính lại chỉ còn hàng của đơn còn lại.
- Đang `picking` mà chưa lấy vượt nhu cầu còn lại → không trả gì.

### Cài đặt đóng gói — `GET/PUT /packing/settings`
| Cài đặt | Mặc định | Có hiệu lực |
|---|---|---|
| `abnormal_weight_threshold` | 0.2 (20%) | Lần niêm phong/cân lại kế tiếp |
| `fragile_cushion_mm` | 5 | Lần tính kế hoạch kế tiếp (kế hoạch đã tính giữ số đã chụp) |
| `default_prefer` | `fewest_parcels` | Lần tính kế tiếp |
| `max_parcels_per_order` | không giới hạn | Lần tính kế tiếp — vượt thì đơn `overParcelLimit: true`, duyệt phải gửi `override_reason` |
| `allow_reused_box_for_fragile` | false | Lần niêm phong kế tiếp — false: kiện có hàng dễ vỡ chỉ lấy thùng mới |
| `require_scan` | false | Ngay — true thì lối tắt `pack` bị chặn |

Mỗi lần lưu = 1 version mới (giữ lịch sử); 2 người lưu cùng lúc → người sau 409 `PACKING_SETTINGS_CONFLICT`.

### Báo cáo — `GET /packing/reports/summary?from&to&staff_id`
Store Owner, Admin. Thời gian chờ đóng, thời gian đóng, tỷ lệ kiện lệch cân, số kiện được chấp nhận dù lệch, tỷ lệ duyệt nguyên vẹn (không chỉnh tay), tỷ lệ đơn đạt đúng số kiện tối thiểu, tỷ lệ quét kiểm, chi phí thùng + vật tư, số sự cố theo loại, bảng theo nhân viên. Thời gian chỉ có ở nhóm đã bấm bắt đầu/quét (lối tắt không có giờ bắt đầu).

### Tác động tới dữ liệu và luồng đã có
1. **Dữ liệu cũ:** không migration. Kế hoạch `packed` trước 05/10 trả kiện `sealed`; kế hoạch `ready`/`approved` cũ có kiện `pending`, đóng bằng quét hoặc lối tắt đều được.
2. **Route đổi hành vi:** `pack` (kiện lệch bị giữ, response thêm `completed`; `lazadaPackSync` = `null` khi chưa hoàn tất), `approve` (vượt số kiện tối đa cần lý do), `POST /order-groups/:id/assign` gán tay chỉ nhận Warehouse Staff (422 `ORD_GROUP_STAFF_WRONG_ROLE` — trước đây gán được cho bất kỳ ai), bắt đầu giao/`shipments/batch` (chặn khi còn kiện phải tháo).
3. **Giữ chỗ thùng:** kiện đã niêm phong không còn tính giữ chỗ (thùng đã trừ thật — trước đây có thể tính 2 lần trong lúc đóng dở); kế hoạch `packing` vẫn giữ chỗ cho kiện chưa niêm phong.
4. **Không ảnh hưởng:** tính kế hoạch, CP-SAT, chỉnh tay, hướng dẫn AI, lấy hàng, báo Lazada (vẫn chỉ gửi khi nhóm sang `packed`).
5. **Giới hạn:** ảnh/bằng chứng kiện chưa có; quét theo SKU (chưa có mã từng món); báo cáo tính trực tiếp, chưa có bảng tổng hợp định kỳ. ~~Hàng đã lấy của đơn hủy trước khi đóng chưa tự trả kệ; vật tư chèn không thu hồi~~ — 🔄 đã sửa tối 05/10/2026 (xem trên). Trả kệ tự động nghĩa là tồn trên hệ thống có trước khi hàng thật về kệ vài phút (cho tới khi kho làm theo thông báo).

**Tác động của bản sửa tối 05/10:** (1) Dữ liệu cũ: không migration; `unpack.recovered_materials` mặc định rỗng; vật tư cũ `reusable: false`. (2) Đổi hành vi: hủy đơn trước khi đóng giờ cộng tồn + bắn thông báo; `unpack` nhận thêm `recovered_materials`; response vật tư thêm 3 trường. (3) Xung đột: trả kệ chạy trong transaction, gọi lặp không cộng 2 lần; lỗi trả kệ không chặn việc hủy đơn (chỉ log). (4) Không ảnh hưởng: phiên đóng gói, tính kế hoạch, lấy hàng bình thường. (5) Phát hiện + sửa: bộ đếm "đã lấy" của giữ chỗ trước đây không giảm khi loại món hỏng → món thay không được giữ chỗ.

---

## Nghiệp vụ 2 — Phân công nhân viên (Staff Assignment)

### Bối cảnh xảy ra
🔄 **ĐÃ ĐỔI (21/09/2026)** — ngay khi Order Group được TẠO (lúc đồng bộ/gộp đơn), hệ thống tự gán Warehouse Staff và chuyển group sang `picking` (trước đây chờ tới khi approve gợi ý đóng gói). Nếu tự gán lỗi (chưa có Warehouse Staff active), group vẫn được tạo, Admin gán tay qua `POST .../assign`. Mục đích: biết ngay **AI đi lấy hàng**. Không có bước này, đơn "trôi nổi" không ai chịu trách nhiệm xử lý.

### Cơ chế tự động — thuật toán "Ít việc nhất" (Least-Busy)
```
Hệ thống đếm: mỗi Warehouse Staff đang active có bao nhiêu Order Group
              ĐANG XỬ LÝ DỞ (fulfillment_status CHƯA tới delivered/returned)
→ Chọn người có số ít nhất
→ Hòa nhau → chọn người được gán việc lần GẦN NHẤT LÂU HƠN (ai "nghỉ tay"
  lâu nhất trong số đang hòa điểm được ưu tiên) — round-robin theo thời
  gian, KHÔNG phải theo `_id` (đã sửa mô tả 16/09/2026 cho khớp code
  thật — cách này công bằng hơn `_id` cố định, tránh việc hòa điểm luôn
  ưu tiên đúng 1 người)
```
Đây là phép đếm **real-time**, KHÔNG lưu sẵn 1 con số "đang có bao nhiêu việc" cho từng nhân viên — tránh tình trạng số liệu bị lệch (quên cập nhật khi đơn hoàn thành).

### Tình huống cần đổi tay — bối cảnh thực tế
- Nhân viên đang phụ trách đột xuất nghỉ/bận việc khác
- Đơn chuyển thành Hỏa Tốc, cần người có kinh nghiệm xử lý nhanh hơn
- Nhân viên tự thấy mình đang quá tải, muốn nhường bớt việc

Cả 3 tình huống trên **dùng chung đúng 1 API** (`POST /order-groups/:id/assign`, có `staff_id`) — hệ thống KHÔNG phân biệt lý do đổi tay là gì, không cần route riêng cho từng tình huống.

### DB liên quan — field trên `OrderGroup`

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `assigned_staff_id` | ObjectId\|null | Ai đang phụ trách — `null` nghĩa là chưa gán ai |
| `assigned_at` | Date\|null | Lúc gán gần nhất |
| `assignment_type` | `'auto'\|'manual'\|null` | Lần gán gần nhất là tự động hay đổi tay — audit, KHÔNG ảnh hưởng logic nghiệp vụ nào |

---

## 🆕 Nghiệp vụ 2b — Thiết lập kho (Warehouse Setup) — MỚI, bổ sung 16/09/2026, viết lại dễ hiểu hơn 20/09/2026

> 🔄 **ĐÃ ĐỔI (26/09/2026)** — phần quản lý kho đã tách thành file riêng **`INTEGRATION_GUIDE_WAREHOUSE.md`** (thêm sửa/vô hiệu hóa kho-khu-kệ, Product Master, các lỗi mới khi thao tác trên kho đã tắt, và lộ trình làm lại kho K2-K5). Mục 2b dưới đây giữ nguyên để tham chiếu 4 bước tạo kho; mọi thay đổi mới chỉ cập nhật ở file kho.

**Vì sao mục này mới xuất hiện dù `warehouse/` đã có từ trước**: các mục khác trong file chỉ nói tới việc **DÙNG** dữ liệu kho (Picking đọc `bin_location`/`sku_bin_assignment` đã có sẵn) — nhưng chưa từng có hướng dẫn cho bước **TẠO RA** dữ liệu đó (Admin phải làm TRƯỚC KHI bất kỳ đơn nào có thể Picking). Đây là khoảng trống tài liệu thật, không phải do API mới — chỉ là tới giờ mới rà thấy.

### Hình dung bằng đời thực trước khi đọc kỹ thuật

4 bước dưới đây tương ứng đúng 4 việc bạn làm khi **mở 1 kho hàng thật ngoài đời**, theo đúng thứ tự không thể đảo:

```
1. THUÊ 1 CĂN NHÀ           → Bước 1: Tạo KHO
2. DÁN BẢNG CHIA KHU        → Bước 2: Tạo KHU (trong kho đó)
3. ĐÓNG KỆ SẮT, ĐÁNH SỐ     → Bước 3: Sinh KỆ (trong khu đó)
4. DÁN TEM SẢN PHẨM LÊN KỆ  → Bước 4: Gán SKU vào 1 kệ
```

Không thể dán tem sản phẩm lên 1 cái kệ **chưa từng được đóng** — đó là lý do 4 bước này **bắt buộc đúng thứ tự**, bước sau luôn cần "địa chỉ" do bước trước tạo ra.

### Bối cảnh — ai làm, khi nào

**Admin làm 1 LẦN lúc setup ban đầu** (hoặc mỗi khi mở kho mới/thêm SKU mới):

```
Bước 1: Tạo KHO ──► Bước 2: Tạo KHU (trong kho đó)
                              │
                              ▼
Bước 4: Gán SKU vào 1 kệ ◄── Bước 3: Sinh HÀNG LOẠT kệ (trong khu đó)
```

**Ví dụ xuyên suốt dùng cho cả 4 bước bên dưới**: bạn mở 1 kho ở Quận 7 để chứa ốp lưng điện thoại đang bán trên Lazada.

### Bước 1 — Tạo kho (= thuê 1 căn nhà)

```
POST /warehouse/warehouses
Body: { "warehouse_code": "WH-HCM-01", "warehouse_name": "Kho TP.HCM - Quận 7", "address": "123 Đường ABC, Quận 7, TP.HCM" }
→ 201: { "id": "...", "warehouseCode": "WH-HCM-01", "warehouseName": "...", "address": "...", "isActive": true }
```

Chỉ vậy — hệ thống giờ biết "có 1 kho tên WH-HCM-01", nhưng kho còn **trống trơn**, chưa chia khu, chưa có kệ nào.

Xem lại: `GET /warehouse/warehouses` — danh sách toàn bộ kho. 🔄 **ĐÃ ĐỔI (19/09/2026)** — route này giờ mở thêm cho **Warehouse Staff** (trước chỉ Admin) — vì `picking-list`/`pick-item`/`report-missing` (Warehouse Staff phải gọi hàng ngày) đều bắt buộc `warehouse_id`, cần có cách để họ tự biết ID kho mình đang làm việc, không hardcode tay.

### Bước 2 — Tạo khu TRONG kho đó (= dán bảng chia khu trong nhà kho)

```
POST /warehouse/warehouses/:warehouseId/zones
Body: { "zone_code": "A", "zone_name": "Phụ kiện điện tử", "description": "Khu chứa cáp sạc, tai nghe, phụ kiện nhỏ" }  // description optional
→ 201: { "id": "...", "warehouseId": "...", "zoneCode": "A", "zoneName": "...", "description": "..." }
```

Với ví dụ đang dùng: `zone_code: "A"`, `zone_name: "Phụ kiện điện thoại"` — giờ trong kho WH-HCM-01 có 1 khu tên "A" chuyên chứa ốp lưng/phụ kiện.

**Lưu ý dễ nhầm**: `zone_code` chỉ cần **duy nhất TRONG 1 kho**, không phải duy nhất toàn hệ thống — mở thêm 1 kho ở Hà Nội, khu ở đó cũng đặt tên "A" được bình thường, 2 kho là 2 "thế giới" tách biệt hoàn toàn (xem lý do thiết kế kỹ hơn ở tài liệu giảng giải hệ thống, mục II.7).

Xem lại: 🔄 `GET /warehouse/warehouses/:warehouseId/zones` (đã sửa lỗi 16/09/2026 — trước đây có thể không trả ra dữ liệu dù tạo thành công).

### Bước 3 — Sinh HÀNG LOẠT kệ trong khu đó (= đóng kệ sắt, đánh số từng ngăn — không đóng tay từng cái)

```
POST /warehouse/zones/:zoneId/bin-locations/generate
Body: { "aisle": "03", "rack_from": 1, "rack_to": 10, "level_from": 1, "level_to": 4 }
→ 201: { "created": 40 }   // 10 rack × 4 level = 40 kệ, sinh trong 1 lần gọi (bulkWrite, xem tài liệu giảng giải mục III.6)
```

Thay vì gọi API 40 lần để tạo tay từng ngăn kệ, chỉ cần khai "tôi muốn dãy 03, kệ số 1 tới 10, mỗi kệ 4 tầng" — hệ thống **tự sinh ra đủ 40 vị trí trong 1 lần gọi**, tự đặt tên dạng `"{zone_code}-{aisle}-{rack:02}-{level:02}"` (VD `"A-03-01-01"` = khu A, dãy 03, kệ 01, tầng 01). FE **không cần tự nghĩ tên kệ**, chỉ cần khai đúng khoảng (range).

⚠️ Gọi lại ĐÚNG khoảng đã tạo trước đó **không báo lỗi, không tạo trùng** (idempotent — `upsert`) — an toàn nếu Admin lỡ bấm 2 lần. Nhưng KHÔNG dùng tính chất này để "sinh thêm" — muốn mở rộng khoảng, gọi API MỚI với range khác (VD `rack_from: 11, rack_to: 15`), đừng gọi lại range cũ với ý định "cộng thêm".

Xem lại (🆕 MỚI 16/09/2026 — trước đây KHÔNG có cách nào xem lại):

```
GET /warehouse/zones/:zoneId/bin-locations              → kệ trong 1 khu
GET /warehouse/warehouses/:warehouseId/bin-locations    → TOÀN BỘ kệ trong 1 kho (mọi khu gộp)
→ 200: [{ "id": "...", "warehouseId": "...", "zoneId": "...", "binCode": "A-03-01-01", "aisle": "03", "rack": 1, "level": 1 }, ...]
```

### Bước 4 — Gán 1 sản phẩm CỤ THỂ vào 1 kệ CỤ THỂ (= dán tem sản phẩm lên đúng 1 ngăn kệ)

```
POST /warehouse/warehouses/:warehouseId/sku-bin-assignments
Body: {
  "platform": "lazada", "shop_id": "201171264532", "seller_sku": "OPLUNG-IP15",
  "bin_location_id": "<id của A-03-01-01, lấy từ response Bước 3 hoặc từ GET xem lại>",
  "initial_quantity": 0   // OPTIONAL, mặc định 0 — có thể gán vị trí TRƯỚC, nhập hàng SAU qua bước Restock
}
→ 201: { "id": "...", "warehouseId": "...", "platform": "lazada", "shopId": "...", "sellerSku": "OPLUNG-IP15", "binLocationId": "...", "quantityOnHand": 0 }
```

Giờ hệ thống biết chính xác: "ốp lưng iPhone 15 nằm ở đúng kệ A-03-01-01" — đây là mảnh ghép CUỐI CÙNG, sau bước này SKU đã sẵn sàng để tính vào Picking List khi có đơn.

**Nhập thêm hàng sau đó** (nghiệp vụ RIÊNG, không phải gán lại):

```
POST /warehouse/warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock
Body: { "quantity": 50 }   // CỘNG DỒN vào quantityOnHand hiện có, KHÔNG ghi đè
```

🔄 **ĐÃ ĐỔI (01/10/2026)** — nhập thêm hàng, danh sách khu, danh sách ô của kho và danh sách SKU đã gán mở thêm cho **Warehouse Staff** (trước đây chỉ Admin, nhân viên kho bị `403`). Bốn bước tạo kho → khu → kệ → gán SKU ở trên vẫn chỉ Admin. Màn hình "Tồn kho theo vị trí" cho nhân viên kho: `INTEGRATION_GUIDE_WAREHOUSE.md` PHẦN B5.

Xem lại (🆕 MỚI 16/09/2026): `GET /warehouse/warehouses/:warehouseId/sku-bin-assignments` — toàn bộ SKU **ĐÃ** gán trong 1 kho. **Dễ nhầm với route đã có từ trước** `GET /warehouse/sku-bin-assignments/unassigned` — route ĐÓ trả chiều NGƯỢC LẠI: SKU nào TRONG hệ thống nhưng **CHƯA** gán vị trí nào (để Admin biết còn SKU nào cần làm Bước 4). Tóm gọn: `unassigned` = "còn việc phải làm", route mới = "đã làm xong" — 2 route trả 2 tập dữ liệu ĐỐI LẬP nhau.

### Mã lỗi riêng mục này

| Mã                            | HTTP    | Khi nào                                                                                                |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `WH_WAREHOUSE_NOT_FOUND`      | 404/400 | `warehouseId` không tồn tại hoặc sai định dạng ObjectId                                                |
| `WH_ZONE_NOT_FOUND`           | 404/400 | `zoneId` không tồn tại hoặc sai định dạng ObjectId                                                     |
| `WH_INVALID_BIN_RANGE`        | 400     | `rack_from > rack_to` hoặc `level_from > level_to` ở Bước 3                                            |
| 🆕 `WH_WAREHOUSE_CODE_IN_USE` | 409     | **MỚI (19/09/2026)** — `warehouse_code` đã tồn tại (trước đây rơi 500 thô, xem báo cáo thật đồng đội)  |
| 🆕 `WH_ZONE_CODE_IN_USE`      | 409     | **MỚI (19/09/2026)** — `zone_code` đã tồn tại TRONG CÙNG 1 kho (2 kho khác nhau vẫn đặt trùng mã được) |

---

## Nghiệp vụ 3 — Lấy hàng (Picking) — nghiệp vụ có nhiều tình huống nhất

### Bối cảnh xảy ra
🔄 **ĐÃ ĐỔI (21/09/2026)** — Order Group ở `picking` ngay sau khi tạo, đã có người phụ trách (`assigned_staff_id`) — chưa có gợi ý đóng gói (gợi ý tính sau khi lấy xong). Warehouse Staff cần đi lấy đúng sản phẩm, đúng số lượng, từ đúng vị trí kệ.

### Tình huống chính (happy path) — 2 cách làm, tùy mức độ chi tiết muốn theo dõi

**Cách A — theo dõi từng món (khuyến nghị, có audit đầy đủ)**:
```
1. GET /order-groups/:id/picking-list           → xem cần lấy SKU nào, số lượng bao nhiêu
2. GET /warehouse/:warehouseId/picking-list/:groupId → BẢN CÓ VỊ TRÍ KỆ, đã sắp xếp theo lộ trình đi
3. Với MỖI SKU: POST .../fulfillment/pick-item   → quét/nhập tay, trừ tồn kho NGAY
4. Sau khi lấy hết: POST .../fulfillment/pick    → server đối soát đủ số lượng, group chuyển "picked"
```

🔄 **ĐÃ ĐỔI (15/09/2026)** — cả 2 API lấy danh sách ở trên đều tự động **loại bỏ SKU thuộc đơn đã `canceled` hoặc gặp sự cố logistics** (`lost`, `damaged_by_3pl`... xem `INTEGRATION_GUIDE_ORDERS.md` mục 7b) khỏi danh sách cần lấy — trước đây KHÔNG lọc, nhân viên có thể bị yêu cầu đi lấy hàng cho đơn đã hủy/mất. Trường hợp TOÀN BỘ đơn trong group đều rơi vào 2 nhóm này (group rỗng sau khi lọc) → API trả lỗi `ORD_GROUP_ALL_ORDERS_CANCELED` (409) thay vì trả về danh sách rỗng — FE nên bắt riêng mã lỗi này, hiện thông báo rõ ràng ("Nhóm đơn này không còn gì cần lấy") thay vì hiểu nhầm là màn hình trắng/lỗi tải dữ liệu.

### 🆕 Phân biệt nhóm đơn có đơn đã hủy ngay trên danh sách (01/10/2026)

**Vấn đề trước đây:** danh sách nhóm đơn chỉ có `orderCount`. Hệ thống đã lọc đơn hủy ở tầng hàng cần lấy (Picking List, gợi ý đóng gói), nhưng trên **danh sách** thì nhóm bình thường, nhóm hủy một phần và nhóm hủy hết trông giống nhau — nhân viên phải mở từng nhóm mới biết.

**Từ 01/10/2026**, mọi response nhóm đơn (`GET /order-groups`, `GET /order-groups/:id` và các route thao tác trả về nhóm đơn) có thêm 2 trường:

| Trường               | Ý nghĩa                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `activeOrderCount`   | Số đơn **còn phải xử lý** — cùng quy tắc với Picking List: đơn không bị hủy và không gặp sự cố vận chuyển |
| `canceledOrderCount` | Số đơn có trạng thái `canceled`                                                                           |

Ví dụ nhóm 2 đơn, khách hủy 1 đơn:

```json
{ "id": "6a9c18292fced4f442f6e1b1", "orderCount": 2, "activeOrderCount": 1, "canceledOrderCount": 1, "fulfillmentStatus": "picking", ... }
```

**Quy tắc hiển thị trên FE:**

| Điều kiện                                        | Hiển thị                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `canceledOrderCount === 0`                       | Bình thường                                                                                                                                                  |
| `activeOrderCount > 0 && canceledOrderCount > 0` | Nhãn **"Một phần đã hủy"** (ví dụ "1/2 đơn đã hủy"). Nhóm vẫn lấy hàng bình thường; Picking List đã tự bỏ hàng của đơn hủy                                   |
| `activeOrderCount === 0`                         | **"Không còn hàng cần xử lý"** — ẩn khỏi hàng đợi "Cần lấy", đưa sang tab "Đã hủy". Mở Picking List của nhóm này sẽ nhận `409 ORD_GROUP_ALL_ORDERS_CANCELED` |

`orderCount − activeOrderCount − canceledOrderCount` = số đơn gặp sự cố vận chuyển (`lost`, `damaged_by_3pl`...). Thường bằng 0.

**Cách demo:** chọn 1 nhóm có 2 đơn Lazada → hủy 1 đơn trên Lazada (hoặc dùng dữ liệu có sẵn đơn `canceled`) → chờ đồng bộ (tối đa 10 phút, hoặc Admin bấm đồng bộ tay) → tải lại danh sách: nhóm hiện nhãn "Một phần đã hủy", `activeOrderCount: 1`, `canceledOrderCount: 1`. Mở Picking List: chỉ còn hàng của đơn chưa hủy.

**Nguồn số liệu:** API luôn đếm trực tiếp từ trạng thái đơn trong collection `orders` tại thời điểm gọi, nên số trả cho FE luôn đúng, kể cả nhóm đơn tạo từ trước.

**Bản lưu sẵn trong DB:** mỗi document `order_groups` có thêm `active_order_count`, `canceled_order_count` và `order_counts_refreshed_at`. Các trường này được cập nhật mỗi lần đồng bộ chạm tới nhóm (đơn mới, đơn đổi trạng thái, đơn gộp đến muộn, đơn đổi hàng `EXC-`), dùng để xem trực tiếp trong Compass và làm nền cho bộ lọc phía BE sau này. FE **không** đọc các trường này; FE dùng `activeOrderCount` / `canceledOrderCount` trong response.

**Dữ liệu cũ:** nhóm đơn tạo trước ngày 01/10/2026 chưa có bản lưu sẵn (giá trị `null` hoặc không có trường) cho tới khi được đồng bộ lại. Chạy script một lần cho mỗi môi trường để điền đủ:

```bash
cd be
npx ts-node -r dotenv/config scripts/backfill-order-group-counts.ts
```

Script chạy lại nhiều lần vẫn an toàn (tính lại từ đầu, ghi đè cùng giá trị), không đổi trường nào khác và không tăng `__v` của nhóm đơn, nên không ảnh hưởng `expected_version` FE đang giữ. API vẫn trả số đúng dù chưa chạy script.

**Hạn chế hiện tại và hướng khắc phục:**

| Hạn chế                                                                                                                     | Ảnh hưởng                                                                                                                                                                                                                                       | Hướng khắc phục                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Nhóm hủy hết **chưa có trạng thái riêng**: vẫn giữ `fulfillmentStatus` cũ, vẫn giữ chỗ tồn kho (K5), vẫn giao cho nhân viên | Ẩn khỏi màn hình nhưng tồn khả dụng vẫn bị trừ                                                                                                                                                                                                  | Bước sau: trạng thái `cancelled`, giải phóng giữ chỗ, gỡ phân công, phiếu cất hàng đã lấy về kệ            |
| Chưa lọc được ở BE (ví dụ `?exclude_fully_canceled=true`)                                                                   | FE ẩn nhóm hủy hết sau khi nhận danh sách → số dòng hiển thị có thể ít hơn giới hạn 100                                                                                                                                                         | Số đếm đã được lưu sẵn trên nhóm đơn (01/10/2026). Bộ lọc phía BE sẽ thêm cùng bước trạng thái `cancelled` |
| Hủy **một phần** không giải phóng phần giữ chỗ của đơn đã hủy                                                               | Tồn khả dụng thấp hơn thực tế cho tới khi Admin/Store Owner bấm "Tính lại giữ chỗ" (`POST /order-groups/:id/stock-reservation/recheck`) hoặc nhóm được lấy hàng xong. Với nhóm hủy hết, tính lại cũng không nhả được (không còn hàng cần xử lý) | Làm cùng bước trạng thái `cancelled`                                                                       |

🔄 **ĐÃ ĐỔI (19/09/2026, báo cáo thật Hải Phượng)** — bước 3 (`POST .../fulfillment/pick-item`) giờ **kiểm tra SKU quét THẬT SỰ thuộc group này** TRƯỚC KHI trừ tồn kho — trước đây trừ tồn thẳng theo mã vạch quét được, không hỏi lại SKU đó có nằm trong đơn nào của group không (quét nhầm mã vạch SKU bất kỳ, miễn còn tồn kho, vẫn trừ tồn thật, sai lệch dữ liệu). Nếu SKU không thuộc group → trả lỗi `ORD_GROUP_ITEM_NOT_IN_GROUP` (404), **KHÔNG đụng tới tồn kho**. FE nên bắt riêng mã lỗi này khi quét (VD hiện "Mã vạch này không thuộc đơn đang lấy, kiểm tra lại") — khác hẳn lỗi `ORD_GROUP_INSUFFICIENT_STOCK` (409, SKU đúng nhưng không đủ hàng).

🆕 **ĐÃ ĐỔI (21/09/2026, BE-4a)** — luồng lấy hàng được server kiểm soát chặt:
- `pick-item` chỉ chạy khi group đang `picking` (khác → 409 `ORD_GROUP_PICK_NOT_ALLOWED`).
- Tổng đã quét của 1 SKU trong **lượt lấy hiện tại** không được vượt số đặt → 409 `ORD_GROUP_PICK_EXCEEDS_ORDERED` (details: `orderedQuantity`, `alreadyPicked`).
- Trừ tồn + ghi `pick_event` trong **1 transaction** (lỗi ghi event thì tồn kho rollback); 2 lần quét đồng thời bị tuần tự hóa; gửi lại cùng `client_event_id` trả kết quả cũ.
- `pick-item` **không cần hồ sơ đóng gói** (trước đây SKU chưa đo cũng chặn luôn việc lấy hàng).
- **Đường tắt "bấm pick không quét" đã bị chặn**: `pick` đối soát mọi SKU đã quét đủ; thiếu → 409 `ORD_GROUP_PICK_INCOMPLETE`, `details.missing = [{ sku, orderedQuantity, pickedQuantity }]` → dùng `report-missing`.

### Tình huống quét thất bại — nhân viên phải làm gì

| Tình huống | Cách xử lý |
|---|---|
| Camera hỏng/lag | Nhập tay mã SKU (`scan_method: "manual"`) |
| Tem mã vạch rách/mờ | Nhập tay, hệ thống ghi nhận `scan_method: "manual"` để sau này Admin biết cần in lại tem |
| **Mất mạng đúng lúc quét** | Client giữ `client_event_id` và gửi lại. 🔄 21/09: trừ tồn + ghi event cùng transaction, unique `client_event_id`; gửi lại (kể cả đồng thời) trả kết quả lần đầu, không trừ lần 2. (Chưa so khớp nội dung khi cùng key nhưng khác SKU/số lượng.) |
| Quét nhầm mã (SKU không thuộc đơn này) | Server chặn `ORD_GROUP_ITEM_NOT_IN_GROUP` (19/09), không chạm tồn kho; quét dư số đặt → `ORD_GROUP_PICK_EXCEEDS_ORDERED` (21/09) |

### Tình huống THIẾU HÀNG — nghiệp vụ quan trọng nhất trong Picking

**Bối cảnh thật**: nhân viên tới đúng kệ nhưng hàng thực tế không đủ (đã bán hết trên hệ thống nhưng chưa cập nhật kho, hoặc hàng lỗi phải loại bỏ).

**KHÔNG được tự ý xử lý** — quy trình bắt buộc:
```
1. POST .../fulfillment/report-missing
   { sku, missing_quantity, warehouse_id, note?, expected_version }
   → OrderGroup.fulfillment_status = "partial_needs_review"
   → Store Owner NHẬN THÔNG BÁO NGAY (in-app + email, mức "critical")
   → Group đổi trạng thái chờ xem lại; 🔄 21/09: pick-item bị chặn khi group không ở `picking`

2. [PACKAGING STAFF, không phải Warehouse Staff] xem lại, quyết định:
   POST .../fulfillment/decide-partial
   { approve: true }   → "picked" với phần đã lấy; phương án đóng gói tính trên số đã quét
                         (đơn không nhận được món nào sẽ không có phương án)
   { approve: false }  → hủy lượt, quay lại "picking" và MỞ LƯỢT LẤY MỚI
                         (`pick_round + 1` — số đã quét của lượt cũ không còn được cộng).
                         Tồn kho đã trừ ở lượt cũ KHÔNG tự cộng lại — kho cần đối soát/restock tay.
```

**Tại sao Warehouse Staff không tự quyết định được** (thiết kế có chủ đích, không phải giới hạn kỹ thuật): quyết định "giao thiếu hàng cho khách" là quyết định kinh doanh (ảnh hưởng trải nghiệm khách hàng, có thể cần bồi thường/giải thích) — không nên để 1 nhân viên kho tự ý quyết ngay tại chỗ.

### DB liên quan — `PickEvent` (log mỗi lần quét, KHÔNG phải trạng thái, chỉ để audit + chống trùng)

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `order_group_id` | ObjectId | Nhóm đơn nào |
| `seller_sku` | String | SKU nào |
| `scanned_quantity` | Number | Số lượng đã quét/nhập lần này |
| `scan_method` | `'barcode'\|'manual'` | Quét thật hay nhập tay — audit |
| `client_event_id` | String\|null | Chỉ có nếu Mobile App gửi (offline-sync) — unique có điều kiện, chống trừ trùng |
| `remaining_stock_after` | Number | Tồn kho CÒN LẠI sau lần trừ này — snapshot tại thời điểm đó |
| `pick_round` | Number | 🆕 21/09 — lượt lấy hàng của group lúc quét (event cũ = 0) |

### DB liên quan — `quantity_on_hand` trên `SkuBinAssignment` (đã có ở Nghiệp vụ Warehouse, nhắc lại vì Picking trực tiếp thay đổi field này)

Trừ bằng lệnh atomic — kiểm tra ĐỦ HÀNG và trừ trong CÙNG 1 lệnh MongoDB (`findOneAndUpdate` kèm điều kiện `quantity_on_hand: {$gte: số_lượng}`) — tránh tình huống 2 nhân viên quét cùng lúc 1 SKU sắp hết mà cả 2 đều "trừ được" (race condition).

---

## Nghiệp vụ 4 — Đóng gói vật lý & Vận chuyển

### Bối cảnh
Kế hoạch đã duyệt (nhóm `approved_for_packing`) → nhân viên đóng gói vật lý theo từng bước, cân từng kiện, rồi bàn giao vận chuyển.

🆕 **05/10/2026:** cách chính là **phiên đóng gói theo từng kiện** (quét → niêm phong + cân, kiện lệch chờ xem lại) — xem **Nghiệp vụ 1b**. Mục dưới mô tả lối tắt `pack` (vẫn dùng được).

```
[PACKAGING STAFF, WAREHOUSE STAFF, ADMIN] start → scan → seal từng kiện (hoặc lối tắt POST .../packing-plan/pack) → "packed"
[SHIPPING COORDINATOR] POST /shipments/batch (hoặc .../fulfillment/ship) → "shipped"
[SHIPPING COORDINATOR] POST .../fulfillment/deliver  → "delivered"
```

🔄 **ĐÃ THAY ĐỔI 04/10/2026** — `POST .../fulfillment/pack` đã gỡ, thay bằng `POST /order-groups/:groupId/packing-plan/pack`:
```json
{ "expected_version": 4,
  "parcels": [ { "parcel_no": 1, "weight_kg": 6.2 }, { "parcel_no": 2, "weight_kg": 5.9 } ] }
```
- `expected_version` là **version của kế hoạch** (không phải version nhóm).
- Phải cân **đủ mọi kiện, mỗi kiện đúng 1 lần** (thiếu/trùng/sai số kiện → 400 `PACKING_PACK_WEIGHTS_MISMATCH`). `parcel_no` đánh số 1..N trong **cả nhóm**, không đếm lại theo đơn.
- Cùng 1 transaction: kế hoạch `packed`, nhóm `packed`, **trừ 1 thùng/kiện** (hết thùng → 409 `PKG_BOX_OUT_OF_STOCK`, không chuyển gì) và trừ vật tư (thiếu vật tư **không chặn**: trừ phần có, ghi `materialsShortfall`, thông báo `low_material_stock`). Tồn rơi xuống ≤ ngưỡng → `low_box_stock`.
- ~~Mỗi kiện so với `estimatedWeightG` (hàng + bì + vật tư): lệch > 20% → `parcels[i].isAbnormal: true` + thông báo Store Owner (`abnormal_package`), **không chặn**.~~ 🔄 **ĐÃ ĐỔI 05/10/2026:** lệch quá ngưỡng (mặc định 20%, chỉnh ở `/packing/settings`) → kiện `held`, nhóm **chưa** `packed` tới khi người khác xem lại (Nghiệp vụ 1b); thông báo `packing_parcel_held` cho Packaging Staff + Store Owner. Lối tắt chỉ cân cho các kiện **chưa niêm phong**; response thêm `completed`.
- Response `{ plan, lazadaPackSync }` (🔄 gộp 05/10: thêm kết quả báo Lazada, xem mục ngay dưới). Màn FE: nút "Bắt đầu đóng gói" ở `/app/packing/:groupId` mở chế độ toàn màn hình (Nghiệp vụ 1). Ship/deliver vẫn mô phỏng nội bộ theo phạm vi đồ án.

### 🆕 Báo "đã đóng gói" lên Lazada (02/10/2026)

**Mục đích:** nhân viên đóng gói chỉ bấm **đúng nút "pack" hiện có**, không cần mở Seller Center. Sau khi OptiPack chuyển nhóm sang `packed`, BE tự gọi API **Pack** của Lazada để đơn trên shop cũng chuyển "Đã đóng gói". FE không cần gọi Lazada (FE không giữ token của shop).

**Không có nút mới, không đổi request.** 🔄 Gộp 05/10/2026: chạy ở `POST /order-groups/:groupId/packing-plan/pack` (route `fulfillment/pack` cũ đã gỡ). Thứ tự xử lý:

```
1. Kiểm tra nhóm còn đơn cần xử lý — hủy hết → 409 ORD_GROUP_ALL_ORDERS_CANCELED (MỚI)
2. OptiPack: kế hoạch + nhóm "packed", trừ thùng/vật tư theo từng kiện (1 transaction)
3. Gửi Pack lên Lazada cho các món của đơn Lazada còn hiệu lực (MỚI)
4. Trả response kèm kết quả gửi Lazada
```

Bước 3 **không bao giờ làm hỏng bước 2**: Lazada lỗi, mất mạng hay token hết hạn thì nhóm vẫn `packed` (thùng đã đóng thật, luồng giao hàng chạy tiếp), kết quả lỗi được ghi lại để gửi lại sau.

**Món nào được gửi lên Lazada:**

| Trường hợp                                                            | Gửi Pack?                           |
| --------------------------------------------------------------------- | ----------------------------------- |
| Đơn Lazada còn hiệu lực, món đang `pending` / `topack`                | Có                                  |
| Đơn đã hủy / gặp sự cố vận chuyển                                     | Không                               |
| Đơn đổi hàng `EXC-...` (OptiPack tự tạo, không tồn tại trên Lazada)   | Không                               |
| Món đã `packed` trở đi trên Lazada (seller tự bấm trên Seller Center) | Không gửi lại — ghi nhận là đã xong |
| Nhóm không thuộc Lazada                                               | Không                               |

**Response `pack` có thêm `lazadaPackSync`**, và **mọi response nhóm đơn có thêm `lazadaPack`** (cùng nội dung, lưu trên nhóm đơn):

```json
"lazadaPack": {
  "status": "success",
  "attemptedAt": "2026-10-02T09:15:00.000Z",
  "error": null,
  "items": [
    { "orderId": "560694402192001", "orderItemId": "560694402292001", "ok": true, "errorCode": "0",
      "message": "success", "packageId": "FP022511752246001", "trackingNumber": "TH340231JV0W0A", "shipmentProvider": "Flash Express" }
  ]
}
```

| `status`   | Ý nghĩa                                                                        | FE hiển thị                                         |
| ---------- | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| `null`     | Nhóm chưa từng qua bước này (dữ liệu cũ, hoặc chưa đóng gói)                   | Không hiển thị                                      |
| `disabled` | Cầu dao `LAZADA_WRITE_APIS_ENABLED` đang tắt — **chưa gửi**                    | Nhãn xám "Chưa gửi Lazada" + nút **Gửi lên Lazada** |
| `skipped`  | Không có gì cần gửi (nhóm không thuộc Lazada, chỉ có đơn đổi hàng, đơn đã hủy) | Không hiển thị hoặc ghi chú nhỏ                     |
| `success`  | Lazada đã nhận mọi món                                                         | Nhãn xanh "Đã báo Lazada"                           |
| `partial`  | Một số món lỗi (xem `items[].ok = false`, `message`)                           | Nhãn vàng + danh sách món lỗi + nút **Gửi lại**     |
| `failed`   | Không món nào thành công (`error` ghi lý do)                                   | Nhãn đỏ + `error` + nút **Gửi lại**                 |

**Gửi lại:** `POST /order-groups/:id/lazada-pack/retry` (Packaging Staff, Warehouse Staff, Admin), không cần body. Chỉ dùng khi nhóm đang `packed` và `status` khác `success`; không đổi trạng thái OptiPack. Response: nhóm đơn + `lazadaPackSync`.

| Mã lỗi                                         | HTTP      | Nguyên nhân                                                   |
| ---------------------------------------------- | --------- | ------------------------------------------------------------- |
| `ORD_GROUP_ALL_ORDERS_CANCELED`                | 409       | (route `pack`) Mọi đơn trong nhóm đã hủy — không cho đóng gói |
| `ORD_GROUP_LAZADA_PACK_NOT_ALLOWED`            | 409       | (route `retry`) Nhóm chưa `packed`, hoặc đã gửi thành công    |
| `ORD_GROUP_NOT_FOUND` / `ORD_GROUP_INVALID_ID` | 404 / 400 | Sai id nhóm                                                   |

Lỗi trả về **trong từng món** (`items[].errorCode`) là mã của Lazada. Hay gặp: `700026` / `700000` / `700031` — trạng thái món trên Lazada không cho đóng gói (đã đóng gói hoặc đã hủy trên Seller Center); `700004` — sai tham số (thường do `LAZADA_SHIPPING_ALLOCATE_TYPE` sai); `6` / `40011` / `700024` — Lazada đang bận, bấm gửi lại sau.

**Cấu hình (`be/.env`):**

| Biến                            | Mặc định | Ý nghĩa                                                                                                   |
| ------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `LAZADA_WRITE_APIS_ENABLED`     | `false`  | Cầu dao. Chỉ đúng `true` mới gọi Lazada. Lazada không có môi trường thử — mọi lệnh đi thẳng vào shop thật |
| `LAZADA_SHIPPING_ALLOCATE_TYPE` | `TFS`    | Tham số bắt buộc của Pack. Shop nội địa: `TFS`                                                            |

**Cách test lần đầu (bắt buộc trước khi demo):**

1. Đặt 1 đơn nhỏ trên shop Lazada để làm đơn test; chờ đồng bộ về OptiPack.
2. Để cầu dao **tắt**, đi hết luồng tới bấm "pack" → `lazadaPack.status = "disabled"`; Seller Center **không** thay đổi.
3. Trên **đúng 1 máy**: đặt `LAZADA_WRITE_APIS_ENABLED=true`, khởi động lại BE, bấm **Gửi lên Lazada** (`retry`) cho nhóm đó.
4. Kết quả `success` + có `packageId` → mở Seller Center, đơn đã chuyển "Đã đóng gói". Kết quả lỗi → chụp `lazadaPack` gửi BE để xử lý.

**Cách demo:** bật cầu dao trên máy demo → Packaging Staff bấm "Đã đóng gói" → màn hình hiện nhãn "Đã báo Lazada" → mở Seller Center cho thấy đơn đã chuyển trạng thái → lần đồng bộ sau, đơn trong OptiPack cũng mang trạng thái `packed`.

**Dữ liệu cũ:** không cần script. Nhóm đơn cũ có `lazadaPack.status = null`; nhóm đã đóng gói trước 02/10/2026 không tự gửi lên Lazada (có thể bấm **Gửi lên Lazada** nếu muốn).

**Hạn chế hiện tại và hướng khắc phục:**

| Hạn chế                                                                                            | Ảnh hưởng                                                       | Hướng khắc phục                                       |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| Chưa test trên đơn thật của shop tự giao (SOF)                                                     | Lazada có thể xử lý Pack khác với tài liệu chung                | Làm đúng mục "Cách test lần đầu" trước khi demo       |
| Chỉ báo "đã đóng gói"; giao hàng, giao thất bại, hoàn hàng trong OptiPack **không** báo lên Lazada | Đơn trên Lazada dừng ở "Đã đóng gói" tới khi seller tự cập nhật | Bổ sung ReadyToShip và nhóm API giao hàng khi mở rộng |
| 1 thùng OptiPack gồm nhiều đơn Lazada → nhiều `packageId`                                          | Không ảnh hưởng shop tự giao (không có nhãn Lazada)             | Cần xử lý nếu chuyển sang vận chuyển của Lazada       |
| Gửi lại phải bấm tay                                                                               | Lỗi tạm thời không tự khắc phục                                 | Thêm tác vụ định kỳ gửi lại cho nhóm `failed`         |
| Không có thông báo khi gửi lỗi                                                                     | Chỉ thấy khi mở nhóm đơn                                        | Gửi thông báo cho Store Owner khi `failed`/`partial`  |

### Hoàn hàng — có thể xảy ra ở 2 thời điểm khác nhau

```
Từ "shipped"   → return: khách từ chối nhận / hủy giữa đường
Từ "delivered" → return: khách trả hàng SAU KHI đã nhận (đổi ý, hàng lỗi phát hiện muộn)
```
Cả 2 tình huống dùng chung `POST .../fulfillment/return` — role cho phép CẢ Shipping Coordinator (phát hiện lúc giao) LẪN Warehouse Staff (phát hiện lúc soạn lại hàng hoàn về kho).

---

## Nghiệp vụ 5 — Đơn Hỏa Tốc & Cảnh báo SLA

### Bối cảnh xảy ra
Có những đơn cần xử lý NHANH HƠN bình thường (khách yêu cầu giao gấp, đơn VIP...). **Đã xác minh 2 lần độc lập bằng doc thật của Lazada**: sàn KHÔNG cung cấp tín hiệu tự động để biết đơn nào gấp — nên đây LUÔN LÀ quyết định do con người đưa ra.

### Luồng
```
[STORE OWNER hoặc ADMIN]
PATCH /order-groups/:id/priority
{ order_priority: "express", deadline_hours: 4 }   // deadline_hours mặc định 4 nếu bỏ trống

→ Hệ thống tự tính packaging_deadline = NGAY BÂY GIỜ + 4 GIỜ LÀM VIỆC
  (8h-17h, TÍNH CẢ THỨ 7, KHÔNG tính Chủ Nhật — nếu tạo lúc 16h, phần dư giờ
   tự động cộng dồn sang 8h sáng ngày làm việc kế tiếp, KHÔNG được cộng
   đơn giản kiểu "16h + 4h = 20h")
```

### Cron cảnh báo — chạy ngầm, không cần FE gọi gì
```
Mỗi 10 phút, hệ thống tự quét toàn bộ đơn "express":
  - Còn DƯỚI 1 GIỜ tới hạn  → cảnh báo (severity: warning) TỚI ĐÚNG người đang phụ trách
  - ĐÃ QUÁ HẠN               → escalate (severity: critical) TỚI Store Owner,
                                tự đánh dấu is_overdue: true (chỉ báo 1 LẦN DUY NHẤT
                                cho mỗi lần quá hạn, không spam lặp lại mỗi 10 phút)
```

### DB liên quan — field trên `OrderGroup`

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `order_priority` | `'normal'\|'express'` | Loại đơn |
| `packaging_deadline` | Date\|null | Hạn chót đóng gói — CHỈ có giá trị nếu `express` |
| `is_overdue` | Boolean | Đã quá hạn chưa — dùng để tránh cảnh báo lặp lại |

---

## Nghiệp vụ 6 — Thông báo (Notifications)

### Bối cảnh — khi nào hệ thống chủ động báo

| Sự kiện                                                                                                                          | Ai nhận                     | Mức độ   |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------- |
| Báo thiếu hàng (Nghiệp vụ 3)                                                                                                     | Store Owner (toàn bộ)       | critical |
| Sắp quá hạn Hỏa Tốc (<1h)                                                                                                        | Đúng 1 người đang phụ trách | warning  |
| Đã quá hạn Hỏa Tốc                                                                                                               | Store Owner (toàn bộ)       | critical |
| **MỚI (15/09/2026)** — Buyer yêu cầu hủy đơn, seller có hạn phản hồi (`cancel_trigger_time`) trước khi Lazada tự động hủy        | Store Owner + Admin (cả 2)  | critical |
| **MỚI (16/09/2026)** — Đồng bộ Lazada thất bại liên tục (VD token hết hạn) — có cơ chế chống spam, tối đa 1 lần/20 phút mỗi shop | Store Owner                 | warning  |
| 🆕 **MỚI (21/09/2026)** — Có kế hoạch đóng gói mới chờ duyệt (🔄 04/10: sau khi job tự tính xong)                                                       | Packaging Staff (toàn bộ)   | info     |
| 🆕 **MỚI (21/09/2026)** — Gợi ý đóng gói bị từ chối, kèm lý do (sau `reject`)                                                    | Admin (toàn bộ)             | warning  |
| 🆕 **05/10/2026** `packing_assigned` — được giao đóng 1 nhóm | Đúng người được giao | info |
| 🆕 **05/10/2026** `packing_parcel_held` — kiện lệch cân chờ xem lại | Packaging Staff + Store Owner | warning |
| 🆕 **05/10/2026** `packing_issue` — món hỏng/thiếu/sai lúc đóng | Store Owner (+ Warehouse Staff khi trả về lấy hàng) | warning |
| 🆕 **05/10/2026** `unpack_required` — đơn hủy sau khi đóng, phải tháo kiện | Packaging Staff + người đóng được giao | warning |
| 🆕 **05/10/2026** `return_to_shelf` — đơn hủy trước khi đóng, đem hàng đã lấy về kệ (kèm SKU, số lượng, mã ô) | Warehouse Staff + người lấy hàng được giao | warning |

> 🔄 **Bug đã sửa (21/09/2026)** — thông báo gửi theo ROLE (broadcast, không đích danh) trước đây có thể "biến mất" ở phía nhận do lệch kiểu dữ liệu (`recipient_role` lưu dạng chuỗi thay vì số) — đã sửa cả schema lẫn logic so khớp, dữ liệu cũ đã chạy migration cập nhật lại. FE không cần đổi gì, chỉ cần biết chuông thông báo giờ đáng tin cậy hơn cho các loại broadcast-theo-role.

> ⚠️ **Hành vi đổi (15/09/2026)** — `PATCH /notifications/:id/read` giờ kiểm tra quyền sở hữu: chỉ đánh dấu đọc được thông báo gửi ĐÍCH DANH mình hoặc gửi BROADCAST cho đúng role của mình. Gọi với ID của thông báo KHÔNG thuộc về mình (dù ID hợp lệ) → trả **404 `NOTI_NOT_FOUND`**, y hệt trường hợp ID sai — FE không nên coi đây là bug nếu test chéo giữa 2 tài khoản khác role.

### Cách FE nhận — Polling (không cần WebSocket)
```
GET /notifications/unread-count    (gọi mỗi 15-30 giây) → { "count": 3 }
GET /notifications?is_read=false   (khi user bấm vào chuông)
PATCH /notifications/:id/read      (khi user đọc xong)
```
Mỗi thông báo có `relatedEntityType`/`relatedEntityId` — bấm vào **điều hướng thẳng** tới đúng Order Group, không chỉ hiện chữ suông.

### DB liên quan — `Notification`

| Field                                     | Kiểu                            | Ý nghĩa                                                                                                                                                               |
| ----------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recipient_user_id`                       | ObjectId\|null                  | Gửi đích danh 1 người — 1 trong 2 với `recipient_role`, KHÔNG bao giờ cả 2 cùng có giá trị                                                                            |
| `recipient_role`                          | UserRole\|null                  | HOẶC gửi broadcast cho cả 1 role                                                                                                                                      |
| `type`                                    | String                          | 1 trong 10 loại (`missing_item`, `sla_warning`, `sla_breach`, `sync_failed`, `cancel_confirmation_required`, `mfa_disabled`...) — **MỚI (15/09/2026)**: `cancel_confirmation_required`; 🆕 **22/09/2026**: `low_box_stock` (thùng carton xuống ≤ mức cảnh báo sau khi đóng gói, gửi Admin + Store Owner, `relatedEntityType: 'packaging_box'`, `relatedEntityId` = mã thùng) |
| `severity`                                | `'info'\|'warning'\|'critical'` | Mức độ hiển thị (màu sắc/icon)                                                                                                                                        |
| `title`/`message`                         | String                          | Nội dung — văn phong chuyên nghiệp, dựng sẵn từ backend, FE không tự ghép chuỗi                                                                                       |
| `related_entity_type`/`related_entity_id` | String\|null / ObjectId\|null   | Điều hướng khi bấm vào                                                                                                                                                |
| `is_read`                                 | Boolean                         | Đã đọc chưa                                                                                                                                                           |
| `channels_sent`                           | String[]                        | Đã gửi qua kênh nào (audit — `['in_app']` hoặc `['in_app', 'email']`)                                                                                                 |

---

## Nghiệp vụ 7 — 🆕 Liên kết cùng người nhận, giao chung chuyến & hủy nhóm tự động (Mục 9.5 + N1) — MỚI (29/09/2026)

### Bối cảnh xảy ra

OptiPackAI giờ đồng bộ đơn từ **2 sàn** (Lazada + AURELLE, xem `INTEGRATION_GUIDE_ORDERS.md`). Vì mỗi đơn nguồn vẫn giữ phạm vi đóng gói RIÊNG (1 đơn = 1 Order Group, không tự gộp kiện — xem A.1/quyết định roadmap), một khách hàng THẬT mua ở cả 2 sàn cùng lúc sẽ có 2 Order Group HOÀN TOÀN tách biệt, dù cùng 1 người nhận/1 địa chỉ. Đây là 2 nhu cầu nghiệp vụ khác nhau nảy sinh từ đó:

1. **Biết được** 2 group đó là cùng 1 người (để Shipping Coordinator chủ động cân nhắc giao chung 1 chuyến, tiết kiệm chi phí/thời gian) — nhưng KHÔNG được tự động gộp/ép giao chung (an toàn — có thể 2 đơn cần giao khác thời điểm).
2. **Tùy chọn** tạo 1 "chuyến giao" thật gộp nhiều group lại nếu Shipping Coordinator xác nhận đúng là cùng 1 người, cùng 1 lần đi.

### `recipient_key` — chìa khóa liên kết, KHÁC HẲN `consolidation_key`

| | `consolidation_key` (đã có từ trước) | `recipient_key` (🆕 mới) |
|---|---|---|
| Công thức | `sha256(platform + tên/SĐT/địa chỉ/tỉnh đã chuẩn hóa)` | `sha256(tên/SĐT/địa chỉ/tỉnh đã chuẩn hóa)` — **KHÔNG kèm platform** |
| Mục đích | TỰ ĐỘNG gộp nhiều đơn CÙNG SÀN thành 1 Order Group (đơn hàng, đã có từ đầu) | CHỈ dùng để LIÊN KẾT — không bao giờ tự gộp — các Order Group có thể KHÁC SÀN |
| Khi nào tính | Lúc `tryConsolidate()` xử lý 1 đơn mới | Lúc `getOrCreateGroupForOrder()` tạo Order Group MỚI (tính 1 lần, không đổi lại sau) |

Vì KHÔNG kèm platform, 1 đơn Lazada và 1 đơn AURELLE của CÙNG 1 khách (tên/SĐT/địa chỉ/tỉnh khớp sau chuẩn hóa) sẽ ra CÙNG 1 `recipient_key` — đây chính là cơ chế liên kết xuyên sàn.

### Luồng xem liên kết (không cần thao tác gì, chỉ đọc)

```
GET /order-groups/:id            → response có thêm linkedGroupCount (số nhóm khác cùng người nhận, chưa giao xong)
GET /order-groups/:id/linked     → { linkedGroups: OrderGroupResponse[] } — chi tiết đầy đủ từng nhóm đó
```

"Chưa giao xong" = `fulfillment_status` chưa tới `delivered`/`returned`/`canceled` — nhóm đã giao/hủy xong thì không còn ý nghĩa cảnh báo "lệch nhịp" nữa.

### Cảnh báo lệch nhịp lúc ship — không chặn hành động

```
POST /order-groups/:id/fulfillment/ship
→ response thêm linkedPending: [{ id, fulfillmentStatus }]
```

Nếu Shipping Coordinator ship 1 group trong khi CÒN group khác cùng người nhận CHƯA đóng gói xong (`fulfillmentStatus` chưa tới `packed`), `linkedPending` sẽ liệt kê các group đó — FE nên hiện cảnh báo dạng "Khách này còn 1 đơn khác (Lazada) đang chờ đóng gói, cân nhắc giao chung 1 chuyến?" — **KHÔNG chặn** hành động ship, chỉ là gợi ý tham khảo (đúng nguyên tắc "không tự động hóa quá tay" ở A.3, nhưng đảo ngược: ở ĐÂY hệ thống chủ động BÁO chứ không ép chờ).

### Giao chung chuyến — `POST /shipments/batch` (module mới, tách khỏi Order Group)

```
POST /shipments/batch
{ "order_group_ids": ["G1"], "note": "Giao giờ hành chính" }        ← 1 group, dùng thay ship() nếu muốn có mã vận đơn thật
{ "order_group_ids": ["G1", "G2"], "note": "..." }                  ← ≥2 group, PHẢI cùng recipient_key
```

- Mỗi group truyền vào PHẢI đang ở `packed` (chưa đóng gói xong thì chưa có gì để giao).
- Với ≥2 group: TẤT CẢ phải cùng `recipient_key` khác null — khác nhau hoặc thiếu (`null`) → 409 `SHP_RECIPIENT_MISMATCH` (an toàn, không tự đoán liên kết khi không chắc chắn).
- Thành công: mỗi group được tạo 1 `Shipment` (mã theo dõi RIÊNG `OPK-XXXXXXXXXX`), TẤT CẢ shipment tạo trong 1 lần gọi CHUNG 1 `tripCode` (`TRIP-yymmdd-XXXX`), và MỖI group tự chuyển `packed → shipped` (giống hệt hiệu ứng gọi `fulfillment/ship`, nhưng giờ có thêm bản ghi vận đơn thật + `tripCode` để 2 group biết "cùng đi 1 chuyến").
- Toàn bộ chạy trong 1 giao dịch DB — hoặc tất cả group đều chuyển trạng thái + có vận đơn, hoặc không group nào bị đổi (Rule #6).
- Đây là **lựa chọn CỘNG THÊM**, không bắt buộc — `POST .../fulfillment/ship` (Nghiệp vụ 4) vẫn dùng được bình thường cho ship đơn lẻ không cần vận đơn thật.

### Hủy nhóm tự động (N1) — không phải thao tác của FE, chỉ cần HIỂU để không hoang mang khi thấy trạng thái `canceled`

**Bối cảnh**: khách hủy đơn qua sàn (hoặc sự cố logistics: hàng thất lạc/hư hỏng), và đây là đơn DUY NHẤT trong Order Group đó (hoặc mọi đơn trong group đều rơi vào tình huống tương tự) — nếu không có cơ chế nào xử lý, nhóm đơn đó sẽ TREO MÃI ở trạng thái cũ (VD `picking`) dù thực tế không còn gì để lấy/đóng gói.

**Hành vi hệ thống**: mỗi lần đồng bộ đơn (cron polling HOẶC webhook AURELLE) phát hiện 1 đơn chuyển sang trạng thái không-fulfill-được (`canceled`, `lost`, `damaged_by_3pl`...), hệ thống TỰ KIỂM TRA — nếu **TOÀN BỘ** đơn trong Order Group đó không còn đơn nào fulfill được, VÀ nhóm **CHƯA** tới `packed`/`shipped`/`delivered` (hàng chưa đóng/giao vật lý), hệ thống **TỰ ĐỘNG** chuyển nhóm sang `canceled` — KHÔNG chờ Warehouse/Packaging Staff xác nhận (ngoại lệ có chủ đích so với nguyên tắc "1 người xác nhận" ở A.3 — rủi ro thấp vì nhóm chưa đóng gói, không có gì để "hủy nhầm" mất công sức vật lý đã bỏ ra).

Khi tự hủy, hệ thống đồng thời:
- Nhả giữ chỗ đóng gói (nếu có 1 phương án đang `pending_approval`/`approved_for_packing` chờ xử lý — đánh `isActive: false`, KHÔNG xóa, giữ lịch sử).
- Bắn Notification `group_auto_canceled` (severity `warning`) cho Store Owner, Admin, và người đang phụ trách (nếu có gán `assignedStaffId`).

**Nếu nhóm ĐÃ `packed`/`shipped`/`delivered`** khi đơn bị hủy muộn — hệ thống KHÔNG tự hủy (hàng đã đóng/giao vật lý, không thể "hủy ngầm") — trường hợp này cần xử lý qua luồng `return` thủ công (Nghiệp vụ 4) như bình thường.

FE chỉ cần: (1) hiển thị đúng badge cho `fulfillmentStatus: "canceled"` (trạng thái cuối, không còn hành động nào gọi được — `getAllowedNextStatuses` trả `[]`), (2) xử lý đúng Notification `group_auto_canceled` trong chuông thông báo (Nghiệp vụ 6).

---

# PHẦN C — SƠ ĐỒ TỔNG THỂ

## Nghiệp vụ 8 — 🆕 Vận chuyển thật, chứng từ in, hoàn hàng & nhập lại tồn (30/09/2026)

### Bối cảnh xảy ra
Đơn đóng gói xong (`packed`) cần: chọn hãng theo cước/thời gian, tạo vận đơn, in nhãn từng kiện, hẹn hãng lấy hàng; nếu hàng bị hoàn thì kho phải nhận lại, kiểm chất lượng và nhập lại tồn. Trước đây `ship` chỉ đổi trạng thái, không có cước/hãng/chứng từ.

### Luồng cho Shipping Coordinator
```
GET  /order-groups?fulfillment_status=packed          → nhóm chờ giao
GET  /shipping/quote/:groupId                         → báo giá mọi dịch vụ (theo KIỆN thật), có `recommended`
POST /shipments/batch { order_group_ids, carrier_code, service_code, pickup_at? }
                                                       → tạo vận đơn, group → shipped, ghi cước lên phương án đóng gói
GET  /documents/shipping-label/:groupId               → PDF nhãn, mỗi kiện một trang
GET  /documents/manifest/:tripCode                    → PDF bảng kê chuyến
PATCH /shipments/:id/pickup { pickup_at }             → đổi lịch hãng lấy hàng
```
Màn hình đã nối API thật: `/app/shipping/dispatch` (`fe/src/pages/ShippingDispatchPage.tsx`). Màn `/app/shipping` cũ vẫn là dữ liệu mock.

**Cách tính cước** (để FE giải thích cho người dùng): mỗi kiện lấy `max(cân thực, cân quy đổi)`, cân quy đổi = thể tích ngoài (cm³) ÷ hệ số hãng; tra bậc cước, vượt bậc cuối cộng mỗi 500 g. Tổng cước = cộng các kiện. Nhãn `isSample`/"cước mẫu" nghĩa là số tự đặt, **chưa phải cước thật của hãng**. `trackingCode` là **mã nội bộ**, chưa gọi API hãng.

### Chứng từ in
`GET /documents/packing-slip/:groupId` (phiếu đóng gói, mỗi đơn 1 trang), `shipping-label/:groupId` (cần đã có vận đơn), `manifest/:tripCode`. Trả PDF — cần Bearer nên tải bằng `fetch` → blob (xem `openDocument` trong `fe/src/api/shipping.api.ts`).

### Hoàn hàng — kho nhận lại và nhập tồn
🔄 Gộp 05/10/2026: route `POST /order-groups/:id/fulfillment/return-receive` (bản thi_dev) **đã bỏ**. Dùng luồng `/returns` (G3): `POST /returns/:id/receive` rồi `POST /returns/:id/inspect` — mỗi dòng chọn `restock` (nhập lại tồn qua sổ kho, loại `return_restock`) / `quarantine` / `discard`, kèm thu hồi thùng/vật tư đóng gói (`packaging[]`). Chi tiết: `INTEGRATION_GUIDE_SHIPPING.md`.

### Nhập lại tồn khi hủy lượt lấy hàng
`decide-partial` với `approve:false` (mở lượt lấy mới) **tự nhập lại** hàng đã quét ở lượt bị hủy vào đúng ô đã lấy (idempotent qua `restocked_at`; 🔄 gộp 05/10: theo tồn gộp SKU nội bộ nếu đã nối, ghi sổ kho loại `pick_cancel`, rồi tính lại giữ chỗ). Lần quét cũ không có `warehouse_id` (dữ liệu trước 30/09) **không tự nhập được** — hệ thống ghi log để kho đối soát tay. Giả định: nhân viên đã trả hàng về kệ.

### Mã lỗi mới
`SHIP_*` (báo giá/hãng), `SHP_PICKUP_IN_PAST`, `SHP_RECIPIENT_MISMATCH`, `SHP_CARRIER_REQUIRED`, `DOC_*` — xem `GUIDE_DOC/API_LIST.md` mục 10–10c và bảng mã lỗi.

### Giới hạn cần nói thật
Cước là bảng mẫu; chưa gọi API hãng vận chuyển thật; chưa có tracking trạng thái từ hãng; vật tư chèn vẫn là **ước lượng theo luật**; chia kiện cân bằng theo tải nhưng là heuristic, không chứng minh tối ưu.

---

## C.1. Code hiện tại — còn các giới hạn ở phần B

🔄 **ĐÃ ĐỔI (21/09/2026)** — vẽ lại theo luồng lấy hàng trước (AOFP-35).

```
   (tạo group khi sync/gộp đơn)
                    ┌─────────────────────────┐
                    │  awaiting_packaging      │◄───────────────────┐
                    └────────────┬─────────────┘                     │ decide-partial(false)
                                 │ tự động: auto-assign + chuyển      │ (lấy lại từ đầu)
                                 ▼                                    │
                    ┌─────────────────────────┐   report-missing  ┌──┴───────────────────┐
                    │  picking                 │─────────────────►│ partial_needs_review  │
                    └────────────┬─────────────┘                   └──┬───────────────────┘
                    pick-item×N → pick                                │ decide-partial(true)
                                 ▼                                    │
                    ┌─────────────────────────┐◄─────────────────────┘
                    │  picked                  │◄──────────────┐
                    └────────────┬─────────────┘                │ reject
                                 │ job tự tính kế hoạch (10 s)    │ reject / đơn bị hủy
                                 ▼                                │
                    ┌─────────────────────────┐                 │
                    │  pending_approval        │─────────────────┘
                    └────────────┬─────────────┘
                                 │ approve (trước đó có thể đổi thùng / chuyển món / tính lại)
                                 ▼
                    ┌─────────────────────────┐
                    │  approved_for_packing    │
                    └────────────┬─────────────┘
                                 │ packing-plan/pack (cân thật từng kiện)
                                 ▼
                    ┌───────────┐
                    │  packed   │
                    └─────┬─────┘
                          │ ship
                          ▼
                    ┌───────────┐  return   ┌───────────┐
                    │  shipped  │──────────►│ returned  │ (trạng thái cuối)
                    └─────┬─────┘           └───────────┘
                          │ deliver               ▲
                          ▼                        │ return
                    ┌───────────┐──────────────────┘
                    │ delivered │
                    └───────────┘
```

**4 khác biệt cốt lõi so với thiết kế ban đầu** (đọc kỹ nếu đã quen sơ đồ cũ):

1. `awaiting_packaging` giờ chỉ là trạng thái THOÁNG QUA lúc mới tạo group — auto-assign Warehouse Staff xảy ra NGAY, không cần ai Approve gì trước.
2. Khối "Đóng gói" giờ nằm SAU khối "Lấy hàng" — trước đây ngược lại. 🔄 04/10: không còn bước `generate` thủ công — vào `picked` là job tự tính; duyệt/chỉnh tay/đóng đi qua `/packing-plan`.
3. Reject quay về `picked` (không phải `awaiting_packaging`) — hàng đã lấy xong rồi. 🔄 04/10: reject chỉ còn nghĩa "xử lý ngoài hệ thống", kế hoạch `rejected` giữ lại nên job không tự tính lại; muốn quay lại hệ thống thì `recompute`.
4. 🆕 **(29/09/2026)** — MỌI trạng thái từ `awaiting_packaging` tới `approved_for_packing` (bao gồm cả `partial_needs_review`) có thêm 1 đường TỰ ĐỘNG (không do FE gọi) sang **`canceled`** (trạng thái cuối, không sơ đồ tiếp) khi mọi đơn trong nhóm không còn fulfill được — xem Nghiệp vụ 7 (N1). Từ `packed` trở đi KHÔNG có đường này.

---

## C.2. Flow mục tiêu — chưa triển khai

```text
Sync đơn/catalog sàn → Gộp nhóm lấy hàng → Tự phân công → picking
→ Quét từng SKU, không vượt số đặt; đủ theo lượt lấy hiện tại → picked
  Thiếu → partial_needs_review → tiếp tục với phần có / mở lượt lấy mới
→ Chia hàng đã lấy về TỪNG ĐƠN → Hồ sơ kho đã xác nhận
  Thiếu dữ liệu → chặn, kho bổ sung → tính lại
  Đủ dữ liệu → Tính thùng/túi mỗi đơn → Validator
    Không có phương án hợp lệ → ngoại lệ (adjust qua validator)
    Hợp lệ → pending_approval → approve/adjust (không cân) → approved_for_packing
→ Đóng từng đơn → pack nhận cân kiện thật từng đơn
  Lệch cân ước tính (hàng + bì + vật tư) → đánh dấu bất thường + thông báo
→ packed → Bàn giao vận chuyển nội bộ
```

Cân ước tính phải gồm hàng + bao bì + vật tư đúng một lần. Chưa có giá/cước phù hợp thì ghi chưa biết, không dùng 15.000 đồng/kg như cước thực. Đổi hộp phải validate và tính lại; không chấp nhận chỉ vì nhân viên nhập kích thước mới.

# PHẦN D — THAM CHIẾU KỸ THUẬT (API, lỗi, test)

## D.1. Response format — đã thống nhất camelCase (2026-09-10)

Mọi module (`order-groups`/`packing`/`packaging`/`warehouse`/`staff-assignment`/`notifications`) đều trả camelCase sạch, không lộ `_id`/`__v`. **Ngoại lệ duy nhất**: `PackableItem` (trong `picking-list`) giữ nguyên snake_case (`length_cm`...) — đây là hợp đồng interface đã bàn giao cho AI Packaging, cố ý không đổi.

## D.2. Optimistic Concurrency — kiểm tra theo từng endpoint hiện hữu

Luôn đọc `version` từ `GET /order-groups/:id` gần nhất trước khi gọi bất kỳ action ghi nào của nhóm. Sai `version` → 409 `ORD_GROUP_STATE_CONFLICT` → gọi lại GET lấy version mới, KHÔNG tự động retry.

🔄 **04/10/2026 — kế hoạch đóng gói có version RIÊNG**: mọi route `/packing-plan/*` có ghi (approve, reject, recompute, change-box, move-item, pack) gửi `expected_version` = `plan.version` từ `GET .../packing-plan` (hoặc từ `plan` vừa trả về ở thao tác trước). Sai → 409 `PACKING_VERSION_CONFLICT` → tải lại kế hoạch. Đang có lần tính khác → 409 `PACKING_PLAN_COMPUTING`. `guide` không cần version.

## D.3. Bảng mã lỗi

| `error_code`                                                                                                                                           | HTTP    | Khi nào                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ORD_GROUP_INVALID_ID`                                                                                                                                 | 400     | `:id` sai định dạng                                                                                                                                                                                          |
| `ORD_GROUP_NOT_FOUND`                                                                                                                                  | 404     | Group không tồn tại                                                                                                                                                                                          |
| `ORD_GROUP_STATE_CONFLICT`                                                                                                                             | 409     | Version không khớp                                                                                                                                                                                           |
| `ORD_GROUP_INVALID_TRANSITION`                                                                                                                         | 400     | Sai thứ tự trạng thái                                                                                                                                                                                        |
| `ORD_GROUP_INSUFFICIENT_STOCK`                                                                                                                         | 409     | pick-item không đủ hàng — gợi ý report-missing                                                                                                                                                               |
| `ORD_GROUP_ITEM_NOT_IN_GROUP`                                                                                                                          | 404     | SKU không thuộc group — 🔄 từ 19/09/2026 áp dụng thêm cho `pick-item` (trước chỉ dùng ở API item-detail)                                                                                                     |
| `ORD_GROUP_PACKAGING_PROFILE_NOT_READY` | 422 | SKU thiếu hồ sơ kho `ready`, số đo hoặc độ nhạy đã xác nhận |
| `ORD_GROUP_ALL_ORDERS_CANCELED`                                                                                                                        | 409     | **Mới (15/09/2026)** — toàn bộ đơn trong group đã bị hủy/gặp sự cố logistics (xem `INTEGRATION_GUIDE_ORDERS.md` mục 7b) — không còn gì để đóng gói/lấy hàng. Xảy ra ở `picking-list` và lúc tính kế hoạch (🔄 04/10) |
| `ORD_GROUP_NO_STAFF_AVAILABLE`                                                                                                                         | 409     | Auto-assign không có staff active                                                                                                                                                                            |
| `ORD_GROUP_STAFF_NOT_FOUND`                                                                                                                            | 404     | `staff_id` không hợp lệ                                                                                                                                                                                      |
| 🆕 `ORD_GROUP_PICK_NOT_ALLOWED` | 409 | 21/09 — quét khi group không ở `picking` |
| 🆕 `ORD_GROUP_PICK_EXCEEDS_ORDERED` | 409 | 21/09 — tổng đã quét trong lượt vượt số đặt |
| 🆕 `ORD_GROUP_PICK_INCOMPLETE` | 409 | 21/09 — bấm `pick` khi còn SKU chưa đủ (`details.missing`) |
| 🆕 `ORD_GROUP_NO_PICK_EVENTS` | 409 | 21/09 — tính kế hoạch khi lượt hiện tại chưa quét gì (🔄 04/10: hiện ở `failureReason` của kế hoạch) |
| 🆕 `PACKING_INVALID_ID` / `PACKING_PLAN_NOT_FOUND` | 400/404 | 04/10 — `groupId` sai / nhóm chưa có kế hoạch đang hoạt động |
| 🆕 `PACKING_PLAN_COMPUTING` | 409 | 04/10 — đang có lần tính khác của cùng nhóm |
| 🆕 `PACKING_WRONG_PLAN_STATUS` | 409 | 04/10 — thao tác không hợp trạng thái kế hoạch (vd duyệt kế hoạch đã `approved`, đóng kế hoạch còn `ready`) |
| 🆕 `PACKING_VERSION_CONFLICT` | 409 | 04/10 — `expected_version` lệch `plan.version` |
| 🆕 `PACKING_HAS_UNPLACED` | 409 | 04/10 — duyệt khi còn đơn chưa xếp hết món |
| 🆕 `PACKING_PARCEL_NOT_FOUND` / `PACKING_ITEM_NOT_IN_PARCEL` | 404 | 04/10 — `parcelNo`/`item_key` không có trong kế hoạch |
| 🆕 `PACKING_MOVE_ACROSS_ORDERS` | 400 | 04/10 — chuyển món sang kiện của đơn khác |
| 🆕 `PACKING_BOX_DOES_NOT_FIT` | 422 | 04/10 — đổi thùng/chuyển món mà validator không chấp nhận (`details.violations`) |
| 🆕 `PACKING_NOTE_REQUIRED` | 400 | 04/10 — lý do `OTHER` thiếu ghi chú |
| 🆕 `PACKING_PACK_WEIGHTS_MISMATCH` | 400 | 04/10 — danh sách cân không khớp đúng các kiện |
| 🆕 `PACKING_GUIDE_NOT_AVAILABLE` | 409 | 04/10 — xin hướng dẫn cho kiện không xếp được |
| 🆕 `PM_ZIP_BAG_NOT_FOUND` | 422 | 21/09 — hồ sơ SKU chọn túi zip không có/ngừng dùng |
| 🆕 `PM_FOLD_NOT_ALLOWED` | 422 | 22/09 — bật "có thể gập đôi" cho giày (hộp cứng) |
| 🆕 `PKG_BAG_NOT_FOUND` / `PKG_BAG_CODE_IN_USE` / `PKG_INVALID_BAG_ID` | 404/409/400 | 21/09 — danh mục túi zip |
| 🆕 `PKG_BOX_NOT_FOUND` / `PKG_BOX_CODE_IN_USE` / `PKG_BOX_INVALID_DIMENSIONS` / `PKG_INVALID_BOX_ID` | 404/409/400/400 | 21/09 — danh mục thùng |
| 🆕 `PKG_BOX_OUT_OF_STOCK` | 409 | 22/09 — đổi thùng sang thùng không còn trống, hoặc `pack` khi kho đã hết thùng đó |
| 🆕 `PM_INVALID_ID` / `PM_NOT_FOUND` | 400/404 | 21/09 — hồ sơ SKU |
| `WH_WAREHOUSE_NOT_FOUND` / `WH_ZONE_NOT_FOUND` / `WH_INVALID_BIN_RANGE` / `WH_WAREHOUSE_CODE_IN_USE` / `WH_ZONE_CODE_IN_USE` (2 mã cuối 🆕 19/09/2026) | —       | Xem chi tiết Nghiệp vụ 2b (Warehouse Setup)                                                                                                                                                                  |
| 🆕 `WH_INVALID_GROUP_IDS`                                                                                                                              | 400     | 29/09/2026 — `GET /warehouse/:warehouseId/picking-list?group_ids=` rỗng hoặc có phần tử không phải ObjectId hợp lệ                                                                                          |
| 🆕 `SHP_EMPTY_GROUP_LIST` / `SHP_GROUP_NOT_PACKED` / `SHP_RECIPIENT_MISMATCH` / `SHP_GROUP_ALREADY_SHIPPED`                                            | 400/409 | 29/09/2026 — module `shipments/`, xem Nghiệp vụ 7                                                                                                                                                            |
| `NOTI_INVALID_ID` / `NOTI_NOT_FOUND`                                                                                                                   | 400/404 | Module notifications                                                                                                                                                                                         |
| 🆕 `PACKING_SCAN_WRONG_PARCEL` / `PACKING_SCAN_OVER` / `PACKING_SCAN_NOT_IN_PLAN` / `PACKING_SCAN_NOT_FOUND` | 409/409/404/404 | 05/10 — quét món vào kiện (Nghiệp vụ 1b) |
| 🆕 `PACKING_PARCEL_WRONG_STATUS` / `PACKING_PARCEL_NOT_FULLY_SCANNED` / `PACKING_NOT_COMPLETE` | 409 | 05/10 — thao tác không hợp trạng thái kiện, niêm phong khi chưa quét đủ, hoàn tất khi còn kiện chưa xong |
| 🆕 `PACKING_SELF_REVIEW_FORBIDDEN` / `PACKING_WEIGHT_REQUIRED` | 403/400 | 05/10 — tự chấp nhận kiện mình niêm phong; cân lại thiếu `weight_kg` |
| 🆕 `PACKING_SCAN_REQUIRED` / `PACKING_PARCEL_LIMIT_EXCEEDED` / `PACKING_SETTINGS_CONFLICT` | 409/422/409 | 05/10 — cài đặt bắt buộc quét; vượt số kiện tối đa khi duyệt; lưu cài đặt trùng version |
| 🆕 `PACKING_ISSUE_HAS_SEALED_PARCELS` / `PACKING_REPLACEMENT_WAREHOUSE_REQUIRED` | 409/400 | 05/10 — sự cố lúc đóng |
| 🆕 `PACKING_PACKER_INVALID` / `PACKING_NO_PACKER_AVAILABLE` / `PACKING_INVALID_DATE_RANGE` | 422/409/400 | 05/10 — giao người đóng; báo cáo |
| 🆕 `SHP_PARCELS_TO_UNPACK` / `ORD_GROUP_STAFF_WRONG_ROLE` | 409/422 | 05/10 — còn kiện phải tháo khi giao; gán tay lấy hàng cho người không phải Warehouse Staff |
| 🆕 `PACKING_RECOVER_MATERIAL_INVALID` / `PKG_MATERIAL_NOT_REUSABLE` | 400/400 | 05/10 tối — thu hồi vật tư chèn không có trong kiện/vượt số; vật tư chưa bật `reusable` |

## D.4. Checklist test bắt buộc cho FE — theo từng nghiệp vụ

Các mục dưới đây kiểm tra route/flow legacy đang có trong code. Checklist nghiệm thu flow mục tiêu nằm ở D.6.

- [ ] 🔄 **Nghiệp vụ 1** (04/10): nhóm vừa `picked` → trong ~10 s `GET .../packing-plan` có kế hoạch `ready`, nhóm `pending_approval`, Packaging Staff nhận thông báo `pending_approval`
- [ ] 🔄 **Nghiệp vụ 1**: đơn ≤ 12 món → `cpSatPending: true` lúc đầu, vài giây sau `false` và `proof` không tệ hơn ban đầu
- [ ] 🔄 **Nghiệp vụ 1**: `change-box` sang thùng quá nhỏ → 422 `PACKING_BOX_DOES_NOT_FIT`, kế hoạch không đổi; sang thùng hợp lệ → `version` tăng, `adjustments[]` có 1 dòng
- [ ] 🔄 **Nghiệp vụ 1**: `move-item` sang kiện của đơn khác → 400 `PACKING_MOVE_ACROSS_ORDERS`; bỏ trống `to_parcel_no` → có thêm 1 kiện
- [ ] 🔄 **Nghiệp vụ 1**: gửi `expected_version` cũ → 409 `PACKING_VERSION_CONFLICT`
- [ ] 🔄 **Nghiệp vụ 1**: `reject` → kế hoạch `rejected`, nhóm `picked`, job KHÔNG tự tính lại; `recompute` → kế hoạch mới `ready`
- [ ] 🔄 **Nghiệp vụ 4**: `pack` thiếu 1 kiện → 400 `PACKING_PACK_WEIGHTS_MISMATCH`; cân lệch > 20% → `parcels[i].isAbnormal: true`; đủ kiện → trừ đúng số thùng (sổ `/packaging/boxes/:id/movements`)
- [ ] 🆕 **Nghiệp vụ 1b** (05/10): kế hoạch vừa `ready` → `session.assignedPackerId` có giá trị (nếu có Packaging Staff), người đó nhận `packing_assigned`
- [ ] 🆕 **Nghiệp vụ 1b**: quét món của kiện 2 vào kiện 1 → 409 `PACKING_SCAN_WRONG_PARCEL` có `belongsToParcels`; quét quá số món → 409 `PACKING_SCAN_OVER`; gửi lại cùng `client_event_id` → `duplicate: true`, `scannedCount` không đổi
- [ ] 🆕 **Nghiệp vụ 1b**: `seal` khi chưa quét đủ → 409 `PACKING_PARCEL_NOT_FULLY_SCANNED` có `missing[]`; niêm phong đủ mọi kiện → `completed: true`, nhóm `packed`, `session.packMode = "scan"`
- [ ] 🆕 **Nghiệp vụ 1b**: cân lệch > ngưỡng → kiện `held`, nhóm vẫn `approved_for_packing`; cùng người `accept` → 403; người khác `accept` → hoàn tất
- [ ] 🆕 **Nghiệp vụ 1b**: `review reopen` rồi `seal` lại → sổ `/packaging/boxes/:id/movements` chỉ có 1 dòng xuất cho kiện đó
- [ ] 🆕 **Nghiệp vụ 1b**: `report-issue replace` → món đó phải quét lại; `back_to_picking` khi đã niêm phong 1 kiện → 409 `PACKING_ISSUE_HAS_SEALED_PARCELS`
- [ ] 🆕 **Nghiệp vụ 1b**: hủy 1 đơn (sync) khi kế hoạch `packing` → kiện của đơn `to_unpack`, các kiện khác giữ nguyên; tạo vận đơn → 409 `SHP_PARCELS_TO_UNPACK`; `unpack` → kiện `voided`, tồn ô tăng lại
- [ ] 🆕 **Nghiệp vụ 1b** (05/10 tối): nhóm 2 đơn đã `picked`, hủy 1 đơn (sync) → tồn các ô đã lấy hàng của đơn đó tăng lại, sổ kho có dòng `cancel_return`, Warehouse Staff nhận `return_to_shelf` có mã ô; kế hoạch tính lại chỉ còn đơn kia
- [ ] 🆕 **Nghiệp vụ 1b** (05/10 tối): `unpack` với `recovered_materials` 3/4 góc xốp → kho tái sử dụng của vật tư tăng 3; gửi 5 → 400 `PACKING_RECOVER_MATERIAL_INVALID`
- [ ] 🆕 **Nghiệp vụ 1b**: `PUT /packing/settings {require_scan: true}` → `pack` trả 409 `PACKING_SCAN_REQUIRED`; `GET /packing/reports/summary` có số liệu sau khi đóng vài nhóm
- [ ] 🔄 **Nghiệp vụ 2**: ngay khi group được tạo → `assignedStaffId` đã có giá trị và group ở `picking`
- [ ] **Nghiệp vụ 3**: `pick-item` vượt tồn kho → 409, UI gợi ý report-missing
- [ ] **Nghiệp vụ 3**: `report-missing` → thử gọi `pick` trực tiếp → phải bị chặn
- [ ] **Nghiệp vụ 3**: `decide-partial(false)` → về `picking` (lượt mới, 🔄 30/09); lấy lại lượt mới không bị cộng số của lượt cũ
- [ ] 🆕 **Nghiệp vụ 3**: `pick` khi chưa quét đủ → 409 `ORD_GROUP_PICK_INCOMPLETE`; quét dư → 409 `ORD_GROUP_PICK_EXCEEDS_ORDERED`
- [ ] 🆕 **Nghiệp vụ 3** (01/10/2026): nhóm 2 đơn có 1 đơn `canceled` → `GET /order-groups` trả `activeOrderCount: 1`, `canceledOrderCount: 1`, nhãn "Một phần đã hủy"; nhóm hủy hết → `activeOrderCount: 0`, không hiện trong "Cần lấy"
- [ ] 🔄 **Nghiệp vụ 4** (gộp 05/10/2026): cầu dao tắt → `POST .../packing-plan/pack` trả `lazadaPackSync.status = "disabled"`, Seller Center không đổi; nhóm hủy hết → 409 `ORD_GROUP_ALL_ORDERS_CANCELED`; `lazada-pack/retry` khi nhóm chưa `packed` → 409 `ORD_GROUP_LAZADA_PACK_NOT_ALLOWED`
- [ ] 🆕 **Nghiệp vụ 3** (gộp 05/10/2026): `decide-partial(false)` → sổ kho có dòng `pick_cancel` trả đúng ô đã quét; giữ chỗ tồn của nhóm được tính lại
- [ ] **Nghiệp vụ 5**: `PATCH .../priority` express → `packagingDeadline` hợp lý (không null, đúng khoảng giờ làm việc)
- [ ] **Nghiệp vụ 6**: sau `report-missing` → `unread-count` của Store Owner tăng lên
- [ ] 🆕 **Nghiệp vụ 6**: kế hoạch tự tính xong → `unread-count` của Packaging Staff tăng; sau `packing-plan/reject` → `unread-count` của Admin tăng
- [ ] 🆕 **Nghiệp vụ 7** (mới 29/09/2026): tạo 2 đơn cùng người nhận nhưng KHÁC sàn (1 Lazada + 1 AURELLE) → `GET /order-groups/:id` của mỗi bên phải có `linkedGroupCount: 1`, `GET .../linked` phải thấy nhau
- [ ] 🆕 **Nghiệp vụ 7**: `POST /shipments/batch` với 2 group KHÁC `recipient_key` → 409 `SHP_RECIPIENT_MISMATCH`, không group nào bị đổi trạng thái
- [ ] 🆕 **Nghiệp vụ 7**: đưa 1 group về `picking`, cho toàn bộ đơn bên trong về `canceled` (qua sync/webhook) → group tự chuyển `canceled`, nhận được Notification `group_auto_canceled`

## D.5. Checklist FE trước khi bắt đầu code

- [ ] Đã đọc PHẦN A — hiểu 6 câu hỏi nghiệp vụ hệ thống trả lời, không chỉ học thuộc endpoint
- [ ] Đã hiểu rõ SƠ ĐỒ TỔNG THỂ (Phần C) — biết chính xác nút nào bấm được ở trạng thái nào
- [ ] Đã implement đầy đủ nhánh `partial_needs_review`, không chỉ happy path
- [ ] Đã tích hợp polling `unread-count`
- [ ] Đã đối chiếu `API_LIST.md` đúng role cho từng màn hình đang build
- [ ] 🔄 **ĐÃ ĐỔI (19/09)** — Warehouse Staff giờ gọi được `GET /warehouse/warehouses` (trước chỉ Admin) — màn hình Warehouse Staff nên tự lấy `warehouse_id` từ đây, không hardcode tay
- [ ] 🔄 **ĐÃ ĐỔI (19/09)** — `pick-item` có thể trả `ORD_GROUP_ITEM_NOT_IN_GROUP` (404) khi quét nhầm SKU — FE cần bắt riêng, khác với lỗi hết hàng (`ORD_GROUP_INSUFFICIENT_STOCK`)
- [ ] 🆕 **MỚI (16/09)** — Đã xử lý 2 loại Notification mới (`cancel_confirmation_required`, `sync_failed`) trong UI chuông thông báo (Nghiệp vụ 6)
- [ ] 🔄 **ĐÃ ĐỔI (16/09)** — Đã biết `PATCH /notifications/:id/read` trả 404 nếu gọi nhầm ID không thuộc về mình (không phải bug khi test chéo role)
- [ ] 🆕 **MỚI (29/09)** — Đã hiểu `canceled` là trạng thái TỰ ĐỘNG (không có nút bấm nào tạo ra nó) — không cần build UI cho hành động "hủy nhóm", chỉ cần hiển thị đúng badge khi gặp trạng thái này
- [ ] 🆕 **MỚI (29/09)** — Đã cân nhắc hiện `linkedGroupCount`/cảnh báo `linkedPending` ở màn chi tiết Order Group và màn ship (Nghiệp vụ 7) — không bắt buộc build ngay `POST /shipments/batch` nếu chưa cần giao chung chuyến, nhưng nên hiểu để không bỏ sót khi FE sau này cần

## D.6. Nghiệm thu flow mục tiêu (BE-1 → BE-5)

Áo trong zip dùng số đo gói áo; giày giữ hộp gốc; trang sức thiếu quy cách chống sốc bị chặn; canceled không vào tập hàng. Thiếu số đo không được mặc định; quá cỡ không trả hộp giả. Quét sai/quá lượng bị server chặn; retry cạnh tranh không trừ trùng. Partial phải xử lý lại tập hàng; chọn kế hoạch không bắt cân, pack mới cân/đo kiện. Recommendation stale/legacy chưa được xác minh không tự đi tiếp.
