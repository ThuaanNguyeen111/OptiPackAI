import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { Connection, Types } from 'mongoose';
import { buildShortShippedEmail } from '../../src/modules/storefront/aurelle-short-shipped-mail';

/**
 * 26/11/2026 — Website AURELLE gửi email cho khách khi OptiPack báo giao thiếu.
 * Dùng chung cấu hình SMTP `MAIL_*` với BE (k8s: cùng Secret). Thiếu cấu hình → chỉ log, bỏ qua.
 * Lỗi gửi KHÔNG làm hỏng việc nhận trạng thái (gọi kiểu fire-and-forget).
 */
let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const host = process.env.MAIL_HOST;
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASSWORD;
  transporter = host && user && pass
    ? nodemailer.createTransport({
      host,
      port: Number(process.env.MAIL_PORT ?? '587'),
      secure: process.env.MAIL_SECURE === 'true',
      auth: { user, pass },
    })
    : null;
  return transporter;
}

export async function sendShortShippedEmail(conn: Connection, publicOrderId: number): Promise<void> {
  try {
    const mailer = getTransporter();
    if (!mailer) {
      console.warn('[AURELLE] Chưa cấu hình MAIL_* — bỏ qua email giao thiếu.');
      return;
    }
    const order = await conn.collection('storefront_orders').findOne({ public_order_id: publicOrderId });
    if (!order?.customer_id) return;
    const customer = await conn.collection('customers').findOne({ _id: order.customer_id as Types.ObjectId });
    const email: unknown = customer?.email;
    const to = typeof email === 'string' ? email : '';
    if (!to) return;
    const items = await conn.collection('storefront_order_items').find({ order_id: order._id }).toArray();
    const lines = items.map((i) => {
      const quantity = Number(i.quantity ?? 0);
      return {
        productName: String(i.product_name_snapshot ?? i.sku_snapshot ?? ''),
        variant: String(i.variant_snapshot ?? ''),
        ordered: quantity,
        short: Number(i.short_quantity ?? 0),
        unitPrice: quantity > 0 ? Number(i.line_total ?? 0) / quantity : Number(i.unit_price ?? 0),
      };
    });
    if (!lines.some((l) => l.short > 0)) return;
    const base = (process.env.STOREFRONT_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
    const { subject, html } = buildShortShippedEmail({
      customerName: typeof customer?.name === 'string' && customer.name ? customer.name : 'bạn',
      orderNumber: String(order.order_number ?? publicOrderId),
      lines,
      totalAmount: Number(order.total_amount ?? 0),
      shortAmount: Number(order.short_refund_amount ?? 0),
      cancelled: order.status === 'cancelled',
      orderUrl: `${base}/account/orders/${String(order._id)}`,
    });
    const fromName = process.env.STOREFRONT_NAME ?? 'AURELLE';
    const fromAddress = process.env.MAIL_FROM_ADDRESS?.trim() ? process.env.MAIL_FROM_ADDRESS : (process.env.MAIL_USER ?? '');
    await mailer.sendMail({ from: `"${fromName}" <${fromAddress}>`, to, subject, html });
  } catch (error: unknown) {
    console.error(`[AURELLE] Gửi email giao thiếu đơn ${String(publicOrderId)} thất bại: ${error instanceof Error ? error.message : String(error)}`);
  }
}
