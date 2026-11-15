import { isSwaggerEnabled } from './swagger-enabled.util';

describe('isSwaggerEnabled', () => {
  it('bật khi chạy dev (không đặt NODE_ENV hoặc development)', () => {
    expect(isSwaggerEnabled({})).toBe(true);
    expect(isSwaggerEnabled({ NODE_ENV: 'development' })).toBe(true);
  });

  it('tắt khi production nếu không đặt SWAGGER_ENABLED', () => {
    expect(isSwaggerEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: '' })).toBe(false);
  });

  it('SWAGGER_ENABLED ghi đè theo môi trường', () => {
    expect(isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })).toBe(true);
    expect(isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: ' TRUE ' })).toBe(true);
    expect(isSwaggerEnabled({ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' })).toBe(false);
    expect(isSwaggerEnabled({ SWAGGER_ENABLED: '0' })).toBe(false);
  });
});
