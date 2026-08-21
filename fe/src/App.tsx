import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import {
  ForceChangeRoute,
  GuestRoute,
  ProtectedRoute,
} from './components/auth/ProtectedRoute'
import { AdminLayout } from './components/layout/AdminLayout'
import { AppLayout } from './components/layout/AppLayout'
import { AuthProvider } from './context/auth-provider'
import { PortalProvider } from './context/portal-provider'
import { AdminAiPage } from './pages/AdminAiPage'
import AdminPage from './pages/AdminPage'
import { AdminRolesPage } from './pages/AdminRolesPage'
import { AdminTemplatesPage } from './pages/AdminTemplatesPage'
import { AnalyticsReportPage } from './pages/AnalyticsReportPage'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { DashboardPage } from './pages/DashboardPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { OAuthSuccessPage } from './pages/OAuthSuccessPage'
import { OrdersPage } from './pages/OrdersPage'
import { PackagingRulesPage } from './pages/PackagingRulesPage'
import { PackingPage } from './pages/PackingPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { ShippingPage } from './pages/ShippingPage'

function PortalRoot() {
  return (
    <PortalProvider>
      <Outlet />
    </PortalProvider>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route index element={<LandingPage />} />
          <Route path="oauth-success" element={<OAuthSuccessPage />} />
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
                <Route path="packing" element={<PackingPage />} />
                <Route path="shipping" element={<ShippingPage />} />
                <Route path="packaging-rules" element={<PackagingRulesPage />} />
                <Route path="analytics" element={<AnalyticsReportPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="settings" element={<ProfilePage />} />
              </Route>
              <Route path="admin" element={<AdminLayout />}>
                <Route index element={<AdminPage />} />
                <Route path="roles" element={<AdminRolesPage />} />
                <Route path="ai" element={<AdminAiPage />} />
                <Route path="templates" element={<AdminTemplatesPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
