import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import {
  createConsolidationRule,
  deleteConsolidationRule,
  listConsolidationRules,
  previewConsolidationRules,
  ruleToBody,
  translateConsolidationRule,
  updateConsolidationRule,
  type ConsolidationRule,
  type ConsolidationRuleBody,
  type ConsolidationRulesPreview,
  type ConsolidationRulesState,
} from '../../api/consolidation-rules.api'
import { ApiError, formatApiError, getApiErrorCode, getApiErrorDetailList } from '../../lib/api'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Input } from '../ui/input'

const fieldClass =
  'h-9 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

const MAX_TEXT = 500

type Form = {
  /** null = thêm mới. */
  id: string | null
  name: string
  sourceText: string | null
  fields: Record<string, string>
  platforms: string[]
  maxWindowHours: string
  enabled: boolean
}

const EMPTY_FORM: Form = {
  id: null,
  name: '',
  sourceText: null,
  fields: {},
  platforms: [],
  maxWindowHours: '',
  enabled: true,
}

function formFromBody(body: ConsolidationRuleBody, id: string | null): Form {
  return {
    id,
    name: body.name,
    sourceText: body.source_text ?? null,
    fields: Object.fromEntries(body.fields.map((row) => [row.field, row.match])),
    platforms: [...(body.platforms ?? [])],
    maxWindowHours: body.max_window_hours === null || body.max_window_hours === undefined ? '' : String(body.max_window_hours),
    enabled: body.enabled !== false,
  }
}

function bodyFromForm(form: Form): ConsolidationRuleBody {
  const hours = form.maxWindowHours.trim()
  return {
    name: form.name.trim(),
    source_text: form.sourceText,
    fields: Object.entries(form.fields).map(([field, match]) => ({ field, match })),
    platforms: form.platforms,
    max_window_hours: hours === '' ? null : Number(hours),
    enabled: form.enabled,
  }
}

function labelOf(options: { value: string; label: string }[], value: string): string {
  return options.find((row) => row.value === value)?.label ?? value
}

function formIssues(form: Form, state: ConsolidationRulesState, vi: boolean): string[] {
  const issues: string[] = []
  if (form.name.trim() === '') issues.push(vi ? 'Đặt tên cho quy tắc.' : 'Give the rule a name.')
  if (!state.limits.requiredOneOf.some((field) => field in form.fields)) {
    const names = state.limits.requiredOneOf.map((field) => labelOf(state.options.fields, field))
    issues.push(vi ? `Phải tích ${names.join(' hoặc ')}.` : `Tick ${names.join(' or ')}.`)
  }
  const hours = form.maxWindowHours.trim()
  if (hours !== '') {
    const value = Number(hours)
    if (!Number.isInteger(value) || value < 1 || value > 720) {
      issues.push(vi ? 'Giới hạn giờ phải từ 1 đến 720.' : 'Time window must be 1 to 720 hours.')
    }
  }
  return issues
}

