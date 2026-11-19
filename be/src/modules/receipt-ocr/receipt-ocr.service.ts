import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { type ClientSession, Model, Types } from 'mongoose';
import type { AiProviderConfig } from '../../config/ai.config';
import { AiSettingsService } from '../ai-settings/ai-settings.service';
import { AppException } from '../../common/exceptions/app-exception';
import { UserRole } from '../../common/enums/user-role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { extractJsonContent } from '../orders/consolidation-rule-ai.service';
import { ProofPhotosService, type ReceiptPhotoCheck } from '../proof-photos/proof-photos.service';
import { RECEIPT_OCR_ERROR_CODES as E } from './receipt-ocr.errors';
import {
  checkAgainstScan,
  materialIntakeFields,
  parseOcrResult,
  requireMaterialPhotos,
  type MaterialIntakeFields,
  type OcrCheckInput,
  type OcrCheckOptions,
  type ResolvedOcrChecks,
} from './receipt-ocr.util';
import type { SupplierReceiptEvidenceDto } from './dto/supplier-receipt-evidence.dto';
import { ReceiptOcrScan, type ReceiptOcrCheck, type ReceiptOcrLine, type ReceiptOcrScanDocument } from './schemas/receipt-ocr-scan.schema';

export interface ReceiptOcrScanView {
  scanId: string;
  model: string;
  supplier: string | null;
  documentDate: string | null;
  lines: { index: number; text: string; code: string | null; quantity: number; unit: string | null }[];
}

export type { ResolvedOcrChecks } from './receipt-ocr.util';

const MIN_VISION_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = [
  'Bạn đọc ảnh phiếu nhập kho / phiếu giao hàng của nhà cung cấp (tiếng Việt) và trả về JSON.',
  'Mỗi mặt hàng trên phiếu là 1 phần tử của "lines": "text" = tên hàng đúng như in, "code" = mã hàng / SKU in trên phiếu (không có thì ""),',
  '"quantity" = số lượng THỰC GIAO dạng số nguyên (không phải đơn giá, không phải thành tiền), "unit" = đơn vị tính (không có thì "").',
  '"supplier" = tên nhà cung cấp, "document_date" = ngày trên phiếu dạng YYYY-MM-DD; không đọc được thì "".',
  'Không bịa dòng không có trên ảnh. Bỏ dòng tổng cộng. Nhiều ảnh là các trang của cùng 1 phiếu.',
].join(' ');

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['supplier', 'document_date', 'lines'],
  properties: {
    supplier: { type: 'string' },
    document_date: { type: 'string' },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'code', 'quantity', 'unit'],
        properties: { text: { type: 'string' }, code: { type: 'string' }, quantity: { type: 'integer' }, unit: { type: 'string' } },
      },
    },
  },
} as const;

/**
 * ===================================================================
 * 11/11/2026 — OCR phiếu NCC (STOCK_RECEIPT_OCR_HANDOFF)
 * ===================================================================
 * Groq vision (cùng `AI_API_KEY`, model `AI_VISION_MODEL`). Chỉ gửi URL ảnh phiếu,
 * không gửi dữ liệu kho. OCR chỉ ĐỌC — không cộng tồn; số cộng tồn luôn là số nhân
 * viên đếm. Lỗi → 502/503, FE cho nhập tay, phiếu ghi "chưa đối chiếu".
 * ===================================================================
 */
@Injectable()
export class ReceiptOcrService {
  private readonly logger = new Logger(ReceiptOcrService.name);

  constructor(
    private readonly aiSettings: AiSettingsService,
    @InjectModel(ReceiptOcrScan.name) private readonly scanModel: Model<ReceiptOcrScanDocument>,
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly proofPhotos?: ProofPhotosService,
  ) {}

