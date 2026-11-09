import type { ReactNode } from 'react'
import { AlertTriangle, ChevronDown } from 'lucide-react'
import type { BoxComparison, BoxComparisonRow } from '../../types/packing-plan'
import { formatCurrency } from '../../utils/format'
import { formatGAsKg } from '../../utils/units'

type CriterionKey = keyof NonNullable<BoxComparisonRow['criteria']>

/** Thứ tự + cách BE chấm từng tiêu chí (solver/box-comparison.ts). */
const CRITERIA: { key: CriterionKey; vi: string; en: string; ruleVi: string; ruleEn: string }[] = [
  { key: 'billable', vi: 'Cân tính cước', en: 'Billable weight', ruleVi: '10 × nhẹ nhất ÷ thùng này', ruleEn: '10 × lightest ÷ this box' },
  { key: 'packaging', vi: 'Giá thùng + vật tư', en: 'Packaging cost', ruleVi: '10 × rẻ nhất ÷ thùng này', ruleEn: '10 × cheapest ÷ this box' },
  { key: 'fill', vi: 'Lấp đầy', en: 'Fill', ruleVi: '10 × thùng này ÷ đầy nhất', ruleEn: '10 × this box ÷ fullest' },
  { key: 'handling', vi: 'Ít phải gập', en: 'Fewer folds', ruleVi: '10 × (1 − món gập ÷ tổng món)', ruleEn: '10 × (1 − folded ÷ items)' },
]

const RANK_ORDER = {
  fewest_parcels: {
    vi: ['Số kiện', 'Cân tính cước', 'Giá thùng + vật tư', 'Cân quy đổi', 'Số món gập'],
    en: ['Parcels', 'Billable weight', 'Packaging cost', 'Volumetric weight', 'Folds'],
  },
  cheapest: {
    vi: ['Cân tính cước', 'Giá thùng + vật tư', 'Số kiện', 'Cân quy đổi', 'Số món gập'],
    en: ['Billable weight', 'Packaging cost', 'Parcels', 'Volumetric weight', 'Folds'],
  },
} as const

const fmtScore = (n: number): string => n.toFixed(1)
/** Số kiểu Việt (dấu phẩy thập phân) cho phép tính hiển thị. */
const num = (n: number, vi: boolean): string =>
  n.toLocaleString(vi ? 'vi-VN' : 'en-US', { maximumFractionDigits: 1 })
const kg = (g: number, vi: boolean): string => num(g / 1000, vi)
const pct = (r: number): number => Math.round(r * 100)

/** Số thật + phép tính ra điểm của 1 tiêu chí cho 1 thùng (kết quả lấy đúng điểm BE trả). */
function derivation(
  key: CriterionKey,
  row: BoxComparisonRow,
  ranked: BoxComparisonRow[],
  itemCount: number | null,
  vi: boolean,
): { value: string; formula: string } {
  const score = row.criteria ? fmtScore(row.criteria[key]).replace('.', vi ? ',' : '.') : '—'
  const best = (pick: (r: BoxComparisonRow) => number | null, mode: 'min' | 'max'): number | null => {
    const values = ranked.map(pick).filter((v): v is number => v != null)
    if (values.length === 0) return null
    return mode === 'min' ? Math.min(...values) : Math.max(...values)
  }
  const top = (label: string): string => `${label} → 10`
  if (key === 'billable') {
    const v = row.billableWeightG
    const b = best((r) => r.billableWeightG, 'min')
    if (v == null || b == null) return { value: '—', formula: '' }
    return {
      value: formatGAsKg(v),
      formula: v === b ? top(vi ? 'nhẹ nhất' : 'lightest') : `10 × ${kg(b, vi)} ÷ ${kg(v, vi)} = ${score}`,
    }
  }
  if (key === 'packaging') {
    const v = row.packagingCostVnd
    const b = best((r) => r.packagingCostVnd, 'min')
    if (v == null || b == null) return { value: '—', formula: '' }
    return {
      value: formatCurrency(v),
      formula:
        v === b ? top(vi ? 'rẻ nhất' : 'cheapest') : `10 × ${num(b / 1000, vi)}k ÷ ${num(v / 1000, vi)}k = ${score}`,
    }
  }
  if (key === 'fill') {
    const v = row.fillRatio
    const b = best((r) => r.fillRatio, 'max')
    if (v == null || b == null) return { value: '—', formula: '' }
    return {
      value: `${String(pct(v))}%`,
      formula: pct(v) === pct(b) ? top(vi ? 'đầy nhất' : 'fullest') : `10 × ${String(pct(v))} ÷ ${String(pct(b))} = ${score}`,
    }
  }
  const folds = row.folds ?? 0
  if (folds === 0) return { value: vi ? 'không gập' : 'no folds', formula: top(vi ? 'không gập' : 'no folds') }
  return {
    value: itemCount ? `${vi ? 'gập' : 'fold'} ${String(folds)}/${String(itemCount)}` : `${vi ? 'gập' : 'fold'} ${String(folds)}`,
    formula: itemCount ? `10 × (1 − ${String(folds)}/${String(itemCount)}) = ${score}` : `= ${score}`,
  }
}

