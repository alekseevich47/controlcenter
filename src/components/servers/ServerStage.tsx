import type { ReactNode } from 'react'

interface ServerStageProps {
  open: boolean
  preview: ReactNode
  children: ReactNode
}

export function ServerStage({ open, preview, children }: ServerStageProps) {
  return (
    <div className={`servers-stage${open ? ' is-open' : ''}`}>
      <div className="servers-list-col">
        <div className="servers-list" aria-label="Список серверов">
          {children}
        </div>
      </div>
      <div className="servers-preview-slot">
        <aside
          id="servers-preview"
          className="servers-preview card"
          inert={!open}
          aria-hidden={!open}
          aria-label={open ? 'Карточка сервера' : undefined}
        >
          {preview}
        </aside>
      </div>
    </div>
  )
}
