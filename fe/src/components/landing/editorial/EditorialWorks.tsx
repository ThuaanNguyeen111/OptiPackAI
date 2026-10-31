import type { ReactNode } from 'react'

const ROLES = [
  {
    role: 'Store Owner',
    sees: 'Doanh thu, việc đang tồn, đơn trễ hạn',
    does: 'Đánh dấu hỏa tốc, duyệt trả hàng, hủy đơn AURELLE khi hết hàng',
  },
  {
    role: 'Warehouse Staff',
    sees: 'Picking list theo kệ, tồn từng ô, lô cũ nhất',
    does: 'Quét lấy hàng, nhập kho theo phiếu, kiểm kê, nhận hàng hoàn',
  },
  {
    role: 'Packaging Staff',
    sees: 'Kế hoạch xếp thùng và hướng dẫn 3D',
    does: 'Duyệt hoặc đổi thùng, quét món vào kiện, cân và niêm phong',
  },
  {
    role: 'Shipping Coordinator',
    sees: 'Kiện chờ giao, báo giá GHN, đơn quá hạn giao',
    does: 'Tạo vận đơn, in nhãn và bảng kê, giao đơn hỏa tốc',
  },
  {
    role: 'Admin',
    sees: 'Toàn bộ, kèm lịch sử thao tác',
    does: 'Tạo tài khoản, cấu hình kho, thùng, kết nối sàn',
  },
] as const

export function EditorialWorks(): ReactNode {
  return (
    <section id="works" className="ed-section">
      <h2 className="ed-title">Mỗi người chỉ thấy phần việc của mình</h2>
      <p className="ed-lead">
        Đăng nhập theo vai trò. Màn hình và nút bấm thay đổi theo quyền.
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
          <thead>
            <tr className="border-b border-[var(--ed-line)] text-[13px] text-[var(--ed-muted)]">
              <th className="py-3 pr-6 font-medium">Vai trò</th>
              <th className="py-3 pr-6 font-medium">Nhìn thấy</th>
              <th className="py-3 font-medium">Làm được</th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map((row) => (
              <tr key={row.role} className="border-b border-[var(--ed-line)] align-top">
                <td className="py-4 pr-6 font-semibold whitespace-nowrap text-[var(--ed-ink)]">
                  {row.role}
                </td>
                <td className="py-4 pr-6 text-[var(--ed-ink-soft)]">{row.sees}</td>
                <td className="py-4 text-[var(--ed-ink-soft)]">{row.does}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
