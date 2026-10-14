import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  adjustStockAssignment,
  assignSkuToBin,
  createRack,
  createWarehouse,
  createWarehouseZone,
  deactivateBin,
  deactivateWarehouse,
  deactivateWarehouseZone,
  generateBinLocations,
  listAllWarehouseBins,
  listSkuBinAssignments,
  listWarehouseZones,
  listWarehouses,
  reactivateBin,
  reactivateWarehouse,
  reactivateWarehouseZone,
  restockSkuAssignment,
  transferStockAssignment,
  unassignSkuFromBin,
  updateWarehouse,
  updateWarehouseZone,
} from '../api/warehouse.api'
import { listAllProductMaster, listSkuMappings } from '../api/catalog.api'
import { formatApiError, getApiErrorCode } from '../lib/api'
import type {
  AdjustStockInput,
  AssignSkuInput,
  BinLocationRecord,
  CreateRackInput,
  CreateWarehouseInput,
  CreateZoneInput,
  GenerateBinsInput,
  SkuBinAssignmentRecord,
  TransferStockInput,
  UnassignedSku,
  UpdateWarehouseInput,
  UpdateZoneInput,
  WarehouseRecord,
  WarehouseZoneRecord,
} from '../types/warehouse-admin'

function formatWarehouseWriteError(
  err: unknown,
  duplicateHint: string,
): string {
  const code = getApiErrorCode(err)
  if (
    code === 'WH_ZONE_CODE_IN_USE' ||
    code === 'WH_WAREHOUSE_CODE_IN_USE'
  ) {
    return formatApiError(err)
  }
  if (code === 'INTERNAL_ERROR') {
    return `${duplicateHint} ${formatApiError(err)}`
  }
  return formatApiError(err)
}

function sellerSkuKey(platform: string, shopId: string, sellerSku: string): string {
  return `${platform}|${shopId}|${sellerSku.trim().toUpperCase()}`
}

async function loadCatalogSkus(): Promise<UnassignedSku[]> {
  const rows = await listAllProductMaster()
  return rows.map((row) => ({
    platform: row.platform,
    shop_id: row.shopId,
    seller_sku: row.sellerSku,
  }))
}

