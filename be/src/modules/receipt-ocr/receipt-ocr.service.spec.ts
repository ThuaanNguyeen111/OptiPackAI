import axios from 'axios';
import { Types } from 'mongoose';
import { ReceiptOcrService } from './receipt-ocr.service';
import { RECEIPT_OCR_ERROR_CODES as E } from './receipt-ocr.errors';

let post: jest.SpyInstance;

describe('ReceiptOcrService.scan', () => {
  const provider = { name: 'groq', apiKey: 'k', baseUrl: 'https://ai.test/v1', model: 'text-model', timeoutMs: 1000 };
  const photo = 'https://res.cloudinary.com/demo/image/upload/v1/optipack/receipts/pn.jpg';
  let create: jest.Mock;

  function make(withProvider = true): ReceiptOcrService {
    const config = {
      getProvider: jest.fn(() => Promise.resolve(withProvider ? provider : null)),
      getVisionModel: jest.fn(() => Promise.resolve('vision-model')),
    };
    create = jest.fn((doc: Record<string, unknown>) => Promise.resolve({ _id: new Types.ObjectId(), ...doc }));
    return new ReceiptOcrService(config as never, { create } as never);
  }
  const reply = (content: unknown): { data: unknown } => ({ data: { choices: [{ message: { content: JSON.stringify(content) } }] } });

  beforeEach(() => {
    post = jest.spyOn(axios, 'post');
  });
  afterEach(() => {
    post.mockRestore();
  });

  it('gửi ảnh cho model vision, lưu scan, trả dòng có index', async () => {
    post.mockResolvedValue(reply({ supplier: 'Xưởng A', document_date: '2026-11-10', lines: [{ text: 'Áo thun đỏ M', code: 'AT-1', quantity: 50, unit: 'cái' }] }));
    const view = await make().scan([photo], 'u1');
    const body = (post.mock.calls[0] as unknown[])[1] as { model: string; messages: { content: unknown }[] };
    expect(body.model).toBe('vision-model');
    expect(JSON.stringify(body.messages[1]?.content)).toContain(photo);
    expect(view).toMatchObject({ model: 'groq/vision-model', supplier: 'Xưởng A', lines: [{ index: 0, text: 'Áo thun đỏ M', code: 'AT-1', quantity: 50 }] });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ photo_urls: [photo], created_by: 'u1', ai_model: 'groq/vision-model' }));
  });

  it('chưa có key → 503 WH_RECEIPT_OCR_UNAVAILABLE; AI lỗi hoặc trả sai khuôn → 502 WH_RECEIPT_OCR_FAILED, không lưu scan', async () => {
    await expect(make(false).scan([photo], 'u1')).rejects.toMatchObject({ errorCode: E.OCR_UNAVAILABLE });
    post.mockRejectedValue(new Error('timeout'));
    await expect(make().scan([photo], 'u1')).rejects.toMatchObject({ errorCode: E.OCR_FAILED });
    post.mockResolvedValue(reply({ nonsense: true }));
    await expect(make().scan([photo], 'u1')).rejects.toMatchObject({ errorCode: E.OCR_FAILED });
    expect(create).not.toHaveBeenCalled();
  });
});
