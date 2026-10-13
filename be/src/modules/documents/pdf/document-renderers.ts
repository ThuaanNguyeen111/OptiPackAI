import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import QRCode from 'qrcode';

/**
 * ===================================================================
 * Bộ render chứng từ PDF — hàm thuần, không DB (30/09/2026)
 * ===================================================================
 * Phiếu đóng gói (packing slip), nhãn vận chuyển (shipping label, mỗi KIỆN một
 * nhãn kèm barcode Code128 + QR) và bảng kê chuyến (manifest). Font DejaVu nhúng
 * sẵn (gói `dejavu-fonts-ttf`) để hiển thị đủ tiếng Việt có dấu trên mọi máy —
 * không phụ thuộc font hệ điều hành. Nhận dữ liệu đã chuẩn bị, trả Buffer PDF.
 * ===================================================================
 */

const FONT_REGULAR = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const FONT_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

/** mm → point (PDF dùng point, 1 mm = 2.8346 pt). */
const mm = (value: number): number => (value * 72) / 25.4;

function createDoc(options: ConstructorParameters<typeof PDFDocument>[0]): {
  doc: InstanceType<typeof PDFDocument>;
  done: Promise<Buffer>;
} {
  const doc = new PDFDocument({ ...options, compress: false });
  doc.registerFont('vn', FONT_REGULAR);
  doc.registerFont('vn-bold', FONT_BOLD);
  doc.font('vn');
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
  });
  return { doc, done };
}

async function barcodePng(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text,
    scale: 3,
    height: 12,
    includetext: false,
    paddingwidth: 2,
    paddingheight: 2,
  });
}

async function qrPng(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
}

const formatDate = (date: Date): string =>
  date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
const formatVnd = (value: number): string => `${value.toLocaleString('vi-VN')} đ`;
const formatKg = (grams: number): string =>
  `${(grams / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 3 })} kg`;

// ---------------------------------------------------------------------------
// PHIẾU ĐÓNG GÓI
// ---------------------------------------------------------------------------

export interface PackingSlipData {
  groupId: string;
  shopName: string;
  generatedAt: Date;
  orders: {
    platformOrderId: string;
    recipient: { fullName: string; phone: string; address: string };
    items: { sku: string; name: string; variation: string | null; quantity: number }[];
    parcels: { index: number; boxCode: string; boxName: string | null; estimatedWeightG: number }[];
  }[];
}

/** Mỗi đơn 1 trang A5: người nhận, danh sách hàng (kèm ô tích), các kiện và thùng dùng. */
export async function renderPackingSlip(data: PackingSlipData): Promise<Buffer> {
  const { doc, done } = createDoc({ size: 'A5', margin: mm(10), autoFirstPage: false });
  const groupBarcode = await barcodePng(data.groupId);

  for (const order of data.orders) {
    doc.addPage();
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.font('vn-bold').fontSize(14).text('PHIẾU ĐÓNG GÓI', { align: 'left' });
    doc.font('vn').fontSize(8).fillColor('#555555').text(`${data.shopName} · in lúc ${formatDate(data.generatedAt)}`);
    doc.image(groupBarcode, doc.page.width - doc.page.margins.right - mm(45), doc.page.margins.top, {
      width: mm(45),
    });
    doc.fillColor('#000000').moveDown(0.8);

    doc.font('vn-bold').fontSize(10).text(`Đơn ${order.platformOrderId}`);
    doc.font('vn').fontSize(9).text(`Nhóm ${data.groupId}`);
    doc.moveDown(0.5);
    doc.font('vn-bold').fontSize(9).text('Người nhận');
    doc.font('vn').fontSize(9).text(`${order.recipient.fullName} · ${order.recipient.phone}`);
    doc.text(order.recipient.address, { width });
    doc.moveDown(0.6);

    doc.font('vn-bold').fontSize(9).text('Hàng trong đơn');
    const startY = doc.y + 2;
    doc.moveTo(doc.page.margins.left, startY).lineTo(doc.page.margins.left + width, startY).strokeColor('#999999').stroke();
    doc.y = startY + 4;
    for (const item of order.items) {
      const label = item.variation ? `${item.name} (${item.variation})` : item.name;
      const rowY = doc.y;
      doc.rect(doc.page.margins.left, rowY + 1, 8, 8).strokeColor('#000000').stroke();
      doc.font('vn').fontSize(9).text(`${String(item.quantity)} ×`, doc.page.margins.left + 14, rowY, { width: 24 });
      doc.font('vn').fontSize(9).text(label, doc.page.margins.left + 40, rowY, { width: width - 40 });
      doc.font('vn').fontSize(7).fillColor('#666666').text(item.sku, doc.page.margins.left + 40, doc.y);
      doc.fillColor('#000000').moveDown(0.3);
    }

    doc.moveDown(0.4);
    doc.font('vn-bold').fontSize(9).text(`Đóng thành ${String(order.parcels.length)} kiện`);
    for (const parcel of order.parcels) {
      doc
        .font('vn')
        .fontSize(9)
        .text(
          `Kiện ${String(parcel.index + 1)}/${String(order.parcels.length)} — thùng ${parcel.boxName ?? parcel.boxCode} (${parcel.boxCode}), ước tính ${formatKg(parcel.estimatedWeightG)}`,
        );
    }
    if (order.parcels.length === 0) {
      doc.font('vn').fontSize(9).fillColor('#b45309').text('Chưa có phương án đóng gói được duyệt cho đơn này.');
      doc.fillColor('#000000');
    }
  }
  if (data.orders.length === 0) {
    doc.addPage();
    doc.font('vn').fontSize(10).text('Nhóm không có đơn nào để in phiếu.');
  }
  doc.end();
  return done;
}

