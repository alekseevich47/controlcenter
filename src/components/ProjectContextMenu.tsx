import { useEffect, useMemo, useRef, useState } from 'react'
import { useExclusiveOverlay } from '../hooks/exclusiveOverlay'
import {
  ACTIVE_PROJECT_STATUSES,
  isArchived,
  normalizeProjectStatus,
  type ProjectStatus,
} from '../vault/projectStatus'
import type { Project } from '../vault/types'
import { IconArchive, IconChevron, IconEdit, IconPin, IconStatus, IconTrash } from './Icons'

export type ProjectMenuAction =
  | { type: 'edit' }
  | { type: 'pin' }
  | { type: 'archive' }
  | { type: 'delete' }
  | { type: 'status'; status: ProjectStatus }

interface ProjectContextMenuProps {
  project: Project
  x: number
  y: number
  /** Меню из раздела «Архив» — другие подписи действий */
  archivedView?: boolean
  onAction: (action: ProjectMenuAction) => void
  onClose: () => void
}

const MENU_W = 220
const SUB_W = 180
const ITEM_H = 40
const PAD = 8

function clampMenuPos(x: number, y: number, itemCount: number) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const menuH = ITEM_H * itemCount + PAD * 2
  let left = x
  let top = y
  if (left + MENU_W > vw - 12) left = Math.max(12, vw - MENU_W - 12)
  if (top + menuH > vh - 12) top = Math.max(12, vh - menuH - 12)
  const subSide: 'right' | 'left' = left + MENU_W + SUB_W + 12 > vw ? 'left' : 'right'
  return { left, top, subSide }
}

export function ProjectContextMenu({
  project,
  x,
  y,
  archivedView = false,
  onAction,
  onClose,
}: ProjectContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const archived = archivedView || isArchived(project)
  const itemCount = archived ? 3 : 5
  const pos = useMemo(() => clampMenuPos(x, y, itemCount), [x, y, itemCount])
  const [statusOpen, setStatusOpen] = useState(false)
  const current = normalizeProjectStatus(project.status)
  const pinned = Boolean(project.pinned)
  const { subSide } = pos

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
      aria-label={`Действия: ${project.name}`}
    >
      {!archived && (
        <>
          <button
            className="ctx-item"
            type="button"
            role="menuitem"
            style={{ animationDelay: '40ms' }}
            onClick={() => onAction({ type: 'edit' })}
          >
            <IconEdit />
            <span>Редактировать</span>
          </button>
          <button
            className="ctx-item"
            type="button"
            role="menuitem"
            style={{ animationDelay: '80ms' }}
            onClick={() => onAction({ type: 'pin' })}
          >
            <IconPin />
            <span>{pinned ? 'Открепить' : 'Закрепить'}</span>
          </button>
        </>
      )}

      <button
        className="ctx-item"
        type="button"
        role="menuitem"
        style={{ animationDelay: archived ? '40ms' : '120ms' }}
        onClick={() => onAction({ type: 'archive' })}
      >
        <IconArchive />
        <span>{archived ? 'Из архива' : 'В архив'}</span>
      </button>

      <button
        className="ctx-item ctx-item-danger"
        type="button"
        role="menuitem"
        style={{ animationDelay: archived ? '80ms' : '160ms' }}
        onClick={() => onAction({ type: 'delete' })}
      >
        <IconTrash />
        <span>Удалить</span>
      </button>

      {!archived && (
        <div
          className="ctx-item ctx-item-submenu"
          style={{ animationDelay: '200ms' }}
          onMouseEnter={() => setStatusOpen(true)}
          onMouseLeave={() => setStatusOpen(false)}
          onFocus={() => setStatusOpen(true)}
        >
          <button type="button" role="menuitem" className="ctx-item-inner" aria-haspopup="menu">
            <IconStatus />
            <span>Статус</span>
            <IconChevron className={subSide === 'left' ? 'ctx-chevron-flip' : undefined} />
          </button>
          {statusOpen && (
            <div className={`ctx-submenu ctx-submenu-${subSide}`} role="menu">
              {ACTIVE_PROJECT_STATUSES.map((status, i) => (
                <button
                  key={status}
                  className={`ctx-item${current === status ? ' active' : ''}`}
                  type="button"
                  role="menuitemradio"
                  aria-checked={current === status}
                  style={{ animationDelay: `${40 + i * 40}ms` }}
                  onClick={() => onAction({ type: 'status', status })}
                >
                  <span className={`ctx-status-dot status-dot-${statusKindClass(status)}`} />
                  <span>{status}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function statusKindClass(status: ProjectStatus): string {
  switch (status) {
    case 'Продакшн':
      return 'green'
    case 'Разработка':
      return 'blue'
    case 'Тестирование':
      return 'purple'
    case 'Удален':
      return 'red'
    default:
      return 'amber'
  }
}
