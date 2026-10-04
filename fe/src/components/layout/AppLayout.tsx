import { Outlet, useLocation } from 'react-router-dom'
import { PortalSidebar } from '../portal/PortalSidebar'
import { ErrorBoundary, PageErrorFallback } from '../ErrorBoundary'
import { usePortal } from '../../context/use-portal'

export function AppLayout() {
  const { pathname } = useLocation()
  const { locale } = usePortal()
  return (
    <div className="flex h-svh overflow-hidden bg-canvas">
      <PortalSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
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
