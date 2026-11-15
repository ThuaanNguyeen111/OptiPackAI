import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ChevronRight, Loader2, RotateCcw } from 'lucide-react'
import { listPackagingBoxes, type PackagingBox } from '../../api/packaging-catalog.api'
import { getPackingSettings, updatePackingSettings } from '../../api/packing-plan.api'
import { formatApiError } from '../../lib/api'
import { GUIDE_STYLE_PROMPT_MAX_LENGTH, type PackingSettings } from '../../types/packing-plan'
import {
  FieldLabel,
  fieldClass,
  type SaveState,
  SaveBar,
  Segmented,
  SettingsCard,
  SettingsRow,
  textareaClass,
  Toggle,
} from './settings-ui'

/** Các trường người dùng sửa được — so với bản đã lưu để biết có thay đổi hay không. */
type Draft = Omit<PackingSettings, 'version' | 'guideStylePrompt' | 'guideStylePromptIsDefault' | 'guidePromptCoreHead' | 'guidePromptCoreTail' | 'guideStylePromptDefault'> & {
  /** null = khôi phục văn phong mặc định khi lưu. */
  guideStyle: string | null
}

function toDraft(s: PackingSettings): Draft {
  return {
    abnormalWeightThreshold: s.abnormalWeightThreshold,
    fragileCushionMm: s.fragileCushionMm,
    defaultPrefer: s.defaultPrefer,
    maxParcelsPerOrder: s.maxParcelsPerOrder,
    allowReusedBoxForFragile: s.allowReusedBoxForFragile,
    requireScan: s.requireScan,
    mailerEnabled: s.mailerEnabled,
    mailerMarginWidthMm: s.mailerMarginWidthMm,
    mailerMarginLengthMm: s.mailerMarginLengthMm,
    mailerMaxThicknessMm: s.mailerMaxThicknessMm,
    splitMinSavingVnd: s.splitMinSavingVnd,
    estFeeFirstStepVnd: s.estFeeFirstStepVnd,
    estFeePerExtraStepVnd: s.estFeePerExtraStepVnd,
    guideStyle: s.guideStylePromptIsDefault ? null : s.guideStylePrompt,
  }
}

const round1 = (n: number): number => Math.round(n * 10) / 10

