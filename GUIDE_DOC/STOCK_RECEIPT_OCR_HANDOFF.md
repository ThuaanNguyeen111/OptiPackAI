# Giao việc — Phiếu nhập kho có minh chứng + OCR đối chiếu số lượng

> **Phiên bản 1.1, 14/11/2026.** Người giao: Thuận. Người nhận: **Thi** (BE). Bản 1.0 (11/11) Thi đã làm xong phần chính; bản này tóm gọn phần đã làm và ghi **việc BE mới** (mục 3) để chặn gian lận ảnh, bỏ điền sẵn số và có đường dự phòng khi AI không chạy.
> Việc hiển thị: web ở `FE_UPDATE_CHECKLIST.md` mục 20, app ở `MOBILE_UPDATE_CHECKLIST.md` mục 9g. File này **chỉ ghi việc BE**.

---

## 1. Hội đồng yêu cầu gì (giữ nguyên)

1. **Minh chứng:** nhập hàng hoặc mua vật liệu đóng gói phải có ảnh **phiếu giao hàng của nhà cung cấp**, lưu trong lịch sử.
2. **Bắt lệch:** _"phiếu ghi 50 mà nhân viên nhập 48 thì hệ thống có biết không?"_ → AI đọc phiếu, đối chiếu số đã nhập, báo dòng lệch.

## 2. Đã làm (Thi, AOFP-277..279) ✅

| Phần | Đã có |
|---|---|
| Ảnh phiếu | `POST /proof-photos?purpose=receipt` (Cloudinary). Nhập hàng NCC và mua / nhập vật liệu **bắt buộc** ảnh (`WH_RECEIPT_PHOTO_REQUIRED`); hàng hoàn, kiểm kê, chuyển ô không bắt |
| OCR | `POST /receipt-ocr` → Groq vision (`AI_VISION_MODEL`), lưu `receipt_ocr_scans` (`supplier`, `date`, `lines[{ name, code, quantity, unit }]`) |
| Đối chiếu | `checkAgainstScan` / `resolveChecks` (`receipt-ocr.util.ts`): `matched` / `mismatch` / `not_checked`; lệch bắt `mismatch_reason`; thông báo `stock_receipt_mismatch` |
| Dự phòng | AI lỗi / sai key → vẫn lưu, phiếu `not_checked` |
| Xem lại | `?ocr_status=mismatch` ở danh sách phiếu nhập; chi tiết phiếu và lịch sử vật liệu có ảnh, số trên phiếu, lý do |
| Tài liệu | `API_LIST.md` mục 33, `FE_UPDATE_CHECKLIST.md` mục 18 |

**Chưa làm từ bản 1.0:** tự khớp dòng theo mã ở BE (Q6, hiện web tự khớp), `activity_logs` cho phiếu / OCR, Report 3/4/5 (mục 5).

**Sửa lại đề xuất bản 1.0:** Q4 "OCR điền sẵn số" là **sai**: nhân viên thấy số trên phiếu rồi bấm lưu thì không còn kiểm đếm. Đổi thành **nhập mù**: nhân viên đếm và nhập số trước, hệ thống mới so với phiếu (việc R3).

## 3. Việc BE mới (chưa làm)

AI chỉ dùng ở **1 lần gọi có sẵn** (`POST /receipt-ocr`). R1 đọc thêm kết quả của chính lần gọi đó; R2–R9 không gọi AI, không tốn token.

