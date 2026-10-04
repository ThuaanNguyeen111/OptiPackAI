import { apiRequest } from '../lib/api'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string') return value
  }
  return ''
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export type ColorRecord = {
  code: string
  name: string
  hex: string
  isActive: boolean
}

export type MasterSkuRecord = {
  masterSku: string
  categoryCode: string
  modelNo: number
  colorCode: string
  size: string
  name: string
  gender: 'nam' | 'nu' | 'unisex' | ''
  weightKg: number | null
  isFragile: boolean
  isActive: boolean
  replacedBy: string | null
}

export type SkuMappingRecord = {
  id: string
  platform: string
  shopId: string
  sellerSku: string
  masterSku: string
}

export type UnmappedSellerSku = {
  platform: string
  shop_id: string
  seller_sku: string
}

export type UnpooledStockRow = {
  assignmentId: string
  sellerSku: string
  shopId: string
  platform: string
  quantityOnHand: number
  binLocationId: string
}

export type ProductMasterRow = {
  id: string
  platform: string
  shopId: string
  sellerSku: string
  lengthCm: number | null
  widthCm: number | null
  heightCm: number | null
  weightKg: number | null
  isFragile: boolean
  manualOverride: boolean
}

export type StockAvailability = {
  stockKey: string
  masterSku: string | null
  onHand: number
  reserved: number
  available: number
}

function mapColor(raw: unknown): ColorRecord | null {
  const row = asRecord(raw)
  if (!row) return null
  const code = pickString(row.code)
  if (!code) return null
  return {
    code,
    name: pickString(row.name),
    hex: pickString(row.hex),
    isActive: row.isActive !== false && row.is_active !== false,
  }
}

function mapMasterSku(raw: unknown): MasterSkuRecord | null {
  const row = asRecord(raw)
  if (!row) return null
  const masterSku = pickString(row.masterSku, row.master_sku)
  if (!masterSku) return null
  const gender = pickString(row.gender)
  return {
    masterSku,
    categoryCode: pickString(row.categoryCode, row.category_code),
    modelNo: pickNumber(row.modelNo, row.model_no) ?? 0,
    colorCode: pickString(row.colorCode, row.color_code),
    size: pickString(row.size),
    name: pickString(row.name),
    gender: gender === 'nam' || gender === 'nu' || gender === 'unisex' ? gender : '',
    weightKg: pickNumber(row.weightKg, row.weight_kg),
    isFragile: row.isFragile === true || row.is_fragile === true,
    isActive: row.isActive !== false && row.is_active !== false,
    replacedBy: pickString(row.replacedBy, row.replaced_by) || null,
  }
}

function mapMapping(raw: unknown): SkuMappingRecord | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = pickString(row.id, row._id)
  if (!id) return null
  return {
    id,
    platform: pickString(row.platform),
    shopId: pickString(row.shopId, row.shop_id),
    sellerSku: pickString(row.sellerSku, row.seller_sku),
    masterSku: pickString(row.masterSku, row.master_sku),
  }
}

export function previewMasterSku(
  categoryCode: string,
  modelNo: number,
  colorCode: string,
  size: string,
): string {
  if (!categoryCode || !colorCode || !size || modelNo < 1 || modelNo > 999) return ''
  return `${categoryCode}-${String(modelNo).padStart(3, '0')}-${colorCode}-${size}`
}

export async function listColors(includeInactive = false): Promise<ColorRecord[]> {
  const res = await apiRequest<unknown>(
    `/colors${includeInactive ? '?include_inactive=true' : ''}`,
    { auth: true },
  )
  if (!Array.isArray(res)) return []
  return res.map(mapColor).filter((row): row is ColorRecord => row !== null)
}

export async function createColor(input: {
  code: string
  name: string
  hex?: string
}): Promise<ColorRecord> {
  const created = mapColor(
    await apiRequest<unknown>('/colors', { method: 'POST', body: input, auth: true }),
  )
  if (!created) throw new Error('Tạo màu thành công nhưng server không trả mã.')
  return created
}

