import { apiRequest } from '../lib/api'

/** BE nhận 1–3 ảnh mỗi lần, mỗi ảnh ≤ 10 MB (JPG / PNG / WebP / HEIC). */
export const MAX_PROOF_PHOTOS = 3
export const MAX_PROOF_PHOTO_BYTES = 10 * 1024 * 1024

/**
 * `proof` = ảnh bằng chứng (giao hàng, giao thất bại, kiểm hàng hoàn, báo lỗi kiện);
 * `receipt` = ảnh phiếu nhà cung cấp lúc nhập kho / nhập vật tư.
 */
export type ProofPhotoPurpose = 'proof' | 'receipt'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/** POST /proof-photos — trả link ảnh theo đúng thứ tự gửi. Danh sách rỗng thì không gọi BE. */
export async function uploadProofPhotos(
  files: File[],
  purpose: ProofPhotoPurpose = 'proof',
): Promise<string[]> {
  if (files.length === 0) return []
  const form = new FormData()
  for (const file of files.slice(0, MAX_PROOF_PHOTOS)) form.append('files', file, file.name)
  const res = await apiRequest<unknown>(`/proof-photos${purpose === 'receipt' ? '?purpose=receipt' : ''}`, {
    method: 'POST',
    auth: true,
    body: form,
    timeoutMs: 60_000,
  })
  const photos = asRecord(res)?.photos
  if (!Array.isArray(photos)) throw new Error('Không đọc được ảnh vừa tải.')
  return photos.flatMap((p) => {
    const url = asRecord(p)?.url
    return typeof url === 'string' && url ? [url] : []
  })
}
