import { useEffect, useMemo, useRef } from 'react'
import { useExclusiveOverlay } from '../hooks/exclusiveOverlay'
import type { Client } from '../vault/types'
import { IconEdit, IconTrash } from './Icons'

export type ClientMenuAction = { type: 'open' } | { type: 'edit' } | { type: 'delete' }

interface ClientContextMenuProps {
  client: Client
  x: number
  y: number
  onAction: (action: ClientMenuAction) => void
  onClose: () => void
}

const MENU_W = 220
const ITEM_H = 40
const PAD = 8
const ITEM_COUNT = 3

function clampMenuPos(x: number, y: number) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const menuH = ITEM_H * ITEM_COUNT + PAD * 2
  let left = x
  let top = y
  if (left + MENU_W > vw - 12) left = Math.max(12, vw - MENU_W - 12)
  if (top + menuH > vh - 12) top = Math.max(12, vh - menuH - 12)
  return { left, top }
}

export function ClientContextMenu({ client, x, y, onAction, onClose }: ClientContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const pos = useMemo(() => clampMenuPos(x, y), [x, y])

  useExclusiveOverlay(true, onClose, rootRef, { protectModal: false })

  useEffect(() => {
    const onScroll = () => onClose()
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [onClose])

  return (
    <div
      ref={rootRef}
      className="ctx-menu"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      aria-label={`Действия: ${client.name}`}
    >
      <button
        className="ctx-item"
        type="button"
        role="menuitem"
        style={{ animationDelay: '40ms' }}
        onClick={() => onAction({ type: 'open' })}
      >
        <span className="ctx-open-glyph" aria-hidden>
          →
        </span>
        <span>Открыть</span>
      </button>
      <button
        className="ctx-item"
        type="button"
        role="menuitem"
        style={{ animationDelay: '80ms' }}
        onClick={() => onAction({ type: 'edit' })}
      >
        <IconEdit />
        <span>Редактировать</span>
      </button>
      <button
        className="ctx-item ctx-item-danger"
        type="button"
        role="menuitem"
        style={{ animationDelay: '120ms' }}
        onClick={() => onAction({ type: 'delete' })}
      >
        <IconTrash />
        <span>Удалить</span>
      </button>
    </div>
  )
}
