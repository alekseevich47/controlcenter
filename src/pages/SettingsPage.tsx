import { HistorySettingsBlock } from '../components/HistorySettingsBlock'
import { useToast } from '../components/ToastProvider'
import { useVault } from '../vault/VaultContext'

export function SettingsPage() {
  const { path, prefs, savePrefs, syncNow, pickFolder, lock, isTauriRuntime } = useVault()
  const { notify } = useToast()

  async function toggle(key: 'syncOnExit' | 'encrypt' | 'aiFiles') {
    if (key === 'encrypt' && prefs.encrypt) {
      notify({
        message: 'Отключить шифрование существующих файлов пока нельзя — только для новых vault',
        tone: 'info',
      })
      return
    }
    await savePrefs({ [key]: !prefs[key] })
    notify({ message: 'Настройка сохранена', tone: 'success' })
  }

  async function onSync() {
    try {
      await syncNow()
      notify({ message: 'Синк отмечен (облачная выгрузка — следующий этап)', tone: 'success' })
    } catch (e) {
      notify({ message: e instanceof Error ? e.message : String(e), tone: 'danger' })
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Настройки</h1>
          <p>Локальное хранилище, шифрование, история и синхронизация</p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={lock}>
          Заблокировать vault
        </button>
      </div>

      <div className="settings-sections">
        <section className="card settings-block">
          <h3>Хранилище</h3>
          <p>
            Данные LCC — отдельные AES-GCM файлы
            {isTauriRuntime ? ' на диске ПК' : ' в IndexedDB (dev)'}
          </p>
          <div className="form-grid">
            <div className="field">
              <label>Папка / корень vault</label>
              <input value={path} readOnly />
            </div>
            <div className="field">
              <label>Последний бэкап / синк</label>
              <input value={prefs.lastSyncAt ?? 'ещё не синхронизировано'} readOnly />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-primary" type="button" onClick={() => void onSync()}>
              Синхронизировать сейчас
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => void pickFolder()}
              disabled={!isTauriRuntime}
              title={isTauriRuntime ? undefined : 'Выбор папки доступен в Tauri'}
            >
              Выбрать папку
            </button>
          </div>
        </section>

        <section className="card settings-block">
          <h3>Безопасность и синк</h3>
          <p>Шифрование файлов и отложенная отправка в облако</p>
          <div className="toggle-row">
            <div>
              <strong>Шифровать vault</strong>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                PBKDF2 + AES-256-GCM на каждый файл
              </div>
            </div>
            <button
              className={`switch${prefs.encrypt ? ' on' : ''}`}
              type="button"
              onClick={() => void toggle('encrypt')}
              aria-pressed={prefs.encrypt}
            >
              <i />
            </button>
          </div>
          <div className="toggle-row">
            <div>
              <strong>Синк при выходе</strong>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                отметка времени синка при закрытии окна
              </div>
            </div>
            <button
              className={`switch${prefs.syncOnExit ? ' on' : ''}`}
              type="button"
              onClick={() => void toggle('syncOnExit')}
              aria-pressed={prefs.syncOnExit}
            >
              <i />
            </button>
          </div>
          <div className="toggle-row">
            <div>
              <strong>ИИ по файлам</strong>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                флаг для будущего агента (docs без secrets)
              </div>
            </div>
            <button
              className={`switch${prefs.aiFiles ? ' on' : ''}`}
              type="button"
              onClick={() => void toggle('aiFiles')}
              aria-pressed={prefs.aiFiles}
            >
              <i />
            </button>
          </div>
        </section>

        <HistorySettingsBlock />

        <section className="card settings-block">
          <h3>Профиль</h3>
          <p>Локальный пользователь студии</p>
          <div className="form-grid">
            <div className="field">
              <label>Имя</label>
              <input
                value={prefs.profileName}
                onChange={(e) => void savePrefs({ profileName: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Роль</label>
              <select
                value={prefs.role}
                onChange={(e) =>
                  void savePrefs({ role: e.target.value as 'owner' | 'partner' })
                }
              >
                <option value="owner">Owner</option>
                <option value="partner">Партнёр</option>
              </select>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
