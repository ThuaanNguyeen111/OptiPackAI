import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AdminLayout } from './components/layout/AdminLayout'
import { AppLayout } from './components/layout/AppLayout'
import { PortalProvider } from './context/portal-provider'
import { AnalyticsReportPage } from './pages/AnalyticsReportPage'
import { AdminAiPage } from './pages/AdminAiPage'
import AdminPage from './pages/AdminPage'
import { AdminSettingsPage } from './pages/AdminSettingsPage'
import { DashboardPage } from './pages/DashboardPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { OrdersPage } from './pages/OrdersPage'
import { PackagingRulesPage } from './pages/PackagingRulesPage'
import { PackingPage } from './pages/PackingPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'
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
      <Routes>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="app" element={<PortalRoot />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="packing" element={<PackingPage />} />
            <Route path="shipping" element={<ShippingPage />} />
            <Route path="packaging-rules" element={<PackagingRulesPage />} />
            <Route path="analytics" element={<AnalyticsReportPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Route>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminPage />} />
            <Route path="ai" element={<AdminAiPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
