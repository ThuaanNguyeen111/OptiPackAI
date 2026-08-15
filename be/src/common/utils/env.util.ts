
export function requireEnv(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${key}`);
  }
  return value;
}
