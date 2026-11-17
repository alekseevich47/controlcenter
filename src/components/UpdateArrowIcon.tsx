type UpdateArrowIconProps = {
  spinning: boolean
  percent: number | null
  size?: number
}

/** Целое 0–100 для цифры в стрелке и подписей рядом. */
export function formatUpdatePercent(percent: number | null): number | null {
  if (percent == null || !Number.isFinite(percent)) return null
  return Math.max(0, Math.min(100, Math.round(percent)))
}

/**
 * Круговая стрелка обновления. Во время загрузки крутится только дуга
 * с наконечником; процент стоит в центре и не вращается.
 */
export function UpdateArrowIcon({ spinning, percent, size = 28 }: UpdateArrowIconProps) {
  const rounded = formatUpdatePercent(percent)
  const showCenter = spinning
  const center = rounded == null ? '…' : String(rounded)
  const ariaLabel =
    rounded != null ? `Скачивание ${rounded}%` : spinning ? 'Скачивание' : undefined
  // 9px на иконке ~28px: единицы viewBox 24 масштабируются шириной svg.
  const fontSize = Math.max((9 * 24) / size, (9 * 24) / 28)

  return (
    <svg
      className={spinning ? 'update-arrow is-spinning' : 'update-arrow'}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      focusable="false"
      {...(ariaLabel
        ? { role: 'img' as const, 'aria-label': ariaLabel }
        : { 'aria-hidden': true as const })}
    >
      <g className="update-arrow-spin">
        <path
          d="M19.77 15.46A8.5 8.5 0 1 1 16.25 4.64"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path
          d="M15.43 6.07 18.98 6.21 17.07 3.21"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {showCenter ? (
        <text
          className="update-arrow-pct"
          x="12"
          y="12"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fill="currentColor"
          aria-hidden="true"
        >
          {center}
        </text>
      ) : null}
    </svg>
  )
}
