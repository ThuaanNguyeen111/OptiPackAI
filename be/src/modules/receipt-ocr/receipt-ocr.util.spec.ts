import { checkAgainstScan, parseOcrResult } from './receipt-ocr.util';

describe('receipt-ocr.util', () => {
  it('parseOcrResult: giữ dòng hợp lệ, đổi "1.000" thành 1000, bỏ dòng thiếu tên / số âm / số lẻ; "" → null', () => {
    const parsed = parseOcrResult({
      supplier: ' Xưởng A ',
      document_date: '',
      lines: [
        { text: 'Áo thun đỏ M', code: 'AT-001-RED-M', quantity: 50, unit: 'cái' },
        { text: 'Thùng M', code: '', quantity: '1.000', unit: '' },
        { text: '', code: 'X', quantity: 3, unit: '' },
        { text: 'Âm', code: '', quantity: -1, unit: '' },
        { text: 'Lẻ', code: '', quantity: 1.5, unit: '' },
        'rác',
      ],
    });
    expect(parsed).toEqual({
      supplier: 'Xưởng A',
      document_date: null,
      lines: [
        { text: 'Áo thun đỏ M', code: 'AT-001-RED-M', quantity: 50, unit: 'cái' },
        { text: 'Thùng M', code: null, quantity: 1000, unit: null },
      ],
    });
    expect(parseOcrResult({ supplier: 'x' })).toBeNull();
    expect(parseOcrResult(null)).toBeNull();
  });

  const lines = [
    { text: 'Áo thun đỏ M', code: 'AT-001-RED-M', quantity: 50, unit: 'cái' },
    { text: 'Quần', code: null, quantity: 10, unit: null },
  ];

  it('khớp → matched; lệch có lý do → mismatch; không gắn dòng nào → not_checked', () => {
    expect(checkAgainstScan(lines, [{ lineIndex: 0, label: 'A', quantity: 50, ocrLineIndex: 0 }])).toMatchObject({ ok: true, status: 'matched' });
    const r = checkAgainstScan(lines, [
      { lineIndex: 0, label: 'A', quantity: 48, ocrLineIndex: 0, mismatchReason: ' NCC giao thiếu ' },
      { lineIndex: 1, label: 'B', quantity: 10, ocrLineIndex: 1, mismatchReason: 'không lệch nên bỏ' },
    ]);
    expect(r).toEqual({
      ok: true,
      status: 'mismatch',
      checks: [
        { line_index: 0, label: 'A', ocr_line_index: 0, ocr_text: 'Áo thun đỏ M', ocr_quantity: 50, quantity: 48, mismatch_reason: 'NCC giao thiếu' },
        { line_index: 1, label: 'B', ocr_line_index: 1, ocr_text: 'Quần', ocr_quantity: 10, quantity: 10, mismatch_reason: null },
      ],
    });
    expect(checkAgainstScan(lines, [{ lineIndex: 0, label: 'A', quantity: 3 }])).toEqual({ ok: true, checks: [], status: 'not_checked' });
    expect(checkAgainstScan(null, [{ lineIndex: 0, label: 'A', quantity: 3 }])).toMatchObject({ ok: true, status: 'not_checked' });
  });

  it('lệch không lý do / dòng phiếu ngoài phạm vi / 2 dòng cùng 1 dòng phiếu / thiếu scan → lỗi', () => {
    expect(checkAgainstScan(lines, [{ lineIndex: 2, label: 'A', quantity: 48, ocrLineIndex: 0, mismatchReason: '  ' }])).toEqual({
      ok: false,
      problem: { kind: 'reason_required', lineIndex: 2, label: 'A', ocrQuantity: 50, quantity: 48 },
    });
    expect(checkAgainstScan(lines, [{ lineIndex: 0, label: 'A', quantity: 1, ocrLineIndex: 5 }])).toMatchObject({ ok: false, problem: { kind: 'out_of_range' } });
    expect(
      checkAgainstScan(lines, [
        { lineIndex: 0, label: 'A', quantity: 50, ocrLineIndex: 0 },
        { lineIndex: 1, label: 'B', quantity: 50, ocrLineIndex: 0 },
      ]),
    ).toMatchObject({ ok: false, problem: { kind: 'duplicate', lineIndex: 1 } });
    expect(checkAgainstScan(null, [{ lineIndex: 0, label: 'A', quantity: 1, ocrLineIndex: 0 }])).toMatchObject({ ok: false, problem: { kind: 'no_scan' } });
  });
});
