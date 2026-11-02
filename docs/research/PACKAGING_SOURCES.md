# Nguồn tham khảo cho quy chuẩn đóng gói (OptiPackAI)

> Ngày truy cập mọi nguồn: **2026-10-31**. Ưu tiên nguồn gốc (trang chính thức của hãng vận chuyển / sàn / tài liệu API).
> Nhãn nguồn:
> - **[chính thức]**: trang do chính chủ thể sở hữu quy định phát hành (GHN, Lazada, UPS, Amazon).
> - **[blog chính chủ]**: bài blog/tin tức trên domain chính chủ, không phải văn bản quy định.
> - **[nhà bán/nhà sản xuất]**: trang bán hàng/nhà sản xuất bao bì; chỉ dùng để kiểm tra "cỡ nào phổ biến trên thị trường".
> - **[nguồn thứ cấp]**: bên thứ ba thuật lại, chưa đối chiếu được với chính chủ.

## 0. Bảng số liệu chính

| # | Nội dung | Giá trị | Nguồn |
|---|---|---|---|
| 1 | Khối lượng quy đổi GHN | `dài(cm) × rộng(cm) × cao(cm) / 5000` (đơn vị cm, kết quả kg) | [blog chính chủ] GHN – Quy định cân đo, niêm phong (S2) |
| 2 | Tính cước GHN | Lấy khối lượng **lớn hơn** giữa thực tế và quy đổi | [chính thức] GHN – Quy trình gửi hàng (S3); [blog chính chủ] S4 |
| 3 | Làm tròn khối lượng GHN | Phần lẻ < 0,5 kg → 0,5 kg; > 0,5 kg → 1 kg | [chính thức] S3 |
| 4 | Ngưỡng cân đo lại tại chỗ | Có cạnh > **30 cm** thì nhân viên đo lại kích thước thực tế | [blog chính chủ] S2 |
| 5 | Giới hạn kiện (bài hướng dẫn đóng gói GHN) | Tối đa **30 kg**, một chiều tối đa **150 cm** | [blog chính chủ] S4 |
| 6 | Giới hạn trường API tạo đơn GHN (gốc đơn) | `weight` ≤ **50.000 g**; `length/width/height` ≤ **200 cm** mỗi chiều | [chính thức] GHN API – Create Order (S5) |
| 7 | Loại dịch vụ API GHN | `service_type_id=2`: tổng < 20 kg (chỉ cần kích thước ở gốc); `=5`: ≥ 20 kg hoặc nhiều kiện (mỗi `items[]` bắt buộc có length/width/height/weight) | [chính thức] S5, S6 |
| 8 | API tính phí GHN | `weight` (gram) **khác 0**; length/width/height (cm); không công bố giá trị tối đa | [chính thức] S6 |
| 9 | Niêm phong GHN | Đơn COD ≥ **2.000.000 đ** phải cho kiểm tra & niêm phong; thùng xốp không đạt chuẩn niêm phong | [blog chính chủ] S2 |
| 10 | Kiện tối thiểu Lazada VN | **12 × 18 × 2,5 cm** | [chính thức] Lazada University – Cẩm nang đóng gói (S8), tr. 35 |
| 11 | Tem vận chuyển Lazada VN | Khổ A4, A5, **tối thiểu A6**; giấy trắng mới; in dọc; **1 kiện chỉ 1 tem**; 2 mã vạch đầu cùng một mặt phẳng; không che tem bằng băng dính màu/nylon/giấy | [chính thức] S8, tr. 35–36 |
| 12 | Hộp lồng hộp (UPS) | Thùng ngoài lớn hơn thùng trong **6"** (~15 cm) mỗi chiều; đệm **3"** quanh thùng trong; dùng cho hàng dễ vỡ, **túi xách & phụ kiện**, hàng xa xỉ | [chính thức] UPS Packaging Guidelines (S10), tr. 3 |
| 13 | Đệm tối thiểu (UPS) | ≥ **2"** (~5 cm) đệm giữa hàng và thành thùng; giấy kraft vò chặt chỉ cho hàng **nhẹ, không dễ vỡ** | [chính thức] S10, tr. 2–3 |
| 14 | Giày (Amazon FBA) | Không để lộ chất liệu giày: trong **hộp giày** hoặc **túi poly có cảnh báo ngạt thở** | [chính thức] Amazon – sell.amazon.com (S12) |
| 15 | Túi poly (Amazon FBA) | Trong suốt, kín; cảnh báo ngạt thở nếu miệng túi > 5"; không dư quá 3" so với sản phẩm | [chính thức] S12 |
| 16 | Cỡ túi niêm phong phổ biến ở VN | **17×30, 20×30, 25×35, 28×42, 32×45, 38×52** cm (ngang × cao) | [nhà bán/nhà sản xuất] S14, S15, S16 |
| 17 | Cỡ thùng carton COD phổ biến (VN) | Ví dụ 20×15×10, 25×20×10, 30×20×10, 30×20×15, 35×25×15 cm; 3 lớp sóng E | [nhà bán/nhà sản xuất] S17 |

