import type { BatchZone } from './picking-batches-mock'

export type StaffRole = 'warehouse' | 'packaging' | 'shipping' | 'manager'
export type StaffStatus = 'available' | 'busy' | 'off_duty'
export type StaffShift = 'morning' | 'afternoon' | 'office'

export interface StaffMember {
  id: string
  name: string
  code: string
  avatar: string
  initials: string
  email: string
  phone: string
  role: StaffRole
  roleTitle: string
  workLocation: string // Vị trí làm việc cụ thể
  zone?: BatchZone // Cho nhân viên lấy hàng kho
  station?: string // Cho nhân viên đóng gói / vận chuyển
  shift: StaffShift
  shiftText: string
  status: StaffStatus
  activeBatches: number // Số đợt hàng đang phụ trách
  todayCompleted: number // Số đợt/kiện đã hoàn thành hôm nay
  joinDate: string
  skills?: string[]
  notes?: string
}

export const WORK_LOCATION_OPTIONS = [
  // Khu vực lấy hàng trong kho (Kho chung)
  { id: 'loc-wh-main', label: 'Kho hàng tổng - Dãy kệ trung tâm', zone: 'Zone A' as BatchZone, role: 'warehouse' as StaffRole },
  { id: 'loc-wh-racks', label: 'Kho hàng tổng - Kệ thời trang & phụ kiện', zone: 'Zone A' as BatchZone, role: 'warehouse' as StaffRole },
  { id: 'loc-wh-all', label: 'Kho hàng tổng (Điều động linh hoạt)', zone: 'Zone A' as BatchZone, role: 'warehouse' as StaffRole },

  // Bàn đóng gói AI 3D
  { id: 'loc-pack-01', label: 'Trạm 01 - Bàn đóng gói AI 3D (Tự động)', station: 'Station 1', role: 'packaging' as StaffRole },
  { id: 'loc-pack-02', label: 'Trạm 02 - Bàn đóng gói tiêu chuẩn', station: 'Station 2', role: 'packaging' as StaffRole },
  { id: 'loc-pack-03', label: 'Trạm 03 - Bàn đóng gói hàng cồng kềnh', station: 'Station 3', role: 'packaging' as StaffRole },

  // Cổng xuất hàng vận chuyển
  { id: 'loc-dock-01', label: 'Cổng xuất 01 - Bàn giao GHN & Shopee Xpress', station: 'Dock 1', role: 'shipping' as StaffRole },
  { id: 'loc-dock-02', label: 'Cổng xuất 02 - Bàn giao Viettel Post & J&T', station: 'Dock 2', role: 'shipping' as StaffRole },
  { id: 'loc-dock-03', label: 'Cổng xuất 03 - Bàn giao TikTok Logistics', station: 'Dock 3', role: 'shipping' as StaffRole },

  // Quản lý / Giám sát
  { id: 'loc-office', label: 'Phòng Điều Phối Trung Tâm (Control Hub)', station: 'Control Hub', role: 'manager' as StaffRole },
]

