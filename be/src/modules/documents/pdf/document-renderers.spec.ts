import {
  renderManifest,
  renderPackingSlip,
  renderShippingLabels,
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
