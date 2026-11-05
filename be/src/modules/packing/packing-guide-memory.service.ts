import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MAX_GUIDE_EXAMPLES, type GuideExample, type GuideTrace } from '../packaging/packing-guide-ai.service';
import {
  PackingGuideExample,
  PackingGuideLog,
  type PackingGuideExampleDocument,
  type PackingGuideLogDocument,
} from './schemas/packing-guide-memory.schema';

/** Kiện mẫu dài hơn chừng này bước thì không làm ví dụ (prompt quá dài). */
export const MAX_EXAMPLE_STEPS = 8;
/** Số ví dụ gần nhất đem ra chọn (đọc có giới hạn, chọn trong RAM). */
const EXAMPLE_POOL = 30;

export interface PickedExample {
  /** `plan_id:parcel_no` của kiện mẫu — ghi vào nhật ký để truy ngược. */
  ref: string;
  example: GuideExample;
}

export interface GuideLogEntry {
  planId: Types.ObjectId;
  groupId: Types.ObjectId;
  parcelNo: number;
  source: 'ai' | 'template';
  model: string | null;
  fallbackReason: string | null;
  trace: GuideTrace;
  exampleRefs: string[];
}

export interface GuideLogView {
  source: 'ai' | 'template';
  model: string | null;
  fallback_reason: string | null;
  system_prompt: string;
  user_payload: string;
  raw_response: string | null;
  examples_used: number;
  example_refs: string[];
  latency_ms: number;
  created_at: Date | null;
}

const refOf = (planId: Types.ObjectId, parcelNo: number): string => `${planId.toString()}:${String(parcelNo)}`;

/**
 * Nhật ký dữ liệu đã gửi cho AI + bộ ví dụ mẫu được nhân viên chấm tốt
 * (05/11/2026, xem schemas/packing-guide-memory.schema.ts).
 */
@Injectable()
export class PackingGuideMemoryService {
  constructor(
    @InjectModel(PackingGuideLog.name) private readonly logModel: Model<PackingGuideLogDocument>,
    @InjectModel(PackingGuideExample.name) private readonly exampleModel: Model<PackingGuideExampleDocument>,
  ) {}

  async recordLog(entry: GuideLogEntry): Promise<void> {
    await this.logModel.create({
      plan_id: entry.planId,
      order_group_id: entry.groupId,
      parcel_no: entry.parcelNo,
      source: entry.source,
      ai_model: entry.model,
      fallback_reason: entry.fallbackReason,
      system_prompt: entry.trace.system_prompt,
      user_payload: entry.trace.user_payload,
      raw_response: entry.trace.raw_response,
      examples_used: entry.trace.examples_used,
      example_refs: entry.exampleRefs,
      latency_ms: entry.trace.latency_ms,
    });
  }

  /** Lần viết gần nhất của 1 kiện (null = chưa viết hoặc nhật ký đã hết hạn 30 ngày). */
  async latestLog(planId: Types.ObjectId, parcelNo: number): Promise<GuideLogView | null> {
    const doc = await this.logModel
      .findOne({ plan_id: planId, parcel_no: parcelNo })
      .sort({ created_at: -1 })
      .select('source ai_model fallback_reason system_prompt user_payload raw_response examples_used example_refs latency_ms created_at')
      .lean();
    if (!doc) return null;
    return {
      source: doc.source,
      model: doc.ai_model,
      fallback_reason: doc.fallback_reason,
      system_prompt: doc.system_prompt,
      user_payload: doc.user_payload,
      raw_response: doc.raw_response,
      examples_used: doc.examples_used,
      example_refs: doc.example_refs,
      latency_ms: doc.latency_ms,
      created_at: doc.created_at ?? null,
    };
  }

  /**
   * Chọn tối đa MAX_GUIDE_EXAMPLES ví dụ giống kiện cần viết nhất: nhiều loại sản
   * phẩm trùng nhất, rồi mới nhất. Không lấy chính kiện đang viết.
   */
  async pickExamples(productTypes: string[], self: { planId: Types.ObjectId; parcelNo: number }): Promise<PickedExample[]> {
    const pool = await this.exampleModel
      .find({ step_count: { $lte: MAX_EXAMPLE_STEPS } })
      .sort({ created_at: -1 })
      .limit(EXAMPLE_POOL)
      .select('plan_id parcel_no product_types user_payload summary steps created_at')
      .lean();
    const wanted = new Set(productTypes);
    const selfRef = refOf(self.planId, self.parcelNo);
    return pool
      .map((e, order) => ({ e, order, overlap: e.product_types.filter((t) => wanted.has(t)).length }))
      .filter(({ e }) => refOf(e.plan_id, e.parcel_no) !== selfRef)
      .sort((a, b) => b.overlap - a.overlap || a.order - b.order)
      .slice(0, MAX_GUIDE_EXAMPLES)
      .map(({ e }) => ({
        ref: refOf(e.plan_id, e.parcel_no),
        example: {
          user_payload: e.user_payload,
          guide: { summary: e.summary, steps: e.steps.map((s) => ({ step: s.step, instruction: s.instruction, tip: s.tip })) },
        },
      }));
  }

  /** Lưu (hoặc thay) 1 kiện làm ví dụ mẫu. Bỏ qua kiện quá dài. */
  async saveExample(input: {
    planId: Types.ObjectId;
    parcelNo: number;
    boxCode: string;
    productTypes: string[];
    userPayload: string;
    summary: string;
    steps: { step: number; instruction: string; tip: string | null }[];
    ratedBy: string;
  }): Promise<boolean> {
    if (input.steps.length === 0 || input.steps.length > MAX_EXAMPLE_STEPS) return false;
    await this.exampleModel.updateOne(
      { plan_id: input.planId, parcel_no: input.parcelNo },
      {
        $set: {
          box_code: input.boxCode,
          product_types: [...new Set(input.productTypes)],
          step_count: input.steps.length,
          user_payload: input.userPayload,
          summary: input.summary,
          steps: input.steps.map((s) => ({ step: s.step, instruction: s.instruction, tip: s.tip ?? '' })),
          rated_by: new Types.ObjectId(input.ratedBy),
        },
      },
      { upsert: true },
    );
    return true;
  }

  async removeExample(planId: Types.ObjectId, parcelNo: number): Promise<void> {
    await this.exampleModel.deleteOne({ plan_id: planId, parcel_no: parcelNo });
  }

  async countExamples(): Promise<number> {
    return this.exampleModel.countDocuments({});
  }
}
