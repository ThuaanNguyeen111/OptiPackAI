import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

//!=============================================
// FIX #37: E2E test đầu tiên cho luồng Auth thật - KHÔNG mock gì cả, dựng
// nguyên AppModule thật (kết nối MongoDB/Redis thật theo .env đang cấu
// hình), gửi HTTP request thật qua supertest. Khác hẳn 2 file unit test đã
// có (auth.service.spec.ts, token.service.spec.ts) - những file đó mock
// toàn bộ dependency, chỉ test đúng logic bên trong 1 class cô lập.
//
// CHỦ Ý CHỌN 3 case dưới đây vì KHÔNG CẦN tạo sẵn user thật trong DB:
//   - Validate DTO sai -> lỗi ngay ở ValidationPipe, chưa chạm DB
//   - Email không tồn tại -> vẫn trả lời (không throw sớm), không cần fixture
//   - Gọi route cần đăng nhập mà không có token -> chặn ở Guard, chưa chạm DB
// Nếu sau này muốn E2E cho case "login thành công" (cần user thật tồn tại
// trong DB), nên tạo riêng 1 user cố định cho môi trường test qua
// beforeAll(), rồi dọn lại (afterAll()) - tránh để lẫn với dữ liệu thật.
//!=============================================
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Áp dụng ĐÚNG cấu hình như main.ts thật - nếu không, ValidationPipe sẽ
    // KHÔNG chạy trong test, dẫn tới test case #1 dưới đây luôn sai (fail
    // vì tưởng validate hoạt động nhưng thực ra app trong test không có nó).
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('thiếu email trong body -> 400 (ValidationPipe chặn trước khi chạm DB)', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ password: 'anything' })
        .expect(400);
    });

    it('email sai định dạng -> 400', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'khong-phai-email', password: 'anything' })
        .expect(400);
    });

    it('email không tồn tại trong hệ thống -> 401, không lộ thông tin email có tồn tại hay không', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'khong-ton-tai@optipackai.com', password: 'MatKhauBatKy123@' })
        .expect(401)
        .expect((res) => {
          // STRICT FIX: res.body của supertest luôn là `any` (không rõ shape
          // response) - khai kiểu tường minh trước khi truy cập field, không
          // để unsafe member access lọt qua.
          const body = res.body as { message: string };
          expect(body.message).toBe('Email hoặc mật khẩu không chính xác.');
        });
    });
  });

  describe('GET /users/me', () => {
    it('không kèm Authorization header -> 401 (JwtAuthGuard chặn trước khi chạm Controller)', () => {
      return request(app.getHttpServer()).get('/users/me').expect(401);
    });

    it('kèm token rác/không hợp lệ -> 401', () => {
      return request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', 'Bearer token-gia-mao-khong-hop-le')
        .expect(401);
    });
  });
});
