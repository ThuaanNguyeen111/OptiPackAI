import { useCallback, useEffect, useState } from 'react'
import { listFailedWritebacks, retryWriteback, type FailedWriteback } from '../../api/marketplace.api'
import { formatApiError } from '../../lib/api'

/** AOFP-330 — Admin xem các lần báo trạng thái lên website đã dừng và bấm "Gửi lại". */
export function FailedWritebackPanel({ vi }: { vi: boolean }) {
  const [rows, setRows] = useState<FailedWriteback[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      setRows(await listFailedWritebacks())
      setError(null)
    } catch (err: unknown) {
      setError(formatApiError(err))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void listFailedWritebacks()
      .then((list) => {
        if (!cancelled) setRows(list)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-ink">{vi ? 'Báo website lỗi' : 'Failed website updates'}</p>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      {rows && rows.length === 0 ? (
        <p className="text-xs text-ink-muted">{vi ? 'Không có lần báo nào bị dừng.' : 'Nothing has failed.'}</p>
      ) : null}
      <ul className="divide-y divide-hairline">
        {(rows ?? []).map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0 text-xs">
              <p className="font-medium text-ink">
                {row.status} · {vi ? 'nhóm' : 'group'} {row.orderGroupId.slice(-8)}
              </p>
              <p className="truncate text-ink-muted">{row.lastError ?? ''}</p>
            </div>
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => {
                void (async () => {
                  setBusyId(row.id)
                  try {
                    await retryWriteback(row.id)
                    await load()
                  } catch (err: unknown) {
                    setError(formatApiError(err))
                  } finally {
                    setBusyId(null)
                  }
                })()
              }}
              className="rounded-md border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
            >
              {busyId === row.id ? (vi ? 'Đang gửi…' : 'Sending…') : vi ? 'Gửi lại' : 'Retry'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
