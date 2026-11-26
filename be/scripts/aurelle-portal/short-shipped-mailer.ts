import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { Connection, Types } from 'mongoose';
import { buildBackorderEmail, buildShortShippedEmail } from '../../src/modules/storefront/aurelle-short-shipped-mail';

/**
 * 26/11/2026 — Website AURELLE gửi email cho khách khi OptiPack báo giao thiếu.
 * 🔄 27/11/2026 — giao thiếu kèm hạn xác nhận (khách đồng ý / hủy trước khi shop đóng gói) và email
 * "đang chờ bổ sung hàng" (`backordered`).
 * Dùng chung cấu hình SMTP `MAIL_*` với BE (k8s: cùng Secret). Thiếu cấu hình → chỉ log, bỏ qua.
 * Lỗi gửi KHÔNG làm hỏng việc nhận trạng thái (gọi kiểu fire-and-forget).
 */
let transporter: Transporter | null | undefined;

/** Đọc field chuỗi/số từ document thô (collection không có kiểu). */
function text(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

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

interface OrderMailContext {
  mailer: Transporter;
  order: Record<string, unknown> & { _id: Types.ObjectId };
  to: string;
  customerName: string;
  items: Record<string, unknown>[];
  orderUrl: string;
}

async function loadContext(conn: Connection, publicOrderId: number): Promise<OrderMailContext | null> {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn('[AURELLE] Chưa cấu hình MAIL_* — bỏ qua email cho khách.');
    return null;
  }
  const order = await conn.collection('storefront_orders').findOne({ public_order_id: publicOrderId });
  if (!order?.customer_id) return null;
  const customer = await conn.collection('customers').findOne({ _id: order.customer_id as Types.ObjectId });
  const email: unknown = customer?.email;
  const name: unknown = customer?.name;
  if (typeof email !== 'string' || !email) return null;
  const items = await conn.collection('storefront_order_items').find({ order_id: order._id }).toArray();
  const base = (process.env.STOREFRONT_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
  return {
    mailer,
    order,
    to: email,
    customerName: typeof name === 'string' && name ? name : 'bạn',
    items,
    orderUrl: `${base}/account/orders/${String(order._id)}`,
  };
}

async function send(ctx: OrderMailContext, mail: { subject: string; html: string }): Promise<void> {
  const fromName = process.env.STOREFRONT_NAME ?? 'AURELLE';
  const fromAddress = process.env.MAIL_FROM_ADDRESS?.trim() ? process.env.MAIL_FROM_ADDRESS : (process.env.MAIL_USER ?? '');
  await ctx.mailer.sendMail({ from: `"${fromName}" <${fromAddress}>`, to: ctx.to, ...mail });
}

export async function sendShortShippedEmail(conn: Connection, publicOrderId: number): Promise<void> {
  try {
    const ctx = await loadContext(conn, publicOrderId);
    if (!ctx) return;
    const lines = ctx.items.map((i) => {
      const quantity = Number(i.quantity ?? 0);
      return {
        productName: text(i.product_name_snapshot, text(i.sku_snapshot, '')),
        variant: text(i.variant_snapshot, ''),
        ordered: quantity,
        short: Number(i.short_quantity ?? 0),
        unitPrice: quantity > 0 ? Number(i.line_total ?? 0) / quantity : Number(i.unit_price ?? 0),
      };
    });
    if (!lines.some((l) => l.short > 0)) return;
    const confirmation = ctx.order.short_ship_confirmation as { status?: string; deadline_at?: Date | null } | null | undefined;
    await send(ctx, buildShortShippedEmail({
      customerName: ctx.customerName,
      orderNumber: text(ctx.order.order_number, String(publicOrderId)),
      lines,
      totalAmount: Number(ctx.order.total_amount ?? 0),
      shortAmount: Number(ctx.order.short_refund_amount ?? 0),
      cancelled: ctx.order.status === 'cancelled',
      orderUrl: ctx.orderUrl,
      confirmDeadline: confirmation?.status === 'pending' ? (confirmation.deadline_at ?? null) : null,
    }));
  } catch (error: unknown) {
    console.error(`[AURELLE] Gửi email giao thiếu đơn ${String(publicOrderId)} thất bại: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 27/11/2026 — đơn đang chờ shop bổ sung hàng (kho lấy lại mà tồn không đủ). */
export async function sendBackorderEmail(conn: Connection, publicOrderId: number): Promise<void> {
  try {
    const ctx = await loadContext(conn, publicOrderId);
    if (!ctx) return;
    const backorder = ctx.order.backorder as { items?: { sku: string; missing_quantity: number }[] } | null | undefined;
    const missing = backorder?.items ?? [];
    if (missing.length === 0) return;
    const lines = missing.map((m) => {
      const item = ctx.items.find((i) => text(i.sku_snapshot, '').trim().toUpperCase() === m.sku.trim().toUpperCase());
      return {
        productName: text(item?.product_name_snapshot, m.sku),
        variant: text(item?.variant_snapshot, ''),
        missing: m.missing_quantity,
      };
    });
    await send(ctx, buildBackorderEmail({
      customerName: ctx.customerName,
      orderNumber: text(ctx.order.order_number, String(publicOrderId)),
      lines,
      orderUrl: ctx.orderUrl,
    }));
  } catch (error: unknown) {
    console.error(`[AURELLE] Gửi email chờ bổ sung hàng đơn ${String(publicOrderId)} thất bại: ${error instanceof Error ? error.message : String(error)}`);
  }
}
