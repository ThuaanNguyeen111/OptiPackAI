import { Header } from '../components/layout/Header'
import { PlatformConnectionCard } from '../components/integrations/PlatformConnectionCard'
import { SyncEventLog } from '../components/integrations/SyncEventLog'
import {
  mockIntegrations,
  mockSyncLogs,
} from '../data/mock-integrations'

export function IntegrationsPage() {
  return (
    <>
      <Header
        title="Kết nối sàn"
        description="Webhook đồng bộ đơn từ Shopee và TikTok Shop"
      />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="grid gap-4 md:grid-cols-2">
            {mockIntegrations.map((integration) => (
              <PlatformConnectionCard
                key={integration.marketplace}
                integration={integration}
              />
            ))}
          </section>

          <section>
            <div className="mb-4">
              <h2 className="text-sm font-medium text-ink">Nhật ký đồng bộ</h2>
              <p className="text-xs text-ink-subtle">
                Flow: Trigger order event → Call Webhook → Ingest → Normalize
              </p>
            </div>
            <SyncEventLog events={mockSyncLogs} />
          </section>
        </div>
      </main>
    </>
  )
}
