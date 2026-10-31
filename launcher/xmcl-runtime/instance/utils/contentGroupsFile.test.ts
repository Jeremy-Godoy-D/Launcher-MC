import { afterEach, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { legacyContentGroups, readContentGroups, writeContentGroups } from './contentGroupsFile'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function fixture() { const path = await mkdtemp(join(tmpdir(), 'grimo-groups-')); roots.push(path); return path }
const groups = { Performance: { color: '#f3b86a', files: ['sodium.jar'] } }

it('persists groups, preserves unknown attributes and supports a reviewed update', async () => {
  const path = await fixture(), value = { Performance: { ...groups.Performance, future: 'preserve' } }
  expect(await writeContentGroups(path, 'mods', value, {})).toBe('saved')
  expect(await readContentGroups(path, 'mods')).toEqual(value)
  await writeContentGroups(path, 'mods', {}, value)
  expect(await readContentGroups(path, 'mods')).toEqual({})
  expect(await readdir(path)).toEqual(['mod-groups.json'])
})
it('does not replace a native file, including empty bytes or an empty object, during migration', async () => {
  for (const content of ['', '{}']) {
    const path = await fixture()
    await writeFile(join(path, 'mod-groups.json'), content)
    expect(await writeContentGroups(path, 'mods', groups, undefined, true)).toBe('existing')
    expect(await readFile(join(path, 'mod-groups.json'), 'utf8')).toBe(content)
  }
})
it('rejects stale reviewed groups without changing the file', async () => {
  const path = await fixture()
  await writeContentGroups(path, 'mods', groups)
  await expect(writeContentGroups(path, 'mods', {}, {})).rejects.toThrow('ContentGroupsChanged')
  expect(await readContentGroups(path, 'mods')).toEqual(groups)
})
it('preserves malformed, oversized and linked native files and never writes outside the instance', async () => {
  const path = await fixture(), file = join(path, 'mod-groups.json')
  for (const content of ['not JSON', 'x'.repeat(1024 * 1024 + 1)]) {
    await writeFile(file, content)
    await expect(readContentGroups(path, 'mods')).rejects.toThrow()
    await expect(writeContentGroups(path, 'mods', {})).rejects.toThrow()
    expect(await readFile(file, 'utf8')).toBe(content)
  }
  await rm(file)
  const outside = await fixture(); await writeFile(join(outside, 'sentinel'), 'KEEP')
  await symlink(outside, file, 'junction')
  await expect(writeContentGroups(path, 'mods', groups)).rejects.toThrow('UnsafeContentGroupFile')
  expect(await readFile(join(outside, 'sentinel'), 'utf8')).toBe('KEEP')
  await mkdir(join(path, 'nested'))
  await expect(writeContentGroups(path, '../nested' as any, groups)).rejects.toThrow('InvalidContentGroupPath')
})
it('normalizes legacy names without mutating the original mapping and rejects prototype keys', () => {
  const value = { 'mods/sodium.jar.disabled': 'Performance', 'sodium.jar': 'Performance', 'a.jar': 'Other' }, before = structuredClone(value)
  expect(legacyContentGroups(value)).toEqual({ Performance: { color: '', files: ['sodium.jar'] }, Other: { color: '', files: ['a.jar'] } })
  expect(value).toEqual(before)
  expect(() => legacyContentGroups({ 'a.jar': '__proto__' })).toThrow('InvalidContentGroups')
})
