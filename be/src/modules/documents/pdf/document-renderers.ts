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
  /** (21/10/2026) Người gửi — kiện không giao được hoàn về đây. */
  sender: { name: string; phone: string | null; address: string | null };
  carrierName: string;
  serviceName: string;
  trackingCode: string;
  tripCode: string;
  /** Người nhận chung — chỉ dùng cho kiện không có `recipient` riêng. */
  recipient: { fullName: string; phone: string; address: string };
  parcels: {
    orderId: string;
    /** 28/10/2026 (G3) — người nhận của ĐÚNG đơn có kiện này (nhóm gộp có thể khác tên). */
    recipient?: { fullName: string; phone: string; address: string };
    index: number;
    total: number;
    boxCode: string;
    weightG: number;
    /** C4 (14/10/2026) — mã vận đơn của HÃNG cho riêng kiện này (GHN: 1 kiện = 1 mã). Không có → dùng trackingCode chung. */
    trackingCode?: string | null;
    /** C4 — mã phân loại của hãng (GHN sort_code) in nhỏ dưới mã vạch. */
    sortCode?: string | null;
  }[];
  etaTo: Date | null;
}

/** Nhãn 100 × 150 mm: mã vận đơn Code128 + QR, người nhận, kiện k/n. Mã vận đơn là mã NỘI BỘ. */
export async function renderShippingLabels(data: ShippingLabelData): Promise<Buffer> {
  const { doc, done } = createDoc({ size: [mm(100), mm(150)], margin: mm(5), autoFirstPage: false });
  const sharedBarcode = await barcodePng(data.trackingCode);
  const sharedQr = await qrPng(`${data.trackingCode}|${data.tripCode}`);

  for (const parcel of data.parcels) {
    // C4 — kiện có mã hãng riêng (GHN) thì mã vạch/QR là mã của hãng cho đúng kiện đó.
    const code = parcel.trackingCode ?? data.trackingCode;
    const trackingBarcode = parcel.trackingCode ? await barcodePng(parcel.trackingCode) : sharedBarcode;
    const qr = parcel.trackingCode ? await qrPng(`${parcel.trackingCode}|${data.trackingCode}|${data.tripCode}`) : sharedQr;
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
    doc.font('vn-bold').fontSize(10).text(
      parcel.sortCode ? `${code}  ·  ${parcel.sortCode}` : code,
      left,
      barcodeY + mm(23),
      { width, align: 'center' },
    );

    const recipientY = barcodeY + mm(31);
    doc.moveTo(left, recipientY - 4).lineTo(left + width, recipientY - 4).strokeColor('#000000').stroke();
    const recipient = parcel.recipient ?? data.recipient;
    doc.font('vn-bold').fontSize(8).text('NGƯỜI NHẬN', left, recipientY);
    doc.font('vn-bold').fontSize(12).text(recipient.fullName, left, doc.y, { width });
    doc.font('vn').fontSize(10).text(recipient.phone, { width });
    doc.font('vn').fontSize(10).text(recipient.address, { width });

    // (21/10/2026) Người gửi — nhỏ hơn người nhận, ngay dưới, có kẻ ngăn.
    const senderY = doc.y + mm(2);
    doc.moveTo(left, senderY - 2).lineTo(left + width, senderY - 2).strokeColor('#000000').stroke();
    doc.font('vn-bold').fontSize(7).text('NGƯỜI GỬI', left, senderY);
    doc.font('vn-bold').fontSize(8).text(
      data.sender.phone ? `${data.sender.name} · ${data.sender.phone}` : data.sender.name,
      left,
      doc.y,
      { width },
    );
    // Giới hạn 2 dòng để không đè lên QR/chân nhãn khi địa chỉ dài.
    if (data.sender.address) doc.font('vn').fontSize(8).text(data.sender.address, { width, height: mm(7), ellipsis: true });

    const footerY = doc.page.height - doc.page.margins.bottom - mm(30);
    doc.image(qr, left, footerY, { width: mm(26), height: mm(26) });
    doc.font('vn').fontSize(8);
    doc.text(`Shop: ${data.shopName}`, left + mm(30), footerY, { width: width - mm(30) });
    doc.text(`Chuyến: ${data.tripCode}`, left + mm(30), doc.y, { width: width - mm(30) });
    if (parcel.trackingCode) doc.text(`Vận đơn OptiPack: ${data.trackingCode}`, left + mm(30), doc.y, { width: width - mm(30) });
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

// ---------------------------------------------------------------------------
// (21/10/2026) BẢNG IN DÙNG CHUNG cho picking list + phiếu nhập
// ---------------------------------------------------------------------------

interface TableCol {
  title: string;
  w: number;
}

/** Vẽ bảng đơn giản, tự sang trang (lặp lại dòng tiêu đề) khi chạm `bottomReserve`. */
function drawTable(
  doc: InstanceType<typeof PDFDocument>,
  cols: TableCol[],
  rows: string[][],
  bottomReserve: number,
): void {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const drawRow = (cells: string[], bold: boolean): void => {
    const y = doc.y;
    let x = left;
    let rowHeight = 12;
    cells.forEach((cell, i) => {
      const col = cols[i];
      if (!col) return;
      doc.font(bold ? 'vn-bold' : 'vn').fontSize(8.5);
      rowHeight = Math.max(rowHeight, doc.heightOfString(cell, { width: col.w - 4 }));
      doc.text(cell, x, y, { width: col.w - 4 });
      x += col.w;
    });
    doc.y = y + rowHeight + 3;
    doc.moveTo(left, doc.y - 1).lineTo(left + width, doc.y - 1).strokeColor('#cccccc').stroke();
  };
  drawRow(cols.map((c) => c.title), true);
  for (const row of rows) {
    if (doc.y > doc.page.height - bottomReserve) {
      doc.addPage();
      drawRow(cols.map((c) => c.title), true);
    }
    drawRow(row, false);
  }
}

function drawSignatures(doc: InstanceType<typeof PDFDocument>, titles: string[]): void {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  if (doc.y > doc.page.height - mm(45)) doc.addPage();
  const signY = doc.page.height - doc.page.margins.bottom - mm(28);
  const w = width / titles.length;
  titles.forEach((t, i) => {
    doc.font('vn').fontSize(9).fillColor('#000000').text(t, left + w * i, signY, { width: w, align: 'center' });
    doc.fontSize(8).fillColor('#777777').text('(ký, ghi rõ họ tên)', left + w * i, signY + 12, { width: w, align: 'center' });
  });
  doc.fillColor('#000000');
}

// ---------------------------------------------------------------------------
// (21/10/2026) TEM Ô KỆ — dán lên ô để nhân viên quét khi lấy/cất hàng
// ---------------------------------------------------------------------------

export interface BinLabelData {
  warehouseCode: string;
  bins: { binCode: string; zoneCode: string; zoneName: string; copies: number }[];
}

/** Tem 70 × 40 mm: mã ô cỡ lớn + Code128 (mã quét = đúng `bin_code`) + khu. */
export async function renderBinLabels(data: BinLabelData): Promise<Buffer> {
  const { doc, done } = createDoc({ size: [mm(70), mm(40)], margin: mm(3), autoFirstPage: false });
  for (const bin of data.bins) {
    const barcode = await barcodePng(bin.binCode);
    for (let c = 0; c < bin.copies; c += 1) {
      doc.addPage();
      const left = doc.page.margins.left;
      const width = doc.page.width - left - doc.page.margins.right;
      doc.font('vn').fontSize(6.5).fillColor('#444444').text(
        `${data.warehouseCode} · Khu ${bin.zoneCode} — ${bin.zoneName}`,
        left,
        doc.page.margins.top,
        { width, height: mm(3.5), ellipsis: true },
      );
      doc.fillColor('#000000').font('vn-bold').fontSize(20).text(bin.binCode, left, doc.page.margins.top + mm(3.5), {
        width,
        align: 'center',
      });
      doc.image(barcode, left + mm(2), doc.page.margins.top + mm(14), { width: width - mm(4), height: mm(16) });
    }
  }
  if (data.bins.length === 0) {
    doc.addPage();
    doc.font('vn').fontSize(8).text('Không có ô nào để in tem.');
  }
  doc.end();
  return done;
}

// ---------------------------------------------------------------------------
// (21/10/2026) TEM SKU — dán lên hàng/thùng hàng chưa có mã vạch
// ---------------------------------------------------------------------------

export interface SkuLabelData {
  items: { code: string; name: string; detail: string | null; copies: number }[];
}

/** Tem 50 × 30 mm: tên ngắn, Code128 của SKU (quét được ở lấy hàng + đóng gói), màu/size. */
export async function renderSkuLabels(data: SkuLabelData): Promise<Buffer> {
  const { doc, done } = createDoc({ size: [mm(50), mm(30)], margin: mm(2), autoFirstPage: false });
  for (const item of data.items) {
    const barcode = await barcodePng(item.code);
    for (let c = 0; c < item.copies; c += 1) {
      doc.addPage();
      const left = doc.page.margins.left;
      const width = doc.page.width - left - doc.page.margins.right;
      doc.font('vn-bold').fontSize(6.5).text(item.name, left, doc.page.margins.top, { width, height: mm(5), ellipsis: true });
      doc.image(barcode, left, doc.page.margins.top + mm(5.5), { width, height: mm(13) });
      doc.font('vn-bold').fontSize(7.5).text(item.code, left, doc.page.margins.top + mm(19), { width, align: 'center' });
      if (item.detail) doc.font('vn').fontSize(6).text(item.detail, left, doc.y, { width, align: 'center', height: mm(3), ellipsis: true });
    }
  }
  if (data.items.length === 0) {
    doc.addPage();
    doc.font('vn').fontSize(7).text('Không có SKU nào để in tem.');
  }
  doc.end();
  return done;
}

// ---------------------------------------------------------------------------
// (21/10/2026) DANH SÁCH LẤY HÀNG (picking list) — theo lộ trình ô kệ
// ---------------------------------------------------------------------------

export interface PickingListPrintData {
  groupId: string;
  shopName: string;
  warehouseName: string;
  generatedAt: Date;
  lines: {
    binCode: string;
    zoneCode: string;
    sku: string;
    masterSku: string | null;
    name: string | null;
    lot: { code: string; receivedAt: Date } | null;
    quantity: number;
    pickedQuantity: number;
    otherBins: string[];
  }[];
}

/** A4: thứ tự đi lấy theo ô kệ, lô cũ nhất cần xuất trước (FIFO), số cần lấy, ô tích. */
export async function renderPickingList(data: PickingListPrintData): Promise<Buffer> {
  const { doc, done } = createDoc({ size: 'A4', margin: mm(15) });
  const left = doc.page.margins.left;
  const barcode = await barcodePng(data.groupId);
  doc.font('vn-bold').fontSize(16).text('DANH SÁCH LẤY HÀNG', left, doc.page.margins.top);
  doc.font('vn').fontSize(9).fillColor('#555555').text(`${data.shopName} · ${data.warehouseName} · in lúc ${formatDate(data.generatedAt)}`);
  doc.fillColor('#000000');
  doc.image(barcode, doc.page.width - doc.page.margins.right - mm(55), doc.page.margins.top, { width: mm(55) });
  doc.moveDown(0.6);
  doc.font('vn-bold').fontSize(10).text(`Nhóm đơn: ${data.groupId}`);
  const totalUnits = data.lines.reduce((s, l) => s + l.quantity, 0);
  doc.font('vn').fontSize(9).text(`${String(data.lines.length)} dòng · ${String(totalUnits)} món · đi theo đúng thứ tự dưới đây`);
  doc.moveDown(0.6);

  drawTable(
    doc,
    [
      { title: '#', w: 18 },
      { title: 'Ô kệ', w: 62 },
      { title: 'SKU / tên', w: 175 },
      { title: 'Lô xuất trước', w: 85 },
      { title: 'Cần', w: 34 },
      { title: 'Đã lấy', w: 40 },
      { title: '✓', w: 20 },
    ],
    data.lines.map((l, i) => [
      String(i + 1),
      `${l.binCode}\nKhu ${l.zoneCode}${l.otherBins.length > 0 ? `\nhoặc: ${l.otherBins.join(', ')}` : ''}`,
      `${l.sku}${l.masterSku && l.masterSku !== l.sku ? ` (${l.masterSku})` : ''}${l.name ? `\n${l.name}` : ''}`,
      l.lot ? `${l.lot.code}\n${formatDate(l.lot.receivedAt).split(' ').at(-1) ?? ''}` : '—',
      String(l.quantity),
      l.pickedQuantity > 0 ? String(l.pickedQuantity) : '',
      '☐',
    ]),
    mm(25),
  );
  doc.moveDown(0.8);
  doc.font('vn').fontSize(8).fillColor('#555555').text(
    'Quét mã ô rồi quét mã hàng khi lấy. Thiếu hàng ở ô chính → lấy ở ô "hoặc", vẫn thiếu thì báo thiếu trên máy.',
    left,
    doc.y,
  );
  doc.fillColor('#000000');
  doc.end();
  return done;
}

// ---------------------------------------------------------------------------
// (21/10/2026) PHIẾU NHẬP KHO — thủ kho + người giao ký
// ---------------------------------------------------------------------------

export interface StockReceiptPrintData {
  receiptCode: string;
  warehouseName: string;
  warehouseAddress: string;
  lotCode: string;
  receivedAt: Date;
  supplier: string | null;
  note: string | null;
  createdAt: Date | null;
  lines: { sellerSku: string; masterSku: string | null; platform: string; binCode: string; quantity: number }[];
  totalQuantity: number;
}

export async function renderStockReceipt(data: StockReceiptPrintData): Promise<Buffer> {
  const { doc, done } = createDoc({ size: 'A4', margin: mm(15) });
  const left = doc.page.margins.left;
  const barcode = await barcodePng(data.receiptCode);
  doc.font('vn-bold').fontSize(16).text('PHIẾU NHẬP KHO', left, doc.page.margins.top);
  doc.font('vn').fontSize(9).fillColor('#555555').text(`${data.warehouseName} · ${data.warehouseAddress}`);
  doc.fillColor('#000000');
  doc.image(barcode, doc.page.width - doc.page.margins.right - mm(55), doc.page.margins.top, { width: mm(55) });
  doc.moveDown(0.8);
  doc.font('vn-bold').fontSize(11).text(`Số phiếu: ${data.receiptCode}`);
  doc.font('vn').fontSize(10).text(`Mã lô: ${data.lotCode} · Ngày nhập: ${formatDate(data.receivedAt)}`);
  doc.text(`Nhà cung cấp: ${data.supplier ?? '—'}`);
  if (data.note) doc.text(`Ghi chú: ${data.note}`);
  if (data.createdAt) doc.fontSize(8).fillColor('#555555').text(`Lập trên hệ thống lúc ${formatDate(data.createdAt)}`);
  doc.fillColor('#000000');
  doc.moveDown(0.6);
  drawTable(
    doc,
    [
      { title: '#', w: 20 },
      { title: 'SKU sàn', w: 140 },
      { title: 'SKU nội bộ', w: 110 },
      { title: 'Sàn', w: 55 },
      { title: 'Ô kệ', w: 70 },
      { title: 'Số lượng', w: 50 },
    ],
    data.lines.map((l, i) => [String(i + 1), l.sellerSku, l.masterSku ?? '—', l.platform, l.binCode, String(l.quantity)]),
    mm(50),
  );
  doc.moveDown(0.6);
  doc.font('vn-bold').fontSize(10).text(`Tổng: ${String(data.lines.length)} dòng · ${String(data.totalQuantity)} món`, left, doc.y);
  drawSignatures(doc, ['Người giao hàng', 'Thủ kho', 'Người lập phiếu']);
  doc.end();
  return done;
}
