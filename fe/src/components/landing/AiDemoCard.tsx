import { Box, Package } from 'lucide-react'

export function AiDemoCard() {
  return (
    <section id="ai-engine" className="scroll-mt-20 px-4 pb-20 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 text-center">
          <p className="text-xs font-medium tracking-wider text-primary-hover uppercase">
            Demo AI trực tiếp
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Từ đơn gộp đến đóng gói tối ưu
          </h2>
        </div>

        <div className="overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
            <span className="ml-3 font-mono text-xs text-ink-subtle">
              optipack-ai · packing-engine
            </span>
          </div>

          <div className="grid md:grid-cols-2">
            <div className="border-b border-hairline p-5 md:border-r md:border-b-0">
              <div className="mb-4 flex items-center gap-2 text-sm text-ink-muted">
                <Package className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />
                Đầu vào đơn · Đã gộp
              </div>
              <p className="text-sm font-medium text-ink">Nguyễn Minh Anh</p>
              <p className="mt-0.5 font-mono text-xs text-ink-subtle">
                0901234567 · Q.5, TP.HCM
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-md border border-shopee/30 bg-shopee/10 px-2 py-0.5 font-mono text-[11px] text-shopee">
                  Shopee · SP-8829103
                </span>
                <span className="rounded-md border border-tiktok/30 bg-tiktok/10 px-2 py-0.5 font-mono text-[11px] text-tiktok">
                  TikTok · TT-4412098
                </span>
              </div>

              <ul className="mt-5 space-y-2.5">
                {[
                  { sku: 'SKU-A01', name: 'Áo thun basic', qty: 2 },
                  { sku: 'SKU-B02', name: 'Quần short kaki', qty: 1 },
                  { sku: 'SKU-C03', name: 'Mũ bucket', qty: 1 },
                ].map((item) => (
                  <li
                    key={item.sku}
                    className="flex items-center justify-between rounded-md border border-hairline bg-canvas/60 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm text-ink">{item.name}</p>
                      <p className="font-mono text-[11px] text-ink-subtle">{item.sku}</p>
                    </div>
                    <span className="font-mono text-xs text-ink-muted">×{item.qty}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 font-mono text-xs text-ink-subtle">
                3 sản phẩm · đã gộp 2 kênh
              </p>
            </div>

            <div className="bg-surface-2 p-5">
              <div className="mb-4 flex items-center gap-2 text-sm text-ink-muted">
                <Box className="h-4 w-4 text-tiktok" strokeWidth={1.75} />
                Kết quả gợi ý AI
              </div>

              <dl className="space-y-3">
                {[
                  { label: 'Loại hộp', value: 'Carton-A2', accent: false },
                  { label: 'Kích thước', value: '25×15×10 cm', accent: false },
                  { label: 'Khoảng trống', value: '8%', accent: true },
                  { label: 'Chèn lót', value: 'Bubble Wrap', accent: false },
                  { label: 'Ước tiết kiệm', value: '18.5%', accent: true },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between border-b border-hairline/60 pb-2.5 last:border-0"
                  >
                    <dt className="text-xs text-ink-subtle">{row.label}</dt>
                    <dd
                      className={`font-mono text-sm font-medium ${
                        row.accent ? 'text-success' : 'text-ink'
                      }`}
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 rounded-md border border-primary/30 bg-primary/10 px-3 py-2.5">
                <p className="font-mono text-[11px] leading-relaxed text-primary-hover">
                  {'>'} 3D bin packing · OR-Tools · fill_ratio=0.92 · fragile_safe=true
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
