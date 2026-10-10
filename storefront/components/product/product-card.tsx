import Image from 'next/image'
import Link from 'next/link'
import type { Product } from '@/types/storefront'

export function ProductCard({ product }: { product: Product }) {
  const price = product.variants[0]?.price ?? 0
  return <article className="product-card"><Link href={`/shop/${product.slug}`}><div className="product-image"><Image src={product.thumbnailUrl} alt={product.name} fill sizes="(max-width: 700px) 50vw, 25vw" /></div><div className="product-card-info"><span>{product.categoryName ?? 'Collection'}</span><h3>{product.name}</h3><strong>{price.toLocaleString('vi-VN')}₫</strong></div></Link></article>
}
