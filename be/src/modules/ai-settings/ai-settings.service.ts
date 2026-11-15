import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { describeError } from '../../common/utils/log-error.util';
import type { AiProviderConfig } from '../../config/ai.config';
import { recordActivity } from '../activity-log/activity-log.util';
import { ActivityLog, type ActivityLogDocument } from '../activity-log/schemas/activity-log.schema';
import { User, type UserDocument } from '../users/schemas';
import {
  decryptToken,
  encryptToken,
} from '../marketplace-integration/common/utils/token-encryption.util';
import {
  AI_PROVIDER_PRESETS,
  AI_TIMEOUT_DEFAULT_MS,
  type AiProviderKey,
  type AiProviderPreset,
  presetOf,
} from './ai-settings.presets';
import type { RevealAiKeyDto, TestAiSettingsDto, UpdateAiSettingsDto } from './dto/ai-settings.dto';
import { AiSettings, type AiSettingsDocument } from './schemas/ai-settings.schema';

/** Nguồn cấu hình đang có hiệu lực: web (DB), biến môi trường của server, hoặc chưa có gì (AI tắt). */
export type AiSettingsSource = 'db' | 'env' | 'none';

export interface AiSettingsView {
  provider: AiProviderKey;
  baseUrl: string;
  model: string;
  /** null = dùng chung `model`. */
  visionModel: string | null;
  timeoutMs: number;
  hasApiKey: boolean;
  /** 4 ký tự cuối key đã lưu trên web; null nếu key đến từ .env hoặc chưa có. */
  apiKeyLast4: string | null;
  source: AiSettingsSource;
  presets: readonly AiProviderPreset[];
  updatedAt: Date | null;
}

export interface RevealedAiKey {
  apiKey: string;
  /** Key đang có hiệu lực lấy từ đâu. */
  source: Exclude<AiSettingsSource, 'none'>;
}

export interface AiConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  /** id model nhà cung cấp trả về (đã sắp xếp, tối đa MAX_MODELS). */
  models: string[];
  /** Model đang nhập có trong danh sách không; null khi không kiểm được. */
  modelFound: boolean | null;
  error: string | null;
}

interface Resolved {
  provider: AiProviderConfig | null;
  visionModel: string;
}

// shortcut: cache riêng từng pod, pod khác thấy cấu hình mới chậm tối đa 30s; nhiều pod cần tức thì thì chuyển sang Redis pub/sub.
const CACHE_TTL_MS = 30_000;
const TEST_TIMEOUT_MS = 10_000;
const MAX_MODELS = 500;
const SETTINGS_KEY = 'default';

/** Gemini trả "models/gemini-2.5-flash"; chat completions nhận "gemini-2.5-flash". */
export function parseModelIds(body: unknown): string[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const ids = data
    .map((row) => (row as { id?: unknown } | null)?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .map((id) => id.replace(/^models\//, ''));
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b)).slice(0, MAX_MODELS);
}

/** Lỗi nhà cung cấp → câu tiếng Việt cho Admin; không bao giờ kèm key. */
export function describeConnectionError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401 || status === 403) return 'API key sai hoặc không có quyền.';
    if (status === 404) return 'Không tìm thấy endpoint — kiểm tra lại URL.';
    if (status === 429) return 'Nhà cung cấp đang giới hạn số lần gọi, thử lại sau.';
    if (status !== undefined) return `Nhà cung cấp trả lỗi HTTP ${String(status)}.`;
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'Hết thời gian chờ phản hồi.';
    return 'Không kết nối được tới URL này.';
  }
  return 'Không kết nối được tới nhà cung cấp.';
}

function trimmed(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t === undefined || t === '' ? null : t;
}

@Injectable()
export class AiSettingsService {
  private readonly logger = new Logger(AiSettingsService.name);
  private cache: { value: Resolved; expiresAt: number } | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(AiSettings.name) private readonly model: Model<AiSettingsDocument>,
    @InjectModel(ActivityLog.name) private readonly activityModel: Model<ActivityLogDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /** Nhà cung cấp AI đang dùng; null = AI tắt (dịch vụ dùng câu mẫu / bắt nhập tay). */
  async getProvider(): Promise<AiProviderConfig | null> {
    return (await this.resolve()).provider;
  }

  /** Model đọc ảnh phiếu NCC. */
  async getVisionModel(): Promise<string> {
    return (await this.resolve()).visionModel;
  }

