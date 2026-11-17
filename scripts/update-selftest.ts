import { readFileSync } from 'node:fs'
import { CHANGELOG } from '../src/updates/changelog'
import {
  clearPendingUpdate,
  readPendingUpdate,
  writePendingUpdate,
  type PendingUpdate,
} from '../src/updates/pending'
import {
  buildFromSha,
  notesFromCommitMessage,
  parseRemoteManifest,
  releaseFromManifest,
  type RemoteManifest,
} from '../src/updates/remote'
import { isNewerVersion, parseSemver } from '../src/updates/semver'

const PENDING_KEY = 'lcc.update.pending.v1'

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message)
}

function testSemver(): void {
  assert(isNewerVersion('0.2.1', '0.2.0'), '0.2.1 newer than 0.2.0')
  assert(!isNewerVersion('0.2.0', '0.2.0'), '0.2.0 is not newer than 0.2.0')
  assert(isNewerVersion('0.10.0', '0.9.0'), '0.10.0 newer than 0.9.0')
  assert(!isNewerVersion('0.9.0', '0.10.0'), '0.9.0 is not newer than 0.10.0')
  assert(isNewerVersion('1.0.0', '0.9.9'), 'major beats minor')
  assert(!isNewerVersion('0.2.0', '0.2.1'), 'older patch')

  assert(!isNewerVersion('v1.2.3', '0.0.1'), 'v prefix is not newer')
  assert(!isNewerVersion('1.2', '0.0.1'), 'short version is not newer')
  assert(!isNewerVersion('', '0.0.1'), 'empty string is not newer')
  assert(!isNewerVersion('1.2.3', 'v1.2.3'), 'garbage local is not newer')
  assert(!isNewerVersion('1.2.3', ''), 'empty local is not newer')
  assert(!isNewerVersion('v1.2.3', 'v1.0.0'), 'two garbage versions')

  assert(parseSemver('v1.2.3') === null, 'reject v prefix')
  assert(parseSemver('1.2') === null, 'reject missing patch')
  assert(parseSemver('') === null, 'reject empty')
  assert(parseSemver('1.2.3-rc.1') === null, 'reject pre-release')
  assert(parseSemver('1.2.3+build') === null, 'reject build metadata')
  const parsed = parseSemver('0.10.0')
  assert(parsed?.[0] === 0 && parsed[1] === 10 && parsed[2] === 0, 'numeric parse')
}

function testManifestParser(): void {
  const parsed = parseRemoteManifest({
    version: '1.2.3',
    generatedAt: 'ignore-me',
    token: 'should-not-leak',
    entries: [
      {
        version: '1.2.3',
        title: '  Заголовок  ',
        highlights: ['  a  ', 'b'],
        id: 'extra',
      },
      { version: 'nope', title: 'bad', highlights: [] },
      { version: '1.2.4', title: 'good', highlights: ['ok', 1] },
      { version: '1.2.5', title: 'kept', highlights: ['x'] },
    ],
  })
  assert(parsed !== null, 'extra fields still parse')
  assert(parsed?.version === '1.2.3', 'manifest version')
  assert(!Object.prototype.hasOwnProperty.call(parsed, 'token'), 'root extra dropped')
  assert(!Object.prototype.hasOwnProperty.call(parsed, 'generatedAt'), 'root meta dropped')
  assert(parsed?.entries.length === 2, 'bad entries skipped')
  assert(parsed?.entries[0]?.title === 'Заголовок', 'title trimmed')
  assert(parsed?.entries[0]?.highlights[0] === 'a', 'highlight trimmed')
  assert(parsed?.entries[1]?.version === '1.2.5', 'later good entry kept')
  assert(JSON.stringify(parsed?.entries[0]) === JSON.stringify({
    version: '1.2.3',
    title: 'Заголовок',
    highlights: ['a', 'b'],
  }), 'entry extra fields dropped')

  assert(parseRemoteManifest({ version: 'v1.2.3', entries: [] }) === null, 'reject v version')
  assert(parseRemoteManifest({ version: '1.2', entries: [] }) === null, 'reject short version')
  assert(parseRemoteManifest({ version: '', entries: [] }) === null, 'reject empty version')
  assert(parseRemoteManifest({ version: '1.2.3', entries: 'nope' }) === null, 'reject bad entries')
  assert(parseRemoteManifest(null) === null, 'reject null')
  assert(parseRemoteManifest(['1.2.3']) === null, 'reject array')
  assert(parseRemoteManifest({ entries: [] }) === null, 'reject missing version')
}