export const INITIAL_STAFF_LIST: StaffMember[] = [
  // 1. Nhân viên lấy hàng tại kho (Warehouse Staff)
  {
    id: 'staff-1',
    name: 'Ahmad R.',
    code: 'NV-KHO-01',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
    initials: 'AR',
    email: 'ahmad.r@optipackai.com',
    phone: '0908 112 233',
    role: 'warehouse',
    roleTitle: 'Nhân viên lấy hàng',
    workLocation: 'Kho hàng tổng - Dãy kệ trung tâm',
    zone: 'Zone A',
    shift: 'morning',
    shiftText: 'Ca sáng (07:30 - 15:30)',
    status: 'busy',
    activeBatches: 1, // Đang nhặt đợt BTH-20240115-001
    todayCompleted: 14,
    joinDate: '2024-03-15',
    skills: ['Quét mã siêu tốc', 'Kệ tầng cao', 'Kiểm kê định kỳ'],
    notes: 'Phụ trách chính kệ áo sơ mi và áo polo Zone A',
  },
  {
    id: 'staff-2',
    name: 'Rian K.',
    code: 'NV-KHO-02',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
    initials: 'RK',
    email: 'rian.k@optipackai.com',
    phone: '0912 334 455',
    role: 'warehouse',
    roleTitle: 'Nhân viên lấy hàng',
    workLocation: 'Kho hàng tổng - Dãy kệ trung tâm',
    zone: 'Zone A',
    shift: 'morning',
    shiftText: 'Ca sáng (07:30 - 15:30)',
    status: 'busy',
    activeBatches: 1, // Đang nhặt đợt BTH-20240115-004
    todayCompleted: 11,
    joinDate: '2024-05-10',
    skills: ['Xử lý đơn hỏa tốc', 'Xe nâng mini'],
    notes: 'Chuyên nhặt đơn hỏa tốc (SLA 4h)',
  },
  {
    id: 'staff-3',
    name: 'Siti M.',
    code: 'NV-KHO-03',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop&crop=face',
    initials: 'SM',
    email: 'siti.m@optipackai.com',
    phone: '0978 556 677',
    role: 'warehouse',
    roleTitle: 'Nhân viên lấy hàng',
    workLocation: 'Kho hàng tổng - Kệ thời trang & phụ kiện',
    zone: 'Zone B',
    shift: 'morning',
    shiftText: 'Ca sáng (07:30 - 15:30)',
    status: 'busy',
    activeBatches: 1, // Đang nhặt đợt BTH-20240115-002
    todayCompleted: 16,
    joinDate: '2023-11-20',
    skills: ['Bảo quản vải lụa', 'Gấp đồ chuẩn'],
    notes: 'Phụ trách kệ thời trang váy đầm nữ',
  },
  {
    id: 'staff-4',
    name: 'Budi P.',
    code: 'NV-KHO-04',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
    initials: 'BP',
    email: 'budi.p@optipackai.com',
    phone: '0933 778 899',
    role: 'warehouse',
    roleTitle: 'Nhân viên lấy hàng',
    workLocation: 'Kho hàng tổng (Điều động linh hoạt)',
    zone: 'Zone C',
    shift: 'afternoon',
    shiftText: 'Ca chiều (14:00 - 22:00)',
    status: 'available',
    activeBatches: 0,
    todayCompleted: 8,
    joinDate: '2024-01-08',
    skills: ['Đóng gói phụ kiện', 'Quét barcode'],
  },
  {
    id: 'staff-5',
    name: 'Fahmi H.',
    code: 'NV-KHO-05',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&h=100&fit=crop&crop=face',
    initials: 'FH',
    email: 'fahmi.h@optipackai.com',
    phone: '0944 889 900',
    role: 'warehouse',
    roleTitle: 'Nhân viên lấy hàng',
    workLocation: 'Kho hàng tổng - Dãy kệ trung tâm',
    zone: 'Zone A',
    shift: 'morning',
    shiftText: 'Ca sáng (07:30 - 15:30)',
    status: 'busy',
    activeBatches: 1, // Đang nhặt đợt BTH-20240115-006 (đơn trễ)
    todayCompleted: 12,
    joinDate: '2024-02-14',
    skills: ['Xử lý đơn chậm trễ', 'Tăng tốc nhặt hàng'],
    notes: 'Ưu tiên gỡ trễ các đơn sắp hết hạn SLA',
  },
  {
    id: 'staff-6',
    name: 'Dewi A.',
    code: 'NV-KHO-06',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=face',
    initials: 'DA',
    email: 'dewi.a@optipackai.com',
    phone: '0966 223 344',
    role: 'warehouse',
    roleTitle: 'Nhân viên lấy hàng',
    workLocation: 'Kho hàng tổng - Kệ thời trang & phụ kiện',
    zone: 'Zone B',
    shift: 'afternoon',
    shiftText: 'Ca chiều (14:00 - 22:00)',
    status: 'available',
    activeBatches: 0,
    todayCompleted: 9,
    joinDate: '2024-06-01',
    skills: ['Kiểm tra lỗi sản phẩm', 'Phân loại SKU'],
  },
  {
    id: 'staff-7',
    name: 'Eka S.',
    code: 'NV-KHO-07',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face',
    initials: 'ES',
    email: 'eka.s@optipackai.com',
    phone: '0981 445 566',
    role: 'warehouse',
    roleTitle: 'Nhân viên lấy hàng',
    workLocation: 'Kho hàng tổng (Điều động linh hoạt)',
    zone: 'Zone C',
    shift: 'morning',
    shiftText: 'Ca sáng (07:30 - 15:30)',
    status: 'available',
    activeBatches: 0,
    todayCompleted: 15,
    joinDate: '2023-09-12',
    skills: ['Nhặt hàng độ chính xác 100%', 'Vận hành kho sạch'],
  },

  // 2. Nhân viên đóng gói (Packaging Staff)
  {
    id: 'staff-8',
    name: 'Lê Thảo My',
    code: 'NV-DG-01',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&h=100&fit=crop&crop=face',
    initials: 'TM',
    email: 'thaomy.le@optipackai.com',
    phone: '0938 123 789',
    role: 'packaging',
    roleTitle: 'Nhân viên đóng gói AI',
    workLocation: 'Trạm 01 - Bàn đóng gói AI 3D (Tự động)',
    station: 'Station 1',
    shift: 'morning',
    shiftText: 'Ca sáng (07:30 - 15:30)',
    status: 'busy',
    activeBatches: 1,
    todayCompleted: 28,
    joinDate: '2024-01-15',
    skills: ['Vận hành 3D Bin Packing', 'Dán nhãn tự động', 'Chèn túi khí'],
    notes: 'Phụ trách trạm AI chính, đối soát kích thước thùng carton',
  },
  {
    id: 'staff-9',
    name: 'Trần Quốc Bảo',
    code: 'NV-DG-02',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face',
    initials: 'QB',
    email: 'quocbao.tran@optipackai.com',
    phone: '0909 456 123',
    role: 'packaging',
    roleTitle: 'Nhân viên đóng gói',
    workLocation: 'Trạm 02 - Bàn đóng gói tiêu chuẩn',
    station: 'Station 2',
    shift: 'afternoon',
    shiftText: 'Ca chiều (14:00 - 22:00)',
    status: 'available',
    activeBatches: 0,
    todayCompleted: 19,
    joinDate: '2024-04-20',
    skills: ['Đóng gói túi polybag', 'Cắt băng dính công nghiệp'],
  },
  {
    id: 'staff-10',
    name: 'Vũ Hải Đăng',
    code: 'NV-DG-03',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100&h=100&fit=crop&crop=face',
    initials: 'HD',
    email: 'haidang.vu@optipackai.com',
    phone: '0917 889 001',
    role: 'packaging',
    roleTitle: 'Nhân viên đóng gói',
    workLocation: 'Trạm 03 - Bàn đóng gói hàng cồng kềnh',
    station: 'Station 3',
    shift: 'office',
    shiftText: 'Ca hành chính (08:00 - 17:30)',
    status: 'off_duty',
    activeBatches: 0,
    todayCompleted: 0,
    joinDate: '2024-02-01',
    skills: ['Đóng kiện gia cố', 'Thùng carton 5 lớp'],
    notes: 'Nghỉ phép ca hôm nay',
  },

  // 3. Điều phối vận chuyển (Shipping Coordinator)
  {
    id: 'staff-11',
    name: 'Đặng Tuấn Kiệt',
    code: 'NV-VC-01',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face',
    initials: 'TK',
    email: 'tuankiet.dang@optipackai.com',
    phone: '0988 990 112',
    role: 'shipping',
    roleTitle: 'Điều phối vận chuyển',
    workLocation: 'Cổng xuất 01 - Bàn giao GHN & Shopee Xpress',
    station: 'Dock 1',
    shift: 'morning',
    shiftText: 'Ca sáng (07:30 - 15:30)',
    status: 'busy',
    activeBatches: 2,
    todayCompleted: 45,
    joinDate: '2023-08-10',
    skills: ['Ký biên bản điện tử', 'Quét mã barcode bàn giao', 'Đối soát tài xế'],
    notes: 'Phụ trách bàn giao các tài xế GHN và Shopee Xpress',
  },
  {
    id: 'staff-12',
    name: 'Nguyễn Văn Minh',
    code: 'NV-VC-02',
    avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=100&h=100&fit=crop&crop=face',
    initials: 'VM',
    email: 'vanminh.nguyen@optipackai.com',
    phone: '0945 667 889',
    role: 'shipping',
    roleTitle: 'Điều phối vận chuyển',
    workLocation: 'Cổng xuất 02 - Bàn giao Viettel Post & J&T',
    station: 'Dock 2',
    shift: 'afternoon',
    shiftText: 'Ca chiều (14:00 - 22:00)',
    status: 'available',
    activeBatches: 0,
    todayCompleted: 22,
    joinDate: '2024-03-01',
    skills: ['Cân đo trọng lượng phiên', 'Lập biên bản giao nhận'],
  },
]

