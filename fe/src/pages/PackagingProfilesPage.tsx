import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Ruler } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import { confirmProductProfile, listPackagingBags, listProductProfiles } from '../api/packaging.api'
import { formatApiError } from '../lib/api'
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  type PackagingBag,
  type ProductCategory,
  type ProductProfile,
} from '../types/packaging'

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900'
const card = 'rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-surface-1'

type Filter = 'needs_measurement' | 'ready'

type FormState = {
  length: string
  width: string
  height: string
  weight: string
  fragile: boolean
  orientation: 'any' | 'upright_only'
  maxStack: string
  category: ProductCategory | ''
  zipBag: string
  zipBagFolded: boolean
  canFold: boolean
}

function initialForm(p: ProductProfile): FormState {
  // Ưu tiên số đã xác nhận; chưa có thì gợi ý số Lazada khai (phải đo lại).
  const d = p.dimension ?? p.marketplaceDimension
  const str = (n: number | undefined | null) => (n === undefined || n === null ? '' : String(n))
  return {
    length: str(d?.lengthCm),
    width: str(d?.widthCm),
    height: str(d?.heightCm),
    weight: str(d?.weightKg),
    fragile: p.isFragile ?? false,
    orientation: p.orientationRule ?? 'any',
    maxStack: str(p.maxStackLoadKg),
    category: p.productCategory ?? '',
    zipBag: p.zipBagCode ?? '',
    zipBagFolded: p.zipBagFolded,
    canFold: p.canFoldInHalf,
  }
}

/**
 * /app/inventory/packaging-profiles — kho đo SKU SAU KHI gấp/bọc (giày đo
 * nguyên hộp) và xác nhận hồ sơ. Engine đóng gói chỉ tính được SKU `ready`.
 */
