/**
 * Trang Swagger (/api/docs) có được bật không.
 * - SWAGGER_ENABLED=true / false: theo đúng giá trị (ưu tiên cao nhất).
 * - Không đặt: bật khi chạy dev, TẮT khi NODE_ENV=production.
 * Lưu ý: docker-compose, be/Dockerfile, k8s đều đặt sẵn NODE_ENV=production,
 * nên chạy bằng Docker mà muốn xem Swagger thì đặt SWAGGER_ENABLED=true.
 */
export function isSwaggerEnabled(env: Record<string, string | undefined>): boolean {
  const flag = env.SWAGGER_ENABLED?.trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  return env.NODE_ENV !== 'production';
}
