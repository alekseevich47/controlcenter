import { useId, useState, type FormEvent } from 'react'
import type { Campaign } from '../vault/types'
import { CustomSelect } from './CustomSelect'
import { EntityFormModal } from './EntityFormModal'
import { ProjectPicker } from './ProjectPicker'

const MAX = {
  name: 160,
  platform: 80,
  budget: 40,
  status: 40,
} as const

const STATUS_KINDS = [
  { value: 'green', label: 'Зелёный' },
  { value: 'amber', label: 'Янтарный' },
] as const

const CHANNELS = [
  { value: 'seo', label: 'SEO' },
  { value: 'ads', label: 'Реклама' },
] as const

export type CampaignStatusKind = 'green' | 'amber'
export type CampaignChannel = 'seo' | 'ads'

export type CampaignFormValues = {
  name: string
  platform: string
  budget: string
  status: string
  statusKind: CampaignStatusKind
  channel: CampaignChannel
  projectId: string
}

type CampaignDraft = Omit<CampaignFormValues, 'channel'> & {
  channel: CampaignChannel | ''
}

interface CampaignFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  initial?: Campaign | null
  busy?: boolean
  onClose: () => void
  onSubmit: (values: CampaignFormValues) => Promise<void> | void
}

function isStatusKind(value: string | undefined): value is CampaignStatusKind {
  return value === 'green' || value === 'amber'
}

function isChannel(value: string | undefined): value is CampaignChannel {
  return value === 'seo' || value === 'ads'
}

function draftFrom(entry?: Campaign | null): CampaignDraft {
  return {
    name: entry?.name ?? '',
    platform: entry?.platform === '—' ? '' : (entry?.platform ?? ''),
    budget: entry?.budget === '—' ? '' : (entry?.budget ?? ''),
    status: entry?.status ?? '',
    statusKind: isStatusKind(entry?.statusKind) ? entry.statusKind : 'amber',
    channel: entry ? (isChannel(entry.channel) ? entry.channel : '') : 'seo',
    projectId: entry?.projectId ?? '',
  }
}

function CampaignFormBody({
  mode,
  initial,
  busy,
  onClose,
  onSubmit,
}: Omit<CampaignFormModalProps, 'open'>) {
  const nameId = useId()
  const platformId = useId()
  const budgetId = useId()
  const statusId = useId()
  const kindId = useId()
  const channelId = useId()
  const projectId = useId()
  const [values, setValues] = useState<CampaignDraft>(() => draftFrom(initial))
  const [error, setError] = useState<string | null>(null)

  function update(patch: Partial<CampaignDraft>) {
    setError(null)
    setValues((current) => ({ ...current, ...patch }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const name = values.name.trim()
    if (!name) {
      setError('Укажите название кампании')
      return
    }
    if (!isStatusKind(values.statusKind)) {
      setError('Цвет статуса: зелёный или янтарный')
      return
    }
    if (!isChannel(values.channel)) {
      setError('Выберите канал: SEO или реклама')
      return
    }
    setError(null)
    await onSubmit({
      name: name.slice(0, MAX.name),
      platform: values.platform.trim().slice(0, MAX.platform),
      budget: values.budget.trim().slice(0, MAX.budget),
      status: values.status.trim().slice(0, MAX.status),
      statusKind: values.statusKind,
      channel: values.channel,
      projectId: values.projectId,
    })
  }

  return (
    <EntityFormModal
      open
      title={mode === 'create' ? 'Новая кампания' : 'Редактировать кампанию'}
      busy={busy}
      error={error}
      submitLabel={mode === 'create' ? 'Создать' : 'Сохранить'}
      onClose={onClose}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label htmlFor={nameId}>Название</label>
        <input
          id={nameId}
          autoFocus
          value={values.name}
          maxLength={MAX.name}
          placeholder="Запись в секцию"
          onChange={(event) => update({ name: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={platformId}>Площадка</label>
        <input
          id={platformId}
          value={values.platform}
          maxLength={MAX.platform}
          placeholder="Яндекс Директ"
          onChange={(event) => update({ platform: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={budgetId}>Бюджет</label>
        <input
          id={budgetId}
          value={values.budget}
          maxLength={MAX.budget}
          placeholder="15 000 ₽"
          onChange={(event) => update({ budget: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={statusId}>Статус</label>
        <input
          id={statusId}
          value={values.status}
          maxLength={MAX.status}
          placeholder="Активна"
          onChange={(event) => update({ status: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={kindId}>Цвет статуса</label>
        <CustomSelect
          id={kindId}
          embedded
          reserveRows={2}
          value={values.statusKind}
          options={[...STATUS_KINDS]}
          onChange={(statusKind) => {
            if (isStatusKind(statusKind)) update({ statusKind })
          }}
        />
      </div>
      <div className="field">
        <label htmlFor={channelId}>Канал</label>
        <CustomSelect
          id={channelId}
          embedded
          reserveRows={2}
          value={values.channel}
          placeholder="Канал"
          options={[...CHANNELS]}
          onChange={(channel) => {
            if (isChannel(channel)) update({ channel })
          }}
        />
      </div>
      <div className="field">
        <label htmlFor={projectId}>Проект</label>
        <ProjectPicker
          id={projectId}
          value={values.projectId}
          onChange={(next) => update({ projectId: next })}
        />
      </div>
    </EntityFormModal>
  )
}

export function CampaignFormModal({
  open,
  mode,
  initial,
  busy,
  onClose,
  onSubmit,
}: CampaignFormModalProps) {
  if (!open) return null
  return (
    <CampaignFormBody
      key={`${mode}-${initial?.id ?? 'new'}`}
      mode={mode}
      initial={initial}
      busy={busy}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  )
}