**Kết luận nhanh cho bộ cỡ túi dự kiến (20×30, 25×35, 32×43, 40×50):** 20×30 và 25×35 là cỡ chuẩn thị trường. **32×43 và 40×50 không xuất hiện** trong bảng cỡ của các nhà sản xuất đã kiểm tra; cỡ gần nhất đang bán phổ biến là **32×45** và **38×52** (có nơi thêm 28×42, 40×60, 45×60). Nên đổi về 32×45 và 38×52 (hoặc 40×60) để mua được hàng có sẵn.

---

## 1. GHN (Giao Hàng Nhanh)

### 1.1. Quy định đóng gói chung

- **S1 [chính thức/blog chính chủ]** GHN – Chính sách vận chuyển: https://ghn.vn/blogs/thong-tin-giao-hang/chinh-sach-van-chuyen-ghn (truy cập 2026-10-31)
  - "Hàng phải được bảo vệ đúng cách trong thùng carton phù hợp"; dùng vật liệu chèn giảm sốc, băng keo chắc, nhãn cảnh báo khi cần; nguyên tắc "nguyên đai, nguyên kiện".
  - Không nêu giới hạn cân nặng/kích thước hay công thức quy đổi.
- **S3 [chính thức]** GHN – Quy trình gửi hàng: https://ghn.vn/pages/quy-trinh-gui-hang (truy cập 2026-10-31)
  - Đóng gói "bằng thùng carton, hộp bằng bìa cứng bên ngoài sản phẩm"; chèn kín khoảng trống bằng xốp/bọt khí; dán băng keo, **không dùng dây thừng/dây vải**; chọn thùng vừa với hàng.
  - **Túi vs thùng:** "Sản phẩm dễ ẩm ướt, mỏng, rách, phải được bọc nilon kín" (quần áo, vải). Theo trang này, quần áo/tài liệu/hàng phẳng **sau đó cho vào thùng carton** để giữ phẳng, không gấp nếp.
  - Hàng dễ vỡ: bọc bọt khí/xốp, cho vào thùng, dán "Hàng dễ vỡ".
  - Tính cước theo khối lượng cao hơn (thực tế/quy đổi); làm tròn 0,5 kg / 1 kg.
  - Giới hạn cân nặng/kích thước và công thức quy đổi **chỉ hiển thị dưới dạng ảnh** trên trang này, không trích được bằng văn bản.
  - GHN "có quyền từ chối nếu đơn hàng không được đóng gói đảm bảo".
