import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Warehouse } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * Scan → Bin → Confirmed micro-interaction for warehouse pick confirm.
 */

type Phase = 'idle' | 'hiding' | 'transit' | 'dock' | 'success' | 'error'

export interface AnimatedPickConfirmButtonProps {
  disabled?: boolean
  busy?: boolean
  successToken?: number
  idleLabel: string
  successLabel: string
  onClick: () => void
  className?: string
}

function BarcodeBars(): ReactNode {
  const widths = [2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2]
  return (
    <span className="flex h-3.5 items-end gap-px text-white" aria-hidden>
      {widths.map((w, i) => (
        <span
          key={i}
          className="rounded-[0.5px] bg-current"
          style={{ width: w, height: `${8 + (i % 3) * 2}px` }}
        />
      ))}
    </span>
  )
}

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

export function AnimatedPickConfirmButton({
  disabled = false,
  busy = false,
  successToken = 0,
  idleLabel,
  successLabel,
  onClick,
  className,
}: AnimatedPickConfirmButtonProps): ReactNode {
  const [phase, setPhase] = useState<Phase>('idle')
  const [frozenLabel, setFrozenLabel] = useState(successLabel)
  const pendingSuccess = useRef(false)
  const sequenceOn = useRef(false)
  const timers = useRef<number[]>([])

  const clearTimers = (): void => {
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
  }

  const later = (fn: () => void, ms: number): void => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  const goIdle = (): void => {
    clearTimers()
    pendingSuccess.current = false
    sequenceOn.current = false
    setPhase('idle')
  }

  const goSuccess = (): void => {
    setPhase('success')
    later(() => goIdle(), 1600)
  }

  useEffect(() => {
    if (!busy || sequenceOn.current) return
    sequenceOn.current = true
    pendingSuccess.current = false
    setFrozenLabel(successLabel)
    clearTimers()
    setPhase('hiding')
    later(() => setPhase('transit'), 200)
    later(() => setPhase('dock'), 200 + 700)
    later(() => {
      if (pendingSuccess.current) goSuccess()
    }, 200 + 700 + 520)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy])

  useEffect(() => {
    if (successToken <= 0) return
    setFrozenLabel(successLabel)
    pendingSuccess.current = true
    if (phase === 'dock') {
      later(() => {
        if (pendingSuccess.current) goSuccess()
      }, 60)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successToken])

  useEffect(() => {
    if (busy) return
    if (!sequenceOn.current) return
    if (pendingSuccess.current) return
    if (phase === 'success' || phase === 'idle') return
    setPhase('error')
    later(() => goIdle(), 420)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy])

  useEffect(() => () => clearTimers(), [])

  const isSubmitting =
    phase === 'hiding' || phase === 'transit' || phase === 'dock'
  const isSuccess = phase === 'success'
  const interactive =
    !disabled && !busy && !isSubmitting && !isSuccess && phase !== 'error'
  const laserGreen = phase === 'transit' || phase === 'dock' || isSuccess
  const armed = !disabled && phase === 'idle'

  return (
    <motion.button
      type="button"
      disabled={!interactive}
      onClick={() => {
        if (!interactive) return
        onClick()
      }}
      aria-busy={isSubmitting || busy}
      animate={phase === 'error' ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
      transition={
        phase === 'error'
          ? { duration: 0.4, ease: 'easeInOut' }
          : { duration: 0.2 }
      }
      className={cn(
        'relative flex h-12 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-full px-2.5 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(15,23,42,0.32)] transition-[background-color,box-shadow,opacity] duration-300 sm:px-3',
        isSuccess ? 'bg-[#14532d]' : 'bg-neutral-900',
        armed &&
          'cursor-pointer ring-1 ring-white/10 hover:-translate-y-0.5 hover:bg-neutral-800 hover:shadow-[0_14px_32px_rgba(15,23,42,0.4)] hover:ring-emerald-500/30',
        !interactive && 'cursor-not-allowed',
        disabled && phase === 'idle' && 'opacity-55',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 rounded-full transition-opacity duration-300',
          isSuccess
            ? 'bg-[radial-gradient(90%_140%_at_80%_50%,rgba(34,197,94,0.35),transparent_55%)] opacity-100'
            : armed
              ? 'bg-[radial-gradient(80%_120%_at_12%_50%,rgba(255,255,255,0.08),transparent_55%)] opacity-100'
              : 'opacity-0',
        )}
      />

      <span
        className={cn(
          'relative z-10 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 transition-colors',
          isSuccess
            ? 'bg-[#22c55e] ring-[#22c55e]/45'
            : 'bg-white/10 ring-white/15',
        )}
      >
        {isSuccess ? (
          <Check className="h-4 w-4 stroke-[3] text-white" aria-hidden />
        ) : (
          <>
            <BarcodeBars />
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-1.5 left-1/2 w-0.5 -translate-x-1/2 rounded-full"
              style={{
                backgroundColor: laserGreen ? '#22c55e' : '#ef4444',
                boxShadow: laserGreen
                  ? '0 0 12px 2px rgba(34, 197, 94, 0.85)'
                  : '0 0 10px 2px rgba(239, 68, 68, 0.75)',
              }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{
                duration: laserGreen ? 0.45 : 1.2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </>
        )}
      </span>

      <span className="relative z-10 flex h-9 min-w-0 flex-1 items-center overflow-hidden">
        <AnimatePresence mode="wait">
          {isSuccess ? (
            <motion.div
              key="confirmed"
              className="flex w-full items-center justify-end gap-1.5 pr-1 text-emerald-100"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: [0.9, 1.07, 1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <span aria-hidden>✓</span>
              <span className="whitespace-nowrap">{frozenLabel}</span>
            </motion.div>
          ) : (
            <motion.div
              key="flow"
              className="relative flex h-full w-full items-center"
              initial={false}
            >
              {(phase === 'idle' || phase === 'hiding' || phase === 'error') && (
                <div className="ml-auto flex items-center gap-1.5 pr-1">
                  <span aria-hidden className="text-[15px] leading-none">
                    📦
                  </span>
                  <AnimatePresence initial={false}>
                    {phase === 'idle' || phase === 'error' ? (
                      <motion.span
                        key="label"
                        className="whitespace-nowrap"
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.2, ease: EASE }}
                      >
                        {idleLabel}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </div>
              )}

              {(phase === 'transit' || phase === 'dock') && (
                <>
                  <motion.span
                    aria-hidden
                    className="absolute z-10 text-[15px] leading-none will-change-[left,transform]"
                    initial={{
                      left: '6%',
                      top: '50%',
                      y: '-50%',
                      opacity: 1,
                      scale: 1,
                    }}
                    animate={
                      phase === 'transit'
                        ? {
                            left: '76%',
                            top: '50%',
                            y: '-50%',
                            opacity: 1,
                            scale: 1,
                          }
                        : {
                            left: '76%',
                            top: '50%',
                            y: [
                              '-50%',
                              'calc(-50% - 6px)',
                              '-50%',
                              'calc(-50% + 4px)',
                              '-50%',
                            ],
                            opacity: [1, 1, 1, 1, 0],
                            scale: [1, 1.1, 1, 0.85, 0.5],
                          }
                    }
                    transition={
                      phase === 'transit'
                        ? { duration: 0.7, ease: EASE }
                        : { duration: 0.48, ease: EASE }
                    }
                  >
                    📦
                  </motion.span>

                  <motion.span
                    aria-hidden
                    className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-emerald-300 ring-1 ring-white/15"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      duration: 0.28,
                      ease: EASE,
                      delay: phase === 'transit' ? 0.48 : 0,
                    }}
                  >
                    <Warehouse className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </motion.span>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </span>
    </motion.button>
  )
}
