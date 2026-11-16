import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { useExclusiveOverlay } from '../hooks/exclusiveOverlay'
import { IconChevron, IconClose } from './Icons'

export type CustomSelectOption = {
  value: string
  label: string
}

interface CustomSelectBaseProps {
  id?: string
  options: CustomSelectOption[]
  placeholder?: string
  disabled?: boolean
  /** Разрешить свободный ввод (combobox) */
  allowCustom?: boolean
  /**
   * Панель в потоке + фиксированный слот высоты (модалка не прыгает).
   * `reserveRows` — сколько пунктов резервировать (default 3).
   */
  embedded?: boolean
  reserveRows?: number
  className?: string
  emptyLabel?: string
}

interface CustomSelectSingleProps extends CustomSelectBaseProps {
  multiple?: false
  value: string
  onChange: (value: string) => void
}

interface CustomSelectMultiProps extends CustomSelectBaseProps {
  multiple: true
  value: string[]
  onChange: (value: string[]) => void
}

export type CustomSelectProps = CustomSelectSingleProps | CustomSelectMultiProps

export function CustomSelect(props: CustomSelectProps) {
  const {
    id,
    options,
    placeholder = 'Выберите…',
    disabled = false,
    allowCustom = false,
    embedded = false,
    reserveRows = 3,
    className = '',
    emptyLabel = 'Нет вариантов',
  } = props

  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const slotRows = Math.max(reserveRows, 1)

  const selectedLabels = useMemo(() => {
    if (props.multiple) {
      const map = new Map(options.map((o) => [o.value, o.label]))
      return props.value.map((v) => map.get(v) ?? v)
    }
    const found = options.find((o) => o.value === props.value)
    return found ? [found.label] : props.value ? [props.value] : []
  }, [options, props])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !allowCustom) {
      if (!q) return options
      return options.filter(
        (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
      )
    }
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    )
  }, [options, query, allowCustom])

  const dismiss = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  useExclusiveOverlay(open, dismiss, rootRef)

  function commitSingle(next: string) {
    if (!props.multiple) props.onChange(next)
    setOpen(false)
    setQuery('')
  }

  function toggleMulti(optValue: string) {
    if (!props.multiple) return
    const set = new Set(props.value)
    if (set.has(optValue)) set.delete(optValue)
    else set.add(optValue)
    props.onChange([...set])
  }

  function onTriggerKey(e: KeyboardEvent) {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      if (allowCustom) requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  function applyCustom() {
    if (!allowCustom || props.multiple) return
    const next = query.trim()
    if (!next) return
    commitSingle(next)
  }

  const display = props.multiple
    ? selectedLabels.length > 0
      ? selectedLabels.join(', ')
      : ''
    : selectedLabels[0] ?? ''

  const panel = (
    <div className="custom-select-panel" role="presentation">
      {allowCustom && !props.multiple && (
        <div className="custom-select-search">
          <input
            ref={inputRef}
            value={query}
            placeholder="Поиск или свой вариант…"
            maxLength={120}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (filtered.length === 1) commitSingle(filtered[0].value)
                else applyCustom()
              }
            }}
          />
          {query.trim() && (
            <button type="button" className="custom-select-use-custom" onClick={applyCustom}>
              Использовать «{query.trim()}»
            </button>
          )}
        </div>
      )}

      <ul
        id={listId}
        className="custom-select-list"
        role="listbox"
        aria-multiselectable={props.multiple}
        style={embedded ? { minHeight: `${slotRows * 40}px` } : undefined}
      >
        {filtered.length === 0 ? (
          <li className="custom-select-empty">{emptyLabel}</li>
        ) : (
          filtered.map((opt) => {
            const selected = props.multiple
              ? props.value.includes(opt.value)
              : props.value === opt.value
            return (
              <li key={opt.value || opt.label}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`custom-select-option${selected ? ' selected' : ''}`}
                  onClick={() => {
                    if (props.multiple) toggleMulti(opt.value)
                    else commitSingle(opt.value)
                  }}
                >
                  {props.multiple && (
                    <span className={`custom-select-check${selected ? ' on' : ''}`} />
                  )}
                  <span>{opt.label}</span>
                </button>
              </li>
            )
          })
        )}
      </ul>

      {props.multiple && props.value.length > 0 && (
        <div className="custom-select-chips">
          {props.value.map((v) => {
            const label = options.find((o) => o.value === v)?.label ?? v
            return (
              <button
                key={v}
                type="button"
                className="custom-select-chip"
                onClick={() => toggleMulti(v)}
                title="Убрать"
              >
                {label}
                <IconClose />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <div
      ref={rootRef}
      className={`custom-select${open ? ' open' : ''}${disabled ? ' disabled' : ''}${
        embedded ? ' embedded' : ''
      }${allowCustom ? ' allow-custom' : ''} ${className}`.trim()}
    >
      <button
        id={id}
        type="button"
        className="custom-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return
          setOpen((v) => !v)
          if (!open && allowCustom) requestAnimationFrame(() => inputRef.current?.focus())
        }}
        onKeyDown={onTriggerKey}
      >
        <span className={`custom-select-value${display ? '' : ' placeholder'}`}>
          {display || placeholder}
        </span>
        <IconChevron className="custom-select-chevron" />
      </button>

      {embedded ? (
        <div
          className={`custom-select-slot${open ? ' open' : ''}`}
          style={
            {
              '--select-reserve-rows': String(slotRows),
            } as CSSProperties
          }
          aria-hidden={!open}
        >
          {open ? panel : null}
        </div>
      ) : (
        open && panel
      )}
    </div>
  )
}
