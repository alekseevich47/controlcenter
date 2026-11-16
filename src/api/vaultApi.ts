import { syncClientsForProject, syncProjectsForClient } from '../vault/clientProjects'
import { isSafeEntityId } from '../vault/ids'
import type { Client, Collection, CollectionMap, Project } from '../vault/types'
import { ApiError, toApiError } from './errors'
import {
  WRITABLE_COLLECTIONS,
  buildEntity,
  type WritableCollection,
  type WritableEntity,
} from './validate'

const READABLE = new Set<string>([...WRITABLE_COLLECTIONS, 'events'])

export type VaultGateway = {
  list: <C extends Collection>(collection: C) => Promise<CollectionMap[C][]>
  get: <C extends Collection>(collection: C, id: string) => Promise<CollectionMap[C] | null>
  put: <C extends Collection>(collection: C, entity: CollectionMap[C]) => Promise<void>
  remove: (collection: Collection, id: string) => Promise<void>
}

function asCollection(name: string): Collection {
  if (!READABLE.has(name)) throw new ApiError(404, 'not_found', 'Неизвестная коллекция')
  return name as Collection
}

function asWritable(name: string): WritableCollection {
  if (!(WRITABLE_COLLECTIONS as readonly string[]).includes(name)) {
    throw new ApiError(405, 'method_not_allowed', 'Эта коллекция доступна только для чтения')
  }
  return name as WritableCollection
}

async function assertProjectExists(gw: VaultGateway, projectId?: string): Promise<void> {
  if (!projectId) return
  const project = await gw.get('projects', projectId)
  if (!project) throw new ApiError(400, 'validation', 'Проект для привязки не найден')
}

async function applyProjectLink<T extends { project?: string; projectId?: string }>(
  gw: VaultGateway,
  entity: T,
  input: Record<string, unknown>,
): Promise<T> {
  if (entity.projectId) {
    const project = await gw.get('projects', entity.projectId)
    if (!project) throw new ApiError(400, 'validation', 'Проект для привязки не найден')
    return { ...entity, project: project.name, projectId: project.id }
  }
  if (input.projectId === null || input.projectId === '') {
    return { ...entity, project: '—', projectId: undefined }
  }
  return entity
}

async function syncProjectSideEffects(
  gw: VaultGateway,
  project: Project,
  prevClientId: string | null | undefined,
): Promise<void> {
  const [clients, projects] = await Promise.all([gw.list('clients'), gw.list('projects')])
  await syncClientsForProject(project, prevClientId, clients, projects, (collection, entity) =>
    gw.put(collection, entity),
  )
}

async function syncClientSideEffects(gw: VaultGateway, client: Client): Promise<void> {
  const projects = await gw.list('projects')
  await syncProjectsForClient(client, projects, (collection, entity) => gw.put(collection, entity))
}

export function createVaultApi(gw: VaultGateway) {
  return {
    async list(collectionName: string) {
      const collection = asCollection(collectionName)
      try {
        const items = await gw.list(collection)
        return items.slice(0, 2000)
      } catch (error) {
        throw toApiError(error)
      }
    },

    async get(collectionName: string, id: string) {
      const collection = asCollection(collectionName)
      if (!isSafeEntityId(id)) throw new ApiError(400, 'validation', 'Некорректный id')
      try {
        const row = await gw.get(collection, id)
        if (!row) throw new ApiError(404, 'not_found', 'Запись не найдена')
        return row
      } catch (error) {
        throw toApiError(error)
      }
    },

    async create(collectionName: string, input: Record<string, unknown>) {
      const collection = asWritable(collectionName)
      const now = new Date().toISOString()
      let entity = buildEntity(collection, input, now) as WritableEntity
      if (collection === 'servers') {
        await assertProjectExists(gw, (entity as { projectId?: string }).projectId)
      } else if ('project' in entity) {
        entity = (await applyProjectLink(
          gw,
          entity as { project?: string; projectId?: string },
          input,
        )) as WritableEntity
      }
      try {
        await gw.put(collection, entity as CollectionMap[typeof collection])
        if (collection === 'projects') {
          await syncProjectSideEffects(gw, entity as Project, null)
        }
        if (collection === 'clients') {
          await syncClientSideEffects(gw, entity as Client)
        }
        return entity
      } catch (error) {
        throw toApiError(error)
      }
    },

    async patch(collectionName: string, id: string, input: Record<string, unknown>, mode: 'patch' | 'replace') {
      const collection = asWritable(collectionName)
      if (!isSafeEntityId(id)) throw new ApiError(400, 'validation', 'Некорректный id')
      const current = await gw.get(collection, id)
      if (!current) throw new ApiError(404, 'not_found', 'Запись не найдена')
      if (mode === 'replace') {
        const required: Record<WritableCollection, string> = {
          projects: 'name',
          clients: 'name',
          servers: 'name',
          domains: 'domain',
          docs: 'title',
          campaigns: 'name',
          finance: 'title',
          secrets: 'name',
        }
        const key = required[collection]
        if (input[key] === undefined) {
          throw new ApiError(400, 'validation', `PUT требует поле ${key}`)
        }
        if (collection === 'finance' && input.amount === undefined) {
          throw new ApiError(400, 'validation', 'PUT требует поле amount')
        }
        if (collection === 'secrets' && input.place === undefined) {
          throw new ApiError(400, 'validation', 'PUT требует поле place')
        }
      }
      const now = new Date().toISOString()
      let entity = buildEntity(collection, input, now, current as WritableEntity)
      if (entity.id !== id) throw new ApiError(400, 'validation', 'id менять нельзя')
      if (collection === 'servers') {
        await assertProjectExists(gw, (entity as { projectId?: string }).projectId)
      } else if ('project' in entity) {
        entity = (await applyProjectLink(
          gw,
          entity as { project?: string; projectId?: string },
          input,
        )) as WritableEntity
      }
      const prevClientId = collection === 'projects' ? (current as Project).clientId : null
      try {
        await gw.put(collection, entity as CollectionMap[typeof collection])
        if (collection === 'projects') {
          await syncProjectSideEffects(gw, entity as Project, prevClientId)
        }
        if (collection === 'clients') {
          await syncClientSideEffects(gw, entity as Client)
        }
        return entity
      } catch (error) {
        throw toApiError(error)
      }
    },

    async remove(collectionName: string, id: string) {
      const collection = asWritable(collectionName)
      if (!isSafeEntityId(id)) throw new ApiError(400, 'validation', 'Некорректный id')
      const current = await gw.get(collection, id)
      if (!current) throw new ApiError(404, 'not_found', 'Запись не найдена')
      try {
        if (collection === 'projects') {
          const project = current as Project
          await gw.remove(collection, id)
          if (project.clientId) {
            await syncProjectSideEffects(gw, { ...project, clientId: null }, project.clientId)
          }
          return
        }
        if (collection === 'clients') {
          const client = { ...(current as Client), projectIds: [] }
          await syncClientSideEffects(gw, client)
        }
        await gw.remove(collection, id)
      } catch (error) {
        throw toApiError(error)
      }
    },
  }
}

export type VaultApi = ReturnType<typeof createVaultApi>
