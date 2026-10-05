import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Trình phát từng bước (05/10/2026): chỉ số action, phát/tạm dừng, tốc độ.
 * Khung 3D báo `onActionDone(i)` khi xong animation của action i; đang phát thì
 * tự sang action kế sau một nhịp nghỉ ngắn.
 */
export type PackingPlayer = {
  index: number
  count: number
  playing: boolean
  speed: number
  /** Tăng mỗi lần nhảy bước — để chạy lại animation khi bấm đúng bước đang xem. */
  replay: number
  goTo: (i: number) => void
  next: () => void
  prev: () => void
  togglePlay: () => void
  setSpeed: (s: number) => void
  onActionDone: (i: number) => void
}

const PAUSE_MS = 450

export function usePackingPlayer(count: number, options: { keyboard?: boolean; autoPlay?: boolean } = {}): PackingPlayer {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(Boolean(options.autoPlay))
  const [speed, setSpeed] = useState(1)
  const [replay, setReplay] = useState(0)
  const timer = useRef<number | null>(null)
  const clamp = useCallback((i: number) => Math.max(0, Math.min(count - 1, i)), [count])

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }
  const goTo = useCallback(
    (i: number) => {
      clearTimer()
      setIndex(clamp(i))
      setReplay((n) => n + 1)
    },
    [clamp],
  )
  const next = useCallback(() => goTo(index + 1), [goTo, index])
  const prev = useCallback(() => goTo(index - 1), [goTo, index])
  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      // Đang ở bước cuối mà bấm phát → phát lại từ đầu.
      if (!p && index >= count - 1) setIndex(0)
      return !p
    })
  }, [index, count])

  const onActionDone = useCallback(
    (i: number) => {
      if (!playing || i !== index) return
      if (index >= count - 1) {
        setPlaying(false)
        return
      }
      clearTimer()
      timer.current = window.setTimeout(() => {
        timer.current = null
        setIndex((cur) => (cur === i ? clamp(cur + 1) : cur))
      }, PAUSE_MS / speed)
    },
    [playing, index, count, speed, clamp],
  )

  useEffect(() => clearTimer, [])
  useEffect(() => {
    if (!playing) clearTimer()
  }, [playing])

  useEffect(() => {
    if (!options.keyboard) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) || target.isContentEditable)) return
      if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [options.keyboard, next, prev, togglePlay])

  // Đổi kiện/kế hoạch làm số bước ít đi → chỉ số luôn nằm trong giới hạn.
  return { index: Math.min(index, Math.max(0, count - 1)), count, playing, speed, replay, goTo, next, prev, togglePlay, setSpeed, onActionDone }
}