  async scan(photoUrls: string[], actorId: string): Promise<ReceiptOcrScanView> {
    const provider = await this.aiSettings.getProvider();
    if (!provider) {
      throw new AppException(E.OCR_UNAVAILABLE, 'Chưa cấu hình AI đọc phiếu (Admin nhập API key ở Cài đặt đóng gói & AI) — hãy nhập số tay.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const model = (await this.aiSettings.getVisionModel()) || provider.model;
    let raw: unknown;
    try {
      raw = await this.callProvider(provider, model, photoUrls);
    } catch (error: unknown) {
      this.logger.warn(`AI "${provider.name}/${model}" lỗi khi đọc phiếu: ${describeError(error)}`);
      throw new AppException(E.OCR_FAILED, 'Không đọc được phiếu lúc này — hãy nhập số tay, phiếu sẽ ghi "chưa đối chiếu".', HttpStatus.BAD_GATEWAY);
    }
    const parsed = parseOcrResult(raw);
    if (!parsed) {
      this.logger.warn(`AI "${provider.name}/${model}" trả kết quả đọc phiếu sai định dạng.`);
      throw new AppException(E.OCR_FAILED, 'Không đọc được phiếu lúc này — hãy nhập số tay, phiếu sẽ ghi "chưa đối chiếu".', HttpStatus.BAD_GATEWAY);
    }
    // R1 (AOFP-311): 0 dòng hàng, hoặc không đọc được cả NCC lẫn ngày → ảnh không phải phiếu.
    if (parsed.lines.length === 0 || (!parsed.supplier && !parsed.document_date)) {
      throw new AppException(E.NOT_A_SLIP, 'Ảnh không giống phiếu giao hàng — chụp lại rõ cả phiếu.', HttpStatus.UNPROCESSABLE_ENTITY, {
        lines: parsed.lines.length,
        supplier: parsed.supplier !== null,
        documentDate: parsed.document_date !== null,
      });
    }
    const doc = await this.scanModel.create({
      photo_urls: photoUrls,
      ai_model: `${provider.name}/${model}`,
      supplier: parsed.supplier,
      document_date: parsed.document_date,
      lines: parsed.lines,
      created_by: actorId,
      created_at: new Date(),
    });
    return {
      scanId: doc._id.toString(),
      model: doc.ai_model,
      supplier: doc.supplier,
      documentDate: doc.document_date,
      lines: parsed.lines.map((l, index) => ({ index, text: l.text, code: l.code, quantity: l.quantity, unit: l.unit })),
    };
  }

  /**
   * Lấy số trên phiếu từ scan (không tin số client gửi), đối chiếu từng dòng.
   * Ảnh đã OCR phải nằm trong ảnh minh chứng của phiếu — không mượn kết quả đọc của phiếu khác.
   */
  async resolveChecks(scanId: string | undefined, photoUrls: string[], inputs: OcrCheckInput[], options: OcrCheckOptions = {}): Promise<ResolvedOcrChecks> {
    let scan: { _id: Types.ObjectId; photo_urls: string[]; ai_model: string; supplier: string | null; document_date: string | null; lines: ReceiptOcrLine[]; created_at: Date } | null = null;
    if (scanId) {
      scan = Types.ObjectId.isValid(scanId) ? await this.scanModel.findById(new Types.ObjectId(scanId)).lean() : null;
      if (!scan) {
        throw new AppException(E.OCR_SCAN_INVALID, 'Kết quả đọc phiếu không còn (quá 7 ngày hoặc sai mã) — hãy đọc lại phiếu.', HttpStatus.BAD_REQUEST, { scanId });
      }
      const missing = scan.photo_urls.filter((u) => !photoUrls.includes(u));
      if (missing.length > 0) {
        throw new AppException(E.OCR_SCAN_INVALID, 'Ảnh đã đọc không nằm trong ảnh phiếu gửi kèm.', HttpStatus.BAD_REQUEST, { scanId, missingPhotoUrls: missing });
      }
    }
    const result = checkAgainstScan(scan?.lines ?? null, inputs, options);
    if (!result.ok) {
      const p = result.problem;
      if (p.kind === 'partial_reason_required') {
        const parts = [
          p.extraOcrLines.length > 0 ? `phiếu có dòng ${p.extraOcrLines.map((i) => String(i + 1)).join(', ')} chưa gắn` : null,
          p.unlinkedLines.length > 0 ? `dòng nhập ${p.unlinkedLines.map((i) => String(i + 1)).join(', ')} không có trên phiếu` : null,
        ].filter(Boolean);
        throw new AppException(E.PARTIAL_REASON_REQUIRED, `Phiếu chỉ khớp một phần (${parts.join('; ')}) — ghi lý do.`, HttpStatus.BAD_REQUEST, { ...p });
      }
      const line = String(p.lineIndex + 1);
      if (p.kind === 'reason_required') {
        throw new AppException(
          E.MISMATCH_REASON_REQUIRED,
          `Dòng ${line} (${p.label}): phiếu ghi ${String(p.ocrQuantity)}, nhập ${String(p.quantity)} — ghi lý do lệch.`,
          HttpStatus.BAD_REQUEST,
          { index: p.lineIndex, ocrQuantity: p.ocrQuantity, quantity: p.quantity },
        );
      }
      const message =
        p.kind === 'no_scan'
          ? `Dòng ${line}: có ocr_line_index nhưng thiếu ocr_scan_id.`
          : p.kind === 'out_of_range'
            ? `Dòng ${line}: phiếu không có dòng số ${String(p.ocrLineIndex + 1)}.`
            : `Dòng ${line}: dòng phiếu số ${String(p.ocrLineIndex + 1)} đã gắn với dòng khác.`;
      throw new AppException(E.OCR_LINE_INVALID, message, HttpStatus.BAD_REQUEST, { ...p });
    }
    return {
      scanId: scan?._id ?? null,
      snapshot: scan ? { ai_model: scan.ai_model, read_at: scan.created_at, supplier: scan.supplier, document_date: scan.document_date, lines: scan.lines } : null,
      checks: result.checks,
      status: result.status,
      extraOcrLines: result.extraOcrLines,
      partialReason: result.status === 'partial' ? (options.partialReason?.trim() ?? null) : null,
    };
  }

  /** (AOFP-311) Ảnh phiếu đã dùng cho lần nhập khác → 409; ảnh nghi chụp lại → `suspect`. */
  async checkPhotos(photoUrls: string[]): Promise<ReceiptPhotoCheck> {
    return this.proofPhotos ? this.proofPhotos.checkReceiptPhotos(photoUrls) : { suspect: false, similarTo: [] };
  }

  /** Gắn ảnh vào phiếu vừa lưu (trong transaction của phiếu nếu có). Trùng với phiếu khác → 409. */
  async markPhotosUsed(photoUrls: string[], usage: { kind: 'stock_receipt' | 'material_intake'; ref: string }, session?: ClientSession): Promise<void> {
    await this.proofPhotos?.markReceiptPhotosUsed(photoUrls, usage, session);
  }

  /** Nhập vật tư từ NCC (1 mã = 1 dòng phiếu): bắt ảnh, kiểm ảnh dùng lại, đối chiếu, trả field ghi sổ + dòng lệch (nếu có). */
  async prepareMaterialIntake(
    code: string,
    quantity: number,
    ev: SupplierReceiptEvidenceDto,
  ): Promise<{ fields: MaterialIntakeFields; mismatch: ReceiptOcrCheck | null }> {
    const photos = requireMaterialPhotos(ev.document_photo_urls);
    const photoCheck = await this.checkPhotos(photos);
    const ocr = await this.resolveChecks(ev.ocr_scan_id, photos, [
      { lineIndex: 0, label: code, quantity, ocrLineIndex: ev.ocr_line_index, mismatchReason: ev.mismatch_reason },
    ]);
    return { fields: materialIntakeFields(photos, ev.supplier, ocr, photoCheck.suspect), mismatch: ocr.status === 'mismatch' ? (ocr.checks[0] ?? null) : null };
  }

  /**
   * Gọi SAU khi ghi sổ vật tư: gắn ảnh vào lần nhập và báo nếu ảnh nghi trùng. Sổ đã ghi nên lỗi chỉ log.
   * shortcut: kiểm (prepareMaterialIntake) và gắn tách nhau, 2 lần nhập cùng ảnh trong cùng tích tắc có thể cùng qua;
   * muốn kín thì truyền session của transaction ghi sổ vào markPhotosUsed như phiếu nhập kho.
   */
  async afterMaterialIntake(code: string, fields: MaterialIntakeFields): Promise<void> {
    try {
      await this.markPhotosUsed(fields.document_photo_urls, { kind: 'material_intake', ref: code });
    } catch (error: unknown) {
      this.logger.warn(`Ảnh phiếu nhập vật tư ${code} trùng lần nhập khác (lưu cùng lúc): ${error instanceof Error ? error.message : String(error)}`);
    }
    if (fields.photo_suspect) await this.notifyPhotoSuspect(`nhập vật tư ${code}`, 'packaging_material', code);
  }

  /** Báo Store Owner + Admin: ảnh phiếu rất giống ảnh đã dùng (pHash gần). */
  async notifyPhotoSuspect(what: string, entityType: string, entityId: string): Promise<void> {
    await this.notifyMismatch({
      title: `Ảnh phiếu ${what} nghi dùng lại`,
      message: `Ảnh phiếu của ${what} rất giống ảnh đã dùng cho lần nhập trước — kiểm tra lại phiếu gốc.`,
      entityType,
      entityId,
    });
  }

  async notifyMaterialMismatch(code: string, check: ReceiptOcrCheck): Promise<void> {
    await this.notifyMismatch({
      title: `Nhập vật tư ${code} lệch số với phiếu NCC`,
      message: `${code}: phiếu ghi ${String(check.ocr_quantity)}, nhập ${String(check.quantity)} (${check.mismatch_reason ?? ''}).`,
      entityType: 'packaging_material',
      entityId: code,
    });
  }

  /** Gọi SAU khi ghi xong — lỗi thông báo chỉ log, không làm hỏng phiếu đã lưu. */
  async notifyMismatch(input: { title: string; message: string; entityType: string; entityId: string }): Promise<void> {
    if (!this.notificationsService) return;
    for (const role of [UserRole.STORE_OWNER, UserRole.ADMIN]) {
      try {
        await this.notificationsService.notify({
          recipientRole: role,
          type: NotificationType.STOCK_RECEIPT_MISMATCH,
          severity: 'warning',
          title: input.title,
          message: input.message,
          relatedEntityType: input.entityType,
          relatedEntityId: input.entityId,
        });
      } catch (error: unknown) {
        this.logger.warn(`Không gửi được thông báo lệch phiếu: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async callProvider(provider: AiProviderConfig, model: string, photoUrls: string[]): Promise<unknown> {
    const body = {
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Đọc phiếu trong ảnh và trả JSON theo khuôn đã nêu.' },
            ...photoUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
          ],
        },
      ],
    };
    const post = async (responseFormat: object): Promise<unknown> => {
      const response = await axios.post<unknown>(
        `${provider.baseUrl}/chat/completions`,
        { ...body, response_format: responseFormat },
        { headers: { Authorization: `Bearer ${provider.apiKey}` }, timeout: Math.max(provider.timeoutMs, MIN_VISION_TIMEOUT_MS) },
      );
      return extractJsonContent(response.data);
    };
    try {
      return await post({ type: 'json_schema', json_schema: { name: 'stock_receipt_ocr', strict: true, schema: RESPONSE_SCHEMA } });
    } catch (error: unknown) {
      // Model không hỗ trợ json_schema → thử json_object (prompt đã nói "JSON").
      if (axios.isAxiosError(error) && error.response?.status === 400) return post({ type: 'json_object' });
      throw error;
    }
  }
}

function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return status === undefined ? error.message : `HTTP ${String(status)} — ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
