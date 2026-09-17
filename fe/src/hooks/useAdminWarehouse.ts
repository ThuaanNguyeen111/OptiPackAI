import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  assignSkuToBin,
  createWarehouse,
  createWarehouseZone,
  generateBinLocations,
  listBinLocations,
  listSkuBinAssignments,
  listUnassignedSkus,
  listWarehouseZones,
  listWarehouses,
  restockSkuAssignment,
} from '../api/warehouse.api'
import { formatApiError } from '../lib/api'
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

  const selectedWarehouse = useMemo(
    () => warehouses.find((row) => row.id === selectedWarehouseId) ?? null,
    [warehouses, selectedWarehouseId],
  )
  const selectedZone = useMemo(
    () => zones.find((row) => row.id === selectedZoneId) ?? null,
    [zones, selectedZoneId],
  )
  const bins = useMemo(
    () =>
      selectedZoneId
        ? allBins.filter((row) => row.zoneId === selectedZoneId)
        : [],
    [allBins, selectedZoneId],
  )

  const reloadBins = useCallback(
    async (zoneRows: WarehouseZoneRecord[]): Promise<BinLocationRecord[]> => {
      if (zoneRows.length === 0) return []
      const lists = await Promise.all(
        zoneRows.map((zone) => listBinLocations(zone.id)),
      )
      return lists.flat()
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    void Promise.all([listWarehouses(), listUnassignedSkus()])
      .then(([rows, skuRows]) => {
        if (cancelled) return
        setWarehouses(rows)
        setUnassigned(skuRows)
        setSelectedWarehouseId((current) => {
          if (current && rows.some((row) => row.id === current)) return current
          return rows[0]?.id ?? null
        })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(formatApiError(err))
          setWarehouses([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedWarehouseId) return
    const warehouseId = selectedWarehouseId
    let cancelled = false
    void Promise.all([
      listWarehouseZones(warehouseId),
      listSkuBinAssignments(warehouseId),
    ])
      .then(async ([zoneRows, assignmentRows]) => {
        const binRows = await reloadBins(zoneRows)
        if (cancelled) return
        setZones(zoneRows)
        setAssignments(assignmentRows)
        setAllBins(binRows)
        setSelectedZoneId((current) => {
          if (current && zoneRows.some((row) => row.id === current)) return current
          return zoneRows[0]?.id ?? null
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(formatApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [selectedWarehouseId, reloadBins])

  async function reload(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const [rows, skuRows] = await Promise.all([
        listWarehouses(),
        listUnassignedSkus(),
      ])
      setWarehouses(rows)
      setUnassigned(skuRows)
      setSelectedWarehouseId((current) => {
        if (current && rows.some((row) => row.id === current)) return current
        return rows[0]?.id ?? null
      })
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
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
      setWarehouses((prev) => [created, ...prev])
      setSelectedWarehouseId(created.id)
      return created
    } catch (err: unknown) {
      setError(formatApiError(err))
      throw err
    } finally {
      setMutating(false)
    }
  }

  async function handleCreateZone(input: CreateZoneInput): Promise<void> {
    if (!selectedWarehouseId) return
    setMutating(true)
    setError(null)
    try {
      const created = await createWarehouseZone(selectedWarehouseId, input)
      setZones((prev) => [...prev, created])
      setSelectedZoneId(created.id)
    } catch (err: unknown) {
      setError(formatApiError(err))
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
      setAllBins(await reloadBins(zones))
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
      await assignSkuToBin(selectedWarehouseId, input)
      const [nextAssignments, nextUnassigned] = await Promise.all([
        listSkuBinAssignments(selectedWarehouseId),
        listUnassignedSkus(),
      ])
      setAssignments(nextAssignments)
      setUnassigned(nextUnassigned)
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
    assignments,
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
