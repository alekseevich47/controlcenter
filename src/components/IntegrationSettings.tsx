import { useState } from 'react'
import { useToast } from './ToastProvider'
import { useVault } from '../vault/VaultContext'
import { isApiError } from '../api/errors'

export function IntegrationSettings() {
  const {
    prefs,
    githubLogin,
    apiToken,
    connectGithub,
    disconnectGithub,
    setLocalApiEnabled,
    rotateApiToken,
  } = useVault()
  const { notify } = useToast()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [revealed, setRevealed] = useState(false)

  async function onConnect() {
    setBusy(true)
    try {
      const result = await connectGithub(token)
      setToken('')
      notify({ message: `GitHub подключён: ${result.login}`, tone: 'success' })
    } catch (error) {
      notify({ message: error instanceof Error ? error.message : 'Не удалось подключить GitHub', tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function onDisconnect() {
    setBusy(true)
    try {
      await disconnectGithub()
      notify({ message: 'GitHub отключён, токен удалён из vault', tone: 'info' })
    } catch (error) {
      notify({ message: error instanceof Error ? error.message : 'Не удалось отключить GitHub', tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function onToggleApi() {
    setBusy(true)
    try {
      await setLocalApiEnabled(!prefs.localApi)
      notify({
        message: prefs.localApi ? 'Локальный API выключен' : 'Локальный API включён',
        tone: 'success',
      })
    } catch (error) {
      const message = isApiError(error) || error instanceof Error ? error.message : 'Не удалось переключить API'
      notify({ message, tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function onRotate() {
    setBusy(true)
    try {
      await rotateApiToken()
      setRevealed(true)
      notify({ message: 'Bearer обновлён. Старый токен больше не действует', tone: 'success' })
    } catch (error) {
      notify({ message: error instanceof Error ? error.message : 'Не удалось обновить токен', tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function onCopy() {
    if (!apiToken) return
    try {
      await navigator.clipboard.writeText(apiToken)
      notify({ message: 'Bearer скопирован', tone: 'success' })
    } catch {
      notify({ message: 'Не удалось скопировать токен', tone: 'danger' })
    }
  }

  const base = import.meta.env.DEV ? 'http://127.0.0.1:5173/v1' : 'http://127.0.0.1:47331/v1'

  return (
    <>
      <section className="card settings-block">
        <h3>GitHub</h3>
        <p>Токен шифруется в vault (AES-GCM) и не попадает в историю, prefs и ответы API.</p>
        {githubLogin ? (
          <div className="toggle-row">
            <div>
              <strong>{githubLogin}</strong>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Подключение активно</div>
            </div>
            <button className="btn btn-ghost" type="button" onClick={() => void onDisconnect()} disabled={busy}>
              Отключить
            </button>
          </div>
        ) : (
          <div className="form-grid">
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="gh-token">Personal access token</label>
              <input
                id="gh-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="github_pat_… или ghp_…"
              />
            </div>
            <div>
              <button className="btn btn-primary" type="button" onClick={() => void onConnect()} disabled={busy || token.trim().length < 20}>
                Подключить
              </button>
            </div>
          </div>
        )}
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>
          Достаточно fine-grained PAT с чтением Metadata, Contents и Pull requests. В проекте указывается только owner/repo.
        </p>
      </section>

      <section className="card settings-block">
        <h3>Локальный API</h3>
        <p>Чтение, создание, правка и удаление записей vault. Только 127.0.0.1 и заголовок Bearer.</p>
        <div className="toggle-row">
          <div>
            <strong>{prefs.localApi ? 'Включён' : 'Выключен'}</strong>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>{base}</div>
          </div>
          <button
            className={`switch${prefs.localApi ? ' on' : ''}`}
            type="button"
            onClick={() => void onToggleApi()}
            aria-pressed={prefs.localApi}
            disabled={busy}
          >
            <i />
          </button>
        </div>
        {prefs.localApi && apiToken ? (
          <div className="form-grid" style={{ marginTop: 14 }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="api-token">Bearer</label>
              <input id="api-token" readOnly value={revealed ? apiToken : '•'.repeat(24)} />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" type="button" onClick={() => setRevealed((value) => !value)}>
                {revealed ? 'Скрыть' : 'Показать'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => void onCopy()}>
                Копировать
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => void onRotate()} disabled={busy}>
                Сменить токен
              </button>
            </div>
          </div>
        ) : null}
        <p className="mono" style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
          curl -H &quot;Authorization: Bearer …&quot; {base}/projects
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          Журнал events только на чтение. В секретах хранятся ссылки, не значения. Токен GitHub через API не возвращается.
        </p>
      </section>
    </>
  )
}
