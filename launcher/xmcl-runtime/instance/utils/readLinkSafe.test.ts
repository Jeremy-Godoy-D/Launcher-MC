import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isLinkTo, readlinkSafe } from './readLinkSafe'

let root: string, target: string, link: string, alias: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'grimo-link-identity-')); target = join(root, 'physical/resourcepacks'); link = join(root, 'linked'); alias = join(root, 'parent-alias')
  await mkdir(target, { recursive: true }); await writeFile(join(target, 'keep'), 'KEEP')
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
it('recognizes the intended junction through its actual and parent-aliased paths without altering contents', async () => {
  await symlink(target, link, 'junction'); await symlink(join(root, 'physical'), alias, 'junction')
  expect(await isLinkTo(link, target)).toBe(true); expect(await isLinkTo(link, join(alias, 'resourcepacks'))).toBe(true)
  expect(await readFile(join(target, 'keep'), 'utf8')).toBe('KEEP'); expect(await readlinkSafe(link)).toBeTruthy()
})
it('does not mistake a private directory for a shared link even when it is the expected path', async () => {
  expect(await isLinkTo(target, target)).toBe(false); expect(await isLinkTo(join(root, 'absent'), target)).toBe(false)
})
it('rejects a junction to a different physical directory', async () => {
  const foreign = join(root, 'foreign'); await mkdir(foreign); await writeFile(join(foreign, 'keep'), 'FOREIGN')
  await symlink(foreign, link, 'junction')
  expect(await isLinkTo(link, target)).toBe(false); expect(await readFile(join(foreign, 'keep'), 'utf8')).toBe('FOREIGN')
})
it('preserves the intentional target of a dangling junction without accepting a different missing path', async () => {
  await symlink(target, link, 'junction'); await rm(target, { recursive: true })
  expect(await isLinkTo(link, target)).toBe(true); expect(await isLinkTo(link, join(root, 'other-missing'))).toBe(false)
})
