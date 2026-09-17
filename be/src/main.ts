import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use(compression());

  const configuredCorsOrigins = process.env.CORS_ORIGIN
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const corsOrigins = configuredCorsOrigins?.length
    ? configuredCorsOrigins
    : ['http://localhost:5173'];
  if (process.env.NODE_ENV !== 'production' && !corsOrigins.includes('http://localhost:3001')) {
    corsOrigins.push('http://localhost:3001');
  }
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, 
      forbidNonWhitelisted: true, 
      transform: true,
    }),
  );

  // Chuẩn hóa MỌI response lỗi (kể cả lỗi ValidationPipe phía trên và
  // lỗi không lường trước) về đúng 1 hình dạng có error_code — xem
  // common/filters/global-exception.filter.ts
  app.useGlobalFilters(new GlobalExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('OptiPack AI API')
    .setDescription(
      'AI-Assisted Omnichannel Order Fulfillment and Packaging Optimization System',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT-auth',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
