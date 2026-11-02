import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { reviewMigrationPaths } from './migrationPaths'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'grimo-migration-path-')); roots.push(root)
  const source = join(root, 'source'); await mkdir(source); await writeFile(join(source, 'keep.txt'), 'original')
  return { root, source, destination: join(root, 'destination') }
}
it('accepts an empty or new disjoint destination, while preserving the source', async () => {
  const { source, destination } = await setup()
  expect(await reviewMigrationPaths(source, destination, source)).toMatchObject({ source, destination, unchanged: false })
  await mkdir(destination); expect((await reviewMigrationPaths(source, destination)).unchanged).toBe(false)
  expect(await readFile(join(source, 'keep.txt'), 'utf8')).toBe('original')
})
it('rejects occupied, nested, relative and changed-root destinations', async () => {
  const { root, source, destination } = await setup()
  await expect(reviewMigrationPaths(source, join(source, 'nested'))).rejects.toMatchObject({ code: 'nested' })
  await expect(reviewMigrationPaths(source, root)).rejects.toMatchObject({ code: 'nested' })
  await expect(reviewMigrationPaths(source, 'relative')).rejects.toMatchObject({ code: 'invalid' })
  await expect(reviewMigrationPaths(source, destination, root)).rejects.toMatchObject({ code: 'changed' })
  await mkdir(destination); await writeFile(join(destination, 'world.txt'), 'destination data')
  await expect(reviewMigrationPaths(source, destination)).rejects.toMatchObject({ code: 'occupied' })
  expect(await readFile(join(destination, 'world.txt'), 'utf8')).toBe('destination data')
})
it('canonicalizes aliases and refuses nesting through a junction', async () => {
  const { root, source } = await setup(), alias = join(root, 'alias')
  await symlink(source, alias, process.platform === 'win32' ? 'junction' : 'dir')
  expect((await reviewMigrationPaths(source, alias)).unchanged).toBe(true)
  await expect(reviewMigrationPaths(source, join(alias, 'nested'))).rejects.toMatchObject({ code: 'nested' })
})
