import { useState, type FormEvent } from 'react'
import { APP_VERSION } from '../version'
import { useVault } from '../vault/VaultContext'
import { LogoMark } from './Logo'

export function UnlockScreen() {
  const { path, unlock, error, isTauriRuntime, status } = useVault()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  if (status === 'booting') {
    return (
      <div className="unlock-screen">
        <div className="unlock-card card">
          <LogoMark size={56} />
          <p>Загрузка vault…</p>
        </div>
      </div>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setLocalError(null)
    try {
      await unlock(password)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="unlock-screen">
      <form className="unlock-card card" onSubmit={onSubmit}>
        <LogoMark size={64} />
        <h1>Loomixx Control Center</h1>
        <p className="unlock-sub">
          Локальный зашифрованный vault
          <br />
          <span className="mono">{path}</span>
        </p>
        <div className="field">
          <label>Мастер-пароль</label>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Если vault новый — создастся с этим паролем"
            required
            minLength={6}
          />
        </div>
        {(localError || error) && <div className="unlock-error">{localError || error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Открываем…' : 'Разблокировать'}
        </button>
        <p className="unlock-hint">
          Режим: {isTauriRuntime ? 'Tauri (диск ПК)' : 'браузер (IndexedDB для разработки)'}
        </p>
        <p className="unlock-hint">Сборка: {APP_VERSION}</p>
      </form>
    </div>
  )
}
