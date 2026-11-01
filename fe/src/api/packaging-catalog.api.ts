import { apiRequest } from '../lib/api'

/**
 * Danh mục thùng / túi zip / vật tư chèn mà engine đóng gói đọc.
 * Thùng và vật tư chèn nằm cùng collection với `/packaging-materials`;
 * túi zip là collection riêng.
 */

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock'

export type MmSize = {
  lengthMm: number
  widthMm: number
  heightMm: number
}

export type PackagingBox = {
  id: string
  code: string
  name: string
  inner: MmSize
  outer: MmSize
  tareG: number
  maxLoadG: number
  priceVnd: number | null
  isSample: boolean
  isActive: boolean
  quantityOnHand: number
  reserved: number
  available: number
  reorderLevel: number
  storageLocation: string | null
  stockStatus: StockStatus
}

export type CatalogMovement = {
  delta: number
  reason: string
  balanceAfter: number
  orderGroupId: string | null
  note: string | null
  createdAt: string | null
}

export type PackagingBag = {
  id: string
  code: string
  name: string
  widthMm: number
  lengthMm: number
  priceVnd: number | null
  isSample: boolean
  isActive: boolean
  quantityOnHand: number
  reorderLevel: number
}

export type CushionMaterialType =
  | 'foam_corner'
  | 'corrugated_divider'
  | 'air_pillow'
  | 'bubble_wrap'
  | 'fragile_tape'
  | 'kraft_paper'
  | 'tissue_paper'

export type CushionMaterial = {
  id: string
  code: string
  name: string
  type: string
  unit: string
  weightGPerUnit: number
  priceVndPerUnit: number
  quantityOnHand: number
  quantityNew: number
  quantityReused: number
  reorderLevel: number
  storageLocation: string | null
  isSample: boolean
  isActive: boolean
  reusable: boolean
  stockStatus: StockStatus
}

export type MaterialRuleBasis =
  | 'per_unit'
  | 'per_extra_unit'
  | 'per_carton'
  | 'void_band'

export type MaterialRuleScope = 'fragile' | 'shoes' | 'fragile_or_shoes' | 'any'

export type MaterialRule = {
  materialType: string
  appliesTo: string
  minUnits: number
  basis: string
  quantity: number
  voidBands: { minVoidRatio: number; quantity: number }[]
}

