import { afterEach, expect, it, vi } from 'vitest'
import { rename } from 'fs-extra'
import { link, mkdtemp, mkdir, readFile, readdir, rename as publish, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { writeInstallState } from './pendingInstall'

vi.mock('fs-extra', async importOriginal => { const real = await importOriginal<typeof import('fs-extra')>(); return { ...real, rename: vi.fn(real.rename) } })

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!isAbsolute(root) || dirname(root) !== tmpdir() || !basename(root).startsWith('grimo-install-state-')) throw new Error('Unexpected test directory')
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'grimo-install-state-')); roots.push(root)
  return { root, path: join(root, '.install-profile') }
}
it('never writes through a planted hard link at the old deterministic temporary filename', async () => {
  const { root, path } = await fixture(), outside = join(root, 'untouched.txt')
  await writeFile(outside, 'KEEP'); await link(outside, `${path}.tmp`)
  await writeInstallState(path, { value: 1 })
  expect(await readFile(outside, 'utf8')).toBe('KEEP')
  expect(await readFile(`${path}.tmp`, 'utf8')).toBe('KEEP')
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ value: 1 })
  expect((await readdir(root)).sort()).toEqual(['.install-profile', '.install-profile.tmp', 'untouched.txt'])
})
it('keeps the complete old state readable until the complete replacement is published', async () => {
  const { root, path } = await fixture()
  await writeInstallState(path, { value: -1 })
  vi.mocked(rename).mockImplementationOnce(async (from, to) => {
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ value: -1 })
    expect(JSON.parse(await readFile(from, 'utf8'))).toEqual({ value: 1, data: 'x'.repeat(16000) })
    await publish(from, to)
  })
  await writeInstallState(path, { value: 1, data: 'x'.repeat(16000) })
  expect(JSON.parse(await readFile(path, 'utf8')).data).toHaveLength(16000)
  expect(await readdir(root)).toEqual(['.install-profile'])
})
it('refuses linked directories and non-file destinations without touching outside data', async () => {
  const { root, path } = await fixture(), outside = join(root, 'outside'), linked = join(root, 'linked')
  await mkdir(outside); await writeFile(join(outside, 'keep'), 'KEEP'); await symlink(outside, linked, 'junction')
  await expect(writeInstallState(join(linked, 'state.json'), { value: 1 })).rejects.toThrow('Unsafe')
  await mkdir(path)
  await expect(writeInstallState(path, { value: 1 })).rejects.toThrow('Unsafe')
  expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('KEEP')
  expect(await readdir(outside)).toEqual(['keep'])
})
it('rejects non-serializable states before touching the current file', async () => {
  const { root, path } = await fixture(); await writeFile(path, '{"keep":true}')
  await expect(writeInstallState(path, undefined)).rejects.toThrow('Invalid')
  await expect(writeInstallState(path, { value: BigInt(1) })).rejects.toThrow()
  expect(await readFile(path, 'utf8')).toBe('{"keep":true}')
  expect(await readdir(root)).toEqual(['.install-profile'])
})

it('preserves the old state and removes its owned temporary file when publishing fails', async () => {
  const { root, path } = await fixture(); await writeFile(path, '{"keep":true}')
  vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('Disk unavailable'), { code: 'EIO' }))
  await expect(writeInstallState(path, { keep: false })).rejects.toMatchObject({ code: 'EIO' })
  expect(await readFile(path, 'utf8')).toBe('{"keep":true}')
  expect(await readdir(root)).toEqual(['.install-profile'])
})
