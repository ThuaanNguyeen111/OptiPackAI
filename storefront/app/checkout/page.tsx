'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { useCart } from '@/components/cart/cart-provider'
import { checkout, getCurrentCustomer } from '@/lib/api-client'
import { FREE_SHIPPING_THRESHOLD, getShippingFee } from '@/lib/order-pricing'
import { getAllProvince, getDistrictsByProvinceId } from 'vietnam-divisions-js/provinces'
import { getCommunesByDistrictId } from 'vietnam-divisions-js/districts'
import { getAllProvinces, getCommunesByProvinceId } from 'vietnam-divisions-js/v3'

type AddressMode = 'pre-merger' | 'post-merger'

type ShippingAddress = {
  recipient_name: string
  phone: string
  province: string
  district: string
  ward: string
  address_line: string
}

type OldProvince = Awaited<ReturnType<typeof getAllProvince>>[number]
type OldDistrict = Awaited<ReturnType<typeof getDistrictsByProvinceId>>[number]
type OldCommune = Awaited<ReturnType<typeof getCommunesByDistrictId>>[number]
type NewProvince = Awaited<ReturnType<typeof getAllProvinces>>[number]
type NewCommune = Awaited<ReturnType<typeof getCommunesByProvinceId>>[number]

const emptyAddress: ShippingAddress = {
  recipient_name: '',
  phone: '',
  province: '',
  district: '',
  ward: '',
  address_line: '',
}

function formatVnd(value: number) {
  return `${value.toLocaleString('vi-VN')}₫`
}

