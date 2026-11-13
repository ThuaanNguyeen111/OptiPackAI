import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  PlugZap,
  XCircle,
} from 'lucide-react'
import {
  type AiConnectionTest,
  type AiProviderKey,
  type AiSettings,
  getAiSettings,
  revealAiKey,
  type RevealedAiKey,
  testAiSettings,
  updateAiSettings,
} from '../../api/ai-settings.api'
import { formatApiError } from '../../lib/api'
import { cn } from '../../lib/cn'
import { FieldLabel, fieldClass, type SaveState, SaveBar, Segmented, SettingsCard, SettingsRow } from './settings-ui'

type Draft = {
  provider: AiProviderKey
  baseUrl: string
  model: string
  visionModel: string
  timeoutSec: number
  /** Key mới gõ vào; rỗng = giữ key đang lưu. */
  apiKey: string
  /** true = xoá key đã lưu trên web khi bấm lưu. */
  clearKey: boolean
}

function toDraft(s: AiSettings): Draft {
  return {
    provider: s.provider,
    baseUrl: s.baseUrl,
    model: s.model,
    visionModel: s.visionModel ?? '',
    timeoutSec: Math.round(s.timeoutMs / 1000),
    apiKey: '',
    clearKey: false,
  }
}

function SourceBadge({ settings, vi }: { settings: AiSettings; vi: boolean }) {
  const map = {
    db: { tone: 'border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300', vi: 'Đang bật · cấu hình trên web', en: 'On · configured here' },
    env: { tone: 'border-sky-600/30 bg-sky-500/10 text-sky-800 dark:text-sky-300', vi: 'Đang bật · lấy từ .env của server', en: 'On · from server .env' },
    none: { tone: 'border-amber-600/30 bg-amber-500/10 text-amber-800 dark:text-amber-300', vi: 'Đang tắt · chưa có API key', en: 'Off · no API key' },
  } as const
  const item = map[settings.source]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', item.tone)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {vi ? item.vi : item.en}
    </span>
  )
}