export const STAFF_STORAGE_KEY = 'optipack_staff_management_v2'

export function getStoredStaffList(): StaffMember[] {
  if (typeof window === 'undefined') return INITIAL_STAFF_LIST
  try {
    const raw = localStorage.getItem(STAFF_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(INITIAL_STAFF_LIST))
      return INITIAL_STAFF_LIST
    }
    const parsed = JSON.parse(raw) as StaffMember[]
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
    }
    return INITIAL_STAFF_LIST
  } catch {
    // Ignore parse error
    return INITIAL_STAFF_LIST
  }
}

export function saveStoredStaffList(list: StaffMember[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(list))
    // Phát event để các trang khác (như WarehousePage) lập tức cập nhật
    window.dispatchEvent(new CustomEvent('optipack-staff-updated', { detail: list }))
  } catch {
    // Ignore save error
  }
}

export function addStaffMember(newStaff: Omit<StaffMember, 'id'>): StaffMember {
  const list = getStoredStaffList()
  const id = `staff-${Date.now()}`
  const created: StaffMember = { ...newStaff, id }
  const updated = [created, ...list]
  saveStoredStaffList(updated)
  return created
}

export function updateStaffMember(id: string, patch: Partial<StaffMember>): StaffMember | null {
  const list = getStoredStaffList()
  const idx = list.findIndex((s) => s.id === id)
  if (idx === -1) return null
  const current = list[idx]!
  const updatedItem: StaffMember = { ...current, ...patch }
  list[idx] = updatedItem
  saveStoredStaffList(list)
  return updatedItem
}

export function deleteStaffMember(id: string): boolean {
  const list = getStoredStaffList()
  const next = list.filter((s) => s.id !== id)
  if (next.length === list.length) return false
  saveStoredStaffList(next)
  return true
}

export interface WarehouseStaffAdapterItem {
  id: string
  name: string
  code: string
  avatar: string
  initials: string
  role: string
  zone: BatchZone
  status: 'available' | 'busy'
  activeBatches: number
}

export function getWarehouseStaffItems(): WarehouseStaffAdapterItem[] {
  const staff = getStoredStaffList()
  const pickers = staff.filter((s) => s.role === 'warehouse')
  if (pickers.length === 0) {
    return [
      {
        id: 'staff-1',
        name: 'Ahmad R.',
        code: 'NV-KHO-01',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
        initials: 'AR',
        role: 'Nhân viên lấy hàng',
        zone: 'Zone A',
        status: 'available',
        activeBatches: 0,
      },
    ]
  }

  return pickers.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    avatar: s.avatar,
    initials: s.initials,
    role: s.roleTitle || 'Nhân viên lấy hàng',
    zone: (s.zone || 'Zone A') as BatchZone,
    status: s.status === 'busy' ? 'busy' : 'available',
    activeBatches: s.activeBatches,
  }))
}