| # | Việc | Chi tiết |
|---|---|---|
| R1 | **Ảnh không phải phiếu** | Sau `scan()`: 0 dòng, hoặc không đọc được cả nhà cung cấp lẫn ngày → trả lỗi `RECEIPT_OCR_NOT_A_SLIP` (422, "Ảnh không giống phiếu giao hàng, chụp lại") và lưu lần quét là thất bại. Tuỳ chọn: thêm `is_receipt` vào JSON yêu cầu model trả (cùng 1 lần gọi) |
| R2 | **Tự khớp dòng theo mã ở BE** (Q6) | Khi lưu phiếu, dòng không gửi `ocr_line_index` → BE so mã in trên phiếu với `seller_sku` / `master_sku` (bỏ khoảng trắng, gạch, không phân biệt hoa thường). Khớp đúng 1 dòng → gắn; không khớp / khớp nhiều → bắt người nhập **chọn tay** `ocr_line_index` hoặc gửi `not_on_slip: true` + `mismatch_reason` (lỗi `WH_RECEIPT_LINE_UNMATCHED`). Dòng có `not_on_slip` tính là lệch |
| R3 | **Nhập mù** | BE không đổi luật đối chiếu; chỉ ghi rõ trong `API_LIST.md` mục 33 rằng web / app **không** được điền số từ phiếu vào ô số lượng. Lưu `quantity` người nhập và `ocr_quantity` như hiện nay |
| R4 | **Dự phòng: chụp lại → nhập không đối chiếu** | Cho lưu `not_checked` có chủ đích khi: (a) đã quét lỗi ≥ 2 lần cho cùng phiếu (đếm trong `receipt_ocr_scans`; cách nhận "cùng phiếu" Thi chốt, VD cùng người + cùng kho trong 30 phút), hoặc (b) AI không khả dụng (thiếu key, hết hạn mức, lỗi mạng). Bắt `unchecked_reason` (b: BE tự điền "AI không khả dụng: <mã lỗi>"). Ảnh vẫn bắt buộc, tồn vẫn cộng. Thông báo Store Owner + Admin: loại mới `stock_receipt_unchecked` (thêm vào `notification-type.enum.ts`; push theo `push-policy.ts` nếu cần) |
| R5 | **Kiểm lại sau** | Bộ lọc có sẵn nhận thêm `?ocr_status=not_checked`; thêm `?reviewed=false`. Route mới `POST /warehouse/warehouses/:warehouseId/receipts/:receiptId/review` (Store Owner, Admin) ghi `reviewed_by`, `reviewed_at`, `review_note`; làm tương tự cho lần mua / nhập vật liệu |
| R6 | **Chặn dùng lại ảnh cũ** | Lúc tải ảnh lấy `etag` (MD5 file) Cloudinary trả về, bật `phash: true` khi upload để lấy `phash`; lưu vào phiếu (`document_photos[{ url, etag, phash }]`). `etag` đã dùng ở phiếu khác → chặn `WH_RECEIPT_PHOTO_REUSED` (409). `phash` gần giống (Hamming ≤ ngưỡng, Thi thử chọn) → không chặn, gắn cờ `photo_suspect` để R5 kiểm |
| R7 | **Nhãn nguồn ảnh** | `POST /proof-photos` nhận thêm `source: camera \| upload` (client gửi), lưu cùng ảnh, chỉ để hiển thị "Chụp trực tiếp" / "Tải từ máy", **không** dùng để chặn (client tự khai, không tin được) |
| R8 | **`activity_logs`** | Ghi: quét phiếu (thành công / thất bại), lưu phiếu lệch, lưu không đối chiếu, kiểm lại (R5), chặn ảnh dùng lại (R6) |
| R9 | **Bằng chứng giao hàng** (shop tự giao) | `POST /shipments/:id/deliver` nhận thêm `scanned_code` = nội dung QR trên nhãn (nhãn in dạng `mã vận đơn\|mã chuyến` hoặc `mã kiện\|mã vận đơn\|mã chuyến`, xem `document-renderers.ts`). Không chứa mã vận đơn của shipment → 422 `SHIP_LABEL_SCAN_MISMATCH`. Nhãn hỏng không quét được → `scan_skipped_reason` bắt buộc + thông báo Store Owner. Ảnh giao hàng áp R6 + R7 |
| R10 | **Phiếu mẫu để demo** | Script dev `be/scripts/generate-supplier-slips.ts` (pdfkit + font tiếng Việt của module `documents`) đọc DB (`MONGODB_URI`), xuất 5 phiếu giao hàng PDF A5 ngang vào `docs/test-data/supplier-slips/` + file kịch bản demo. Nhà cung cấp hư cấu, dạng **phiếu giao hàng** (không phải hoá đơn VAT, không mã số thuế thật), trình bày như phiếu thật, **không** in chữ "mẫu / demo". 5 trường hợp: (1) vật liệu khớp; (2) hàng lệch: phiếu 50, nhập 48; (3) hàng không có trên phiếu; (4) phiếu nhiều dòng, dùng thử chặn ảnh cũ R6; (5) SKU mới (đặt sẵn, đổi bằng `--new-sku` / `--new-name`) |

