import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import {
  createConsolidationRule,
  deleteConsolidationRule,
  listConsolidationRules,
  previewConsolidationRules,
  ruleToBody,
  suggestionsFromDetails,
  translateConsolidationRule,
  updateConsolidationRule,
  type ConsolidationRule,
  type ConsolidationRuleBody,
  type ConsolidationRulesState,
  type RuleMatch,
  type RulesPreview,
} from '../../api/consolidation-rules.api'
import type { SyncOption } from '../../api/order-sync-settings.api'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Input } from '../../components/ui/input'
import { ApiError, formatApiError, getApiErrorCode, getApiErrorDetailList } from '../../lib/api'

/**
 * 31/10/2026 (AOFP-223) — Quy tắc gộp đơn bổ sung. Admin gõ câu → AI dịch thành quy tắc
 * (chỉ gửi câu chữ) → chỉnh bằng ô tích → BẮT BUỘC xem trước trên đơn thật → lưu.
 * Lúc đồng bộ hệ thống áp quy tắc đã lưu, không gọi AI. Store Owner chỉ xem.
 */

const fieldClass =
  'h-9 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

type Editor = {
  /** null = quy tắc mới. */
  id: string | null
  name: string
  sourceText: string | null
  fields: Record<string, RuleMatch>
  platforms: string[]
  maxWindowHours: string
  enabled: boolean
}

function emptyEditor(): Editor {
  return { id: null, name: '', sourceText: null, fields: {}, platforms: [], maxWindowHours: '', enabled: true }
}

function editorFromBody(body: ConsolidationRuleBody, id: string | null): Editor {
  return {
    id,
    name: body.name,
    sourceText: body.source_text,
    fields: Object.fromEntries(body.fields.map((f) => [f.field, f.match])),
    platforms: [...body.platforms],
    maxWindowHours: body.max_window_hours === null ? '' : String(body.max_window_hours),
    enabled: body.enabled,
  }
}

function bodyFromEditor(editor: Editor, fieldOrder: SyncOption[]): ConsolidationRuleBody {
  const windowRaw = editor.maxWindowHours.trim()
  return {
    name: editor.name.trim(),
    source_text: editor.sourceText,
    fields: fieldOrder.filter((o) => editor.fields[o.value]).map((o) => ({ field: o.value, match: editor.fields[o.value] ?? 'normalized' })),
    platforms: [...editor.platforms],
    max_window_hours: windowRaw === '' ? null : Number(windowRaw),
    enabled: editor.enabled,
  }
}

function editorIssues(editor: Editor, requiredOneOf: string[], vi: boolean): string[] {
  const issues: string[] = []
  if (editor.name.trim() === '') issues.push(vi ? 'Đặt tên cho quy tắc.' : 'Name the rule.')
  if (editor.name.trim().length > 80) issues.push(vi ? 'Tên tối đa 80 ký tự.' : 'Name is at most 80 characters.')
  const chosen = Object.keys(editor.fields)
  if (chosen.length === 0) issues.push(vi ? 'Chọn ít nhất 1 trường.' : 'Pick at least one field.')
  if (!requiredOneOf.some((f) => chosen.includes(f))) {
    issues.push(vi ? 'Phải có Số điện thoại hoặc Địa chỉ chi tiết — chỉ dùng tên/tỉnh/phường sẽ gộp nhầm người khác.' : 'Include phone or street address.')
  }
  const w = editor.maxWindowHours.trim()
  if (w !== '' && !(Number.isInteger(Number(w)) && Number(w) >= 1 && Number(w) <= 720)) {
    issues.push(vi ? 'Giới hạn giờ: để trống hoặc 1–720.' : 'Window: blank or 1–720.')
  }
  return issues
}

