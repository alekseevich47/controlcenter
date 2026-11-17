import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { vpsOptionLabel, withSpacewebVps, type SpacewebRosterPhase } from '../../hosting/sync'
import type { SpacewebVps } from '../../hosting/spaceweb'
import { isSafeEntityId } from '../../vault/ids'
import { normalizeServer } from '../../vault/serverModel'
import type { Server, ServerProjectLink } from '../../vault/types'
import { useVault } from '../../vault/VaultContext'
import { ConfirmDialog } from '../ConfirmDialog'
import { CustomSelect } from '../CustomSelect'
import { ProjectPicker } from '../ProjectPicker'
import { useToast } from '../ToastProvider'
import { SshAccessFields } from './SshAccessFields'
import {
  SERVER_LIMITS,
  SERVER_ROLES,
  blankStored,
  clip,
  databaseError,
  failureMessage,
  linkDrafts,
  orDash,
  rootError,
  type LinkDraft,
} from './serverUi'

/** Не billingId: в алфавите id такого значения нет, ввести его с клавиатуры нельзя. */
const KEEP_LINK = '*keep*'

interface ServerSettingsFormProps {
  server: Server
  vps: readonly SpacewebVps[]
  vpsPhase: SpacewebRosterPhase
}

type RowIssue = { project?: string; root?: string; database?: string }

function asEngine(value: string): LinkDraft['engine'] {
  return value === 'postgres' || value === 'sqlite' ? value : ''
}

