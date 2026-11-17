import { assertInstallTarget, isUserDataPath } from '../src/updates/userDataGuard'

const REFUSAL = 'Обновление не трогает файлы пользователя'

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message)
}

function expectUserData(path: string): void {
  const label = JSON.stringify(path)
  assert(isUserDataPath(path), `expected user data: ${label}`)
  let thrown: unknown
  try {
    assertInstallTarget(path)
  } catch (error) {
    thrown = error
  }
  assert(thrown instanceof Error, `assertInstallTarget did not throw: ${label}`)
  assert(
    thrown instanceof Error && thrown.message === REFUSAL,
    `refusal text: ${label}`,
  )
}

function expectInstallTarget(path: string): void {
  const label = JSON.stringify(path)
  assert(!isUserDataPath(path), `expected install target: ${label}`)
  assert(assertInstallTarget(path) === undefined, `install target rejected: ${label}`)
}

function testUserData(): void {
  const vaultRoot = 'C:/Users/x/AppData/Roaming/ru.loomixx.lcc/lcc-vault'
  const chosen = 'D:/Loomixx'
  const collections = [
    'projects',
    'clients',
    'servers',
    'domains',
    'docs',
    'campaigns',
    'finance',
    'secrets',
    'events',
  ]

  expectUserData('')
  expectUserData('..')
  expectUserData('../vault')
  expectUserData('C:/Program Files/LCC/../LCC.exe')
  expectUserData('C:\\Users\\x\\AppData\\..\\lcc-setup.exe')
  expectUserData('file..name')

  expectUserData('lcc-vault')
  expectUserData('.lcc')
  expectUserData(vaultRoot)
  expectUserData(`${vaultRoot}/`)
  expectUserData('C:\\Users\\x\\AppData\\Roaming\\ru.loomixx.lcc\\LCC-VAULT\\')
  expectUserData(`${vaultRoot}/readme.txt`)

  for (const file of ['github.enc', 'api-token.enc', 'prefs.json', 'probe.enc', 'meta.json']) {
    expectUserData(`${vaultRoot}/.lcc/${file}`)
    expectUserData(`${chosen}/.lcc/${file}`)
    expectUserData(`.lcc/${file}`)
    expectUserData(`.LCC/${file.toUpperCase()}`)
  }

  expectUserData('D:/backup-lcc-vault-copy/github.enc')
  expectUserData('D:\\backup-lcc-vault-copy\\api-token.enc')

  for (const collection of collections) {
    expectUserData(`${vaultRoot}/${collection}/id.json.enc`)
    expectUserData(`${chosen}/${collection}/id.json.enc`)
    expectUserData(`${chosen}\\${collection}\\id.JSON.ENC`)
    expectUserData(`${collection}/id.json.enc`)
  }

  expectUserData(`${vaultRoot}/loose.json.enc`)
  expectUserData('D:/backup-lcc-vault-copy/notes.json.enc')
  expectUserData('D:/DOCS/Page.json.enc')
}

function testInstallTargets(): void {
  const installPaths = [
    'C:/Program Files/LCC/LCC.exe',
    'C:\\Program Files\\LCC\\LCC.exe',
    'C:/Program Files/LCC/',
    'C:/Users/x/AppData/Local/Temp/lcc-setup.exe',
    'C:\\Users\\x\\AppData\\Local\\Temp\\lcc-setup.exe',
    'C:/Users/x/AppData/Local/Temp/lcc-setup.exe/',
    'D:/Loomixx/readme.txt',
    'prefs.json',
    'github.enc',
    'D:/notes/github.enc',
    'D:/notes/prefs.json',
    'D:/notes/page.json.enc',
    'D:/my-projects/a.json.enc',
    'projects.json.enc',
    'C:/Program Files/LCC/resources/app.asar',
  ]
  for (const path of installPaths) expectInstallTarget(path)
}

function main(): void {
  testUserData()
  testInstallTargets()
  console.log('user-data-selftest ok')
}

main()