export function AiConnectionCard({ vi }: { vi: boolean }) {
  const [saved, setSaved] = useState<AiSettings | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<AiConnectionTest | null>(null)

  useEffect(() => {
    let alive = true
    void getAiSettings()
      .then((s) => {
        if (!alive) return
        setSaved(s)
        setDraft(toDraft(s))
      })
      .catch((err: unknown) => alive && setError(formatApiError(err)))
    return () => {
      alive = false
    }
  }, [])

  const dirty = useMemo(
    () => saved !== null && draft !== null && JSON.stringify(toDraft(saved)) !== JSON.stringify(draft),
    [saved, draft],
  )
  const state: SaveState = saving ? 'saving' : dirty ? 'dirty' : justSaved ? 'saved' : 'idle'
  const preset = saved?.presets.find((p) => p.key === draft?.provider) ?? null

  function patch(next: Partial<Draft>) {
    setJustSaved(false)
    setDraft((d) => (d ? { ...d, ...next } : d))
  }

  function chooseProvider(key: AiProviderKey) {
    if (!saved || !draft) return
    const p = saved.presets.find((x) => x.key === key)
    setTest(null)
    // Quay lại nhà cung cấp đang lưu thì lấy lại giá trị đã lưu, đổi sang cái khác thì điền gợi ý.
    if (key === saved.provider) {
      patch({ provider: key, baseUrl: saved.baseUrl, model: saved.model, visionModel: saved.visionModel ?? '' })
    } else {
      patch({ provider: key, baseUrl: p?.baseUrl ?? '', model: p?.defaultModel ?? '', visionModel: '' })
    }
  }

  async function runTest() {
    if (!draft) return
    setTesting(true)
    setTest(null)
    try {
      setTest(
        await testAiSettings({
          provider: draft.provider,
          base_url: draft.baseUrl.trim() || undefined,
          model: draft.model.trim() || undefined,
          api_key: draft.apiKey.trim() || undefined,
        }),
      )
    } catch (err: unknown) {
      setTest({ ok: false, latencyMs: 0, models: [], modelFound: null, error: formatApiError(err) })
    } finally {
      setTesting(false)
    }
  }

  async function save() {
    if (!saved || !draft) return
    setSaving(true)
    setError(null)
    try {
      const next = await updateAiSettings({
        provider: draft.provider,
        base_url: draft.baseUrl.trim(),
        model: draft.model.trim(),
        vision_model: draft.visionModel.trim() || null,
        timeout_ms: draft.timeoutSec * 1000,
        ...(draft.clearKey ? { api_key: null } : draft.apiKey.trim() ? { api_key: draft.apiKey.trim() } : {}),
      })
      setSaved(next)
      setDraft(toDraft(next))
      setShowKey(false)
      setJustSaved(true)
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const keyPlaceholder =
    saved?.source === 'db' && saved.apiKeyLast4
      ? vi
        ? `Đã lưu ••••${saved.apiKeyLast4} · để trống = giữ`
        : `Saved ••••${saved.apiKeyLast4} · empty = keep`
      : saved?.source === 'env'
        ? vi
          ? 'Đang dùng key trong .env'
          : 'Using the .env key'
        : vi
          ? 'Dán API key'
          : 'Paste API key'

  return (
    <SettingsCard
      title={vi ? 'Kết nối AI' : 'AI connection'}
      description={
        vi
          ? 'Dùng chung cho hướng dẫn đóng gói, quy tắc gộp đơn và đọc phiếu nhà cung cấp. Không có key thì hệ thống dùng câu mẫu và cho nhập tay.'
          : 'One connection for packing guides, consolidation rules and supplier-receipt reading. Without a key the system falls back to templates and manual entry.'
      }
      aside={saved ? <SourceBadge settings={saved} vi={vi} /> : null}
      footer={
        <SaveBar
          vi={vi}
          state={state}
          error={error}
          label={vi ? 'Lưu kết nối' : 'Save connection'}
          onSave={() => void save()}
          extra={
            draft ? (
              <button
                type="button"
                onClick={() => void runTest()}
                disabled={testing || (!draft.apiKey.trim() && !saved?.hasApiKey)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-hairline bg-canvas px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PlugZap className="h-4 w-4" aria-hidden />}
                {vi ? 'Kiểm tra kết nối' : 'Test connection'}
              </button>
            ) : null
          }
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
            title={vi ? 'Nhà cung cấp' : 'Provider'}
            hint={vi ? 'Đều dùng chuẩn API của OpenAI. Chọn "Tự nhập" cho máy chủ riêng.' : 'All speak the OpenAI API. Pick "Custom" for your own server.'}
          >
            <Segmented
              name="ai-provider"
              value={draft.provider}
              onChange={chooseProvider}
              options={saved.presets.map((p) => ({ value: p.key, label: p.key === 'custom' ? (vi ? 'Tự nhập' : 'Custom') : p.label }))}
            />
            {draft.provider === 'custom' ? (
              <FieldLabel label={vi ? 'URL API' : 'API URL'} htmlFor="ai-base-url" hint={vi ? 'Ví dụ http://localhost:11434/v1 (Ollama).' : 'e.g. http://localhost:11434/v1 (Ollama).'}>
                <input
                  id="ai-base-url"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://…/v1"
                  value={draft.baseUrl}
                  onChange={(e) => patch({ baseUrl: e.target.value })}
                  className={cn(fieldClass, 'font-mono')}
                />
              </FieldLabel>
            ) : (
              <p className="font-mono text-xs break-all text-ink-subtle">{draft.baseUrl}</p>
            )}
          </SettingsRow>

          <SettingsRow
            title="API key"
            hint={
              preset?.keyUrl ? (
                <a
                  href={preset.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-2 hover:underline"
                >
                  {vi ? `Lấy key ở ${preset.label}` : `Get a key from ${preset.label}`}
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                </a>
              ) : (
                vi ? 'Lưu mã hoá trên máy chủ, không hiện lại sau khi lưu.' : 'Stored encrypted; never shown again.'
              )
            }
          >
            <div className="relative">
              <label htmlFor="ai-key" className="sr-only">API key</label>
              <input
                id="ai-key"
                type={showKey ? 'text' : 'password'}
                autoComplete="new-password"
                spellCheck={false}
                placeholder={keyPlaceholder}
                value={draft.apiKey}
                disabled={draft.clearKey}
                onChange={(e) => patch({ apiKey: e.target.value })}
                className={cn(fieldClass, 'pr-10 font-mono placeholder:font-sans')}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? (vi ? 'Ẩn key' : 'Hide key') : vi ? 'Hiện key' : 'Show key'}
                className="absolute inset-y-0 right-0 grid w-9 place-items-center rounded-r-lg text-ink-subtle transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {showKey ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
            </div>
            {saved.hasApiKey ? <RevealKey vi={vi} /> : null}
            {saved.source === 'db' ? (
              <label className="flex items-center gap-2 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={draft.clearKey}
                  onChange={(e) => patch({ clearKey: e.target.checked, apiKey: '' })}
                  className="h-4 w-4 rounded border-hairline accent-[var(--app-primary)]"
                />
                {vi ? 'Xoá key đã lưu (quay về key trong .env, nếu có)' : 'Remove saved key (fall back to .env, if any)'}
              </label>
            ) : null}
          </SettingsRow>

          <SettingsRow
            title="Model"
            hint={vi ? 'Bấm "Kiểm tra kết nối" để tải danh sách model của nhà cung cấp rồi chọn.' : 'Test the connection to load the provider’s model list.'}
          >
            <FieldLabel label={vi ? 'Model viết chữ' : 'Text model'} htmlFor="ai-model">
              <input
                id="ai-model"
                list="ai-model-options"
                autoComplete="off"
                spellCheck={false}
                placeholder={preset?.defaultModel || 'model-id'}
                value={draft.model}
                onChange={(e) => patch({ model: e.target.value })}
                className={cn(fieldClass, 'font-mono')}
              />
            </FieldLabel>
            <FieldLabel
              label={vi ? 'Model đọc ảnh phiếu (tuỳ chọn)' : 'Image model (optional)'}
              htmlFor="ai-vision-model"
              hint={vi ? 'Bỏ trống = dùng model viết chữ. Model này phải đọc được ảnh.' : 'Empty = use the text model. Must accept images.'}
            >
              <input
                id="ai-vision-model"
                list="ai-model-options"
                autoComplete="off"
                spellCheck={false}
                placeholder={preset?.defaultVisionModel || (vi ? 'giống model viết chữ' : 'same as text model')}
                value={draft.visionModel}
                onChange={(e) => patch({ visionModel: e.target.value })}
                className={cn(fieldClass, 'font-mono')}
              />
            </FieldLabel>
            <datalist id="ai-model-options">
              {(test?.models ?? []).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <div className="max-w-[12rem]">
              <FieldLabel label={vi ? 'Chờ tối đa (giây)' : 'Timeout (seconds)'} htmlFor="ai-timeout">
                <input
                  id="ai-timeout"
                  type="number"
                  min={3}
                  max={120}
                  inputMode="numeric"
                  value={draft.timeoutSec}
                  onChange={(e) => patch({ timeoutSec: Number(e.target.value) })}
                  className={fieldClass}
                />
              </FieldLabel>
            </div>
            <TestResult test={test} model={draft.model.trim()} visionModel={draft.visionModel.trim()} vi={vi} />
          </SettingsRow>
        </>
      )}
    </SettingsCard>
  )
}

function TestResult({
  test,
  model,
  visionModel,
  vi,
}: {
  test: AiConnectionTest | null
  model: string
  visionModel: string
  vi: boolean
}) {
  if (!test) return null
  if (!test.ok) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-600/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-800 dark:text-rose-300">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {test.error ?? (vi ? 'Không kết nối được.' : 'Connection failed.')}
      </p>
    )
  }
  return (
    <div role="status" className="space-y-1 rounded-lg border border-emerald-600/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
      <p className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        {vi
          ? `Kết nối được · ${String(test.latencyMs)} ms · ${String(test.models.length)} model`
          : `Connected · ${String(test.latencyMs)} ms · ${String(test.models.length)} models`}
      </p>
      {test.modelFound === false ? (
        <p className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {vi
            ? `Không thấy "${model}" trong danh sách — gõ vào ô model để chọn tên đúng.`
            : `"${model}" is not in the list — type in the model field to pick a valid one.`}
        </p>
      ) : null}
      {visionModel && test.models.length > 0 && !test.models.includes(visionModel) ? (
        <p className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {vi
            ? `Không thấy model đọc ảnh "${visionModel}" — đọc phiếu nhà cung cấp sẽ lỗi.`
            : `Image model "${visionModel}" not found — receipt reading will fail.`}
        </p>
      ) : null}
    </div>
  )
}

