import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
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
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly client: Redis;
  private warnedOffline = false;

  constructor(private readonly configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.get<string>('redis.host', 'localhost'),
      port: this.configService.get<number>('redis.port', 6379),
      password: this.configService.get<string>('redis.password'),
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times: number): number | null => {
        if (times > 8) return null;
        return Math.min(times * 200, 2000);
      },
    });

    this.client.on('error', (err: Error) => {
      if (this.warnedOffline) return;
      this.warnedOffline = true;
      this.logger.warn(`Redis không kết nối được, fallback MongoDB: ${err.message}`);
    });
    this.client.on('connect', () => {
      this.warnedOffline = false;
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
    try {
      const cached = await this.client.get(`user:auth:${userId}`);
      if (cached === null) return null;

      let parsed: unknown;
      try {
        parsed = JSON.parse(cached);
      } catch {
        return null;
      }

      return this.isCachedUserAuthState(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async setUserAuthState(
    userId: string,
    state: CachedUserAuthState,
    ttlSeconds = 60,
  ): Promise<void> {
    try {
      await this.client.set(`user:auth:${userId}`, JSON.stringify(state), 'EX', ttlSeconds);
    } catch {
      // cache miss is acceptable when Redis is down
    }
  }

  async invalidateUserAuthState(userId: string): Promise<void> {
    try {
      await this.client.del(`user:auth:${userId}`);
    } catch {
      // ignore
    }
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
