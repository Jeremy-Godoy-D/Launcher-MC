import { afterEach, expect, it, vi } from 'vitest'
import { link, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setModsEnabled } from './setModsEnabled'

vi.mock('node:fs/promises', async importOriginal => { const real = await importOriginal<typeof import('node:fs/promises')>(); return { ...real, link: vi.fn(real.link) } })

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'grimo-mods-')); roots.push(root)
  await mkdir(join(root, 'mods'))
  const mod = join(root, 'mods', 'example.jar')
  await writeFile(mod, 'original')
  return { root, mod }
}
it('toggles and treats the requested existing state as a no-op', async () => {
  const { root, mod } = await fixture()
  await setModsEnabled(root, [mod, mod], false)
  await expect(readFile(mod)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(`${mod}.disabled`, 'utf8')).toBe('original')
  await setModsEnabled(root, [`${mod}.disabled`], false)
  await setModsEnabled(root, [`${mod}.disabled`], true)
  expect(await readFile(mod, 'utf8')).toBe('original')
})
it('rejects collisions without overwriting either file or swallowing the error', async () => {
  const { root, mod } = await fixture()
  await writeFile(`${mod}.disabled`, 'other')
  await expect(setModsEnabled(root, [mod], false)).rejects.toMatchObject({ code: 'EEXIST' })
  expect(await readFile(mod, 'utf8')).toBe('original')
  expect(await readFile(`${mod}.disabled`, 'utf8')).toBe('other')
})
it('validates the entire selection before changing files and rejects files outside mods', async () => {
  const { root, mod } = await fixture(), outside = join(root, 'outside.jar')
  await writeFile(outside, 'outside')
  await expect(setModsEnabled(root, [mod, outside], false)).rejects.toThrow('Unmanaged')
  expect(await readFile(mod, 'utf8')).toBe('original')
})
it('rejects a linked mods directory', async () => {
  const { root } = await fixture(), linked = join(root, 'instance')
  await mkdir(linked)
  await symlink(join(root, 'mods'), join(linked, 'mods'), 'junction')
  await expect(setModsEnabled(linked, [], true)).rejects.toThrow('Unmanaged')
})

it('copies exclusively on filesystems without hard links and still preserves collisions', async () => {
  const { root, mod } = await fixture()
  vi.mocked(link).mockRejectedValueOnce(Object.assign(new Error('No hard links'), { code: 'ENOTSUP' }))
  await setModsEnabled(root, [mod], false)
  expect(await readFile(`${mod}.disabled`, 'utf8')).toBe('original')
  await expect(readFile(mod)).rejects.toMatchObject({ code: 'ENOENT' })
  await writeFile(mod, 'other')
  vi.mocked(link).mockRejectedValueOnce(Object.assign(new Error('No hard links'), { code: 'ENOTSUP' }))
  await expect(setModsEnabled(root, [`${mod}.disabled`], true)).rejects.toMatchObject({ code: 'EEXIST' })
  expect(await readFile(mod, 'utf8')).toBe('other')
  expect(await readFile(`${mod}.disabled`, 'utf8')).toBe('original')
})
