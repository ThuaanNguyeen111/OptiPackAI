import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { ProductCard } from '@/components/product/product-card'
import { getProducts } from '@/lib/api-client'

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const [products, params] = await Promise.all([getProducts(), searchParams])
  const category = params.category?.toLowerCase()
  const visibleProducts = category
    ? products.filter((product) => product.categoryName?.toLowerCase() === category || product.categoryId === category)
    : products

  return <><Header cartCount={0} /><main className="page-shell"><div className="page-title"><span className="eyebrow">AURELLE collection</span><h1>{category ? `${category[0]?.toUpperCase() ?? ''}${category.slice(1)}` : 'Tất cả sản phẩm'}</h1></div><div className="shop-toolbar"><span>{visibleProducts.length} sản phẩm</span><select aria-label="Sắp xếp"><option>Mới nhất</option><option>Giá thấp đến cao</option><option>Giá cao đến thấp</option></select></div>{visibleProducts.length ? <div className="product-grid">{visibleProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty">Chưa có sản phẩm trong danh mục này. <a href="/shop">Xem tất cả sản phẩm →</a></div>}</main><Footer /></>
}
