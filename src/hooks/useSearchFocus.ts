import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const MAX_ID_LEN = 128

/** Безопасный id из query (?id=). Path-сепараторы отсекаем. */
export function parseFocusId(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const id = raw.trim()
  if (!id || id.length > MAX_ID_LEN) return null
  if (/[/\\]/.test(id)) return null
  return id
}

type Options = {
  /** false, пока коллекция грузится */
  ready: boolean
  /**
   * Открыть сущность. Вернуть `false`, чтобы повторить после следующего ready
   * (например, items ещё пусты). Иначе фокус считается потреблённым.
   */
  onFocus: (id: string) => boolean | void
  /** Убрать ?id= из URL после успеха (default true) */
  clear?: boolean
}

/**
 * Читает `?id=` после перехода из глобального поиска и один раз вызывает onFocus.
 */
export function useSearchFocus({ ready, onFocus, clear = true }: Options) {
  const [params, setParams] = useSearchParams()
  const focusId = parseFocusId(params.get('id'))
  const onFocusRef = useRef(onFocus)
  onFocusRef.current = onFocus
  const consumedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!focusId) {
      consumedRef.current = null
      return
    }
    if (!ready) return
    if (consumedRef.current === focusId) return

    const result = onFocusRef.current(focusId)
    if (result === false) return

    consumedRef.current = focusId
    if (!clear) return

    const next = new URLSearchParams(params)
    if (!next.has('id')) return
    next.delete('id')
    setParams(next, { replace: true })
  }, [ready, focusId, clear, params, setParams])
}

/** Подсветка + scroll к элементу с `data-entity-id` после перехода из поиска. */
export function useSearchHighlight(ready: boolean, hasEntity: (id: string) => boolean) {
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasEntityRef = useRef(hasEntity)
  hasEntityRef.current = hasEntity

  const onFocus = useCallback((id: string) => {
    if (!hasEntityRef.current(id)) return
    if (timerRef.current) clearTimeout(timerRef.current)
    setHighlightId(id)
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-entity-id="${CSS.escape(id)}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    timerRef.current = setTimeout(() => setHighlightId(null), 2200)
  }, [])

  useSearchFocus({ ready, onFocus })

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return highlightId
}
