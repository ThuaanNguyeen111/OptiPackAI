import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios, { isAxiosError } from 'axios';
import { Model, Types } from 'mongoose';
import { DeviceToken, DeviceTokenDocument, type DevicePlatform } from '../schemas/device-token.schema';
import {
  GOOGLE_TOKEN_URL,
  buildFcmMessage,
  buildServiceAccountJwt,
  isDeadTokenError,
  readFcmServiceAccount,
  type FcmServiceAccount,
  type PushContent,
} from './fcm.util';

const HTTP_TIMEOUT_MS = 10_000;
/** Một người tối đa 10 máy — quá thì bỏ máy lâu không mở app nhất. */
export const MAX_DEVICES_PER_USER = 10;

/**
 * 10/11/2026 — Lưu token thiết bị + gửi push FCM (BE_MOBILE_CHECKLIST mục 3).
 * Chưa cấu hình FCM_SERVICE_ACCOUNT_FILE → không gửi push, in-app và email vẫn chạy.
 * Lỗi push không bao giờ làm hỏng thao tác chính.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private account: FcmServiceAccount | null | undefined;
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(@InjectModel(DeviceToken.name) private readonly deviceModel: Model<DeviceTokenDocument>) {}

  async registerDevice(userId: string, input: { token: string; platform: DevicePlatform; appVersion?: string }): Promise<void> {
    const userOid = new Types.ObjectId(userId);
    await this.deviceModel.updateOne(
      { token: input.token },
      { $set: { user_id: userOid, platform: input.platform, app_version: input.appVersion ?? null, last_seen_at: new Date() } },
      { upsert: true },
    );
    const extra = await this.deviceModel
      .find({ user_id: userOid })
      .sort({ last_seen_at: -1 })
      .skip(MAX_DEVICES_PER_USER)
      .select('_id')
      .lean();
    if (extra.length > 0) await this.deviceModel.deleteMany({ _id: { $in: extra.map((d) => d._id) } });
  }

  /** Chỉ gỡ token của chính người gọi (đăng xuất). */
  async unregisterDevice(userId: string, token: string): Promise<boolean> {
    const result = await this.deviceModel.deleteOne({ token, user_id: new Types.ObjectId(userId) });
    return result.deletedCount > 0;
  }

  isConfigured(): boolean {
    return this.getAccount() !== null;
  }

  /** Gửi tới mọi thiết bị của các user; trả số máy nhận thành công. */
  async sendToUsers(userIds: Types.ObjectId[], content: PushContent): Promise<number> {
    const account = this.getAccount();
    if (!account || userIds.length === 0) return 0;
    const devices = await this.deviceModel.find({ user_id: { $in: userIds } }).select('token').lean();
    if (devices.length === 0) return 0;
    const accessToken = await this.getAccessToken(account);
    if (!accessToken) return 0;

    const results = await Promise.all(devices.map((d) => this.sendOne(account, accessToken, d.token, content)));
    const dead = devices.filter((_, i) => results[i] === 'dead').map((d) => d.token);
    if (dead.length > 0) {
      await this.deviceModel.deleteMany({ token: { $in: dead } });
      this.logger.log(`Đã xoá ${String(dead.length)} token thiết bị không còn hợp lệ.`);
    }
    return results.filter((r) => r === 'ok').length;
  }

  private async sendOne(account: FcmServiceAccount, accessToken: string, token: string, content: PushContent): Promise<'ok' | 'dead' | 'error'> {
    try {
      await axios.post(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.projectId)}/messages:send`,
        buildFcmMessage(token, content),
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: HTTP_TIMEOUT_MS },
      );
      return 'ok';
    } catch (error: unknown) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      const body: unknown = isAxiosError(error) ? error.response?.data : undefined;
      if (isDeadTokenError(status, body)) return 'dead';
      if (status === 401) this.accessToken = null; // token OAuth bị thu hồi → lần sau xin lại
      // Không ghi token thiết bị đầy đủ vào log.
      this.logger.warn(`Gửi push thất bại (máy …${token.slice(-6)}): HTTP ${String(status ?? 'không phản hồi')}.`);
      return 'error';
    }
  }

  private getAccount(): FcmServiceAccount | null {
    if (this.account === undefined) {
      this.account = readFcmServiceAccount(process.env);
      if (!this.account && process.env.FCM_SERVICE_ACCOUNT_FILE) {
        this.logger.warn('FCM_SERVICE_ACCOUNT_FILE không đọc được (sai đường dẫn hoặc file không phải service account) — tắt push.');
      }
    }
    return this.account;
  }

  private async getAccessToken(account: FcmServiceAccount): Promise<string | null> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    try {
      const assertion = buildServiceAccountJwt(account, Math.floor(Date.now() / 1000));
      const { data } = await axios.post<{ access_token?: unknown; expires_in?: unknown }>(
        GOOGLE_TOKEN_URL,
        new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: HTTP_TIMEOUT_MS },
      );
      if (typeof data.access_token !== 'string') throw new Error('phản hồi thiếu access_token');
      const ttl = typeof data.expires_in === 'number' ? data.expires_in : 3600;
      this.accessToken = { value: data.access_token, expiresAt: Date.now() + ttl * 1000 };
      return this.accessToken.value;
    } catch (error: unknown) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      this.logger.warn(`Không lấy được access token FCM: ${status ? `HTTP ${String(status)}` : error instanceof Error ? error.message : 'lỗi'}.`);
      return null;
    }
  }
}
