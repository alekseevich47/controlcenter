/** Единый номер версии UI (синхронизируется с package.json через Vite define). */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.2.0'

/**
 * Метка сборки. Пока совпадает с semver; при CI можно подставлять
 * короткий git SHA / номер pipeline через отдельный define.
 */
export const APP_BUILD: string = APP_VERSION

/** Канал поставки до появления облачных апдейтов. */
export const APP_CHANNEL = 'local' as const
