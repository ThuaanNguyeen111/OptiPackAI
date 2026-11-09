import { Controller, Get, Res } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Connection, ConnectionStates } from 'mongoose';
import { RedisCacheService } from '../common/redis/redis-cache.service';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  mongo: 'up' | 'down';
  redis: 'up' | 'down';
  uptime_s: number;
  time: string;
}

const MONGO_PING_TIMEOUT_MS = 1500;

/**
 * GET /health — app mobile / máy giám sát hỏi server còn sống không
 * (09/11/2026, BE_MOBILE_CHECKLIST mục 5). Công khai, không cần token,
 * không tính vào giới hạn gọi. 200 khi MongoDB + Redis đều trả lời,
 * 503 khi có cái lỗi (body cùng hình dạng để app hiện đúng cái nào lỗi).
 * Không trả chi tiết kết nối (host, lỗi gốc) để khỏi lộ hạ tầng.
 */
@ApiTags('Health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly redis: RedisCacheService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Kiểm tra server, MongoDB và Redis (200 ok / 503 degraded)',
  })
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthResponse> {
    const [mongoUp, redisUp] = await Promise.all([
      this.pingMongo(),
      this.redis.ping(),
    ]);
    const ok = mongoUp && redisUp;
    if (!ok) res.status(503);
    return {
      status: ok ? 'ok' : 'degraded',
      mongo: mongoUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down',
      uptime_s: Math.round(process.uptime()),
      time: new Date().toISOString(),
    };
  }

  private async pingMongo(): Promise<boolean> {
    const db = this.connection.db;
    if (this.connection.readyState !== ConnectionStates.connected || !db)
      return false;
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        db.admin().ping(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('mongo ping timeout'));
          }, MONGO_PING_TIMEOUT_MS);
        }),
      ]);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