const REVEAL_SECONDS = 60

/** Xem key thật đang dùng: nhập lại mật khẩu → hiện 60 giây → tự ẩn. Mỗi lần xem BE đều ghi lịch sử. */
function RevealKey({ vi }: { vi: boolean }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<RevealedAiKey | null>(null)
  const [left, setLeft] = useState(0)
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => () => {
    if (timer.current) window.clearInterval(timer.current)
  }, [])

  function hide() {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    setRevealed(null)
    setCopied(false)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const key = await revealAiKey(password)
      setRevealed(key)
      setOpen(false)
      setPassword('')
      setLeft(REVEAL_SECONDS)
      timer.current = window.setInterval(() => {
        setLeft((n) => {
          if (n <= 1) {
            hide()
            return 0
          }
          return n - 1
        })
      }, 1000)
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  if (revealed) {
    return (
      <div className="space-y-2 rounded-lg border border-amber-600/30 bg-amber-500/10 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
          <span>
            {revealed.source === 'env'
              ? vi ? 'Key trong .env của server' : 'Key from the server .env'
              : vi ? 'Key lưu trên web' : 'Key saved here'}
            {' · '}
            {vi ? `tự ẩn sau ${String(left)} giây` : `hides in ${String(left)}s`}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(revealed.apiKey).then(() => setCopied(true))
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600/40"
            >
              {copied ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? (vi ? 'Đã chép' : 'Copied') : vi ? 'Sao chép' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={hide}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600/40"
            >
              <EyeOff className="h-3.5 w-3.5" aria-hidden />
              {vi ? 'Ẩn' : 'Hide'}
            </button>
          </div>
        </div>
        <code className="block font-mono text-sm break-all text-ink select-all">{revealed.apiKey}</code>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <KeyRound className="h-3.5 w-3.5" aria-hidden />
        {vi ? 'Xem key đang dùng' : 'Show the key in use'}
      </button>
    )
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-2 rounded-lg border border-hairline bg-canvas px-3 py-3">
      <label htmlFor="reveal-password" className="block text-xs font-medium text-ink-muted">
        {vi ? 'Nhập lại mật khẩu tài khoản để xem key' : 'Re-enter your password to view the key'}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="reveal-password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={cn(fieldClass, 'min-w-0 flex-1 basis-48')}
        />
        <button
          type="submit"
          disabled={busy || !password}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {vi ? 'Xem key' : 'Show key'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setPassword('')
            setError(null)
          }}
          className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          {vi ? 'Huỷ' : 'Cancel'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : (
        <p className="text-xs text-ink-subtle">
          {vi ? 'Mỗi lần xem đều được ghi vào Lịch sử thao tác.' : 'Every view is recorded in the activity history.'}
        </p>
      )}
    </form>
  )
}
