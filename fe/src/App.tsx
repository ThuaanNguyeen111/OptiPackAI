import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { ConsolidationPage } from './pages/ConsolidationPage'
import { DashboardPage } from './pages/DashboardPage'
import { IntegrationsPage } from './pages/IntegrationsPage'
import { OrderDetailPage } from './pages/OrderDetailPage'
import { OrdersPage } from './pages/OrdersPage'
import { PlaceholderPage } from './pages/PlaceholderPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/consolidation" element={<ConsolidationPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />
          <Route
            path="packaging"
            element={
              <PlaceholderPage
                title="Đóng gói AI"
                description="Gợi ý 3D bin packing và tối ưu hộp"
              />
            }
          />
          <Route
            path="shipping"
            element={
              <PlaceholderPage
                title="Vận chuyển"
                description="Ước tính phí ship và tạo nhãn"
              />
            }
          />
          <Route
            path="fulfillment"
            element={
              <PlaceholderPage
                title="Fulfillment"
                description="Theo dõi picking và packing"
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
