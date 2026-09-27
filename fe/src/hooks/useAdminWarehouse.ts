import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  assignSkuToBin,
  createWarehouse,
  createWarehouseZone,
  generateBinLocations,
  listAllWarehouseBins,
  listSkuBinAssignments,
  listUnassignedSkus,
  listWarehouseZones,
  listWarehouses,
  restockSkuAssignment,
} from '../api/warehouse.api'
import { formatApiError, getApiErrorCode } from '../lib/api'
import type {
  AssignSkuInput,
  BinLocationRecord,
  CreateWarehouseInput,
  CreateZoneInput,
  GenerateBinsInput,
  SkuBinAssignmentRecord,
  UnassignedSku,
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

export function useAdminWarehouse() {
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(
    null,
  )
  const [zones, setZones] = useState<WarehouseZoneRecord[]>([])
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [allBins, setAllBins] = useState<BinLocationRecord[]>([])
  const [assignments, setAssignments] = useState<SkuBinAssignmentRecord[]>([])
  const [unassigned, setUnassigned] = useState<UnassignedSku[]>([])

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

  const reloadBins = useCallback(
    async (
      warehouseId: string,
      zoneIds: string[],
    ): Promise<BinLocationRecord[]> => {
      return listAllWarehouseBins(warehouseId, zoneIds)
    },
    [],
  )

  useEffect(() => {
    const gen = ++warehouseLoadGen.current
    let cancelled = false
    void (async () => {
      try {
        const rows = await listWarehouses()
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
        const skuRows = await listUnassignedSkus()
        if (cancelled || gen !== warehouseLoadGen.current) return
        setUnassigned(skuRows)
      } catch (err: unknown) {
        if (cancelled || gen !== warehouseLoadGen.current) return
        setError(formatApiError(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedWarehouseId) return
    const warehouseId = selectedWarehouseId
    let cancelled = false
    void (async () => {
      let zoneRows: WarehouseZoneRecord[] = []
      try {
        zoneRows = await listWarehouseZones(warehouseId)
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
  }, [selectedWarehouseId, reloadBins])

  async function reload(): Promise<void> {
    const gen = ++warehouseLoadGen.current
    setLoading(true)
    setError(null)
    try {
      const rows = await listWarehouses()
      if (gen !== warehouseLoadGen.current) return
      setWarehouses(rows)
      setSelectedWarehouseId((current) => {
        if (current && rows.some((row) => row.id === current)) return current
        return rows[0]?.id ?? null
      })
      try {
        setUnassigned(await listUnassignedSkus())
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
      setUnassigned(await listUnassignedSkus())
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
        const listed = await listWarehouseZones(selectedWarehouseId)
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
          setAllBins(await reloadBins(selectedWarehouseId, zoneIds))
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
      try {
        setUnassigned(await listUnassignedSkus())
      } catch (err: unknown) {
        setError(formatApiError(err))
      }
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
  ): Promise<void> {
    if (!selectedWarehouseId) return
    setMutating(true)
    setError(null)
    try {
      const updated = await restockSkuAssignment(
        selectedWarehouseId,
        assignmentId,
        quantity,
      )
      setAssignments((prev) =>
        prev.map((row) =>
          row.id === updated.id
            ? { ...row, quantityOnHand: updated.quantityOnHand }
            : row,
        ),
      )
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
    loading,
    mutating,
    error,
    setError,
    reload,
    reloadUnassigned,
    createWarehouse: handleCreateWarehouse,
    createZone: handleCreateZone,
    generateBins: handleGenerateBins,
    assignSku: handleAssignSku,
    restock: handleRestock,
  }
}
