import type { Project } from './types'

export const PROJECT_STATUSES = [
  'Планирование',
  'Разработка',
  'Тестирование',
  'Продакшн',
  'Удален',
] as const

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

/** Статусы для фильтров и смены через меню (без «Удален» — это архив). */
export const ACTIVE_PROJECT_STATUSES = PROJECT_STATUSES.filter((s) => s !== 'Удален')

const LEGACY: Record<string, ProjectStatus> = {
  'В проде': 'Продакшн',
  'В работе': 'Тестирование',
  Разработка: 'Разработка',
  Планирование: 'Планирование',
  Тестирование: 'Тестирование',
  Продакшн: 'Продакшн',
  Удален: 'Удален',
}

export function normalizeProjectStatus(raw: string): ProjectStatus {
  return LEGACY[raw] ?? (PROJECT_STATUSES.includes(raw as ProjectStatus) ? (raw as ProjectStatus) : 'Планирование')
}

export function statusKindFor(status: string): Project['statusKind'] {
  switch (normalizeProjectStatus(status)) {
    case 'Продакшн':
      return 'green'
    case 'Разработка':
      return 'blue'
    case 'Тестирование':
      return 'purple'
    case 'Удален':
      return 'red'
    case 'Планирование':
    default:
      return 'amber'
  }
}

export function badgeClass(kind: Project['statusKind']): string {
  switch (kind) {
    case 'green':
      return 'badge-green'
    case 'blue':
      return 'badge-blue'
    case 'purple':
      return 'badge-purple'
    case 'red':
      return 'badge-red'
    case 'amber':
    default:
      return 'badge-amber'
  }
}

/** Проект в разделе «Архив» (legacy: status «Удален» или deletedAt). */
export function isArchived(project: Pick<Project, 'status' | 'deletedAt'>): boolean {
  return Boolean(project.deletedAt) || normalizeProjectStatus(project.status) === 'Удален'
}

/** @deprecated используйте isArchived */
export const isTrashed = isArchived

export function applyStatus(project: Project, status: ProjectStatus): Project {
  const now = new Date().toISOString()
  if (status === 'Удален') {
    return archiveProject(project)
  }
  return {
    ...project,
    status,
    statusKind: statusKindFor(status),
    updatedAt: now,
  }
}

/** В архив без смены рабочего статуса (кроме legacy «Удален»). */
export function archiveProject(project: Project): Project {
  const now = new Date().toISOString()
  return {
    ...project,
    deletedAt: project.deletedAt ?? now,
    updatedAt: now,
  }
}

export function unarchiveProject(project: Project): Project {
  const now = new Date().toISOString()
  const raw = normalizeProjectStatus(project.status)
  const status: ProjectStatus = raw === 'Удален' ? 'Планирование' : raw
  return {
    ...project,
    status,
    statusKind: statusKindFor(status),
    deletedAt: null,
    updatedAt: now,
  }
}
