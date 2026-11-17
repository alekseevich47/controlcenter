import { isTauri } from '../vault/runtime'
export async function applyAppUpdate(): Promise<{ ok: boolean; message: string; version?: string }> {
  if (!isTauri()) {
    return { ok: false, message: 'Обновление файлов выполняется в приложении на ПК (команда npm run desktop) из git-клона. В браузере доступна только проверка версии.' }
  }
  const { invoke } = await import('@tauri-apps/api/core')
  try {
    return await invoke('apply_app_update')
  } catch (error) {
    const message = typeof error === 'string' ? error : error instanceof Error ? error.message : 'Не удалось обновить файлы'
    return { ok: false, message: message.slice(0, 400) }
  }
}