export type MaterialRules = {
  version: number | null
  isDefault: boolean
  rules: MaterialRule[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function size(value: unknown): MmSize {
  const row = asRecord(value)
  return {
    lengthMm: num(row?.lengthMm ?? row?.length_mm),
    widthMm: num(row?.widthMm ?? row?.width_mm),
    heightMm: num(row?.heightMm ?? row?.height_mm),
  }
}

function stockStatus(value: unknown): StockStatus {
  if (value === 'low_stock' || value === 'out_of_stock' || value === 'in_stock') {
    return value
  }
  return 'in_stock'
}

function mapMovement(raw: unknown): CatalogMovement | null {
  const row = asRecord(raw)
  if (!row) return null
  return {
    delta: num(row.delta),
    reason: str(row.reason) ?? '',
    balanceAfter: num(row.balanceAfter ?? row.balance_after),
    orderGroupId: str(row.orderGroupId ?? row.order_group_id),
    note: str(row.note),
    createdAt: str(row.createdAt ?? row.created_at),
  }
}

function mapBox(raw: unknown): PackagingBox | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = str(row.id) ?? ''
  const code = str(row.code) ?? ''
  if (!id || !code) return null
  return {
    id,
    code,
    name: str(row.name) ?? code,
    inner: size(row.inner),
    outer: size(row.outer),
    tareG: num(row.tareG ?? row.tare_g),
    maxLoadG: num(row.maxLoadG ?? row.max_load_g),
    priceVnd:
      row.priceVnd === null || row.price_vnd === null
        ? null
        : num(row.priceVnd ?? row.price_vnd),
    isSample: bool(row.isSample ?? row.is_sample, false),
    isActive: bool(row.isActive ?? row.is_active, true),
    quantityOnHand: num(row.quantityOnHand ?? row.quantity_on_hand),
    reserved: num(row.reserved),
    available: num(row.available),
    reorderLevel: num(row.reorderLevel ?? row.reorder_level),
    storageLocation: str(row.storageLocation ?? row.storage_location),
    stockStatus: stockStatus(row.stockStatus ?? row.stock_status),
  }
}

function rowsOf(res: unknown): unknown[] {
  return Array.isArray(res) ? res : []
}

export async function listPackagingBoxes(
  activeOnly = true,
): Promise<PackagingBox[]> {
  const res = await apiRequest<unknown>(
    `/packaging/boxes?active=${activeOnly ? 'true' : 'false'}`,
    { auth: true },
  )
  return rowsOf(res).flatMap((raw) => {
    const item = mapBox(raw)
    return item ? [item] : []
  })
}

export type BoxSizeInput = {
  lengthMm: number
  widthMm: number
  heightMm: number
}

export type CreateBoxInput = {
  code: string
  name: string
  inner: BoxSizeInput
  outer: BoxSizeInput
  tareG: number
  maxLoadG: number
  priceVnd?: number | null
  reorderLevel?: number
  storageLocation?: string | null
}

function sizeBody(sizeInput: BoxSizeInput): Record<string, number> {
  return {
    length_mm: sizeInput.lengthMm,
    width_mm: sizeInput.widthMm,
    height_mm: sizeInput.heightMm,
  }
}

export async function createPackagingBox(
  input: CreateBoxInput,
): Promise<PackagingBox> {
  const res = await apiRequest<unknown>('/packaging/boxes', {
    method: 'POST',
    auth: true,
    body: {
      code: input.code.trim(),
      name: input.name.trim(),
      inner: sizeBody(input.inner),
      outer: sizeBody(input.outer),
      tare_g: input.tareG,
      max_load_g: input.maxLoadG,
      price_vnd: input.priceVnd ?? null,
      reorder_level: input.reorderLevel,
      storage_location: input.storageLocation?.trim() || null,
    },
  })
  const item = mapBox(res)
  if (!item) throw new Error('Không đọc được thùng vừa tạo.')
  return item
}

export async function updatePackagingBox(
  id: string,
  input: {
    name?: string
    priceVnd?: number | null
    isActive?: boolean
    reorderLevel?: number
    storageLocation?: string | null
  },
): Promise<PackagingBox> {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name.trim()
  if (input.priceVnd !== undefined) body.price_vnd = input.priceVnd
  if (input.isActive !== undefined) body.is_active = input.isActive
  if (input.reorderLevel !== undefined) body.reorder_level = input.reorderLevel
  if (input.storageLocation !== undefined) {
    body.storage_location = input.storageLocation
  }
  const res = await apiRequest<unknown>(`/packaging/boxes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    auth: true,
    body,
  })
  const item = mapBox(res)
  if (!item) throw new Error('Không đọc được thùng vừa sửa.')
  return item
}

export async function stockInPackagingBox(
  id: string,
  quantity: number,
  note?: string,
): Promise<PackagingBox> {
  const res = await apiRequest<unknown>(
    `/packaging/boxes/${encodeURIComponent(id)}/stock-in`,
    {
      method: 'POST',
      auth: true,
      body: { quantity, note: note?.trim() || undefined },
    },
  )
  const item = mapBox(res)
  if (!item) throw new Error('Không đọc được tồn thùng.')
  return item
}

export async function listBoxMovements(id: string): Promise<CatalogMovement[]> {
  const res = await apiRequest<unknown>(
    `/packaging/boxes/${encodeURIComponent(id)}/movements`,
    { auth: true },
  )
  return rowsOf(res).flatMap((raw) => {
    const item = mapMovement(raw)
    return item ? [item] : []
  })
}

function mapBag(raw: unknown): PackagingBag | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = str(row.id) ?? ''
  const code = str(row.code) ?? ''
  if (!id || !code) return null
  return {
    id,
    code,
    name: str(row.name) ?? code,
    widthMm: num(row.widthMm ?? row.width_mm),
    lengthMm: num(row.lengthMm ?? row.length_mm),
    priceVnd:
      row.priceVnd === null || row.price_vnd === null
        ? null
        : num(row.priceVnd ?? row.price_vnd),
    isSample: bool(row.isSample ?? row.is_sample, false),
    isActive: bool(row.isActive ?? row.is_active, true),
    quantityOnHand: num(row.quantityOnHand ?? row.quantity_on_hand),
    reorderLevel: num(row.reorderLevel ?? row.reorder_level),
  }
}

export async function listPackagingBags(activeOnly = true): Promise<PackagingBag[]> {
  const res = await apiRequest<unknown>(
    `/packaging/bags?active=${activeOnly ? 'true' : 'false'}`,
    { auth: true },
  )
  return rowsOf(res).flatMap((raw) => {
    const item = mapBag(raw)
    return item ? [item] : []
  })
}

export async function createPackagingBag(input: {
  code: string
  name: string
  widthMm: number
  lengthMm: number
  priceVnd?: number | null
  reorderLevel?: number
}): Promise<PackagingBag> {
  const res = await apiRequest<unknown>('/packaging/bags', {
    method: 'POST',
    auth: true,
    body: {
      code: input.code.trim(),
      name: input.name.trim(),
      width_mm: input.widthMm,
      length_mm: input.lengthMm,
      price_vnd: input.priceVnd ?? null,
      reorder_level: input.reorderLevel,
    },
  })
  const item = mapBag(res)
  if (!item) throw new Error('Không đọc được túi vừa tạo.')
  return item
}

export async function updatePackagingBag(
  id: string,
  input: {
    name?: string
    widthMm?: number
    lengthMm?: number
    priceVnd?: number | null
    reorderLevel?: number
    isActive?: boolean
  },
): Promise<PackagingBag> {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name.trim()
  if (input.widthMm !== undefined) body.width_mm = input.widthMm
  if (input.lengthMm !== undefined) body.length_mm = input.lengthMm
  if (input.priceVnd !== undefined) body.price_vnd = input.priceVnd
  if (input.reorderLevel !== undefined) body.reorder_level = input.reorderLevel
  if (input.isActive !== undefined) body.is_active = input.isActive
  const res = await apiRequest<unknown>(`/packaging/bags/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    auth: true,
    body,
  })
  const item = mapBag(res)
  if (!item) throw new Error('Không đọc được túi vừa sửa.')
  return item
}

