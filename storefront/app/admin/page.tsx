'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  ApiError, deleteAdminProduct, getAdminProduct, getAdminProducts, getCategories,
  getCurrentAdmin, logoutAdmin, saveAdminProduct, uploadAdminImage,
} from '@/lib/api-client'
import { siteConfig } from '@/lib/site-config'
import type { AdminProduct, Category, SaveAdminProduct } from '@/types/storefront'

const statusLabels = { active: 'Đang bán', draft: 'Bản nháp', hidden: 'Đã ẩn' }
const newVariant = () => ({ color: '', size: '', price: 0, quantityOnHand: 0 })
const newProduct = (): SaveAdminProduct => ({
  name: '', description: '', categoryId: null, thumbnailUrl: '', galleryImages: [],
  status: 'active', isFeatured: false, variants: [newVariant()],
})

export default function AdminPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [draft, setDraft] = useState<SaveAdminProduct | null>(null)
  const [editing, setEditing] = useState<AdminProduct | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AdminProduct | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function report(error: unknown) {
    if (error instanceof ApiError && error.status === 401) { router.replace('/admin/login'); return }
    setError(error instanceof Error ? error.message : 'Thao tác chưa thành công')
  }

  async function load() {
    setLoading(true); setError('')
    try {
      const admin = await getCurrentAdmin()
      setEmail(admin.email)
      const [items, categories] = await Promise.all([getAdminProducts(), getCategories()])
      setProducts(items); setCategories(categories)
    } catch (error) { report(error) }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, []) // Authentication is checked again by every admin API request.

  function updateDraft(patch: Partial<SaveAdminProduct>) {
    setDraft((current) => current ? { ...current, ...patch } : current)
  }

  async function edit(product: AdminProduct) {
    setBusy(true); setError(''); setNotice(''); setPendingDelete(null)
    try {
      const current = await getAdminProduct(product.id)
      setEditing(current)
      setDraft({
        name: current.name, description: current.description, categoryId: current.categoryId ?? null,
        thumbnailUrl: current.thumbnailUrl,
        galleryImages: [...new Set([current.thumbnailUrl, ...current.galleryImages])],
        status: current.status, isFeatured: current.isFeatured,
        variants: current.variants.map((variant) => ({
          id: variant.id, color: variant.color ?? '', size: variant.size ?? '',
          price: variant.price, quantityOnHand: variant.quantityOnHand,
        })),
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) { report(error) }
    finally { setBusy(false) }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    if (!draft.thumbnailUrl) { setError('Vui lòng tải ít nhất một ảnh sản phẩm'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const product = await saveAdminProduct(draft, editing?.id)
      setProducts((items) => editing ? items.map((item) => item.id === product.id ? product : item) : [product, ...items])
      setDraft(null); setEditing(null); setNotice('Đã lưu sản phẩm')
    } catch (error) { report(error) }
    finally { setBusy(false) }
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length || !draft) return
    if (draft.galleryImages.length + files.length > 30) { setError('Tối đa 30 ảnh cho một sản phẩm'); return }
    if (files.some((file) => file.size === 0 || file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      setError('Chọn ảnh JPEG, PNG hoặc WebP, tối đa 5 MB mỗi ảnh'); return
    }
    setUploading(true); setError('')
    try {
      for (const file of files) {
        const url = await uploadAdminImage(file)
        setDraft((current) => current ? {
          ...current, thumbnailUrl: current.thumbnailUrl || url, galleryImages: [...current.galleryImages, url],
        } : current)
      }
    } catch (error) { report(error) }
    finally { setUploading(false) }
  }

  async function remove() {
    if (!pendingDelete) return
    setBusy(true); setError(''); setNotice('')
    try {
      await deleteAdminProduct(pendingDelete.id)
      setProducts((items) => items.filter((item) => item.id !== pendingDelete.id))
      setPendingDelete(null); setNotice('Đã xóa sản phẩm')
    } catch (error) { report(error) }
    finally { setBusy(false) }
  }

  async function signOut() {
    setBusy(true); setError('')
    try { await logoutAdmin(); router.replace('/admin/login') }
    catch (error) { report(error); setBusy(false) }
  }

  const locked = busy || uploading
  const visible = products.filter((product) =>
    (filter === 'all' || product.status === filter) &&
    [product.name, ...product.variants.map((variant) => variant.sku)].some((text) => text.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'))),
  )

  if (!email) return <main className="page-shell" aria-busy={loading}>
    {loading ? <p>Đang kiểm tra đăng nhập…</p> : <div role="alert"><p className="error">{error}</p><button className="button" onClick={() => void load()}>Thử lại</button><p><Link href="/admin/login">Đăng nhập admin</Link></p></div>}
  </main>

  return <>
    <header className="admin-header"><Link className="brand" href="/admin">{siteConfig.name}</Link><span>Quản lý sản phẩm</span>
      <nav><Link href="/shop">Xem cửa hàng ↗</Link><span>{email}</span><button type="button" className="admin-secondary" disabled={locked} onClick={() => void signOut()}>Đăng xuất</button></nav>
    </header>
    <main className="admin-main" aria-busy={loading || locked}>
      <div className="admin-title"><div><span className="eyebrow">Quản trị cửa hàng</span><h1>Sản phẩm</h1><p>{products.length} sản phẩm</p></div>
        {!draft && <button className="button" disabled={locked || loading} onClick={() => { setDraft(newProduct()); setEditing(null); setPendingDelete(null); setError(''); setNotice('') }}>+ Thêm sản phẩm</button>}
      </div>
      {error && <div className="admin-error" role="alert">{error}{!draft && !pendingDelete && <button className="admin-secondary" disabled={locked} onClick={() => void load()}>Tải lại</button>}</div>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}

      {draft && <form className="admin-editor" onSubmit={save}>
        <h2>{editing ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h2>
        <fieldset disabled={locked}>
          <div className="form-grid">
            <label className="form-field full">Tên sản phẩm<input required maxLength={200} value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} /></label>
            <label className="form-field">Danh mục<select value={draft.categoryId ?? ''} onChange={(event) => updateDraft({ categoryId: event.target.value || null })}><option value="">Chưa phân loại</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="form-field">Trạng thái<select value={draft.status} onChange={(event) => updateDraft({ status: event.target.value as SaveAdminProduct['status'] })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="form-field full">Mô tả<textarea maxLength={10000} value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} /></label>
          </div>
          <label className="admin-checkbox"><input type="checkbox" checked={draft.isFeatured} onChange={(event) => updateDraft({ isFeatured: event.target.checked })} />Sản phẩm nổi bật trên trang chủ</label>
          <h3>Ảnh sản phẩm</h3><p className="admin-hint">JPEG, PNG hoặc WebP · tối đa 5 MB/ảnh</p>
          <label className="form-field">Thêm ảnh<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void upload(event)} /></label>
          <div className="admin-images">{draft.galleryImages.map((url, index) => <div className="admin-image" key={url}>
            <img src={url} alt={`Ảnh sản phẩm ${index + 1}`} width={140} height={170} />
            <button type="button" className="admin-secondary" aria-pressed={draft.thumbnailUrl === url} onClick={() => updateDraft({ thumbnailUrl: url })}>{draft.thumbnailUrl === url ? '✓ Ảnh đại diện' : 'Đặt làm đại diện'}</button>
            <button type="button" className="admin-danger" aria-label={`Bỏ ảnh ${index + 1}`} onClick={() => {
              const images = draft.galleryImages.filter((image) => image !== url)
              updateDraft({ galleryImages: images, thumbnailUrl: draft.thumbnailUrl === url ? images[0] ?? '' : draft.thumbnailUrl })
            }}>Bỏ ảnh</button>
          </div>)}</div>
          <h3>Size, màu, giá và tồn kho</h3>
          <p className="admin-hint">Để trống size/màu nếu sản phẩm chỉ có một loại. SKU được tạo tự động. Ô tồn kho ghi &quot;Kho OptiPack&quot; do kho OptiPack quản lý — chỉ xem, nhập/kiểm kê ở OptiPack.</p>
          <div className="admin-table-wrap"><table className="admin-variants"><thead><tr><th>SKU</th><th>Màu</th><th>Size</th><th>Giá (₫)</th><th>Tồn kho</th><th>Giữ chỗ</th><th><span className="admin-sr-only">Thao tác</span></th></tr></thead>
            <tbody>{draft.variants.map((variant, index) => {
              const original = editing?.variants.find((item) => item.id === variant.id)
              function change(patch: Partial<SaveAdminProduct['variants'][number]>) {
                setDraft((current) => current ? { ...current, variants: current.variants.map((item, row) => row === index ? { ...item, ...patch } : item) } : current)
              }
              return <tr key={variant.id ?? `new-${index}`}>
                <td className="admin-sku">{original?.sku ?? 'Tự động'}</td>
                <td><input aria-label={`Màu biến thể ${index + 1}`} maxLength={100} value={variant.color} onChange={(event) => change({ color: event.target.value })} /></td>
                <td><input aria-label={`Size biến thể ${index + 1}`} maxLength={100} value={variant.size} onChange={(event) => change({ size: event.target.value })} /></td>
                <td><input aria-label={`Giá biến thể ${index + 1}`} required type="number" min={0} step={1} value={variant.price} onChange={(event) => change({ price: Number(event.target.value) })} /></td>
                <td>{original?.stockSource === 'optipack'
                  // 21/10/2026 (phương án A) — tồn do kho OptiPack đẩy sang; BE bỏ qua số nhập ở đây.
                  ? <span className="admin-stock-managed" title={original.stockSyncedAt ? `Cập nhật ${new Date(original.stockSyncedAt).toLocaleString('vi-VN')}` : undefined}>{original.quantityOnHand}<small>Kho OptiPack</small></span>
                  : <input aria-label={`Tồn kho biến thể ${index + 1}`} required type="number" min={original?.reservedQuantity ?? 0} step={1} value={variant.quantityOnHand} onChange={(event) => change({ quantityOnHand: Number(event.target.value) })} />}</td>
                <td>{original?.reservedQuantity ?? 0}</td>
                <td><button type="button" className="admin-danger" disabled={draft.variants.length === 1} aria-label={`Bỏ biến thể ${index + 1}`} onClick={() => updateDraft({ variants: draft.variants.filter((_, row) => row !== index) })}>Bỏ</button></td>
              </tr>
            })}</tbody></table></div>
          <button type="button" className="admin-secondary" disabled={draft.variants.length >= 100} onClick={() => updateDraft({ variants: [...draft.variants, newVariant()] })}>+ Thêm biến thể</button>
        </fieldset>
        <div className="admin-actions"><button className="button" disabled={locked}>{uploading ? 'Đang tải ảnh…' : busy ? 'Đang lưu…' : 'Lưu sản phẩm'}</button>
          <button type="button" className="admin-secondary" disabled={locked} onClick={() => { setDraft(null); setEditing(null); setError('') }}>Hủy</button>
        </div>
      </form>}

      {pendingDelete && <div className="admin-delete" role="alert">
        <p>Xóa sản phẩm <strong>{pendingDelete.name}</strong> khỏi cửa hàng? Dữ liệu đơn cũ vẫn được giữ.</p>
        <div className="admin-actions"><button className="admin-danger" disabled={locked} onClick={() => void remove()}>{busy ? 'Đang xóa…' : 'Xác nhận xóa'}</button><button className="admin-secondary" disabled={locked} onClick={() => setPendingDelete(null)}>Hủy</button></div>
      </div>}

      {!draft && <>
        <div className="admin-toolbar"><label className="form-field">Tìm sản phẩm<input type="search" placeholder="Tên hoặc SKU…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <label className="form-field">Trạng thái<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Tất cả</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        {loading ? <p role="status">Đang tải sản phẩm…</p> : <div className="admin-table-wrap"><table className="admin-products"><thead><tr><th>Sản phẩm</th><th>Giá từ</th><th>Tồn bán được</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
          {visible.map((product) => <tr key={product.id}>
            <td><div className="admin-product-cell"><img src={product.thumbnailUrl} alt="" width={56} height={70} /><div><strong>{product.name}</strong><span>{product.categoryName ?? 'Chưa phân loại'} · {product.variants.length} biến thể</span></div></div></td>
            <td>{product.variants.length ? `${Math.min(...product.variants.map((variant) => variant.price)).toLocaleString('vi-VN')}₫` : '—'}</td>
            <td>{product.variants.reduce((sum, variant) => sum + variant.availableQuantity, 0)}</td>
            <td><span className={`admin-status ${product.status}`}>{statusLabels[product.status]}</span></td>
            <td><div className="admin-actions"><button className="admin-secondary" disabled={locked} onClick={() => void edit(product)}>Sửa</button><button className="admin-danger" disabled={locked} onClick={() => { setPendingDelete(product); setError(''); setNotice('') }}>Xóa</button></div></td>
          </tr>)}
          {!visible.length && <tr><td colSpan={5} className="empty">{products.length ? 'Không tìm thấy sản phẩm phù hợp.' : 'Chưa có sản phẩm. Bấm Thêm sản phẩm để bắt đầu.'}</td></tr>}
        </tbody></table></div>}
      </>}
    </main>
  </>
}
