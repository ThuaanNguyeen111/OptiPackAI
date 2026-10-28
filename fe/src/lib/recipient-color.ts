const BORDER_COLORS = [
  'border-l-sky-500',
  'border-l-amber-500',
  'border-l-emerald-500',
  'border-l-violet-500',
  'border-l-rose-500',
  'border-l-teal-500',
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

/** Cùng một tên luôn ra cùng màu. Tên trống hoặc bị che (`*`) không tô. */
export function recipientBorderClass(name: string | null | undefined): string {
  const raw = (name ?? '').trim()
  if (!raw || raw.includes('*')) return ''
  const key = foldName(raw)
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return BORDER_COLORS[hash % BORDER_COLORS.length] ?? ''
}
