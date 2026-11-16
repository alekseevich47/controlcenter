import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppSearch } from '../hooks/useAppSearch'
import { useExclusiveOverlay } from '../hooks/exclusiveOverlay'
import { useSearchCatalog } from '../hooks/useSearchCatalog'
import { searchCatalog, type SearchHit } from '../vault/globalSearch'
import { IconClose, IconSearch } from './Icons'

const GLOBAL_PLACEHOLDER = 'Поиск по проектам, серверам, документации...'
const HISTORY_PLACEHOLDER = 'Поиск в истории...'

function isHistoryPath(pathname: string): boolean {
  return pathname === '/history' || pathname.endsWith('/history')
}

export function TopbarSearch() {
  const { query, setQuery, clear } = useAppSearch()
  const location = useLocation()
  const navigate = useNavigate()
  const historyMode = isHistoryPath(location.pathname)
  const hasQuery = query.trim().length > 0

  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const catalogEnabled = !historyMode && hasQuery
  const { catalog, loading } = useSearchCatalog(catalogEnabled)

  const hits = useMemo(() => {
    if (historyMode || !hasQuery) return [] as SearchHit[]
    return searchCatalog(catalog, query)
  }, [historyMode, hasQuery, catalog, query])

  const safeActive = activeIndex >= 0 && activeIndex < hits.length ? activeIndex : -1
  const showPanel = open && !historyMode && hasQuery

  const dismissPanel = useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
  }, [])

  useExclusiveOverlay(showPanel, dismissPanel, rootRef, { protectModal: false })

  const selectHit = useCallback(
    (hit: SearchHit) => {
      setOpen(false)
      setActiveIndex(-1)
      clear()
      navigate(hit.to)
      inputRef.current?.blur()
    },
    [clear, navigate],
  )

  const onClear = useCallback(() => {
    clear()
    setOpen(false)
    setActiveIndex(-1)
    inputRef.current?.focus()
  }, [clear])

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (showPanel) {
        setOpen(false)
        setActiveIndex(-1)
        return
      }
      if (hasQuery) onClear()
      return
    }

    if (historyMode || !hasQuery) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIndex((i) => {
        if (hits.length === 0) return -1
        const cur = i >= 0 && i < hits.length ? i : -1
        return Math.min(cur + 1, hits.length - 1)
      })
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => {
        const cur = i >= 0 && i < hits.length ? i : hits.length
        return Math.max(cur - 1, -1)
      })
      return
    }

    if (e.key === 'Enter' && safeActive >= 0 && hits[safeActive]) {
      e.preventDefault()
      selectHit(hits[safeActive])
    }
  }

  return (
    <div
      ref={rootRef}
      className={`search${showPanel ? ' search-open' : ''}${hasQuery ? ' has-query' : ''}`}
      role="search"
    >
      <button
        type="button"
        className={`search-affix${hasQuery ? ' is-clear' : ''}`}
        aria-label={hasQuery ? 'Очистить поиск' : undefined}
        aria-hidden={!hasQuery}
        tabIndex={hasQuery ? 0 : -1}
        disabled={!hasQuery}
        onClick={hasQuery ? onClear : undefined}
      >
        <span className="search-affix-layer search-affix-search" aria-hidden>
          <IconSearch />
        </span>
        <span className="search-affix-layer search-affix-close" aria-hidden>
          <IconClose />
        </span>
      </button>

      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActiveIndex(-1)
          if (!historyMode) setOpen(true)
        }}
        onFocus={() => {
          if (!historyMode && query.trim()) setOpen(true)
        }}
        onKeyDown={onKeyDown}
        placeholder={historyMode ? HISTORY_PLACEHOLDER : GLOBAL_PLACEHOLDER}
        aria-label={historyMode ? 'Поиск в истории' : 'Глобальный поиск'}
        aria-autocomplete={historyMode ? undefined : 'list'}
        aria-controls={showPanel ? listId : undefined}
        aria-expanded={historyMode ? undefined : showPanel}
        role={historyMode ? undefined : 'combobox'}
        autoComplete="off"
        spellCheck={false}
      />

      {showPanel ? (
        <div className="search-panel" id={listId} role="listbox" aria-label="Результаты поиска">
          {loading && hits.length === 0 ? (
            <div className="search-panel-empty">Ищем…</div>
          ) : hits.length === 0 ? (
            <div className="search-panel-empty">Ничего не найдено</div>
          ) : (
            <ul className="search-hits">
              {hits.map((hit, index) => {
                const active = index === safeActive
                return (
                  <li key={hit.key}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`search-hit${active ? ' active' : ''}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectHit(hit)}
                    >
                      <span className="search-hit-text">
                        <strong>{hit.title}</strong>
                        {hit.subtitle ? <small>{hit.subtitle}</small> : null}
                      </span>
                      <span className={`badge badge-${hit.badge} search-hit-badge`}>
                        {hit.sectionLabel}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
