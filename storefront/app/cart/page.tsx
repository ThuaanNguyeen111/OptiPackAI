'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { useCart } from '@/components/cart/cart-provider'

export default function CartPage() {
  const { items, count, total, update, remove } = useCart()

  return <>
    <Header cartCount={count} />
    <main className="page-shell">
      <div className="page-title"><span className="eyebrow">Lựa chọn của bạn</span><h1>Giỏ hàng</h1></div>
      {items.length === 0 ? <div className="empty">Giỏ hàng đang trống. <Link href="/shop">Tiếp tục mua sắm →</Link></div> : <div className="cart-layout">
        <div>
          {items.map((item) => <div className="cart-row" key={item.variant.id}>
            <div className="cart-row-image"><Image src={item.variant.imageUrl ?? item.product.thumbnailUrl} alt={item.product.name} fill sizes="96px" /></div>
            <div className="cart-row-info">
              <h3>{item.product.name}</h3>
              <p>{item.variant.variantName}</p>
              <p>{item.variant.price.toLocaleString('vi-VN')}₫</p>
            </div>
            <div className="cart-row-actions">
              <div className="quantity-control" aria-label={`Số lượng ${item.product.name}`}>
                <button type="button" aria-label={`Giảm số lượng ${item.product.name}`} onClick={() => update(item.variant.id, Math.max(1, item.quantity - 1))}>−</button>
                <input aria-label={`Số lượng ${item.product.name}`} min={1} max={item.variant.availableQuantity} inputMode="numeric" type="number" value={item.quantity} onChange={(event) => update(item.variant.id, Math.max(1, Math.min(item.variant.availableQuantity, Number(event.target.value))))} />
                <button type="button" aria-label={`Tăng số lượng ${item.product.name}`} onClick={() => update(item.variant.id, Math.min(item.variant.availableQuantity, item.quantity + 1))}>+</button>
              </div>
              <button className="remove" type="button" title="Xóa sản phẩm" aria-label={`Xóa ${item.product.name} khỏi giỏ hàng`} onClick={() => remove(item.variant.id)}><span aria-hidden="true">×</span></button>
            </div>
          </div>)}
        </div>
        <aside className="summary"><h2>Tổng đơn</h2><div className="summary-line"><span>Tạm tính</span><strong>{total.toLocaleString('vi-VN')}₫</strong></div><div className="summary-line"><span>Vận chuyển</span><span>Tính khi đặt hàng</span></div><Link className="button" href="/checkout">Tiến hành thanh toán</Link></aside>
      </div>}
    </main>
    <Footer />
  </>
}