// ---------------------------------------------------------------------------
// NHÃN VẬN CHUYỂN (mỗi kiện một nhãn)
// ---------------------------------------------------------------------------

export interface ShippingLabelData {
  shopName: string;
  carrierName: string;
  serviceName: string;
  trackingCode: string;
  tripCode: string;
  recipient: { fullName: string; phone: string; address: string };
  parcels: { orderId: string; index: number; total: number; boxCode: string; weightG: number }[];
  etaTo: Date | null;
}

/** Nhãn 100 × 150 mm: mã vận đơn Code128 + QR, người nhận, kiện k/n. Mã vận đơn là mã NỘI BỘ. */
export async function renderShippingLabels(data: ShippingLabelData): Promise<Buffer> {
  const { doc, done } = createDoc({ size: [mm(100), mm(150)], margin: mm(5), autoFirstPage: false });
  const trackingBarcode = await barcodePng(data.trackingCode);
  const qr = await qrPng(`${data.trackingCode}|${data.tripCode}`);

  for (const parcel of data.parcels) {
    doc.addPage();
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;

    doc.font('vn-bold').fontSize(11).text(data.carrierName, left, doc.page.margins.top, { width: width * 0.62 });
    doc.font('vn').fontSize(8).text(data.serviceName, { width: width * 0.62 });
    doc.font('vn-bold').fontSize(20).text(`${String(parcel.index + 1)}/${String(parcel.total)}`, left + width * 0.66, doc.page.margins.top, {
      width: width * 0.34,
      align: 'right',
    });

    const barcodeY = doc.page.margins.top + mm(16);
    doc.image(trackingBarcode, left, barcodeY, { width, height: mm(22) });
    doc.font('vn-bold').fontSize(10).text(data.trackingCode, left, barcodeY + mm(23), { width, align: 'center' });

    const recipientY = barcodeY + mm(31);
    doc.moveTo(left, recipientY - 4).lineTo(left + width, recipientY - 4).strokeColor('#000000').stroke();
    doc.font('vn-bold').fontSize(8).text('NGƯỜI NHẬN', left, recipientY);
    doc.font('vn-bold').fontSize(12).text(data.recipient.fullName, left, doc.y, { width });
    doc.font('vn').fontSize(10).text(data.recipient.phone, { width });
    doc.font('vn').fontSize(10).text(data.recipient.address, { width });

    const footerY = doc.page.height - doc.page.margins.bottom - mm(30);
    doc.image(qr, left, footerY, { width: mm(26), height: mm(26) });
    doc.font('vn').fontSize(8);
    doc.text(`Từ: ${data.shopName}`, left + mm(30), footerY, { width: width - mm(30) });
    doc.text(`Chuyến: ${data.tripCode}`, left + mm(30), doc.y, { width: width - mm(30) });
    doc.text(`Thùng: ${parcel.boxCode}`, left + mm(30), doc.y, { width: width - mm(30) });
    doc.text(`Cân: ${formatKg(parcel.weightG)}`, left + mm(30), doc.y, { width: width - mm(30) });
    if (data.etaTo) doc.text(`Giao dự kiến trước: ${formatDate(data.etaTo).split(' ').at(-1) ?? ''}`, left + mm(30), doc.y, { width: width - mm(30) });
  }
  if (data.parcels.length === 0) {
    doc.addPage();
    doc.font('vn').fontSize(10).text('Vận đơn chưa có kiện nào để in nhãn.');
  }
  doc.end();
  return done;
}

