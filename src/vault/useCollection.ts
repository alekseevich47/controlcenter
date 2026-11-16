import { useEffect, useState } from 'react'
import { useVault } from './VaultContext'
import type { Collection, CollectionMap } from './types'

export function useCollection<C extends Collection>(collection: C) {
  const { list, status, refreshTick } = useVault()
  const [items, setItems] = useState<CollectionMap[C][]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status !== 'unlocked') {
      setItems([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void list(collection).then((rows) => {
      if (!cancelled) {
        setItems(rows)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [collection, list, status, refreshTick])

  return { items, loading }
}
