import { buildShortShippedEmail } from './aurelle-short-shipped-mail';

describe('buildShortShippedEmail (26/11/2026)', () => {
  const base = {
    customerName: 'Lan <b>',
    orderNumber: 'AUR-0001',
    lines: [
      { productName: 'Quần jean ống rộng', variant: 'Trắng / L', ordered: 3, short: 1, unitPrice: 200000 },
      { productName: 'Áo thun', variant: 'Đen / M', ordered: 1, short: 0, unitPrice: 150000 },
    ],
    totalAmount: 780000,
    shortAmount: 200000,
    cancelled: false,
    orderUrl: 'http://localhost:3001/account/orders/abc',
  };

  it('giao thiếu: tiêu đề nêu số thiếu, có số tiền cần trả = tổng − phần thiếu, chỉ liệt kê dòng thiếu', () => {
    const { subject, html } = buildShortShippedEmail(base);
    expect(subject).toBe('Đơn AUR-0001 được giao thiếu 1 sản phẩm');
    expect(html).toContain('Số tiền cần trả khi nhận hàng');
    expect(html).toContain(`${(580000).toLocaleString('vi-VN')}₫`);
    expect(html).toContain('Quần jean ống rộng');
    expect(html).not.toContain('Áo thun');
    expect(html).toContain('Lan &lt;b&gt;');
  });

  it('thiếu toàn bộ (đơn đã hủy): báo hủy, không có dòng cần trả', () => {
    const { subject, html } = buildShortShippedEmail({ ...base, cancelled: true });
    expect(subject).toBe('Đơn AUR-0001 đã bị hủy do hết hàng');
    expect(html).not.toContain('Số tiền cần trả khi nhận hàng');
  });
});
