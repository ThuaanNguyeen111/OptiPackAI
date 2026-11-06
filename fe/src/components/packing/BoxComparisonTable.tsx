import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { BoxComparison, BoxComparisonRow } from '../../types/packing-plan'
import { formatCurrency } from '../../utils/format'

const CRITERIA_LABELS: Record<
  keyof NonNullable<BoxComparisonRow['criteria']>,
  { vi: string; en: string }
> = {
  billable: { vi: 'Cân tính cước', en: 'Billable weight' },
  packaging: { vi: 'Giá thùng + vật tư', en: 'Packaging cost' },
  fill: { vi: 'Lấp đầy', en: 'Fill' },
  handling: { vi: 'Ít phải gập', en: 'Fewer folds' },
}

function criteriaTooltip(
  comparison: BoxComparison,
  row: BoxComparisonRow,
  vi: boolean,
): string | undefined {
  if (!row.criteria) return undefined
  return (Object.keys(CRITERIA_LABELS) as (keyof typeof CRITERIA_LABELS)[])
    .map((key) => {
      const label = vi ? CRITERIA_LABELS[key].vi : CRITERIA_LABELS[key].en
      const weight = Math.round(comparison.weights[key] * 100)
      return `${label}: ${String(row.criteria?.[key])}/10 (${String(weight)}%)`
    })
    .join('\n')
}

function Metric({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <span className="whitespace-nowrap">
      <span className="text-ink-subtle">{label} </span>
      <span className="font-mono text-ink">{value}</span>
    </span>
  )
}

/**
 * "Vì sao chọn thùng này mà không phải thùng khác" của một kiện.
 * Giữ đúng thứ tự BE trả: BE đã xếp hạng theo luật bậc của bộ giải, điểm tổng chỉ để so nhanh.
 * Mỗi thùng là một thẻ 3 tầng (tên + điểm, số liệu, kết luận) nên đọc được trong cột hẹp.
 */
export function BoxComparisonTable({
  comparison,
  vi,
}: {
  comparison: BoxComparison | null | undefined
  vi: boolean
}): ReactNode {
  if (!comparison || comparison.rows.length === 0) return null
  return (
    <div className="mt-3 space-y-2">
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink">
        {comparison.summary}
      </p>
      {!comparison.scoresConsistent ? (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {vi
            ? 'Có thùng điểm cao hơn nhưng xếp sau. Thứ hạng mới là quyết định thật (số kiện → cân tính cước → giá → cân quy đổi → số món gập), điểm chỉ để so nhanh.'
            : 'A higher-scoring box ranks lower. The rank is the real decision; the score is only a quick comparison.'}
        </p>
      ) : null}
      <ul className="space-y-1.5">
        {comparison.rows.map((row) => (
          <li
            key={row.boxCode}
            className={`rounded-lg border px-3 py-2 text-xs ${
              row.isChosen ? 'border-primary bg-primary/10' : 'border-hairline'
            } ${row.eligible ? '' : 'opacity-60'}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 font-mono text-[11px] font-semibold ${
                  row.rank === 1 ? 'bg-primary text-white' : 'bg-surface-2 text-ink'
                }`}
              >
                {row.rank ?? '—'}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink" title={row.boxName}>
                {row.boxName}
                <span className="ml-1.5 font-mono text-[11px] font-normal text-ink-muted">
                  {row.boxCode}
                </span>
              </span>
              {row.isChosen ? (
                <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {vi ? 'Đang dùng' : 'In use'}
                </span>
              ) : null}
              <span
                className="flex shrink-0 items-center gap-1.5"
                title={criteriaTooltip(comparison, row, vi)}
              >
                <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${String(Math.max(0, Math.min(10, row.score)) * 10)}%` }}
                  />
                </span>
                <span className="w-7 text-right font-mono text-ink">{row.score.toFixed(1)}</span>
              </span>
            </div>
            {row.eligible ? (
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                <Metric
                  label={vi ? 'Cân cước' : 'Billable'}
                  value={
                    row.billableWeightG != null
                      ? `${row.billableWeightG.toLocaleString('vi-VN')} g`
                      : '—'
                  }
                />
                <Metric
                  label={vi ? 'Thùng + vật tư' : 'Pack cost'}
                  value={row.packagingCostVnd != null ? formatCurrency(row.packagingCostVnd) : '—'}
                />
                <Metric
                  label={vi ? 'Lấp đầy' : 'Fill'}
                  value={row.fillRatio != null ? `${String(Math.round(row.fillRatio * 100))}%` : '—'}
                />
                <Metric label={vi ? 'Tồn' : 'Stock'} value={row.available != null ? String(row.available) : '—'} />
              </p>
            ) : null}
            <p className="mt-1 leading-snug text-ink-muted">{row.verdict}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