export function ServerSettingsForm({ server, vps, vpsPhase }: ServerSettingsFormProps) {
  const { put, remove, get, spacewebLogin } = useVault()
  const navigate = useNavigate()
  const { notify } = useToast()
  const [name, setName] = useState(() => server.name)
  const [host, setHost] = useState(() => blankStored(server.host))
  const [specs, setSpecs] = useState(() => blankStored(server.specs))
  const [role, setRole] = useState(() => blankStored(server.role))
  const [description, setDescription] = useState(() => server.description ?? '')
  const [notifyStatus, setNotifyStatus] = useState(() => Boolean(server.notifyStatus))
  const [links, setLinks] = useState<LinkDraft[]>(() => linkDrafts(server))
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const currentBillingId = server.provider?.kind === 'spaceweb' ? server.provider.billingId : ''
  const [picked, setPicked] = useState<string | null>(null)

  const issues = useMemo(() => collectIssues(links), [links])
  const listed = (id: string) => id !== '' && vps.some((row) => row.billingId === id)
  const selectValue =
    picked !== null ? picked : listed(currentBillingId) ? currentBillingId : currentBillingId ? KEEP_LINK : ''
  const vpsOptions = useMemo(() => {
    const options = [{ value: '', label: 'Не привязан' }]
    const known = currentBillingId !== '' && vps.some((row) => row.billingId === currentBillingId)
    if (currentBillingId && !known) {
      options.push({ value: KEEP_LINK, label: `Текущая привязка · ${currentBillingId}` })
    }
    for (const row of vps) {
      options.push({ value: row.billingId, label: vpsOptionLabel(row) })
    }
    return options
  }, [vps, currentBillingId])
  const shownBillingId = listed(selectValue) ? selectValue : selectValue === KEEP_LINK ? currentBillingId : ''

  function updateLink(key: string, patch: Partial<LinkDraft>) {
    setLinks((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  async function save() {
    const nextName = clip(name, SERVER_LIMITS.name)
    if (!nextName) {
      setFormError('Укажите название сервера')
      return
    }
    if (issues.size > 0) {
      setFormError('Проверьте привязки проектов')
      return
    }
    const nextLinks = toLinks(links)
    setFormError(null)
    setBusy(true)
    try {
      const nextDescription = clip(description, SERVER_LIMITS.description)
      const now = new Date().toISOString()
      const fresh = (await get('servers', server.id)) ?? server
      // Пароль и ключ в карточку не пишем. Свежая запись сохраняет ssh, который
      // успели сохранить отдельной кнопкой.
      const draft: Server = {
        ...fresh,
        name: nextName,
        host: orDash(clip(host, SERVER_LIMITS.host)),
        specs: orDash(clip(specs, SERVER_LIMITS.specs)),
        role: orDash(clip(role, SERVER_LIMITS.role)),
        description: nextDescription || undefined,
        notifyStatus,
        links: nextLinks,
        projectId: nextLinks[0]?.projectId,
        updatedAt: now,
      }
      let next = draft
      if (spacewebLogin) {
        if (selectValue === '') {
          next = omitProvider(draft)
        } else if (selectValue !== KEEP_LINK) {
          const chosen = vps.find((row) => row.billingId === selectValue)
          if (!chosen) {
            notify({ message: 'Выберите VPS из списка кабинета', tone: 'danger' })
            return
          }
          next = withSpacewebVps(draft, chosen, now)
        }
      }
      await put('servers', normalizeServer(next))
      notify({ message: `Сервер «${nextName}» обновлён`, tone: 'success' })
    } catch (error) {
      notify({ message: failureMessage(error), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function confirmPurge() {
    setBusy(true)
    try {
      const label = server.name
      await remove('servers', server.id)
      setConfirmDelete(false)
      notify({ message: `Сервер «${label}» удалён из LCC`, tone: 'danger' })
      navigate('/servers')
    } catch (error) {
      notify({ message: failureMessage(error), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form
        className="servers-settings"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <section className="card servers-section">
          <h2 className="servers-section-title">Карточка</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="srv-edit-name">Название</label>
              <input
                id="srv-edit-name"
                value={name}
                maxLength={SERVER_LIMITS.name}
                required
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="srv-edit-host">Хост</label>
              <input
                id="srv-edit-host"
                value={host}
                maxLength={SERVER_LIMITS.host}
                disabled={busy}
                onChange={(event) => setHost(event.target.value)}
                placeholder="VPS · Timeweb"
              />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="srv-edit-specs">Ресурсы</label>
              <input
                id="srv-edit-specs"
                value={specs}
                maxLength={SERVER_LIMITS.specs}
                disabled={busy}
                onChange={(event) => setSpecs(event.target.value)}
                placeholder="2 vCPU · 4 GB · 40 GB SSD"
              />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="srv-edit-desc">Описание</label>
              <textarea
                id="srv-edit-desc"
                value={description}
                maxLength={SERVER_LIMITS.description}
                disabled={busy}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Для чего этот хост"
              />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="srv-edit-role">Роль</label>
              <CustomSelect
                id="srv-edit-role"
                value={role}
                allowCustom
                placeholder="Роль"
                disabled={busy}
                options={SERVER_ROLES.map((item) => ({ value: item, label: item }))}
                onChange={setRole}
              />
            </div>
            <label className="servers-check" style={{ gridColumn: '1 / -1' }}>
              <input
                type="checkbox"
                checked={notifyStatus}
                disabled={busy}
                onChange={(event) => setNotifyStatus(event.target.checked)}
              />
              Письмо при смене статуса
            </label>
          </div>
        </section>

        <section className="card servers-section">
          <h2 className="servers-section-title">Проекты</h2>
          {links.length === 0 ? <p className="servers-note">Проекты не привязаны.</p> : null}
          {links.map((row) => {
            const issue = issues.get(row.key)
            return (
              <div key={row.key} className="servers-link-row">
                <div className="servers-link-head">
                  <strong>Привязка</strong>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => setLinks((rows) => rows.filter((item) => item.key !== row.key))}
                  >
                    Убрать
                  </button>
                </div>
                <div className="form-grid">
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor={`srv-link-${row.key}-project`}>Проект</label>
                    <ProjectPicker
                      id={`srv-link-${row.key}-project`}
                      value={row.projectId}
                      embedded={false}
                      onChange={(projectId) => updateLink(row.key, { projectId })}
                    />
                    {issue?.project ? <p className="servers-field-error">{issue.project}</p> : null}
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor={`srv-link-${row.key}-root`}>Каталог на хосте</label>
                    <input
                      id={`srv-link-${row.key}-root`}
                      value={row.root}
                      maxLength={SERVER_LIMITS.path}
                      disabled={busy}
                      placeholder="/var/www/app"
                      aria-invalid={Boolean(issue?.root)}
                      onChange={(event) => updateLink(row.key, { root: event.target.value })}
                    />
                    <p className="form-hint">Абсолютный путь: с /, без пробелов и без сегмента ..</p>
                    {issue?.root ? <p className="servers-field-error">{issue.root}</p> : null}
                  </div>
                  <div className="field">
                    <label htmlFor={`srv-link-${row.key}-engine`}>База</label>
                    <CustomSelect
                      id={`srv-link-${row.key}-engine`}
                      value={row.engine}
                      disabled={busy}
                      placeholder="Без базы"
                      options={[
                        { value: '', label: 'Без базы' },
                        { value: 'postgres', label: 'postgres' },
                        { value: 'sqlite', label: 'sqlite' },
                      ]}
                      onChange={(engine) => updateLink(row.key, { engine: asEngine(engine) })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`srv-link-${row.key}-db`}>Имя базы</label>
                    <input
                      id={`srv-link-${row.key}-db`}
                      value={row.dbName}
                      maxLength={SERVER_LIMITS.dbName}
                      disabled={busy}
                      placeholder="app_db"
                      aria-invalid={Boolean(issue?.database)}
                      onChange={(event) => updateLink(row.key, { dbName: event.target.value })}
                    />
                    {issue?.database ? <p className="servers-field-error">{issue.database}</p> : null}
                  </div>
                </div>
              </div>
            )
          })}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || links.length >= SERVER_LIMITS.links}
            onClick={() =>
              setLinks((rows) => [
                ...rows,
                { key: crypto.randomUUID(), projectId: '', root: '', engine: '', dbName: '' },
              ])
            }
          >
            Добавить проект
          </button>
        </section>

        <SshAccessFields server={server} />

        <section className="card servers-section">
          <h2 className="servers-section-title">Хостер</h2>
          {spacewebLogin == null ? (
            <>
              <p className="servers-note">Привязка к кабинету хостера настраивается в Настройках приложения.</p>
              {currentBillingId ? (
                <div className="kv">
                  <div>
                    <small>Billing ID</small>
                    <strong className="mono">{currentBillingId}</strong>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="form-grid">
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="srv-provider">VPS Spaceweb</label>
                <CustomSelect
                  id="srv-provider"
                  value={selectValue}
                  disabled={busy}
                  placeholder="Не привязан"
                  options={vpsOptions}
                  onChange={(value) => setPicked(value)}
                />
                <p className="form-hint">
                  Только машины из кабинета. «Не привязан» снимает привязку и не удаляет ни сервер, ни VPS.
                </p>
                {vpsPhase === 'loading' || (vpsPhase === 'off' && vps.length === 0) ? (
                  <p className="servers-note">Читаем список VPS…</p>
                ) : null}
                {vpsPhase === 'error' && vps.length === 0 ? (
                  <p className="servers-note">Список VPS не прочитан. Текущая привязка сохранится, пока не выбрать «Не привязан».</p>
                ) : null}
                {selectValue === KEEP_LINK ? (
                  <p className="servers-note">Этой машины нет в текущем списке кабинета.</p>
                ) : null}
              </div>
              {shownBillingId ? (
                <div className="kv" style={{ gridColumn: '1 / -1' }}>
                  <div>
                    <small>Billing ID</small>
                    <strong className="mono">{shownBillingId}</strong>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>

        {formError ? <div className="unlock-error">{formError}</div> : null}

        <div className="servers-settings-save">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </form>

      <section className="card servers-section servers-danger">
        <h2 className="servers-section-title">Удаление</h2>
        <p className="servers-note">
          Удаление убирает карточку только из LCC. Машина у хостера не удаляется.
        </p>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
        >
          Удалить из LCC
        </button>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Удалить сервер?"
        message={`Сервер «${server.name}» будет удалён только из LCC. Машина у хостера не удаляется.`}
        confirmLabel="Удалить"
        danger
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void confirmPurge()}
      />
    </>
  )
}

function omitProvider(server: Server): Server {
  const next: Server = { ...server }
  delete next.provider
  return next
}

function collectIssues(rows: LinkDraft[]): Map<string, RowIssue> {
  const map = new Map<string, RowIssue>()
  const seen = new Set<string>()
  for (const row of rows) {
    const projectId = row.projectId.trim()
    const root = row.root.trim()
    const dbName = row.dbName.trim()
    if (!projectId && !root && !row.engine && !dbName) continue
    const issue: RowIssue = {}
    if (!projectId) issue.project = 'Выберите проект'
    else if (!isSafeEntityId(projectId)) issue.project = 'Некорректный проект'
    else if (seen.has(projectId)) issue.project = 'Этот проект уже в списке'
    else seen.add(projectId)
    const rootMsg = rootError(row.root)
    if (rootMsg) issue.root = rootMsg
    const dbMsg = databaseError(row.engine, row.dbName)
    if (dbMsg) issue.database = dbMsg
    if (issue.project || issue.root || issue.database) map.set(row.key, issue)
  }
  return map
}

function toLinks(rows: LinkDraft[]): ServerProjectLink[] {
  const out: ServerProjectLink[] = []
  for (const row of rows) {
    const projectId = row.projectId.trim()
    const root = row.root.trim()
    const dbName = row.dbName.trim()
    if (!projectId && !root && !row.engine && !dbName) continue
    if (!projectId) continue
    const link: ServerProjectLink = { projectId }
    if (root) link.root = root
    if ((row.engine === 'postgres' || row.engine === 'sqlite') && dbName) {
      link.database = { engine: row.engine, name: dbName }
    }
    out.push(link)
  }
  return out
}