export function PackingRulesCard({ vi, canEdit }: { vi: boolean; canEdit: boolean }) {
  const [saved, setSaved] = useState<PackingSettings | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [boxes, setBoxes] = useState<PackagingBox[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void getPackingSettings()
      .then((s) => {
        if (!alive) return
        setSaved(s)
        setDraft(toDraft(s))
      })
      .catch((err: unknown) => alive && setError(formatApiError(err)))
    void listPackagingBoxes(false)
      .then((rows) => alive && setBoxes(rows))
      .catch(() => alive && setBoxes([]))
    return () => {
      alive = false
    }
  }, [])

  const dirty = useMemo(
    () => saved !== null && draft !== null && JSON.stringify(toDraft(saved)) !== JSON.stringify(draft),
    [saved, draft],
  )
  const state: SaveState = saving ? 'saving' : dirty ? 'dirty' : justSaved ? 'saved' : 'idle'

  function patch(next: Partial<Draft>) {
    setJustSaved(false)
    setDraft((d) => (d ? { ...d, ...next } : d))
  }

  async function save() {
    if (!saved || !draft) return
    setSaving(true)
    setError(null)
    try {
      const styleChanged = draft.guideStyle !== toDraft(saved).guideStyle
      const next = await updatePackingSettings({
        ...(saved.version != null ? { expected_version: saved.version } : {}),
        abnormal_weight_threshold: draft.abnormalWeightThreshold,
        fragile_cushion_mm: draft.fragileCushionMm,
        default_prefer: draft.defaultPrefer,
        max_parcels_per_order: draft.maxParcelsPerOrder,
        allow_reused_box_for_fragile: draft.allowReusedBoxForFragile,
        require_scan: draft.requireScan,
        mailer_enabled: draft.mailerEnabled,
        mailer_margin_width_mm: draft.mailerMarginWidthMm,
        mailer_margin_length_mm: draft.mailerMarginLengthMm,
        mailer_max_thickness_mm: draft.mailerMaxThicknessMm,
        split_min_saving_vnd: draft.splitMinSavingVnd,
        est_fee_first_step_vnd: draft.estFeeFirstStepVnd,
        est_fee_per_extra_step_vnd: draft.estFeePerExtraStepVnd,
        // Chỉ gửi khi đổi, để lưu ô khác không biến văn phong mặc định thành "đã chỉnh".
        ...(styleChanged ? { guide_style_prompt: draft.guideStyle } : {}),
      })
      setSaved(next)
      setDraft(toDraft(next))
      setJustSaved(true)
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const lowBoxes = boxes?.filter((b) => b.stockStatus !== 'in_stock').length ?? 0

  return (
    <SettingsCard
      title={vi ? 'Quy tắc đóng gói' : 'Packing rules'}
      description={
        vi
          ? 'Áp dụng khi tính phương án đóng gói và khi nhân viên đóng kiện.'
          : 'Applied when computing packing plans and while staff pack.'
      }
      footer={
        <SaveBar
          vi={vi}
          state={state}
          error={error}
          label={vi ? 'Lưu quy tắc' : 'Save rules'}
          onSave={() => void save()}
          readOnlyNote={canEdit ? null : vi ? 'Chỉ xem — chủ shop hoặc Admin mới sửa được.' : 'View only — Owner or Admin can edit.'}
        />
      }
    >
      {!draft || !saved ? (
        <p className="flex items-center gap-2 py-8 text-sm text-ink-muted">
          {error ? (
            <span className="text-rose-600 dark:text-rose-400">{error}</span>
          ) : (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {vi ? 'Đang tải…' : 'Loading…'}
            </>
          )}
        </p>
      ) : (
        <>
          <SettingsRow
            title={vi ? 'Chọn thùng' : 'Box choice'}
            hint={
              <>
                {boxes === null
                  ? vi ? 'Đang đọc danh mục thùng…' : 'Reading box catalog…'
                  : vi
                    ? `Chọn trong ${String(boxes.length)} loại thùng${lowBoxes > 0 ? `, ${String(lowBoxes)} loại sắp hết hoặc hết` : ''}.`
                    : `Picks from ${String(boxes.length)} box types${lowBoxes > 0 ? `, ${String(lowBoxes)} low or out` : ''}.`}{' '}
                <Link
                  to="/app/packaging-materials"
                  className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-2 hover:underline"
                >
                  {vi ? 'Quản lý thùng' : 'Manage boxes'}
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                </Link>
              </>
            }
          >
            <div className="space-y-1.5">
              <p id="prefer-label" className="text-xs font-medium text-ink-muted">
                {vi ? 'Ưu tiên' : 'Optimise for'}
              </p>
              <div>
                <Segmented
                  name="prefer"
                  labelledBy="prefer-label"
                  value={draft.defaultPrefer}
                  disabled={!canEdit}
                  onChange={(v) => patch({ defaultPrefer: v })}
                  options={[
                    { value: 'fewest_parcels', label: vi ? 'Ít kiện nhất' : 'Fewest parcels' },
                    { value: 'cheapest', label: vi ? 'Rẻ nhất' : 'Cheapest' },
                  ]}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldLabel
                label={vi ? 'Số kiện tối đa mỗi đơn' : 'Max parcels per order'}
                htmlFor="max-parcels"
                hint={vi ? 'Bỏ trống = không giới hạn.' : 'Empty = no limit.'}
              >
                <input
                  id="max-parcels"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  disabled={!canEdit}
                  value={draft.maxParcelsPerOrder ?? ''}
                  onChange={(e) => patch({ maxParcelsPerOrder: e.target.value === '' ? null : Number(e.target.value) })}
                  className={fieldClass}
                />
              </FieldLabel>
              <FieldLabel
                label={vi ? 'Đệm quanh hàng dễ vỡ (cm)' : 'Fragile cushion (cm)'}
                htmlFor="cushion"
                hint={vi ? 'Mỗi phía, từ 0 đến 5 cm.' : 'Per side, 0–5 cm.'}
              >
                <input
                  id="cushion"
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  inputMode="decimal"
                  disabled={!canEdit}
                  value={round1(draft.fragileCushionMm / 10)}
                  onChange={(e) => patch({ fragileCushionMm: Math.round(Number(e.target.value) * 10) })}
                  className={fieldClass}
                />
              </FieldLabel>
            </div>
            <Toggle
              id="reuse-fragile"
              checked={draft.allowReusedBoxForFragile}
              disabled={!canEdit}
              onChange={(v) => patch({ allowReusedBoxForFragile: v })}
              label={vi ? 'Cho hàng dễ vỡ dùng thùng tái sử dụng' : 'Allow reused boxes for fragile items'}
            />
          </SettingsRow>

          <SettingsRow
            title={vi ? 'Kiểm tra khi đóng' : 'Checks while packing'}
            hint={vi ? 'Kiện lệch cân quá ngưỡng sẽ bị giữ lại chờ xem.' : 'Parcels off by more than the threshold are held for review.'}
          >
            <div className="max-w-xs">
              <FieldLabel label={vi ? 'Ngưỡng lệch cân (%)' : 'Weight deviation (%)'} htmlFor="weight">
                <input
                  id="weight"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  inputMode="numeric"
                  disabled={!canEdit}
                  value={Math.round(draft.abnormalWeightThreshold * 100)}
                  onChange={(e) => patch({ abnormalWeightThreshold: Number(e.target.value) / 100 })}
                  className={fieldClass}
                />
              </FieldLabel>
            </div>
            <Toggle
              id="require-scan"
              checked={draft.requireScan}
              disabled={!canEdit}
              onChange={(v) => patch({ requireScan: v })}
              label={vi ? 'Bắt buộc quét từng món' : 'Require scanning every item'}
              hint={vi ? 'Tắt lối đóng nhanh không quét.' : 'Disables packing without scanning.'}
            />
          </SettingsRow>

          <SettingsRow
            title={vi ? 'Túi niêm phong' : 'Mailers'}
            hint={vi ? 'Hàng mềm có thể đi túi thay vì thùng khi rẻ hơn.' : 'Soft goods may ship in a mailer when cheaper.'}
          >
            <Toggle
              id="mailer"
              checked={draft.mailerEnabled}
              disabled={!canEdit}
              onChange={(v) => patch({ mailerEnabled: v })}
              label={vi ? 'Cho phép dùng túi niêm phong' : 'Allow mailers'}
              hint={vi ? 'Cần ít nhất 1 túi niêm phong trong danh mục vật tư.' : 'Needs at least one mailer in the catalog.'}
            />
            {draft.mailerEnabled ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ['mailerMarginWidthMm', vi ? 'Lề rộng (cm)' : 'Width margin (cm)'],
                    ['mailerMarginLengthMm', vi ? 'Lề dài, gồm nắp (cm)' : 'Length margin (cm)'],
                    ['mailerMaxThicknessMm', vi ? 'Dày tối đa (cm)' : 'Max thickness (cm)'],
                  ] as const
                ).map(([key, label]) => (
                  <FieldLabel key={key} label={label} htmlFor={key}>
                    <input
                      id={key}
                      type="number"
                      min={0}
                      step={0.1}
                      inputMode="decimal"
                      disabled={!canEdit}
                      value={round1(draft[key] / 10)}
                      onChange={(e) => patch({ [key]: Math.round(Number(e.target.value) * 10) })}
                      className={fieldClass}
                    />
                  </FieldLabel>
                ))}
                {(
                  [
                    ['splitMinSavingVnd', vi ? 'Tách túi + thùng khi rẻ hơn (đ)' : 'Split if it saves (VND)'],
                    ['estFeeFirstStepVnd', vi ? 'Cước ước tính bậc đầu (đ)' : 'Est. first-step fee (VND)'],
                    ['estFeePerExtraStepVnd', vi ? 'Cước mỗi bậc thêm (đ)' : 'Est. fee per extra step (VND)'],
                  ] as const
                ).map(([key, label]) => (
                  <FieldLabel key={key} label={label} htmlFor={key}>
                    <input
                      id={key}
                      type="number"
                      min={0}
                      step={500}
                      inputMode="numeric"
                      disabled={!canEdit}
                      value={draft[key]}
                      onChange={(e) => patch({ [key]: Number(e.target.value) })}
                      className={fieldClass}
                    />
                  </FieldLabel>
                ))}
                <p className="text-xs text-ink-subtle sm:col-span-3">
                  {vi
                    ? 'Cước ở đây chỉ để so phương án lúc tính. Phí thật do hãng vận chuyển báo khi tạo vận đơn.'
                    : 'Fees here only rank options. The carrier quotes the real fee.'}
                </p>
              </div>
            ) : null}
          </SettingsRow>

          <GuideStyleRow vi={vi} canEdit={canEdit} saved={saved} value={draft.guideStyle} onChange={(v) => patch({ guideStyle: v })} />
        </>
      )}
    </SettingsCard>
  )
}

