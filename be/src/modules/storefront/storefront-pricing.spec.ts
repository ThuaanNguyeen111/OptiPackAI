import {
  calculateOrderTotal,
  calculateShippingFee,
  FREE_SHIPPING_THRESHOLD,
  STANDARD_SHIPPING_FEE,
} from './storefront-pricing';

describe('storefront pricing', () => {
  it('charges the standard shipping fee below the free-shipping threshold', () => {
    expect(calculateShippingFee(690_000)).toBe(STANDARD_SHIPPING_FEE);
    expect(calculateOrderTotal(690_000)).toEqual({
      shippingFee: 30_000,
      total: 720_000,
    });
  });

  it('waives shipping at the threshold', () => {
    expect(calculateShippingFee(FREE_SHIPPING_THRESHOLD)).toBe(0);
    expect(calculateOrderTotal(FREE_SHIPPING_THRESHOLD)).toEqual({
      shippingFee: 0,
      total: FREE_SHIPPING_THRESHOLD,
    });
  });

  it('applies discounts before adding shipping', () => {
    expect(calculateOrderTotal(1_050_000, 100_000)).toEqual({
      shippingFee: 0,
      total: 950_000,
    });
  });
});