- **S4 [blog chính chủ]** GHN – Quy chuẩn đóng gói sản phẩm hàng hóa khi vận chuyển: https://ghn.vn/blogs/thong-tin-giao-hang/quy-chuan-dong-goi-san-pham-hang-hoa-khi-van-chuyen (truy cập 2026-10-31)
  - Quần áo, vải vóc: "Gói sản phẩm vào bao nilon và gia cố tất cả các mép", rồi "Cho sản phẩm đã gói vào thùng carton, đảm bảo hàng thẳng thớm, tránh bị gấp nếp hoặc cong".
  - Hàng dễ vỡ: "Bọc kín toàn bộ sản phẩm bằng xốp khí từ 3 - 4 lớp", chèn chống xê dịch, dán tem "Hàng dễ vỡ (Fragile)".
  - "Đảm bảo kích thước hàng hóa có trọng lượng tối đa 30kg, và kích thước 1 chiều tối đa 150cm."
  - "Không dùng thùng carton, bao nilon, băng keo đã cũ hoặc bị rách." Băng keo không được che thông tin trên tem.
  - Không có mục riêng cho giày dép; túi xách chỉ được nhắc chung trong nhóm hàng dễ bẩn/ướt (bọc nilon).

> **Ghi chú quan trọng cho quy chuẩn của ta:** Cả S3 và S4 đều mô tả quần áo là "bọc nilon **rồi cho vào thùng carton**". GHN **không có câu nào cấm** gửi hàng mềm chỉ trong túi niêm phong, nhưng cũng không có văn bản chính thức nói rõ "túi niêm phong là bao bì ngoài được chấp nhận". Xem mục "Điểm chưa xác minh được".

### 1.2. Khối lượng quy đổi, cân đo, niêm phong

- **S2 [blog chính chủ]** GHN – Quy định cân đo niêm phong hàng hóa của GHN Express: https://ghn.vn/blogs/tin-tuc-ghn/quy-dinh-can-do-niem-phong-hang-hoa-cua-ghn-express (truy cập 2026-10-31)
  - Công thức: "Công thức tính trọng lượng quy đổi = [dài (cm) x rộng (cm) x cao (cm)]/5000" → **xác nhận số chia 5000, đơn vị cm**.
  - Áp dụng toàn quốc từ 16/01/2019 (bài cập nhật 23/07/2023).
  - Đơn có chiều dài, rộng hoặc cao > 30 cm: nhân viên đo lại thực tế; lệch thì yêu cầu đóng lại/tạo đơn mới, không được thì từ chối nhận (tính một lần lấy hàng thất bại).
  - Đơn COD ≥ 2.000.000 đ: kiểm tra & niêm phong; đóng bằng thùng xốp hoặc chỉ dán băng keo bên ngoài không đạt chuẩn niêm phong.
- **S7 [blog chính chủ, quy định cũ theo vùng]** GHN – Thay đổi quy định kích thước hàng hóa tại các tỉnh miền Bắc từ 08/11/2021: https://ghn.vn/blogs/tin-tuc-ghn/thay-doi-quy-dinh-kich-thuoc-hang-hoa-nhan-van-chuyen-tai-cac-tinh-mien-bac-tu-08-11-2021 (truy cập 2026-10-31)
  - Áp dụng 27 tỉnh miền Bắc, "đến khi có thông báo mới": ngừng nhận đơn > 10 kg thực tế, hoặc 3 chiều > 35 cm, hoặc 2 chiều > 45 cm, hoặc 1 chiều > 50 cm. Không rõ còn hiệu lực hay không.

### 1.3. API GHN (tạo đơn & tính phí)

