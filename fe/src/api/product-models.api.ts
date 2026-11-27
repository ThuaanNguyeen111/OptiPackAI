import { apiRequest } from '../lib/api'
import type { PrimitiveSpec } from '../components/packing/scene/primitives'
import type { PackingItemModel } from '../types/packing-plan'

/** AOFP-352 — thư viện mô hình 3D (BE /product-models). docs/specs/PRODUCT_3D_MODELS.md */
export type ProductModelSource = 'category' | 'upload' | 'primitive'
export type ProductModelKind = 'garment' | 'rigid'
export type CreditType = 'self_made' | 'supplier' | 'external'

export type ProductModelRow = {
  id: string
  name: string
  source: ProductModelSource
  sourceLabel: string
  kind: ProductModelKind
  categoryKey: string | null
  version: number
  status: 'active' | 'retired'
  hasFoldRig: boolean
  /** Đợt 2 — file quần áo trải phẳng, bước gập dựng bằng code. */
  autoFold?: boolean
  bboxM: { x: number; y: number; z: number } | null
  credit: { type: CreditType; url: string | null; license: string | null } | null
  snapshot: PackingItemModel
  usageCount: number | null
}

export type ModelSuggestion = { reason: 'same_product' | 'same_style' | 'category'; sellerSku: string | null; model: ProductModelRow }

export type PrimitiveParams = Partial<
  Pick<PrimitiveSpec, 'corner_radius_pct' | 'cap_height_pct' | 'shoulder_pct' | 'neck_height_pct' | 'neck_diameter_pct' | 'crimp_pct'>
>

function unwrap<T>(res: unknown): T {
  const r = res as { data?: unknown } | null
  return (r && typeof r === 'object' && 'data' in r && r.data !== undefined ? r.data : res) as T
}

export async function listProductModels(query: {
  q?: string
  source?: ProductModelSource
  status?: 'active' | 'retired' | 'all'
  unused?: boolean
} = {}): Promise<{ items: ProductModelRow[]; total: number }> {
  const params = new URLSearchParams({ limit: '200' })
  if (query.q) params.set('q', query.q)
  if (query.source) params.set('source', query.source)
  if (query.status) params.set('status', query.status)
  if (query.unused) params.set('unused', 'true')
  return unwrap(await apiRequest<unknown>(`/product-models?${params.toString()}`, { auth: true }))
}

export async function createPrimitiveModel(input: {
  name: string
  shape: PrimitiveSpec['shape']
  params: PrimitiveParams
  body_color: string
  cap_color?: string | null
}): Promise<ProductModelRow> {
  return unwrap(await apiRequest<unknown>('/product-models/primitive', { method: 'POST', body: input, auth: true }))
}

export async function uploadProductModel(input: {
  file: File
  name: string
  kind: ProductModelKind
  credit: { type: CreditType; url?: string | null; license?: string | null }
}): Promise<ProductModelRow> {
  const form = new FormData()
  form.append('file', input.file, input.file.name)
  form.append('name', input.name)
  form.append('kind', input.kind)
  form.append('credit', JSON.stringify(input.credit))
  return unwrap(await apiRequest<unknown>('/product-models/upload', { method: 'POST', body: form, auth: true, timeoutMs: 90_000 }))
}

export async function replaceProductModelFile(id: string, file: File): Promise<ProductModelRow> {
  const form = new FormData()
  form.append('file', file, file.name)
  return unwrap(
    await apiRequest<unknown>(`/product-models/${encodeURIComponent(id)}/file`, { method: 'PUT', body: form, auth: true, timeoutMs: 90_000 }),
  )
}

export async function setProductModelStatus(id: string, retired: boolean): Promise<ProductModelRow> {
  return unwrap(
    await apiRequest<unknown>(`/product-models/${encodeURIComponent(id)}/${retired ? 'retire' : 'restore'}`, { method: 'POST', auth: true }),
  )
}

export type ModelHistoryEntry = { version: number; replacedAt: string; snapshot: PackingItemModel }
export type ProductModelDetail = ProductModelRow & {
  history: ModelHistoryEntry[]
  usedBy: { id: string; platform: string; shopId: string; sellerSku: string; productCategory: string | null }[]
}

export async function getProductModel(id: string): Promise<ProductModelDetail> {
  return unwrap(await apiRequest<unknown>(`/product-models/${encodeURIComponent(id)}`, { auth: true }))
}

export type BulkAssignResult = {
  matched: number
  assigned: number
  alreadyUsing: number
  skipped: { productCategory: string | null; count: number; reason: string }[]
  dryRun: boolean
}

/** Đợt 2 — Admin gắn mô hình cho mọi SKU khớp bộ lọc. */
export async function bulkAssignModel(
  id: string,
  input: { product_category?: string; from_model_id?: string; q?: string; dry_run: boolean },
): Promise<BulkAssignResult> {
  return unwrap(await apiRequest<unknown>(`/product-models/${encodeURIComponent(id)}/assign`, { method: 'POST', body: input, auth: true }))
}

export async function getModelSuggestions(productMasterId: string): Promise<ModelSuggestion[]> {
  return unwrap(await apiRequest<unknown>(`/product-master/${encodeURIComponent(productMasterId)}/model-suggestions`, { auth: true }))
}

export async function setSkuModel(productMasterId: string, modelId: string): Promise<void> {
  await apiRequest<unknown>(`/product-master/${encodeURIComponent(productMasterId)}/model`, {
    method: 'PUT',
    body: { model_id: modelId },
    auth: true,
  })
}

/** Cùng luật BE (model-rules.ts): lọc danh sách chọn theo loại SKU. */
const GARMENT_CATEGORIES = new Set(['t_shirt', 'shirt', 'jacket', 'shorts', 'trousers', 'dress'])

export function modelFitsCategory(model: ProductModelRow, category: string | null | undefined): boolean {
  if (category && GARMENT_CATEGORIES.has(category)) return model.kind === 'garment' && (model.hasFoldRig || Boolean(model.autoFold)) && model.source !== 'primitive'
  if (model.kind === 'garment') return false
  if (category === 'bag') return model.source !== 'primitive'
  return true
}

/** Độ méo khi giãn khối bao mô hình (x dài/z rộng/y cao) cho khớp L×W×H của SKU. */
export function distortion(bbox: { x: number; y: number; z: number } | null, dimsCm: [number, number, number]): number {
  if (!bbox) return 0
  const [l, w, h] = dimsCm
  if (!(l > 0 && w > 0 && h > 0)) return 0
  const long = Math.max(bbox.x, bbox.z)
  const short = Math.min(bbox.x, bbox.z)
  const r = [l / Math.max(long, 1e-6), w / Math.max(short, 1e-6), h / Math.max(bbox.y, 1e-6)]
  return Math.max(...r) / Math.min(...r) - 1
}
