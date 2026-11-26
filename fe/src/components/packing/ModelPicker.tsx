import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bounds, Center, OrbitControls, useGLTF } from '@react-three/drei'
import { Loader2 } from 'lucide-react'
import {
  createPrimitiveModel,
  getModelSuggestions,
  listProductModels,
  distortion,
  modelFitsCategory,
  type ModelSuggestion,
  type ProductModelRow,
} from '../../api/product-models.api'
import { buildPrimitive, type PrimitiveSpec } from './scene/primitives'
import { Button } from '../ui/Button'
import { Input } from '../ui/input'

/** AOFP-352 — ngưỡng méo (spec Q13): giãn lệch trục quá 35% thì nhắc kiểm tra hình. */
const DISTORTION_NOTE = 0.35

const SHAPES: { value: PrimitiveSpec['shape']; vi: string; en: string }[] = [
  { value: 'box', vi: 'Hộp', en: 'Box' },
  { value: 'cylinder', vi: 'Hũ / lon (trụ)', en: 'Jar / can' },
  { value: 'bottle', vi: 'Chai', en: 'Bottle' },
  { value: 'tube', vi: 'Tuýp', en: 'Tube' },
]

const REASON: Record<ModelSuggestion['reason'], { vi: string; en: string }> = {
  same_product: { vi: 'cùng hàng ở sàn khác', en: 'same product, other channel' },
  same_style: { vi: 'cùng mã mẫu', en: 'same style' },
  category: { vi: 'theo loại', en: 'by category' },
}

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

function GlbPreview({ url }: { url: string }): ReactNode {
  const gltf = useGLTF(url)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf])
  return <primitive object={scene} />
}

function PrimitivePreview({ spec, dims }: { spec: PrimitiveSpec; dims: [number, number, number] }): ReactNode {
  const object = useMemo(() => buildPrimitive(spec), [spec])
  const [l, w, h] = dims.map((d) => (d > 0 ? d : 10))
  return <primitive object={object} scale={[l ?? 10, h ?? 10, w ?? 10]} />
}

export function ModelPreview({ model, dimsCm }: { model: ProductModelRow; dimsCm: [number, number, number] }): ReactNode {
  const snap = model.snapshot
  return (
    <div className="h-40 w-full overflow-hidden rounded-md border border-hairline bg-surface-2">
      <PreviewBoundary key={`${model.id}:${String(model.version)}`}>
        <Canvas camera={{ position: [1.2, 1, 1.4], fov: 40 }} dpr={[1, 1.5]}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[2, 3, 2]} intensity={1.2} />
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.3}>
              <Center>
                {snap.primitive ? (
                  <PrimitivePreview spec={snap.primitive} dims={dimsCm} />
                ) : snap.url ? (
                  <GlbPreview url={snap.url} />
                ) : null}
              </Center>
            </Bounds>
          </Suspense>
          <OrbitControls makeDefault enablePan={false} />
        </Canvas>
      </PreviewBoundary>
    </div>
  )
}

/**
 * AOFP-352 — chọn mô hình 3D cho SKU trong form hồ sơ đóng gói. Mô hình chỉ quyết định dáng;
 * kích thước luôn lấy theo số đo SKU. Quần áo chỉ chọn được mô hình có bước gập.
 */
