import { useEffect } from 'react'

/** Блокирует системное/браузерное context menu; кастомные меню вешаются точечно. */
export function useSuppressNativeContextMenu() {
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }
    document.addEventListener('contextmenu', onContextMenu)
    return () => document.removeEventListener('contextmenu', onContextMenu)
  }, [])
}
