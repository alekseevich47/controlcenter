import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function IconHome(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  )
}

export function IconProjects(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <rect x="3" y="4" width="7" height="7" rx="1.5" />
      <rect x="14" y="4" width="7" height="7" rx="1.5" />
      <rect x="3" y="13" width="7" height="7" rx="1.5" />
      <rect x="14" y="13" width="7" height="7" rx="1.5" />
    </svg>
  )
}

export function IconServers(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="7" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconDomains(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9s-1.3 6.2-3.8 9c-2.5-2.8-3.8-5.8-3.8-9S9.5 5.8 12 3Z" />
    </svg>
  )
}

export function IconSeo(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 15l3.5-4 3 2.5L18 8" />
    </svg>
  )
}

export function IconClients(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5S14 16 14.5 19" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16 14.5c2 .3 3.6 1.5 4.2 3.5" />
    </svg>
  )
}

export function IconDocs(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h4.5M9 12h6M9 16h6" />
    </svg>
  )
}

export function IconFinance(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M3 10h2M19 10h2M3 14h2M19 14h2" />
    </svg>
  )
}

export function IconSecrets(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V8a4 4 0 0 1 8 0v2" />
    </svg>
  )
}

export function IconSettings(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6" />
    </svg>
  )
}

export function IconHistory(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3.2 1.8" />
      <path d="M5.2 8.2 3.5 6.5M3.5 6.5H6.2" />
    </svg>
  )
}

/** Круговая стрелка обновления (clockwise), как «стрелка обновления» / refresh. */
export function IconRefresh(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M18.5 17.8A7.6 7.6 0 1 0 12 19.6" />
      <path d="M15.2 17.8h3.3v3.3" />
    </svg>
  )
}

export function IconSearch(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" {...base} {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.5 16.5 20 20" />
    </svg>
  )
}

export function IconBell(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" {...base} {...p}>
      <path d="M6 16.5h12l-1.2-1.4V11a4.8 4.8 0 1 0-9.6 0v4.1L6 16.5Z" />
      <path d="M10 18.2a2 2 0 0 0 4 0" />
    </svg>
  )
}

export function IconPlus(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" {...base} {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconEdit(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" {...base} {...p}>
      <path d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20Z" />
      <path d="M12.5 6.5 17.5 11.5" />
    </svg>
  )
}

export function IconPin(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" {...base} {...p}>
      <path d="M12 17v5" />
      <path d="M8 4h8l-1.2 6.2A3.5 3.5 0 0 1 18 14H6a3.5 3.5 0 0 1 3.2-3.8L8 4Z" />
    </svg>
  )
}

export function IconTrash(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" {...base} {...p}>
      <path d="M5 8h14" />
      <path d="M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8" />
      <path d="M7.5 8l.8 11.2A1.5 1.5 0 0 0 9.8 20.5h4.4a1.5 1.5 0 0 0 1.5-1.3L16.5 8" />
      <path d="M10 11.5v5M14 11.5v5" />
    </svg>
  )
}

export function IconStatus(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" {...base} {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3 2" />
    </svg>
  )
}

export function IconChevron(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" {...base} {...p}>
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  )
}

export function IconClose(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" {...base} {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function IconRestore(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" {...base} {...p}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 4.5v5h5" />
    </svg>
  )
}

export function IconArchive(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" {...base} {...p}>
      <rect x="3.5" y="4" width="17" height="5" rx="1.5" />
      <path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9" />
      <path d="M10 13h4" />
    </svg>
  )
}

export function IconPower(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" {...base} {...p}>
      <path d="M12 3.5v7" />
      <path d="M7.2 6.8a6.8 6.8 0 1 0 9.6 0" />
    </svg>
  )
}

export function IconPlay(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" {...base} {...p}>
      <path d="M8.5 6.8v10.4L18 12 8.5 6.8Z" />
    </svg>
  )
}