**Không làm:** chức năng tạo phiếu NCC trong sản phẩm (phiếu do NCC gửi); tạo SKU ở màn nhập kho (SKU mới đi luồng có sẵn: thêm sản phẩm trên AURELLE → đồng bộ → "SKU chưa gán ô" → gán ô → nhập kho; Lazada dùng `POST /product-master/sync`).

**Lưu ý code:** field mới `X | null` khai `type:` trong `@Prop()`; ObjectId (`reviewed_by`) thêm vào `objectid-fields.ts`; chạy lại `npm run db:script`. Lỗi theo `{ error_code, message, details }`. Thêm test cho R1, R2, R4, R6, R9.

## 4. Quy tắc dự án

- Nhánh riêng; commit `type(AOFP-<số>): mô tả viết thường`, header ≤ 100 ký tự, mỗi chức năng 1 commit + 1 commit docs; xem số AOFP lớn nhất trên GitHub trước (14/11 lớn nhất là AOFP-294).
- Pre-commit `npm test` phải đạt; trước khi đẩy: `npx tsc --noEmit`, `npx eslint`, `npx jest` trong `be/`.
- **Không commit** `be/.env`, key Groq / Cloudinary, ảnh phiếu thật.
- Ghi nhật ký 5 câu vào `CLAUDE.md`; route / field / mã lỗi mới vào `API_LIST.md` mục 33; việc web / app đã có sẵn ở 2 checklist (cập nhật trạng thái khi BE xong).

## 5. Tài liệu còn nợ

| Tài liệu | Nội dung |
|---|---|
| Report 3 — SRS | Yêu cầu: ảnh phiếu bắt buộc, OCR, nhập mù, đối chiếu, lý do lệch, nhập không đối chiếu, kiểm lại, chặn ảnh cũ, quét nhãn khi giao |
| Report 4 — SDD | Sơ đồ tuần tự "Nhập kho có phiếu + OCR" (cả nhánh AI lỗi); class / ERD: `stock_receipts`, `receipt_ocr_scans` |
| Report 5 — Test | Test case theo mục 6 |

## 6. Nghiệm thu (demo trước hội đồng)

1. Nhập hàng không ảnh → bị chặn.
2. Chụp ảnh không phải phiếu (VD ảnh bàn) → "chụp lại" (R1).
3. Chụp phiếu 2 "Áo thun đỏ M — 50" → ô số lượng **trống**, nhân viên nhập 48 → bắt lý do → lưu → nhãn "Lệch phiếu", Store Owner nhận thông báo.
4. Phiếu 3: dòng hàng không có trên phiếu → phải chọn "Không có trên phiếu" + lý do (R2).
5. Dùng lại ảnh phiếu 4 cho phiếu nhập khác → bị chặn (R6).
6. Tắt key AI → nút "Nhập không đối chiếu", lý do tự điền, vẫn lưu; Store Owner thấy trong lọc "Chưa đối chiếu", bấm "Đã kiểm" (R4, R5).
7. Mua vật liệu theo phiếu 1 → khớp.
8. Giao hàng shop tự giao: quét QR nhãn kiện khác → bị chặn; quét đúng + chụp ảnh → giao thành công (R9).
