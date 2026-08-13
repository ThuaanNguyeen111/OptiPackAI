import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

//!=============================================
// FIX: bootstrap() là async function nhưng gọi mà không await/void trước đây
// -> @typescript-eslint/no-floating-promises. Dùng `void` để khai báo rõ ràng
// đây là promise cố tình không chờ (top-level, không có gì để await tiếp).
//!=============================================
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