export function ModelPicker({
  vi,
  productMasterId,
  sellerSku,
  category,
  dimsCm,
  value,
  onChange,
}: {
  vi: boolean
  productMasterId: string
  sellerSku: string
  category: string
  dimsCm: [number, number, number]
  value: string | null
  onChange: (modelId: string | null) => void
}): ReactNode {
  const [models, setModels] = useState<ProductModelRow[]>([])
  const [suggestions, setSuggestions] = useState<ModelSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [shape, setShape] = useState<PrimitiveSpec['shape']>('bottle')
  const [color, setColor] = useState('#e2e8f0')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([listProductModels(), getModelSuggestions(productMasterId).catch(() => [])])
      .then(([list, sugg]) => {
        if (!alive) return
        setModels(list.items)
        setSuggestions(sugg)
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [productMasterId])

  const fitting = useMemo(() => models.filter((m) => modelFitsCategory(m, category)), [models, category])
  const fittingSuggestions = useMemo(() => suggestions.filter((s) => modelFitsCategory(s.model, category)), [suggestions, category])
  const selected = models.find((m) => m.id === value) ?? suggestions.find((s) => s.model.id === value)?.model ?? null
  const selectedFits = selected ? modelFitsCategory(selected, category) : false

  // Chưa chọn (hoặc đổi loại làm mô hình cũ không hợp) → lấy gợi ý đầu tiên; người dùng vẫn đổi được.
  useEffect(() => {
    if (loading) return
    if (value && selectedFits) return
    const first = fittingSuggestions[0]?.model.id ?? fitting.find((m) => m.source === 'category' && m.categoryKey === category)?.id ?? null
    if (first !== value) onChange(first)
  }, [loading, value, selectedFits, fittingSuggestions, fitting, category, onChange])

  const canPrimitive = category !== 'bag' && !['t_shirt', 'shirt', 'jacket', 'shorts', 'trousers', 'dress'].includes(category)
  const warp = selected && selected.source !== 'category' && selected.kind === 'rigid' ? distortion(selected.bboxM, dimsCm) : 0

  async function createShape(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const label = SHAPES.find((s) => s.value === shape)?.vi ?? shape
      const created = await createPrimitiveModel({ name: `${label} – ${sellerSku}`, shape, params: {}, body_color: color })
      setModels((prev) => [created, ...prev])
      onChange(created.id)
      setCreating(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 sm:col-span-4 rounded-md border border-hairline p-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1 space-y-1 text-[11px] text-ink-muted">
          {vi ? 'Mô hình 3D (chỉ là dáng — kích thước theo số đo)' : '3D model (shape only — sized by measurements)'}
          <select
            className="h-9 w-full rounded-md border border-hairline bg-surface px-2 text-xs text-ink"
            value={value ?? ''}
            disabled={loading}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">{loading ? (vi ? 'Đang tải…' : 'Loading…') : vi ? '— Chọn mô hình —' : '— Pick a model —'}</option>
            {fittingSuggestions.length > 0 ? (
              <optgroup label={vi ? 'Gợi ý' : 'Suggested'}>
                {fittingSuggestions.map((s) => (
                  <option key={`s-${s.model.id}`} value={s.model.id}>
                    {s.model.name} · {vi ? REASON[s.reason].vi : REASON[s.reason].en}
                    {s.sellerSku ? ` (${s.sellerSku})` : ''}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label={vi ? 'Thư viện' : 'Library'}>
              {fitting
                .filter((m) => !fittingSuggestions.some((s) => s.model.id === m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.sourceLabel}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        {canPrimitive ? (
          <Button type="button" variant="secondary" className="h-9 text-xs" onClick={() => setCreating((v) => !v)}>
            {vi ? 'Dựng hình cơ bản' : 'Build basic shape'}
          </Button>
        ) : null}
      </div>
      {creating ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md bg-surface-2/60 p-2">
          <label className="space-y-1 text-[11px] text-ink-muted">
            {vi ? 'Dáng' : 'Shape'}
            <select
              className="h-9 rounded-md border border-hairline bg-surface px-2 text-xs text-ink"
              value={shape}
              onChange={(e) => setShape(e.target.value as PrimitiveSpec['shape'])}
            >
              {SHAPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {vi ? s.vi : s.en}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[11px] text-ink-muted">
            {vi ? 'Màu' : 'Color'}
            <Input type="color" className="h-9 w-14 p-1" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <Button type="button" className="h-9 text-xs" disabled={busy} onClick={() => void createShape()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {vi ? 'Tạo và chọn' : 'Create & select'}
          </Button>
          <span className="text-[11px] text-ink-muted">
            {vi ? 'Chỉnh tỉ lệ cổ/vai ở tab Mô hình 3D.' : 'Fine-tune proportions in the 3D models tab.'}
          </span>
        </div>
      ) : null}
      {selected ? <ModelPreview model={selected} dimsCm={dimsCm} /> : null}
      {selected && warp > DISTORTION_NOTE ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          {vi
            ? `Mô hình bị kéo giãn ${String(Math.round(warp * 100))}% để khớp số đo — kiểm tra hình còn giống hàng thật không.`
            : `Model stretched ${String(Math.round(warp * 100))}% to match — check it still looks right.`}
        </p>
      ) : null}
      {error ? <p className="text-[11px] text-red-600">{error}</p> : null}
    </div>
  )
}
