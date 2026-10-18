export function formatCurrency(value: number, currency = 'VND') {
  try {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${value.toLocaleString('vi-VN')} ${currency}`
  }
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** Lô FIFO: "Lô LO-1 · nhập 15/10". */
export function formatLotReceived(
  lotCode: string,
  receivedAt: string | null | undefined,
  vi: boolean,
): string {
  const date = receivedAt
    ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(
        new Date(receivedAt),
      )
    : ''
  if (vi) return date ? `Lô ${lotCode} · nhập ${date}` : `Lô ${lotCode}`
  return date ? `Lot ${lotCode} · in ${date}` : `Lot ${lotCode}`
}

export function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)

  if (diffMin < 1) return 'Vừa xong'
  if (diffMin < 60) return `${diffMin} phút trước`

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours} giờ trước`

  return formatDate(iso)
}
