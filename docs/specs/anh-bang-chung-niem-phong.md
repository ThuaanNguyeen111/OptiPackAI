# Spec — Ảnh bằng chứng khi niêm phong kiện

> 13/11/2026 · thay cho ý tưởng "AI soi ảnh kiện hàng" (bỏ vì món bị khuất thì AI không thấy, kết luận sai).
> Ở đây ảnh chỉ là **bằng chứng cho người xem**. Hệ thống không chấm ảnh đúng hay sai.

## Problem Statement

Khách khiếu nại "thiếu món" hoặc "hàng bể" sau khi nhận. Lúc đó shop không chứng minh được kiện đã đi ra khỏi kho đủ món và còn nguyên. Hệ thống đã ghi lại việc quét đủ món và cân thật, nhưng hai thứ này là con số. Người xử lý khiếu nại, hãng vận chuyển và sàn đều muốn có ảnh. Hiện chỉ có ảnh ở sự cố đóng gói, lúc giao hàng và lúc kiểm hàng hoàn. Đúng thời điểm quan trọng nhất là ngay trước khi **niêm phong** thì lại không có ảnh nào.

## Solution

Lúc niêm phong một **kiện**, nhân viên đóng gói chụp tối đa 3 ảnh. Gợi ý chụp: thùng mở nhìn từ trên xuống, góc nghiêng thấy các món bên dưới, và kiện đã dán tem. Ảnh được lưu vào chính kiện đó cùng người chụp và thời điểm.

Admin hoặc Store Owner có thể bật bắt buộc ảnh trong **Cài đặt đóng gói & AI**. Khi bật, kiện chưa có ảnh thì không niêm phong được. Mặc định là tắt, để kho đang chạy không bị chặn.

Ảnh hiện ở mọi nơi người ta cần đối chiếu:
- chi tiết kiện trong phiên đóng gói;
- dòng thời gian của nhóm đơn;
- màn kiểm hàng hoàn, đặt cạnh ảnh lúc nhận hàng hoàn.

Không có AI nào đánh giá ảnh.

## User Stories

1. Là nhân viên đóng gói, tôi muốn chụp ảnh kiện ngay trên màn niêm phong, để không phải mở thêm màn khác.
2. Là nhân viên đóng gói, tôi muốn chụp tối đa 3 ảnh mỗi kiện, để món bị che ở góc này vẫn thấy ở góc khác.
3. Là nhân viên đóng gói, tôi muốn thấy gợi ý nên chụp góc nào (mở nắp nhìn trên, nghiêng, đã dán tem), để ảnh đủ dùng khi có khiếu nại.
4. Là nhân viên đóng gói, tôi muốn xoá ảnh vừa chụp hỏng trước khi niêm phong, để không lưu ảnh mờ.
5. Là nhân viên đóng gói, tôi muốn ảnh được nén trước khi gửi, để mạng kho yếu vẫn gửi kịp.
6. Là nhân viên đóng gói, khi gửi ảnh thất bại, tôi muốn thấy thông báo rõ và thử lại được, để không mất các bước đã làm.
7. Là nhân viên đóng gói, khi Admin chưa bật bắt buộc ảnh, tôi muốn vẫn niêm phong được mà không cần ảnh, để kho không bị chặn.
8. Là nhân viên đóng gói, khi đã bật bắt buộc ảnh, tôi muốn nút niêm phong báo rõ là còn thiếu ảnh, để biết vì sao không bấm được.
9. Là nhân viên đóng gói, khi hoàn tác niêm phong rồi đóng lại, tôi muốn chụp ảnh mới cho lần niêm phong mới, để ảnh khớp với kiện thật đi ra.
10. Là Admin, tôi muốn bật hoặc tắt "bắt buộc ảnh khi niêm phong" trong Cài đặt đóng gói & AI, để áp dụng dần.
11. Là Store Owner, tôi muốn xem ảnh của từng kiện trong dòng thời gian nhóm đơn, để trả lời khách khi khiếu nại thiếu món.
12. Là Store Owner, tôi muốn ảnh có kèm người chụp và giờ chụp, để biết đây đúng là ảnh lúc rời kho.
13. Là nhân viên kiểm hàng hoàn, tôi muốn thấy ảnh lúc niêm phong cạnh ảnh lúc nhận hàng hoàn, để so xem khác gì.
14. Là điều phối vận chuyển, tôi muốn mở được ảnh kiện khi làm khiếu nại với hãng (bể, móp), để có bằng chứng tình trạng lúc giao cho hãng.
15. Là Admin, tôi muốn ảnh của lần niêm phong trước vẫn xem được sau khi hoàn tác, để không ai xoá được bằng chứng bằng cách hoàn tác.
16. Là Admin, tôi muốn ảnh chỉ nhận từ kho ảnh của hệ thống, không nhận link ngoài, để không ai dán ảnh lấy từ chỗ khác.
17. Là nhân viên đóng gói trên điện thoại, tôi muốn mở thẳng camera sau, để chụp nhanh.
18. Là Admin, tôi muốn xem được tỷ lệ kiện niêm phong có ảnh, để biết nhân viên có chụp hay không trước khi bật bắt buộc.
19. Là Store Owner, tôi muốn nhóm đơn đóng trước ngày có tính năng này vẫn hiển thị bình thường, không báo lỗi thiếu ảnh.
20. Là Admin, khi kho chưa cấu hình nơi lưu ảnh mà lại bật bắt buộc ảnh, tôi muốn bị cảnh báo, để kho không bị chặn niêm phong hoàn toàn.

