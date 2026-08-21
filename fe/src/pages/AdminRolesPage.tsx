import { Check, Minus, Shield } from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import { ROLE_VALUES, Role, roleLabelsEN, roleLabelsVN } from '../types/admin'

type Access = 'full' | 'read' | 'none'

const modules: Array<{
  key: string
  labelVi: string
  labelEn: string
  noteVi: string
  noteEn: string
  access: Record<Role, Access>
}> = [
  {
    key: 'dashboard',
    labelVi: 'Dashboard / báo cáo',
    labelEn: 'Dashboard / reports',
    noteVi: 'Store Owner giám sát vận hành (Report 1)',
    noteEn: 'Store Owner monitors operations (Report 1)',
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
    labelVi: 'Kết nối Shopee / TikTok Shop',
    labelEn: 'Connect Shopee / TikTok Shop',
    noteVi: 'Ngoài phạm vi: Facebook, Lazada (LI-02)',
    noteEn: 'Out of scope: Facebook, Lazada (LI-02)',
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
    labelVi: 'Đơn đa kênh / gộp đơn',
    labelEn: 'Omnichannel orders / consolidation',
    noteVi: 'FE-01, FE-02',
    noteEn: 'FE-01, FE-02',
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
    labelVi: 'Picking / quét QR',
    labelEn: 'Picking / QR scan',
    noteVi: 'Warehouse Staff + Mobile (FE-06)',
    noteEn: 'Warehouse Staff + Mobile (FE-06)',
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
    noteVi: 'Bắt buộc human confirm trước khi in nhãn (FE-03, R06)',
    noteEn: 'Human confirm required before labels (FE-03, R06)',
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
    labelVi: 'Nhãn vận đơn / ước phí',
    labelEn: 'Shipping labels / fee estimate',
    noteVi: 'FE-04, FE-05',
    noteEn: 'FE-04, FE-05',
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
    labelVi: 'Quy tắc bao bì (Store Owner)',
    labelEn: 'Packaging rules (Store Owner)',
    noteVi: 'Khác với template do Admin quản lý',
    noteEn: 'Distinct from Admin-managed templates',
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
    labelVi: 'Xem danh sách user',
    labelEn: 'List users',
    noteVi: 'Chỉ Admin — quản lý tài khoản',
    noteEn: 'Admin only — account management',
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
    labelVi: 'Tạo / sửa / vô hiệu / reset / tắt MFA',
    labelEn: 'Create / patch / deactivate / reset / disable MFA',
    noteVi: 'Chỉ Admin (INTEGRATION_GUIDE §8)',
    noteEn: 'Admin only (INTEGRATION_GUIDE §8)',
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
    noteVi: 'Timeout ≤ 5s + fallback (Report 2 R02)',
    noteEn: 'Timeout ≤ 5s + fallback (Report 2 R02)',
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
    labelVi: 'Packaging templates',
    labelEn: 'Packaging templates',
    noteVi: 'FE-08 — System Administrator',
    noteEn: 'FE-08 — System Administrator',
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
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {vi ? 'Phân quyền theo vai trò' : 'Role-based access'}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {vi
                ? '5 role số 0–4 (INTEGRATION_GUIDE) · trách nhiệm actor (Report 1) · backend @Roles() enforce'
                : '5 numeric roles 0–4 (INTEGRATION_GUIDE) · actor duties (Report 1) · backend @Roles() enforces'}
            </p>
          </div>

          <section className="rounded-xl border border-hairline bg-surface-1 p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
              <Shield className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
              {vi ? 'Ma trận quyền (FE-08)' : 'Access matrix (FE-08)'}
            </div>
            <p className="mb-4 text-xs text-ink-subtle">
              {vi
                ? 'Chủ shop dùng toàn bộ trang vận hành. Admin chỉ console tài khoản/AI/template — không nhảy sang portal shop. Staff chỉ trang phận sự.'
                : 'Store Owner gets all operations pages. Admin stays in the account/AI/template console. Staff only see their duty pages.'}
            </p>
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
                        <p className="mt-0.5 text-[11px] text-ink-tertiary">
                          {vi ? row.noteVi : row.noteEn}
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
