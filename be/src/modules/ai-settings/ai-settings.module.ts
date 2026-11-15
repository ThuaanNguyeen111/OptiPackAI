import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityLog, ActivityLogSchema } from '../activity-log/schemas/activity-log.schema';
import { User, UserSchema } from '../users/schemas';
import { AiSettingsController } from './ai-settings.controller';
import { AiSettingsService } from './ai-settings.service';
import { AiSettings, AiSettingsSchema } from './schemas/ai-settings.schema';

// @Global: 3 dịch vụ AI (hướng dẫn đóng gói, quy tắc gộp đơn, đọc phiếu NCC) ở 3 module khác nhau cùng đọc cấu hình này.
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiSettings.name, schema: AiSettingsSchema },
      { name: ActivityLog.name, schema: ActivityLogSchema },
      // Đọc mật khẩu (hash) của Admin để xác nhận trước khi xem API key.
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AiSettingsController],
  providers: [AiSettingsService],
  exports: [AiSettingsService],
})
export class AiSettingsModule {}