  async view(): Promise<AiSettingsView> {
    const doc = await this.findDoc();
    const presets = AI_PROVIDER_PRESETS;
    if (doc?.api_key_enc) {
      return {
        provider: doc.provider,
        baseUrl: doc.base_url,
        model: doc.model,
        visionModel: doc.vision_model,
        timeoutMs: doc.timeout_ms,
        hasApiKey: true,
        apiKeyLast4: doc.api_key_last4,
        source: 'db',
        presets,
        updatedAt: doc.updatedAt,
      };
    }
    const env = this.envResolved();
    const base = doc ?? null;
    const fallbackPreset = presetOf('groq');
    return {
      provider: base?.provider ?? 'groq',
      baseUrl: base?.base_url ?? env.provider?.baseUrl ?? fallbackPreset.baseUrl,
      model: base?.model ?? env.provider?.model ?? fallbackPreset.defaultModel,
      visionModel: base ? base.vision_model : env.visionModel,
      timeoutMs: base?.timeout_ms ?? env.provider?.timeoutMs ?? AI_TIMEOUT_DEFAULT_MS,
      hasApiKey: env.provider !== null,
      apiKeyLast4: null,
      source: env.provider ? 'env' : 'none',
      presets,
      updatedAt: base?.updatedAt ?? null,
    };
  }

  async update(dto: UpdateAiSettingsDto, actorId: string): Promise<AiSettingsView> {
    const current = await this.view();
    const provider = dto.provider ?? current.provider;
    const switched = provider !== current.provider;
    const preset = presetOf(provider);

    const baseUrl = (trimmed(dto.base_url) ?? (switched ? preset.baseUrl : current.baseUrl)).replace(/\/+$/, '');
    if (!baseUrl) {
      throw new AppException('AI_BASE_URL_REQUIRED', 'Nhà cung cấp tự nhập cần có URL API.', HttpStatus.BAD_REQUEST);
    }
    const model = trimmed(dto.model) ?? (switched ? preset.defaultModel : current.model);
    if (!model) {
      throw new AppException('AI_MODEL_REQUIRED', 'Hãy chọn hoặc nhập tên model.', HttpStatus.BAD_REQUEST);
    }
    const visionModel =
      dto.vision_model === undefined ? (switched ? null : current.visionModel) : trimmed(dto.vision_model);

    const $set: Partial<AiSettings> = {
      provider,
      base_url: baseUrl,
      model,
      vision_model: visionModel,
      timeout_ms: dto.timeout_ms ?? current.timeoutMs,
      updated_by: new Types.ObjectId(actorId),
    };
    if (dto.api_key !== undefined) {
      const key = trimmed(dto.api_key);
      $set.api_key_enc = key ? encryptToken(key) : null;
      $set.api_key_last4 = key ? key.slice(-4) : null;
    }
    await this.model.updateOne({ key: SETTINGS_KEY }, { $set }, { upsert: true });
    this.cache = null;

    const keyNote =
      dto.api_key === undefined ? '' : trimmed(dto.api_key) ? ', đổi API key' : ', xoá API key';
    await recordActivity(this.activityModel, {
      category: 'auth',
      action: 'ai_settings.updated',
      summary: `Cập nhật cấu hình AI: ${preset.label} · ${model}${keyNote}`,
      actorId,
      entityType: 'ai_settings',
      entityCode: provider,
    });
    return this.view();
  }

  /**
   * Trả API key thật đang dùng (web hoặc .env) sau khi Admin nhập lại mật khẩu.
   * Mọi lần thử — đúng hay sai — đều ghi activity log; không bao giờ ghi key vào log.
   */
  async revealKey(dto: RevealAiKeyDto, actorId: string): Promise<RevealedAiKey> {
    const user = await this.userModel
      .findById(new Types.ObjectId(actorId))
      .select({ password: 1 })
      .lean<{ password?: string } | null>();
    if (!user?.password) {
      throw new AppException(
        'AI_REVEAL_PASSWORD_NOT_SET',
        'Tài khoản này chưa có mật khẩu (đăng nhập bằng Google). Đặt mật khẩu ở Hồ sơ rồi thử lại.',
        HttpStatus.BAD_REQUEST,
      );
    }
    // 400 thay vì 401: FE coi 401 là hết phiên và tự đăng xuất.
    if (!(await bcrypt.compare(dto.password, user.password))) {
      await this.logReveal(actorId, 'ai_settings.key_reveal_failed', 'Nhập sai mật khẩu khi xem API key AI');
      throw new AppException('AI_REVEAL_PASSWORD_INVALID', 'Mật khẩu không đúng.', HttpStatus.BAD_REQUEST);
    }
    const doc = await this.findDoc();
    const fromDb = doc?.api_key_enc ? this.decrypt(doc.api_key_enc) : null;
    const apiKey = fromDb ?? this.envResolved().provider?.apiKey ?? null;
    if (!apiKey) {
      throw new AppException('AI_KEY_MISSING', 'Chưa có API key nào trên web hay trong .env.', HttpStatus.NOT_FOUND);
    }
    const source = fromDb ? 'db' : 'env';
    await this.logReveal(
      actorId,
      'ai_settings.key_revealed',
      `Xem API key AI (${source === 'db' ? 'lưu trên web' : 'lấy từ .env'}) ••••${apiKey.slice(-4)}`,
    );
    return { apiKey, source };
  }