// ---------------------------------------------------------------------------
// BẢNG KÊ CHUYẾN (manifest)
// ---------------------------------------------------------------------------

export interface ManifestData {
  tripCode: string;
  shopName: string;
  carrierName: string | null;
  generatedAt: Date;
  pickupAt: Date | null;
  shipments: {
    trackingCode: string;
    orderGroupId: string;
    recipientName: string;
    recipientAddress: string;
    parcelCount: number;
    chargeableWeightG: number;
    costVnd: number | null;
  }[];
}

/** Bảng kê A4: mọi vận đơn của 1 chuyến + tổng, chỗ ký giao nhận với hãng. */
export async function renderManifest(data: ManifestData): Promise<Buffer> {
  const { doc, done } = createDoc({ size: 'A4', margin: mm(15) });
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const barcode = await barcodePng(data.tripCode);

  doc.font('vn-bold').fontSize(16).text('BẢNG KÊ CHUYẾN GIAO HÀNG', left, doc.page.margins.top);
  doc.font('vn').fontSize(9).fillColor('#555555').text(`${data.shopName} · in lúc ${formatDate(data.generatedAt)}`);
  doc.fillColor('#000000');
  doc.image(barcode, doc.page.width - doc.page.margins.right - mm(55), doc.page.margins.top, { width: mm(55) });
  doc.moveDown(0.8);
  doc.font('vn-bold').fontSize(11).text(`Mã chuyến: ${data.tripCode}`);
  doc.font('vn').fontSize(10).text(`Hãng vận chuyển: ${data.carrierName ?? '—'}`);
  doc.text(`Hẹn lấy hàng: ${data.pickupAt ? formatDate(data.pickupAt) : 'chưa hẹn'}`);
  doc.moveDown(0.6);

  const cols = [
    { title: '#', w: 18 },
    { title: 'Mã vận đơn', w: 92 },
    { title: 'Người nhận', w: 120 },
    { title: 'Kiện', w: 30 },
    { title: 'Cân tính cước', w: 62 },
    { title: 'Cước ước tính', w: 72 },
  ];
  const drawRow = (cells: string[], bold: boolean): void => {
    const y = doc.y;
    let x = left;
    let rowHeight = 12;
    cells.forEach((cell, i) => {
      const col = cols[i];
      if (!col) return;
      doc.font(bold ? 'vn-bold' : 'vn').fontSize(8.5);
      const h = doc.heightOfString(cell, { width: col.w - 4 });
      rowHeight = Math.max(rowHeight, h);
      doc.text(cell, x, y, { width: col.w - 4 });
      x += col.w;
    });
    doc.y = y + rowHeight + 3;
    doc.moveTo(left, doc.y - 1).lineTo(left + width, doc.y - 1).strokeColor('#cccccc').stroke();
  };
  drawRow(cols.map((c) => c.title), true);
  let totalParcels = 0;
  let totalG = 0;
  let totalCost = 0;
  data.shipments.forEach((s, i) => {
    if (doc.y > doc.page.height - mm(45)) {
      doc.addPage();
      drawRow(cols.map((c) => c.title), true);
    }
    totalParcels += s.parcelCount;
    totalG += s.chargeableWeightG;
    totalCost += s.costVnd ?? 0;
    drawRow(
      [
        String(i + 1),
        s.trackingCode,
        `${s.recipientName}\n${s.recipientAddress}`,
        String(s.parcelCount),
        formatKg(s.chargeableWeightG),
        s.costVnd === null ? '—' : formatVnd(s.costVnd),
      ],
      false,
    );
  });
  doc.moveDown(0.6);
  doc
    .font('vn-bold')
    .fontSize(10)
    .text(`Tổng: ${String(data.shipments.length)} vận đơn · ${String(totalParcels)} kiện · ${formatKg(totalG)} tính cước · ${formatVnd(totalCost)}`, left, doc.y);

  if (doc.y > doc.page.height - mm(50)) doc.addPage();
  const signY = doc.page.height - doc.page.margins.bottom - mm(28);
  doc.font('vn').fontSize(9);
  doc.text('Người giao (kho)', left, signY, { width: width / 2, align: 'center' });
  doc.text('Người nhận (hãng vận chuyển)', left + width / 2, signY, { width: width / 2, align: 'center' });
  doc.fontSize(8).fillColor('#777777').text('(ký, ghi rõ họ tên)', left, signY + 12, { width: width / 2, align: 'center' });
  doc.text('(ký, ghi rõ họ tên)', left + width / 2, signY + 12, { width: width / 2, align: 'center' });
  doc.end();
  return done;
}
