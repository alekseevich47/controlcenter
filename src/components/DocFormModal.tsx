import { useId, useState, type FormEvent } from 'react'
import type { Doc } from '../vault/types'
import { EntityFormModal } from './EntityFormModal'
import { ProjectPicker } from './ProjectPicker'

const MAX = {
  title: 160,
  type: 80,
  body: 20_000,
} as const

export type DocFormValues = {
  title: string
  type: string
  body: string
  projectId: string
}

interface DocFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  initial?: Doc | null
  busy?: boolean
  onClose: () => void
  onSubmit: (values: DocFormValues) => Promise<void> | void
}

function fromDoc(doc?: Doc | null): DocFormValues {
  return {
    title: doc?.title ?? '',
    type: doc?.type ?? 'Заметка',
    body: doc?.body ?? '',
    projectId: doc?.projectId ?? '',
  }
}

function DocFormBody({
  mode,
  initial,
  busy = false,
  onClose,
  onSubmit,
}: Omit<DocFormModalProps, 'open'>) {
  const titleId = useId()
  const typeId = useId()
  const projectFieldId = useId()
  const bodyId = useId()
  const [values, setValues] = useState<DocFormValues>(() => fromDoc(initial))
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const title = values.title.trim().slice(0, MAX.title)
    if (!title) {
      setError('Укажите название документа')
      return
    }
    setError(null)
    await onSubmit({
      title,
      type: values.type.trim().slice(0, MAX.type),
      body: values.body.slice(0, MAX.body),
      projectId: values.projectId,
    })
  }

  return (
    <EntityFormModal
      open
      title={mode === 'create' ? 'Новый документ' : 'Редактировать документ'}
      busy={busy}
      error={error}
      submitLabel={mode === 'create' ? 'Создать' : 'Сохранить'}
      onClose={onClose}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="field">
        <label htmlFor={titleId}>Название</label>
        <input
          id={titleId}
          autoFocus
          required
          value={values.title}
          maxLength={MAX.title}
          disabled={busy}
          placeholder="Название документа"
          onChange={(event) => {
            setError(null)
            setValues((current) => ({ ...current, title: event.target.value }))
          }}
        />
      </div>
      <div className="field">
        <label htmlFor={typeId}>Тип</label>
        <input
          id={typeId}
          value={values.type}
          maxLength={MAX.type}
          disabled={busy}
          placeholder="Заметка, инструкция, договор"
          onChange={(event) => setValues((current) => ({ ...current, type: event.target.value }))}
        />
      </div>
      <div className="field">
        <label htmlFor={projectFieldId}>Проект</label>
        <ProjectPicker
          id={projectFieldId}
          value={values.projectId}
          onChange={(projectId) => setValues((current) => ({ ...current, projectId }))}
        />
      </div>
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label htmlFor={bodyId}>Текст</label>
        <textarea
          id={bodyId}
          className="doc-body"
          value={values.body}
          maxLength={MAX.body}
          disabled={busy}
          placeholder="Текст документа"
          onChange={(event) => setValues((current) => ({ ...current, body: event.target.value }))}
        />
      </div>
    </EntityFormModal>
  )
}

export function DocFormModal({ open, mode, initial, busy, onClose, onSubmit }: DocFormModalProps) {
  if (!open) return null
  return (
    <DocFormBody
      key={`${mode}-${initial?.id ?? 'new'}`}
      mode={mode}
      initial={initial}
      busy={busy}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  )
}
