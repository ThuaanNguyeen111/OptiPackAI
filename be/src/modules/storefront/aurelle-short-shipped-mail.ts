/**
 * 26/11/2026 — Email báo khách AURELLE khi kho giao thiếu (OptiPack gửi `short_shipped`).
 * Hàm thuần: chỉ dựng tiêu đề + HTML từ dữ liệu đơn, không gửi (bên gửi nằm ở mock server
 * `scripts/aurelle-portal/short-shipped-mailer.ts`). Phí ship giữ nguyên, chỉ trừ tiền món thiếu.
 */

export interface ShortShippedMailLine {
  productName: string;
  variant: string;
  ordered: number;
  short: number;
  unitPrice: number;
}

export interface ShortShippedMailInput {
  customerName: string;
  orderNumber: string;
  lines: ShortShippedMailLine[];
  totalAmount: number;
  shortAmount: number;
  /** Thiếu toàn bộ → website đã hủy đơn. */
  cancelled: boolean;
  orderUrl: string;
}

export function formatVnd(value: number): string {
  return `${Math.round(value).toLocaleString('vi-VN')}₫`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildShortShippedEmail(input: ShortShippedMailInput): { subject: string; html: string } {
  const lines = input.lines.filter((l) => l.short > 0);
  const due = Math.max(0, Math.round(input.totalAmount - input.shortAmount));
  const order = escapeHtml(input.orderNumber);
  const subject = input.cancelled
    ? `Đơn ${input.orderNumber} đã bị hủy do hết hàng`
    : `Đơn ${input.orderNumber} được giao thiếu ${String(lines.reduce((s, l) => s + l.short, 0))} sản phẩm`;

  const rows = lines
    .map(
      (l) => `<tr>
  <td style="padding:8px 0;border-bottom:1px solid #eee">${escapeHtml(l.productName)}<br><span style="color:#777;font-size:13px">${escapeHtml(l.variant)}</span></td>
  <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center">${String(l.ordered)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center">${String(l.ordered - l.short)}</td>
  <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${formatVnd(l.unitPrice * l.short)}</td>
</tr>`,
    )
    .join('');

  const money = input.cancelled
    ? `<p style="margin:16px 0">Đơn hàng thanh toán khi nhận hàng (COD) nên bạn chưa bị trừ tiền.</p>`
    : `<table style="width:100%;margin:16px 0;font-size:14px">
  <tr><td>Tổng đơn ban đầu</td><td style="text-align:right">${formatVnd(input.totalAmount)}</td></tr>
  <tr><td>Giảm trừ phần giao thiếu</td><td style="text-align:right">− ${formatVnd(input.shortAmount)}</td></tr>
  <tr><td style="padding-top:6px"><strong>Số tiền cần trả khi nhận hàng</strong></td><td style="padding-top:6px;text-align:right"><strong>${formatVnd(due)}</strong></td></tr>
</table>
<p style="margin:0 0 16px;color:#555;font-size:13px">Phí vận chuyển giữ nguyên vì đơn vẫn được giao trong một kiện.</p>`;

  const intro = input.cancelled
    ? `Rất tiếc, kho không còn hàng cho đơn <strong>${order}</strong> nên đơn đã được hủy.`
    : `Kho không đủ hàng cho một số sản phẩm trong đơn <strong>${order}</strong>. Chúng tôi sẽ giao phần có sẵn và không tính tiền phần thiếu.`;

  const html = `<!doctype html>
<html lang="vi"><body style="margin:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#222">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <p style="font-size:18px;letter-spacing:2px;margin:0 0 24px"><strong>AURELLE</strong></p>
  <p style="margin:0 0 12px">Chào ${escapeHtml(input.customerName)},</p>
  <p style="margin:0 0 16px">${intro}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr style="color:#777;font-size:13px"><th style="text-align:left;padding-bottom:6px">Sản phẩm</th><th style="padding-bottom:6px">Đặt</th><th style="padding-bottom:6px">Giao</th><th style="text-align:right;padding-bottom:6px">Giảm trừ</th></tr>
    ${rows}
  </table>
  ${money}
  <p style="margin:0 0 24px"><a href="${escapeHtml(input.orderUrl)}" style="color:#222">Xem chi tiết đơn hàng</a></p>
  <p style="margin:0;color:#777;font-size:13px">Xin lỗi vì sự bất tiện này. Nếu cần hỗ trợ, bạn chỉ cần trả lời email này.</p>
</div>
</body></html>`;
  return { subject, html };
}
