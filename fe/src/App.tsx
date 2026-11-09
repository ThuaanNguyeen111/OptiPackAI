import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import {
  ForceChangeRoute,
  GuestRoute,
  ProtectedRoute,
} from './components/auth/ProtectedRoute'
import { MfaDisabledNotice } from './components/auth/MfaDisabledNotice'
import { AdminLayout } from './components/layout/AdminLayout'
import { AppLayout } from './components/layout/AppLayout'
import { AuthProvider } from './context/auth-provider'
import { PortalProvider } from './context/portal-provider'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { LoginPage } from './pages/LoginPage'
import { MarketplaceOAuthSuccessPage } from './pages/MarketplaceOAuthSuccessPage'
import { OAuthSuccessPage } from './pages/OAuthSuccessPage'
import { RegisterPage } from './pages/RegisterPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'

// Mỗi trang là một gói riêng: màn đăng nhập không phải tải `three` và các trang nặng.
const AdminMarketplacePage = lazy(() =>
  import('./pages/AdminMarketplacePage').then((m) => ({ default: m.AdminMarketplacePage })),
)
const AdminOrderDetailPage = lazy(() =>
  import('./pages/AdminOrderDetailPage').then((m) => ({ default: m.AdminOrderDetailPage })),
)
const AdminOrdersPage = lazy(() =>
  import('./pages/AdminOrdersPage').then((m) => ({ default: m.AdminOrdersPage })),
)
const AdminRolesPage = lazy(() =>
  import('./pages/AdminRolesPage').then((m) => ({ default: m.AdminRolesPage })),
)
const AdminPackingPlansPage = lazy(() =>
  import('./pages/AdminPackingPlansPage').then((m) => ({ default: m.AdminPackingPlansPage })),
)
const AdminWarehousePage = lazy(() =>
  import('./pages/AdminWarehousePage').then((m) => ({ default: m.AdminWarehousePage })),
)
const AnalyticsReportPage = lazy(() =>
  import('./pages/AnalyticsReportPage').then((m) => ({ default: m.AnalyticsReportPage })),
)
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })),
)
const LandingPage = lazy(() =>
  import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })),
)
const OrderDetailPage = lazy(() =>
  import('./pages/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })),
)
const OrderGroupsPage = lazy(() =>
  import('./pages/OrderGroupsPage').then((m) => ({ default: m.OrderGroupsPage })),
)
const OrdersPage = lazy(() =>
  import('./pages/OrdersPage').then((m) => ({ default: m.OrdersPage })),
)
const PackagingMaterialsPage = lazy(() =>
  import('./pages/PackagingMaterialsPage').then((m) => ({ default: m.PackagingMaterialsPage })),
)
const PackagingRulesPage = lazy(() =>
  import('./pages/PackagingRulesPage').then((m) => ({ default: m.PackagingRulesPage })),
)
const PackingPage = lazy(() =>
  import('./pages/PackingPage').then((m) => ({ default: m.PackingPage })),
)
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)
const ReturnsPage = lazy(() =>
  import('./pages/ReturnsPage').then((m) => ({ default: m.ReturnsPage })),
)
const OrderSyncSettingsPage = lazy(() =>
  import('./pages/OrderSyncSettingsPage').then((m) => ({ default: m.OrderSyncSettingsPage })),
)
const ShippingPage = lazy(() =>
  import('./pages/ShippingPage').then((m) => ({ default: m.ShippingPage })),
)
const StaffManagementPage = lazy(() =>
  import('./pages/StaffManagementPage').then((m) => ({ default: m.StaffManagementPage })),
)
const WarehouseInventoryPage = lazy(() =>
  import('./pages/WarehouseInventoryPage').then((m) => ({ default: m.WarehouseInventoryPage })),
)
const WarehousePage = lazy(() =>
  import('./pages/WarehousePage').then((m) => ({ default: m.WarehousePage })),
)
const AdminPage = lazy(() => import('./pages/AdminPage'))

function PageFallback() {
  return (
    <div className="grid min-h-[40vh] place-items-center text-sm text-slate-500" role="status">
      Đang tải…
    </div>
  )
}

function PortalRoot() {
  return (
    <PortalProvider>
      <MfaDisabledNotice />
      <Outlet />
    </PortalProvider>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route index element={<LandingPage />} />
          <Route path="oauth-success" element={<OAuthSuccessPage />} />
          <Route
            path="marketplace-oauth-success"
            element={<MarketplaceOAuthSuccessPage />}
          />
          <Route path="reset-password" element={<ResetPasswordPage />} />

          <Route element={<GuestRoute />}>
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
          </Route>

          <Route element={<ForceChangeRoute />}>
            <Route path="change-password" element={<ChangePasswordPage />} />
          </Route>

          <Route path="app" element={<ProtectedRoute />}>
            <Route element={<PortalRoot />}>
              <Route element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="orders/:id" element={<OrderDetailPage />} />
                <Route path="order-groups" element={<OrderGroupsPage />} />
                <Route path="returns" element={<ReturnsPage />} />
                <Route path="order-sync" element={<OrderSyncSettingsPage />} />
                <Route path="warehouse" element={<WarehousePage />} />
                <Route path="inventory" element={<WarehouseInventoryPage />} />
                <Route path="packing" element={<PackingPage />} />
                <Route path="shipping" element={<ShippingPage />} />
                <Route path="packaging-rules" element={<PackagingRulesPage />} />
                <Route path="packaging-materials" element={<PackagingMaterialsPage />} />
                <Route path="staff" element={<StaffManagementPage />} />
                <Route path="analytics" element={<AnalyticsReportPage />} />
                <Route path="history" element={<HistoryPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="settings" element={<ProfilePage />} />
              </Route>
              <Route path="admin" element={<AdminLayout />}>
                <Route index element={<AdminPage />} />
                <Route path="roles" element={<AdminRolesPage />} />
                <Route path="marketplace" element={<AdminMarketplacePage />} />
                <Route path="orders" element={<AdminOrdersPage />} />
                <Route path="orders/:id" element={<AdminOrderDetailPage />} />
                <Route path="order-sync" element={<OrderSyncSettingsPage />} />
                <Route path="ai" element={<Navigate to="/app/admin" replace />} />
                <Route path="packing-plans" element={<AdminPackingPlansPage />} />
                <Route path="warehouse" element={<AdminWarehousePage />} />
                <Route path="packaging-materials" element={<PackagingMaterialsPage />} />
                <Route path="returns" element={<ReturnsPage shell="admin" />} />
                <Route path="history" element={<HistoryPage shell="admin" />} />
              </Route>
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
