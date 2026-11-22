import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { isUserRole, UserRole } from '../enums/user-role.enum';

export interface CachedUserAuthState {
  is_active: boolean;
  must_change_password: boolean;
  role: UserRole;

  must_change_password_by?: string;
  /** AOFP-334 — xem User.token_version. Bản cache cũ chưa có = 0. */
  token_version?: number;
}

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.get<string>('redis.host', 'localhost'),
      port: this.configService.get<number>('redis.port', 6379),
      password: this.configService.get<string>('redis.password'),
    });
  }


  private isCachedUserAuthState(value: unknown): value is CachedUserAuthState {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.is_active === 'boolean' &&
      typeof candidate.must_change_password === 'boolean' &&
      typeof candidate.role === 'number' &&
      isUserRole(candidate.role) &&
      (candidate.must_change_password_by === undefined ||
        typeof candidate.must_change_password_by === 'string') &&
      (candidate.token_version === undefined || typeof candidate.token_version === 'number')
    );
  }

  async getUserAuthState(userId: string): Promise<CachedUserAuthState | null> {
    const cached = await this.client.get(`user:auth:${userId}`);
    if (cached === null) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(cached);
    } catch {
      return null; // dữ liệu cache hỏng -> coi như cache miss, không throw
    }

    return this.isCachedUserAuthState(parsed) ? parsed : null;
  }

  async setUserAuthState(
    userId: string,
    state: CachedUserAuthState,
    ttlSeconds = 60,
  ): Promise<void> {
    await this.client.set(`user:auth:${userId}`, JSON.stringify(state), 'EX', ttlSeconds);
  }

  async invalidateUserAuthState(userId: string): Promise<void> {
    await this.client.del(`user:auth:${userId}`);
  }

  /** Giá trị tạm tự hết hạn (mã đổi token, challenge MFA). */
  async setTemp(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async getTemp(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** Đọc rồi xoá trong 1 giao dịch — mã chỉ dùng được 1 lần kể cả khi 2 request đến cùng lúc. */
  async takeTemp(key: string): Promise<string | null> {
    const res = await this.client.multi().get(key).del(key).exec();
    const value = res?.[0]?.[1];
    return typeof value === 'string' ? value : null;
  }

  /** Đặt khoá nếu chưa có (SET NX EX) — true nếu lần này giành được, false nếu đã có người dùng. */
  async claimOnce(key: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
  }

  /** Kiểm tra Redis còn trả lời (GET /health). Có hạn chờ: ioredis xếp hàng lệnh khi mất kết nối nên ping trần có thể treo. */
  async ping(timeoutMs = 1500): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.client.ping(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('redis ping timeout'));
          }, timeoutMs);
        }),
      ]);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * AOFP-330 — khoá ngắn hạn (SET NX PX). Trả token khi giành được, null khi đang có người giữ.
   * Redis lỗi thì ném ra — người gọi tự quyết chạy không khoá.
   */
  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const token = `${String(process.pid)}:${String(Date.now())}:${Math.random().toString(36).slice(2)}`;
    const ok = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    return ok === 'OK' ? token : null;
  }

  /** Chỉ xoá khoá khi còn đúng token của mình (khoá hết hạn rồi bị người khác giành thì không xoá nhầm). */
  async releaseLock(key: string, token: string): Promise<void> {
    await this.client.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      token,
    );
  }

  /** Cờ có hạn: bật. */
  async setFlag(key: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, '1', 'EX', ttlSeconds);
  }

  /** Cờ có hạn: lấy và xoá — true nếu cờ đang bật. */
  async takeFlag(key: string): Promise<boolean> {
    return (await this.client.del(key)) > 0;
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
