const BORDER_COLORS = [
  'border-l-sky-500',
  'border-l-amber-500',
  'border-l-emerald-500',
  'border-l-violet-500',
  'border-l-rose-500',
  'border-l-teal-500',
] as const

const CHIP_COLORS = [
  'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200',
  'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
  'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-200',
  'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200',
  'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-200',
] as const

function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

function colorIndex(name: string): number {
  const key = foldName(name)
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return hash % BORDER_COLORS.length
}

/** Cùng một tên luôn ra cùng màu. Tên trống hoặc bị che (`*`) không tô. */
export function recipientBorderClass(name: string | null | undefined): string {
  const raw = (name ?? '').trim()
  if (!raw || raw.includes('*')) return ''
  return BORDER_COLORS[colorIndex(raw)] ?? ''
}

/** Chip cùng hash với `recipientBorderClass` — khay lấy hàng và kiện đóng gói cùng màu. */
export function recipientChipClass(name: string | null | undefined): string {
  const raw = (name ?? '').trim()
  if (!raw || raw.includes('*')) {
    return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
  }
  return CHIP_COLORS[colorIndex(raw)] ?? CHIP_COLORS[0]
}
