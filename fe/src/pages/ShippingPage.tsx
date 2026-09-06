import { useState, useMemo, useEffect } from 'react'
import {
  Truck,
  CheckCircle2,
  ChevronDown,
  Printer,
  Download,
  MapPin,
  Eye,
  Check,
  ShieldCheck,
  X,
} from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import {
  CARRIER_TABS,
  CARRIER_ACCOUNTS,
  INITIAL_SCANNED_PACKAGES,
  DEFAULT_HANDOVER_BATCH,
  type ShippingPackageItem,
  type PackageShippingStatus,
} from '../data/shipping-mock'

/** Crisp 4-bars Barcode icon matching screenshot `||||` */
function BarcodeLineIcon({ className = 'text-slate-700 dark:text-slate-300' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[2.5px] shrink-0 ${className}`} aria-hidden="true">
      <span className="h-4 w-[2.5px] rounded-xs bg-current" />
      <span className="h-4 w-[1.5px] rounded-xs bg-current" />
      <span className="h-4 w-[3px] rounded-xs bg-current" />
      <span className="h-4 w-[1.5px] rounded-xs bg-current" />
    </span>
  )
}

/** Stylized Neon Blue Fountain Pen / Stylus Nib matching screenshot */
function StylusSignatureGraphic() {
  return (
    <div className="relative flex items-center justify-center py-0.5">
      <svg
        width="135"
        height="36"
        viewBox="0 0 150 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-[#3b82f6] drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]"
      >
        {/* Pen Body & Nib Outline */}
        <path
          d="M12 28L42 12L105 18L138 24L105 30L42 36L12 28Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Inner Facet Lines */}
        <path
          d="M42 12L68 24L42 36"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.8"
        />
        <path
          d="M68 24H122"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Breather Hole */}
        <circle cx="100" cy="24" r="2.5" fill="currentColor" />
        {/* Nib Tip Taper */}
        <path
          d="M122 24L138 24"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Base Ring Accent */}
        <path
          d="M26 18L26 34"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeOpacity="0.6"
        />
      </svg>
    </div>
  )
}

export function ShippingPage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'

  // Carrier tabs state
  const [selectedCarrierId, setSelectedCarrierId] = useState<string>('spx')
  const [carrierDropdownOpen, setCarrierDropdownOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(CARRIER_ACCOUNTS[0]!)

  // Scanning input state
  const [scanInput, setScanInput] = useState('')
  const [autoScanActive, setAutoScanActive] = useState(false)

  // Package items list state
  const [packages, setPackages] = useState<ShippingPackageItem[]>(INITIAL_SCANNED_PACKAGES)

  // Handover batch info state (synchronized total weight starts at 28.5 kg)
  const [batchInfo, setBatchInfo] = useState(DEFAULT_HANDOVER_BATCH)

  // Modals & toast notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [batchCompleted, setBatchCompleted] = useState(false)

  // Synchronized session total weight matching batch total weight (Requirement 1: 28.5 kg)
  const sessionTotalWeight = useMemo(() => {
    return batchInfo.totalWeightKg.toFixed(1)
  }, [batchInfo.totalWeightKg])

  // Show auto-dismiss toast
  const showToast = (msg: string) => {
    setToastMessage(msg)
    window.setTimeout(() => setToastMessage(null), 3500)
  }

  // Handle continuous barcode scanning
  const handleScanSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const query = scanInput.trim().toUpperCase()
    if (!query) return

    // Find if package already exists in current session
    const existingIndex = packages.findIndex(
      (p) => p.trackingCode.toUpperCase() === query || p.orderCode.toUpperCase() === query,
    )

    if (existingIndex !== -1) {
      const existingPkg = packages[existingIndex]!
      if (existingPkg.status === 'pending') {
        setPackages((prev) =>
          prev.map((item, idx) =>
            idx === existingIndex ? { ...item, status: 'scanned' } : item,
          ),
        )
        setBatchInfo((prev) => ({
          ...prev,
          scannedCount: Math.min(prev.totalCount, prev.scannedCount + 1),
          totalWeightKg: +(prev.totalWeightKg + existingPkg.weightKg).toFixed(1),
        }))
        showToast(
          vi
            ? `Đã quét kiện hàng ${existingPkg.trackingCode} (${existingPkg.orderCode})!`
            : `Scanned package ${existingPkg.trackingCode} (${existingPkg.orderCode})!`,
        )
      } else {
        showToast(
          vi
            ? `Kiện hàng ${existingPkg.trackingCode} đã được quét trước đó.`
            : `Package ${existingPkg.trackingCode} was already scanned.`,
        )
      }
    } else {
      // Create new scanned package
      const newPkg: ShippingPackageItem = {
        id: `pkg-${Date.now()}`,
        trackingCode: query.startsWith('SPX') ? query : `SPX${query}`,
        orderCode: `ORD-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        weightKg: +(0.2 + Math.random() * 1.5).toFixed(2),
        destination: 'Ho Chi Minh City, VN',
        status: 'scanned',
      }
      setPackages((prev) => [newPkg, ...prev])
      setBatchInfo((prev) => ({
        ...prev,
        scannedCount: Math.min(prev.totalCount, prev.scannedCount + 1),
        totalWeightKg: +(prev.totalWeightKg + newPkg.weightKg).toFixed(1),
      }))
      showToast(
        vi
          ? `Đã quét và thêm kiện hàng mới ${newPkg.trackingCode}!`
          : `Scanned and added new package ${newPkg.trackingCode}!`,
      )
    }

    setScanInput('')
  }

  // Toggle package status directly from table row (Requirement 2: Toggle between 'scanned' & 'pending')
  const handleTogglePackageStatus = (id: string) => {
    setPackages((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const nextStatus: PackageShippingStatus = item.status === 'scanned' ? 'pending' : 'scanned'

        // Synchronize batch counts and weight
        setBatchInfo((b) => ({
          ...b,
          scannedCount:
            nextStatus === 'scanned'
              ? Math.min(b.totalCount, b.scannedCount + 1)
              : Math.max(0, b.scannedCount - 1),
          totalWeightKg:
            nextStatus === 'scanned'
              ? +(b.totalWeightKg + item.weightKg).toFixed(1)
              : +Math.max(0, b.totalWeightKg - item.weightKg).toFixed(1),
        }))

        showToast(
          vi
            ? `Cập nhật ${item.trackingCode} sang trạng thái: ${
                nextStatus === 'scanned' ? 'ĐÃ QUÉT' : 'CHỜ QUÉT'
              }`
            : `Updated ${item.trackingCode} to: ${
                nextStatus === 'scanned' ? 'SCANNED' : 'AWAITING SCAN'
              }`,
        )
        return { ...item, status: nextStatus }
      }),
    )
  }

  // Handle Export Manifest (PDF/Excel)
  const handleExportManifest = () => {
    showToast(
      vi
        ? `Đang xuất biên bản bàn giao (${batchInfo.batchCode}) định dạng Excel & PDF...`
        : `Exporting handover manifest (${batchInfo.batchCode}) in Excel & PDF...`,
    )
  }

  // Handle Print Handover Sheet
  const handlePrintHandover = () => {
    showToast(
      vi
        ? `Đang gửi lệnh in phiếu bàn giao ${batchInfo.batchCode} tới Zebra Printer...`
        : `Sending print job for ${batchInfo.batchCode} to Zebra Printer...`,
    )
  }

  // Complete handover confirmation
  const handleCompleteHandover = () => {
    setBatchCompleted(true)
    setConfirmModalOpen(false)
    showToast(
      vi
        ? `Đã hoàn tất bàn giao lô hàng ${batchInfo.batchCode} cho tài xế ${batchInfo.driverName} (${batchInfo.carrierName}) thành công!`
        : `Handover batch ${batchInfo.batchCode} successfully transferred to ${batchInfo.driverName} (${batchInfo.carrierName})!`,
    )
  }

  // Keyboard shortcut listeners (Ctrl+E, Ctrl+P, Ctrl+Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+E or Meta+E -> Export
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        handleExportManifest()
      }
      // Ctrl+P or Meta+P -> Print
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        handlePrintHandover()
      }
      // Ctrl+Enter or Meta+Enter -> Complete Handover
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        setConfirmModalOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [batchInfo])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Top Breadcrumb Navigation */}
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Vận chuyển' : 'Shipping & Handover' },
        ]}
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto max-w-7xl space-y-4">
          {/* Toast Notification Banner */}
          {toastMessage && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs sm:text-sm font-semibold text-blue-800 shadow-sm transition-all dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>{toastMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="rounded p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer"
                aria-label="Dismiss toast"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* ========================================================= */}
          {/* 1. TOP CARRIER TABS (MATCHING SCREENSHOT HORIZONTAL PILLS)*/}
          {/* ========================================================= */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {CARRIER_TABS.map((tab) => {
              const isSelected = selectedCarrierId === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedCarrierId(tab.id)}
                  className={`inline-flex items-center gap-2 shrink-0 rounded-xl px-4 py-2 text-xs sm:text-sm font-medium transition-colors cursor-pointer select-none ${
                    isSelected
                      ? 'bg-[#2563eb] text-white shadow-xs'
                      : 'border border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-surface-1 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>
                    {tab.id === 'all'
                      ? vi
                        ? 'Tất cả hãng vận chuyển'
                        : 'All Couriers'
                      : tab.name}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      isSelected
                        ? 'bg-[#1d4ed8] text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ========================================================= */}
          {/* 2. MAIN 2-COLUMN LAYOUT (LEFT WORKSPACE & RIGHT DARK CARD)*/}
          {/* ========================================================= */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
            {/* ======================================================= */}
            {/* LEFT COLUMN (COL 1-8): CONTROLS, SCANNER & SCANNED LIST */}
            {/* ======================================================= */}
            <div className="lg:col-span-8 space-y-4">
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1 space-y-4">
                {/* 2.1 Carrier Account & Driver Assignment Row */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Select Carrier Account */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      {vi ? 'Chọn tài khoản hãng vận chuyển' : 'Select carrier account'}
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setCarrierDropdownOpen((o) => !o)}
                        className="w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-left text-xs sm:text-sm font-semibold text-slate-800 shadow-2xs hover:border-slate-300 transition-colors flex items-center justify-between dark:border-slate-800 dark:bg-surface-1 dark:text-slate-100 cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <Truck className="h-4 w-4 text-slate-600 dark:text-slate-300 shrink-0" />
                          <span className="truncate">
                            {selectedAccount.name} ({selectedAccount.hub})
                          </span>
                        </div>
                        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                      </button>

                      {carrierDropdownOpen && (
                        <div className="absolute left-0 top-full mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl z-30 dark:border-slate-800 dark:bg-surface-1">
                          {CARRIER_ACCOUNTS.map((acc) => (
                            <button
                              key={acc.id}
                              type="button"
                              onClick={() => {
                                setSelectedAccount(acc)
                                setCarrierDropdownOpen(false)
                              }}
                              className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors flex items-center justify-between ${
                                acc.id === selectedAccount.id
                                  ? 'bg-blue-50 font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                  : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                              }`}
                            >
                              <span>
                                {acc.name} ({acc.hub})
                              </span>
                              {acc.id === selectedAccount.id && (
                                <Check className="h-3.5 w-3.5 text-blue-600" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Driver Registration Status */}
                  <div>
                    <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      {vi ? 'Trạng thái đăng ký tài xế' : 'Driver registration status'}
                    </span>
                    <div className="h-[42px] rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3.5 flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400 select-none">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="truncate">
                        {vi
                          ? 'Tài xế SPX Express đã xác minh được phân công'
                          : 'Verified SPX Express driver assigned'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2.2 Continuous Barcode Scanner Stream */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    {vi ? 'Luồng quét mã vạch liên tục' : 'Continuous barcode scan stream'}
                  </label>
                  <form onSubmit={handleScanSubmit} className="relative">
                    <div className="flex items-center rounded-xl border-2 border-[#6366f1]/50 bg-white px-3.5 py-2 transition-all focus-within:border-[#4f46e5] focus-within:ring-2 focus-within:ring-indigo-100 dark:border-indigo-500/50 dark:bg-surface-2/40 dark:focus-within:ring-indigo-950">
                      {/* Barcode Icon */}
                      <BarcodeLineIcon className="text-slate-700 dark:text-slate-300" />

                      {/* Input Box */}
                      <input
                        type="text"
                        value={scanInput}
                        onChange={(e) => setScanInput(e.target.value)}
                        placeholder={
                          vi
                            ? 'Quét hoặc nhập mã vận đơn ...'
                            : 'Scan or enter waybill tracking code ...'
                        }
                        className="ml-3 flex-1 bg-transparent text-xs sm:text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-hidden dark:text-slate-100"
                      />

                      {/* AUTO toggle button inside input */}
                      <button
                        type="button"
                        onClick={() => {
                          setAutoScanActive((v) => !v)
                          showToast(
                            !autoScanActive
                              ? vi
                                ? 'Đã bật chế độ tự động bắt mã quét!'
                                : 'Auto scan mode enabled!'
                              : vi
                                ? 'Đã tắt chế độ tự động bắt mã quét.'
                                : 'Auto scan mode disabled.',
                          )
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold font-mono tracking-wider transition-colors cursor-pointer select-none ${
                          autoScanActive
                            ? 'border-indigo-400 bg-indigo-600 text-white'
                            : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300'
                        }`}
                      >
                        <span>AUTO</span>
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </form>
                </div>

                {/* 2.3 Table Header Row - Synchronized Weight (Requirement 1: 28.5 kg) */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {vi ? 'Kiện hàng đã quét (Phiên làm việc)' : 'Scanned Packages (Session)'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {vi ? 'Tổng trọng lượng phiên: ' : 'Session total weight: '}
                    <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                      {sessionTotalWeight} kg
                    </span>
                  </p>
                </div>

                {/* 2.4 Table of Scanned Packages (Requirement 2: Solid Green "ĐÃ QUÉT" & Muted Gray/Yellow "CHỜ QUÉT") */}
                <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider dark:border-slate-800 dark:bg-surface-2/50 dark:text-slate-400">
                        <th className="py-3 px-3.5">
                          {vi ? 'MÃ VẬN ĐƠN' : 'WAYBILL'}
                        </th>
                        <th className="py-3 px-3.5">
                          {vi ? 'MÃ ĐƠN HÀNG' : 'ORDER ID'}
                        </th>
                        <th className="py-3 px-3.5">
                          {vi ? 'TRỌNG LƯỢNG' : 'WEIGHT'}
                        </th>
                        <th className="py-3 px-3.5">
                          {vi ? 'ĐIỂM ĐẾN' : 'DESTINATION'}
                        </th>
                        <th className="py-3 px-3.5 text-right sm:text-left">
                          {vi ? 'TRẠNG THÁI' : 'STATUS'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {packages.map((pkg) => (
                        <tr
                          key={pkg.id}
                          onClick={() => handleTogglePackageStatus(pkg.id)}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer dark:hover:bg-surface-2/40"
                          title={
                            vi
                              ? 'Nhấp để chuyển trạng thái giữa "ĐÃ QUÉT" và "CHỜ QUÉT"'
                              : 'Click to toggle status between "SCANNED" and "AWAITING SCAN"'
                          }
                        >
                          {/* Waybill */}
                          <td className="py-3 px-3.5">
                            <div className="flex items-center gap-2">
                              <BarcodeLineIcon className="text-slate-400" />
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                {pkg.trackingCode}
                              </span>
                            </div>
                          </td>

                          {/* Order ID */}
                          <td className="py-3 px-3.5 font-mono text-slate-500 dark:text-slate-400">
                            {pkg.orderCode}
                          </td>

                          {/* Weight */}
                          <td className="py-3 px-3.5 font-mono font-medium text-slate-700 dark:text-slate-300">
                            {pkg.weightKg.toFixed(2)} kg
                          </td>

                          {/* Destination */}
                          <td className="py-3 px-3.5">
                            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                              <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{pkg.destination}</span>
                            </div>
                          </td>

                          {/* Status Badge (Standardized: Solid Green "ĐÃ QUÉT" vs Muted Gray/Yellow "CHỜ QUÉT") */}
                          <td className="py-3 px-3.5 text-right sm:text-left">
                            {pkg.status === 'scanned' ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white tracking-wider uppercase shadow-2xs select-none">
                                <Check className="h-3 w-3 stroke-[3]" />
                                <span>{vi ? 'ĐÃ QUÉT' : 'SCANNED'}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md border border-amber-300/80 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 tracking-wider uppercase dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300 select-none">
                                <span>{vi ? 'CHỜ QUÉT' : 'AWAITING SCAN'}</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ======================================================= */}
            {/* RIGHT COLUMN (COL 9-12): COMPACT DARK SUMMARY PANEL     */}
            {/* Requirement 3: Optimized padding and spacing to prevent */}
            {/* vertical overflow and clipping of digital signature box */}
            {/* ======================================================= */}
            <div className="lg:col-span-4">
              <div className="rounded-2xl bg-[#0b1329] text-white p-4 sm:p-5 shadow-xl border border-slate-800 space-y-3.5 select-none">
                {/* 3.1 Batch Header */}
                <div>
                  <span className="block text-[10px] sm:text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    {vi ? 'TỔNG HỢP DỮ LIỆU LÔ' : 'BATCH DATA SUMMARY'}
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white mt-0.5">
                    {batchInfo.batchCode}
                  </h2>
                </div>

                {/* 3.2 Handover Progress */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-slate-300">
                      {vi ? 'Số lần quét bàn giao' : 'Handover scan count'}
                    </span>
                    <span className="font-bold text-white font-mono">
                      {batchInfo.scannedCount} / {batchInfo.totalCount} {vi ? 'kiện hàng' : 'packages'}
                    </span>
                  </div>

                  {/* Green Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-[#22c55e] rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.round(
                          (batchInfo.scannedCount / batchInfo.totalCount) * 100,
                        )}%`,
                      }}
                    />
                  </div>

                  <p className="text-[11px] text-slate-400 leading-tight">
                    {vi ? batchInfo.remainingNoteVi : batchInfo.remainingNoteEn}
                  </p>
                </div>

                {/* 3.3 Metric Cards (Weight & Volume) - Synchronized (Requirement 1: 28.5 kg) */}
                <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                  <div className="rounded-xl bg-[#131d38] border border-slate-800/80 p-2.5 sm:p-3">
                    <span className="text-[11px] text-slate-400 font-medium">
                      {vi ? 'Tổng trọng lượng' : 'Total weight'}
                    </span>
                    <p className="mt-1 text-xl sm:text-2xl font-bold text-white font-mono tracking-tight">
                      {batchInfo.totalWeightKg.toFixed(1)} kg
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#131d38] border border-slate-800/80 p-2.5 sm:p-3">
                    <span className="text-[11px] text-slate-400 font-medium">
                      {vi ? 'Thể tích ước tính' : 'Estimated volume'}
                    </span>
                    <p className="mt-1 text-xl sm:text-2xl font-bold text-white font-mono tracking-tight">
                      {batchInfo.estimatedVolumeCbm.toFixed(2)} CBM
                    </p>
                  </div>
                </div>

                {/* 3.4 Verified Driver Info (Compact) */}
                <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                  <span className="block text-[10px] sm:text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    {vi ? 'THÔNG TIN TÀI XẾ ĐÃ XÁC MINH' : 'VERIFIED DRIVER INFO'}
                  </span>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">
                        {vi ? 'Tên tài xế' : 'Driver name'}
                      </span>
                      <span className="font-semibold text-white">
                        {batchInfo.driverName}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">
                        {vi ? 'Số điện thoại' : 'Phone number'}
                      </span>
                      <span className="font-semibold text-white font-mono">
                        {batchInfo.driverPhone}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">
                        {vi ? 'Biển số xe' : 'License plate'}
                      </span>
                      <span className="font-semibold text-white font-mono">
                        {batchInfo.driverPlate}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3.5 Digital Signature Verification (Requirement 3: Fits neatly without clipping) */}
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <span className="block text-[10px] sm:text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    {vi ? 'XÁC NHẬN CHỮ KÝ' : 'SIGNATURE VERIFICATION'}
                  </span>

                  <div className="rounded-xl bg-[#131d38]/70 border border-slate-800 px-3 py-2.5 flex flex-col items-center justify-center text-center">
                    {/* Glowing Stylus Graphic */}
                    <StylusSignatureGraphic />

                    <p className="text-[10.5px] text-slate-400 mt-1">
                      {vi
                        ? 'Xác minh số qua mã định danh tài xế SPX'
                        : 'Digitally verified via SPX driver ID'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. BOTTOM FIXED/STICKY ACTION BAR WITH KEYBOARD SHORTCUTS */}
      {/* Requirement 4: High Contrast & Clear Shortcut Badges      */}
      {/* ========================================================= */}
      <footer className="sticky bottom-0 z-20 border-t border-slate-200/90 bg-white/95 backdrop-blur-xs py-3 px-4 sm:px-6 shadow-sm dark:border-slate-800 dark:bg-surface-1/95">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-3">
          {/* Left Action Buttons */}
          <div className="flex items-center gap-2.5">
            {/* Export Manifest */}
            <button
              type="button"
              onClick={handleExportManifest}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3.5 font-semibold text-xs text-slate-800 shadow-xs hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900 active:bg-slate-100 transition-colors flex items-center gap-2 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-surface-1 dark:text-slate-100 dark:hover:bg-slate-800"
              aria-label={
                vi
                  ? 'Xuất biên bản (PDF/Excel), phím tắt Ctrl+E'
                  : 'Export Manifest (PDF/Excel), shortcut Ctrl+E'
              }
            >
              <Download className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              <span>{vi ? 'Xuất biên bản (PDF/Excel)' : 'Export Manifest (PDF/Excel)'}</span>
              <kbd className="hidden sm:inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-mono font-semibold text-slate-700 border border-slate-300 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 shadow-2xs">
                Ctrl+E
              </kbd>
            </button>

            {/* Print Handover Slip */}
            <button
              type="button"
              onClick={handlePrintHandover}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3.5 font-semibold text-xs text-slate-800 shadow-xs hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900 active:bg-slate-100 transition-colors flex items-center gap-2 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-surface-1 dark:text-slate-100 dark:hover:bg-slate-800"
              aria-label={
                vi
                  ? 'In phiếu bàn giao, phím tắt Ctrl+P'
                  : 'Print Handover Slip, shortcut Ctrl+P'
              }
            >
              <Printer className="h-4 w-4 text-slate-700 dark:text-slate-300" />
              <span>{vi ? 'In phiếu bàn giao' : 'Print Handover Slip'}</span>
              <kbd className="hidden sm:inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-mono font-semibold text-slate-700 border border-slate-300 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 shadow-2xs">
                Ctrl+P
              </kbd>
            </button>
          </div>

          {/* Right Primary Action Button */}
          <div>
            <button
              type="button"
              onClick={() => setConfirmModalOpen(true)}
              className={`h-10 rounded-xl px-4 sm:px-5 font-semibold text-xs sm:text-sm text-white shadow-md transition-all flex items-center gap-2.5 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-600 ${
                batchCompleted
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25 ring-2 ring-emerald-500/20'
                  : 'bg-[#4338ca] hover:bg-[#3730a3] active:bg-[#312e81] shadow-indigo-600/30'
              }`}
              aria-label={
                batchCompleted
                  ? vi
                    ? 'Đã bàn giao thành công'
                    : 'Handover Completed'
                  : vi
                    ? 'Hoàn tất bàn giao cho hãng vận chuyển, phím tắt Ctrl+Enter'
                    : 'Complete Carrier Handover, shortcut Ctrl+Enter'
              }
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                {batchCompleted
                  ? vi
                    ? 'Đã bàn giao thành công'
                    : 'Handover Completed'
                  : vi
                    ? 'Hoàn tất bàn giao cho hãng vận chuyển'
                    : 'Complete Carrier Handover'}
              </span>
              <kbd className="hidden sm:inline-block rounded-md bg-white/25 px-2 py-0.5 text-[11px] font-mono font-bold text-white border border-white/30 tracking-wide">
                Ctrl+Enter
              </kbd>
            </button>
          </div>
        </div>
      </footer>

      {/* ========================================================= */}
      {/* 5. CONFIRMATION MODAL FOR HANDOVER COMPLETION             */}
      {/* ========================================================= */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-surface-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-indigo-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {vi ? 'Xác nhận bàn giao lô hàng' : 'Confirm Batch Handover'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <p>
                {vi
                  ? `Bạn sắp xác nhận bàn giao toàn bộ kiện hàng thuộc lô ${batchInfo.batchCode} cho đối tác vận chuyển:`
                  : `You are about to complete the handover for batch ${batchInfo.batchCode} to the carrier partner:`}
              </p>

              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200/80 space-y-1.5 dark:bg-surface-2 dark:border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-400">{vi ? 'Đơn vị vận chuyển:' : 'Carrier:'}</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{batchInfo.carrierName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{vi ? 'Tài xế tiếp nhận:' : 'Assigned driver:'}</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{batchInfo.driverName} ({batchInfo.driverPlate})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{vi ? 'Tổng số kiện đã quét:' : 'Total scanned packages:'}</span>
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{packages.length} {vi ? 'kiện hàng' : 'packages'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{vi ? 'Tổng trọng lượng:' : 'Total weight:'}</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{batchInfo.totalWeightKg.toFixed(1)} kg</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 italic">
                {vi
                  ? '* Hệ thống sẽ tự động cập nhật trạng thái đơn hàng sang "Đang vận chuyển" và gửi webhook đồng bộ lên sàn.'
                  : '* The system will automatically update the order status to "In Transit" and sync webhooks to marketplaces.'}
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                {vi ? 'Hủy' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleCompleteHandover}
                className="rounded-xl bg-[#4338ca] hover:bg-[#3730a3] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors cursor-pointer"
              >
                {vi ? 'Xác nhận bàn giao' : 'Confirm Handover'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