/** Câu giải thích khi chỉ 1 thùng dùng được: 3 tiêu chí so sánh tự được 10. */
function singleNote(row: BoxComparisonRow, itemCount: number | null, vi: boolean): string {
  const folds = row.folds ?? 0
  if (vi) {
    const base = 'Chỉ 1 thùng dùng được nên cước, chi phí và lấp đầy đều được 10 (không có thùng nào để so).'
    return folds === 0
      ? `${base} Không phải gập món nào nên điểm tối đa.`
      : `${base} Điểm chỉ bị trừ vì phải gập ${String(folds)}${itemCount ? `/${String(itemCount)}` : ''} món.`
  }
  const base = 'Only 1 box fits, so billable, cost and fill all score 10 (nothing to compare against).'
  return folds === 0
    ? `${base} No folds, so the score is maxed.`
    : `${base} Points are lost only for folding ${String(folds)}${itemCount ? `/${String(itemCount)}` : ''} items.`
}

function Metric({ label, value, alert = false }: { label: string; value: string; alert?: boolean }): ReactNode {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-subtle">{label}</dt>
      <dd className={`font-mono text-[13px] tabular-nums ${alert ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  )
}

/** Luật xếp hạng + bảng điểm từng tiêu chí của các thùng dùng được. Đóng sẵn để thẻ thùng lên trước. */
function ScoringRules({
  comparison,
  vi,
  itemCount,
}: {
  comparison: BoxComparison
  vi: boolean
  itemCount: number | null
}): ReactNode {
  const ranked = comparison.rows.filter((r) => r.eligible && r.criteria)
  const order = RANK_ORDER[comparison.prefer][vi ? 'vi' : 'en']
  return (
    <details className="group rounded-lg border border-hairline text-xs">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 font-medium text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        {vi ? 'Cách chấm điểm' : 'How scores work'}
        <ChevronDown className="h-3.5 w-3.5 text-ink-subtle transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 border-t border-hairline px-3 py-2.5 leading-snug">
        <section>
          <h4 className="font-medium text-ink">{vi ? 'Thứ hạng — quyết định chọn thùng' : 'Rank — what picks the box'}</h4>
          <p className="mt-0.5 text-ink-muted">
            {vi ? 'So lần lượt, hơn ở tiêu chí trước thì thắng:' : 'Compared in order; the first difference wins:'}
          </p>
          <ol className="mt-1 flex flex-wrap items-center gap-1 text-ink">
            {order.map((label, i) => (
              <li key={label} className="flex items-center gap-1">
                {i > 0 ? <span className="text-ink-subtle" aria-hidden>›</span> : null}
                <span className="rounded bg-surface-2 px-1.5 py-0.5">{label}</span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h4 className="font-medium text-ink">{vi ? 'Điểm /10 — để so nhanh' : 'Score /10 — quick comparison'}</h4>
          <p className="mt-0.5 text-ink-muted">
            {vi
              ? 'Mỗi tiêu chí: thùng tốt nhất được 10, thùng khác tính theo tỉ lệ (phép tính ở từng ô). Điểm tổng = cộng các tiêu chí nhân trọng số. Thùng không dùng được không chấm.'
              : 'Each criterion: the best box gets 10, others scale (formula in each cell). Total = weighted sum. Unusable boxes are not scored.'}
          </p>
          {ranked.length === 1 && ranked[0] ? (
            <p className="mt-1.5 rounded-md bg-surface-2 px-2 py-1.5 leading-snug text-ink">
              {singleNote(ranked[0], itemCount, vi)}
            </p>
          ) : null}
          {/* Màn hẹp: mỗi thùng một khối, tiêu chí xếp dọc — khỏi cuộn ngang. */}
          <div className="mt-2 space-y-2 sm:hidden">
            {ranked.map((r) => (
              <div key={r.boxCode} className="rounded-md border border-hairline p-2">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="font-mono font-semibold text-ink">{r.boxCode}</span>
                  <span className="font-mono tabular-nums text-ink">
                    <span className="font-semibold">{fmtScore(r.score)}</span>
                    <span className="text-ink-subtle">/10</span>
                  </span>
                </p>
                {r.criteria ? (
                  <p className="font-mono text-[11px] text-ink-subtle">
                    = {CRITERIA.map((c) => num(comparison.weights[c.key] * (r.criteria?.[c.key] ?? 0), vi)).join(' + ')}
                  </p>
                ) : null}
                <dl className="mt-1.5 space-y-1">
                  {CRITERIA.map((c) => {
                    const d = derivation(c.key, r, ranked, itemCount, vi)
                    return (
                      <div key={c.key} className="flex items-start justify-between gap-2 border-t border-hairline pt-1">
                        <dt className="min-w-0 text-ink">
                          {vi ? c.vi : c.en}{' '}
                          <span className="text-ink-subtle">{Math.round(comparison.weights[c.key] * 100)}%</span>
                          <span className="block text-[11px] text-ink-muted">{d.value}</span>
                        </dt>
                        <dd className="shrink-0 text-right">
                          <span className="block font-mono font-semibold text-ink">
                            {r.criteria ? fmtScore(r.criteria[c.key]) : '—'}
                          </span>
                          {d.formula ? (
                            <span className="block font-mono text-[11px] text-ink-subtle">{d.formula}</span>
                          ) : null}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              </div>
            ))}
          </div>
          <div className="mt-1.5 hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[22rem] border-collapse">
            <thead>
              <tr className="text-left text-ink-subtle">
                <th scope="col" className="py-1 pr-2 font-normal">{vi ? 'Tiêu chí' : 'Criterion'}</th>
                <th scope="col" className="py-1 pr-2 text-right font-normal whitespace-nowrap">{vi ? 'Trọng số' : 'Weight'}</th>
                {ranked.map((r) => (
                  <th key={r.boxCode} scope="col" className="py-1 pl-5 text-right font-mono font-normal" title={r.boxName}>
                    {r.boxCode}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {CRITERIA.map((c) => (
                <tr key={c.key} className="border-t border-hairline">
                  <th scope="row" className="min-w-[7.5rem] py-1.5 pr-2 text-left align-top font-normal text-ink">
                    {vi ? c.vi : c.en}
                    <span className="block text-[11px] text-ink-subtle">{vi ? c.ruleVi : c.ruleEn}</span>
                  </th>
                  <td className="py-1 pr-2 text-right font-mono text-ink-muted">
                    {Math.round(comparison.weights[c.key] * 100)}%
                  </td>
                  {ranked.map((r) => {
                    const d = derivation(c.key, r, ranked, itemCount, vi)
                    return (
                      <td key={r.boxCode} className="py-1.5 pl-5 text-right align-top">
                        <span className="block font-mono font-semibold text-ink">
                          {r.criteria ? fmtScore(r.criteria[c.key]) : '—'}
                        </span>
                        <span className="block text-[11px] whitespace-nowrap text-ink-muted">{d.value}</span>
                        {d.formula ? (
                          <span className="block font-mono text-[11px] whitespace-nowrap text-ink-subtle">{d.formula}</span>
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="border-t border-hairline font-semibold">
                <th scope="row" className="py-1 pr-2 text-left text-ink">{vi ? 'Tổng' : 'Total'}</th>
                <td className="py-1 pr-2 text-right font-mono text-ink-muted">100%</td>
                {ranked.map((r) => (
                  <td key={r.boxCode} className="py-1.5 pl-5 text-right align-top">
                    <span className="block font-mono text-ink">{fmtScore(r.score)}</span>
                    {r.criteria ? (
                      <span className="block font-mono text-[11px] font-normal whitespace-nowrap text-ink-subtle">
                        {CRITERIA.map((c) => num(comparison.weights[c.key] * (r.criteria?.[c.key] ?? 0), vi)).join(' + ')}
                      </span>
                    ) : null}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          </div>
        </section>
      </div>
    </details>
  )
}

/**
 * "Vì sao chọn thùng này mà không phải thùng khác" của một kiện.
 * Giữ đúng thứ tự BE trả: BE đã xếp hạng theo luật bậc của bộ giải, điểm tổng chỉ để so nhanh.
 */
export function BoxComparisonTable({
  comparison,
  vi,
  itemCount = null,
}: {
  comparison: BoxComparison | null | undefined
  vi: boolean
  /** Số món trong kiện — để ghi phép tính "gập 3/8 món". */
  itemCount?: number | null
}): ReactNode {
  if (!comparison || comparison.rows.length === 0) return null
  const usable = comparison.rows.filter((r) => r.eligible)
  const unusable = comparison.rows.filter((r) => !r.eligible)
  return (
    <div className="mt-3 space-y-2.5">
      <p className="text-xs leading-snug text-ink-muted">
        {vi
          ? `Xếp theo luật ưu tiên của bộ giải · ${String(usable.length)} thùng dùng được, ${String(unusable.length)} không vừa`
          : `Ranked by the solver's priority rules · ${String(usable.length)} usable, ${String(unusable.length)} unusable`}
      </p>
      {!comparison.scoresConsistent ? (
        <p className="flex items-start gap-1.5 text-xs leading-snug text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {vi
            ? 'Có thùng điểm cao hơn nhưng xếp sau: thứ hạng mới là quyết định, điểm chỉ để so nhanh.'
            : 'A higher-scoring box ranks lower: the rank decides, the score is only a quick comparison.'}
        </p>
      ) : null}

      {usable.length > 0 ? (
        <ol className="space-y-2">
          {usable.map((row) => (
            <li
              key={row.boxCode}
              className={`rounded-lg border px-3 py-2.5 text-xs ${
                row.isChosen ? 'border-primary bg-primary/[0.06]' : 'border-hairline'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-px inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold tabular-nums ${
                    row.rank === 1 ? 'bg-primary text-white' : 'bg-surface-2 text-ink'
                  }`}
                  aria-label={vi ? `Hạng ${String(row.rank)}` : `Rank ${String(row.rank)}`}
                >
                  {row.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="text-[13px] font-semibold text-ink">{row.boxName}</span>
                    {(row.parcels ?? 1) > 1 ? (
                      <span className="rounded border border-hairline-strong px-1.5 py-px font-mono text-[11px] font-semibold tabular-nums text-ink">
                        × {row.parcels} {vi ? 'thùng' : 'boxes'}
                      </span>
                    ) : null}
                    {row.isChosen ? (
                      <span className="rounded bg-primary px-1.5 py-px text-[11px] font-semibold text-white">
                        {vi ? 'Đang dùng' : 'In use'}
                      </span>
                    ) : null}
                  </p>
                  <p className="font-mono text-[11px] text-ink-muted">{row.boxCode}</p>
                </div>
                <div className="shrink-0 text-right" title={vi ? 'Điểm tổng /10 — chỉ để so nhanh' : 'Score /10 — quick comparison only'}>
                  <p className="font-mono text-[15px] leading-none font-semibold tabular-nums text-ink">
                    {fmtScore(row.score)}
                    <span className="text-[11px] font-normal text-ink-subtle">/10</span>
                  </p>
                  <span className="mt-1.5 block h-1 w-14 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${String(Math.max(0, Math.min(10, row.score)) * 10)}%` }}
                    />
                  </span>
                </div>
              </div>
              <dl className="mt-2.5 grid grid-cols-4 gap-2 border-t border-hairline pt-2">
                <Metric
                  label={(row.parcels ?? 1) > 1 ? (vi ? 'Tổng cước' : 'Total billable') : vi ? 'Cước' : 'Billable'}
                  value={row.billableWeightG != null ? formatGAsKg(row.billableWeightG) : '—'}
                />
                <Metric
                  label={(row.parcels ?? 1) > 1 ? (vi ? 'Tổng chi phí' : 'Total cost') : vi ? 'Chi phí' : 'Cost'}
                  value={row.packagingCostVnd != null ? formatCurrency(row.packagingCostVnd) : '—'}
                />
                <Metric
                  label={vi ? 'Lấp đầy' : 'Fill'}
                  value={row.fillRatio != null ? `${String(Math.round(row.fillRatio * 100))}%` : '—'}
                />
                <Metric
                  label={vi ? 'Tồn' : 'Stock'}
                  value={row.available != null ? String(row.available) : '—'}
                  alert={row.available === 0}
                />
              </dl>
              {/* Thẻ đang dùng đã có nhãn "Đang dùng" — không lặp lại "Thùng đang chọn." */}
              {row.isChosen ? null : <p className="mt-1.5 leading-snug text-ink-muted">{row.verdict}</p>}
            </li>
          ))}
        </ol>
      ) : null}

      {unusable.length > 0 ? (
        <section className="rounded-lg border border-dashed border-hairline-strong px-3 py-2 text-xs">
          <h4 className="font-medium text-ink-muted">
            {vi ? `Không dùng được (${String(unusable.length)})` : `Unusable (${String(unusable.length)})`}
          </h4>
          <ul className="mt-1 divide-y divide-hairline">
            {unusable.map((row) => (
              <li key={row.boxCode} className="py-1.5">
                <p className="text-ink">
                  {row.boxName}
                  <span className="ml-1.5 font-mono text-[11px] text-ink-subtle">{row.boxCode}</span>
                </p>
                <p className="leading-snug text-ink-muted">{row.verdict}</p>
                {row.parcels != null && row.billableWeightG != null ? (
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-ink-subtle">
                    {vi ? 'Nếu dùng' : 'If used'}: {row.parcels} {vi ? 'thùng' : 'box(es)'} · {vi ? 'cước' : 'billable'}{' '}
                    {formatGAsKg(row.billableWeightG)}
                    {row.packagingCostVnd != null ? ` · ${formatCurrency(row.packagingCostVnd)}` : ''}
                    {row.fillRatio != null ? ` · ${vi ? 'lấp đầy' : 'fill'} ${String(Math.round(row.fillRatio * 100))}%` : ''}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ScoringRules comparison={comparison} vi={vi} itemCount={itemCount} />
    </div>
  )
}
