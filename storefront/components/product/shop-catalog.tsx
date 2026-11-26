'use client'

import { useEffect, useMemo, useState } from 'react'
import { ProductCard } from '@/components/product/product-card'
import { normalizeText, priceRange, totalAvailable } from '@/lib/product-pricing'
import type { Category, Product } from '@/types/storefront'

type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'name'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'featured', label: 'Nổi bật' },
  { value: 'price-asc', label: 'Giá thấp đến cao' },
  { value: 'price-desc', label: 'Giá cao đến thấp' },
  { value: 'name', label: 'Tên A–Z' },
]

function isSortKey(value: string | undefined): value is SortKey {
  return SORT_OPTIONS.some((o) => o.value === value)
}

/** Danh mục trên URL có thể là id, slug hoặc tên ("tops" từ trang chủ). */
function matchesCategory(product: Product, key: string, categories: Category[]): boolean {
  const k = key.toLowerCase()
  const cat = categories.find((c) => c.id === key || c.slug.toLowerCase() === k || c.name.toLowerCase() === k)
  if (cat) return product.categoryId === cat.id || product.categoryName?.toLowerCase() === cat.name.toLowerCase()
  return product.categoryId === key || product.categoryName?.toLowerCase() === k
}

export function ShopCatalog({
  products,
  categories,
  initialCategory,
  initialQuery,
  initialSort,
}: {
  products: Product[]
  categories: Category[]
  initialCategory?: string
  initialQuery?: string
  initialSort?: string
}) {
  const [query, setQuery] = useState(initialQuery ?? '')
  const [category, setCategory] = useState(initialCategory ?? '')
  const [sort, setSort] = useState<SortKey>(isSortKey(initialSort) ? initialSort : 'featured')
  const [inStockOnly, setInStockOnly] = useState(false)

  // Chỉ hiện danh mục đang có sản phẩm, giữ thứ tự của cửa hàng.
  const usedCategories = useMemo(
    () => categories.filter((c) => products.some((p) => matchesCategory(p, c.id, categories))),
    [categories, products],
  )

  // Ghi lại bộ lọc lên URL (không tải lại trang) để chia sẻ / quay lại vẫn giữ.
  useEffect(() => {
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (query.trim()) params.set('q', query.trim())
    if (sort !== 'featured') params.set('sort', sort)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `/shop?${qs}` : '/shop')
  }, [category, query, sort])

  const visible = useMemo(() => {
    const q = normalizeText(query)
    const list = products.filter((p) => {
      if (category && !matchesCategory(p, category, categories)) return false
      if (inStockOnly && totalAvailable(p) === 0) return false
      if (!q) return true
      const haystack = normalizeText([p.name, p.categoryName ?? '', ...p.variants.flatMap((v) => [v.sku, v.color ?? '', v.variantName])].join(' '))
      return q.split(/\s+/).every((word) => haystack.includes(word))
    })
    const byPrice = (p: Product) => priceRange(p).min || Number.MAX_SAFE_INTEGER
    if (sort === 'price-asc') return [...list].sort((a, b) => byPrice(a) - byPrice(b))
    if (sort === 'price-desc') return [...list].sort((a, b) => priceRange(b).min - priceRange(a).min)
    if (sort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    return list
  }, [products, categories, category, query, sort, inStockOnly])

  const categoryKey = category.toLowerCase()
  const activeCategory = category
    ? categories.find((c) => c.id === category || c.slug.toLowerCase() === categoryKey || c.name.toLowerCase() === categoryKey)
    : undefined
  const title = activeCategory?.name ?? (category ? `${category[0]?.toUpperCase() ?? ''}${category.slice(1)}` : 'Tất cả sản phẩm')
  const filtered = Boolean(category || query.trim() || inStockOnly)
  const reset = () => { setCategory(''); setQuery(''); setInStockOnly(false); setSort('featured') }

  return (
    <>
      <div className="page-title shop-heading">
        <span className="eyebrow">AURELLE collection</span>
        <h1>{title}</h1>
      </div>

      <div className="shop-controls">
        <label className="shop-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên sản phẩm, màu hoặc mã SKU"
            aria-label="Tìm sản phẩm"
          />
          {query ? <button type="button" className="shop-search-clear" onClick={() => setQuery('')} aria-label="Xoá từ khoá">×</button> : null}
        </label>

        <div className="shop-chips" role="tablist" aria-label="Danh mục">
          <button type="button" role="tab" aria-selected={!category} className={!category ? 'chip active' : 'chip'} onClick={() => setCategory('')}>Tất cả</button>
          {usedCategories.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={activeCategory?.id === c.id} className={activeCategory?.id === c.id ? 'chip active' : 'chip'} onClick={() => setCategory(c.id)}>
              {c.name}
            </button>
          ))}
        </div>

        <div className="shop-toolbar">
          <span className="shop-count">{visible.length} sản phẩm</span>
          <div className="shop-toolbar-right">
            <label className="shop-toggle">
              <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
              <span>Chỉ hàng còn</span>
            </label>
            <label className="shop-sort">
              <span>Sắp xếp</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sắp xếp">
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>
        </div>
      </div>

      {visible.length ? (
        <div className="product-grid">{visible.map((p) => <ProductCard key={p.id} product={p} />)}</div>
      ) : (
        <div className="empty">
          <p>Không tìm thấy sản phẩm phù hợp{query.trim() ? ` với “${query.trim()}”` : ''}.</p>
          {filtered ? <button type="button" className="button light" onClick={reset}>Xoá bộ lọc</button> : null}
        </div>
      )}
    </>
  )
}
