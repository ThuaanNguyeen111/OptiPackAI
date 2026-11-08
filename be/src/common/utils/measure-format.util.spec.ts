import {
  formatCm,
  formatDimsCm,
  formatDimsMmAsCm,
  formatFlatMmAsCm,
  formatGAsKg,
  formatKg,
  formatMmAsCm,
} from './measure-format.util';

describe('measure-format.util — quy tắc hiển thị cm/kg chung', () => {
  it('kích thước: cm, tối đa 1 chữ số lẻ, dấu phẩy thập phân', () => {
    expect(formatCm(35)).toBe('35 cm');
    expect(formatMmAsCm(5)).toBe('0,5 cm');
    expect(formatMmAsCm(123)).toBe('12,3 cm');
    expect(formatMmAsCm(1234)).toBe('123,4 cm');
  });

  it('ghép 3 cạnh / khổ túi', () => {
    expect(formatDimsMmAsCm(350, 250, 125)).toBe('35 × 25 × 12,5 cm');
    expect(formatDimsCm(28, 20, 4)).toBe('28 × 20 × 4 cm');
    expect(formatFlatMmAsCm(350, 450)).toBe('35 × 45 cm');
  });

  it('khối lượng: kg, tối đa 2 chữ số lẻ, có dấu chấm hàng nghìn', () => {
    expect(formatGAsKg(150)).toBe('0,15 kg');
    expect(formatGAsKg(3200)).toBe('3,2 kg');
    expect(formatGAsKg(1234)).toBe('1,23 kg');
    expect(formatKg(1500)).toBe('1.500 kg');
    expect(formatKg(0)).toBe('0 kg');
  });

  it('số rất nhỏ không bị làm tròn thành 0 kg', () => {
    expect(formatGAsKg(3)).toBe('0,003 kg');
    expect(formatGAsKg(8)).toBe('0,01 kg');
  });
});
