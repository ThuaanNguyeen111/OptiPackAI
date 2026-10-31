import { tee, jean, item } from './scenarios/order-scenarios';
import { expandToUnits } from './units';
import {
  DEFAULT_MAILER_FIT,
  filledMailerDims,
  mailerFits,
  stackOf,
  stackPlacements,
} from './mailer-fit';
import type { MailerSpec } from './types';

const mailer = (w: number, l: number, maxLoad = 3000): MailerSpec => ({
  code: `M${String(w)}x${String(l)}`,
  name: 'túi',
  width_mm: w * 10,
  length_mm: l * 10,
  tare_g: 8,
  max_load_g: maxLoad,
  price_vnd: 800,
});

/** AOFP-224 — PACKAGING_STANDARD §4.3. */
describe('mailerFits — túi niêm phong', () => {
  it('chồng nhiều món: mặt đáy lớn nhất, độ dày cộng dồn, món lớn nằm dưới', () => {
    const units = expandToUnits([item('SCARF', [20, 15, 1], 0.1), tee(1)]);
    const stack = stackOf(units);
    expect(stack).toMatchObject({ a: 300, b: 220, t: 40, weight_g: 350 });
    expect(stack.items[0]?.unit.sku).toBe('TEE');
    const placements = stackPlacements(stack);
    expect(placements.map((p) => [p.sku, p.z, p.dz])).toEqual([
      ['TEE', 0, 30],
      ['SCARF', 30, 10],
    ]);
  });

  it('nửa chu vi mặt cắt: áo 30×22×3 không vừa 25×35 nhưng vừa 32×45', () => {
    const stack = stackOf(expandToUnits([tee(1)]));
    // rộng cần 220 + 30 + 20 = 270 mm; dài cần 300 + 30 + 30 = 360 mm
    expect(mailerFits(stack, mailer(25, 35))).toBe(false);
    expect(mailerFits(stack, mailer(32, 45))).toBe(true);
  });

  it('đúng ranh giới lề vẫn vừa; vượt 1 mm thì không', () => {
    const exact = { a: 290, b: 200, t: 30, weight_g: 300 };
    expect(mailerFits(exact, { width_mm: 250, length_mm: 350, max_load_g: 3000 })).toBe(true);
    expect(mailerFits({ ...exact, b: 201 }, { width_mm: 250, length_mm: 350, max_load_g: 3000 })).toBe(false);
  });

  it('thử cả chiều xoay túi', () => {
    const stack = { a: 200, b: 150, t: 20, weight_g: 200 };
    expect(mailerFits(stack, { width_mm: 300, length_mm: 200, max_load_g: 3000 })).toBe(true);
  });

  it('chồng dày quá 8 cm hoặc nặng quá tải túi thì không vừa', () => {
    const stack = stackOf(expandToUnits([jean(2)]));
    expect(stack.t).toBe(100);
    expect(stack.t).toBeGreaterThan(DEFAULT_MAILER_FIT.maxThicknessMm);
    expect(mailerFits(stack, mailer(60, 80))).toBe(false);
    const light = stackOf(expandToUnits([tee(1)]));
    expect(mailerFits(light, mailer(40, 60, 200))).toBe(false);
  });

  it('kích thước túi đã nhồi ôm sát chồng hàng', () => {
    expect(filledMailerDims({ a: 300, b: 220, t: 30 })).toEqual({
      length_mm: 310,
      width_mm: 230,
      height_mm: 35,
    });
  });
});
