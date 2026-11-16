import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ToastTone = 'info' | 'success' | 'danger'

export type ToastInput = {
  message: string
  tone?: ToastTone
}

type ToastItem = {
  id: string
  message: string
  tone: ToastTone
  remainingMs: number
  hovering: boolean
  exiting: boolean
}

type ToastContextValue = {
  notify: (input: string | ToastInput) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const HOLD_MS = 5000
const EXIT_MS = 320
/**
 * Доля высоты предыдущего тоста, которую закрывает новый.
 * Шаг стека = (1 - COVER) * высота → при 0.3 видно ~70% предыдущего.
 */
const COVER = 0.3
const TOAST_H = 52
const STACK_STEP = TOAST_H * (1 - COVER)
const LIFT_PX = 22

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, number>())
  const remaining = useRef(new Map<string, number>())
  const startedAt = useRef(new Map<string, number>())

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t != null) {
      window.clearTimeout(t)
      timers.current.delete(id)
    }
  }, [])

  const finishExit = useCallback((id: string) => {
    clearTimer(id)
    remaining.current.delete(id)
    startedAt.current.delete(id)
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [clearTimer])

  const beginExit = useCallback(
    (id: string) => {
      clearTimer(id)
      setToasts((list) => list.map((t) => (t.id === id ? { ...t, exiting: true, hovering: false } : t)))
      window.setTimeout(() => finishExit(id), EXIT_MS)
    },
    [clearTimer, finishExit],
  )

  const armTimer = useCallback(
    (id: string, ms: number) => {
      clearTimer(id)
      remaining.current.set(id, ms)
      startedAt.current.set(id, performance.now())
      const handle = window.setTimeout(() => beginExit(id), ms)
      timers.current.set(id, handle)
    },
    [beginExit, clearTimer],
  )

  const notify = useCallback(
    (input: string | ToastInput) => {
      const message = typeof input === 'string' ? input : input.message
      const tone: ToastTone = typeof input === 'string' ? 'info' : (input.tone ?? 'info')
      const id = `toast-${crypto.randomUUID().slice(0, 10)}`
      const item: ToastItem = {
        id,
        message: message.trim().slice(0, 280),
        tone,
        remainingMs: HOLD_MS,
        hovering: false,
        exiting: false,
      }
      setToasts((list) => [...list, item])
      armTimer(id, HOLD_MS)
      return id
    },
    [armTimer],
  )

  const dismiss = useCallback(
    (id: string) => {
      beginExit(id)
    },
    [beginExit],
  )

  const onEnter = useCallback(
    (id: string) => {
      const started = startedAt.current.get(id)
      const left = remaining.current.get(id) ?? HOLD_MS
      if (started != null) {
        const spent = performance.now() - started
        remaining.current.set(id, Math.max(0, left - spent))
      }
      clearTimer(id)
      setToasts((list) => list.map((t) => (t.id === id && !t.exiting ? { ...t, hovering: true } : t)))
    },
    [clearTimer],
  )

  const onLeave = useCallback(
    (id: string) => {
      const left = remaining.current.get(id) ?? HOLD_MS
      setToasts((list) => list.map((t) => (t.id === id ? { ...t, hovering: false } : t)))
      if (left > 0) armTimer(id, left)
      else beginExit(id)
    },
    [armTimer, beginExit],
  )

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const t of map.values()) window.clearTimeout(t)
      map.clear()
    }
  }, [])

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss])

  const ordered = toasts
  const topZ = 100 + ordered.length + 5

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {ordered.map((toast, index) => {
          // Новейший у нижнего края; предыдущие сдвинуты вверх так, чтобы
          // новый закрывал только COVER (30%) высоты предыдущего.
          const depthFromNewest = ordered.length - 1 - index
          const fromBottom = depthFromNewest * STACK_STEP
          const lift = toast.hovering ? LIFT_PX : 0
          const z = toast.hovering ? topZ : 100 + index
          return (
            <div
              key={toast.id}
              className={`toast-item toast-${toast.tone}${toast.exiting ? ' toast-exit' : ' toast-enter'}${
                toast.hovering ? ' toast-hover' : ''
              }`}
              style={{
                bottom: fromBottom + lift,
                zIndex: z,
              }}
              onMouseEnter={() => onEnter(toast.id)}
              onMouseLeave={() => onLeave(toast.id)}
              role="status"
            >
              <span className="toast-message">{toast.message}</span>
              <button
                type="button"
                className="toast-dismiss"
                aria-label="Закрыть"
                onClick={() => dismiss(toast.id)}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast вне ToastProvider')
  return ctx
}
