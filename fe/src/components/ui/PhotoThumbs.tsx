import type { ReactElement } from 'react'

/** Ảnh bằng chứng dạng ô nhỏ; bấm mở ảnh gốc ở tab mới. */
export function PhotoThumbs({ urls, alt, size = 'h-16 w-16' }: { urls: string[]; alt: string; size?: string }): ReactElement | null {
  if (urls.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((url, i) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" title={`${alt} ${String(i + 1)}`}>
          <img src={url} alt={`${alt} ${String(i + 1)}`} loading="lazy" className={`${size} rounded border border-hairline object-cover`} />
        </a>
      ))}
    </div>
  )
}