function testReleaseShape(manifest: RemoteManifest): void {
  const newest = releaseFromManifest(manifest, '0.1.2', 'abc1234')
  assert(newest.version === '0.2.0', 'repo version stays 0.2.0')
  assert(newest.build === 'abc1234', 'build passed through')
  assert(newest.notes.length === 1 && newest.notes[0]?.version === '0.2.0', 'only 0.2.0 is newer than 0.1.2')
  assert(newest.title === newest.notes[0]?.title, 'title is the first newer entry')
  assert(newest.highlights.join('\n') === newest.notes[0]?.highlights.join('\n'), 'highlights follow the head note')

  const same = releaseFromManifest(manifest, '0.2.0', 'abc1234')
  assert(same.notes.length === 0, 'equal version has no notes')
  assert(same.title === 'Локальный API, GitHub и рабочий CRUD', 'current entry supplies the title')

  const mid = releaseFromManifest(manifest, '0.1.1', 'abc1234')
  assert(mid.notes.map((note) => note.version).join(',') === '0.2.0,0.1.2', 'file order, strictly newer')

  const all = releaseFromManifest(manifest, '0.1.0', 'abc1234')
  assert(all.notes.length === manifest.entries.length, 'everything is newer than 0.1.0')
  assert(all.notes[0]?.title === manifest.entries[0]?.title, 'first file entry stays first')

  const garbageLocal = releaseFromManifest(manifest, 'v0.0.1', 'abc1234')
  assert(garbageLocal.notes.length === 0, 'unparsed local does not mark notes newer')
  assert(garbageLocal.title === same.title, 'falls back to the manifest version entry')

  const clipped = releaseFromManifest(
    {
      version: '2.0.0',
      entries: [
        { version: '1.5.0', title: 'mid', highlights: ['m'] },
        {
          version: '2.0.0',
          title: 'new',
          highlights: ['h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9'],
        },
      ],
    },
    '1.0.0',
    'deadbee',
  )
  assert(clipped.notes.map((note) => note.version).join(',') === '1.5.0,2.0.0', 'do not resort notes')
  assert(clipped.title === 'mid', 'head is the first newer row')
  assert(clipped.notes[1]?.highlights.length === 8, 'note highlights clipped to 8')
  assert(clipped.notes[1]?.highlights[7] === 'h7', 'eighth highlight kept')

  const current = releaseFromManifest(
    {
      version: '2.0.0',
      entries: [
        {
          version: '2.0.0',
          title: 'new',
          highlights: ['h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9'],
        },
      ],
    },
    '2.0.0',
    'deadbee',
  )
  assert(current.notes.length === 0, 'current row is not a note')
  assert(current.highlights.length === 8 && current.highlights[0] === 'h0', 'current highlights clipped')

  const numeric = releaseFromManifest(
    {
      version: '1.2.0',
      entries: [{ version: '01.2.0', title: 'same', highlights: ['a'] }],
    },
    '1.2.0',
    'b',
  )
  assert(numeric.title === 'same', 'version equality is numeric')
}

function testCommitHelpers(): void {
  assert(buildFromSha('abc1234ffff', '0.2.0') === 'abc1234', 'short sha')
  assert(buildFromSha('ABC1234ffff', '0.2.0') === '0.2.0', 'uppercase sha falls back')
  assert(buildFromSha('abc12', '0.2.0') === '0.2.0', 'short sha falls back')
  assert(buildFromSha('abc123gffff', '0.2.0') === '0.2.0', 'non-hex falls back')
  assert(buildFromSha(null, '0.2.0') === '0.2.0', 'missing sha falls back')

  const body = notesFromCommitMessage('Subject\r\n\r\nline a\n\nline b')
  assert(body.title === 'Subject', 'commit subject')
  assert(body.highlights.join('|') === 'line a|line b', 'non-empty body lines')

  const subjectOnly = notesFromCommitMessage('Subject only')
  assert(subjectOnly.title === 'Subject only', 'subject kept')
  assert(subjectOnly.highlights.join('|') === 'Изменения в ветке main', 'fallback highlight')

  const empty = notesFromCommitMessage('')
  assert(empty.title === 'Изменения в ветке main', 'empty message title')
  assert(empty.highlights.length === 1, 'empty message highlight')

  const many = notesFromCommitMessage(['Title', '', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].join('\n'))
  assert(many.highlights.length === 8 && many.highlights[7] === 'h', 'commit highlights clipped to 8')
}

function samplePending(overrides: Partial<PendingUpdate> = {}): PendingUpdate {
  return {
    version: '0.2.1',
    build: 'abc1234',
    title: '  Привет  ',
    highlights: ['one'],
    checkedAt: '2026-11-16T12:00:00.000Z',
    ...overrides,
  }
}

