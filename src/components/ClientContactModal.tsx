import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import {
  CLIENT_CONTACT_LABELS,
  CLIENT_CONTACT_PLACEHOLDERS,
  CLIENT_FIELD_MAX,
  CLIENT_VALUE_FIELD_LABELS,
  CONTACT_LABEL_PRESETS,
  PHONE_VALUE_CHANNELS,
  sanitizeContactInput,
} from '../vault/clientContacts'
import {
  formatRuPhone,
  formatTelegramAccount,
  formatVkAccount,
  sanitizeRuPhone,
} from '../vault/contactMasks'
import type { ClientContactChannel, ClientContactItem } from '../vault/types'
import { CustomSelect } from './CustomSelect'
import { IconClose } from './Icons'

const MAX = CLIENT_FIELD_MAX

interface ClientContactModalProps {
  open: boolean
  mode: 'create' | 'edit'
  channel: ClientContactChannel
  initial?: ClientContactItem | null
  /** Телефоны клиента для выбора в полях «Телефон» */
  knownPhones?: string[]
  busy?: boolean
  onClose: () => void
  onSubmit: (values: {
    value: string
    phone?: string
    label?: string
  }) => Promise<void> | void
}

function initialPhoneDisplay(raw: string | undefined, channel: ClientContactChannel): string {
  if (PHONE_VALUE_CHANNELS.includes(channel)) {
    return raw ? formatRuPhone(raw) : '+7-'
  }
  return raw ?? ''
}

function ClientContactBody({
  mode,
  channel,
  initial,
  knownPhones = [],
  busy,
  onClose,
  onSubmit,
}: Omit<ClientContactModalProps, 'open'>) {
  const titleId = useId()
  const valueLabel = CLIENT_VALUE_FIELD_LABELS[channel]
  const channelLabel = CLIENT_CONTACT_LABELS[channel]
  const isPhoneValue = PHONE_VALUE_CHANNELS.includes(channel)
  const isTelegram = channel === 'telegram'
  const isVk = channel === 'vk'

  const [value, setValue] = useState(() => {
    if (isPhoneValue) return initialPhoneDisplay(initial?.value, channel)
    if (isTelegram) return initial?.value ? formatTelegramAccount(initial.value) : '@'
    if (isVk) return initial?.value ? formatVkAccount(initial.value) : 'vk.ru/'
    return initial?.value ?? ''
  })
  const [phone, setPhone] = useState(() =>
    isTelegram ? (initial?.phone ? formatRuPhone(initial.phone) : '+7-') : '',
  )
  const [label, setLabel] = useState(initial?.label ?? '')
  const [error, setError] = useState<string | null>(null)

  const phoneOptions = useMemo(
    () => knownPhones.map((p) => ({ value: p, label: p })),
    [knownPhones],
  )
  const canPickPhone = phoneOptions.length > 0
  const labelOptions = useMemo(
    () => [
      { value: '', label: 'Без подписи' },
      ...CONTACT_LABEL_PRESETS.map((p) => ({ value: p, label: p })),
    ],
    [],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function onValueChange(raw: string) {
    if (isPhoneValue) setValue(formatRuPhone(raw))
    else if (isTelegram) setValue(formatTelegramAccount(raw))
    else if (isVk) setValue(formatVkAccount(raw))
    else setValue(raw)
  }

  function onPhoneChange(raw: string) {
    setPhone(formatRuPhone(raw))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const result = sanitizeContactInput(
      channel,
      value,
      label,
      isTelegram ? phone : undefined,
    )
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError(null)
    await onSubmit(result)
  }

  const title =
    mode === 'create' ? `Добавить «${channelLabel}»` : `Изменить «${channelLabel}»`

  const valueRequired = !isTelegram
  const phoneField = (id: string, current: string, onChange: (v: string) => void) => (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      <label htmlFor={id}>Телефон</label>
      {canPickPhone ? (
        <div className="phone-field-stack">
          <CustomSelect
            id={`${id}-pick`}
            value={sanitizeRuPhone(current) || ''}
            options={phoneOptions}
            placeholder="Выбрать из телефонов клиента"
            onChange={(v) => onChange(formatRuPhone(v))}
          />
          <input
            id={id}
            value={current}
            maxLength={MAX.value}
            inputMode="tel"
            autoComplete="tel"
            onChange={(e) => onChange(e.target.value)}
            placeholder={CLIENT_CONTACT_PLACEHOLDERS.phone}
          />
          <p className="form-hint">Выбор из списка или ручной ввод с маской +7-…</p>
        </div>
      ) : (
        <input
          id={id}
          autoFocus={isPhoneValue && !isTelegram}
          value={current}
          maxLength={MAX.value}
          inputMode="tel"
          autoComplete="tel"
          onChange={(e) => onChange(e.target.value)}
          placeholder={CLIENT_CONTACT_PLACEHOLDERS.phone}
        />
      )}
    </div>
  )

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className={`modal-card card client-contact-modal${isTelegram ? ' has-tg-phone' : ''}${
          canPickPhone ? ' has-phone-pick' : ''
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="form-grid">
          {isPhoneValue ? (
            phoneField('cc-value', value, onValueChange)
          ) : (
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="cc-value">{valueLabel}</label>
              <input
                id="cc-value"
                autoFocus
                value={value}
                maxLength={MAX.value}
                required={valueRequired}
                onChange={(e) => onValueChange(e.target.value)}
                placeholder={CLIENT_CONTACT_PLACEHOLDERS[channel]}
              />
            </div>
          )}

          {isTelegram && phoneField('cc-phone', phone, onPhoneChange)}

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="cc-label">Подпись</label>
            <CustomSelect
              id="cc-label"
              value={label}
              options={labelOptions}
              placeholder="Рабочий, Личный или своя…"
              allowCustom
              embedded
              reserveRows={3}
              onChange={setLabel}
            />
          </div>
        </div>

        {error && <div className="unlock-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Сохраняем…' : mode === 'create' ? 'Добавить' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function ClientContactModal({
  open,
  mode,
  channel,
  initial,
  knownPhones,
  busy,
  onClose,
  onSubmit,
}: ClientContactModalProps) {
  if (!open) return null
  return (
    <ClientContactBody
      key={`${mode}-${channel}-${initial?.id ?? 'new'}`}
      mode={mode}
      channel={channel}
      initial={initial}
      knownPhones={knownPhones}
      busy={busy}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  )
}
