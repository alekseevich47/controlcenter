import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

interface AppSearchValue {
  query: string
  setQuery: (q: string) => void
  clear: () => void
}

const AppSearchContext = createContext<AppSearchValue | null>(null)

export function AppSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQueryState] = useState('')
  const setQuery = useCallback((q: string) => {
    setQueryState(q.slice(0, 200))
  }, [])
  const clear = useCallback(() => setQueryState(''), [])
  const value = useMemo(() => ({ query, setQuery, clear }), [query, setQuery, clear])
  return <AppSearchContext.Provider value={value}>{children}</AppSearchContext.Provider>
}

export function useAppSearch() {
  const ctx = useContext(AppSearchContext)
  if (!ctx) throw new Error('useAppSearch вне AppSearchProvider')
  return ctx
}
