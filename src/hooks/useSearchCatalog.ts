import { useEffect, useState } from 'react'
import { emptyCatalog, type SearchCatalog } from '../vault/globalSearch'
import { useVault } from '../vault/VaultContext'

/** Ленивый каталог сущностей для глобального поиска (без events/secrets). */
export function useSearchCatalog(enabled: boolean) {
  const { list, status, refreshTick } = useVault()
  const [catalog, setCatalog] = useState<SearchCatalog>(emptyCatalog)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || status !== 'unlocked') {
      setCatalog(emptyCatalog())
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    void Promise.all([
      list('projects'),
      list('servers'),
      list('domains'),
      list('campaigns'),
      list('clients'),
      list('docs'),
      list('finance'),
    ])
      .then(([projects, servers, domains, campaigns, clients, docs, finance]) => {
        if (cancelled) return
        setCatalog({ projects, servers, domains, campaigns, clients, docs, finance })
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setCatalog(emptyCatalog())
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled, list, status, refreshTick])

  return { catalog, loading }
}
