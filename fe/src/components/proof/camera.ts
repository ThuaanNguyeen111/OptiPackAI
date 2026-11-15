/** Trình duyệt có webcam / camera dùng được không (cần HTTPS hoặc localhost). */
export function canUseCamera(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
}