function testPending(): void {
  assert(readPendingUpdate() === null, 'read without localStorage')
  writePendingUpdate(samplePending())
  clearPendingUpdate()

  const memory = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
      setItem: (key: string, value: string) => {
        memory.set(key, value)
      },
      removeItem: (key: string) => {
        memory.delete(key)
      },
    },
  })

  writePendingUpdate(samplePending())
  const stored = readPendingUpdate()
  assert(stored?.title === 'Привет', 'title trimmed')
  assert(stored?.version === '0.2.1', 'version kept')
  assert(stored?.build === 'abc1234', 'build kept')
  assert(memory.has(PENDING_KEY), 'key is lcc.update.pending.v1')
  clearPendingUpdate()
  assert(readPendingUpdate() === null, 'cleared')
  assert(!memory.has(PENDING_KEY), 'key removed')

  const longTitle = `  ${'я'.repeat(200)}  `
  writePendingUpdate(samplePending({
    title: longTitle,
    highlights: Array.from({ length: 14 }, (_, index) => `h${index}${'x'.repeat(250)}`),
  }))
  const capped = readPendingUpdate()
  assert(capped?.title.length === 180, 'title capped at 180')
  assert(capped?.highlights.length === 12, 'highlights capped at 12')
  assert(capped?.highlights[0]?.length === 240, 'highlight capped at 240')
  clearPendingUpdate()

  writePendingUpdate(samplePending({ build: 'abc def' }))
  assert(readPendingUpdate() === null, 'build with space is not stored')
  writePendingUpdate(samplePending({ build: `abc${String.fromCharCode(1)}` }))
  assert(readPendingUpdate() === null, 'build with control char is not stored')
  writePendingUpdate(samplePending({ build: '' }))
  assert(readPendingUpdate() === null, 'empty build is not stored')
  writePendingUpdate(samplePending({ build: 'a'.repeat(40) }))
  assert(readPendingUpdate()?.build.length === 40, '40-char build is kept')
  clearPendingUpdate()

  memory.set(PENDING_KEY, JSON.stringify({
    version: 'v1.2.3',
    build: 'abc1234',
    title: 'T',
    highlights: [],
    checkedAt: '2026-11-16T00:00:00.000Z',
  }))
  assert(readPendingUpdate() === null, 'garbage version dropped')
  assert(!memory.has(PENDING_KEY), 'garbage version key removed')

  memory.set(PENDING_KEY, JSON.stringify({
    version: '0.2.0',
    build: 'abc1234',
    title: 'T',
    highlights: ['ok', 1],
    checkedAt: '2026-11-16T00:00:00.000Z',
    token: 'secret',
  }))
  assert(readPendingUpdate() === null, 'non-string highlight dropped')
  assert(!memory.has(PENDING_KEY), 'bad highlight key removed')

  memory.set(PENDING_KEY, '{')
  assert(readPendingUpdate() === null, 'broken json dropped')
  assert(!memory.has(PENDING_KEY), 'broken json key removed')

  memory.set(PENDING_KEY, JSON.stringify({
    version: '0.2.0',
    build: 'abc1234',
    title: 'T',
    highlights: ['a'],
    checkedAt: '2026-11-16T00:00:00.000Z',
    token: 'secret',
  }))
  const clean = readPendingUpdate()
  assert(clean !== null && !Object.prototype.hasOwnProperty.call(clean, 'token'), 'stored extra field dropped')
  assert(clean?.highlights[0] === 'a', 'valid highlight kept')

  memory.set(PENDING_KEY, JSON.stringify({ ...clean, checkedAt: 'вчера' }))
  assert(readPendingUpdate() === null, 'bad date dropped')
  assert(!memory.has(PENDING_KEY), 'bad date key removed')

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem() {
        throw new Error('storage down')
      },
      setItem() {
        throw new Error('storage down')
      },
      removeItem() {
        throw new Error('storage down')
      },
    },
  })
  assert(readPendingUpdate() === null, 'getItem throw returns null')
  writePendingUpdate(samplePending())
  clearPendingUpdate()
}

function testManifestFile(): RemoteManifest {
  const raw = readFileSync(new URL('../update-manifest.json', import.meta.url), 'utf8')
  const manifest = parseRemoteManifest(JSON.parse(raw) as unknown)
  assert(manifest !== null, 'manifest file parses')
  assert(manifest.version === '0.2.0', 'manifest version is 0.2.0')

  const versioned = CHANGELOG.filter((entry) => entry.version)
  assert(manifest.entries.length === versioned.length, 'only versioned changelog rows')
  const versions = new Set(manifest.entries.map((entry) => entry.version))
  assert([...versions].join(',') === '0.2.0,0.1.2,0.1.1', 'versions are 0.2.0, 0.1.2, 0.1.1')

  for (let i = 0; i < versioned.length; i += 1) {
    const fromFile = manifest.entries[i]
    const fromCode = versioned[i]
    assert(fromFile && fromCode, `row ${i}`)
    assert(fromFile.version === fromCode.version, `version row ${i}`)
    assert(fromFile.title === fromCode.title, `title row ${i}`)
    assert(fromFile.highlights.length === fromCode.highlights.length, `highlight count ${i}`)
    for (let h = 0; h < fromCode.highlights.length; h += 1) {
      assert(fromFile.highlights[h] === fromCode.highlights[h], `highlight ${i}.${h}`)
    }
  }

  for (const entry of CHANGELOG) {
    if (entry.version) continue
    assert(!manifest.entries.some((row) => row.title === entry.title), `unversioned omitted: ${entry.title}`)
  }
  return manifest
}

function main(): void {
  testSemver()
  testManifestParser()
  testCommitHelpers()
  const manifest = testManifestFile()
  testReleaseShape(manifest)
  testPending()
  console.log('update-selftest ok')
}

main()
