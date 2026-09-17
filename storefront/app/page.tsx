import Image from 'next/image'
import Link from 'next/link'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { ProductCard } from '@/components/product/product-card'
import { getProducts } from '@/lib/api-client'
import { siteConfig } from '@/lib/site-config'

export default async function HomePage() {
  const products = await getProducts()
  return <><Header cartCount={0} /><main><section className="hero"><div className="hero-copy"><span className="eyebrow">Spring / Summer 2026</span><h1>Essentials for every day.</h1><p>Những thiết kế tối giản, chất liệu dễ chịu và đủ linh hoạt để đồng hành cùng bạn mỗi ngày.</p><Link className="button" href="/shop">Khám phá bộ sưu tập</Link></div><div className="hero-image"><Image src="/kaira-assets/images/banner-image-1.jpg" alt={`${siteConfig.name} collection`} fill priority sizes="50vw" /></div></section><section className="section"><div className="section-heading"><h2>New arrivals</h2><Link href="/shop">Xem tất cả →</Link></div><div className="product-grid">{products.filter((product) => product.isFeatured).slice(0, 4).map((product) => <ProductCard key={product.id} product={product} />)}</div></section><section className="section"><div className="section-heading"><h2>Complete the look</h2><Link href="/shop">Khám phá tất cả →</Link></div><div className="category-strip"><Link className="category-tile" href="/shop?category=tops"><h3>Tops</h3></Link><Link className="category-tile" href="/shop?category=dresses"><h3>Dresses</h3></Link><Link className="category-tile" href="/shop?category=bags"><h3>Bags</h3></Link><Link className="category-tile" href="/shop?category=accessories"><h3>Accessories</h3></Link><Link className="category-tile" href="/shop?category=jewelry"><h3>Jewelry</h3></Link><Link className="category-tile" href="/shop?category=shoes"><h3>Shoes</h3></Link></div></section></main><Footer /></>
}
