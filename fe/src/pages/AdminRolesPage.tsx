import { Check, Minus, Shield } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import { ROLE_VALUES, Role, roleLabelsEN, roleLabelsVN } from '../types/admin'

type Access = 'full' | 'read' | 'none'

const modules: Array<{
  key: string
  labelVi: string
  labelEn: string
  access: Record<Role, Access>
}> = [
  {
    key: 'dashboard',
    labelVi: 'Dashboard',
    labelEn: 'Dashboard',
    access: {
      [Role.STORE_OWNER]: 'full',
      [Role.WAREHOUSE_STAFF]: 'none',
      [Role.PACKAGING_STAFF]: 'none',
      [Role.SHIPPING_COORDINATOR]: 'none',
      [Role.ADMIN]: 'none',
    },
  },
  {
    key: 'shops',
    labelVi: 'Kết nối sàn thương mại điện tử',
    labelEn: 'Connect e-commerce platforms',
    access: {
      [Role.STORE_OWNER]: 'full',
      [Role.WAREHOUSE_STAFF]: 'none',
      [Role.PACKAGING_STAFF]: 'none',
      [Role.SHIPPING_COORDINATOR]: 'none',
      [Role.ADMIN]: 'none',
    },
  },
  {
    key: 'orders',
    labelVi: 'Đơn đa kênh/Gộp đơn',
    labelEn: 'Omnichannel orders/Consolidation',
    access: {
      [Role.STORE_OWNER]: 'full',
      [Role.WAREHOUSE_STAFF]: 'full',
      [Role.PACKAGING_STAFF]: 'none',
      [Role.SHIPPING_COORDINATOR]: 'none',
      [Role.ADMIN]: 'none',
    },
  },
  {
    key: 'picking',
    labelVi: 'Picking/Quét QR',
    labelEn: 'Picking/QR scan',
    access: {
      [Role.STORE_OWNER]: 'full',
      [Role.WAREHOUSE_STAFF]: 'full',
      [Role.PACKAGING_STAFF]: 'none',
      [Role.SHIPPING_COORDINATOR]: 'none',
      [Role.ADMIN]: 'none',
    },
  },
  {
    key: 'packing',
    labelVi: 'Duyệt gợi ý AI đóng gói',
    labelEn: 'Approve AI packing plan',
    access: {
      [Role.STORE_OWNER]: 'full',
      [Role.WAREHOUSE_STAFF]: 'none',
      [Role.PACKAGING_STAFF]: 'full',
      [Role.SHIPPING_COORDINATOR]: 'none',
      [Role.ADMIN]: 'none',
    },
  },
  {
    key: 'shipping',
    labelVi: 'Nhãn vận đơn/Ước phí',
    labelEn: 'Shipping labels/Fee estimate',
    access: {
      [Role.STORE_OWNER]: 'full',
      [Role.WAREHOUSE_STAFF]: 'none',
      [Role.PACKAGING_STAFF]: 'none',
      [Role.SHIPPING_COORDINATOR]: 'full',
      [Role.ADMIN]: 'none',
    },
  },
  {
    key: 'pack-rules',
    labelVi: 'Quy tắc bao bì',
    labelEn: 'Packaging rules',
    access: {
      [Role.STORE_OWNER]: 'full',
      [Role.WAREHOUSE_STAFF]: 'none',
      [Role.PACKAGING_STAFF]: 'none',
      [Role.SHIPPING_COORDINATOR]: 'none',
      [Role.ADMIN]: 'none',
    },
  },
  {
    key: 'users-read',
    labelVi: 'Xem danh sách nhân viên',
    labelEn: 'List employees',
    access: {
      [Role.STORE_OWNER]: 'none',
      [Role.WAREHOUSE_STAFF]: 'none',
      [Role.PACKAGING_STAFF]: 'none',
      [Role.SHIPPING_COORDINATOR]: 'none',
      [Role.ADMIN]: 'full',
    },
  },
  {
    key: 'users-write',
    labelVi: 'Chỉnh sửa nhân viên',
    labelEn: 'Edit employees',
    access: {
      [Role.STORE_OWNER]: 'none',
      [Role.WAREHOUSE_STAFF]: 'none',
      [Role.PACKAGING_STAFF]: 'none',
      [Role.SHIPPING_COORDINATOR]: 'none',
      [Role.ADMIN]: 'full',
    },
  },
  {
    key: 'ai-config',
    labelVi: 'Cấu hình tham số AI',
    labelEn: 'AI parameter config',
    access: {
      [Role.STORE_OWNER]: 'none',
      [Role.WAREHOUSE_STAFF]: 'none',
      [Role.PACKAGING_STAFF]: 'none',
      [Role.SHIPPING_COORDINATOR]: 'none',
      [Role.ADMIN]: 'full',
    },
  },
  {
    key: 'templates',
    labelVi: 'Mẫu đóng gói',
    labelEn: 'Packaging templates',
    access: {
      [Role.STORE_OWNER]: 'none',
      [Role.WAREHOUSE_STAFF]: 'none',
      [Role.PACKAGING_STAFF]: 'none',
      [Role.SHIPPING_COORDINATOR]: 'none',
      [Role.ADMIN]: 'full',
    },
  },
]

function Cell({ access }: { access: Access }) {
  if (access === 'full') {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-success/20 bg-success-bg text-success">
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
    )
  }
  if (access === 'read') {
    return (
      <span className="inline-flex rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary-hover">
        R
      </span>
    )
  }
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center text-ink-tertiary">
      <Minus className="h-3.5 w-3.5" />
    </span>
  )
}

export function AdminRolesPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const labels = vi ? roleLabelsVN : roleLabelsEN

  return (
    <>
      <PortalTopBar
        variant="admin"
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Quản trị' : 'Admin', to: '/app/admin' },
          { label: vi ? 'Phân quyền' : 'RBAC' },
        ]}
      />
      <main className="flex-1 overflow-auto bg-canvas p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {vi ? 'Phân quyền theo vai trò' : 'Role-based access'}
            </h1>

          <section className="rounded-xl border border-hairline bg-surface-1 p-4 sm:p-5">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-ink-subtle">
                    <th className="px-3 py-3 font-medium">
                      {vi ? 'Chức năng' : 'Module'}
                    </th>
                    {ROLE_VALUES.map((r) => (
                      <th key={r} className="px-3 py-3 text-center font-medium">
                        <span className="block font-mono text-[10px] text-ink-tertiary">
                          {r}
                        </span>
                        {labels[r]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modules.map((row) => (
                    <tr
                      key={row.key}
                      className="border-b border-hairline/70 last:border-0"
                    >
                      <td className="px-3 py-3">
                        <p className="text-ink">
                          {vi ? row.labelVi : row.labelEn}
                        </p>
                      </td>
                      {ROLE_VALUES.map((r) => (
                        <td key={r} className="px-3 py-3 text-center">
                          <Cell access={row.access[r]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-ink-subtle">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" />
                {vi ? 'Toàn quyền' : 'Full'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="rounded border border-primary/20 bg-primary/10 px-1 font-mono text-[10px] text-primary-hover">
                  R
                </span>
                {vi ? 'Chỉ xem' : 'Read'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Minus className="h-3.5 w-3.5" />
                {vi ? 'Không truy cập' : 'No access'}
              </span>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
