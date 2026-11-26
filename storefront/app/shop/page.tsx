import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { ShopCatalog } from '@/components/product/shop-catalog'
import { getCategories, getProducts } from '@/lib/api-client'
import type { Category } from '@/types/storefront'

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; sort?: string }>
}) {
  const [products, categories, params] = await Promise.all([
    getProducts(),
    getCategories().catch((): Category[] => []),
    searchParams,
  ])

  return (
    <>
      <Header cartCount={0} />
      <main className="page-shell shop-page">
        <ShopCatalog
          products={products}
          categories={categories}
          initialCategory={params.category}
          initialQuery={params.q}
          initialSort={params.sort}
        />
      </main>
      <Footer />
    </>
  )
}
