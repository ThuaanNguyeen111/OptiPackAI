import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { EmbedPlanFrame } from '../components/embed/EmbedPlanFrame'
import { MaterialTags } from '../components/packing/MaterialTags'
import { GuideSteps } from '../components/packing/GuideSteps'
import { BoxComparisonTable } from '../components/packing/BoxComparisonTable'
import { selectParcel } from '../utils/packing-layout'

/**
 * Trang CHỈ có hướng dẫn đóng gói của một kiện (vật tư, các bước, so sánh thùng), để app mobile nhúng trong
 * WebView (`/embed/packing/:groupId/guide?parcel=N`). Khung 3D ở trang riêng `/embed/packing/:groupId`.
 */
export function EmbedGuidePage() {
  const { groupId = '' } = useParams()
  const [search] = useSearchParams()
  const [parcelNo, setParcelNo] = useState<number | null>(Number(search.get('parcel')) || null)

  return (
    <EmbedPlanFrame groupId={groupId}>
      {(plan) => {
        const parcel = selectParcel(plan, parcelNo)
        if (!plan || !parcel) {
          return (
            <div className="flex h-svh items-center justify-center bg-[#f8faff] p-6 text-center text-sm text-slate-600">
              Nhóm này chưa có kế hoạch đóng gói.
            </div>
          )
        }
        return (
          <div className="h-svh overflow-y-auto bg-[#f8faff] text-slate-800">
            <div className="space-y-5 px-4 pt-4 pb-8">
              <header>
                <h1 className="text-base font-bold">
                  {parcel.box.name} · Kiện {parcel.parcelNo}/{plan.parcels.length}
                </h1>
                {plan.parcels.length > 1 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {plan.parcels.map((p) => (
                      <button
                        key={p.parcelNo}
                        type="button"
                        onClick={() => setParcelNo(p.parcelNo)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                          p.parcelNo === parcel.parcelNo
                            ? 'border-[#152d35] bg-[#152d35] text-white'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        Kiện {p.parcelNo}
                      </button>
                    ))}
                  </div>
                ) : null}
              </header>

              {parcel.materials.length > 0 ? (
                <section>
                  <h4 className="mb-2 text-sm font-semibold">Vật tư của kiện</h4>
                  <MaterialTags materials={parcel.materials} />
                </section>
              ) : null}

              <GuideSteps guide={parcel.guide} vi busy={false} />

              {parcel.boxComparison ? (
                <section>
                  <h4 className="mb-2 text-sm font-semibold">So sánh thùng</h4>
                  <BoxComparisonTable
                    comparison={parcel.boxComparison}
                    vi
                    itemCount={parcel.placements?.length ?? null}
                  />
                </section>
              ) : null}
            </div>
          </div>
        )
      }}
    </EmbedPlanFrame>
  )
}
