'use client'

import Image from 'next/image'
import { useState } from 'react'
import type { Product } from '@/types/storefront'
import { useCart } from '@/components/cart/cart-provider'

export function ProductDetail({ product }: { product: Product }) {
  const { add } = useCart()
  const gallery = product.galleryImages?.length ? product.galleryImages : [product.thumbnailUrl]
  const [selectedImage, setSelectedImage] = useState(0)
  const [selectedId, setSelectedId] = useState(
    product.variants.find((variant) => variant.isDefault)?.id ?? product.variants[0]?.id,
  )
  const [quantity, setQuantity] = useState(1)
  const variant = product.variants.find((item) => item.id === selectedId) ?? product.variants[0]

  if (!variant) return null

  function selectVariant(id: string) {
    setSelectedId(id)
    setQuantity(1)
  }

  return <div className="product-detail">
    <div className="gallery-layout">
      <div className="gallery-thumbs" aria-label="Ảnh sản phẩm">
        {gallery.map((image, index) => <button
          className={index === selectedImage ? 'gallery-thumb selected' : 'gallery-thumb'}
          key={image}
          type="button"
          aria-label={`Xem ảnh ${index + 1}`}
          aria-pressed={index === selectedImage}
          onClick={() => setSelectedImage(index)}
        >
          <Image src={image} alt="" fill sizes="80px" />
        </button>)}
      </div>
      <div className="gallery-main">
        <Image src={gallery[selectedImage]} alt={product.name} fill priority sizes="(max-width: 800px) 100vw, 50vw" />
        <span className="gallery-counter">{selectedImage + 1} / {gallery.length}</span>
      </div>
    </div>

    <div className="detail-copy">
      <span className="eyebrow">{product.categoryName}</span>
      <h1>{product.name}</h1>
      <div className="detail-price">{variant.price.toLocaleString('vi-VN')}₫</div>
      <p className="detail-description">{product.description}</p>

      <div className="variant-list">
        {product.variants.map((item) => <button
          className={item.id === variant.id ? 'variant-button selected' : 'variant-button'}
          key={item.id}
          type="button"
          aria-pressed={item.id === variant.id}
          onClick={() => selectVariant(item.id)}
        >{item.variantName}</button>)}
      </div>

      <div className="quantity-row">
        <label>Số lượng <input min={1} max={variant.availableQuantity} type="number" value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(variant.availableQuantity, Number(event.target.value))))} /></label>
        <button className="button" type="button" onClick={() => add(product, variant, quantity)}>Thêm vào giỏ</button>
      </div>
      <p className="detail-description">Còn {variant.availableQuantity} sản phẩm. Đóng gói theo hồ sơ SKU đã được kho xác nhận.</p>

      {product.sizeChart?.length > 0 && <section className="size-guide" aria-labelledby="size-guide-title">
        <div className="size-guide-heading"><div><span className="eyebrow">Fit & measurements</span><h2 id="size-guide-title">Bảng size</h2></div><span>cm</span></div>
        <div className="size-table-wrap"><table><thead><tr><th>Size</th>{product.sizeChartType === 'shoes' ? <th>Bàn chân</th> : <><th>Ngực</th><th>Eo</th><th>Hông</th><th>Dài</th></>}</tr></thead><tbody>{product.sizeChart.map((row) => <tr key={row.size}><th scope="row">{row.size}</th>{product.sizeChartType === 'shoes' ? <td>{row.length_cm ?? '—'}</td> : <><td>{row.bust_cm ?? '—'}</td><td>{row.waist_cm ?? '—'}</td><td>{row.hip_cm ?? '—'}</td><td>{row.length_cm ?? '—'}</td></>}</tr>)}</tbody></table></div>
        {product.sizeGuideNote && <p className="size-guide-note">{product.sizeGuideNote}</p>}
      </section>}
      {!product.sizeChart?.length && product.sizeGuideNote && <p className="size-guide-note size-guide-note-standalone">{product.sizeGuideNote}</p>}
    </div>
  </div>
}
