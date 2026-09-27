# Nhận xét phản biện — Bộ tài liệu thiết kế AI 3D Packaging

**Người soát xét:** Backend team (Nguyễn Phương Mỹ Thuận, chủ trì backend Fulfillment).
**Tài liệu được soát xét:** `AI_3D_PACKAGING_OPTIMIZATION.md`, `BE_PACKAGING_IMPLEMENTATION_ROADMAP.md`, `GIAI_THICH_THUAT_TOAN_3D_PACKAGING.md` (biên soạn 08–11/09/2026).
**Ngày soát xét:** 12/09/2026. **Phạm vi soát xét:** đối chiếu trực tiếp với mã nguồn backend thật (nhánh hiện hành), không suy luận từ tài liệu khác.

Tài liệu phản biện này không phủ nhận giá trị của bản thiết kế được soát xét. Ba tài liệu thể hiện tư duy kỹ thuật nghiêm túc — đặc biệt nguyên tắc tách Validator độc lập khỏi thuật toán tìm kiếm, phân biệt rõ `no_solution_found` với chứng minh vô nghiệm, và thái độ không tuyên bố tối ưu toàn cục khi chưa chứng minh. Đây là các nguyên tắc kỹ thuật đúng đắn và cần được **giữ nguyên** trong bản sửa. Phản biện dưới đây tập trung vào một nhóm vấn đề hẹp nhưng có ảnh hưởng cấu trúc: **độ lệch giữa giả định về hiện trạng hệ thống trong tài liệu và hiện trạng thật của mã nguồn tại thời điểm soát xét**, cùng hệ quả của độ lệch đó lên tính khả thi của roadmap đề xuất.

---

## Mục lục