function labelOf(options: SyncOption[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value
}

export function ConsolidationRulesPanel({
  vi,
  canSave,
  version,
  onVersionChange,
}: {
  vi: boolean
  canSave: boolean
  /**
   * Version cấu hình đồng bộ hiện hành do trang cha giữ — quy tắc và form của trang lưu CHUNG
   * version, nên mọi lần ghi ở đây gửi `expected_version` = giá trị này (trang vừa bấm Lưu
   * cũng không làm panel bị 409).
   */
  version: number | null
  onVersionChange: (version: number | null) => void
}) {
  const [state, setState] = useState<ConsolidationRulesState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorList, setErrorList] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const [text, setText] = useState('')
  const [translating, setTranslating] = useState(false)
  const [aiInfo, setAiInfo] = useState<{ unsupported: string[]; warnings: string[]; model: string | null } | null>(null)
  const [suggestions, setSuggestions] = useState<ConsolidationRuleBody[]>([])

  const [editor, setEditor] = useState<Editor | null>(null)
  const [preview, setPreview] = useState<RulesPreview | null>(null)
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ConsolidationRule | null>(null)

  const apply = useCallback(
    (next: ConsolidationRulesState) => {
      setState(next)
      onVersionChange(next.version)
    },
    [onVersionChange],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      apply(await listConsolidationRules())
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }, [apply])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const options = state?.options
  const editorBody = useMemo(() => (editor && options ? bodyFromEditor(editor, options.fields) : null), [editor, options])
  const issues = editor && state ? editorIssues(editor, state.limits.requiredOneOf, vi) : []
  /** Bộ quy tắc sẽ có nếu lưu: quy tắc đã lưu (thay bản đang sửa) + bản nháp. */
  const proposedRules = useMemo(() => {
    if (!state || !editorBody) return []
    const others = state.rules.filter((r) => r.id !== editor?.id).map(ruleToBody)
    return [...others, editorBody]
  }, [state, editorBody, editor?.id])
  const proposedKey = JSON.stringify(proposedRules)
  const previewFresh = preview !== null && previewKey === proposedKey

  function handleError(err: unknown): void {
    setError(formatApiError(err))
    setErrorList(getApiErrorDetailList(err, 'errors'))
    if (getApiErrorCode(err) === 'ORD_SYNC_SETTINGS_CONFLICT' || getApiErrorCode(err) === 'ORD_CONSOLIDATION_RULE_NOT_FOUND') {
      void listConsolidationRules().then(apply).catch(() => undefined)
    }
  }

  function clearMessages(): void {
    setError(null)
    setErrorList([])
    setNotice(null)
  }

  function openEditor(next: Editor): void {
    clearMessages()
    setEditor(next)
    setPreview(null)
    setPreviewKey(null)
  }

  async function translate(): Promise<void> {
    if (text.trim().length < 3) return
    clearMessages()
    setTranslating(true)
    setAiInfo(null)
    setSuggestions([])
    try {
      const res = await translateConsolidationRule(text.trim())
      setAiInfo({ unsupported: res.unsupported, warnings: res.warnings, model: res.model })
      if (res.rule) openEditor(editorFromBody(res.rule, null))
    } catch (err: unknown) {
      if (getApiErrorCode(err) === 'ORD_CONSOLIDATION_RULE_AI_UNAVAILABLE') {
        setSuggestions(suggestionsFromDetails(err instanceof ApiError ? err.details : null))
        setError(formatApiError(err))
      } else if (err instanceof ApiError && err.status === 429) {
        setError(vi ? 'Đã dịch quá 10 lần trong 1 phút — thử lại sau ít phút.' : 'Too many requests — try again in a minute.')
      } else {
        handleError(err)
      }
    } finally {
      setTranslating(false)
    }
  }

  async function runPreview(): Promise<void> {
    if (issues.length > 0) return
    clearMessages()
    setPreviewing(true)
    try {
      const key = proposedKey
      setPreview(await previewConsolidationRules(proposedRules))
      setPreviewKey(key)
    } catch (err: unknown) {
      handleError(err)
    } finally {
      setPreviewing(false)
    }
  }

  async function save(): Promise<void> {
    if (!state || !editor || !editorBody || !previewFresh || issues.length > 0) return
    clearMessages()
    setBusy(true)
    try {
      const next = editor.id
        ? await updateConsolidationRule(editor.id, editorBody, version)
        : await createConsolidationRule(editorBody, version)
      apply(next)
      setEditor(null)
      setPreview(null)
      setText('')
      setAiInfo(null)
      setNotice(
        next.recomputingKeys
          ? vi
            ? 'Đã lưu. Đang tính lại khóa gộp cho đơn chưa xử lý (chạy nền). Nhóm đã tạo không bị đổi.'
            : 'Saved. Recomputing merge keys in the background.'
          : vi
            ? 'Đã lưu.'
            : 'Saved.',
      )
    } catch (err: unknown) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  async function toggleEnabled(rule: ConsolidationRule): Promise<void> {
    if (!state) return
    clearMessages()
    setBusy(true)
    try {
      apply(await updateConsolidationRule(rule.id, { ...ruleToBody(rule), enabled: !rule.enabled }, version))
      setNotice(rule.enabled ? (vi ? `Đã tắt "${rule.name}".` : 'Rule disabled.') : vi ? `Đã bật "${rule.name}".` : 'Rule enabled.')
    } catch (err: unknown) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!state || !pendingDelete || version === null) return
    clearMessages()
    setBusy(true)
    try {
      apply(await deleteConsolidationRule(pendingDelete.id, version))
      setNotice(vi ? `Đã xóa "${pendingDelete.name}".` : 'Rule deleted.')
      if (editor?.id === pendingDelete.id) setEditor(null)
    } catch (err: unknown) {
      handleError(err)
    } finally {
      setBusy(false)
      setPendingDelete(null)
    }
  }

  const atLimit = state ? state.rules.length >= state.limits.maxRules : true

  return (
    <section className="space-y-4 rounded-xl border border-hairline bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-ink">{vi ? 'Quy tắc gộp bổ sung' : 'Extra merge rules'}</h2>
          <p className="max-w-xl text-xs text-ink-muted">
            {vi
              ? 'Đơn được gộp khi trùng khóa ở trên HOẶC trùng 1 quy tắc dưới đây (luôn cùng sàn, cùng shop). AI chỉ giúp dịch câu chữ thành quy tắc; lúc đồng bộ hệ thống áp quy tắc cố định, không gọi AI.'
              : 'Orders merge when they match the key above OR any rule below. AI only translates text into a rule.'}
          </p>
        </div>
        {state ? (
          <Badge>
            {state.rules.length}/{state.limits.maxRules}
          </Badge>
        ) : null}
      </div>

      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
      {error ? (
        <div className="space-y-1 text-sm text-red-600">
          <p>{error}</p>
          {errorList.length > 1 ? (
            <ul className="list-disc pl-5 text-xs">
              {errorList.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {loading || !state || !options ? (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          {vi ? 'Đang tải…' : 'Loading…'}
        </div>
      ) : (
        <>
          {state.rules.length === 0 ? (
            <p className="rounded-lg border border-dashed border-hairline px-3 py-4 text-center text-sm text-ink-muted">
              {vi ? 'Chưa có quy tắc bổ sung — hệ thống chỉ gộp theo khóa ở trên.' : 'No extra rules yet.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {state.rules.map((rule) => (
                <li
                  key={rule.id}
                  className={`rounded-lg border px-3 py-2 ${rule.enabled ? 'border-primary/30 bg-canvas' : 'border-hairline bg-surface-2/50 opacity-70'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">{rule.name}</span>
                      {!rule.enabled ? <Badge>{vi ? 'Đang tắt' : 'Off'}</Badge> : null}
                    </div>
                    {canSave ? (
                      <div className="flex items-center gap-1">
                        <label className="mr-2 flex items-center gap-1.5 text-xs text-ink-muted">
                          <input type="checkbox" checked={rule.enabled} disabled={busy} onChange={() => void toggleEnabled(rule)} />
                          {vi ? 'Bật' : 'On'}
                        </label>
                        <Button
                          className="h-8 min-h-0 px-2 text-xs"
                          variant="ghost"
                          disabled={busy}
                          aria-label={vi ? `Sửa ${rule.name}` : `Edit ${rule.name}`}
                          onClick={() => openEditor(editorFromBody(ruleToBody(rule), rule.id))}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          className="h-8 min-h-0 px-2 text-xs text-red-600"
                          variant="ghost"
                          disabled={busy}
                          aria-label={vi ? `Xóa ${rule.name}` : `Delete ${rule.name}`}
                          onClick={() => setPendingDelete(rule)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {rule.fields.map((f) => (
                      <Badge key={f.field} tone="primary">
                        {labelOf(options.fields, f.field)}
                        {f.match === 'exact' ? (vi ? ' · chính xác' : ' · exact') : ''}
                      </Badge>
                    ))}
                    <Badge>{rule.platforms.length === 0 ? (vi ? 'Mọi sàn' : 'All channels') : rule.platforms.map((p) => labelOf(options.platforms, p)).join(', ')}</Badge>
                    <Badge>{rule.maxWindowHours === null ? (vi ? 'Giới hạn giờ chung' : 'Shared window') : vi ? `Trong ${String(rule.maxWindowHours)} giờ` : `Within ${String(rule.maxWindowHours)}h`}</Badge>
                  </div>
                  {rule.sourceText ? <p className="mt-1 text-xs italic text-ink-tertiary">“{rule.sourceText}”</p> : null}
                </li>
              ))}
            </ul>
          )}

          {canSave && !editor ? (
            <div className="space-y-2 rounded-lg border border-hairline bg-canvas p-3">
              <label className="block space-y-1">
                <span className="text-sm text-ink">{vi ? 'Mô tả quy tắc bằng câu chữ' : 'Describe the rule'}</span>
                <textarea
                  className="min-h-[72px] w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  maxLength={500}
                  disabled={atLimit}
                  placeholder={vi ? 'VD: Gộp đơn cùng SĐT và cùng phường, khác tên vẫn gộp' : 'e.g. Merge orders with the same phone and ward'}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-ink-tertiary">
                  {atLimit
                    ? vi
                      ? `Đã đủ ${String(state.limits.maxRules)} quy tắc — xóa bớt để thêm.`
                      : 'Rule limit reached.'
                    : vi
                      ? 'Chỉ gửi câu chữ lên AI, không gửi dữ liệu khách.'
                      : 'Only your text is sent to the AI.'}
                </span>
                <div className="flex gap-2">
                  <Button className="h-9 min-h-0 text-xs" variant="secondary" disabled={atLimit} onClick={() => openEditor(emptyEditor())}>
                    <Plus className="h-3.5 w-3.5" />
                    {vi ? 'Tự chọn trường' : 'Build manually'}
                  </Button>
                  <Button className="h-9 min-h-0 text-xs" disabled={atLimit || translating || text.trim().length < 3} onClick={() => void translate()}>
                    {translating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {vi ? 'Dịch thành quy tắc' : 'Translate'}
                  </Button>
                </div>
              </div>
              {aiInfo && aiInfo.unsupported.length > 0 ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  <p className="font-medium">{vi ? 'Yêu cầu này chưa làm được:' : 'Not supported:'}</p>
                  <ul className="list-disc pl-5">
                    {aiInfo.unsupported.map((u) => (
                      <li key={u}>{u}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {suggestions.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-ink-muted">{vi ? 'Chọn 1 quy tắc mẫu hoặc tự chọn trường:' : 'Pick a template:'}</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <Button key={s.name} className="h-8 min-h-0 text-xs" variant="secondary" onClick={() => openEditor(editorFromBody({ ...s, source_text: text.trim() || null }, null))}>
                        {s.name}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {canSave && editor ? (
            <div className="space-y-3 rounded-lg border border-primary/40 bg-canvas p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">{editor.id ? (vi ? 'Sửa quy tắc' : 'Edit rule') : vi ? 'Quy tắc mới' : 'New rule'}</h3>
                {aiInfo?.model && !editor.id ? <Badge tone="primary">{vi ? 'AI đề xuất' : 'AI draft'}</Badge> : null}
              </div>
              {editor.sourceText ? <p className="text-xs italic text-ink-tertiary">“{editor.sourceText}”</p> : null}
              {aiInfo && aiInfo.warnings.length > 0 && !editor.id ? (
                <ul className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  {aiInfo.warnings.map((w) => (
                    <li key={w}>⚠ {w}</li>
                  ))}
                </ul>
              ) : null}

              <label className="block space-y-1">
                <span className="text-sm text-ink">{vi ? 'Tên quy tắc' : 'Name'}</span>
                <Input className={fieldClass} maxLength={80} value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} />
              </label>

              <div className="space-y-1">
                <p className="text-sm text-ink">{vi ? 'Phải trùng các trường' : 'Fields that must match'}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {options.fields.map((o) => {
                    const match = editor.fields[o.value]
                    const checked = match !== undefined
                    return (
                      <div
                        key={o.value}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? 'border-primary/40 bg-primary/5 text-ink' : 'border-hairline text-ink-muted'}`}
                      >
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = { ...editor.fields }
                              if (checked) delete next[o.value]
                              else next[o.value] = 'normalized'
                              setEditor({ ...editor, fields: next })
                            }}
                          />
                          {o.label}
                          {state.limits.requiredOneOf.includes(o.value) ? <span className="text-xs text-primary">*</span> : null}
                        </label>
                        {checked && o.value !== 'phone' ? (
                          <select
                            className="h-7 rounded border border-hairline bg-canvas px-1 text-xs text-ink"
                            aria-label={vi ? `Cách so khớp ${o.label}` : `Match mode for ${o.label}`}
                            value={match}
                            onChange={(e) => setEditor({ ...editor, fields: { ...editor.fields, [o.value]: e.target.value === 'exact' ? 'exact' : 'normalized' } })}
                          >
                            {options.matches.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.value === 'exact' ? (vi ? 'Chính xác' : 'Exact') : vi ? 'Gần đúng' : 'Normalized'}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-ink-tertiary">
                  {vi
                    ? '* Bắt buộc có Số điện thoại hoặc Địa chỉ chi tiết. "Gần đúng" = bỏ dấu, không phân biệt hoa thường. Trường bị trống hoặc bị sàn che (*) thì quy tắc bỏ qua đơn đó.'
                    : '* Phone or street address required.'}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm text-ink">{vi ? 'Áp cho sàn' : 'Channels'}</p>
                  <div className="flex flex-wrap gap-2">
                    {options.platforms.map((p) => (
                      <label key={p.value} className="flex items-center gap-1.5 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={editor.platforms.includes(p.value)}
                          onChange={() =>
                            setEditor({
                              ...editor,
                              platforms: editor.platforms.includes(p.value) ? editor.platforms.filter((x) => x !== p.value) : [...editor.platforms, p.value],
                            })
                          }
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-ink-tertiary">{vi ? 'Không tích = mọi sàn.' : 'None = all channels.'}</p>
                </div>
                <label className="block space-y-1">
                  <span className="text-sm text-ink">{vi ? 'Chỉ gộp đơn đặt trong (giờ)' : 'Only within (hours)'}</span>
                  <Input
                    className={fieldClass}
                    inputMode="numeric"
                    placeholder={vi ? 'Trống = dùng giới hạn chung' : 'Blank = shared window'}
                    value={editor.maxWindowHours}
                    onChange={(e) => setEditor({ ...editor, maxWindowHours: e.target.value })}
                  />
                </label>
              </div>

              {issues.length > 0 ? (
                <ul className="space-y-1 text-xs text-red-600">
                  {issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              ) : null}

              {preview ? (
                <div className={`space-y-2 rounded-md border px-3 py-2 text-sm ${previewFresh ? 'border-primary/30 bg-primary/5' : 'border-hairline opacity-60'}`}>
                  <p className="text-ink">
                    {vi ? 'Trên ' : 'On '}
                    <strong>{preview.ordersScanned}</strong>
                    {vi ? ' đơn chưa xử lý: không quy tắc ' : ' open orders: without rules '}
                    <strong>{preview.baselineGroups}</strong>
                    {vi ? ' nhóm → áp bộ này ' : ' groups → with these rules '}
                    <strong>{preview.projectedGroups}</strong>
                    {vi ? ' nhóm' : ' groups'}
                    {preview.groupsMergedByRules > 0 ? (vi ? ` (${String(preview.groupsMergedByRules)} nhóm có đơn gộp nhờ quy tắc)` : '') : ''}.
                  </p>
                  {preview.truncated ? <p className="text-xs text-ink-tertiary">{vi ? 'Chỉ tính 5.000 đơn mới nhất.' : 'Only the latest 5,000 orders.'}</p> : null}
                  {preview.skippedMissingData.some((s) => s.orders > 0) ? (
                    <ul className="text-xs text-ink-muted">
                      {preview.skippedMissingData
                        .filter((s) => s.orders > 0)
                        .map((s) => (
                          <li key={s.ruleName}>
                            {vi ? `"${s.ruleName}" bỏ qua ${String(s.orders)} đơn vì thiếu hoặc bị che dữ liệu.` : `"${s.ruleName}" skips ${String(s.orders)} orders.`}
                          </li>
                        ))}
                    </ul>
                  ) : null}
                  {preview.examples.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-ink">{vi ? 'Ví dụ sẽ gộp:' : 'Examples:'}</p>
                      <ul className="space-y-0.5 text-xs text-ink-muted">
                        {preview.examples.map((ex) => (
                          <li key={ex.platformOrderIds.join('-')}>
                            {ex.platformOrderIds.join(' + ')} · SĐT …{ex.phoneLast3.join(' / …')} · {ex.ruleNames.join(', ')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-muted">{vi ? 'Chưa có đơn nào hiện tại sẽ được gộp thêm.' : 'No current orders would merge.'}</p>
                  )}
                  {!previewFresh ? <p className="text-xs text-amber-700">{vi ? 'Bạn vừa sửa quy tắc — xem trước lại trước khi lưu.' : 'Changed — preview again.'}</p> : null}
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <Button className="h-9 min-h-0 text-xs" variant="ghost" disabled={busy} onClick={() => { setEditor(null); setPreview(null) }}>
                  {vi ? 'Hủy' : 'Cancel'}
                </Button>
                <Button className="h-9 min-h-0 text-xs" variant="secondary" disabled={previewing || issues.length > 0} onClick={() => void runPreview()}>
                  {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {vi ? 'Xem trước trên đơn thật' : 'Preview'}
                </Button>
                <Button className="h-9 min-h-0 text-xs" disabled={busy || !previewFresh || issues.length > 0} onClick={() => void save()}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {vi ? 'Xác nhận lưu' : 'Confirm & save'}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={vi ? 'Xóa quy tắc gộp?' : 'Delete rule?'}
        description={
          vi
            ? `Xóa "${pendingDelete?.name ?? ''}". Chỉ ảnh hưởng đơn mới về; nhóm đã tạo giữ nguyên.`
            : 'Only affects new orders; existing groups stay.'
        }
        confirmLabel={vi ? 'Xóa' : 'Delete'}
        cancelLabel={vi ? 'Giữ lại' : 'Keep'}
        loading={busy}
        icon={<Trash2 className="h-5 w-5 text-red-600" />}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  )
}
