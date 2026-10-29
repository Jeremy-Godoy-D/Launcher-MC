import { describe, expect, it } from 'vitest'
import { HashAlgo, type File } from '@xmcl/curseforge'
import type { ProjectVersion } from '@xmcl/modrinth'
import { buildModUpgradeManifest, buildResourcePackUpgradeManifest } from './modUpgradeManifest'

const mod = { fileName: 'old.jar.disabled', hash: 'old-sha1', size: 12, curseforge: { projectId: 34, fileId: 1 }, modrinth: { projectId: 'project', versionId: 'old' } }
const file = { id: 2, modId: 34, fileName: 'new.jar', fileLength: 24, hashes: [{ algo: HashAlgo.Sha1, value: 'new-sha1' }] } as File
const version: ProjectVersion = {
  id: 'new', project_id: 'project', author_id: 'author', featured: false, name: 'New', version_number: '2.0.0', date_published: '2026-10-28T00:00:00Z', downloads: 1, version_type: 'release', dependencies: [], game_versions: ['1.21.1'], loaders: ['fabric'],
  files: [{ filename: 'new.jar', primary: true, size: 24, url: 'https://example.invalid/new.jar', hashes: { sha1: 'new-sha1', sha512: 'new-sha512' } }],
}

describe('shared content upgrade manifest', () => {
  it.each([{ file }, { version }])('keeps a disabled mod disabled and preserves both old provider identities', provider => {
    const plan = { mod, ...provider }, original = structuredClone(plan)
    const result = buildModUpgradeManifest([plan])
    expect(result.oldFiles).toEqual([{ path: 'mods/old.jar.disabled', hashes: { sha1: 'old-sha1' }, size: 12, curseforge: mod.curseforge, modrinth: mod.modrinth }])
    expect(result.files[0].path).toBe('mods/new.jar.disabled')
    expect(result.files[0].hashes.sha1).toBe('new-sha1')
    if ('file' in provider) expect(result.files[0].curseforge).toEqual({ projectId: 34, fileId: 2 })
    else { expect(result.files[0].modrinth).toEqual({ projectId: 'project', versionId: 'new' }); expect(result.files[0].hashes.sha512).toBe('new-sha512') }
    expect(plan).toEqual(original)
  })

  it.each(['resourcepacks', 'shaderpacks'] as const)('does not apply mod enablement semantics to %s', prefix => {
    expect(buildModUpgradeManifest([{ mod, file }], prefix)).toMatchObject({ oldFiles: [{ path: `${prefix}/old.jar.disabled` }], files: [{ path: `${prefix}/new.jar` }] })
  })

  it.each(['old.jar', 'old.jar.DISABLED'])('preserves the enablement of %s with the provider filename', fileName => {
    const result = buildModUpgradeManifest([{ mod: { ...mod, fileName }, version }])
    expect(result.files[0].path).toBe(fileName === 'old.jar' ? 'mods/new.jar' : 'mods/new.jar.disabled')
  })

  it('does not append a second suffix when the provider file is already disabled', () => {
    expect(buildModUpgradeManifest([{ mod, file: { ...file, fileName: 'new.jar.disabled' } }]).files[0].path).toBe('mods/new.jar.disabled')
  })
})

it.each([{ file }, { version }])('keeps resource pack archive names and new provider hashes/IDs without mutating the source plan', provider => {
  const plan = { mod: { ...mod, fileName: 'My Pack.zip' }, ...provider }, before = structuredClone(plan)
  const result = buildResourcePackUpgradeManifest([plan])
  expect(result.oldFiles[0].path).toBe('resourcepacks/My Pack.zip'); expect(result.files[0].path).toBe(result.oldFiles[0].path)
  expect(result.oldFiles[0].hashes.sha1).toBe('old-sha1'); expect(result.files[0].hashes.sha1).toBe('new-sha1')
  expect('file' in provider ? result.files[0].curseforge?.fileId : result.files[0].modrinth?.versionId).toBe('file' in provider ? 2 : 'new')
  expect(plan).toEqual(before)
})