  private async logReveal(actorId: string, action: string, summary: string): Promise<void> {
    await recordActivity(this.activityModel, {
      category: 'auth',
      action,
      summary,
      actorId,
      entityType: 'ai_settings',
      entityCode: 'api_key',
    });
  }

  /** Gọi `GET {baseUrl}/models` bằng giá trị đang nhập (chưa lưu). Không ném lỗi — trả ok:false kèm lý do. */
  async test(dto: TestAiSettingsDto): Promise<AiConnectionTestResult> {
    const current = await this.view();
    const provider = dto.provider ?? current.provider;
    const preset = presetOf(provider);
    const baseUrl = (
      trimmed(dto.base_url) ?? (provider === current.provider ? current.baseUrl : preset.baseUrl)
    ).replace(/\/+$/, '');
    const apiKey = trimmed(dto.api_key) ?? (await this.storedOrEnvKey());
    if (!baseUrl) {
      throw new AppException('AI_BASE_URL_REQUIRED', 'Nhà cung cấp tự nhập cần có URL API.', HttpStatus.BAD_REQUEST);
    }
    if (!apiKey) {
      throw new AppException('AI_KEY_MISSING', 'Chưa có API key để kiểm tra.', HttpStatus.BAD_REQUEST);
    }
    const model = trimmed(dto.model);
    const started = Date.now();
    try {
      const res = await axios.get<unknown>(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: TEST_TIMEOUT_MS,
      });
      const models = parseModelIds(res.data);
      return {
        ok: true,
        latencyMs: Date.now() - started,
        models,
        modelFound: model && models.length > 0 ? models.includes(model) : null,
        error: null,
      };
    } catch (error: unknown) {
      this.logger.warn(`Kiểm tra kết nối AI (${provider}) thất bại: ${describeError(error)}`);
      return {
        ok: false,
        latencyMs: Date.now() - started,
        models: [],
        modelFound: null,
        error: describeConnectionError(error),
      };
    }
  }

  private async resolve(): Promise<Resolved> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.value;
    const doc = await this.findDoc();
    let value = this.envResolved();
    if (doc?.api_key_enc) {
      const apiKey = this.decrypt(doc.api_key_enc);
      if (apiKey) {
        value = {
          provider: {
            name: doc.provider,
            apiKey,
            baseUrl: doc.base_url,
            model: doc.model,
            timeoutMs: doc.timeout_ms,
          },
          visionModel: doc.vision_model ?? doc.model,
        };
      }
    }
    this.cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }

  private envResolved(): Resolved {
    const provider = this.configService.get<AiProviderConfig | null>('ai.provider', null) ?? null;
    const visionModel = this.configService.get<string>('ai.visionModel') ?? provider?.model ?? '';
    return { provider, visionModel };
  }

  private async storedOrEnvKey(): Promise<string | null> {
    const doc = await this.findDoc();
    if (doc?.api_key_enc) return this.decrypt(doc.api_key_enc);
    return this.envResolved().provider?.apiKey ?? null;
  }

  private decrypt(value: string): string | null {
    try {
      return decryptToken(value);
    } catch (error: unknown) {
      // Đổi TOKEN_ENCRYPTION_KEY thì key cũ không giải được — Admin phải nhập lại.
      this.logger.error(`Không giải mã được API key AI đã lưu: ${describeError(error)}`);
      return null;
    }
  }

  private async findDoc(): Promise<AiSettings | null> {
    return this.model
      .findOne({ key: SETTINGS_KEY })
      .select({
        provider: 1,
        base_url: 1,
        model: 1,
        vision_model: 1,
        api_key_enc: 1,
        api_key_last4: 1,
        timeout_ms: 1,
        updatedAt: 1,
      })
      .lean<AiSettings>();
  }
}
