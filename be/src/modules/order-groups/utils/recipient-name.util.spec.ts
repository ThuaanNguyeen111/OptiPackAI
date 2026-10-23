import { normalizeRecipientName, summarizeRecipientNames } from './recipient-name.util';

describe('recipient-name.util (23/10/2026 — cảnh báo đơn gộp khác tên)', () => {
  it('chuẩn hoá bỏ dấu, hoa thường, khoảng trắng thừa', () => {
    expect(normalizeRecipientName('  Nguyễn   Văn Đức ')).toBe('nguyen van duc');
  });

  it('cùng 1 người viết khác kiểu → không coi là khác tên', () => {
    const s = summarizeRecipientNames(['Nguyễn Văn A', 'nguyen van a', 'NGUYỄN VĂN A']);
    expect(s).toEqual({ names: ['Nguyễn Văn A'], differ: false, hasMasked: false });
  });

  it('2 người khác tên → differ = true, giữ thứ tự xuất hiện', () => {
    const s = summarizeRecipientNames(['Trần Thị B', 'Lê Văn C', 'tran thi b']);
    expect(s.names).toEqual(['Trần Thị B', 'Lê Văn C']);
    expect(s.differ).toBe(true);
  });

  it('tên bị che không đem so, báo hasMasked; null/rỗng bỏ qua', () => {
    const s = summarizeRecipientNames(['T**h', null, '', 'Lê Văn C', undefined]);
    expect(s).toEqual({ names: ['Lê Văn C'], differ: false, hasMasked: true });
  });
});
