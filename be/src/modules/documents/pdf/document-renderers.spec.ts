import {
  renderBinLabels,
  renderManifest,
  renderPackingSlip,
  renderPickingList,
  renderShippingLabels,
  renderSkuLabels,
  renderStockReceipt,
} from './document-renderers';

const pageCount = (pdf: Buffer): number =>
  (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
const recipient = {
  fullName: 'Nguyễn Văn Ánh',
  phone: '0901234567',
  address: '12 Lê Lợi, Quận 1, TP.HCM',
};

// Dựng PDF + nhúng font + sinh mã vạch tốn vài giây khi jest chạy song song cả backend
// (hook pre-commit) — 5 s mặc định làm test này lúc qua lúc trượt.
jest.setTimeout(30_000);

describe('document-renderers', () => {
  it('phiếu đóng gói: PDF hợp lệ, mỗi đơn một trang', async () => {
    const pdf = await renderPackingSlip({
      groupId: 'G1',
      shopName: 'Shop A',
      generatedAt: new Date(),
      orders: [1, 2].map((n) => ({
        platformOrderId: `ORD-${String(n)}`,
        recipient,
        items: [
          { sku: 'SKU-1', name: 'Giày thể thao', variation: '42', quantity: 2 },
        ],
        parcels: [
          { index: 0, boxCode: 'M', boxName: 'Thùng M', estimatedWeightG: 1500 },
        ],
      })),
    });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pageCount(pdf)).toBe(2);
  });

  it('phiếu đóng gói: nhóm rỗng vẫn ra 1 trang thông báo', async () => {
    const pdf = await renderPackingSlip({
      groupId: 'G',
      shopName: 'S',
      generatedAt: new Date(),
      orders: [],
    });
    expect(pageCount(pdf)).toBe(1);
  });

  it('nhãn vận chuyển: mỗi kiện một trang', async () => {
    const pdf = await renderShippingLabels({
      shopName: 'Shop A',
      sender: { name: 'Kho OptiPack Thủ Đức', phone: '0901234567', address: '12 Võ Văn Ngân, Phường Linh Chiểu, TP. Thủ Đức, TP. Hồ Chí Minh — cổng sau, gọi trước khi hoàn hàng' },
      carrierName: 'Hãng mẫu',
      serviceName: 'Giao nhanh',
      trackingCode: 'OPK-ABCDEF1234',
      tripCode: 'TRIP-260930-AB12',
      recipient,
      parcels: [0, 1, 2].map((i) => ({
        orderId: 'O1',
        index: i,
        total: 3,
        boxCode: 'M',
        weightG: 900,
      })),
      etaTo: new Date(),
    });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pageCount(pdf)).toBe(3);
  });

  it('C4 (14/10/2026) — nhãn vận đơn GHN: mỗi kiện in mã hãng riêng (mã vạch khác nhau), vẫn 1 trang/kiện', async () => {
    const pdf = await renderShippingLabels({
      shopName: 'Shop A',
      sender: { name: 'Kho Thủ Đức', phone: null, address: null },
      carrierName: 'Giao Hàng Nhanh (GHN)',
      serviceName: 'Hàng nhẹ',
      trackingCode: 'SHP-261014-ABCDEF',
      tripCode: '—',
      recipient,
      parcels: [0, 1].map((i) => ({
        orderId: 'O1',
        index: i,
        total: 2,
        boxCode: 'BAG',
        weightG: 300,
        trackingCode: `L88K7P${String(i)}`,
        sortCode: 'GXT-M-11-00',
      })),
      etaTo: null,
    });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pageCount(pdf)).toBe(2);
  });

  // (21/10/2026) tem + phiếu in kho
  it('tem ô kệ: mỗi ô × số bản = 1 trang 70×40 mm; không có ô vẫn ra PDF 1 trang báo trống', async () => {
    const pdf = await renderBinLabels({
      warehouseCode: 'WH-HCM',
      bins: [
        { binCode: 'A-01-01', zoneCode: 'A', zoneName: 'Áo thun', copies: 2 },
        { binCode: 'A-01-02', zoneCode: 'A', zoneName: 'Áo thun', copies: 1 },
      ],
    });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pageCount(pdf)).toBe(3);
    expect(pageCount(await renderBinLabels({ warehouseCode: 'WH', bins: [] }))).toBe(1);
  });

  it('tem SKU: mỗi mã × số bản = 1 trang; SKU sàn không có chi tiết vẫn in', async () => {
    const pdf = await renderSkuLabels({
      items: [
        { code: 'AOT-001-DEN-M', name: 'Áo thun cổ tròn basic', detail: 'Màu DEN · Size M', copies: 3 },
        { code: 'LZ-SKU-9', name: 'SKU sàn', detail: null, copies: 1 },
      ],
    });
    expect(pageCount(pdf)).toBe(4);
  });

  it('picking list: A4, sang trang khi nhiều dòng', async () => {
    const line = (n: number): Parameters<typeof renderPickingList>[0]['lines'][number] => ({
      binCode: `A-01-${String(n).padStart(2, '0')}`,
      zoneCode: 'A',
      sku: `SKU-${String(n)}`,
      masterSku: n % 2 === 0 ? `AOT-00${String(n)}-DEN-M` : null,
      name: 'Áo thun cổ tròn',
      lot: n % 3 === 0 ? { code: 'LO-2610', receivedAt: new Date('2026-10-01') } : null,
      quantity: 2,
      pickedQuantity: 0,
      otherBins: n === 1 ? ['B-02-01'] : [],
    });
    const small = await renderPickingList({ groupId: '6a8000000000000000000001', shopName: 'Shop', warehouseName: 'Kho HCM', generatedAt: new Date(), lines: [1, 2, 3].map(line) });
    expect(pageCount(small)).toBe(1);
    const big = await renderPickingList({
      groupId: '6a8000000000000000000001',
      shopName: 'Shop',
      warehouseName: 'Kho HCM',
      generatedAt: new Date(),
      lines: Array.from({ length: 60 }, (_, i) => line(i + 1)),
    });
    expect(pageCount(big)).toBeGreaterThan(1);
  });

  it('phiếu nhập kho: PDF hợp lệ có chỗ ký', async () => {
    const pdf = await renderStockReceipt({
      receiptCode: 'PN-261021-0001',
      warehouseName: 'Kho HCM',
      warehouseAddress: '12 Võ Văn Ngân, Thủ Đức',
      lotCode: 'LO-2610',
      receivedAt: new Date(),
      supplier: 'Xưởng may A',
      note: null,
      createdAt: new Date(),
      lines: [{ sellerSku: 'LZ-1', masterSku: 'AOT-001-DEN-M', platform: 'lazada', binCode: 'A-01-01', quantity: 20 }],
      totalQuantity: 20,
    });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pageCount(pdf)).toBe(1);
  });

  it('bảng kê: 1 trang cho vài vận đơn, sang trang khi nhiều', async () => {
    const mk = (
      n: number,
    ): Parameters<typeof renderManifest>[0]['shipments'][number] => ({
      trackingCode: `OPK-${String(n)}`,
      orderGroupId: 'G',
      recipientName: 'Khách',
      recipientAddress: 'Địa chỉ dài dài dài dài dài dài dài dài dài dài',
      parcelCount: 1,
      chargeableWeightG: 800,
      costVnd: 25000,
    });
    const base = {
      tripCode: 'TRIP-1',
      shopName: 'S',
      carrierName: 'H',
      generatedAt: new Date(),
      pickupAt: null,
    };
    const small = await renderManifest({ ...base, shipments: [mk(1), mk(2)] });
    const big = await renderManifest({
      ...base,
      shipments: Array.from({ length: 60 }, (_, i) => mk(i)),
    });
    expect(small.subarray(0, 4).toString()).toBe('%PDF');
    expect(pageCount(small)).toBe(1);
    expect(pageCount(big)).toBeGreaterThan(1);
  });
});
