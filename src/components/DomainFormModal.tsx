import { useId, useState, type FormEvent } from 'react'
import type { Domain } from '../vault/types'
import { EntityFormModal } from './EntityFormModal'
import { ProjectPicker } from './ProjectPicker'

const MAX = {
  domain: 200,
  registrar: 120,
  dns: 200,
  expires: 40,
  ssl: 80,
} as const

export type DomainFormValues = {
  domain: string
  registrar: string
  dns: string
  expires: string
  ssl: string
  projectId: string
}

interface DomainFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  initial?: Domain | null
  busy?: boolean
  onClose: () => void
  onSubmit: (values: DomainFormValues) => Promise<void> | void
}

function fromDomain(domain?: Domain | null): DomainFormValues {
  return {
    domain: domain?.domain ?? '',
    registrar: domain?.registrar ?? '',
    dns: domain?.dns ?? '',
    expires: domain?.expires ?? '',
    ssl: domain?.ssl ?? '',
    projectId: domain?.projectId ?? '',
  }
}

function sanitize(values: DomainFormValues): DomainFormValues {
  return {
    domain: values.domain.trim().slice(0, MAX.domain),
    registrar: values.registrar.trim().slice(0, MAX.registrar),
    dns: values.dns.trim().slice(0, MAX.dns),
    expires: values.expires.trim().slice(0, MAX.expires),
    ssl: values.ssl.trim().slice(0, MAX.ssl),
    projectId: values.projectId.trim(),
  }
}

function DomainFormBody({
  mode,
  initial,
  busy,
  onClose,
  onSubmit,
}: Omit<DomainFormModalProps, 'open'>) {
  const domainId = useId()
  const registrarId = useId()
  const dnsId = useId()
  const expiresId = useId()
  const sslId = useId()
  const projectId = useId()
  const [values, setValues] = useState<DomainFormValues>(() => fromDomain(initial))
  const [error, setError] = useState<string | null>(null)

  function update(patch: Partial<DomainFormValues>) {
    setValues((current) => ({ ...current, ...patch }))
    setError(null)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const next = sanitize(values)
    if (!next.domain) {
      setError('Укажите домен')
      return
    }
    if (/[\s/\\]/.test(next.domain)) {
      setError('Домен без пробелов и слешей')
      return
    }
    setError(null)
    void onSubmit(next)
  }

  return (
    <EntityFormModal
      open
      title={mode === 'create' ? 'Добавить домен' : 'Редактировать домен'}
      busy={busy}
      error={error}
      submitLabel={mode === 'create' ? 'Добавить' : 'Сохранить'}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label htmlFor={domainId}>Домен</label>
        <input
          id={domainId}
          autoFocus
          required
          value={values.domain}
          maxLength={MAX.domain}
          autoComplete="off"
          spellCheck={false}
          placeholder="example.ru"
          onChange={(event) => update({ domain: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={registrarId}>Регистратор</label>
        <input
          id={registrarId}
          value={values.registrar}
          maxLength={MAX.registrar}
          placeholder="Reg.ru"
          onChange={(event) => update({ registrar: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={dnsId}>DNS</label>
        <input
          id={dnsId}
          value={values.dns}
          maxLength={MAX.dns}
          placeholder="Cloudflare"
          onChange={(event) => update({ dns: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={expiresId}>Продление</label>
        <input
          id={expiresId}
          value={values.expires}
          maxLength={MAX.expires}
          placeholder="12.08.2027"
          onChange={(event) => update({ expires: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={sslId}>SSL</label>
        <input
          id={sslId}
          value={values.ssl}
          maxLength={MAX.ssl}
          placeholder="Let’s Encrypt"
          onChange={(event) => update({ ssl: event.target.value })}
        />
      </div>
      <div className="field" style={{ gridColumn: '1 / -1' }}>
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

export function DomainFormModal({
  open,
  mode,
  initial,
  busy,
  onClose,
  onSubmit,
}: DomainFormModalProps) {
  if (!open) return null
  return (
    <DomainFormBody
      key={`${mode}-${initial?.id ?? 'new'}`}
      mode={mode}
      initial={initial}
      busy={busy}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  )
}
