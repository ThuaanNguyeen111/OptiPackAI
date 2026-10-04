import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/use-auth'
import { usesTealAppChrome } from '../../lib/app-chrome'
import { PortalSidebar } from '../portal/PortalSidebar'
import { ErrorBoundary, PageErrorFallback } from '../ErrorBoundary'
import { usePortal } from '../../context/use-portal'

export function AppLayout() {
  const { pathname } = useLocation()
  const { locale } = usePortal()
  const { session } = useAuth()
  const tealChrome = usesTealAppChrome(session?.role)

  return (
    <div
      className={
        tealChrome ? 'owner-shell' : 'flex h-svh overflow-hidden bg-canvas'
      }
    >
      <PortalSidebar />
      <div
        className={
          tealChrome
            ? 'owner-stage'
            : 'flex min-w-0 flex-1 flex-col overflow-hidden'
        }
      >
        {/* Lỗi trong 1 trang chỉ hiện khung lỗi, sidebar vẫn dùng được; đổi trang thì tự xoá lỗi. */}
        <ErrorBoundary
          resetKey={pathname}
          fallback={(error, retry) => <PageErrorFallback error={error} retry={retry} vi={locale === 'vi'} />}
        >
          <Outlet />
        </ErrorBoundary>
      </div>
    </div>
  )
}