export async function updateColor(
  code: string,
  input: { name?: string; hex?: string },
): Promise<ColorRecord> {
  const updated = mapColor(
    await apiRequest<unknown>(`/colors/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: input,
      auth: true,
    }),
  )
  if (!updated) throw new Error('Sửa màu thành công nhưng server không trả dữ liệu.')
  return updated
}

export async function setColorActive(code: string, active: boolean): Promise<void> {
  await apiRequest<unknown>(
    active
      ? `/colors/${encodeURIComponent(code)}/reactivate`
      : `/colors/${encodeURIComponent(code)}`,
    { method: active ? 'POST' : 'DELETE', auth: true },
  )
}

export async function listMasterSkus(query: {
  search?: string
  includeInactive?: boolean
  page?: number
  limit?: number
}): Promise<{ items: MasterSkuRecord[]; total: number }> {
  const res = await apiRequest<unknown>(
    `/master-skus${qs({
      search: query.search,
      include_inactive: query.includeInactive ? 'true' : undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    })}`,
    { auth: true },
  )
  const row = asRecord(res)
  const items = Array.isArray(row?.items) ? row.items : []
  return {
    items: items.map(mapMasterSku).filter((item): item is MasterSkuRecord => item !== null),
    total: pickNumber(row?.total) ?? items.length,
  }
}

export async function createMasterSku(input: {
  category_code: string
  model_no: number
  color_code: string
  size: string
  name: string
  gender?: 'nam' | 'nu' | 'unisex'
  weight_kg?: number
  is_fragile?: boolean
}): Promise<MasterSkuRecord> {
  const created = mapMasterSku(
    await apiRequest<unknown>('/master-skus', { method: 'POST', body: input, auth: true }),
  )
  if (!created) throw new Error('Tạo SKU nội bộ thành công nhưng server không trả mã.')
  return created
}

export async function replaceMasterSku(
  code: string,
  input: {
    category_code?: string
    model_no?: number
    color_code?: string
    size?: string
    reason: string
  },
): Promise<{ newSku: string; movedMappings: number }> {
  const res = asRecord(
    await apiRequest<unknown>(`/master-skus/${encodeURIComponent(code)}/replace`, {
      method: 'POST',
      body: input,
      auth: true,
    }),
  )
  const next = mapMasterSku(res?.newSku)
  return {
    newSku: next?.masterSku ?? '',
    movedMappings: pickNumber(res?.movedMappings) ?? 0,
  }
}

export async function setMasterSkuActive(code: string, active: boolean): Promise<void> {
  await apiRequest<unknown>(
    active
      ? `/master-skus/${encodeURIComponent(code)}/reactivate`
      : `/master-skus/${encodeURIComponent(code)}`,
    { method: active ? 'POST' : 'DELETE', auth: true },
  )
}

export async function listSkuMappings(code: string): Promise<SkuMappingRecord[]> {
  const res = await apiRequest<unknown>(
    `/master-skus/${encodeURIComponent(code)}/mappings`,
    { auth: true },
  )
  if (!Array.isArray(res)) return []
  return res.map(mapMapping).filter((row): row is SkuMappingRecord => row !== null)
}

export async function createSkuMapping(
  code: string,
  input: { platform: string; shop_id: string; seller_sku: string },
): Promise<void> {
  await apiRequest<unknown>(`/master-skus/${encodeURIComponent(code)}/mappings`, {
    method: 'POST',
    body: input,
    auth: true,
  })
}

export async function deleteSkuMapping(id: string): Promise<void> {
  await apiRequest<unknown>(`/master-skus/mappings/${id}`, {
    method: 'DELETE',
    auth: true,
  })
}

export async function listUnmappedSellerSkus(): Promise<UnmappedSellerSku[]> {
  const res = await apiRequest<unknown>('/master-skus/unmapped-seller-skus', { auth: true })
  if (!Array.isArray(res)) return []
  return res.flatMap((raw) => {
    const row = asRecord(raw)
    if (!row) return []
    const seller_sku = pickString(row.seller_sku, row.sellerSku)
    const shop_id = pickString(row.shop_id, row.shopId)
    if (!seller_sku || !shop_id) return []
    return [{ platform: pickString(row.platform) || 'lazada', shop_id, seller_sku }]
  })
}

export async function listUnpooledStock(): Promise<{
  notMapped: UnpooledStockRow[]
  mappedNotSynced: UnpooledStockRow[]
}> {
  const res = asRecord(await apiRequest<unknown>('/master-skus/unpooled-stock', { auth: true }))
  const mapRows = (value: unknown): UnpooledStockRow[] => {
    if (!Array.isArray(value)) return []
    return value.flatMap((raw) => {
      const row = asRecord(raw)
      if (!row) return []
      return [
        {
          assignmentId: pickString(row.assignmentId, row.assignment_id),
          sellerSku: pickString(row.sellerSku, row.seller_sku),
          shopId: pickString(row.shopId, row.shop_id),
          platform: pickString(row.platform),
          quantityOnHand: pickNumber(row.quantityOnHand, row.quantity_on_hand) ?? 0,
          binLocationId: pickString(row.binLocationId, row.bin_location_id),
        },
      ]
    })
  }
  return {
    notMapped: mapRows(res?.notMapped),
    mappedNotSynced: mapRows(res?.mappedNotSynced),
  }
}

export async function syncPooledStock(): Promise<{
  mappings: number
  tagged: number
  merged: number
}> {
  const res = asRecord(
    await apiRequest<unknown>('/master-skus/sync-stock', { method: 'POST', auth: true }),
  )
  return {
    mappings: pickNumber(res?.mappings) ?? 0,
    tagged: pickNumber(res?.tagged) ?? 0,
    merged: pickNumber(res?.merged) ?? 0,
  }
}

export async function syncProductCatalog(input: {
  shopId?: string
  full?: boolean
}): Promise<Array<{ ok: boolean; shopId: string; synced: number; products: number; error: string }>> {
  const res = asRecord(
    await apiRequest<unknown>(
      `/product-master/sync${qs({
        shop_id: input.shopId,
        full: input.full ? 'true' : undefined,
      })}`,
      { method: 'POST', auth: true, timeoutMs: 120_000 },
    ),
  )
  const results = Array.isArray(res?.results) ? res.results : []
  return results.flatMap((raw) => {
    const row = asRecord(raw)
    if (!row) return []
    return [
      {
        ok: row.ok === true,
        shopId: pickString(row.shopId, row.shop_id),
        synced: pickNumber(row.synced) ?? 0,
        products: pickNumber(row.products) ?? 0,
        error: pickString(row.error),
      },
    ]
  })
}

export async function listProductMaster(query: {
  shopId?: string
  search?: string
  page?: number
}): Promise<{ items: ProductMasterRow[]; total: number }> {
  const res = asRecord(
    await apiRequest<unknown>(
      `/product-master${qs({
        shop_id: query.shopId,
        search: query.search,
        page: query.page ?? 1,
        limit: 20,
      })}`,
      { auth: true },
    ),
  )
  const items = Array.isArray(res?.items) ? res.items : []
  return {
    total: pickNumber(res?.total) ?? items.length,
    items: items.flatMap((raw) => {
      const row = asRecord(raw)
      if (!row) return []
      const id = pickString(row.id)
      if (!id) return []
      return [
        {
          id,
          platform: pickString(row.platform),
          shopId: pickString(row.shopId, row.shop_id),
          sellerSku: pickString(row.sellerSku, row.seller_sku),
          lengthCm: pickNumber(row.lengthCm, row.length_cm),
          widthCm: pickNumber(row.widthCm, row.width_cm),
          heightCm: pickNumber(row.heightCm, row.height_cm),
          weightKg: pickNumber(row.weightKg, row.weight_kg),
          isFragile: row.isFragile === true || row.is_fragile === true,
          manualOverride: row.manualOverride === true || row.manual_override === true,
        },
      ]
    }),
  }
}

export async function lookupStockAvailability(input: {
  platform: string
  shop_id: string
  seller_sku: string
}): Promise<StockAvailability> {
  const res = asRecord(
    await apiRequest<unknown>(
      `/stock-availability${qs({
        platform: input.platform,
        shop_id: input.shop_id,
        seller_sku: input.seller_sku,
      })}`,
      { auth: true },
    ),
  )
  return {
    stockKey: pickString(res?.stockKey, res?.stock_key),
    masterSku: pickString(res?.masterSku, res?.master_sku) || null,
    onHand: pickNumber(res?.onHand, res?.on_hand) ?? 0,
    reserved: pickNumber(res?.reserved) ?? 0,
    available: pickNumber(res?.available) ?? 0,
  }
}
