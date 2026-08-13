import { Global, Module } from '@nestjs/common';
import { RedisCacheService } from './redis-cache.service';

// @Global(): chỉ cần import 1 lần ở AppModule, mọi module khác dùng được
// RedisCacheService mà không cần import lại RedisModule.
@Global()
@Module({
  providers: [RedisCacheService],
  exports: [RedisCacheService],
})
export class RedisModule {}
