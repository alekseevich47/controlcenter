import { useId, useRef, useState, type FormEvent } from 'react'
import { isApiError } from '../api/errors'
import type { SecretRef } from '../vault/types'
import { EntityFormModal } from './EntityFormModal'
import { ProjectPicker } from './ProjectPicker'

const MAX_NAME = 120
const MAX_PLACE = 200

export type SecretFormValues = {
  name: string
  place: string
  projectId: string
}

interface SecretFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  initial?: SecretRef | null
  busy?: boolean
  onClose: () => void
  onSubmit: (values: SecretFormValues) => Promise<void> | void
}

function fromSecret(secret?: SecretRef | null): SecretFormValues {
  return {
    name: secret?.name ?? '',
    place: secret?.place ?? '',
    projectId: secret?.projectId ?? '',
  }
}

function clip(value: string, max: number): string {
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, max)
}

function SecretFormBody({
  mode,
  initial,
  busy = false,
  onClose,
  onSubmit,
}: Omit<SecretFormModalProps, 'open'>) {
  const nameId = useId()
  const placeId = useId()
  const projectFieldId = useId()
  const [values, setValues] = useState<SecretFormValues>(() => fromSecret(initial))
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy || pending.current) return
    pending.current = true
    try {
      const name = clip(values.name, MAX_NAME)
      const place = clip(values.place, MAX_PLACE)
      const projectId = values.projectId.trim()
      if (!name) {
        setError('Укажите название')
        return
      }
      if (!place) {
        setError('Укажите, где лежит секрет')
        return
      }
      setError(null)
      await onSubmit({ name, place, projectId })
    } catch (err) {
      setError(isApiError(err) || err instanceof Error ? err.message : 'Не удалось сохранить ссылку')
    } finally {
      pending.current = false
    }
  }

  return (
    <EntityFormModal
      open
      title={mode === 'create' ? 'Добавить ссылку' : 'Редактировать ссылку'}
      busy={busy}
      error={error}
      submitLabel={mode === 'create' ? 'Добавить' : 'Сохранить'}
      onClose={onClose}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label htmlFor={nameId}>Название</label>
        <input
          id={nameId}
          autoFocus
          required
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={MAX_NAME}
          value={values.name}
          placeholder="SSH prod root"
          onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
        />
      </div>
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label htmlFor={placeId}>Где лежит</label>
        <input
          id={placeId}
          required
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={MAX_PLACE}
          value={values.place}
          placeholder="локальный vault"
          onChange={(event) => setValues((current) => ({ ...current, place: event.target.value }))}
        />
      </div>
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label htmlFor={projectFieldId}>Проект</label>
        <ProjectPicker
          id={projectFieldId}
          value={values.projectId}
          onChange={(projectId) => setValues((current) => ({ ...current, projectId }))}
        />
      </div>
      <p className="form-hint" style={{ gridColumn: '1 / -1' }}>
        Значение секрета сюда не вводится — только где оно лежит
      </p>
    </EntityFormModal>
  )
}

export function SecretFormModal({
  open,
  mode,
  initial,
  busy,
  onClose,
  onSubmit,
}: SecretFormModalProps) {
  if (!open) return null
  return (
    <SecretFormBody
      key={`${mode}-${initial?.id ?? 'new'}`}
      mode={mode}
      initial={initial}
      busy={busy}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  )
}
