import {
  EXPRESS_SHIPPING_FEE,
  deliveryOptionsFor,
  expressUnavailableReason,
  isExpressLate,
  isExpressProvince,
  isExpressWindowOpen,
  promisedDeliveryAt,
  shippingFeeFor,
} from './express-delivery.policy';
import { DEFAULT_EXPRESS_WARDS } from './express-delivery-wards';
import { STANDARD_SHIPPING_FEE } from './storefront-pricing';

//!=============================================
// 29/10/2026 — Giao hỏa tốc AURELLE (Thuận chốt): 45.000đ, phường trong danh sách,
// 8:00–14:00 thứ 2–7 (giờ VN), hẹn giao giờ đặt + 3 giờ, đơn từ 1 triệu miễn phí cả 2 cách giao.
//!=============================================
describe('express-delivery.policy', () => {
  // 29/10/2026 là thứ năm. 09:00 VN = 02:00 UTC.
  const thu0900 = new Date('2026-10-29T02:00:00.000Z');
  const thu1400 = new Date('2026-10-29T07:00:00.000Z');
  const thu0759 = new Date('2026-10-29T00:59:00.000Z');
  const sun1000 = new Date('2026-11-01T03:00:00.000Z');
  const sat1300 = new Date('2026-10-31T06:00:00.000Z');

  it('khung nhận đơn 8:00–14:00 thứ 2–7, theo giờ Việt Nam', () => {
    expect(isExpressWindowOpen(thu0900)).toBe(true);
    expect(isExpressWindowOpen(sat1300)).toBe(true);
    expect(isExpressWindowOpen(thu1400)).toBe(false); // đúng 14:00 là hết nhận
    expect(isExpressWindowOpen(thu0759)).toBe(false);
    expect(isExpressWindowOpen(sun1000)).toBe(false);
  });

  it('tỉnh TP.HCM viết kiểu nào cũng nhận; phường so không phân biệt dấu/hoa thường', () => {
    expect(isExpressProvince('Thành phố Hồ Chí Minh')).toBe(true);
    expect(isExpressProvince('Hồ Chí Minh')).toBe(true);
    expect(isExpressProvince('TP. Hồ Chí Minh')).toBe(true);
    expect(isExpressProvince('Hà Nội')).toBe(false);
    expect(expressUnavailableReason('Thành phố Hồ Chí Minh', 'phuong ben thanh', thu0900, DEFAULT_EXPRESS_WARDS)).toBeNull();
  });

  it('danh sách mặc định có nội thành cũ, Thủ Đức, Bình Dương gần; không có Vũng Tàu, Cần Giờ', () => {
    expect(DEFAULT_EXPRESS_WARDS).toEqual(expect.arrayContaining(['Phường Bến Thành', 'Phường Thủ Dầu Một', 'Phường Dĩ An', 'Phường Thuận An']));
    expect(DEFAULT_EXPRESS_WARDS).not.toContain('Phường Vũng Tàu');
    expect(DEFAULT_EXPRESS_WARDS).not.toContain('Xã Cần Giờ');
    expect(DEFAULT_EXPRESS_WARDS).toHaveLength(91);
  });

  it('lý do không được hỏa tốc: thiếu địa chỉ → ngoài vùng → ngoài giờ', () => {
    expect(expressUnavailableReason('', '', thu0900, DEFAULT_EXPRESS_WARDS)).toBe('missing_address');
    expect(expressUnavailableReason('Thành phố Hồ Chí Minh', 'Phường Vũng Tàu', thu0900, DEFAULT_EXPRESS_WARDS)).toBe('outside_area');
    expect(expressUnavailableReason('Thành phố Hồ Chí Minh', 'Phường Vũng Tàu', sun1000, DEFAULT_EXPRESS_WARDS)).toBe('outside_area');
    expect(expressUnavailableReason('Thành phố Hồ Chí Minh', 'Phường Bến Thành', sun1000, DEFAULT_EXPRESS_WARDS)).toBe('outside_hours');
  });

  it('phí: thường 30k, hỏa tốc 45k, đơn từ 1 triệu miễn phí cả hai', () => {
    expect(shippingFeeFor('standard', 500_000)).toBe(STANDARD_SHIPPING_FEE);
    expect(shippingFeeFor('express', 500_000)).toBe(EXPRESS_SHIPPING_FEE);
    expect(EXPRESS_SHIPPING_FEE).toBe(45_000);
    expect(shippingFeeFor('express', 1_000_000)).toBe(0);
  });

  it('báo lựa chọn cho trang thanh toán: hỏa tốc được chọn kèm giờ hẹn = giờ đặt + 3 giờ', () => {
    const { options } = deliveryOptionsFor({ province: 'Thành phố Hồ Chí Minh', ward: 'Phường Bến Thành', subtotal: 300_000, at: thu0900, wards: DEFAULT_EXPRESS_WARDS });
    const express = options.find((o) => o.code === 'express');
    expect(express).toMatchObject({ available: true, feeVnd: 45_000, unavailableReason: null });
    expect(express?.promisedDeliveryAt?.toISOString()).toBe('2026-10-29T05:00:00.000Z');
    const outside = deliveryOptionsFor({ province: 'Hà Nội', ward: 'Phường Ba Đình', subtotal: 300_000, at: thu0900, wards: DEFAULT_EXPRESS_WARDS });
    expect(outside.options.find((o) => o.code === 'express')).toMatchObject({ available: false, unavailableReason: 'outside_area', promisedDeliveryAt: null });
    expect(promisedDeliveryAt(thu0900).toISOString()).toBe('2026-10-29T05:00:00.000Z');
  });

  it('trễ hẹn: chưa giao mà quá giờ hẹn, hoặc giao sau giờ hẹn; đơn thường / đã hủy không tính', () => {
    const promised = new Date('2026-10-29T05:00:00.000Z');
    const base = { delivery_option: 'express' as const, promised_delivery_at: promised, status: 'pending' };
    expect(isExpressLate(base, new Date('2026-10-29T04:59:00.000Z'))).toBe(false);
    expect(isExpressLate(base, new Date('2026-10-29T05:01:00.000Z'))).toBe(true);
    expect(isExpressLate({ ...base, delivered_at: new Date('2026-10-29T04:30:00.000Z') }, new Date('2026-10-29T09:00:00.000Z'))).toBe(false);
    expect(isExpressLate({ ...base, delivered_at: new Date('2026-10-29T05:30:00.000Z') }, new Date('2026-10-29T09:00:00.000Z'))).toBe(true);
    expect(isExpressLate({ ...base, status: 'cancelled' }, new Date('2026-10-29T09:00:00.000Z'))).toBe(false);
    expect(isExpressLate({ ...base, delivery_option: 'standard' }, new Date('2026-10-29T09:00:00.000Z'))).toBe(false);
  });
});
