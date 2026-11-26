'use client'

import { useEffect, useMemo, useState } from 'react'
import { getAllProvinces, getCommunesByProvinceId } from 'vietnam-divisions-js/v3'
import {
  ApiError, getAdminExpressOrders, getAdminExpressWards, resetAdminExpressWards, saveAdminExpressWards,
} from '@/lib/api-client'
import { formatPromisedTime } from '@/lib/express-delivery'
import { getFulfillmentStatusLabel } from '@/lib/order-labels'
import type { AdminExpressOrder } from '@/types/storefront'

type Props = { onUnauthorized: () => void }

const HCM_NAME = 'Thành phố Hồ Chí Minh'

/** So khớp tên phường không phân biệt dấu / hoa thường (giống BE). */
const norm = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim().replace(/\s+/g, ' ')

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
}

/**
 * 29/10/2026 — Giao hỏa tốc: Admin chọn phường TP.HCM được giao hỏa tốc (mặc định 91 phường nội
 * thành cũ + Thủ Đức + Thủ Dầu Một/Thuận An/Dĩ An) và theo dõi đơn hỏa tốc, đơn trễ hẹn có nhãn "Trễ".
 */
export function ExpressManager({ onUnauthorized }: Props) {
  const [allWards, setAllWards] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isDefault, setIsDefault] = useState(true)
  const [search, setSearch] = useState('')
  const [onlySelected, setOnlySelected] = useState(false)
  const [orders, setOrders] = useState<AdminExpressOrder[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function fail(err: unknown) {
    if (err instanceof ApiError && err.status === 401) { onUnauthorized(); return }
    setError(err instanceof Error ? err.message : 'Thao tác chưa thành công')
  }

  function applyWards(result: { wards: string[]; isDefault: boolean }) {
    setSelected(new Set(result.wards.map(norm)))
    setIsDefault(result.isDefault)
  }

  useEffect(() => {
    let current = true
    async function load() {
      try {
        const provinces = await getAllProvinces()
        const hcm = provinces.find((province) => province.name === HCM_NAME)
        const communes = hcm ? await getCommunesByProvinceId(hcm.idProvince) : []
        const [wards, expressOrders] = await Promise.all([getAdminExpressWards(), getAdminExpressOrders(7)])
        if (!current) return
        setAllWards(communes.map((commune) => commune.name))
        applyWards(wards)
        setOrders(expressOrders)
      } catch (err) { if (current) fail(err) }
    }
    void load()
    return () => { current = false }
  }, [])

  const visibleWards = useMemo(() => {
    const q = norm(search)
    return allWards.filter((ward) => (!q || norm(ward).includes(q)) && (!onlySelected || selected.has(norm(ward))))
  }, [allWards, search, onlySelected, selected])

  function toggle(ward: string) {
    setSelected((current) => {
      const next = new Set(current)
      const key = norm(ward)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
    setNotice('')
  }

  async function save() {
    const wards = allWards.filter((ward) => selected.has(norm(ward)))
    if (!wards.length) { setError('Chọn ít nhất 1 phường.'); return }
    setBusy(true); setError(''); setNotice('')
    try { applyWards(await saveAdminExpressWards(wards)); setNotice(`Đã lưu ${String(wards.length)} phường giao hỏa tốc.`) }
    catch (err) { fail(err) }
    finally { setBusy(false) }
  }

  async function reset() {
    setBusy(true); setError(''); setNotice('')
    try { applyWards(await resetAdminExpressWards()); setNotice('Đã quay về danh sách mặc định.') }
    catch (err) { fail(err) }
    finally { setBusy(false) }
  }

  async function reloadOrders() {
    try { setOrders(await getAdminExpressOrders(7)) } catch (err) { fail(err) }
  }

  const lateCount = orders.filter((order) => order.isLate).length

  return <section className="admin-categories admin-express" aria-labelledby="admin-express-title">
    <h2 id="admin-express-title">Giao hỏa tốc</h2>
    <p className="admin-hint">
      Hỏa tốc 45.000₫ (miễn phí từ 1 triệu), shop tự giao trong 3 giờ. Khách chỉ chọn được khi phường nhận hàng nằm trong danh sách dưới đây
      và đặt trong 8:00–14:00, thứ 2 – thứ 7. {isDefault ? 'Đang dùng danh sách mặc định.' : 'Đang dùng danh sách đã chỉnh.'}
    </p>
    {error && <div className="admin-error" role="alert">{error}</div>}
    {notice && <p role="status">{notice}</p>}

    <h3>Đơn hỏa tốc 7 ngày gần nhất {lateCount > 0 && <span className="order-status order-status-late">{lateCount} đơn trễ</span>}</h3>
    <div className="admin-table-wrap"><table>
      <thead><tr><th>Mã đơn</th><th>Người nhận</th><th>Phường</th><th>Đặt lúc</th><th>Hẹn giao trước</th><th>Đã giao</th><th>Shipper</th><th>Trạng thái</th></tr></thead>
      <tbody>
        {orders.map((order) => <tr key={order.id}>
          <td>{order.orderNumber}</td>
          <td>{order.recipientName}<br /><small>{order.phone}</small></td>
          <td>{order.ward}</td>
          <td>{formatDateTime(order.placedAt)}</td>
          <td>{order.promisedDeliveryAt ? formatPromisedTime(order.promisedDeliveryAt) : '—'}</td>
          <td>{formatDateTime(order.deliveredAt)}</td>
          <td>{order.shipperName ? <>{order.shipperName}{order.shipperPhone && <><br /><small>{order.shipperPhone}</small></>}</> : 'Chưa giao cho shipper'}</td>
          <td>{order.status === 'cancelled' ? 'Đã hủy' : getFulfillmentStatusLabel(order.fulfillmentStatus)}{order.isLate && <> <span className="order-status order-status-late">Trễ</span></>}</td>
        </tr>)}
        {!orders.length && <tr><td colSpan={8} className="empty">Chưa có đơn hỏa tốc trong 7 ngày.</td></tr>}
      </tbody>
    </table></div>
    <div className="admin-express-actions"><button className="admin-secondary" type="button" onClick={() => void reloadOrders()}>Tải lại đơn</button></div>

    <h3>Phường được giao hỏa tốc ({String(selected.size)}/{String(allWards.length)} phường TP.HCM)</h3>
    <div className="admin-express-actions">
      <input type="search" placeholder="Tìm phường…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <label><input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} /> Chỉ hiện phường đã chọn</label>
    </div>
    <div className="admin-table-wrap"><table>
      <tbody>
        {visibleWards.map((ward) => <tr key={ward}>
          <td><label><input type="checkbox" checked={selected.has(norm(ward))} onChange={() => toggle(ward)} /> {ward}</label></td>
        </tr>)}
        {!visibleWards.length && <tr><td className="empty">{allWards.length ? 'Không có phường phù hợp.' : 'Đang tải danh sách phường…'}</td></tr>}
      </tbody>
    </table></div>
    <div className="admin-express-actions">
      <button className="button" type="button" disabled={busy} onClick={() => void save()}>Lưu danh sách phường</button>
      <button className="admin-secondary" type="button" disabled={busy || isDefault} onClick={() => void reset()}>Quay về mặc định</button>
    </div>
  </section>
}
