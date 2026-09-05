export function requireEnv(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${key}`);
  }
  return value;
}

export function envOrDefault(value: string | undefined, fallback: string): string {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- cố ý coi chuỗi rỗng ('') là "chưa cấu hình", khác nullish coalescing (chỉ bắt null/undefined)
  return value ? value : fallback;
}
