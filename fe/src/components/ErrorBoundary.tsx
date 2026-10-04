import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Chặn lỗi khi render (04/10/2026) — không để một lỗi (WebGL hỏng, dữ liệu lạ)
 * làm sập cả ứng dụng thành trang trắng. `fallback` nhận lỗi + hàm thử lại.
 */
type Props = {
  fallback: (error: Error, retry: () => void) => ReactNode
  children: ReactNode
  /** Đổi giá trị này (vd id trang) để tự xoá lỗi cũ. */
  resetKey?: unknown
}

type State = { error: Error | null; resetKey: unknown }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (error) return this.props.fallback(error, () => this.setState({ error: null }))
    return this.props.children
  }
}

/** Khung lỗi dùng chung cho một trang. */
export function PageErrorFallback({ error, retry, vi }: { error: Error; retry: () => void; vi: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-canvas p-6">
      <div role="alert" className="w-full max-w-lg rounded-xl border border-error/30 bg-surface-1 p-5">
        <p className="text-base font-semibold text-ink">{vi ? 'Trang gặp lỗi khi hiển thị' : 'This page failed to render'}</p>
        <p className="mt-2 break-words font-mono text-xs text-error">{error.message}</p>
        <p className="mt-3 text-sm text-ink-muted">
          {vi
            ? 'Thử tải lại trang (Ctrl+F5). Nếu vẫn lỗi, gửi dòng chữ đỏ ở trên cho đội phát triển.'
            : 'Try a hard reload (Ctrl+F5). If it persists, send the red text above to the team.'}
        </p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={retry} className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink hover:bg-surface-2">
            {vi ? 'Thử lại' : 'Retry'}
          </button>
          <button type="button" onClick={() => window.location.reload()} className="rounded-md bg-primary px-3 py-1.5 text-sm text-on-primary">
            {vi ? 'Tải lại trang' : 'Reload'}
          </button>
        </div>
      </div>
    </div>
  )
}
