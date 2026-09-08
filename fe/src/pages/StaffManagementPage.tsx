import { useState, useMemo, useEffect } from 'react'
import {
  Users,
  Plus,
  Search,
  MapPin,
  Boxes,
  Truck,
  CheckCircle2,
  AlertCircle,
  X,
  Edit3,
  Trash2,
  RotateCcw,
  ClipboardList,
  Download,
  Phone,
  Clock,
  Sparkles,
  Check,
} from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import {
  type StaffMember,
  type StaffRole,
  type StaffStatus,
  type StaffShift,
  WORK_LOCATION_OPTIONS,
  STAFF_STORAGE_KEY,
  getStoredStaffList,
  addStaffMember,
  updateStaffMember,
  deleteStaffMember,
} from '../data/staff-mock'

export function StaffManagementPage() {
  const [staffList, setStaffList] = useState<StaffMember[]>(() => getStoredStaffList())
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<StaffStatus | 'all'>('all')
  const [locationFilter, setLocationFilter] = useState<string>('all')

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Modal Thêm nhân viên
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newStaffName, setNewStaffName] = useState('')
  const [newStaffCode, setNewStaffCode] = useState('')
  const [newStaffEmail, setNewStaffEmail] = useState('')
  const [newStaffPhone, setNewStaffPhone] = useState('')
  const [newStaffRole, setNewStaffRole] = useState<StaffRole>('warehouse')
  const [newStaffLocation, setNewStaffLocation] = useState(WORK_LOCATION_OPTIONS[0]!.label)
  const [newStaffShift, setNewStaffShift] = useState<StaffShift>('morning')
  const [newStaffStatus, setNewStaffStatus] = useState<StaffStatus>('available')
  const [newStaffNotes, setNewStaffNotes] = useState('')

  // Modal Điều chuyển vị trí nhanh
  const [reassignModalOpen, setReassignModalOpen] = useState(false)
  const [selectedStaffForReassign, setSelectedStaffForReassign] = useState<StaffMember | null>(null)
  const [reassignTargetLocation, setReassignTargetLocation] = useState('')

  // Modal Chỉnh sửa chi tiết
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null)

  // Đồng bộ event thay đổi từ storage
  useEffect(() => {
    const handleStorageUpdate = () => {
      setStaffList(getStoredStaffList())
    }
    window.addEventListener('optipack-staff-updated', handleStorageUpdate)
    return () => {
      window.removeEventListener('optipack-staff-updated', handleStorageUpdate)
    }
  }, [])

  // Show toast utility
  const showToast = (msg: string) => {
    setToastMessage(msg)
    window.setTimeout(() => setToastMessage(null), 3500)
  }

  // Tự động sinh mã nhân viên gợi ý khi đổi vai trò
  useEffect(() => {
    if (!isAddModalOpen) return
    const prefix =
      newStaffRole === 'warehouse'
        ? 'NV-KHO'
        : newStaffRole === 'packaging'
          ? 'NV-DG'
          : newStaffRole === 'shipping'
            ? 'NV-VC'
            : 'NV-QL'
    const count = staffList.filter((s) => s.role === newStaffRole).length + 1
    setNewStaffCode(`${prefix}-${String(count).padStart(2, '0')}`)
  }, [newStaffRole, isAddModalOpen, staffList])

  // Lọc danh sách nhân viên
  const filteredStaff = useMemo(() => {
    return staffList.filter((staff) => {
      // Search text
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = staff.name.toLowerCase().includes(q)
        const matchCode = staff.code.toLowerCase().includes(q)
        const matchPhone = staff.phone.includes(q)
        const matchLoc = staff.workLocation.toLowerCase().includes(q)
        const matchSkills = staff.skills?.some((s) => s.toLowerCase().includes(q))
        if (!matchName && !matchCode && !matchPhone && !matchLoc && !matchSkills) {
          return false
        }
      }
      // Role
      if (roleFilter !== 'all' && staff.role !== roleFilter) {
        return false
      }
      // Status
      if (statusFilter !== 'all' && staff.status !== statusFilter) {
        return false
      }
      // Location
      if (locationFilter !== 'all' && staff.workLocation !== locationFilter) {
        return false
      }
      return true
    })
  }, [staffList, searchQuery, roleFilter, statusFilter, locationFilter])

  // KPI Metrics
  const stats = useMemo(() => {
    const total = staffList.length
    const warehouseCount = staffList.filter((s) => s.role === 'warehouse').length
    const packagingCount = staffList.filter((s) => s.role === 'packaging').length
    const shippingCount = staffList.filter((s) => s.role === 'shipping').length
    const busyCount = staffList.filter((s) => s.status === 'busy').length
    const availableCount = staffList.filter((s) => s.status === 'available').length
    const offDutyCount = staffList.filter((s) => s.status === 'off_duty').length

    return {
      total,
      warehouseCount,
      packagingCount,
      shippingCount,
      busyCount,
      availableCount,
      offDutyCount,
    }
  }, [staffList])

  // Xử lý tạo mới nhân viên
  const handleCreateStaff = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newStaffName.trim()) {
      alert('Vui lòng nhập họ và tên nhân viên!')
      return
    }

    const matchedOption = WORK_LOCATION_OPTIONS.find((opt) => opt.label === newStaffLocation)
    const roleTitleMap: Record<StaffRole, string> = {
      warehouse: 'Nhân viên lấy hàng',
      packaging: 'Nhân viên đóng gói AI',
      shipping: 'Điều phối vận chuyển',
      manager: 'Quản lý cửa hàng',
    }

    const shiftTextMap: Record<StaffShift, string> = {
      morning: 'Ca sáng (07:30 - 15:30)',
      afternoon: 'Ca chiều (14:00 - 22:00)',
      office: 'Ca hành chính (08:00 - 17:30)',
    }

    // Tạo avatar mặc định hoặc từ initials
    const initials = newStaffName
      .trim()
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(-2)
      .toUpperCase()

    const created = addStaffMember({
      name: newStaffName.trim(),
      code: newStaffCode.trim() || `NV-${Math.floor(100 + Math.random() * 900)}`,
      avatar: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face`,
      initials,
      email: newStaffEmail.trim() || `${newStaffName.toLowerCase().replace(/\s+/g, '')}@optipackai.com`,
      phone: newStaffPhone.trim() || '0901 000 999',
      role: newStaffRole,
      roleTitle: roleTitleMap[newStaffRole],
      workLocation: newStaffLocation,
      zone: matchedOption?.zone,
      station: matchedOption?.station,
      shift: newStaffShift,
      shiftText: shiftTextMap[newStaffShift],
      status: newStaffStatus,
      activeBatches: 0,
      todayCompleted: 0,
      joinDate: new Date().toISOString().split('T')[0]!,
      notes: newStaffNotes.trim() || undefined,
    })

    setStaffList(getStoredStaffList())
    setIsAddModalOpen(false)
    showToast(`Đã thêm thành công nhân viên ${created.name} (${created.code}) phân công tại ${created.workLocation}!`)

    // Reset form
    setNewStaffName('')
    setNewStaffPhone('')
    setNewStaffEmail('')
    setNewStaffNotes('')
  }

  // Mở modal điều chuyển vị trí
  const handleOpenReassign = (staff: StaffMember) => {
    setSelectedStaffForReassign(staff)
    setReassignTargetLocation(staff.workLocation)
    setReassignModalOpen(true)
  }

  // Xác nhận điều chuyển vị trí
  const handleConfirmReassign = () => {
    if (!selectedStaffForReassign || !reassignTargetLocation) return

    const matchedOption = WORK_LOCATION_OPTIONS.find((opt) => opt.label === reassignTargetLocation)

    const updated = updateStaffMember(selectedStaffForReassign.id, {
      workLocation: reassignTargetLocation,
      zone: matchedOption?.zone,
      station: matchedOption?.station,
      // Nếu chuyển vai trò tương ứng với vị trí
      role: matchedOption ? matchedOption.role : selectedStaffForReassign.role,
    })

    if (updated) {
      setStaffList(getStoredStaffList())
      showToast(`Đã điều chuyển nhân viên ${updated.name} sang vị trí: ${reassignTargetLocation}!`)
    }
    setReassignModalOpen(false)
    setSelectedStaffForReassign(null)
  }

  // Đổi trạng thái nhanh (Sẵn sàng <-> Bận <-> Nghỉ ca)
  const handleToggleStatus = (staff: StaffMember) => {
    const nextStatus: Record<StaffStatus, StaffStatus> = {
      available: 'busy',
      busy: 'off_duty',
      off_duty: 'available',
    }
    const targetStatus = nextStatus[staff.status]
    const updated = updateStaffMember(staff.id, { status: targetStatus })
    if (updated) {
      setStaffList(getStoredStaffList())
      const labelMap = { available: 'Sẵn sàng', busy: 'Đang xử lý đơn', off_duty: 'Nghỉ ca' }
      showToast(`Đã đổi trạng thái của ${updated.name} thành: ${labelMap[targetStatus]}`)
    }
  }

  // Xóa nhân viên
  const handleDeleteStaff = (staff: StaffMember) => {
    if (confirm(`Bạn có chắc chắn muốn xóa nhân viên ${staff.name} (${staff.code}) khỏi hệ thống?`)) {
      deleteStaffMember(staff.id)
      setStaffList(getStoredStaffList())
      showToast(`Đã xóa nhân viên ${staff.name} khỏi danh sách!`)
    }
  }

  // Mở modal chỉnh sửa chi tiết
  const handleOpenEdit = (staff: StaffMember) => {
    setEditingStaff({ ...staff })
    setEditModalOpen(true)
  }

  // Lưu chỉnh sửa chi tiết
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingStaff) return

    const matchedOption = WORK_LOCATION_OPTIONS.find((opt) => opt.label === editingStaff.workLocation)

    const updated = updateStaffMember(editingStaff.id, {
      ...editingStaff,
      zone: matchedOption?.zone,
      station: matchedOption?.station,
    })

    if (updated) {
      setStaffList(getStoredStaffList())
      showToast(`Đã cập nhật thông tin nhân viên ${updated.name}!`)
    }
    setEditModalOpen(false)
    setEditingStaff(null)
  }

  // Khôi phục danh sách mặc định
  const handleResetToDefault = () => {
    if (confirm('Khôi phục danh sách nhân sự về dữ liệu mẫu ban đầu?')) {
      localStorage.removeItem(STAFF_STORAGE_KEY)
      setStaffList(getStoredStaffList())
      showToast('Đã khôi phục dữ liệu nhân sự mặc định thành công!')
    }
  }

  // Xuất file CSV danh sách nhân viên
  const handleExportCsv = () => {
    const headers = [
      'Mã NV',
      'Họ và tên',
      'Vai trò / Chức vụ',
      'Vị trí làm việc',
      'Ca trực',
      'Số điện thoại',
      'Email',
      'Đơn đang phụ trách',
      'Đã hoàn thành hôm nay',
      'Trạng thái',
      'Ngày vào làm',
    ]

    const statusMap = {
      available: 'Sẵn sàng (Rảnh)',
      busy: 'Đang xử lý đơn',
      off_duty: 'Nghỉ ca',
    }

    const rows = filteredStaff.map((s) => [
      `"${s.code}"`,
      `"${s.name.replace(/"/g, '""')}"`,
      `"${s.roleTitle}"`,
      `"${s.workLocation}"`,
      `"${s.shiftText}"`,
      `"${s.phone}"`,
      `"${s.email}"`,
      s.activeBatches,
      s.todayCompleted,
      `"${statusMap[s.status]}"`,
      `"${s.joinDate}"`,
    ])

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `OptiPackAI_DanhSach_NhanVien_${new Date().toISOString().split('T')[0]}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Đã xuất file danh sách nhân viên (CSV) thành công!')
  }

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: 'Quản lý nhân viên & Vị trí làm việc' },
        ]}
      />

      <div className="flex-1 overflow-auto bg-[#F8FAFC] p-4 sm:p-6 dark:bg-[#0B0E14]">
        <div className="mx-auto max-w-7xl space-y-4 sm:space-y-5">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 shadow-xs flex items-center justify-between dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300 animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{toastMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Top Hero Banner */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/90 bg-white p-4.5 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xs shrink-0">
                <Users className="h-5 w-5" />
              </span>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                    Quản lý nhân viên & Vị trí làm việc
                  </h1>
                  <span className="rounded-full bg-blue-100/90 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    Chủ cửa hàng (Store Owner)
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/90 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    Đồng bộ thời gian thực
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Phân bổ nhân sự theo từng bộ phận kho tổng, Bàn đóng gói AI và Cổng xuất hàng · Theo dõi ca trực & bổ sung nhân sự mới
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-surface-1 dark:text-slate-300 cursor-pointer transition-colors"
                title="Xuất bảng kê danh sách nhân viên ra file CSV"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                <span>Xuất file CSV</span>
              </button>

              <button
                type="button"
                onClick={handleResetToDefault}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-surface-1 dark:text-slate-300 cursor-pointer transition-colors"
                title="Khôi phục lại dữ liệu nhân sự mặc định"
              >
                <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                <span>Đặt lại mẫu</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 active:bg-blue-800 cursor-pointer transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>+ Thêm nhân viên mới</span>
              </button>
            </div>
          </div>

          {/* 4 Interactive KPI Cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Tổng nhân viên */}
            <div
              onClick={() => setRoleFilter('all')}
              className={`rounded-2xl border p-4 shadow-xs transition-all cursor-pointer ${
                roleFilter === 'all'
                  ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/20'
                  : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-surface-1 hover:border-blue-300'
              }`}
              title="Bấm để hiển thị tất cả vai trò"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                  TỔNG NHÂN SỰ
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                  <Users className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold font-mono text-slate-900 dark:text-slate-100">
                  {stats.total}
                </span>
                <span className="text-xs text-slate-500 font-medium">nhân viên</span>
              </div>
              <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {stats.availableCount} sẵn sàng
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  {stats.busyCount} đang bận
                </span>
                <span className="text-slate-400">
                  {stats.offDutyCount} nghỉ ca
                </span>
              </div>
            </div>

            {/* 2. Lấy hàng tại kho */}
            <div
              onClick={() => setRoleFilter(roleFilter === 'warehouse' ? 'all' : 'warehouse')}
              className={`rounded-2xl border p-4 shadow-xs transition-all cursor-pointer ${
                roleFilter === 'warehouse'
                  ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-500/20 dark:border-indigo-500 dark:bg-indigo-950/30'
                  : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-surface-1 hover:border-indigo-300'
              }`}
              title="Bấm để lọc nhân viên Lấy hàng kho"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                  LẤY HÀNG TẠI KỆ
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                  <ClipboardList className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold font-mono text-indigo-700 dark:text-indigo-400">
                  {stats.warehouseCount}
                </span>
                <span className="text-xs text-indigo-600/80 font-medium">nhân sự kho</span>
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="rounded bg-indigo-100/80 px-1.5 py-0.5 font-bold text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300">
                  Kho tổng chung
                </span>
                <span>Khấu trừ kho tự động</span>
              </div>
            </div>

            {/* 3. Bàn đóng gói AI */}
            <div
              onClick={() => setRoleFilter(roleFilter === 'packaging' ? 'all' : 'packaging')}
              className={`rounded-2xl border p-4 shadow-xs transition-all cursor-pointer ${
                roleFilter === 'packaging'
                  ? 'border-purple-500 bg-purple-50/50 ring-2 ring-purple-500/20 dark:border-purple-500 dark:bg-purple-950/30'
                  : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-surface-1 hover:border-purple-300'
              }`}
              title="Bấm để lọc nhân viên Đóng gói AI"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                  TRẠM ĐÓNG GÓI AI
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
                  <Boxes className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold font-mono text-purple-700 dark:text-purple-400">
                  {stats.packagingCount}
                </span>
                <span className="text-xs text-purple-600/80 font-medium">nhân sự đóng gói</span>
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="rounded bg-purple-100/80 px-1.5 py-0.5 font-bold text-purple-800 dark:bg-purple-950/50 dark:text-purple-300">
                  3 Bàn đóng gói
                </span>
                <span>AI 3D Bin Packing</span>
              </div>
            </div>

            {/* 4. Điều phối vận chuyển */}
            <div
              onClick={() => setRoleFilter(roleFilter === 'shipping' ? 'all' : 'shipping')}
              className={`rounded-2xl border p-4 shadow-xs transition-all cursor-pointer ${
                roleFilter === 'shipping'
                  ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20 dark:border-amber-500 dark:bg-amber-950/30'
                  : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-surface-1 hover:border-amber-300'
              }`}
              title="Bấm để lọc nhân viên Vận chuyển"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                  ĐIỀU PHỐI VẬN CHUYỂN
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                  <Truck className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold font-mono text-amber-700 dark:text-amber-400">
                  {stats.shippingCount}
                </span>
                <span className="text-xs text-amber-600/80 font-medium">điều phối viên</span>
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="rounded bg-amber-100/80 px-1.5 py-0.5 font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                  Cổng xuất Dock 1, 2
                </span>
                <span>Biên bản & bàn giao</span>
              </div>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs space-y-3 dark:border-slate-800 dark:bg-surface-1">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between text-xs">
              {/* Left: Role Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all', label: `Tất cả (${stats.total})` },
                  { id: 'warehouse', label: `Lấy hàng kho (${stats.warehouseCount})` },
                  { id: 'packaging', label: `Đóng gói AI (${stats.packagingCount})` },
                  { id: 'shipping', label: `Vận chuyển (${stats.shippingCount})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setRoleFilter(tab.id as StaffRole | 'all')}
                    className={`rounded-xl px-3 py-1.5 font-bold transition-all cursor-pointer ${
                      roleFilter === tab.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Right: Search & Dropdown Filters */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative min-w-[200px] sm:min-w-[260px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tên, mã NV, số điện thoại, vị trí..."
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8.5 pr-8 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-200"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StaffStatus | 'all')}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300 cursor-pointer"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="available">Sẵn sàng (Rảnh)</option>
                  <option value="busy">Đang xử lý đơn (Bận)</option>
                  <option value="off_duty">Nghỉ ca / Vắng mặt</option>
                </select>

                {/* Location Filter */}
                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="h-9 max-w-[220px] truncate rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300 cursor-pointer"
                >
                  <option value="all">Tất cả vị trí làm việc</option>
                  {WORK_LOCATION_OPTIONS.map((loc) => (
                    <option key={loc.id} value={loc.label}>
                      {loc.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Main Staff Table Card */}
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-surface-1">
            <div className="overflow-x-auto max-h-[580px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700">
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs text-[11px] font-bold text-slate-500 uppercase tracking-wider dark:bg-surface-2/95 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 shadow-2xs">
                  <tr>
                    <th className="px-5 py-3.5">NHÂN VIÊN</th>
                    <th className="px-4 py-3.5">VAI TRÒ / CHỨC VỤ</th>
                    <th className="px-4 py-3.5">VỊ TRÍ LÀM VIỆC HIỆN TẠI</th>
                    <th className="px-4 py-3.5">CA LÀM VIỆC</th>
                    <th className="px-4 py-3.5 text-center">ĐƠN ĐANG PHỤ TRÁCH</th>
                    <th className="px-4 py-3.5 text-center">TRẠNG THÁI</th>
                    <th className="px-5 py-3.5 text-right">THAO TÁC CỦA CHỦ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {filteredStaff.length > 0 ? (
                    filteredStaff.map((staff) => {
                      const isWarehouse = staff.role === 'warehouse'
                      const isPackaging = staff.role === 'packaging'
                      const isShipping = staff.role === 'shipping'

                      return (
                        <tr
                          key={staff.id}
                          className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                        >
                          {/* 1. STAFF PROFILE */}
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="relative shrink-0">
                                <img
                                  src={staff.avatar}
                                  alt={staff.name}
                                  className="h-10 w-10 rounded-full object-cover ring-2 ring-slate-100 dark:ring-slate-700"
                                />
                                <span
                                  className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-surface-1 ${
                                    staff.status === 'available'
                                      ? 'bg-emerald-500'
                                      : staff.status === 'busy'
                                        ? 'bg-amber-500'
                                        : 'bg-slate-400'
                                  }`}
                                />
                              </div>
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <strong className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                    {staff.name}
                                  </strong>
                                  <span className="font-mono text-[10px] font-bold rounded bg-slate-100 px-1.5 py-0.2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    {staff.code}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3 text-slate-400" />
                                    <span>{staff.phone}</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 2. ROLE */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {isWarehouse ? (
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 border border-indigo-200/80 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300">
                                <ClipboardList className="h-3.5 w-3.5" />
                                {staff.roleTitle}
                              </span>
                            ) : isPackaging ? (
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 border border-purple-200/80 px-2.5 py-1 text-xs font-semibold text-purple-700 dark:bg-purple-950/40 dark:border-purple-800 dark:text-purple-300">
                                <Boxes className="h-3.5 w-3.5" />
                                {staff.roleTitle}
                              </span>
                            ) : isShipping ? (
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200/80 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300">
                                <Truck className="h-3.5 w-3.5" />
                                {staff.roleTitle}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {staff.roleTitle}
                              </span>
                            )}
                          </td>

                          {/* 3. CURRENT WORK LOCATION */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs dark:border-slate-700 dark:bg-surface-2 dark:text-slate-200">
                                <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                <span>{staff.workLocation}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleOpenReassign(staff)}
                                className="rounded-lg p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40 cursor-pointer transition-colors"
                                title="Điều chuyển vị trí làm việc cho nhân viên này"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>

                          {/* 4. SHIFT */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                                <Clock className="h-3 w-3 text-slate-400" />
                                <span>{staff.shift === 'morning' ? 'Ca sáng' : staff.shift === 'afternoon' ? 'Ca chiều' : 'Hành chính'}</span>
                              </div>
                              <span className="text-[11px] text-slate-500 font-mono">
                                {staff.shift === 'morning' ? '07:30 - 15:30' : staff.shift === 'afternoon' ? '14:00 - 22:00' : '08:00 - 17:30'}
                              </span>
                            </div>
                          </td>

                          {/* 5. CURRENT BATCHES & COMPLETED */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            <div className="inline-flex flex-col items-center">
                              {staff.activeBatches > 0 ? (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                                  {staff.activeBatches} đợt đang xử lý
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-medium">0 đợt</span>
                              )}
                              <span className="text-[10px] text-slate-500 mt-0.5">
                                Hoàn thành: <strong>{staff.todayCompleted}</strong> đợt hôm nay
                              </span>
                            </div>
                          </td>

                          {/* 6. STATUS */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(staff)}
                              className="group cursor-pointer inline-flex items-center gap-1.5 transition-transform active:scale-95"
                              title="Bấm để chuyển nhanh trạng thái (Sẵn sàng -> Đang bận -> Nghỉ ca)"
                            >
                              {staff.status === 'available' ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  Sẵn sàng (Rảnh)
                                </span>
                              ) : staff.status === 'busy' ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                  Đang xử lý đơn
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400">
                                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                  Nghỉ ca
                                </span>
                              )}
                            </button>
                          </td>

                          {/* 7. ACTIONS */}
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenReassign(staff)}
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 cursor-pointer transition-colors"
                              >
                                <MapPin className="h-3 w-3" />
                                <span>Đổi vị trí</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(staff)}
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                title="Sửa thông tin"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteStaff(staff)}
                                className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
                                title="Xóa nhân viên"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center">
                        <AlertCircle className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                        <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                          Không tìm thấy nhân viên phù hợp bộ lọc
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Hãy thử điều chỉnh từ khóa tìm kiếm hoặc đổi bộ lọc vai trò, vị trí.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-slate-200/80 bg-slate-50/50 px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-surface-2/40">
              <span>
                Hiển thị <strong>{filteredStaff.length}</strong> / <strong>{staffList.length}</strong> nhân sự
              </span>
              <span className="font-mono text-[11px]">
                Đồng bộ tự động với màn hình Lấy hàng trong kho & Điều phối đóng gói
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL 1: THÊM NHÂN VIÊN MỚI (BỔ SUNG NHÂN SỰ)           */}
      {/* ========================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-surface-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <Plus className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Bổ sung nhân viên mới
                  </h3>
                  <p className="text-xs text-slate-500">
                    Chủ cửa hàng thêm tài khoản & phân bổ vị trí làm việc tại kho
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="mt-4 space-y-4 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Họ và tên */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Họ và tên nhân viên <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="h-9 w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100"
                  />
                </div>

                {/* Mã nhân viên */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Mã nhân viên (Tự động sinh)
                  </label>
                  <input
                    type="text"
                    required
                    value={newStaffCode}
                    onChange={(e) => setNewStaffCode(e.target.value)}
                    className="h-9 w-full rounded-xl border border-slate-300 font-mono px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100"
                  />
                </div>

                {/* Số điện thoại */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Số điện thoại liên lạc
                  </label>
                  <input
                    type="text"
                    value={newStaffPhone}
                    onChange={(e) => setNewStaffPhone(e.target.value)}
                    placeholder="0912 345 678"
                    className="h-9 w-full rounded-xl border border-slate-300 font-mono px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100"
                  />
                </div>

                {/* Email */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Email công việc
                  </label>
                  <input
                    type="email"
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                    placeholder="nhanvien@optipackai.com"
                    className="h-9 w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100"
                  />
                </div>

                {/* Vai trò */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Vai trò công việc <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={newStaffRole}
                    onChange={(e) => {
                      const r = e.target.value as StaffRole
                      setNewStaffRole(r)
                      // Tự động gán vị trí phù hợp với vai trò
                      const defaultLoc = WORK_LOCATION_OPTIONS.find((opt) => opt.role === r)
                      if (defaultLoc) setNewStaffLocation(defaultLoc.label)
                    }}
                    className="h-9 w-full rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100 cursor-pointer"
                  >
                    <option value="warehouse">Nhân viên lấy hàng kho (Picking Staff)</option>
                    <option value="packaging">Nhân viên đóng gói (AI Packaging Staff)</option>
                    <option value="shipping">Điều phối vận chuyển (Shipping Coordinator)</option>
                    <option value="manager">Quản lý / Giám sát kho</option>
                  </select>
                </div>

                {/* Ca làm việc */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Ca làm việc
                  </label>
                  <select
                    value={newStaffShift}
                    onChange={(e) => setNewStaffShift(e.target.value as StaffShift)}
                    className="h-9 w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100 cursor-pointer"
                  >
                    <option value="morning">Ca sáng: 07:30 - 15:30</option>
                    <option value="afternoon">Ca chiều: 14:00 - 22:00</option>
                    <option value="office">Ca hành chính: 08:00 - 17:30</option>
                  </select>
                </div>

                {/* Trạng thái ban đầu */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Trạng thái trực tiếp ban đầu
                  </label>
                  <select
                    value={newStaffStatus}
                    onChange={(e) => setNewStaffStatus(e.target.value as StaffStatus)}
                    className="h-9 w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100 cursor-pointer"
                  >
                    <option value="available">Sẵn sàng (Rảnh)</option>
                    <option value="busy">Đang xử lý đơn (Bận)</option>
                    <option value="off_duty">Nghỉ ca / Vắng mặt</option>
                  </select>
                </div>
              </div>

              {/* Vị trí làm việc cụ thể */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>
                    Vị trí làm việc / Khu vực phân công <span className="text-rose-500">*</span>
                  </span>
                  <span className="text-[11px] font-normal text-slate-500">
                    Kho hàng tổng, Bàn đóng gói AI, Cổng xuất hàng
                  </span>
                </label>
                <select
                  value={newStaffLocation}
                  onChange={(e) => setNewStaffLocation(e.target.value)}
                  className="h-10 w-full rounded-xl border border-blue-300 bg-blue-50/50 px-3 text-xs font-bold text-blue-900 focus:border-blue-600 focus:outline-none dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200 cursor-pointer"
                >
                  {WORK_LOCATION_OPTIONS.map((loc) => (
                    <option key={loc.id} value={loc.label}>
                      {loc.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ghi chú */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Ghi chú phân công & Kỹ năng
                </label>
                <textarea
                  rows={2}
                  value={newStaffNotes}
                  onChange={(e) => setNewStaffNotes(e.target.value)}
                  placeholder="Ví dụ: Phụ trách chuyên biệt kệ áo nam, có chứng chỉ xe nâng..."
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300 cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-700 cursor-pointer shadow-xs"
                >
                  <Plus className="h-4 w-4" />
                  <span>Xác nhận thêm nhân viên</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: ĐIỀU CHUYỂN VỊ TRÍ LÀM VIỆC NHANH               */}
      {/* ========================================================= */}
      {reassignModalOpen && selectedStaffForReassign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-surface-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <MapPin className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Điều chuyển vị trí làm việc
                  </h3>
                  <p className="text-xs text-slate-500">
                    Chủ cửa hàng phân công lại vị trí kho / trạm làm việc cho nhân viên
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReassignModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Staff preview card */}
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-surface-2">
                <img
                  src={selectedStaffForReassign.avatar}
                  alt={selectedStaffForReassign.name}
                  className="h-12 w-12 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700 shrink-0"
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {selectedStaffForReassign.name} ({selectedStaffForReassign.code})
                  </p>
                  <p className="text-slate-600 dark:text-slate-400">
                    Vai trò: <strong>{selectedStaffForReassign.roleTitle}</strong> · Ca: {selectedStaffForReassign.shiftText}
                  </p>
                  <p className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                    Vị trí hiện tại: {selectedStaffForReassign.workLocation}
                  </p>
                </div>
              </div>

              {/* Target Location Select */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800 dark:text-slate-200">
                  Chọn vị trí làm việc mới:
                </label>
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {WORK_LOCATION_OPTIONS.map((loc) => {
                    const isSelected = reassignTargetLocation === loc.label
                    return (
                      <div
                        key={loc.id}
                        onClick={() => setReassignTargetLocation(loc.label)}
                        className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/80 ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/40'
                            : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <MapPin
                            className={`h-4 w-4 shrink-0 ${
                              isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                            }`}
                          />
                          <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100">
                              {loc.label}
                            </p>
                            <span className="text-[10px] text-slate-500 font-medium">
                              {loc.role === 'warehouse'
                                ? 'Khu vực nhặt hàng kho'
                                : loc.role === 'packaging'
                                  ? 'Bàn đóng gói AI 3D'
                                  : loc.role === 'shipping'
                                    ? 'Cổng bàn giao đơn hàng'
                                    : 'Khu vực quản lý'}
                            </span>
                          </div>
                        </div>

                        {isSelected && (
                          <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Notice */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
                <p className="text-[11px] leading-relaxed flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>
                    Khi điều chuyển, danh sách phân công tại màn hình <em>Lấy hàng trong kho</em> và <em>Đóng gói AI</em> sẽ được cập nhật ngay lập tức theo vị trí mới.
                  </span>
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setReassignModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300 cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReassign}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-700 cursor-pointer shadow-xs"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Xác nhận điều chuyển</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: CHỈNH SỬA CHI TIẾT THÔNG TIN NHÂN VIÊN          */}
      {/* ========================================================= */}
      {editModalOpen && editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-surface-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <Edit3 className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Chỉnh sửa thông tin nhân viên
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cập nhật vị trí, số điện thoại, ca làm việc của {editingStaff.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3.5 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Họ và tên
                  </label>
                  <input
                    type="text"
                    required
                    value={editingStaff.name}
                    onChange={(e) => setEditingStaff({ ...editingStaff, name: e.target.value })}
                    className="h-9 w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Mã nhân viên
                  </label>
                  <input
                    type="text"
                    value={editingStaff.code}
                    onChange={(e) => setEditingStaff({ ...editingStaff, code: e.target.value })}
                    className="h-9 w-full rounded-xl border border-slate-300 font-mono px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Số điện thoại
                  </label>
                  <input
                    type="text"
                    value={editingStaff.phone}
                    onChange={(e) => setEditingStaff({ ...editingStaff, phone: e.target.value })}
                    className="h-9 w-full rounded-xl border border-slate-300 font-mono px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Ca làm việc
                  </label>
                  <select
                    value={editingStaff.shift}
                    onChange={(e) => {
                      const sh = e.target.value as StaffShift
                      const map = { morning: 'Ca sáng (07:30 - 15:30)', afternoon: 'Ca chiều (14:00 - 22:00)', office: 'Ca hành chính (08:00 - 17:30)' }
                      setEditingStaff({ ...editingStaff, shift: sh, shiftText: map[sh] })
                    }}
                    className="h-9 w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100 cursor-pointer"
                  >
                    <option value="morning">Ca sáng: 07:30 - 15:30</option>
                    <option value="afternoon">Ca chiều: 14:00 - 22:00</option>
                    <option value="office">Ca hành chính: 08:00 - 17:30</option>
                  </select>
                </div>
              </div>

              {/* Vị trí làm việc */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Vị trí làm việc / Khu vực kho
                </label>
                <select
                  value={editingStaff.workLocation}
                  onChange={(e) => setEditingStaff({ ...editingStaff, workLocation: e.target.value })}
                  className="h-10 w-full rounded-xl border border-blue-300 bg-blue-50/50 px-3 text-xs font-bold text-blue-900 focus:border-blue-600 focus:outline-none dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200 cursor-pointer"
                >
                  {WORK_LOCATION_OPTIONS.map((loc) => (
                    <option key={loc.id} value={loc.label}>
                      {loc.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Trạng thái */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Trạng thái hiện tại
                </label>
                <select
                  value={editingStaff.status}
                  onChange={(e) => setEditingStaff({ ...editingStaff, status: e.target.value as StaffStatus })}
                  className="h-9 w-full rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100 cursor-pointer"
                >
                  <option value="available">Sẵn sàng (Rảnh)</option>
                  <option value="busy">Đang xử lý đơn (Bận)</option>
                  <option value="off_duty">Nghỉ ca / Vắng mặt</option>
                </select>
              </div>

              {/* Ghi chú */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Ghi chú phân công
                </label>
                <textarea
                  rows={2}
                  value={editingStaff.notes || ''}
                  onChange={(e) => setEditingStaff({ ...editingStaff, notes: e.target.value })}
                  placeholder="Thêm ghi chú nhiệm vụ hoặc kỹ năng đặc biệt..."
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-700 cursor-pointer shadow-xs"
                >
                  <Check className="h-4 w-4" />
                  <span>Lưu thay đổi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
export default StaffManagementPage
