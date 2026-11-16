import { useMemo, useState } from 'react'
import {
  CLIENT_CONTACT_CHANNELS,
  CLIENT_CONTACT_LABELS,
  CLIENT_FIELD_MAX,
  collectClientPhones,
  copyToClipboard,
  normalizeClient,
  newContactId,
} from '../vault/clientContacts'
import { projectNamesForClient } from '../vault/clientProjects'
import type { Client, ClientContactChannel, ClientContactItem, Project } from '../vault/types'
import { ClientContactModal } from './ClientContactModal'
import { ConfirmDialog } from './ConfirmDialog'
import { IconEdit, IconPlus, IconTrash } from './Icons'
import { useToast } from './ToastProvider'

interface ClientDetailProps {
  client: Client
  projects: Project[]
  busy?: boolean
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onSave: (next: Client) => Promise<void>
}

type ContactFormState =
  | { mode: 'create'; channel: ClientContactChannel }
  | { mode: 'edit'; channel: ClientContactChannel; item: ClientContactItem }
  | null

export function ClientDetail({
  client,
  projects,
  busy = false,
  onBack,
  onEdit,
  onDelete,
  onSave,
}: ClientDetailProps) {
  const { notify } = useToast()
  const normalized = useMemo(() => normalizeClient(client), [client])
  const knownPhones = useMemo(
    () => collectClientPhones(normalized.contacts),
    [normalized.contacts],
  )
  const projectLine = useMemo(
    () => projectNamesForClient(normalized, projects),
    [normalized, projects],
  )
  const [contactForm, setContactForm] = useState<ContactFormState>(null)
  const [confirmItem, setConfirmItem] = useState<{
    channel: ClientContactChannel
    item: ClientContactItem
  } | null>(null)
  const [localBusy, setLocalBusy] = useState(false)

  async function persistContacts(
    channel: ClientContactChannel,
    items: ClientContactItem[],
    toast: string,
  ) {
    setLocalBusy(true)
    try {
      const next: Client = {
        id: normalized.id,
        createdAt: normalized.createdAt,
        updatedAt: new Date().toISOString(),
        name: normalized.name,
        note: normalized.note,
        contacts: {
          ...normalized.contacts,
          [channel]: items,
        },
        tags: normalized.tags,
        notes: normalized.notes,
        projectId: normalized.projectId,
        ...(normalized.projectIds ? { projectIds: normalized.projectIds } : {}),
        ...(normalized.projects ? { projects: normalized.projects } : {}),
      }
      await onSave(next)
      notify({ message: toast, tone: 'success' })
    } finally {
      setLocalBusy(false)
    }
  }

  async function saveContactValues(values: {
    value: string
    phone?: string
    label?: string
  }) {
    if (!contactForm) return
    const { channel } = contactForm
    const list = [...normalized.contacts[channel]]
    const payload: ClientContactItem = {
      id:
        contactForm.mode === 'edit' ? contactForm.item.id : newContactId(),
      value: values.value,
      ...(values.phone ? { phone: values.phone } : {}),
      ...(values.label ? { label: values.label } : {}),
    }

    if (contactForm.mode === 'edit') {
      const idx = list.findIndex((i) => i.id === contactForm.item.id)
      if (idx < 0) return
      list[idx] = payload
      await persistContacts(channel, list, 'Контакт обновлён')
    } else {
      if (list.length >= CLIENT_FIELD_MAX.itemsPerChannel) {
        notify({
          message: `Не больше ${CLIENT_FIELD_MAX.itemsPerChannel} позиций в разделе`,
          tone: 'danger',
        })
        return
      }
      list.push(payload)
      await persistContacts(channel, list, 'Контакт добавлен')
    }
    setContactForm(null)
  }

  async function confirmRemoveItem() {
    if (!confirmItem) return
    const { channel, item } = confirmItem
    const list = normalized.contacts[channel].filter((i) => i.id !== item.id)
    setConfirmItem(null)
    await persistContacts(channel, list, 'Контакт удалён')
  }

  async function handleCopy(text: string, channel: ClientContactChannel) {
    const ok = await copyToClipboard(text)
    if (ok) {
      notify({
        message: `Скопировано · ${CLIENT_CONTACT_LABELS[channel]}`,
        tone: 'success',
      })
    } else {
      notify({ message: 'Не удалось скопировать', tone: 'danger' })
    }
  }

  async function copyClientId() {
    const ok = await copyToClipboard(normalized.id)
    notify({
      message: ok ? 'Id клиента скопирован' : 'Не удалось скопировать id',
      tone: ok ? 'success' : 'danger',
    })
  }

  const saving = busy || localBusy

  return (
    <div className="client-detail">
      <div className="page-head project-detail-head">
        <div>
          <button className="btn btn-ghost detail-back" type="button" onClick={onBack}>
            ← К списку
          </button>
          <h1 className="detail-title">{normalized.name}</h1>
          <p>Карточка клиента и каналы связи</p>
        </div>
        <div className="detail-actions">
          <button className="btn btn-ghost" type="button" onClick={onEdit} disabled={saving}>
            <IconEdit /> Редактировать
          </button>
          <button className="btn btn-danger" type="button" onClick={onDelete} disabled={saving}>
            <IconTrash /> Удалить
          </button>
        </div>
      </div>

      <div className="card project-detail-card client-passport">
        <div className="detail-badge-row">
          <span className="badge badge-lime">клиент</span>
          <button
            type="button"
            className="client-id-chip"
            title="Скопировать id"
            onClick={() => void copyClientId()}
          >
            <small>id</small>
            <code>{normalized.id}</code>
          </button>
        </div>
        {normalized.note ? <p className="detail-note">{normalized.note}</p> : null}
        <div className="kv detail-kv">
          <div style={{ gridColumn: '1 / -1' }}>
            <small>Проекты</small>
            <strong>{projectLine}</strong>
          </div>
        </div>
      </div>

      <section className="client-contacts" aria-label="Контакты">
        <div className="page-head page-head-compact">
          <div>
            <h2 className="panel-title">Контакты</h2>
            <p className="muted-line">Клик по значению — копирование в буфер</p>
          </div>
        </div>

        <div className="client-contact-grid">
          {CLIENT_CONTACT_CHANNELS.map((channel) => {
            const items = normalized.contacts[channel]
            const label = CLIENT_CONTACT_LABELS[channel]
            const atCap = items.length >= CLIENT_FIELD_MAX.itemsPerChannel
            return (
              <article key={channel} className="card client-contact-section">
                <div className="client-contact-head">
                  <h3>{label}</h3>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    disabled={saving || atCap}
                    title={atCap ? 'Достигнут лимит позиций' : `Добавить «${label}»`}
                    onClick={() => setContactForm({ mode: 'create', channel })}
                  >
                    <IconPlus /> Добавить
                  </button>
                </div>

                {items.length === 0 ? (
                  <p className="client-contact-empty">Нет записей</p>
                ) : (
                  <ul className="client-contact-list">
                    {items.map((item) => {
                      const main = item.value || item.phone || ''
                      const secondary =
                        channel === 'telegram' && item.value && item.phone
                          ? item.phone
                          : null
                      return (
                        <li key={item.id} className="client-contact-row">
                          <button
                            type="button"
                            className="client-contact-value"
                            title="Скопировать"
                            onClick={() => void handleCopy(main, channel)}
                          >
                            {item.label ? (
                              <span className="client-contact-label">{item.label}</span>
                            ) : null}
                            <span className="client-contact-text">
                              {main || '—'}
                            </span>
                            {secondary ? (
                              <span className="client-contact-sub">{secondary}</span>
                            ) : null}
                          </button>
                          <div className="row-actions">
                            <button
                              className="icon-action"
                              type="button"
                              aria-label="Редактировать"
                              disabled={saving}
                              onClick={() => setContactForm({ mode: 'edit', channel, item })}
                            >
                              <IconEdit />
                            </button>
                            <button
                              className="icon-action icon-action-danger"
                              type="button"
                              aria-label="Удалить"
                              disabled={saving}
                              onClick={() => setConfirmItem({ channel, item })}
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <ClientContactModal
        open={Boolean(contactForm)}
        mode={contactForm?.mode ?? 'create'}
        channel={contactForm?.channel ?? 'phone'}
        initial={contactForm?.mode === 'edit' ? contactForm.item : null}
        knownPhones={knownPhones}
        busy={saving}
        onClose={() => setContactForm(null)}
        onSubmit={saveContactValues}
      />

      <ConfirmDialog
        open={Boolean(confirmItem)}
        title="Удалить контакт?"
        message={`Удалить «${confirmItem?.item.value || confirmItem?.item.phone || ''}» из раздела «${
          confirmItem ? CLIENT_CONTACT_LABELS[confirmItem.channel] : ''
        }»?`}
        confirmLabel="Удалить"
        danger
        busy={saving}
        onCancel={() => setConfirmItem(null)}
        onConfirm={() => void confirmRemoveItem()}
      />
    </div>
  )
}