export function useAdminWarehouse() {
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(
    null,
  )
  const [zones, setZones] = useState<WarehouseZoneRecord[]>([])
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [allBins, setAllBins] = useState<BinLocationRecord[]>([])
  const [assignments, setAssignments] = useState<SkuBinAssignmentRecord[]>([])
  // `GET /warehouse/sku-bin-assignments/unassigned` của BE tính chung mọi kho
  // (gán ở kho A thì SKU biến mất khỏi danh sách của kho B). FE tự tính theo
  // kho đang chọn: catalog − dòng tồn của chính kho đó.
  const [catalog, setCatalog] = useState<UnassignedSku[]>([])
  const [pooledSellerKeys, setPooledSellerKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const [showInactive, setShowInactive] = useState(false)

  const [loading, setLoading] = useState(true)
  const [mutating, setMutating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const warehouseLoadGen = useRef(0)

  const selectedWarehouse = useMemo(
    () => warehouses.find((row) => row.id === selectedWarehouseId) ?? null,
    [warehouses, selectedWarehouseId],
  )
  const selectedZone = useMemo(
    () => zones.find((row) => row.id === selectedZoneId) ?? null,
    [zones, selectedZoneId],
  )
  const bins = useMemo(() => {
    if (!selectedZoneId) return allBins
    return allBins.filter(
      (row) => row.zoneId === selectedZoneId || row.zoneId.length === 0,
    )
  }, [allBins, selectedZoneId])

  const assignmentsWithBinCode = useMemo(() => {
    const codes = new Map(allBins.map((row) => [row.id, row.binCode]))
    return assignments.map((row) => ({
      ...row,
      binCode: row.binCode || codes.get(row.binLocationId) || row.binCode,
    }))
  }, [assignments, allBins])

  // SKU sàn đã nối: 1 dòng tồn gộp theo SKU nội bộ chỉ mang seller_sku của sàn
  // tạo ra nó — tra liên kết của các SKU nội bộ có mặt trong kho này.
  useEffect(() => {
    const masters = Array.from(
      new Set(
        assignments
          .map((row) => row.masterSku)
          .filter((code): code is string => Boolean(code)),
      ),
    )
    let cancelled = false
    void Promise.all(
      masters.map((code) => listSkuMappings(code).catch(() => [])),
    ).then((lists) => {
      if (cancelled) return
      setPooledSellerKeys(
        new Set(
          lists
            .flat()
            .map((row) => sellerSkuKey(row.platform, row.shopId, row.sellerSku)),
        ),
      )
    })
    return () => {
      cancelled = true
    }
  }, [assignments])

  const unassigned = useMemo(() => {
    const assigned = new Set(
      assignments.map((row) =>
        sellerSkuKey(row.platform, row.shopId, row.sellerSku),
      ),
    )
    return catalog.filter((row) => {
      const key = sellerSkuKey(row.platform, row.shop_id, row.seller_sku)
      return !assigned.has(key) && !pooledSellerKeys.has(key)
    })
  }, [catalog, assignments, pooledSellerKeys])

  const reloadBins = useCallback(
    async (
      warehouseId: string,
      zoneIds: string[],
      includeInactive: boolean,
    ): Promise<BinLocationRecord[]> => {
      return listAllWarehouseBins(warehouseId, zoneIds, {
        includeInactive,
      })
    },
    [],
  )

  useEffect(() => {
    const gen = ++warehouseLoadGen.current
    let cancelled = false
    void (async () => {
      try {
        const rows = await listWarehouses({ includeInactive: showInactive })
        if (cancelled || gen !== warehouseLoadGen.current) return
        setWarehouses(rows)
        setSelectedWarehouseId((current) => {
          if (current && rows.some((row) => row.id === current)) return current
          return rows[0]?.id ?? null
        })
      } catch (err: unknown) {
        if (cancelled || gen !== warehouseLoadGen.current) return
        setError(formatApiError(err))
      } finally {
        if (!cancelled && gen === warehouseLoadGen.current) setLoading(false)
      }

      try {
        const skuRows = await loadCatalogSkus()
        if (cancelled || gen !== warehouseLoadGen.current) return
        setCatalog(skuRows)
      } catch (err: unknown) {
        if (cancelled || gen !== warehouseLoadGen.current) return
        setError(formatApiError(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showInactive])

  useEffect(() => {
    if (!selectedWarehouseId) return
    const warehouseId = selectedWarehouseId
    let cancelled = false
    void (async () => {
      let zoneRows: WarehouseZoneRecord[] = []
      try {
        zoneRows = await listWarehouseZones(warehouseId, {
          includeInactive: showInactive,
        })
        if (cancelled) return
        setZones(zoneRows)
        setSelectedZoneId((current) => {
          if (current && zoneRows.some((row) => row.id === current)) return current
          return zoneRows[0]?.id ?? null
        })
      } catch (err: unknown) {
        if (cancelled) return
        setError(formatApiError(err))
      }

      try {
        const binRows = await reloadBins(
          warehouseId,
          zoneRows.map((row) => row.id),
          showInactive,
        )
        if (!cancelled) setAllBins(binRows)
      } catch (err: unknown) {
        if (!cancelled) setError(formatApiError(err))
      }

      try {
        const assignmentRows = await listSkuBinAssignments(warehouseId)
        if (!cancelled) setAssignments(assignmentRows)
      } catch (err: unknown) {
        if (!cancelled) setError(formatApiError(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedWarehouseId, reloadBins, showInactive])

  async function reload(): Promise<void> {
    const gen = ++warehouseLoadGen.current
    setLoading(true)
    setError(null)
    try {
      const rows = await listWarehouses({ includeInactive: showInactive })
      if (gen !== warehouseLoadGen.current) return
      setWarehouses(rows)
      setSelectedWarehouseId((current) => {
        if (current && rows.some((row) => row.id === current)) return current
        return rows[0]?.id ?? null
      })
      try {
        setCatalog(await loadCatalogSkus())
      } catch (err: unknown) {
        setError(formatApiError(err))
      }
    } catch (err: unknown) {
      if (gen !== warehouseLoadGen.current) return
      setError(formatApiError(err))
    } finally {
      if (gen === warehouseLoadGen.current) setLoading(false)
    }
  }

  async function reloadUnassigned(): Promise<void> {
    try {
      setCatalog(await loadCatalogSkus())
    } catch (err: unknown) {
      setError(formatApiError(err))
    }
  }

  async function handleCreateWarehouse(
    input: CreateWarehouseInput,
  ): Promise<WarehouseRecord> {
    setMutating(true)
    setError(null)
    try {
      const created = await createWarehouse(input)
      warehouseLoadGen.current += 1
      setWarehouses((prev) =>
        prev.some((row) => row.id === created.id) ? prev : [created, ...prev],
      )
      setSelectedWarehouseId(created.id)
      return created
    } catch (err: unknown) {
      setError(
        formatWarehouseWriteError(
          err,
          'Mã kho có thể đã tồn tại. Bấm Tải lại để thấy kho đã lưu.',
        ),
      )
      throw err
    } finally {
      setMutating(false)
    }
  }

  async function handleCreateZone(input: CreateZoneInput): Promise<void> {
    if (!selectedWarehouseId) {
      setError('Chưa chọn kho.')
      return
    }
    setMutating(true)
    setError(null)
    try {
      const created = await createWarehouseZone(selectedWarehouseId, input)
      try {
        const listed = await listWarehouseZones(selectedWarehouseId, {
          includeInactive: showInactive,
        })
        setZones(
          listed.length > 0
            ? listed
            : (prev) =>
                prev.some((row) => row.id === created.id)
                  ? prev
                  : [...prev, created],
        )
      } catch {
        setZones((prev) =>
          prev.some((row) => row.id === created.id) ? prev : [...prev, created],
        )
      }
      setSelectedZoneId(created.id)
    } catch (err: unknown) {
      setError(
        formatWarehouseWriteError(
          err,
          'Mã khu có thể đã tồn tại trong kho này. Bấm Tải lại — khu đã lưu sẽ hiện trong danh sách.',
        ),
      )
      throw err
    } finally {
      setMutating(false)
    }
  }

  async function handleGenerateBins(
    input: GenerateBinsInput,
  ): Promise<{ created: number }> {
    if (!selectedZoneId) {
      throw new Error('Chưa chọn khu.')
    }
    setMutating(true)
    setError(null)
    try {
      const result = await generateBinLocations(selectedZoneId, input)
      if (selectedWarehouseId) {
        const zoneIds = Array.from(
          new Set(
            [...zones.map((row) => row.id), selectedZoneId].filter(
              (id): id is string => Boolean(id),
            ),
          ),
        )
        try {
          setAllBins(
            await reloadBins(selectedWarehouseId, zoneIds, showInactive),
          )
        } catch (err: unknown) {
          setError(formatApiError(err))
        }
      }
      return result
    } catch (err: unknown) {
      setError(formatApiError(err))
      throw err
    } finally {
      setMutating(false)
    }
  }

  async function handleAssignSku(input: AssignSkuInput): Promise<void> {
    if (!selectedWarehouseId) return
    setMutating(true)
    setError(null)
    try {
      const created = await assignSkuToBin(selectedWarehouseId, input)
      try {
        const listed = await listSkuBinAssignments(selectedWarehouseId)
        setAssignments(() => {
          const byId = new Map(listed.map((row) => [row.id, row]))
          byId.set(created.id, created)
          return [...byId.values()]
        })
      } catch {
        setAssignments((prev) =>
          prev.some((row) => row.id === created.id) ? prev : [...prev, created],
        )
      }
    } catch (err: unknown) {
      setError(formatApiError(err))
      throw err
    } finally {
      setMutating(false)
    }
  }

  function replaceAssignment(updated: SkuBinAssignmentRecord): void {
    setAssignments((prev) => {
      const exists = prev.some((row) => row.id === updated.id)
      if (!exists) return [...prev, updated]
      return prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row))
    })
  }

  async function refreshAssignments(): Promise<void> {
    if (!selectedWarehouseId) return
    setAssignments(await listSkuBinAssignments(selectedWarehouseId))
  }

  async function handleUpdateWarehouse(
    input: UpdateWarehouseInput,
  ): Promise<void> {
    if (!selectedWarehouseId) return
    setMutating(true)
    setError(null)
    try {
      const updated = await updateWarehouse(selectedWarehouseId, input)
      setWarehouses((prev) =>
        prev.map((row) => (row.id === updated.id ? updated : row)),
      )
    } catch (err: unknown) {
      setError(formatApiError(err))
      throw err
    } finally {
      setMutating(false)
    }
  }

  async function handleSetWarehouseActive(active: boolean): Promise<void> {
    if (!selectedWarehouseId) return
    setMutating(true)
    setError(null)
    try {
      const updated = active
        ? await reactivateWarehouse(selectedWarehouseId)
        : await deactivateWarehouse(selectedWarehouseId)
      setWarehouses((prev) =>
        prev.map((row) => (row.id === updated.id ? updated : row)),
      )
      if (!active && !showInactive) {
        setWarehouses((prev) => prev.filter((row) => row.id !== updated.id))
        setSelectedWarehouseId((current) =>
          current === updated.id ? null : current,
        )
      }
    } catch (err: unknown) {
      setError(formatApiError(err))
      throw err
    } finally {
      setMutating(false)
    }
  }

  async function handleUpdateZone(
    zoneId: string,
    input: UpdateZoneInput,
  ): Promise<void> {
    setMutating(true)
    setError(null)
    try {
      const updated = await updateWarehouseZone(zoneId, input)
      setZones((prev) => prev.map((row) => (row.id === updated.id ? updated : row)))
    } catch (err: unknown) {
      setError(formatApiError(err))
      throw err
    } finally {
      setMutating(false)
    }
  }

  async function handleSetZoneActive(zoneId: string, active: boolean): Promise<void> {
    setMutating(true)
    setError(null)
    try {
      const updated = active
        ? await reactivateWarehouseZone(zoneId)
        : await deactivateWarehouseZone(zoneId)
      setZones((prev) => {
        const exists = prev.some((row) => row.id === updated.id)
        const merged = exists
          ? prev.map((row) => (row.id === updated.id ? updated : row))
          : [updated, ...prev]
        return showInactive || updated.isActive
          ? merged
          : merged.filter((row) => row.isActive)
      })
      if (selectedWarehouseId) {
        const zoneIds = zones.map((row) => row.id)
        setAllBins(await reloadBins(selectedWarehouseId, zoneIds, showInactive))
      }
    } catch (err: unknown) {
      setError(formatApiError(err))
      throw err
    } finally {
      setMutating(false)
    }
  }

  async function handleCreateRack(input: CreateRackInput): Promise<number> {
    if (!selectedZoneId) throw new Error('Chưa chọn khu.')
    setMutating(true)
    setError(null)
    try {
      const created = await createRack(selectedZoneId, input)
      if (selectedWarehouseId) {
        const zoneIds = zones.map((row) => row.id)
        setAllBins(await reloadBins(selectedWarehouseId, zoneIds, showInactive))
      }
      return created.length
    } catch (err: unknown) {
      setError(formatApiError(err))
      throw err
    } finally {
      setMutating(false)
    }
  }

  async function handleSetBinActive(binId: string, active: boolean): Promise<void> {
    setMutating(true)
    setError(null)
    try {
      const updated = active ? await reactivateBin(binId) : await deactivateBin(binId)
      setAllBins((prev) => {
        const exists = prev.some((row) => row.id === updated.id)
        const merged = exists
          ? prev.map((row) => (row.id === updated.id ? updated : row))
          : [updated, ...prev]
        return showInactive || updated.isActive
          ? merged
          : merged.filter((row) => row.isActive)
      })
    } catch (err: unknown) {
      setError(formatApiError(err))
      throw err
    } finally {
      setMutating(false)
    }
  }

  async function handleRestock(
    assignmentId: string,
    quantity: number,
    force = false,
  ): Promise<void> {
    if (!selectedWarehouseId) return
    setMutating(true)
    setError(null)
    try {
      const updated = await restockSkuAssignment(
        selectedWarehouseId,
        assignmentId,
        quantity,
        force,
      )
      replaceAssignment(updated)
    } catch (err: unknown) {
      setError(formatApiError(err))
      throw err
    } finally {
      setMutating(false)
    }
  }

  async function handleAdjust(
    assignmentId: string,
    input: AdjustStockInput,
  ): Promise<void> {
    if (!selectedWarehouseId) return
    setMutating(true)
    setError(null)
    try {
      replaceAssignment(
        await adjustStockAssignment(selectedWarehouseId, assignmentId, input),
      )
    } catch (err: unknown) {
      setError(formatApiError(err))
      throw err
    } finally {
      setMutating(false)
    }
  }

  async function handleTransfer(
    assignmentId: string,
    input: TransferStockInput,
  ): Promise<void> {
    if (!selectedWarehouseId) return
    setMutating(true)
    setError(null)
    try {
      await transferStockAssignment(selectedWarehouseId, assignmentId, input)
      await refreshAssignments()
    } catch (err: unknown) {
      setError(formatApiError(err))
      throw err
    } finally {
      setMutating(false)
    }
  }

  async function handleUnassign(assignmentId: string): Promise<void> {
    if (!selectedWarehouseId) return
    setMutating(true)
    setError(null)
    try {
      await unassignSkuFromBin(selectedWarehouseId, assignmentId)
      setAssignments((prev) => prev.filter((row) => row.id !== assignmentId))
    } catch (err: unknown) {
      setError(formatApiError(err))
      throw err
    } finally {
      setMutating(false)
    }
  }

  return {
    warehouses,
    selectedWarehouseId,
    selectedWarehouse,
    selectWarehouse: setSelectedWarehouseId,
    zones,
    selectedZoneId,
    selectedZone,
    selectZone: setSelectedZoneId,
    bins,
    allBins,
    assignments: assignmentsWithBinCode,
    unassigned,
    showInactive,
    setShowInactive,
    loading,
    mutating,
    error,
    setError,
    reload,
    reloadUnassigned,
    createWarehouse: handleCreateWarehouse,
    updateWarehouse: handleUpdateWarehouse,
    setWarehouseActive: handleSetWarehouseActive,
    createZone: handleCreateZone,
    updateZone: handleUpdateZone,
    setZoneActive: handleSetZoneActive,
    generateBins: handleGenerateBins,
    createRack: handleCreateRack,
    setBinActive: handleSetBinActive,
    assignSku: handleAssignSku,
    restock: handleRestock,
    adjustStock: handleAdjust,
    transferStock: handleTransfer,
    unassignSku: handleUnassign,
  }
}