export function ConsolidationRulesPanel({
  vi,
  canEdit,
  settingsVersion,
  onVersionChange,
}: {
  vi: boolean
  canEdit: boolean
  /** Version cấu hình của trang: đổi thì tải lại để `expected_version` luôn đúng. */
  settingsVersion: number | null | undefined
  onVersionChange: (version: number | null) => void
}) {
  const [state, setState] = useState<ConsolidationRulesState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorList, setErrorList] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const [text, setText] = useState('')
  const [translating, setTranslating] = useState(false)
  const [unsupported, setUnsupported] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [suggestions, setSuggestions] = useState<ConsolidationRuleBody[]>([])

  const [form, setForm] = useState<Form | null>(null)
  const [preview, setPreview] = useState<ConsolidationRulesPreview | null>(null)
  /** Nội dung form lúc xem trước: sửa form thì phải xem trước lại mới được lưu. */
  const [previewedKey, setPreviewedKey] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setState(await listConsolidationRules())
      setLoadError(null)
    } catch (err: unknown) {
      setLoadError(formatApiError(err))
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load, settingsVersion])

  const formKey = useMemo(() => (form ? JSON.stringify(bodyFromForm(form)) : null), [form])
  const issues = form && state ? formIssues(form, state, vi) : []
  const atLimit = state ? state.rules.length >= state.limits.maxRules : false

  function clearMessages(): void {
    setNotice(null)
    setError(null)
    setErrorList([])
  }

  function openForm(next: Form): void {
    setForm(next)
    setPreview(null)
    setPreviewedKey(null)
    clearMessages()
  }

  function closeForm(): void {
    setForm(null)
    setPreview(null)
    setPreviewedKey(null)
    setWarnings([])
    setUnsupported([])
    setSuggestions([])
    setText('')
  }

  function handleWriteError(err: unknown): void {
    const code = getApiErrorCode(err)
    if (code === 'ORD_SYNC_SETTINGS_CONFLICT') {
      setError(
        vi
          ? 'Người khác vừa lưu cấu hình. Đã tải lại, kiểm tra rồi bấm lại.'
          : 'Someone else just saved. Reloaded, check and try again.',
      )
      void load()
      return
    }
    if (code === 'ORD_CONSOLIDATION_RULE_NOT_FOUND') void load()
    setError(formatApiError(err))
    setErrorList(code === 'ORD_CONSOLIDATION_RULE_INVALID' ? getApiErrorDetailList(err, 'errors') : [])
  }

  function applyWrite(next: ConsolidationRulesState): void {
    setState(next)
    onVersionChange(next.version)
    setNotice(
      next.recomputingKeys
        ? vi
          ? 'Đã lưu. Đang tính lại khoá gom cho đơn chưa xử lý (chạy nền). Nhóm đã tạo không bị đổi.'
          : 'Saved. Recomputing keys for unprocessed orders in the background. Existing groups stay as they are.'
        : vi
          ? 'Đã lưu. Nhóm đã tạo không bị đổi.'
          : 'Saved. Existing groups stay as they are.',
    )
  }

  async function translate(): Promise<void> {
    const sentence = text.trim()
    if (sentence === '') return
    setTranslating(true)
    clearMessages()
    setUnsupported([])
    setWarnings([])
    setSuggestions([])
    try {
      const res = await translateConsolidationRule(sentence)
      if (res.rule) {
        setWarnings(res.warnings)
        setUnsupported(res.unsupported)
        setForm(formFromBody({ ...res.rule, source_text: res.rule.source_text ?? sentence }, null))
        setPreview(null)
        setPreviewedKey(null)
      } else {
        setUnsupported(
          res.unsupported.length > 0
            ? res.unsupported
            : [vi ? 'Không dịch được câu này thành quy tắc.' : 'This sentence could not be turned into a rule.'],
        )
      }
    } catch (err: unknown) {
      const code = getApiErrorCode(err)
      if (code === 'ORD_CONSOLIDATION_RULE_AI_UNAVAILABLE') {
        const raw = err instanceof ApiError ? err.details?.suggestions : null
        setSuggestions(Array.isArray(raw) ? (raw as ConsolidationRuleBody[]) : [])
        setError(
          vi
            ? 'AI chưa dùng được. Chọn một quy tắc mẫu hoặc tự điền form.'
            : 'AI is unavailable. Pick a sample rule or fill the form yourself.',
        )
        setForm({ ...EMPTY_FORM, sourceText: sentence })
        setPreview(null)
        setPreviewedKey(null)
      } else if (err instanceof ApiError && err.status === 429) {
        setError(vi ? 'Thử lại sau 1 phút.' : 'Try again in a minute.')
      } else {
        setError(formatApiError(err))
      }
    } finally {
      setTranslating(false)
    }
  }

  async function runPreview(): Promise<void> {
    if (!form || !state || !formKey || issues.length > 0) return
    setPreviewing(true)
    clearMessages()
    try {
      const others = state.rules.filter((rule) => rule.id !== form.id).map(ruleToBody)
      setPreview(await previewConsolidationRules([...others, bodyFromForm(form)]))
      setPreviewedKey(formKey)
    } catch (err: unknown) {
      handleWriteError(err)
    } finally {
      setPreviewing(false)
    }
  }

  async function save(): Promise<void> {
    if (!form || !state || previewedKey !== formKey) return
    setBusy(true)
    clearMessages()
    try {
      const body = bodyFromForm(form)
      const next = form.id
        ? await updateConsolidationRule(form.id, body, state.version)
        : await createConsolidationRule(body, state.version)
      applyWrite(next)
      closeForm()
    } catch (err: unknown) {
      handleWriteError(err)
    } finally {
      setBusy(false)
    }
  }

  async function toggleEnabled(rule: ConsolidationRule): Promise<void> {
    if (!state) return
    setBusy(true)
    clearMessages()
    try {
      applyWrite(
        await updateConsolidationRule(rule.id, { ...ruleToBody(rule), enabled: !rule.enabled }, state.version),
      )
    } catch (err: unknown) {
      handleWriteError(err)
    } finally {
      setBusy(false)
    }
  }

  async function remove(rule: ConsolidationRule): Promise<void> {
    if (!state || state.version === null) return
    setBusy(true)
    clearMessages()
    try {
      applyWrite(await deleteConsolidationRule(rule.id, state.version))
      setConfirmDeleteId(null)
      if (form?.id === rule.id) closeForm()
    } catch (err: unknown) {
      handleWriteError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-hairline bg-surface-1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">
            {vi ? 'Quy tắc gộp bổ sung' : 'Extra merge rules'}
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {vi
              ? 'Đơn mới gộp khi trùng khoá gom ở trên hoặc trùng một quy tắc đang bật. Đơn thiếu dữ liệu hoặc bị sàn che sẽ không áp quy tắc.'
              : 'A new order merges when it matches the key above or any enabled rule. Orders with missing or masked data skip the rule.'}
          </p>
        </div>
        {state ? (
          <span className="text-xs text-ink-muted">
            {String(state.rules.length)} / {String(state.limits.maxRules)}
          </span>
        ) : null}
      </div>

      {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {errorList.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-red-600">
          {errorList.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      {!state ? (
        loadError ? null : (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {vi ? 'Đang tải…' : 'Loading…'}
          </p>
        )
      ) : (
        <>
          {state.rules.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {vi ? 'Chưa có quy tắc. Hệ thống chỉ gom theo khoá ở trên.' : 'No rules yet. Only the key above is used.'}
            </p>
          ) : (
            <ul className="divide-y divide-hairline rounded-lg border border-hairline">
              {state.rules.map((rule) => (
                <li key={rule.id} className="space-y-1 px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{rule.name}</span>
                    {!rule.enabled ? <Badge>{vi ? 'Đang tắt' : 'Off'}</Badge> : null}
                    {canEdit ? (
                      <span className="ml-auto flex flex-wrap items-center gap-1.5">
                        <Button
                          variant="secondary"
                          className="h-7 min-h-0 px-2 text-xs"
                          disabled={busy}
                          onClick={() => void toggleEnabled(rule)}
                        >
                          {rule.enabled ? (vi ? 'Tắt' : 'Disable') : vi ? 'Bật' : 'Enable'}
                        </Button>
                        <Button
                          variant="secondary"
                          className="h-7 min-h-0 px-2 text-xs"
                          disabled={busy}
                          onClick={() => openForm(formFromBody(ruleToBody(rule), rule.id))}
                        >
                          {vi ? 'Sửa' : 'Edit'}
                        </Button>
                        {confirmDeleteId === rule.id ? (
                          <>
                            <Button
                              className="h-7 min-h-0 px-2 text-xs"
                              disabled={busy}
                              onClick={() => void remove(rule)}
                            >
                              {vi ? 'Xoá hẳn' : 'Delete'}
                            </Button>
                            <Button
                              variant="secondary"
                              className="h-7 min-h-0 px-2 text-xs"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              {vi ? 'Không' : 'Cancel'}
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="secondary"
                            className="h-7 min-h-0 px-2 text-xs"
                            disabled={busy}
                            onClick={() => setConfirmDeleteId(rule.id)}
                          >
                            {vi ? 'Xoá' : 'Remove'}
                          </Button>
                        )}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-ink-muted">
                    {rule.fields.map((row) => labelOf(state.options.fields, row.field)).join(' + ')}
                    {' · '}
                    {rule.platforms.length === 0
                      ? vi
                        ? 'Mọi sàn'
                        : 'All platforms'
                      : rule.platforms.map((value) => labelOf(state.options.platforms, value)).join(', ')}
                    {' · '}
                    {rule.maxWindowHours === null
                      ? vi
                        ? 'Giới hạn giờ chung'
                        : 'Shared time window'
                      : vi
                        ? `Trong ${String(rule.maxWindowHours)} giờ`
                        : `Within ${String(rule.maxWindowHours)} h`}
                  </p>
                  {rule.sourceText ? (
                    <p className="text-xs text-ink-tertiary">“{rule.sourceText}”</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canEdit && !form ? (
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-sm text-ink">
                  {vi ? 'Mô tả quy tắc bằng một câu' : 'Describe the rule in one sentence'}
                </span>
                <textarea
                  className="min-h-16 w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  maxLength={MAX_TEXT}
                  disabled={atLimit}
                  value={text}
                  placeholder={vi ? 'Gộp đơn cùng SĐT và cùng phường, khác tên vẫn gộp' : 'Merge orders with the same phone and ward, even with different names'}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="h-9 min-h-0 text-xs"
                  disabled={translating || atLimit || text.trim() === ''}
                  onClick={() => void translate()}
                >
                  {translating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {vi ? 'Dịch thành quy tắc' : 'Translate to a rule'}
                </Button>
                <Button
                  variant="secondary"
                  className="h-9 min-h-0 text-xs"
                  disabled={atLimit}
                  onClick={() => openForm(EMPTY_FORM)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {vi ? 'Tự điền form' : 'Fill the form'}
                </Button>
                {atLimit ? (
                  <span className="text-xs text-ink-muted">
                    {vi
                      ? `Đã đủ ${String(state.limits.maxRules)} quy tắc.`
                      : `Limit of ${String(state.limits.maxRules)} rules reached.`}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {unsupported.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-medium">{vi ? 'Không làm được:' : 'Not supported:'}</p>
              <ul className="mt-1 list-disc pl-4">
                {unsupported.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {canEdit && form ? (
            <div className="space-y-3 rounded-lg border border-hairline p-3">
              <p className="text-sm font-medium text-ink">
                {form.id ? (vi ? 'Sửa quy tắc' : 'Edit rule') : vi ? 'Quy tắc mới' : 'New rule'}
              </p>

              {warnings.length > 0 ? (
                <ul className="list-disc rounded-lg border border-amber-200 bg-amber-50 py-2 pl-7 pr-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                  {warnings.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}

              {suggestions.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-ink-muted">{vi ? 'Quy tắc mẫu' : 'Sample rules'}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((row) => (
                      <Button
                        key={row.name}
                        variant="secondary"
                        className="h-auto min-h-0 px-2 py-1 text-left text-xs"
                        onClick={() =>
                          openForm(formFromBody({ ...row, source_text: form.sourceText }, null))
                        }
                      >
                        {row.name}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              {form.sourceText ? (
                <p className="text-xs text-ink-tertiary">“{form.sourceText}”</p>
              ) : null}

              <label className="block space-y-1">
                <span className="text-sm text-ink">{vi ? 'Tên quy tắc' : 'Rule name'}</span>
                <Input
                  className={fieldClass}
                  maxLength={80}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>

              <div className="space-y-1.5">
                <p className="text-sm text-ink">{vi ? 'Các trường phải trùng' : 'Fields that must match'}</p>
                {state.options.fields.map((option) => {
                  const match = form.fields[option.value]
                  const checked = match !== undefined
                  return (
                    <div key={option.value} className="flex flex-wrap items-center gap-2">
                      <label className="flex min-w-48 flex-1 items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const fields = { ...form.fields }
                            if (e.target.checked) {
                              fields[option.value] = state.options.matches[0]?.value ?? 'normalized'
                            } else {
                              delete fields[option.value]
                            }
                            setForm({ ...form, fields })
                          }}
                        />
                        {option.label}
                      </label>
                      {checked && option.value !== 'phone' ? (
                        <select
                          className="h-8 max-w-xs rounded-md border border-hairline bg-canvas px-2 text-xs text-ink"
                          value={match}
                          aria-label={option.label}
                          onChange={(e) =>
                            setForm({ ...form, fields: { ...form.fields, [option.value]: e.target.value } })
                          }
                        >
                          {state.options.matches.map((row) => (
                            <option key={row.value} value={row.value}>
                              {row.label}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm text-ink">{vi ? 'Sàn (không tích = mọi sàn)' : 'Platforms (none = all)'}</p>
                  <div className="flex flex-wrap gap-3">
                    {state.options.platforms.map((option) => (
                      <label key={option.value} className="flex items-center gap-1.5 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={form.platforms.includes(option.value)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              platforms: e.target.checked
                                ? [...form.platforms, option.value]
                                : form.platforms.filter((value) => value !== option.value),
                            })
                          }
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="block space-y-1">
                  <span className="text-sm text-ink">
                    {vi ? 'Giới hạn giờ (trống = dùng giới hạn chung)' : 'Time window, hours (empty = shared)'}
                  </span>
                  <Input
                    className={fieldClass}
                    inputMode="numeric"
                    value={form.maxWindowHours}
                    onChange={(e) => setForm({ ...form, maxWindowHours: e.target.value })}
                  />
                </label>
              </div>

              {issues.length > 0 ? (
                <ul className="space-y-0.5 text-xs text-red-600">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}

              {preview && previewedKey === formKey ? (
                <div className="space-y-1.5 rounded-lg bg-surface-2 p-3 text-xs text-ink">
                  <p className="text-sm font-medium">
                    {vi
                      ? `Không quy tắc: ${String(preview.baselineGroups)} nhóm → áp bộ này: ${String(preview.projectedGroups)} nhóm`
                      : `Without rules: ${String(preview.baselineGroups)} groups → with these: ${String(preview.projectedGroups)} groups`}
                  </p>
                  <p className="text-ink-muted">
                    {vi
                      ? `Tính trên ${String(preview.ordersScanned)} đơn chưa xong. ${String(preview.groupsMergedByRules)} nhóm được gộp nhờ quy tắc.`
                      : `Based on ${String(preview.ordersScanned)} open orders. ${String(preview.groupsMergedByRules)} groups merged by rules.`}
                    {preview.truncated
                      ? vi
                        ? ' Chỉ tính 5.000 đơn mới nhất.'
                        : ' Only the newest 5,000 orders were used.'
                      : ''}
                  </p>
                  {preview.skippedMissingData.map((row) => (
                    <p key={row.ruleName} className="text-ink-muted">
                      {vi
                        ? `${row.ruleName}: bỏ qua ${String(row.orders)} đơn vì thiếu hoặc bị che dữ liệu.`
                        : `${row.ruleName}: skipped ${String(row.orders)} orders with missing or masked data.`}
                    </p>
                  ))}
                  {preview.examples.length > 0 ? (
                    <ul className="space-y-0.5 pt-1">
                      {preview.examples.slice(0, 10).map((row) => (
                        <li key={row.platformOrderIds.join('+')} className="font-mono text-ink-muted">
                          {row.platformOrderIds.join(' + ')}
                          {row.phoneLast3.length > 0 ? ` · …${row.phoneLast3.join(', …')}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="secondary"
                  className="h-9 min-h-0 text-xs"
                  disabled={busy}
                  onClick={closeForm}
                >
                  {vi ? 'Huỷ' : 'Cancel'}
                </Button>
                <Button
                  variant="secondary"
                  className="h-9 min-h-0 text-xs"
                  disabled={previewing || issues.length > 0}
                  onClick={() => void runPreview()}
                >
                  {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {vi ? 'Xem trước' : 'Preview'}
                </Button>
                <Button
                  className="h-9 min-h-0 text-xs"
                  disabled={busy || issues.length > 0 || previewedKey !== formKey}
                  title={previewedKey !== formKey ? (vi ? 'Xem trước rồi mới lưu được' : 'Preview before saving') : undefined}
                  onClick={() => void save()}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {vi ? 'Xác nhận lưu' : 'Confirm and save'}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
