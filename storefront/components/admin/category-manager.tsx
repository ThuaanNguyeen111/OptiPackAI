'use client'

import { useState } from 'react'
import { ApiError, hideAdminCategory, saveAdminCategory } from '@/lib/api-client'
import type { AdminCategory, SaveAdminCategory, SkuOptions } from '@/types/storefront'

type Props = {
  categories: AdminCategory[]
  skuOptions: SkuOptions | null
  onChanged: (categories: AdminCategory[]) => void
  onUnauthorized: () => void
}

const emptyDraft = (): SaveAdminCategory => ({ name: '', skuCategoryCode: null, sortOrder: 0, isActive: true })

/**
 * 22/10/2026 — Quản lý danh mục hiển thị của website. Mỗi danh mục nên nối 1 danh mục cấp 2 của
 * OptiPack: sản phẩm trong danh mục sẽ tự lấy mã đó làm phần đầu SKU, nên tên danh mục website
 * và mã kho OptiPack không lệch nhau. "Ẩn" = không xoá (sản phẩm/đơn cũ vẫn tham chiếu).
 */
export function CategoryManager({ categories, skuOptions, onChanged, onUnauthorized }: Props) {
  const [draft, setDraft] = useState<SaveAdminCategory>(emptyDraft())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function fail(err: unknown) {
    if (err instanceof ApiError && err.status === 401) { onUnauthorized(); return }
    setError(err instanceof Error ? err.message : 'Thao tác chưa thành công')
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const saved = await saveAdminCategory({ ...draft, name: draft.name.trim() }, editingId ?? undefined)
      onChanged(editingId ? categories.map((c) => c.id === saved.id ? saved : c) : [...categories, saved])
      setDraft(emptyDraft()); setEditingId(null)
    } catch (err) { fail(err) }
    finally { setBusy(false) }
  }

  async function toggle(category: AdminCategory) {
    setBusy(true); setError('')
    try {
      if (category.isActive) {
        await hideAdminCategory(category.id)
        onChanged(categories.map((c) => c.id === category.id ? { ...c, isActive: false } : c))
      } else {
        const saved = await saveAdminCategory({ name: category.name, isActive: true }, category.id)
        onChanged(categories.map((c) => c.id === saved.id ? saved : c))
      }
    } catch (err) { fail(err) }
    finally { setBusy(false) }
  }

  function edit(category: AdminCategory) {
    setEditingId(category.id)
    setDraft({ name: category.name, skuCategoryCode: category.skuCategoryCode, sortOrder: category.sortOrder, isActive: category.isActive })
  }

  const codeName = (code: string | null) => skuOptions?.categories.find((c) => c.code === code)?.name

  return <section className="admin-categories" aria-labelledby="admin-categories-title">
    <h2 id="admin-categories-title">Danh mục</h2>
    <p className="admin-hint">Nối mỗi danh mục với danh mục cấp 2 của kho OptiPack — sản phẩm trong danh mục sẽ dùng đúng mã đó làm phần đầu SKU (VD ATHUN-005-DEN-M). Danh mục còn sản phẩm đang bán thì không ẩn được.</p>
    {error && <div className="admin-error" role="alert">{error}</div>}
    <form className="form-grid" onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy} style={{ display: 'contents' }}>
        <label className="form-field">Tên danh mục<input required maxLength={100} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="form-field">Danh mục OptiPack (cấp 2)<select value={draft.skuCategoryCode ?? ''} onChange={(e) => setDraft({ ...draft, skuCategoryCode: e.target.value || null })}>
          <option value="">Chưa nối</option>
          {skuOptions?.categories.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
        </select></label>
        <label className="form-field">Thứ tự<input type="number" min={0} max={9999} value={draft.sortOrder ?? 0} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} /></label>
        <div className="admin-actions">
          <button className="button" type="submit">{editingId ? 'Lưu danh mục' : '+ Thêm danh mục'}</button>
          {editingId && <button className="admin-secondary" type="button" onClick={() => { setEditingId(null); setDraft(emptyDraft()) }}>Hủy</button>}
        </div>
      </fieldset>
    </form>
    <div role="table" aria-label="Danh sách danh mục">
      {categories.map((category) => <div className="admin-category-row" role="row" key={category.id}>
        <span role="cell"><strong>{category.name}</strong>{!category.isActive && <em> · Đã ẩn</em>}</span>
        <span role="cell">{category.skuCategoryCode
          ? `${category.skuCategoryCode}${codeName(category.skuCategoryCode) ? ` · ${codeName(category.skuCategoryCode) ?? ''}` : ''}`
          : <span className="admin-warning">Chưa nối OptiPack</span>}</span>
        <span role="cell">{category.productCount} SP</span>
        <span role="cell">Thứ tự {category.sortOrder}</span>
        <span role="cell" className="admin-actions">
          <button className="admin-secondary" type="button" disabled={busy} onClick={() => edit(category)}>Sửa</button>
          <button className={category.isActive ? 'admin-danger' : 'admin-secondary'} type="button" disabled={busy} onClick={() => void toggle(category)}>{category.isActive ? 'Ẩn' : 'Hiện lại'}</button>
        </span>
      </div>)}
      {!categories.length && <p className="empty">Chưa có danh mục.</p>}
    </div>
  </section>
}
