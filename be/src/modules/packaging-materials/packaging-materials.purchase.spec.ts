import { Types } from 'mongoose';
import { PackagingMaterialsService } from './packaging-materials.service';
import { ReceiptOcrService } from '../receipt-ocr/receipt-ocr.service';
import { RECEIPT_OCR_ERROR_CODES } from '../receipt-ocr/receipt-ocr.errors';

function q<T>(value: T): Promise<T> & { session: jest.Mock } {
  return Object.assign(Promise.resolve(value), { session: jest.fn().mockResolvedValue(value) });
}

//!=============================================
// 11/11/2026 — mua vật liệu phải kèm ảnh phiếu NCC; OCR đối chiếu số lượng.
//!=============================================
describe('PackagingMaterialsService.purchase — ảnh phiếu + OCR', () => {
  const photo = 'https://res.cloudinary.com/demo/image/upload/v1/optipack/receipts/hd.jpg';
  const scanId = new Types.ObjectId();
  const scan = {
    _id: scanId, photo_urls: [photo], ai_model: 'groq/vision', supplier: 'Bao Bì SG', document_date: null, created_at: new Date(),
    lines: [{ text: 'Thùng carton M', code: 'BOX-M', quantity: 100, unit: 'cái' }],
  };
  const boxM = { _id: new Types.ObjectId(), code: 'BOX-M', is_active: true, qty_new: 10, qty_reused: 0 };
  let materialModel: { findOne: jest.Mock; findOneAndUpdate: jest.Mock };
  let movementModel: { create: jest.Mock };
  let notify: jest.Mock;
  let service: PackagingMaterialsService;

  beforeEach(() => {
    materialModel = { findOne: jest.fn().mockReturnValue(q(boxM)), findOneAndUpdate: jest.fn().mockResolvedValue({ ...boxM, qty_new: 108 }) };
    movementModel = { create: jest.fn().mockResolvedValue([{}]) };
    notify = jest.fn().mockResolvedValue({});
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    const receiptOcr = new ReceiptOcrService(
      { getProvider: jest.fn() } as never,
      { findById: jest.fn(() => ({ lean: () => Promise.resolve(scan) })) } as never,
      { notify } as never,
    );
    service = new PackagingMaterialsService(
      materialModel as never, movementModel as never, { startSession: jest.fn().mockResolvedValue(session) } as never, undefined, receiptOcr,
    );
  });

  it('không kèm ảnh phiếu → PKG_PURCHASE_PHOTO_REQUIRED, không cộng tồn', async () => {
    await expect(service.purchase('BOX-M', { quantity: 100 }, 'u1')).rejects.toMatchObject({ errorCode: RECEIPT_OCR_ERROR_CODES.PURCHASE_PHOTO_REQUIRED });
    expect(materialModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('phiếu ghi 100, nhập 98 có lý do → cộng 98, sổ ghi ảnh + số OCR + lý do, báo lệch', async () => {
    await service.purchase(
      'BOX-M',
      { quantity: 98, document_photo_urls: [photo], ocr_scan_id: scanId.toString(), ocr_line_index: 0, mismatch_reason: '2 thùng móp, trả NCC' },
      'u1',
    );
    expect(materialModel.findOneAndUpdate).toHaveBeenCalledWith({ _id: boxM._id }, { $inc: { qty_new: 98 } }, expect.anything());
    const [[move]] = movementModel.create.mock.calls[0] as [[Record<string, unknown>]];
    expect(move).toMatchObject({
      type: 'purchase', delta: 98, document_photo_urls: [photo], supplier: 'Bao Bì SG', ocr_status: 'mismatch',
      ocr_scan_id: scanId, ocr_text: 'Thùng carton M', ocr_quantity: 100, mismatch_reason: '2 thùng móp, trả NCC',
    });
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('lệch không lý do → WH_RECEIPT_MISMATCH_REASON_REQUIRED; không đọc phiếu → "not_checked"', async () => {
    await expect(
      service.purchase('BOX-M', { quantity: 98, document_photo_urls: [photo], ocr_scan_id: scanId.toString(), ocr_line_index: 0 }, 'u1'),
    ).rejects.toMatchObject({ errorCode: RECEIPT_OCR_ERROR_CODES.MISMATCH_REASON_REQUIRED });
    await service.purchase('BOX-M', { quantity: 5, document_photo_urls: [photo] }, 'u1');
    const [[move]] = movementModel.create.mock.calls[0] as [[Record<string, unknown>]];
    expect(move).toMatchObject({ ocr_status: 'not_checked', ocr_quantity: null });
    expect(notify).not.toHaveBeenCalled();
  });
});