1. [Phương pháp soát xét](#phuong-phap)
2. [Nhận xét 1 — Giả định "chưa có module packaging" không còn đúng](#nhan-xet-1)
3. [Nhận xét 2 — Thuật toán nền hiện tại không phải 3D bin packing hình học](#nhan-xet-2)
4. [Nhận xét 3 — Đơn vị dữ liệu `item_key` không tương thích ngược với hợp đồng interface đang vận hành](#nhan-xet-3)
5. [Nhận xét 4 — Catalog "hồ sơ đóng gói SKU" đề xuất trùng lặp một phần với `ProductMaster`](#nhan-xet-4)
6. [Nhận xét 5 — Quy mô roadmap (M0–M8) vượt khung thời gian khả dụng](#nhan-xet-5)
7. [Nhận xét 6 — Một tiền đề về hạ tầng MongoDB không còn là rủi ro mở](#nhan-xet-6)
8. [Nhận xét 7 — Không gian giải pháp thư viện ngoài chưa được khảo sát đầy đủ](#nhan-xet-7)
9. [Bảng tổng hợp khuyến nghị sửa theo từng file](#bang-tong-hop)
10. [Kết luận](#ket-luan)

<a id="phuong-phap"></a>

## 1. Phương pháp soát xét

Mỗi nhận xét dưới đây tuân theo cùng một cấu trúc bốn phần để đảm bảo có thể kiểm chứng độc lập, tránh nhận định cảm tính:

- **Khẳng định trong tài liệu gốc** — trích dẫn nguyên văn hoặc diễn giải sát nghĩa, kèm vị trí (mục, file).
- **Bằng chứng đối chiếu** — trích đường dẫn file mã nguồn thật và, khi cần, đoạn code liên quan.
- **Khoảng cách và hệ quả** — điều gì sẽ xảy ra nếu đội ngũ triển khai tin theo tài liệu gốc mà không đối chiếu lại.
- **Khuyến nghị sửa** — hành động cụ thể, không mơ hồ.

Toàn bộ mã nguồn trích dẫn lấy từ nhánh backend đang chạy tại thời điểm soát xét (module `packaging/`, `order-groups/`, `product-master/`, `common/interfaces/packaging.interface.ts`).

<a id="nhan-xet-1"></a>

## 2. Nhận xét 1 — Giả định "chưa có module packaging" không còn đúng

**Khẳng định trong tài liệu gốc.** Mục 1.1 của `AI_3D_PACKAGING_OPTIMIZATION.md`, hàng "Module packaging, catalog thùng và engine" ghi: *"Không có module tương ứng trong cây `be/src/modules` đã kiểm tra."* Trên cơ sở đó, `BE_PACKAGING_IMPLEMENTATION_ROADMAP.md` mục 6.1 đề xuất tạo mới toàn bộ cấu trúc `be/src/modules/packaging/` với các thư mục con `domain/`, `engine/`, `workers/`, `services/`, `schemas/`, `dto/` — không đề cập khả năng thư mục này đã tồn tại dưới một cấu trúc khác.

**Bằng chứng đối chiếu.** Thư mục `be/src/modules/packaging/` tại thời điểm soát xét chứa chín file đang hoạt động:

```
packaging.controller.ts        — 5 route: GET :groupId/packaging, POST generate/approve/adjust/reject
packaging.service.ts           — sử dụng session.withTransaction() thật cho approve/adjust
packaging.errors.ts
packaging.module.ts
schemas/packaging-recommendation.schema.ts
enums/packaging-approval-status.enum.ts
utils/fallback-packaging.util.ts
dto/approve-packaging.dto.ts, adjust-packaging.dto.ts, reject-packaging.dto.ts
```

Schema `PackagingRecommendationDoc` (file `schemas/packaging-recommendation.schema.ts`) đã định nghĩa đầy đủ collection `packaging_recommendations` với index unique có điều kiện (`{ order_group_id: 1 }`, `partialFilterExpression: { is_active: true }`), field `is_abnormal` tự động đánh dấu khi cân thật lệch quá 20% so với ước tính, và cơ chế giữ lịch sử các lần bị từ chối (`is_active: false` thay vì xóa cứng). `packaging.service.ts` đã tích hợp với `StaffAssignmentService` — mỗi lần `approve`/`adjust` thành công sẽ tự động kích hoạt phân công nhân viên kho theo thuật toán "ít việc nhất", và với `NotificationsService` — sự kiện `is_abnormal` sinh ra thông báo tới Store Owner.

**Khoảng cách và hệ quả.** Nếu triển khai mốc M0–M4 của roadmap theo đúng văn bản, kết quả là một schema `PackagingRecommendation` thứ hai, một cấu trúc thư mục con song song, và một API bề mặt (`POST /packaging/recommend`, `GET /packaging/recommendations/:id`) không tương thích với API đang tồn tại (`POST /order-groups/:groupId/packaging/generate`, `GET /order-groups/:groupId/packaging`). Hai hệ quả trực tiếp: (a) mất tác dụng của toàn bộ phần tích hợp Staff Assignment và Notifications đã gắn vào luồng cũ, vì luồng mới không đi qua cùng một điểm gọi; (b) FE đã tích hợp theo tài liệu `INTEGRATION_GUIDE_FULFILLMENT.md` (route, response shape hiện tại) sẽ phải viết lại toàn bộ phần packaging nếu route đổi.

**Khuyến nghị sửa.** Thay mục 1.1 (bảng hiện trạng) bằng bảng đối chiếu mới, liệt kê chín file đang tồn tại và vai trò từng file. Toàn bộ roadmap M0–M4 cần được viết lại theo khung "cải tiến thuật toán bên trong `fallback-packaging.util.ts`", không phải "xây mới toàn bộ module". Cụ thể: giữ nguyên route, DTO, schema `PackagingRecommendationDoc` và điểm tích hợp Staff Assignment/Notifications; phạm vi thay đổi chỉ giới hạn ở nội dung hàm `computeFallbackPackaging()` (xem Nhận xét 2) và các bảng catalog mới cần bổ sung (xem Nhận xét 4).

<a id="nhan-xet-2"></a>

## 3. Nhận xét 2 — Thuật toán nền hiện tại không phải 3D bin packing hình học

**Khẳng định ngầm định trong tài liệu gốc.** Cả ba tài liệu mô tả bài toán như một bài toán xếp hình học thật sự: hệ tọa độ `(x, y, z)`, kiểm tra chồng lấn bằng AABB, sinh điểm đặt ứng viên từ các mặt khối đã xếp, kiểm tra hướng xoay hợp lệ. `GIAI_THICH_THUAT_TOAN_3D_PACKAGING.md` mục 4–7 trình bày chi tiết thuật toán này như thể nó là phần đang hoặc sắp được cải tiến từ một baseline hình học đã có.

**Bằng chứng đối chiếu.** Nội dung đầy đủ của `computeFallbackPackaging()` (file `utils/fallback-packaging.util.ts`) thực hiện đúng bốn bước sau, không có bước nào liên quan đến tọa độ:

```ts
const totalVolumeCm3 = input.reduce(
  (sum, item) => sum + item.length_cm * item.width_cm * item.height_cm * item.quantity, 0,
);
const volumeWithPadding = totalVolumeCm3 * (1 + SAFETY_PADDING_FACTOR); // +10%
const chosenBox = STANDARD_BOX_SIZES.find((box) => box.max_volume_cm3 >= volumeWithPadding)
  ?? largestBox;
```

Thuật toán hiện tại là **so sánh tổng thể tích cộng dồn với dung tích ba loại thùng cố định** (`Small Box`, `Medium Box`, `Large Box`, kích thước hard-code), không tính vị trí đặt từng item, không kiểm tra chồng lấn hình học, không có khái niệm hướng xoay. Đây là một heuristic ước lượng dung lượng (capacity estimation), không phải bài toán 3D bin packing theo định nghĩa mà chính tài liệu 3 đưa ra ở mục 2 ("Placement gồm tọa độ góc nhỏ nhất, kích thước sau xoay và hướng đặt").

**Khoảng cách và hệ quả.** Đây là khoảng cách quan trọng nhất trong toàn bộ đợt soát xét, vì nó ảnh hưởng trực tiếp đến tính hợp lệ học thuật của đồ án. Tên đề tài đăng ký có cụm "Packaging Optimization" và phần thiết kế (Report 1) mô tả rõ UC-03/UC-04 dùng "3D bin packing". Nếu bảo vệ đồ án với minh chứng là `computeFallbackPackaging()` như hiện tại, hội đồng có thể hỏi trực tiếp: tọa độ đặt từng item ở đâu? Câu trả lời trung thực là: chưa có — thuật toán hiện hành chỉ chọn cỡ thùng theo tổng thể tích, không sinh placement. Ba tài liệu được soát xét, nếu triển khai đúng như thiết kế (đặc biệt M2–M3 của roadmap: validator hình học + greedy sinh điểm đặt), sẽ **lấp đúng khoảng trống học thuật này** — đây là lý do phải ưu tiên triển khai chứ không phải lý do để hoãn.

**Khuyến nghị sửa.** Thêm vào đầu `GIAI_THICH_THUAT_TOAN_3D_PACKAGING.md` một mục mới, đặt trước mục 1, tên đề xuất "Khoảng cách với baseline hiện tại": nêu rõ nguyên văn đoạn code `computeFallbackPackaging()` ở trên, khẳng định minh bạch rằng đây là heuristic dung lượng, không phải placement hình học, và định vị toàn bộ tài liệu là **kế hoạch nâng cấp thay thế phần lõi thuật toán**, không phải "giải thích thêm cho baseline đã có tọa độ". Điều này giúp người đọc — kể cả hội đồng phản biện đồ án — hiểu đúng ngay từ đầu tài liệu đang mô tả cái gì sẽ có, không phải cái đã có.

<a id="nhan-xet-3"></a>

## 4. Nhận xét 3 — Đơn vị dữ liệu `item_key` không tương thích ngược với hợp đồng interface đang vận hành

**Khẳng định trong tài liệu gốc.** Mục 4.1 của `AI_3D_PACKAGING_OPTIMIZATION.md`: *"Mỗi item đưa vào engine có `item_key` duy nhất... Nếu về sau một nguồn lưu `quantity > 1`, tạo từng instance có chỉ số đơn vị; không nhân bản ID rồi gây trùng."* `BE_PACKAGING_IMPLEMENTATION_ROADMAP.md` mục 3.1 lặp lại yêu cầu này trong định nghĩa type `PackingItem`.

**Bằng chứng đối chiếu.** Hợp đồng interface hiện hành, file `common/interfaces/packaging.interface.ts`, được chú thích rõ là *"hợp đồng CỐ ĐỊNH giữa Product Master/Order Groups và thuật toán AI Packaging — cả 2 phía cùng import"*:

```ts
export interface PackableItem {
  sku: string;
  quantity: number;   // SỐ LƯỢNG GỘP, không phải danh sách instance
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_kg: number;
  is_fragile: boolean;
}
```

Phương thức sinh dữ liệu này, `OrderGroupsService.getPackableItemsForGroup()`, gọi hàm `aggregateOrderItems()` để **gộp toàn bộ item cùng SKU trong nhóm đơn thành một dòng duy nhất** trước khi trả về — hai áo cùng mã sản phẩm trong cùng đơn xuất hiện dưới dạng một `PackableItem` với `quantity: 2`, không phải hai object riêng biệt có `item_key` khác nhau.

**Khoảng cách và hệ quả.** Nếu áp dụng mô hình `item_key` theo instance như tài liệu đề xuất mà không sửa `PackableItem`, engine mới sẽ nhận input sai định dạng ngay từ bước đầu — không biết hai áo cùng SKU là hai vật thể vật lý cần đặt riêng hay là một dòng số lượng gộp. `PackableItem` hiện đang được **dùng chung** cho cả module `packaging/` lẫn `warehouse/` (endpoint picking-list) — sửa đổi cấu trúc này là thay đổi phá vỡ khả năng tương thích ngược (breaking change) ảnh hưởng đến ít nhất hai module đang hoạt động, không phải một thay đổi cục bộ trong phạm vi AI Packaging.

**Khuyến nghị sửa.** Bổ sung vào mục 4.1 (`AI_3D_PACKAGING_OPTIMIZATION.md`) một đoạn "Ràng buộc tương thích ngược": xác nhận rõ liệu việc chuyển từ `quantity` gộp sang `item_key` theo instance có bắt buộc cho M0–M4 hay có thể hoãn đến M5+. Đề xuất cụ thể cho MVP: **giữ nguyên `PackableItem.quantity` ở tầng interface trao đổi giữa các module**, và chỉ thực hiện việc "mở rộng thành từng instance có chỉ số đơn vị" ở **bên trong** engine mới (lớp `normalize` nhận `PackableItem[]`, tự sinh `item_key` dạng `${sku}-${index}` cho mục đích tính toán nội bộ, không đổi hợp đồng interface công khai). Cách này giữ được đúng yêu cầu kỹ thuật của tài liệu (mỗi instance có định danh riêng khi xếp) mà không phá vỡ hợp đồng đang chia sẻ với `warehouse/`.

<a id="nhan-xet-4"></a>

## 5. Nhận xét 4 — Catalog "hồ sơ đóng gói SKU" đề xuất trùng lặp một phần với `ProductMaster`

**Khẳng định trong tài liệu gốc.** Mục 4.1 của `AI_3D_PACKAGING_OPTIMIZATION.md` đề xuất một catalog mới, ánh xạ `(platform, shop_id, sku, variation)` tới "hồ sơ nội bộ" chứa kích thước sau gấp/bọc, khối lượng, hướng, độ nhạy, công thức bọc và độ tin cậy dữ liệu.

**Bằng chứng đối chiếu.** Collection `product_master` (file `modules/product-master/schemas/product-master.schema.ts`) đã tồn tại và có cấu trúc:

```ts
export class ProductMaster {
  platform: MarketplacePlatform;   // enum 3 giá trị
  shop_id: string;
  seller_sku: string;
  package_dimension: PackageDimensionSchema;   // length_cm/width_cm/height_cm/weight_kg
  is_fragile: boolean;
  // ...
}
```

D�� liệu được đồng bộ tự động từ Lazada `GetProducts` (cron định kỳ), không cần Admin nhập tay từng SKU.

**Khoảng cách và hệ quả.** Đây không phải trường hợp trùng lặp hoàn toàn — `ProductMaster` lưu kích thước sản phẩm gốc lấy từ sàn (gần với "kích thước trải phẳng" mà tài liệu 3 mục 1.1 khuyến cáo KHÔNG dùng để xếp hình cho hàng thời trang), trong khi tài liệu đề xuất kích thước **sau khi gấp/bọc theo một quy trình đã xác minh** — hai loại số đo khác nhau về bản chất, đúng như tài liệu đã phân tích kỹ ở mục "Hồ sơ đóng gói sản phẩm". Tuy vậy, tài liệu hiện tại không nhắc đến `ProductMaster` dù chỉ một lần trong toàn bộ 1556 dòng, khiến người đọc — đặc biệt người chưa quen toàn bộ codebase — dễ hiểu nhầm rằng cần xây một catalog SKU hoàn toàn từ đầu, bỏ qua phần đã có.

**Khuyến nghị sửa.** Bổ sung vào mục 4.1 một đoạn làm rõ quan hệ hai chiều: `ProductMaster` là **nguồn kích thước gốc/nền** (đồng bộ tự động, không cần đo tay); catalog "hồ sơ gấp/bọc" (`packing_profile`) mới là **lớp phủ tùy chọn**, chỉ áp dụng cho SKU thuộc ngành hàng cần biến đổi hình dạng trước khi đóng gói (quần áo, giày, phụ kiện có hộp — đúng ngành hàng thật của shop demo, xem CLAUDE.md). Với SKU chưa có hồ sơ `packing_profile`, engine dùng thẳng kích thước `ProductMaster` làm giá trị mặc định, không chặn cứng luồng — nhất quán với nguyên tắc "chỉ thiếu quy cách túi thì nhánh túi `not_evaluated`, nhánh thùng vẫn xét" mà chính tài liệu 2 mục 6.5 đã đề ra cho trường hợp tương tự.

<a id="nhan-xet-5"></a>

## 6. Nhận xét 5 — Quy mô roadmap (M0–M8) vượt khung thời gian khả dụng

**Khẳng định trong tài liệu gốc.** `BE_PACKAGING_IMPLEMENTATION_ROADMAP.md` mục 2 đặt ra chín mốc (M0 đến M8) và mục 10.1 chia thành mười hai nhãn PR (BE-P01 đến BE-P12), bao gồm hạ tầng worker thread, cơ chế transaction cấp production với idempotency key, và ranker học máy (M8).

**Bằng chứng đối chiếu.** Tài liệu tự nhận thức được rủi ro này — nguyên văn cuối mục 2: *"Không đặt lịch cố định khi chưa biết năng lực nhóm và tình trạng dữ liệu"*. Đối chiếu với `CLAUDE.md` mục "ROADMAP TỔNG HỢP", phần backend fulfillment còn tối thiểu bốn hạng mục Tầng 2 chưa hoàn thành (tổng quát hóa đa sàn, API Shipping Coordinator, cấu hình Store Owner, Dashboard Package 5) song song với việc AI Packaging cần triển khai.

**Khoảng cách và hệ quả.** Nếu coi M0–M8 là điều kiện đầy đủ để "hoàn tất backend đầu tiên" (theo cách mục 10.3 của roadmap diễn đạt), nhóm sẽ phân bổ effort không cân đối, có nguy cơ các phần khác của hệ thống (đã có tiến độ tốt, gần sẵn sàng demo) bị bỏ dở để chạy theo một roadmap dài hạn của riêng một module.

**Khuyến nghị sửa.** Sửa bảng mục 2: thêm cột "Bắt buộc cho demo capstone" đánh dấu M0–M4 là *có*, M5–M8 là *không, để trong phần "hướng phát triển"*. Diễn đạt lại câu kết mục 2 (hiện đang mơ hồ giữa gợi ý và yêu cầu) thành khẳng định rõ: M4 là điều kiện đủ để có một demo AI Packaging chạy thật, M5 trở đi là công việc mở rộng sau bảo vệ đồ án nếu còn thời gian.

<a id="nhan-xet-6"></a>

## 7. Nhận xét 6 — Một tiền đề về hạ tầng MongoDB không còn là rủi ro mở

**Khẳng định trong tài liệu gốc.** Mục 7.3 của `AI_3D_PACKAGING_OPTIMIZATION.md`: *"[Docker Compose hiện tại] chưa khai cấu hình replica set; môi trường Mongo phục vụ transaction cần được chuẩn bị trước."*

**Bằng chứng đối chiếu.** Hệ thống dùng MongoDB Atlas (cloud) cho toàn bộ môi trường, không dùng MongoDB qua Docker Compose (Docker Compose trong dự án chỉ phục vụ Mongo Express, một giao diện quản trị phụ, không phải database chính). MongoDB Atlas mặc định luôn là replica set. Bằng chứng vận hành thật: `packaging.service.ts` đã gọi `this.connection.startSession()` và `session.withTransaction()` thành công trong luồng `approve`/`adjust` từ trước thời điểm ba tài liệu này được biên soạn.

**Khoảng cách và hệ quả.** Rủi ro thấp về mặt kỹ thuật (không dẫn đến lỗi nếu bỏ qua), nhưng có thể khiến người đọc dành thời gian "chuẩn bị hạ tầng" cho một vấn đề đã được giải quyết, hoặc — nghiêm trọng hơn — ngần ngại dùng transaction cho code mới (M6 — xác nhận và phản hồi) vì tưởng nhầm môi trường chưa sẵn sàng, trong khi M6 chính là mốc cần transaction nhất.

**Khuyến nghị sửa.** Sửa mục 7.3: thay đoạn trích dẫn Docker Compose bằng ghi chú "Môi trường chạy MongoDB Atlas (replica set mặc định); transaction đã được xác nhận hoạt động trong `packaging.service.ts` hiện hành — dùng cùng pattern `session.withTransaction()` cho M6, không cần chuẩn bị hạ tầng bổ sung."

<a id="nhan-xet-7"></a>

## 8. Nhận xét 7 — Không gian giải pháp thư viện ngoài chưa được khảo sát đầy đủ

**Khẳng định trong tài liệu gốc.** Mục 6.1 của `AI_3D_PACKAGING_OPTIMIZATION.md` chỉ nêu một kho mã tham khảo (`skjolber/3d-bin-container-packing`, viết bằng Java, không dùng trực tiếp được trong NestJS) và kết luận cần tự viết engine bằng TypeScript từ đầu.

**Bằng chứng đối chiếu.** Khảo sát npm registry tại thời điểm soát xét (12/09/2026) cho thấy ít nhất một gói đáng cân nhắc không được tài liệu đề cập: `binpackingjs` — viết bằng TypeScript thuần, thiết kế immutable, tree-shakeable, có phiên bản cập nhật trong vòng mười hai tháng gần đây, cài đặt dựa trên thuật toán công bố trong nghiên cứu "Optimizing Three-Dimensional Bin Packing Through Simulation" (Erick Dube và cộng sự), hỗ trợ xoay theo sáu hướng trục. Đây là một nguồn có gốc thuật toán tương đương về mức độ nghiêm túc học thuật với các nguồn đã được trích dẫn trong tài liệu (arXiv, OR-Tools).

**Khoảng cách và hệ quả.** Không phải sai sót — chỉ là một khoảng trống khảo sát. Hệ quả nếu bỏ qua: effort M3 (greedy engine) và một phần M5 (multi-start/local search) trong roadmap có thể tốn nhiều thời gian tự viết và kiểm thử hơn mức cần thiết cho một capstone còn giới hạn thời gian, trong khi phần lõi sinh vị trí đặt hình học đã có gói mã nguồn mở kiểm chứng được.

**Khuyến nghị sửa.** Bổ sung vào bảng nguồn tham khảo bên ngoài (mục 15.3, `AI_3D_PACKAGING_OPTIMIZATION.md`) một dòng cho `binpackingjs`, đánh giá khả năng dùng làm lõi sinh candidate thay vì tự viết M3, với điều kiện **giữ nguyên nguyên tắc Validator độc lập (M2) đã thiết kế đúng trong tài liệu** để kiểm tra lại kết quả thư viện trả về — thư viện ngoài chỉ giải quyết đúng bài toán hình học thuần túy, không tự có các ràng buộc nghiệp vụ (cấm chồng hàng dễ vỡ, hướng bắt buộc, chi phí vật tư) mà tài liệu đã thiết kế đúng phải giữ lại ở lớp riêng.

<a id="bang-tong-hop"></a>

## 9. Bảng tổng hợp khuyến nghị sửa theo từng file

| File | Mục cần sửa | Nội dung sửa (tóm tắt) |
|---|---|---|
| `AI_3D_PACKAGING_OPTIMIZATION.md` | 1.1 | Cập nhật bảng hiện trạng — module `packaging/` đã tồn tại, liệt kê 9 file thật |
| `AI_3D_PACKAGING_OPTIMIZATION.md` | 4.1 | Làm rõ quan hệ `ProductMaster` (nền) vs. `packing_profile` mới (lớp phủ) |
| `AI_3D_PACKAGING_OPTIMIZATION.md` | 4.1 | Thêm ràng buộc tương thích ngược cho `item_key` vs. `PackableItem.quantity` |
| `AI_3D_PACKAGING_OPTIMIZATION.md` | 6.1 | Thêm `binpackingjs` vào bảng so sánh hướng thuật toán |
| `AI_3D_PACKAGING_OPTIMIZATION.md` | 7.3 | Sửa nhận định về replica set — đã sẵn sàng qua Atlas |
| `AI_3D_PACKAGING_OPTIMIZATION.md` | 15.3 | Thêm `binpackingjs` vào bảng nguồn tham khảo |
| `BE_PACKAGING_IMPLEMENTATION_ROADMAP.md` | 2 | Thêm cột "Bắt buộc cho demo capstone", đánh dấu rõ M0–M4 vs. M5–M8 |
| `BE_PACKAGING_IMPLEMENTATION_ROADMAP.md` | 6.1 | Đổi khung "tạo module mới" thành "tích hợp vào module đang chạy" |
| `BE_PACKAGING_IMPLEMENTATION_ROADMAP.md` | 6.2 | Đối chiếu route đề xuất với route thật đang có, tránh trùng bề mặt API |
| `GIAI_THICH_THUAT_TOAN_3D_PACKAGING.md` | Đầu mục 1 (mục mới) | Thêm mục "Khoảng cách với baseline hiện tại" — nêu rõ baseline hiện là heuristic dung lượng, không phải placement hình học |

<a id="ket-luan"></a>

## 10. Kết luận

Phần lớn giá trị kỹ thuật của ba tài liệu nằm ở tầng nguyên tắc (Validator độc lập, không tuyên bố quá tay, phân biệt trạng thái tìm kiếm) — tầng này không cần sửa. Vấn đề nằm ở tầng giả định về hiện trạng hệ thống, phát sinh tự nhiên từ việc tài liệu được biên soạn dựa trên một ảnh chụp repo không đồng bộ với tiến độ backend thực tế tại thời điểm hoàn thành. Bảy nhận xét trên, nếu được áp dụng, sẽ giữ nguyên toàn bộ giá trị thiết kế đã có trong khi loại bỏ rủi ro xung đột kỹ thuật khi triển khai thật. Tài liệu kỹ thuật đi kèm, `AI_PACKAGING_TECHNICAL_DIRECTION.md`, trình bày hướng triển khai cụ thể cho M0–M4 dựa trên các khuyến nghị này.
