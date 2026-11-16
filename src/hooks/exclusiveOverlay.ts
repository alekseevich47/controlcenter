import { useEffect, useRef, type RefObject } from 'react'

/**
 * Exclusive overlay registry — one open floating layer at a time
 * (CustomSelect, search panel, context menus). Opening a new layer
 * dismisses the previous; outside pointer / Escape dismisses the active one.
 *
 * Capture-phase listeners + selective stopPropagation keep modal
 * backdrops from closing the parent dialog when a nested select is open
 * (pointerdown then mousedown are guarded for one gesture).
 */

type Owner = {
  id: number
  root: RefObject<HTMLElement | null>
  close: () => void
  protectModal: boolean
}

export type ExclusiveOverlayOptions = {
  /** Swallow clicks on bare `.modal-backdrop` (not `.modal-card`). Default true. */
  protectModal?: boolean
}

let active: Owner | null = null
let seq = 0
let bindCount = 0
/** Until this timestamp, bare-backdrop pointer events stay swallowed (same gesture). */
let blockBackdropUntil = 0

function isBareBackdrop(target: Node): boolean {
  const el = target instanceof Element ? target : target.parentElement
  if (!el) return false
  return Boolean(el.closest('.modal-backdrop') && !el.closest('.modal-card'))
}

function onCapturePointer(e: Event) {
  const t = e.target
  if (!(t instanceof Node)) return

  const now = performance.now()
  if (now < blockBackdropUntil && isBareBackdrop(t)) {
    e.stopPropagation()
    return
  }

  if (!active) return
  if (active.root.current?.contains(t)) return

  const closing = active
  active = null
  closing.close()

  if (closing.protectModal && isBareBackdrop(t)) {
    e.stopPropagation()
    blockBackdropUntil = now + 500
  }
}

function onCaptureKey(e: KeyboardEvent) {
  if (!active || e.key !== 'Escape') return
  const closing = active
  active = null
  closing.close()
  e.stopPropagation()
}

function bindGlobal() {
  if (bindCount === 0) {
    window.addEventListener('pointerdown', onCapturePointer, true)
    window.addEventListener('mousedown', onCapturePointer, true)
    window.addEventListener('keydown', onCaptureKey, true)
  }
  bindCount += 1
}

function unbindGlobal() {
  bindCount = Math.max(0, bindCount - 1)
  if (bindCount === 0) {
    window.removeEventListener('pointerdown', onCapturePointer, true)
    window.removeEventListener('mousedown', onCapturePointer, true)
    window.removeEventListener('keydown', onCaptureKey, true)
  }
}

/**
 * While `open`, this layer is the sole exclusive overlay.
 * Claiming exclusivity immediately dismisses any previous owner.
 */
export function useExclusiveOverlay(
  open: boolean,
  onClose: () => void,
  rootRef: RefObject<HTMLElement | null>,
  options?: ExclusiveOverlayOptions,
): void {
  const closeRef = useRef(onClose)
  const protectModal = options?.protectModal !== false

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const id = ++seq
    const prev = active
    active = {
      id,
      root: rootRef,
      close: () => closeRef.current(),
      protectModal,
    }
    bindGlobal()

    if (prev && prev.id !== id) {
      prev.close()
    }

    return () => {
      unbindGlobal()
      if (active?.id === id) active = null
    }
  }, [open, rootRef, protectModal])
}