export default function CheckoutPage() {
  const router = useRouter()
  const { items, total, clear } = useCart()
  const [address, setAddress] = useState<ShippingAddress>(emptyAddress)
  const [addressMode, setAddressMode] = useState<AddressMode>('post-merger')
  const [oldProvinces, setOldProvinces] = useState<OldProvince[]>([])
  const [oldDistricts, setOldDistricts] = useState<OldDistrict[]>([])
  const [oldCommunes, setOldCommunes] = useState<OldCommune[]>([])
  const [newProvinces, setNewProvinces] = useState<NewProvince[]>([])
  const [newCommunes, setNewCommunes] = useState<NewCommune[]>([])
  const [loadingLocations, setLoadingLocations] = useState(true)
  const paymentMethod = 'cod' as const
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [clientOrderId] = useState(() => crypto.randomUUID())

  useEffect(() => {
    let current = true
    setLoadingLocations(true)
    setOldDistricts([])
    setOldCommunes([])
    setNewCommunes([])

    async function loadProvinces() {
      try {
        if (addressMode === 'pre-merger') {
          setOldProvinces(await getAllProvince())
        } else {
          setNewProvinces(await getAllProvinces())
        }
      } finally {
        if (current) setLoadingLocations(false)
      }
    }

    void loadProvinces()
    return () => {
      current = false
    }
  }, [addressMode])

  useEffect(() => {
    if (!address.province) return
    let current = true

    async function loadChildren() {
      if (addressMode === 'pre-merger') {
        const districts = await getDistrictsByProvinceId(address.province)
        if (!current) return
        setOldDistricts(districts)
        setOldCommunes([])
      } else {
        const communes = await getCommunesByProvinceId(address.province)
        if (!current) return
        setNewCommunes(communes)
      }
    }

    void loadChildren()
    return () => {
      current = false
    }
  }, [address.province, addressMode])

  useEffect(() => {
    if (addressMode !== 'pre-merger' || !address.district) return
    let current = true

    async function loadCommunes() {
      const communes = await getCommunesByDistrictId(address.district)
      if (current) setOldCommunes(communes)
    }

    void loadCommunes()
    return () => {
      current = false
    }
  }, [address.district, addressMode])

  function changeMode(mode: AddressMode) {
    setAddressMode(mode)
    setAddress((current) => ({
      ...current,
      province: '',
      district: '',
      ward: '',
    }))
    setError('')
  }

  function changeAddress(field: keyof ShippingAddress, value: string) {
    setAddress((current) => {
      const next = { ...current, [field]: value }
      if (field === 'province') {
        next.district = ''
        next.ward = ''
      }
      if (field === 'district') next.ward = ''
      return next
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!localStorage.getItem('kaira-customer')) {
      try {
        const result = await getCurrentCustomer()
        localStorage.setItem('kaira-customer', JSON.stringify(result.customer))
        window.dispatchEvent(new Event('kaira-auth-changed'))
      } catch {
        router.push('/auth/login?returnTo=/checkout')
        return
      }
    }

    try {
      const selectedProvince = provinces.find((province) => province.idProvince === address.province)
      const selectedDistrict = oldDistricts.find((district) => district.idDistrict === address.district)
      const selectedWard = addressMode === 'post-merger'
        ? newCommunes.find((commune) => commune.idCommune === address.ward)
        : oldCommunes.find((commune) => commune.idCommune === address.ward)
      const shippingAddress = addressMode === 'post-merger'
        ? {
            recipient_name: address.recipient_name,
            phone: address.phone,
            province: selectedProvince?.name ?? address.province,
            ward: selectedWard?.name ?? address.ward,
            address_line: address.address_line,
          }
        : {
            ...address,
            province: selectedProvince?.name ?? address.province,
            district: selectedDistrict?.name ?? address.district,
            ward: selectedWard?.name ?? address.ward,
          }
      const order = await checkout({
        items: items.map((item) => ({ variant_id: item.variant.id, quantity: item.quantity })),
        shippingAddress,
        paymentMethod,
        clientOrderId,
      })
      clear()
      setDone(`Đặt hàng thành công: ${order.orderNumber}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo đơn hàng')
    }
  }

  if (done) return <><Header /><main className="page-shell"><div className="success"><h1>Cảm ơn bạn!</h1><p>{done}</p><Link className="button" href="/shop">Tiếp tục mua sắm</Link></div></main><Footer /></>
  if (!items.length) return <><Header /><main className="page-shell"><div className="empty">Giỏ hàng đang trống. <Link href="/shop">Quay lại cửa hàng →</Link></div></main><Footer /></>

  const provinces = addressMode === 'pre-merger' ? oldProvinces : newProvinces
  const shippingFee = getShippingFee(total)
  const grandTotal = total + shippingFee
  const freeShippingRemaining = FREE_SHIPPING_THRESHOLD - total

  return <>
    <Header />
    <main className="page-shell">
      <div className="page-title checkout-page-title"><span className="eyebrow">Sắp là của bạn</span><h1>Thanh toán</h1></div>
      <div className="checkout-layout">
      <div className="form-card checkout-form-card">
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="form-field">
              Họ và tên người nhận
              <input required value={address.recipient_name} placeholder="Nhập họ và tên" onChange={(event) => changeAddress('recipient_name', event.target.value)} />
            </label>
            <label className="form-field">
              Số điện thoại
              <input required type="tel" inputMode="tel" value={address.phone} placeholder="Nhập số điện thoại" onChange={(event) => changeAddress('phone', event.target.value)} />
            </label>
          </div>

          <fieldset className="address-mode">
            <legend>Phiên bản địa chỉ</legend>
            <div className="address-mode-options">
              <label className={addressMode === 'pre-merger' ? 'address-mode-option selected' : 'address-mode-option'}>
                <input type="radio" name="address-mode" checked={addressMode === 'pre-merger'} onChange={() => changeMode('pre-merger')} />
                <span><strong>Trước sáp nhập</strong><small>63 tỉnh · 3 cấp</small></span>
              </label>
              <label className={addressMode === 'post-merger' ? 'address-mode-option selected' : 'address-mode-option'}>
                <input type="radio" name="address-mode" checked={addressMode === 'post-merger'} onChange={() => changeMode('post-merger')} />
                <span><strong>Sau sáp nhập</strong><small>34 tỉnh · 2 cấp</small></span>
              </label>
            </div>
            <p className="form-hint">
              {addressMode === 'post-merger'
                ? 'Địa chỉ mới không còn cấp quận/huyện.'
                : 'Dùng khi địa chỉ của bạn vẫn theo hệ thống cũ.'}
            </p>
          </fieldset>

          <div className="form-grid">
            <label className="form-field">
              Tỉnh / Thành phố
              <select required value={address.province} disabled={loadingLocations} onChange={(event) => changeAddress('province', event.target.value)}>
                <option value="">{loadingLocations ? 'Đang tải danh sách...' : 'Chọn tỉnh / thành phố'}</option>
                {provinces.map((province) => <option key={province.idProvince} value={province.idProvince}>{province.name}</option>)}
              </select>
            </label>

            {addressMode === 'pre-merger' ? <>
              <label className="form-field">
                Quận / Huyện
                <select required value={address.district} disabled={!address.province} onChange={(event) => changeAddress('district', event.target.value)}>
                  <option value="">{address.province ? 'Chọn quận / huyện' : 'Chọn tỉnh / thành phố trước'}</option>
                  {oldDistricts.map((district) => <option key={district.idDistrict} value={district.idDistrict}>{district.name}</option>)}
                </select>
              </label>
              <label className="form-field full">
                Phường / Xã
                <select required value={address.ward} disabled={!address.district} onChange={(event) => changeAddress('ward', event.target.value)}>
                  <option value="">{address.district ? 'Chọn phường / xã' : 'Chọn quận / huyện trước'}</option>
                  {oldCommunes.map((commune) => <option key={commune.idCommune} value={commune.idCommune}>{commune.name}</option>)}
                </select>
              </label>
            </> : <label className="form-field">
              Phường / Xã
              <select required value={address.ward} disabled={!address.province} onChange={(event) => changeAddress('ward', event.target.value)}>
                <option value="">{address.province ? 'Chọn phường / xã' : 'Chọn tỉnh / thành phố trước'}</option>
                {newCommunes.map((commune) => <option key={commune.idCommune} value={commune.idCommune}>{commune.name}</option>)}
              </select>
            </label>}

            <label className="form-field full">
              Số nhà, tên đường
              <input required value={address.address_line} placeholder="Ví dụ: 12 Nguyễn Huệ" onChange={(event) => changeAddress('address_line', event.target.value)} />
            </label>
          </div>

          <h3>Phương thức thanh toán</h3>
          <div className="radio-list">
            <label><input type="radio" checked readOnly /> Thanh toán khi nhận hàng (COD)</label>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="button" type="submit">Xác nhận đặt hàng</button>
        </form>
      </div>
      <aside className="checkout-summary" aria-labelledby="checkout-summary-title">
        <span className="eyebrow">Đơn hàng của bạn</span>
        <h2 id="checkout-summary-title">Tóm tắt đơn hàng</h2>
        <div className="checkout-summary-items">
          {items.map((item) => {
            const imageUrl = item.variant.imageUrl ?? item.product.thumbnailUrl
            return <div className="checkout-summary-item" key={item.variant.id}>
              <div className="checkout-summary-image">
                {imageUrl ? <Image src={imageUrl} alt={item.product.name} fill sizes="64px" /> : null}
              </div>
              <div>
                <h3>{item.product.name}</h3>
                <p>{item.variant.variantName}</p>
                <p>Số lượng: {item.quantity}</p>
              </div>
              <strong className="checkout-summary-price">{formatVnd(item.variant.price * item.quantity)}</strong>
            </div>
          })}
        </div>
        <div className="checkout-summary-line"><span>Tạm tính</span><strong>{formatVnd(total)}</strong></div>
        <div className="checkout-summary-line"><span>Vận chuyển</span><strong>{shippingFee ? formatVnd(shippingFee) : 'Miễn phí'}</strong></div>
        <p className="checkout-shipping-note">
          {shippingFee
            ? `Mua thêm ${formatVnd(freeShippingRemaining)} để được miễn phí vận chuyển.`
            : 'Bạn được miễn phí vận chuyển cho đơn hàng này.'}
        </p>
        <div className="checkout-summary-total"><span>Tổng thanh toán</span><strong>{formatVnd(grandTotal)}</strong></div>
        <Link className="checkout-cart-link" href="/cart">← Chỉnh sửa giỏ hàng</Link>
      </aside>
      </div>
    </main>
    <Footer />
  </>
}