export async function stockInPackagingBag(
  id: string,
  quantity: number,
  note?: string,
): Promise<PackagingBag> {
  const res = await apiRequest<unknown>(
    `/packaging/bags/${encodeURIComponent(id)}/stock-in`,
    {
      method: 'POST',
      auth: true,
      body: { quantity, note: note?.trim() || undefined },
    },
  )
  const item = mapBag(res)
  if (!item) throw new Error('Không đọc được tồn túi.')
  return item
}

function mapCushion(raw: unknown): CushionMaterial | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = str(row.id) ?? ''
  const code = str(row.code) ?? ''
  if (!id || !code) return null
  return {
    id,
    code,
    name: str(row.name) ?? code,
    type: str(row.type) ?? '',
    unit: str(row.unit) ?? 'cái',
    weightGPerUnit: num(row.weightGPerUnit ?? row.weight_g_per_unit),
    priceVndPerUnit: num(row.priceVndPerUnit ?? row.price_vnd_per_unit),
    quantityOnHand: num(row.quantityOnHand ?? row.quantity_on_hand),
    quantityNew: num(row.quantityNew ?? row.quantity_new),
    quantityReused: num(row.quantityReused ?? row.quantity_reused),
    reorderLevel: num(row.reorderLevel ?? row.reorder_level),
    storageLocation: str(row.storageLocation ?? row.storage_location),
    isSample: bool(row.isSample ?? row.is_sample, false),
    isActive: bool(row.isActive ?? row.is_active, true),
    reusable: bool(row.reusable, false),
    stockStatus: stockStatus(row.stockStatus ?? row.stock_status),
  }
}

export async function listCushionMaterials(
  activeOnly = true,
): Promise<CushionMaterial[]> {
  const res = await apiRequest<unknown>(
    `/packaging/materials?active=${activeOnly ? 'true' : 'false'}`,
    { auth: true },
  )
  return rowsOf(res).flatMap((raw) => {
    const item = mapCushion(raw)
    return item ? [item] : []
  })
}

export async function createCushionMaterial(input: {
  code: string
  name: string
  type: CushionMaterialType
  unit: string
  weightGPerUnit: number
  priceVndPerUnit: number
  reorderLevel?: number
  storageLocation?: string | null
  reusable?: boolean
}): Promise<CushionMaterial> {
  const res = await apiRequest<unknown>('/packaging/materials', {
    method: 'POST',
    auth: true,
    body: {
      code: input.code.trim(),
      name: input.name.trim(),
      type: input.type,
      unit: input.unit.trim(),
      weight_g_per_unit: input.weightGPerUnit,
      price_vnd_per_unit: input.priceVndPerUnit,
      reorder_level: input.reorderLevel,
      storage_location: input.storageLocation?.trim() || null,
      reusable: input.reusable ?? false,
    },
  })
  const item = mapCushion(res)
  if (!item) throw new Error('Không đọc được vật tư vừa tạo.')
  return item
}

