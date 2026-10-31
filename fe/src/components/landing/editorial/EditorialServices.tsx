import type { ReactNode } from 'react'

const SERVICES = [
  {
    no: '01',
    title: 'Đồng bộ đơn sàn',
    body: 'Lazada qua Open Platform, AURELLE qua Open API ký HMAC. Đơn về theo lịch 5 phút hoặc ngay khi sàn báo.',
  },
  {
    no: '02',
    title: 'Gom đơn cùng người nhận',
    body: 'Cùng SĐT và địa chỉ thì vào chung một nhóm để lấy một lượt. Mỗi đơn vẫn giữ kiện và vận đơn riêng để trả hàng đúng đơn.',
  },
  {
    no: '03',
    title: 'Kho có vị trí và lô',
    body: 'Mã ô khu–dãy–kệ–tầng–ô, picking list theo lộ trình, lấy lô nhập trước, giữ chỗ để hai sàn không bán trùng một món.',
  },
  {
    no: '04',
    title: 'Xếp thùng 3D',
    body: 'Thuật toán di truyền tìm cách xếp vào thùng nhỏ nhất còn tồn; đơn nhỏ được CP-SAT kiểm lại để biết đã tối ưu hay chưa.',
  },
  {
    no: '05',
    title: 'Vận đơn GHN',
    body: 'Báo giá từng kiện, tạo vận đơn, in nhãn có mã GHN. Trạng thái giao về qua webhook và được gửi ngược cho sàn.',
  },
  {
    no: '06',
    title: 'Trả hàng và tái dùng thùng',
    body: 'Khách gửi yêu cầu trên AURELLE, kho nhận và kiểm. Thùng còn tốt được nhập lại để dùng cho đơn sau.',
  },
] as const

export function EditorialServices(): ReactNode {
  return (
    <section id="services" className="ed-section">
      <h2 className="ed-title">Hệ thống làm những việc gì</h2>

      <div className="mt-10 grid gap-x-10 gap-y-8 border-t border-[var(--ed-line)] pt-8 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((item) => (
          <article key={item.no}>
            <p className="ed-display m-0 text-sm tabular-nums text-[var(--ed-muted)]">{item.no}</p>
            <h3 className="m-0 mt-2 text-lg font-semibold tracking-tight text-[var(--ed-ink)]">
              {item.title}
            </h3>
            <p className="m-0 mt-2 text-[15px] leading-relaxed text-[var(--ed-ink-soft)]">
              {item.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}
