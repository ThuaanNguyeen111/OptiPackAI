import Image from 'next/image'
import Link from 'next/link'
import { formatVnd, maxDiscountPercent, priceRange, totalAvailable } from '@/lib/product-pricing'
import type { Product } from '@/types/storefront'

export function ProductCard({ product }: { product: Product }) {
  const { min, max } = priceRange(product)
  const soldOut = totalAvailable(product) === 0
  const discount = maxDiscountPercent(product)
  const hoverImage = product.galleryImages.find((url) => url && url !== product.thumbnailUrl)
  const colors = new Set(product.variants.map((v) => v.color?.trim()).filter(Boolean)).size
  const sizes = new Set(product.variants.map((v) => v.size?.trim()).filter(Boolean)).size
  const options = [colors > 1 ? `${colors} màu` : null, sizes > 1 ? `${sizes} size` : null].filter(Boolean).join(' · ')

  return (
    <article className={`product-card${soldOut ? ' is-sold-out' : ''}`}>
      <Link href={`/shop/${product.slug}`} aria-label={product.name}>
        <div className="product-image">
          <Image className="product-image-main" src={product.thumbnailUrl} alt={product.name} fill sizes="(max-width: 700px) 50vw, 25vw" />
          {hoverImage ? <Image className="product-image-alt" src={hoverImage} alt="" fill sizes="(max-width: 700px) 50vw, 25vw" /> : null}
          <div className="product-badges">
            {soldOut ? <span className="badge badge-muted">Hết hàng</span> : null}
            {!soldOut && discount > 0 ? <span className="badge badge-sale">-{discount}%</span> : null}
          </div>
          <span className="product-quick">Xem chi tiết</span>
        </div>
        <div className="product-card-info">
          <span>{product.categoryName ?? 'Collection'}</span>
          <h3>{product.name}</h3>
          <div className="product-card-meta">
            <strong>{min === 0 ? 'Liên hệ' : min === max ? formatVnd(min) : `Từ ${formatVnd(min)}`}</strong>
            {options ? <small>{options}</small> : null}
          </div>
        </div>
      </Link>
    </article>
  )
}