export async function updateCushionMaterial(
  id: string,
  input: {
    name?: string
    unit?: string
    weightGPerUnit?: number
    priceVndPerUnit?: number
    reorderLevel?: number
    storageLocation?: string | null
    isActive?: boolean
    reusable?: boolean
  },
): Promise<CushionMaterial> {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name.trim()
  if (input.unit !== undefined) body.unit = input.unit.trim()
  if (input.weightGPerUnit !== undefined) body.weight_g_per_unit = input.weightGPerUnit
  if (input.priceVndPerUnit !== undefined) body.price_vnd_per_unit = input.priceVndPerUnit
  if (input.reorderLevel !== undefined) body.reorder_level = input.reorderLevel
  if (input.storageLocation !== undefined) body.storage_location = input.storageLocation
  if (input.isActive !== undefined) body.is_active = input.isActive
  if (input.reusable !== undefined) body.reusable = input.reusable
  const res = await apiRequest<unknown>(
    `/packaging/materials/${encodeURIComponent(id)}`,
    { method: 'PATCH', auth: true, body },
  )
  const item = mapCushion(res)
  if (!item) throw new Error('Không đọc được vật tư vừa sửa.')
  return item
}

export async function stockInCushionMaterial(
  id: string,
  quantity: number,
  note?: string,
): Promise<CushionMaterial> {
  const res = await apiRequest<unknown>(
    `/packaging/materials/${encodeURIComponent(id)}/stock-in`,
    {
      method: 'POST',
      auth: true,
      body: { quantity, note: note?.trim() || undefined },
    },
  )
  const item = mapCushion(res)
  if (!item) throw new Error('Không đọc được tồn vật tư.')
  return item
}

export async function listCushionMovements(id: string): Promise<CatalogMovement[]> {
  const res = await apiRequest<unknown>(
    `/packaging/materials/${encodeURIComponent(id)}/movements`,
    { auth: true },
  )
  return rowsOf(res).flatMap((raw) => {
    const item = mapMovement(raw)
    return item ? [item] : []
  })
}

function mapRules(raw: unknown): MaterialRules {
  const row = asRecord(raw) ?? {}
  const rulesRaw = Array.isArray(row.rules) ? row.rules : []
  return {
    version: typeof row.version === 'number' ? row.version : null,
    isDefault: bool(row.isDefault ?? row.is_default, true),
    rules: rulesRaw.flatMap((item) => {
      const rule = asRecord(item)
      if (!rule) return []
      const bands = Array.isArray(rule.voidBands ?? rule.void_bands)
        ? (rule.voidBands ?? rule.void_bands)
        : []
      return [
        {
          materialType: str(rule.materialType ?? rule.material_type) ?? '',
          appliesTo: str(rule.appliesTo ?? rule.applies_to) ?? 'any',
          minUnits: num(rule.minUnits ?? rule.min_units, 1),
          basis: str(rule.basis) ?? 'per_unit',
          quantity: num(rule.quantity),
          voidBands: (bands as unknown[]).flatMap((band) => {
            const b = asRecord(band)
            if (!b) return []
            return [
              {
                minVoidRatio: num(b.minVoidRatio ?? b.min_void_ratio),
                quantity: num(b.quantity),
              },
            ]
          }),
        },
      ]
    }),
  }
}

export async function getMaterialRules(): Promise<MaterialRules> {
  const res = await apiRequest<unknown>('/packaging/materials/rules', { auth: true })
  return mapRules(res)
}

export async function saveMaterialRules(rules: MaterialRule[]): Promise<MaterialRules> {
  const res = await apiRequest<unknown>('/packaging/materials/rules', {
    method: 'PUT',
    auth: true,
    body: {
      rules: rules.map((rule) => ({
        material_type: rule.materialType,
        applies_to: rule.appliesTo,
        min_units: rule.minUnits,
        basis: rule.basis,
        quantity: rule.quantity,
        void_bands:
          rule.basis === 'void_band'
            ? rule.voidBands.map((band) => ({
                min_void_ratio: band.minVoidRatio,
                quantity: band.quantity,
              }))
            : undefined,
      })),
    },
  })
  return mapRules(res)
}