## Implementation Decisions

- **Không có module mới.** Dùng lại toàn bộ hạ tầng ảnh bằng chứng có sẵn:
  - Upload lên Cloudinary qua endpoint ảnh bằng chứng hiện có, thư mục ảnh bằng chứng.
  - Validator URL ảnh hiện có: tối đa 3 ảnh, chỉ URL của Cloudinary hệ thống.
- **Hợp đồng API, niêm phong kiện.** Body niêm phong nhận thêm `photo_urls` (không bắt buộc ở tầng DTO). Service quyết định có bắt buộc hay không, theo cài đặt. Niêm phong nhiều kiện một lần (nếu có) cũng nhận ảnh theo từng kiện.
- **Lỗi mới** (theo prefix sẵn có của phân hệ đóng gói): `PACKING_SEAL_PHOTO_REQUIRED` (409, kèm danh sách số kiện thiếu ảnh) và `PACKING_SEAL_PHOTO_STORAGE_MISSING` (409, bật bắt buộc khi server chưa có nơi lưu ảnh).
- **Schema kiện.** Kiện thêm `seal_photo_urls`, là mảng URL không có default, để bản ghi cũ không có trường này.
  - Người chụp và giờ chụp lấy theo `sealed_by` / `sealed_at` sẵn có, không lưu lặp.
- **Hoàn tác niêm phong.** Ảnh của lần niêm phong cũ được chuyển vào bản ghi hoạt động hoàn tác (nhật ký phiên đóng gói, loại `unseal`), rồi trường trên kiện được xoá. Lần niêm phong lại phải chụp mới. Như vậy hoàn tác không làm mất bằng chứng.
- **Cài đặt đóng gói.** `packing_settings` thêm `require_seal_photo` (boolean, mặc định `false`), lưu theo cơ chế phiên bản sẵn có. Khi lưu `true` mà server chưa cấu hình Cloudinary thì từ chối, kèm lỗi rõ ràng.
- **Dữ liệu đọc ra.**
  - Phản hồi phiên đóng gói trả `sealPhotoUrls` cho từng kiện.
  - Dòng thời gian nhóm đơn thêm ảnh vào sự kiện niêm phong.
  - Màn kiểm hàng hoàn đọc ảnh niêm phong qua dòng thời gian nhóm đơn (không thêm endpoint).
- **Báo cáo.** Báo cáo đóng gói sẵn có thêm "tỷ lệ kiện niêm phong có ảnh" theo khoảng ngày.
- **Không có AI.** Không gửi ảnh cho nhà cung cấp AI nào. Ghi rõ điều này trong tài liệu luồng dữ liệu AI.
- **Thuật ngữ.** Dùng **Kiện** và **Niêm phong** theo GLOSSARY. Thêm mục "Ảnh niêm phong": ảnh kiện chụp ngay trước khi niêm phong, dùng làm bằng chứng, không được chấm tự động.
- **FE.**
  - Màn niêm phong trong phiên đóng gói có ô chụp ảnh (camera sau, nén phía client, xem trước, xoá).
  - Cài đặt đóng gói & AI có công tắc bắt buộc ảnh.
  - Dòng thời gian nhóm đơn và màn kiểm hàng hoàn hiển thị ảnh dạng lưới nhỏ, bấm vào thì phóng to.

## Testing Decisions

- **Test hành vi qua seam cao nhất:** service phiên đóng gói, ở thao tác niêm phong, dùng mock model như spec kế hoạch đóng gói hiện có. Không test chi tiết bên trong.
- **Các ca cần có:**
  - tắt bắt buộc + không ảnh → niêm phong thành công, kiện không có trường ảnh;
  - bật bắt buộc + không ảnh → `PACKING_SEAL_PHOTO_REQUIRED`, kiện vẫn `pending`, không trừ tồn thùng;
  - có ảnh → kiện lưu đúng URL;
  - hoàn tác → ảnh nằm trong nhật ký `unseal`, kiện không còn ảnh; niêm phong lại với ảnh mới → chỉ có ảnh mới;
  - bật cài đặt khi thiếu cấu hình Cloudinary → bị từ chối.
- **Validator URL ảnh đã có test riêng.** Chỉ thêm một ca DTO niêm phong từ chối URL ngoài.
- **Prior art:** spec service kế hoạch/phiên đóng gói, spec ảnh bằng chứng (validator và service upload), spec cài đặt đóng gói.
- **Guard spec ghi trạng thái nhóm đơn:** phải vẫn xanh, vì niêm phong không được thêm đường ghi trạng thái mới.

## Out of Scope

- AI đọc ảnh hay đối chiếu ảnh với danh sách món, vì món bị khuất làm kết luận không tin được.
- Quay video lúc đóng gói.
- Gửi ảnh cho sàn hoặc hãng vận chuyển qua API. Người dùng tự tải hoặc mở link khi khiếu nại.
- Đóng dấu nước (thời gian, mã nhóm) lên ảnh.
- Xoá ảnh theo thời hạn lưu trữ.
- Bảng kho TV và hỏi đáp vận hành (hướng 2 và 3 trước đó), đã bỏ.

## Further Notes

- Ảnh lưu ở Cloudinary dùng chung với ảnh sự cố, giao hàng và hàng hoàn. Môi trường thiếu biến Cloudinary thì chỉ chạy được khi tắt bắt buộc ảnh.
- Seam đề xuất là **một**: thao tác niêm phong của service phiên đóng gói. Các nơi hiển thị chỉ đọc lại trường đã lưu, nên không cần seam riêng.