function GuideStyleRow({
  vi,
  canEdit,
  saved,
  value,
  onChange,
}: {
  vi: boolean
  canEdit: boolean
  saved: PackingSettings
  value: string | null
  onChange: (next: string | null) => void
}) {
  const text = value ?? saved.guideStylePromptDefault
  const isDefault = value === null
  return (
    <SettingsRow
      title={vi ? 'Văn phong hướng dẫn AI' : 'AI guide style'}
      hint={
        vi
          ? 'Cách AI viết từng bước đóng gói cho nhân viên. Phần luật bắt buộc và khuôn kết quả cố định, không sửa ở đây.'
          : 'How the AI words each packing step. The mandatory rules and output format are fixed.'
      }
    >
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="guide-style" className="text-xs font-medium text-ink-muted">
            {vi ? 'Văn phong' : 'Style'}{' '}
            <span className="font-normal text-ink-subtle">
              · {isDefault ? (vi ? 'mặc định' : 'default') : vi ? 'đã chỉnh' : 'customised'}
            </span>
          </label>
          {canEdit && !isDefault ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              {vi ? 'Về mặc định' : 'Reset to default'}
            </button>
          ) : null}
        </div>
        <textarea
          id="guide-style"
          rows={10}
          disabled={!canEdit}
          maxLength={GUIDE_STYLE_PROMPT_MAX_LENGTH}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          className={`${textareaClass} font-mono text-[13px]`}
        />
        <p className="text-right text-xs tabular-nums text-ink-subtle">
          {text.length.toLocaleString(vi ? 'vi-VN' : 'en-US')}/{GUIDE_STYLE_PROMPT_MAX_LENGTH.toLocaleString(vi ? 'vi-VN' : 'en-US')}
        </p>
      </div>
      <details className="group rounded-lg border border-hairline">
        <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="mr-1 inline h-3.5 w-3.5 align-[-2px] transition-transform duration-200 group-open:rotate-90" aria-hidden />
          {vi ? 'Xem toàn bộ prompt gửi cho AI' : 'View the full prompt sent to the AI'}
        </summary>
        <div className="space-y-2 border-t border-hairline px-3 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink-muted">
          <p>{saved.guidePromptCoreHead}</p>
          <p className="rounded-md bg-primary/10 px-2 py-1 text-ink">{text}</p>
          <p>{saved.guidePromptCoreTail}</p>
        </div>
      </details>
    </SettingsRow>
  )
}