export function PackagingProfilesPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [filter, setFilter] = useState<Filter>('needs_measurement')
  const [profiles, setProfiles] = useState<ProductProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [bags, setBags] = useState<PackagingBag[]>([])

  useEffect(() => {
    listPackagingBags()
      .then(setBags)
      .catch(() => {
        // Không tải được danh mục túi: vẫn xác nhận hồ sơ được, chỉ không chọn túi.
        setBags([])
      })
  }, [])

  const refresh = useCallback(async (status: Filter) => {
    try {
      const rows = await listProductProfiles(status)
      setProfiles(rows)
      setError(null)
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    listProductProfiles(filter)
      .then((rows) => {
        if (!cancelled) setProfiles(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatApiError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filter])

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Hồ sơ đóng gói SKU' : 'SKU packaging profiles' },
        ]}
      />
      <main className="flex-1 overflow-y-auto bg-[#F9FAFB] dark:bg-[#0B0E14]">
        <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {vi
              ? 'Đo kích thước SAU KHI gấp/bọc (giày đo nguyên hộp), cân gồm cả lớp bọc. Nếu dùng túi zip: đo gói đã cho vào túi (và đã gập đôi nếu có). Số Lazada khai chỉ để gợi ý — phải đo lại. Engine đóng gói chỉ dùng SKU đã xác nhận.'
              : 'Measure after folding/wrapping (shoes in their box). With a zip bag, measure the bagged (and folded) pack. Marketplace numbers are hints only. The packing engine only uses confirmed SKUs.'}
          </p>

          <div className="flex gap-2">
            {(['needs_measurement', 'ready'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  setLoading(true)
                  setOpenId(null)
                  setFilter(status)
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  filter === status
                    ? 'border-[#2563eb] bg-blue-50 text-[#1d4ed8] dark:bg-blue-950/40 dark:text-blue-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {status === 'needs_measurement' ? (vi ? 'Cần đo' : 'Needs measuring') : vi ? 'Đã xác nhận' : 'Confirmed'}
              </button>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className={card}>
            {loading ? (
              <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {vi ? 'Đang tải…' : 'Loading…'}
              </div>
            ) : profiles.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">
                {filter === 'needs_measurement'
                  ? vi
                    ? 'Không còn SKU nào cần đo.'
                    : 'No SKU needs measuring.'
                  : vi
                    ? 'Chưa có SKU nào được xác nhận.'
                    : 'No confirmed SKU yet.'}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {profiles.map((p) => (
                  <li key={p.id} className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenId(openId === p.id ? null : p.id)
                      }}
                      className="flex w-full items-center gap-3 text-left text-sm"
                    >
                      <Ruler className="h-4 w-4 text-slate-400" />
                      <span className="font-medium text-slate-800 dark:text-slate-100">{p.sellerSku}</span>
                      <span className="text-xs text-slate-400">{p.shopId}</span>
                      {p.packagingProfileStatus === 'ready' && p.dimension && (
                        <span className="ml-auto text-xs text-slate-500">
                          {p.dimension.lengthCm}×{p.dimension.widthCm}×{p.dimension.heightCm} cm · {p.dimension.weightKg} kg
                        </span>
                      )}
                    </button>
                    {openId === p.id && (
                      <ProfileForm
                        profile={p}
                        bags={bags}
                        vi={vi}
                        onSaved={() => {
                          setOpenId(null)
                          void refresh(filter)
                        }}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </>
  )
}

function ProfileForm({
  profile,
  bags,
  vi,
  onSaved,
}: {
  profile: ProductProfile
  bags: PackagingBag[]
  vi: boolean
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(profile))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const nums = [form.length, form.width, form.height, form.weight].map(Number)
  const valid =
    nums.every((n) => Number.isFinite(n) && n > 0) &&
    (form.maxStack === '' || Number(form.maxStack) >= 0) &&
    form.category !== ''

  const save = async () => {
    if (form.category === '') return
    setSaving(true)
    setError(null)
    try {
      await confirmProductProfile(profile.id, {
        length_cm: Number(form.length),
        width_cm: Number(form.width),
        height_cm: Number(form.height),
        weight_kg: Number(form.weight),
        is_fragile: form.fragile,
        orientation_rule: form.orientation,
        max_stack_load_kg: form.maxStack === '' ? null : Number(form.maxStack),
        product_category: form.category,
        zip_bag_code: form.zipBag === '' ? null : form.zipBag,
        zip_bag_folded: form.zipBag !== '' && form.zipBagFolded,
        can_fold_in_half: form.category !== 'shoes' && form.canFold,
      })
      onSaved()
    } catch (err: unknown) {
      setError(formatApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const md = profile.marketplaceDimension
  return (
    <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-900/60">
      {md && (
        <p className="text-slate-500">
          {vi ? 'Lazada khai' : 'Marketplace'}: {md.lengthCm ?? '?'}×{md.widthCm ?? '?'}×{md.heightCm ?? '?'} cm ·{' '}
          {md.weightKg ?? '?'} kg {vi ? '(chỉ tham khảo)' : '(reference only)'}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-slate-600 dark:text-slate-300">{vi ? 'Loại sản phẩm *' : 'Product type *'}</span>
          <select
            value={form.category}
            onChange={(e) => {
              set('category', e.target.value as FormState['category'])
            }}
            className={inputClass}
          >
            <option value="">{vi ? '— Chọn loại —' : '— Select —'}</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {vi ? PRODUCT_CATEGORY_LABELS[c].vi : PRODUCT_CATEGORY_LABELS[c].en}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-slate-600 dark:text-slate-300">{vi ? 'Túi zip bọc hàng' : 'Zip bag'}</span>
          <select
            value={form.zipBag}
            onChange={(e) => {
              set('zipBag', e.target.value)
            }}
            className={inputClass}
          >
            <option value="">{vi ? 'Không dùng túi' : 'No bag'}</option>
            {bags.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name} ({b.widthMm / 10}×{b.lengthMm / 10} cm)
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            disabled={form.zipBag === ''}
            checked={form.zipBag !== '' && form.zipBagFolded}
            onChange={(e) => {
              set('zipBagFolded', e.target.checked)
            }}
          />
          <span className="text-slate-600 dark:text-slate-300">{vi ? 'Gập đôi túi sau khi cho hàng vào' : 'Fold the bag in half'}</span>
        </label>
      </div>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          disabled={form.category === 'shoes'}
          checked={form.category !== 'shoes' && form.canFold}
          onChange={(e) => {
            set('canFold', e.target.checked)
          }}
        />
        <span className="text-slate-600 dark:text-slate-300">
          {vi
            ? 'Có thể gập đôi thêm khi cần (hàng mềm) — hệ thống tự tính số đo gập và chỉ gập khi nhờ đó dùng được thùng nhỏ hơn.'
            : 'Can be folded in half when needed (soft goods) — only used when it allows a smaller box.'}
        </span>
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ['length', vi ? 'Dài (cm)' : 'Length (cm)'],
            ['width', vi ? 'Rộng (cm)' : 'Width (cm)'],
            ['height', vi ? 'Cao (cm)' : 'Height (cm)'],
            ['weight', vi ? 'Nặng (kg)' : 'Weight (kg)'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="space-y-1">
            <span className="text-slate-600 dark:text-slate-300">{label}</span>
            <input
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              value={form[key]}
              onChange={(e) => {
                set(key, e.target.value)
              }}
              className={inputClass}
            />
          </label>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-slate-600 dark:text-slate-300">{vi ? 'Hướng đặt' : 'Orientation'}</span>
          <select
            value={form.orientation}
            onChange={(e) => {
              set('orientation', e.target.value as FormState['orientation'])
            }}
            className={inputClass}
          >
            <option value="any">{vi ? 'Xoay tự do (quần áo)' : 'Any (clothing)'}</option>
            <option value="upright_only">{vi ? 'Chỉ đặt đứng (hộp giày)' : 'Upright only (shoe box)'}</option>
          </select>
          {['t_shirt', 'shirt', 'jacket', 'shorts', 'trousers', 'dress'].includes(form.category) && (
            <span className="block text-slate-500">
              {vi ? 'Quần áo luôn được xếp nằm phẳng, không dựng đứng.' : 'Clothing is always packed lying flat.'}
            </span>
          )}
        </label>
        <label className="space-y-1">
          <span className="text-slate-600 dark:text-slate-300">
            {vi ? 'Chịu tải chồng (kg)' : 'Max load on top (kg)'}
          </span>
          <input
            type="number"
            min="0"
            step="0.1"
            placeholder={vi ? 'Trống = không cho đặt lên' : 'Empty = nothing on top'}
            value={form.maxStack}
            onChange={(e) => {
              set('maxStack', e.target.value)
            }}
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            checked={form.fragile}
            onChange={(e) => {
              set('fragile', e.target.checked)
            }}
          />
          <span className="text-slate-600 dark:text-slate-300">{vi ? 'Dễ vỡ / cần chống sốc' : 'Fragile'}</span>
        </label>
      </div>
      {error && <p className="text-red-600">{error}</p>}
      <button
        type="button"
        disabled={!valid || saving}
        onClick={() => void save()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 py-2 font-semibold text-white hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CheckCircle2 className="h-4 w-4" />
        {vi ? 'Xác nhận đã đo' : 'Confirm measured'}
      </button>
    </div>
  )
}
