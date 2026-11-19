import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { isUserRole, UserRole } from '../enums/user-role.enum';

export interface CachedUserAuthState {
  is_active: boolean;
  must_change_password: boolean;
  role: UserRole;

  must_change_password_by?: string;
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
        typeof candidate.must_change_password_by === 'string')
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

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
