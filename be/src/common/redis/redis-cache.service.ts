import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { isUserRole } from '../enums/user-role.enum';

export interface CachedUserAuthState {
  is_active: boolean;
  must_change_password: boolean;
  role: string;
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

  //!=============================================
  // STRICT FIX: JSON.parse() trả về `any` — trước đây ép kiểu thẳng bằng `as`
  // (unsafe assignment). Giờ validate TỪNG FIELD bằng type guard thật, nếu dữ
  // liệu cache bị hỏng/không đúng shape thì coi như cache miss (an toàn hơn
  // là tin tưởng mù quáng vào dữ liệu từ Redis).
  //!=============================================
  private isCachedUserAuthState(value: unknown): value is CachedUserAuthState {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.is_active === 'boolean' &&
      typeof candidate.must_change_password === 'boolean' &&
      typeof candidate.role === 'string' &&
      isUserRole(candidate.role)
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

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
