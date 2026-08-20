import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Settings, Cpu } from 'lucide-react'

const adminNav = [
  { to: '/app/admin', label: 'Users', icon: Users, end: true },
  { to: '/app/admin/ai', label: 'AI Packaging', icon: Cpu },
  { to: '/app/admin/settings', label: 'Cấu hình', icon: Settings },
]

export function AdminSidebar() {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-hairline bg-canvas">
      <div className="flex h-14 items-center gap-2 border-b border-hairline px-4">
        <NavLink to="/app" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-semibold text-on-primary">OP</div>
          <div>
            <p className="text-sm font-medium tracking-tight text-ink">Admin</p>
            <p className="text-xs text-ink-subtle">Hệ thống</p>
          </div>
        </NavLink>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {adminNav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive ? 'bg-surface-2 text-ink' : 'text-ink-subtle hover:bg-surface-1 hover:text-ink'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-hairline p-4">
        <p className="text-xs text-ink-tertiary">Quyền: Admin</p>
      </div>
    </aside>
  )
}
