import { handleApiRequest, SlidingLimiter } from '../src/api/http'
import { bearerMatches, generateApiToken } from '../src/api/token'
import { createVaultApi, type VaultGateway } from '../src/api/vaultApi'
import { parseGithubRepo } from '../src/github/repo'
import type { Collection, CollectionMap } from '../src/vault/types'

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message)
}

function memoryGateway(): VaultGateway & { dump: () => Map<string, unknown> } {
  const store = new Map<string, CollectionMap[Collection]>()
  const keyOf = (collection: string, id: string) => `${collection}/${id}`
  return {
    dump: () => store,
    async list(collection) {
      const out: CollectionMap[typeof collection][] = []
      for (const [key, value] of store) {
        if (key.startsWith(`${collection}/`)) out.push(value as CollectionMap[typeof collection])
      }
      return out
    },
    async get(collection, id) {
      return (store.get(keyOf(collection, id)) as CollectionMap[typeof collection] | undefined) ?? null
    },
    async put(collection, entity) {
      store.set(keyOf(collection, entity.id), entity)
    },
    async remove(collection, id) {
      store.delete(keyOf(collection, id))
    },
  }
}

async function main() {
  assert(parseGithubRepo('loomixx/controlcenter')?.repo === 'controlcenter', 'parse slug')
  assert(
    parseGithubRepo('https://github.com/Loomixx/Control.git')?.owner === 'Loomixx',
    'parse url',
  )
  assert(parseGithubRepo('https://github.com/a/b/issues/1') === null, 'reject extra path')
  assert(parseGithubRepo('../etc') === null, 'reject traversal')

  const token = generateApiToken()
  assert(token.startsWith('lcc_') && bearerMatches(token, token), 'bearer match')
  assert(!bearerMatches(token, token.slice(0, -1) + 'A'), 'bearer mismatch')
  assert(!bearerMatches(token, null), 'bearer missing')

  const gw = memoryGateway()
  const api = createVaultApi(gw)
  const limiter = new SlidingLimiter(100, 10_000)
  let githubToken: string | null = null
  let login: string | null = null

  const call = (
    method: string,
    path: string,
    body: unknown,
    bearer: string | null,
    query = '',
  ) =>
    handleApiRequest(
      {
        api,
        expectedToken: token,
        limiter,
        githubStatus: async () => ({ connected: Boolean(login), login }),
        githubToken: async () => githubToken,
        githubConnect: async (raw) => {
          if (!raw.startsWith('ghp_') && !raw.startsWith('github_pat_')) {
            throw new Error('Нужен personal access token GitHub (ghp_… или github_pat_…).')
          }
          githubToken = raw
          login = 'octocat'
          return { login: 'octocat' }
        },
        githubDisconnect: async () => {
          githubToken = null
          login = null
        },
      },
      {
        method,
        path,
        query: new URLSearchParams(query),
        bodyText: body === undefined ? '' : JSON.stringify(body),
        bearer,
      },
    )

  const health = await call('GET', '/v1/health', undefined, null)
  assert(health.status === 200, 'health open')

  const denied = await call('GET', '/v1/projects', undefined, 'nope')
  assert(denied.status === 401, 'unauthorized')

  const secretQuery = await call('GET', '/v1/projects', undefined, token, 'token=abc')
  assert(secretQuery.status === 400, 'token query rejected')

  const traversal = await call('GET', '/v1/projects/../secrets', undefined, token)
  assert(traversal.status === 400, 'traversal rejected')

  const created = await call('POST', '/v1/domains', { domain: 'loomixx.ru', registrar: 'regru' }, token)
  assert(created.status === 201, `create domain ${created.status}`)
  const domain = created.body as { id: string; domain: string; project: string }
  assert(domain.domain === 'loomixx.ru' && domain.project === '—', 'domain shape')

  const patched = await call('PATCH', `/v1/domains/${domain.id}`, { ssl: 'Let\'s Encrypt' }, token)
  assert(patched.status === 200 && (patched.body as { ssl: string }).ssl === "Let's Encrypt", 'patch')

  const badSecret = await call(
    'POST',
    '/v1/secrets',
    { name: 'db', place: 'vault', value: 'super-secret' },
    token,
  )
  assert(badSecret.status === 400, 'secret value rejected')

  const secret = await call('POST', '/v1/secrets', { name: 'db', place: '1Password / prod' }, token)
  assert(secret.status === 201, 'secret ref created')
  assert(!JSON.stringify(secret.body).includes('super-secret'), 'value not stored')

  const events = await call('POST', '/v1/events', { title: 'x' }, token)
  assert(events.status === 405, 'events readonly')

  const project = await call(
    'POST',
    '/v1/projects',
    { name: 'LCC', github: 'https://github.com/loomixx/controlcenter' },
    token,
  )
  assert(project.status === 201, 'project created')
  const projectBody = project.body as { id: string; github: { owner: string; repo: string } }
  assert(projectBody.github.owner === 'loomixx' && projectBody.github.repo === 'controlcenter', 'github link')

  const cleared = await call('PATCH', `/v1/projects/${projectBody.id}`, { github: null }, token)
  assert(cleared.status === 200 && (cleared.body as { github: unknown }).github === null, 'github clear')

  const badToken = await call('POST', '/v1/github/token', { token: 'not-a-token' }, token)
  assert(badToken.status === 400, 'bad github token')
  assert(!JSON.stringify(badToken.body).includes('not-a-token'), 'token not echoed')

  const removed = await call('DELETE', `/v1/domains/${domain.id}`, undefined, token)
  assert(removed.status === 200, 'delete')
  const missing = await call('GET', `/v1/domains/${domain.id}`, undefined, token)
  assert(missing.status === 404, 'gone')

  const finance = await call('POST', '/v1/finance', { title: 'VPS', amount: 10.239 }, token)
  assert(finance.status === 201 && (finance.body as { amount: number }).amount === 10.24, 'money round')

  console.log('api-selftest ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
