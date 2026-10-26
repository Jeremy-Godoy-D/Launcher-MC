import { InstanceSchema, type Instance } from '@xmcl/instance'
import type { ResolvedVersion } from '@xmcl/core'
import type { ReviewedInstanceExport } from '@xmcl/runtime-api'
import { open, readAllEntries, readEntry } from '@xmcl/unzip'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { exportReviewedInstance, previewInstanceExport } from './reviewedExport'
import { exportOfflineModpack, offlineModpackFiles } from './utils/exportOffline'
import { ZipFile } from 'yazl'
import { writeZipFile } from '../util/zip'

vi.mock('node:fs/promises', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs/promises')>()
  return { ...fs, rm: vi.fn(fs.rm) }
})

let root: string, instance: Instance, destination: string
async function file(path: string, data: string) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, data) }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'grimo-export-'))
  instance = { ...InstanceSchema.parse({ name: 'Export QA', path: join(root, 'instance'), runtime: { minecraft: '1.21.1' } }), path: join(root, 'instance'), creationDate: 1, lastAccessDate: 1, lastPlayedDate: 0, playtime: 0 }
  destination = join(root, 'exports')
  await mkdir(destination)
  await file(join(instance.path, 'config/test.toml'), 'reviewed-config')
  await file(join(instance.path, 'saves/World/level.dat'), 'world')
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
async function options(format: ReviewedInstanceExport['format'] = 'modrinth'): Promise<ReviewedInstanceExport> {
  const preview = await previewInstanceExport(instance)
  return { instancePath: instance.path, fingerprint: preview.fingerprint, files: preview.files.filter(file => file.selected).map(file => file.path), format, version: '1.0', destinationDirectory: destination }
}
async function entries(path: string) {
  const zip = await open(path)
  try { return Object.fromEntries(await Promise.all((await readAllEntries(zip)).filter(entry => !entry.fileName.endsWith('/')).map(async entry => [entry.fileName, (await readEntry(zip, entry)).toString('utf8')])) ) }
  finally { zip.close() }
}
function runtime(): ResolvedVersion {
  return { id: 'custom', minecraftVersion: '1.21.1', clientJar: '.client-abc', assets: 'qa', pathChain: [join(root, 'versions/custom')], libraries: [{ download: { path: 'qa/lib.jar' } }] } as ResolvedVersion
}
async function runtimeFiles() {
  const hash = createHash('sha1').update('asset').digest('hex')
  await file(join(root, 'assets/indexes/qa.json'), JSON.stringify({ objects: { a: { hash }, duplicate: { hash } } }))
  await file(join(root, `assets/objects/${hash.slice(0, 2)}/${hash}`), 'asset')
  await file(join(root, 'versions/custom/custom.json'), '{"id":"custom","jar":".client-abc"}')
  await file(join(root, 'versions/.client-abc/.client-abc.jar'), 'isolated-client')
  await file(join(root, 'libraries/qa/lib.jar'), 'library')
}
test('preview excludes known credentials and launcher data, defaults content on and personal files off', async () => {
  for (const name of ['instance.json', 'launcher_accounts.json', 'config/.env', 'config/token.json', 'config/secret.key']) await file(join(instance.path, name), 'never-export')
  const preview = await previewInstanceExport(instance)
  expect(preview.files.map(file => [file.path, file.selected])).toEqual([['config/test.toml', true], ['saves/World/level.dat', false]])
  expect(preview.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  instance.lastAccessDate++
  expect((await previewInstanceExport(instance)).fingerprint).toBe(preview.fingerprint)
})

test('shared folders export reviewed bytes without following arbitrary links or including shared credentials', async () => {
  await rm(join(instance.path, 'saves'), { recursive: true })
  await file(join(root, 'saves/World/level.dat'), 'shared-world')
  await file(join(root, 'resourcepacks/public.zip'), 'shared-pack')
  await file(join(root, 'resourcepacks/token.json'), 'private-token')
  await symlink(join(root, 'saves'), join(instance.path, 'saves'), 'junction')
  await symlink(join(root, 'resourcepacks'), join(instance.path, 'resourcepacks'), 'junction')
  await expect(previewInstanceExport(instance)).rejects.toThrow('link')
  const preview = await previewInstanceExport(instance, root)
  expect(preview.files.some(file => file.path.includes('token'))).toBe(false)
  const request: ReviewedInstanceExport = { instancePath: instance.path, fingerprint: preview.fingerprint, files: preview.files.map(file => file.path), format: 'modrinth', version: 'shared', destinationDirectory: destination }
  const result = await entries(await exportReviewedInstance(instance, root, request, new AbortController().signal))
  expect(result['overrides/saves/World/level.dat']).toBe('shared-world')
  expect(result['overrides/resourcepacks/public.zip']).toBe('shared-pack')
  expect(Object.keys(result).some(path => path.includes('token'))).toBe(false)
  expect(await readFile(join(root, 'saves/World/level.dat'), 'utf8')).toBe('shared-world')
  await rm(join(instance.path, 'saves')); await symlink(destination, join(instance.path, 'saves'), 'junction')
  await expect(previewInstanceExport(instance, root)).rejects.toThrow('link')
})

test.each(['saves', 'resourcepacks', 'shaderpacks'])('does not stage or publish inside shared source %s even when it is empty', async name => {
  await rm(join(instance.path, name), { recursive: true, force: true })
  await mkdir(join(root, name)); await symlink(join(root, name), join(instance.path, name), 'junction')
  const preview = await previewInstanceExport(instance, root)
  const request: ReviewedInstanceExport = { instancePath: instance.path, fingerprint: preview.fingerprint, files: preview.files.map(file => file.path), format: 'modrinth', version: 'shared', destinationDirectory: join(root, name) }
  await expect(exportReviewedInstance(instance, root, request, new AbortController().signal)).rejects.toMatchObject({ name: 'ExportInvalid' })
  expect(await readdir(join(root, name))).toEqual([])
})
test.each(['modrinth', 'curseforge'] as const)('writes a parseable %s archive with only reviewed selected bytes and no launcher settings', async format => {
  instance.vmOptions = ['-Dsecret=personal']; instance.java = 'C:/private/java.exe'
  const output = await exportReviewedInstance(instance, root, await options(format), new AbortController().signal)
  const result = await entries(output)
  expect(Object.keys(result).sort()).toEqual([format === 'modrinth' ? 'modrinth.index.json' : 'manifest.json', 'overrides/config/test.toml'].sort())
  expect(result['overrides/config/test.toml']).toBe('reviewed-config')
  const manifest = JSON.parse(result[format === 'modrinth' ? 'modrinth.index.json' : 'manifest.json'])
  expect(manifest.files).toEqual([])
  expect(JSON.stringify(result)).not.toMatch(/secret|private|world|xmcl/)
  expect(await readdir(destination)).toEqual([output.split(/[\\/]/).at(-1)])
})
test('changed bytes or metadata require another review', async () => {
  const reviewed = await options()
  await file(join(instance.path, 'config/test.toml'), 'changed-config')
  await expect(exportReviewedInstance(instance, root, reviewed, new AbortController().signal)).rejects.toMatchObject({ name: 'ExportSourceChanged' })
  const updated = await options(); instance.name = 'Changed name'
  await expect(exportReviewedInstance(instance, root, updated, new AbortController().signal)).rejects.toMatchObject({ name: 'ExportSourceChanged' })
  expect(await readdir(destination)).toEqual([])
})
test.each([['../outside'], ['config/.env'], ['config/test.toml', 'config/test.toml']])('rejects unreviewed or repeated selection %j', async (...files) => {
  const reviewed = await options(); reviewed.files = files as string[]
  await expect(exportReviewedInstance(instance, root, reviewed, new AbortController().signal)).rejects.toMatchObject({ name: 'ExportInvalid' })
})
test('never overwrites an existing archive, including a collision immediately before publication', async () => {
  const reviewed = await options(), target = join(destination, 'Export QA-1.0.mrpack')
  await expect(exportReviewedInstance(instance, root, reviewed, new AbortController().signal, undefined, undefined, () => file(target, 'existing'))).rejects.toMatchObject({ name: 'ExportDestinationExists' })
  expect(await readFile(target, 'utf8')).toBe('existing')
  await expect(exportReviewedInstance(instance, root, reviewed, new AbortController().signal)).rejects.toMatchObject({ name: 'ExportDestinationExists' })
  expect(await readdir(destination)).toEqual(['Export QA-1.0.mrpack'])
})
test('cancellation before staging and after compression publishes nothing and cleans owned temporary files', async () => {
  const reviewed = await options(), controller = new AbortController()
  controller.abort()
  await expect(exportReviewedInstance(instance, root, reviewed, controller.signal)).rejects.toBeDefined()
  const later = new AbortController()
  await expect(exportReviewedInstance(instance, root, reviewed, later.signal, undefined, undefined, async () => { later.abort() })).rejects.toBeDefined()
  expect(await readdir(destination)).toEqual([])
})
test('cleanup failure after publication keeps the successful result and logs only its error code', async () => {
  const reviewed = await options(), warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(rm).mockRejectedValueOnce(Object.assign(new Error('private details'), { code: 'EPERM' }))
  try {
    const output = await exportReviewedInstance(instance, root, reviewed, new AbortController().signal)
    expect((await entries(output))['overrides/config/test.toml']).toBe('reviewed-config')
    expect(warn).toHaveBeenCalledExactlyOnceWith('Temporary export cleanup failed', 'EPERM')
  } finally { warn.mockRestore() }
})
test('blocks destination inside the instance and source directory junctions', async () => {
  const reviewed = await options(); reviewed.destinationDirectory = instance.path
  await expect(exportReviewedInstance(instance, root, reviewed, new AbortController().signal)).rejects.toMatchObject({ name: 'ExportInvalid' })
  await symlink(destination, join(instance.path, 'linked'), 'junction')
  await expect(previewInstanceExport(instance)).rejects.toThrow(/link/)
})
test('offline archive includes isolated client, version JSON, unique assets and selected worlds', async () => {
  await runtimeFiles()
  const reviewed = await options('offline'); reviewed.files.push('saves/World/level.dat')
  const output = await exportReviewedInstance(instance, root, reviewed, new AbortController().signal, undefined, runtime())
  const result = await entries(output)
  expect(result['versions/.client-abc/.client-abc.jar']).toBe('isolated-client')
  expect(result['saves/World/level.dat']).toBe('world')
  expect(Object.keys(result).filter(name => name.startsWith('assets/objects/'))).toHaveLength(1)
  expect(JSON.parse(result['launcher_profiles.json']).profiles.grimo.lastVersionId).toBe('custom')
  const legacy = new ZipFile()
  await exportOfflineModpack(legacy, root, runtime())
  const path = join(destination, 'legacy.zip'); await writeZipFile(legacy, path)
  expect((await entries(path))['versions/.client-abc/.client-abc.jar']).toBe('isolated-client')
})
test('missing runtime files fail without publishing a partial archive', async () => {
  await runtimeFiles(); await rm(join(root, 'versions/.client-abc/.client-abc.jar'))
  await expect(exportReviewedInstance(instance, root, await options('offline'), new AbortController().signal, undefined, runtime())).rejects.toMatchObject({ name: 'ExportSourceChanged' })
  expect(await readdir(destination)).toEqual([])
})
test('corrupt installed clients and assets fail their metadata checks before publication', async () => {
  await runtimeFiles()
  const broken = { ...runtime(), downloads: { client: { sha1: '0'.repeat(40) } } } as ResolvedVersion
  await expect(exportReviewedInstance(instance, root, await options('offline'), new AbortController().signal, undefined, broken)).rejects.toMatchObject({ name: 'ExportSourceChanged' })
  const hash = createHash('sha1').update('asset').digest('hex')
  await file(join(root, `assets/objects/${hash.slice(0, 2)}/${hash}`), 'corrupt')
  await expect(exportReviewedInstance(instance, root, await options('offline'), new AbortController().signal, undefined, runtime())).rejects.toMatchObject({ name: 'ExportSourceChanged' })
  expect(await readdir(destination)).toEqual([])
})
test('custom clients cannot silently become standard downloadable packs', async () => {
  await expect(exportReviewedInstance(instance, root, await options(), new AbortController().signal, undefined, runtime())).rejects.toMatchObject({ name: 'ExportNeedsOffline' })
  instance.version = 'mmc-custom'
  expect((await previewInstanceExport(instance)).portable).toBe(false)
})
test('offline paths, asset hashes and library junctions cannot read outside the managed files', async () => {
  await runtimeFiles()
  await expect(offlineModpackFiles(root, { ...runtime(), assets: '../private' })).rejects.toThrow()
  await expect(offlineModpackFiles(root, { ...runtime(), pathChain: [join(root, '../outside')] })).rejects.toThrow()
  await file(join(root, 'assets/indexes/qa.json'), '{"objects":{"evil":{"hash":"../../private"}}}')
  await expect(offlineModpackFiles(root, runtime())).rejects.toThrow(/hash/)
  await runtimeFiles()
  await rm(join(root, 'libraries/qa'), { recursive: true })
  await symlink(destination, join(root, 'libraries/qa'), 'junction')
  await expect(exportOfflineModpack(new ZipFile(), root, runtime())).rejects.toThrow(/Unsafe/)
})