- **S5 [chính thức]** GHN Developer – Create Order: https://developer.ghn.vn/en/docs/order/create (truy cập 2026-10-31)
  - Gốc đơn: `weight` "Weight (grams). Maximum: 50,000"; `length`, `width`, `height` "(cm). Maximum: 200".
  - `items[].length/width/height/weight`: "Required when service_type_id=5"; **không công bố giá trị tối đa** cho từng item.
  - `service_type_id=2`: "total weight under 20 kg" — chỉ cần kích thước/khối lượng ở gốc. `=5`: "total weight 20 kg or more, or multi-parcel orders".
  - `required_note`: `KHONGCHOXEMHANG`, `CHOXEMHANGKHONGTHU`, `CHOTHUHANG`.
  - Endpoint: production `https://online-gateway.ghn.vn`, staging `https://dev-online-gateway.ghn.vn` (theo https://developer.ghn.vn/en/docs/getting-started/overview).
- **S6 [chính thức]** GHN Developer – Calculate Fee: https://developer.ghn.vn/en/docs/order/calculate-fee (truy cập 2026-10-31)
  - `weight` "Parcel weight (gram). Must be non-zero"; `length/width/height` "(cm)"; không ghi giá trị tối đa; `items` "same shape as Create Order; used for heavy goods".

> Chênh lệch cần lưu ý: blog đóng gói (S4) ghi **30 kg / 150 cm**, còn API (S5) cho phép tới **50 kg / 200 cm**. Giới hạn API là giới hạn kỹ thuật của trường dữ liệu, không chắc là giới hạn nhận hàng của dịch vụ chuẩn. Nên dùng 30 kg / 150 cm làm ngưỡng nghiệp vụ.

### 1.4. Hàng cấm

- **S9 [chính thức]** GHN – Hàng hóa GHN không nhận vận chuyển: https://ghn.vn/pages/hang-hoa-ghn-khong-nhan-van-chuyen (truy cập 2026-10-31)
  - Mục I (cấm): vũ khí; quân trang/thiết bị an ninh; ma túy & dụng cụ; ấn phẩm cấm; hóa chất nguy hiểm, pháo, chất nổ, phóng xạ; thiết bị cờ bạc; thuốc BVTV cấm; bộ phận cơ thể, động thực vật hoang dã quý hiếm; thuốc/mỹ phẩm/thiết bị y tế chưa được phép; tiền, giấy tờ có giá; kim loại & đá quý; cổ vật; thuốc lá & thuốc lá điện tử; thiết bị gây nhiễu/nghe lén; giấy tờ giả…
  - Mục II (ngoài phạm vi dịch vụ): hàng tươi sống/đông lạnh, **pin**, phim/đĩa, một số chất dễ cháy/ăn mòn, giấy tờ gốc không thay thế được.
  - Mục III: danh mục cấm bay (có thể đi đường bộ ở dịch vụ chuẩn).
  - Hàng thời trang (quần áo, giày, túi) **không thuộc** danh mục cấm; cần chú ý phụ kiện có pin (đèn, đồng hồ điện tử) thuộc Mục II.

---

## 2. Lazada Việt Nam (Seller Center / Lazada University)

- **S8 [chính thức]** Lazada University (VN) – "Cẩm nang đóng gói hàng hóa hiệu quả, thân thiện với môi trường", trang bài: https://university.lazada.vn/course/learn?id=14106&type=article ; tệp PDF (21 trang ghép đôi, 40 trang sách, đăng 06/03/2023): https://img-ovs.alicdn.com/other/common/1f9652e8bce44067941795789613d929 (truy cập 2026-10-31). PDF là ảnh, nội dung dưới đây đọc từ ảnh trang.
  - **Phần 6 – Quy cách đóng gói và dán tem vận chuyển (tr. 35):**
    - "Kích thước tối thiểu của một kiện hàng: 12cm x 18cm x 2.5cm".
    - Tem: "Khổ giấy chuẩn: A4, A5 và tối thiểu là A6"; "In bằng giấy mới (giấy trắng). Không in bằng giấy màu"; "In theo khổ giấy dọc"; "Đầy đủ 03 mã vạch. Trong đó, mã vạch đầu tiên và mã thứ 2 phải được dán trên cùng mặt phẳng"; "Mỗi kiện hàng chỉ được dán duy nhất một tem vận chuyển"; "không che bên ngoài tem vận chuyển bằng băng dính màu, nylon, giấy".
  - **Tr. 36 – ví dụ sai quy cách:** khuyến nghị máy in laser hoặc máy in nhiệt; dùng băng keo trong (hoặc vàng) không che nội dung tem; không ghi đè/sửa tem; ảnh minh họa lỗi "kích thước quá nhỏ" và "không thể hiện đầy đủ các mã vạch trên cùng một mặt phẳng" (ví dụ là **túi nilon/túi mềm** bị nhăn làm gãy mã vạch).
  - **Tr. 37:** kiện sai quy cách bị băng chuyền chuyển sang xử lý thủ công (in lại tem…), làm chậm đơn và tăng chi phí.
  - **Phần 2 (tr. 13–16):** chọn bao bì vừa kích cỡ hàng (bao bì quá to → tăng phí do tăng kích thước/trọng lượng tính cước, lãng phí vật liệu); dùng thùng carton chịu lực khi cần, "Bóng khí hay thùng xốp hơi đôi khi không đủ giúp chống va đập"; chọn độ bục/băng keo theo quãng đường; dán ký hiệu cảnh báo (dễ vỡ, tránh ẩm…).
  - **Phần 4 (tr. 24–25):** khuyến khích thay xốp nylon bong bóng khí bằng **giấy, carton cắt sợi**; "Giấy báo hay bất kỳ loại giấy nào cũng có thể tận dụng để làm vật liệu chèn hàng hóa".
  - **Không có** mục riêng cho thời trang/giày, **không có** câu cấm/cho phép túi niêm phong, **không có** quy định "hộp giày phải có bao bì ngoài".
- **[nguồn thứ cấp]** GHN blog "Hướng dẫn cách đóng gói hàng Lazada theo đúng quy định": https://ghn.vn/blogs/tip-ban-hang/huong-dan-cach-dong-goi-hang-lazada-theo-dung-quy-dinh (truy cập 2026-10-31) — quần áo không hộp: cho vào túi poly (Pouch) rồi dán mã đơn; giày có hộp: cho hộp giày vào thùng carton, chèn giấy tái chế/túi khí, dán băng keo; giày không hộp: túi Pouch. Bài **không dẫn link** văn bản chính thức của Lazada.
- **[nguồn thứ cấp, khác thị trường]** Điều khoản người bán Lazada Philippines (PDF): https://img-ovs.alicdn.com/other/common/ab16c065b45246a6a73ebedb49cb6617 — theo tóm tắt của công cụ tìm kiếm, mức bồi thường hư hỏng phụ thuộc việc người bán tuân thủ "Packaging Guidelines"; không đọc được nguyên văn và không phải văn bản VN.

---

## 3. Túi niêm phong và thùng carton trên thị trường VN

Tất cả nguồn trong mục này là **[nhà bán/nhà sản xuất]**; chỉ chứng minh "cỡ nào đang được bán phổ biến", không phải tiêu chuẩn.

- **S14** Volga (xưởng túi niêm phong): https://volgaplastic.com/tui-niem-phong/ (truy cập 2026-10-31) — bảng cỡ (ngang × cao, cm) kèm số túi/kg: **20×30 (179), 25×35 (118), 28×42 (83), 32×45 (68), 38×52 (45)**. Nhựa PE nguyên sinh; loại 1 da (1 lớp) và 2 da (ngoài màu, trong đen/xám/trắng sữa); "Phần keo dán ở miệng túi … muốn mở phải làm hỏng túi" (nắp keo tự dính, phá hủy khi mở). Không ghi độ dày micron.
- **S15** Túi Niêm Phong 3TH: https://tuiniemphong3th.com/cua-hang/tui-niem-phong/tui-niem-phong-size-20x30/ (truy cập 2026-10-31) — 20×30 ("khổ 20 cm × dài 30 cm"), túi PE 3 lớp; cỡ khác: 17×30, 25×35, 28×42, 32×45; khuyên chừa ~5 cm cho mép dán (gợi ý kích thước ghi **chưa gồm** nắp, nhưng không nói rõ).
- **S16** Sản phẩm trên Lazada.vn "Túi Niêm Phong Túi Gói Hàng… cuộn 1kg nhiều size": https://www.lazada.vn/products/tui-niem-phong-tui-goi-hang-tui-dong-goi-hang-nhanh-cuon-1kg-nhieu-size-i2189193523.html (truy cập 2026-10-31) — cỡ: 15×25, 17×30, 20×30, 25×35, 28×42, 32×45, 38×52, 40×60, 45×60; nhựa PE; "Nắp dán tự dính". Không ghi độ dày.
- [nhà bán] Băng Keo Tâm Tài Đức: https://bangkeotamtaiduc.com/g/tui-niem-phong/ và túi tự hủy Vinpack: https://tuiphanhuysinhhoc.vn/tui-niem-phong-tu-huy/ — theo kết quả tìm kiếm (chưa mở trang) cũng liệt kê 20×30, 25×35, 28×42, 32×45, 38×52.
- **Độ dày:** không nhà sản xuất VN nào trong số đã kiểm tra công bố micron; họ bán theo kg và số túi/kg. Với Volga: 20×30 ≈ 179 túi/kg. Ước tính độ dày (tự suy, không phải số nhà sản xuất): diện tích 2 mặt + nắp ≈ 0,2×0,3×2 + nắp ≈ 0,13 m²/túi → ~5,6 g/túi → với PE ~0,92 g/cm³, mỗi lớp màng khoảng **45–50 µm**. Coi đây là ước tính, cần hỏi nhà cung cấp.
- **S17** Thùng carton – sản phẩm trên Lazada.vn "Combo 50 hộp giấy carton đựng giày 30x20x10": https://www.lazada.vn/products/combo-50-hop-giay-carton-dung-giay-30x20x10-cm-gia-tai-xuong-i1341652917.html (truy cập 2026-10-31) — "Hộp carton 3 lớp sóng E, cứng cáp, chịu lực tốt"; danh sách ~60 cỡ, trong đó có 20×15×10, 20×15×15, 25×15×10, 25×20×10, 25×20×15, 30×20×10, 30×20×15, 30×20×20, 30×21×7, 30×25×20, 33×21×12, 35×25×15, 35×25×20 cm.

---

## 4. Thực hành tốt cho đóng gói thời trang

### 4.1. Gấp quần áo và cỡ sau gấp

- **[nguồn thứ cấp]** Bảng gấp FlipFold (người lớn): bảng mở 24" × 27", gấp áo thành khối khoảng **9" × 12" (~23 × 30 cm)** — theo trang bán lại McLogan và Vision Forward: https://vision-forward.org/product/flipfold-shirt-folding-board (truy cập 2026-10-31); trang nhà sản xuất (flipfold.com, laundry-alternative.com) không truy cập được (429/404).
- Kích thước gấp theo cỡ S/M/L/XL cho áo thun/sơ mi/quần/váy: **không tìm thấy nguồn gốc** (xem mục cuối). Gợi ý: đo thực tế tại kho, vì độ dày phụ thuộc chất liệu.

### 4.2. Túi poly cho từng sản phẩm

- **S12 [chính thức]** Amazon – "FBA prep, packaging, and labeling: A beginner's guide" (sell.amazon.com, đăng 07/07/2026): https://sell.amazon.com/blog/fba-packaging-prep-labeling (truy cập 2026-10-31)
  - Nhóm cần cho vào túi: "Apparel, fabrics, textiles".
  - "Use transparent bags that are 1mm thick and completely sealed." (Lưu ý: diễn đàn Amazon trả lời là **1,5 mil** ≈ 38 µm; "1mm" nhiều khả năng là lỗi đơn vị – xem mục cuối.)
  - "Apply a suffocation warning label to any bag with an opening larger than 5 inches."
  - Túi "don't extend more than 3 inches beyond the product's dimensions".
  - Giày: "All footwear must be packaged with no material exposed either in shoe boxes or poly bags with a suffocation warning."
- Trang trợ giúp Seller Central gốc (https://sellercentral.amazon.com/gp/help/external/200141500) yêu cầu đăng nhập, không đọc được nội dung.

### 4.3. Giấy pelure (tissue) cho váy

- Không tìm thấy hướng dẫn của hãng vận chuyển/sàn về giấy lụa cho váy. Chỉ có khuyến nghị chung của GHN: bọc nilon kín và giữ hàng phẳng, không gấp nếp (S3, S4).

### 4.4. Hộp giày và thùng ngoài ("ship in own container" vs overbox)

- **S10 [chính thức]** UPS – Packaging Guidelines (PDF): https://www.ups.com/assets/resources/webcontent/en_US/Packaging_Guidelines.pdf (truy cập 2026-10-31)
  - Tr. 1: "Goods that are susceptible to damage from normal handling or to exposure to dirt, water, scratches or marks, should be placed in a protective outer box." → hộp giày thương hiệu (hàng cần giữ đẹp) nên có thùng ngoài.
  - Tr. 3, Method 1 One-Box: cho hàng đã đóng gói sẵn, **hàng mềm/bền**, hàng dễ bẩn.
  - Tr. 3, Method 2 Two-Box: cho hàng sắc/dễ vỡ, **"Bags and accessories"**, đồ du lịch, hàng xa xỉ; thùng ngoài lớn hơn thùng trong 6" mỗi chiều; thêm 3" đệm quanh thùng trong.
  - Checklist: thùng cứng có nắp gập; tránh dùng lại thùng; "Never use string or paper over-wrap"; bọc riêng từng món; đặt nhãn địa chỉ phụ bên trong.
- **S11 [chính thức]** UPS – Packaging Tips: https://www.ups.com/us/en/support/shipping-support/packaging-tips (truy cập 2026-10-31) — trang web tương ứng, theo kết quả tìm kiếm nêu cùng nội dung (thùng cứng có nắp, phương pháp hai thùng cho túi xách & phụ kiện).
- Amazon SIOC/SIPP (ship in own container, không cần overbox) chỉ áp dụng cho bao bì đã qua thử nghiệm ISTA-6; **không có** nguồn chính thức nào nói hộp giày thông thường đạt SIOC (tham khảo: hướng dẫn chứng nhận FFP v10.3 https://assets.aboutamazon.com/e9/12/3e8a35b04ed0bf3f0880b1a40742/amazon-frustration-free-packaging-program-certification-guidelines-v10.3__2021%20(1).pdf – chưa đọc chi tiết). Vì vậy quyết định "hộp giày + thùng ngoài" của ta phù hợp với S10 (UPS) và S1/S3 (GHN: hàng trong thùng carton).

### 4.5. Vật liệu chèn (giấy kraft vs gối khí)

- **S10 [chính thức]** UPS, tr. 2:
  - Air bags: "Used primarily as void-fill material for lightweight items"; "Not recommended for items with sharp corners or edges"; nhiệt độ cực đoan ảnh hưởng hiệu quả.
  - Crumpled kraft paper: "Used primarily as void-fill material for lightweight, non-fragile items. Must be tightly crumpled." "Place at least two inches of paper between contents and outer box."
  - Bubble sheeting: bảo vệ hàng nhẹ, quấn nhiều lớp, đặc biệt ở góc/cạnh.
  - Tr. 3–4: ≥ 2" đệm giữa hàng với nhau và với góc/cạnh/đáy/nắp thùng.
- **S8 [chính thức]** Lazada University, tr. 24–25: khuyến khích dùng giấy/carton cắt sợi thay xốp bong bóng nylon.
- **S4 [blog chính chủ]** GHN: vật chèn gồm giấy bọt khí, mút xốp, hạt xốp; mục tiêu lấp kín khoảng trống để hàng không xê dịch.
- → Với túi xách cứng/phụ kiện dễ vỡ: bọc bọt khí + chèn giấy kraft vò chặt (giấy kraft theo UPS chỉ cho hàng không dễ vỡ, nên hàng dễ vỡ phải bọc bọt khí trước).

### 4.6. Hàng mềm đặt trên hàng cứng

- **S10 [chính thức]** UPS: đặt hàng ở giữa thùng ("Position individual items towards the center of the box"), bọc riêng từng món, đệm giữa các món. Không có câu nào ghi đúng "hàng nặng/cứng ở dưới, hàng mềm ở trên"; quy tắc này của ta là suy luận từ nguyên tắc đệm và chống đè, **chưa có nguồn gốc trực tiếp**.

---

## 5. Điểm chưa xác minh được

1. **GHN có chấp nhận túi niêm phong làm bao bì ngoài cho quần áo không** – văn bản GHN (S3, S4) mô tả "bọc nilon rồi cho vào thùng carton"; không có câu cấm hay cho phép rõ ràng túi niêm phong làm lớp ngoài. Chỉ nguồn thứ cấp (GHN blog về Lazada) mô tả túi Pouch cho quần áo.
2. **Giới hạn kiện chính thức của dịch vụ chuẩn GHN hiện hành** – 30 kg / 150 cm chỉ có ở bài blog (S4); trang Quy trình gửi hàng (S3) để giới hạn trong ảnh; API cho tới 50 kg / 200 cm (S5). Không có bảng giới hạn văn bản hiện hành theo dịch vụ. Quy định miền Bắc 2021 (S7) không rõ còn hiệu lực.
3. **Giới hạn tối đa từng `items[]` trong API GHN** và giới hạn trong API tính phí – tài liệu không công bố.
4. **Lazada VN: quy định riêng cho thời trang/giày**, cho phép túi niêm phong (poly mailer), và yêu cầu "không gửi trần hộp giày" – không tìm thấy trong Cẩm nang Lazada University (S8); Seller Center cần đăng nhập. Chỉ có nguồn thứ cấp.
5. **Cỡ túi 32×43 và 40×50 cm** – không thấy nhà sản xuất VN nào bán sẵn; cỡ phổ biến gần nhất là 32×45 và 38×52 (hoặc 40×60).
6. **Độ dày túi niêm phong (micron)** – nhà sản xuất VN không công bố; con số ~45–50 µm ở mục 3 là ước tính tự tính từ số túi/kg.
7. **Kích thước ghi trên túi có gồm nắp dán không** – chưa có nhà sản xuất nói rõ; 3TH chỉ khuyên chừa ~5 cm mép dán.
8. **Độ dày túi poly Amazon** – blog chính chủ ghi "1mm", diễn đàn Amazon ghi 1,5 mil; trang trợ giúp gốc cần đăng nhập.
9. **Kích thước sau gấp theo cỡ S/M/L/XL** cho áo thun, sơ mi, quần, váy – không có nguồn gốc; FlipFold 9"×12" chỉ có từ nguồn thứ cấp (trang bán lại).
10. **Giấy lụa (tissue) cho váy** – không có hướng dẫn từ hãng vận chuyển/sàn; là thông lệ ngành, chưa có nguồn gốc.
11. **"Hàng mềm đặt trên hàng cứng"** – suy luận từ nguyên tắc UPS, chưa có câu trích trực tiếp.
12. **Hộp giày có đạt chuẩn SIOC/ship-in-own-container** – không có nguồn chính thức; tài liệu chứng nhận Amazon FFP chưa đọc chi tiết.
13. **FedEx/USPS hướng dẫn riêng về poly mailer** – chưa kiểm tra (chỉ dùng UPS làm nguồn hãng quốc tế).
