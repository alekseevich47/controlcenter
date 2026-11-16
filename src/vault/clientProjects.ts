import { normalizeClient } from './clientContacts'
import type { Client, Project } from './types'

/** Имена проектов для карточки клиента. */
export function projectNamesForClient(client: Client, projects: Project[]): string {
  const ids = client.projectIds ?? []
  if (ids.length > 0) {
    const byId = new Map(projects.map((p) => [p.id, p]))
    const names = ids
      .map((id) => byId.get(id)?.name)
      .filter((n): n is string => Boolean(n && n.trim()))
    if (names.length > 0) return names.join(', ')
  }
  if (typeof client.projects === 'string' && client.projects.trim()) {
    return client.projects.trim()
  }
  const linked = projects.filter((p) => p.clientId === client.id).map((p) => p.name)
  return linked.length > 0 ? linked.join(', ') : '—'
}

function withIdsAndSummary(
  client: Client,
  projectIds: string[],
  projects: Project[],
): Client {
  const n = normalizeClient(client)
  const summary = projectNamesForClient({ ...n, projectIds }, projects)
  return {
    ...n,
    projectIds: projectIds.length > 0 ? projectIds : undefined,
    projects: summary === '—' ? undefined : summary,
  }
}

/**
 * Синхронизация после сохранения клиента:
 * — выбранные проекты получают clientId + имя;
 * — снятые с клиента — сбрасывают привязку, если указывали на него.
 */
export async function syncProjectsForClient(
  client: Client,
  allProjects: Project[],
  put: (collection: 'projects', entity: Project) => Promise<void>,
): Promise<void> {
  const next = normalizeClient(client)
  const selected = new Set(next.projectIds ?? [])
  const now = new Date().toISOString()

  for (const project of allProjects) {
    const shouldLink = selected.has(project.id)
    const wasLinked = project.clientId === next.id

    if (shouldLink) {
      if (project.clientId === next.id && project.client === next.name) continue
      await put('projects', {
        ...project,
        clientId: next.id,
        client: next.name,
        updatedAt: now,
      })
    } else if (wasLinked) {
      await put('projects', {
        ...project,
        clientId: null,
        client: '—',
        updatedAt: now,
      })
    }
  }
}

/**
 * Синхронизация после сохранения проекта с clientId:
 * обновляет projectIds у старого и нового клиента.
 */
export async function syncClientsForProject(
  project: Project,
  prevClientId: string | null | undefined,
  allClients: Client[],
  allProjects: Project[],
  put: (collection: 'clients', entity: Client) => Promise<void>,
): Promise<void> {
  const nextId = project.clientId?.trim() || null
  const prevId = prevClientId?.trim() || null
  if (nextId === prevId) return

  const now = new Date().toISOString()
  const byId = new Map(allClients.map((c) => [c.id, normalizeClient(c)]))

  // Проекты с уже обновлённым текущим project (для корректной сводки имён)
  const projectsView = allProjects.map((p) => (p.id === project.id ? project : p))

  if (prevId && prevId !== nextId) {
    const prev = byId.get(prevId)
    if (prev) {
      const projectIds = (prev.projectIds ?? []).filter((id) => id !== project.id)
      await put(
        'clients',
        {
          ...withIdsAndSummary(prev, projectIds, projectsView),
          updatedAt: now,
        },
      )
    }
  }

  if (nextId) {
    const client = byId.get(nextId)
    if (client) {
      const set = new Set(client.projectIds ?? [])
      set.add(project.id)
      await put(
        'clients',
        {
          ...withIdsAndSummary(client, [...set], projectsView),
          updatedAt: now,
        },
      )
    }
  }
}
