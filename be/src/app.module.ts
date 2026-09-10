import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { RedisModule } from './common/redis/redis.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import databaseConfig from './config/database.config';
import googleConfig from './config/google.config';
import jwtConfig from './config/jwt.config';
import mailConfig from './config/mail.config';
import redisConfig from './config/redis.config';
import marketplaceConfig from './config/marketplace.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { MarketplaceIntegrationModule } from './modules/marketplace-integration/marketplace-integration.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductMasterModule } from './modules/product-master/product-master.module';
import { OrderGroupsModule } from './modules/order-groups/order-groups.module';
import { PackagingModule } from './modules/packaging/packaging.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), '.env'), join(process.cwd(), 'be', '.env')],
      load: [databaseConfig, jwtConfig, googleConfig, redisConfig, mailConfig, marketplaceConfig],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('database.uri', 'mongodb://localhost:27017/optipackai'),
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
    // BẮT BUỘC gọi Ở GỐC APP (không phải trong OrdersModule) — mọi
    // @Cron()/@Interval() ở BẤT KỲ module con nào (kể cả các module
    // thêm sau này) chỉ hoạt động khi ScheduleModule được đăng ký ĐÚNG
    // 1 LẦN DUY NHẤT tại đây. Hiện dùng cho
    // orders/lazada-order-sync.scheduler.ts (auto-sync Lazada mỗi 10
    // phút) — khi thêm cron mới ở module khác, KHÔNG import lại
    // ScheduleModule ở module đó.
    ScheduleModule.forRoot(),
    RedisModule,
    UsersModule,
    AuthModule,
    MarketplaceIntegrationModule,
    OrdersModule,
    // MỚI (2026-09-09) — additive thuần túy, KHÔNG sửa dòng nào ở trên.
    ProductMasterModule,
    OrderGroupsModule,
    PackagingModule,
    WarehouseModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
