import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, parse } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { assertInstanceCopyComplete, COPY_JOB, prepareInstanceCopy, readInstanceCopy, runInstanceCopy, saveInstanceCopy } from './instanceCopy'

let root: string, source: string, target: string
const fresh = () => new AbortController().signal
async function file(path: string, data: string | Buffer) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, data) }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'grimo-copy-job-')); source = join(root, 'source'); target = join(root, 'target')
  await mkdir(target); await file(join(source, 'config/qa.txt'), 'config-snapshot'); await file(join(source, 'saves/World/level.dat'), 'world-snapshot')
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

test('prepares a pinned bounded inventory without launcher accounts or install markers', async () => {
  await file(join(source, 'instance.json'), 'private-config'); await file(join(source, 'accounts.json'), 'private-account')
  const job = await prepareInstanceCopy(source, fresh())
  expect(job.files.map(file => file.path).sort()).toEqual(['config/qa.txt', 'saves/World/level.dat'])
  expect(job.files[0].sha256).toMatch(/^[a-f0-9]{64}$/)
  await saveInstanceCopy(target, job)
  expect(await readInstanceCopy(target)).toEqual(job)
  expect(await readFile(join(source, 'accounts.json'), 'utf8')).toBe('private-account')
})
test('copies independent files and removes the pending marker only after the snapshot is complete', async () => {
  const job = await prepareInstanceCopy(source, fresh()); await saveInstanceCopy(target, job)
  await expect(assertInstanceCopyComplete(target)).rejects.toMatchObject({ name: 'InstanceCopyIncomplete' })
  await runInstanceCopy(job, target, fresh())
  await expect(assertInstanceCopyComplete(target)).resolves.toBeUndefined()
  expect(await readInstanceCopy(target)).toBeUndefined()
  await file(join(target, 'saves/World/level.dat'), 'copy-only')
  expect(await readFile(join(source, 'saves/World/level.dat'), 'utf8')).toBe('world-snapshot')
})
test('cancelled copies retain a durable job, publish only complete files and resume in the same folder', async () => {
  for (let index = 0; index < 8; index++) await file(join(source, `mods/${index}.jar`), Buffer.alloc(1024 * 1024, index))
  const job = await prepareInstanceCopy(source, fresh()); await saveInstanceCopy(target, job)
  const controller = new AbortController()
  await expect(runInstanceCopy(job, target, controller.signal, event => { if (event.payload.progress.progress >= 1) controller.abort() })).rejects.toBeDefined()
  expect(await readInstanceCopy(target)).toEqual(job)
  const present = [] as { path: string; inode: number }[]
  for (const expected of job.files) {
    try {
      const data = await readFile(join(target, expected.path))
      expect(createHash('sha256').update(data).digest('hex')).toBe(expected.sha256)
      present.push({ path: expected.path, inode: (await stat(join(target, expected.path))).ino })
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  expect(present.length).toBeGreaterThan(0); expect(present.length).toBeLessThan(job.files.length)
  expect((await readdir(target)).filter(name => name.startsWith('.copy-temp-'))).toEqual([])
  await runInstanceCopy((await readInstanceCopy(target))!, target, fresh())
  for (const original of present) expect((await stat(join(target, original.path))).ino).toBe(original.inode)
  expect(await readInstanceCopy(target)).toBeUndefined()
  expect(await readFile(join(target, 'saves/World/level.dat'), 'utf8')).toBe('world-snapshot')
})
test('source changes fail before publishing changed bytes and allow retry after restoration', async () => {
  const job = await prepareInstanceCopy(source, fresh()); await saveInstanceCopy(target, job)
  await file(join(source, 'config/qa.txt'), 'unexpected-source-change')
  await expect(runInstanceCopy(job, target, fresh())).rejects.toMatchObject({ name: 'InstanceCopySourceChanged' })
  await expect(readFile(join(target, 'config/qa.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readInstanceCopy(target)).toEqual(job)
  await file(join(source, 'config/qa.txt'), 'config-snapshot')
  await runInstanceCopy(job, target, fresh())
})
test('foreign destination bytes survive retry conflicts and job data remains available', async () => {
  const job = await prepareInstanceCopy(source, fresh()); await saveInstanceCopy(target, job)
  await file(join(target, 'config/qa.txt'), 'keep-my-edits')
  await expect(runInstanceCopy(job, target, fresh())).rejects.toMatchObject({ name: 'InstanceCopyConflict' })
  expect(await readFile(join(target, 'config/qa.txt'), 'utf8')).toBe('keep-my-edits')
  expect(await readInstanceCopy(target)).toEqual(job)
})
test('source or destination junctions cannot route a copy outside the reviewed roots', async () => {
  const job = await prepareInstanceCopy(source, fresh()); await saveInstanceCopy(target, job)
  await mkdir(join(root, 'outside')); await symlink(join(root, 'outside'), join(target, 'config'), 'junction')
  await expect(runInstanceCopy(job, target, fresh())).rejects.toMatchObject({ name: 'InstanceCopyUnsafePath' })
  expect(await readdir(join(root, 'outside'))).toEqual([])
  await rm(join(target, 'config'))
  await rm(join(source, 'config'), { recursive: true }); await file(join(root, 'outside/qa.txt'), 'config-snapshot')
  await symlink(join(root, 'outside'), join(source, 'config'), 'junction')
  await expect(runInstanceCopy(job, target, fresh())).rejects.toMatchObject({ name: 'InstanceCopySourceChanged' })
})

test('a destination junction cannot create even empty directories outside the reviewed root', async () => {
  await file(join(source, 'config/nested/deeper/qa.txt'), 'nested-snapshot')
  const job = await prepareInstanceCopy(source, fresh()); await saveInstanceCopy(target, job)
  await mkdir(join(root, 'outside')); await symlink(join(root, 'outside'), join(target, 'config'), 'junction')
  await expect(runInstanceCopy(job, target, fresh())).rejects.toMatchObject({ name: 'InstanceCopyUnsafePath' })
  expect(await readdir(join(root, 'outside'))).toEqual([])
})
test.each(['../outside', 'C:/outside', 'config\\outside', 'instance.json', '.copy-job.json', '.copy-temp-job/file'])('invalid persisted copy path %j fails closed', async path => {
  const job = await prepareInstanceCopy(source, fresh()); job.files[0].path = path; await saveInstanceCopy(target, job)
  await expect(readInstanceCopy(target)).rejects.toMatchObject({ name: 'InstanceCopyInvalid' })
  await expect(assertInstanceCopyComplete(target)).rejects.toMatchObject({ name: 'InstanceCopyIncomplete' })
})
test('malformed markers, repeated paths, drive roots and source-equals-target never authorize launching or overwriting', async () => {
  await file(join(target, COPY_JOB), 'not-json')
  await expect(readInstanceCopy(target)).rejects.toMatchObject({ name: 'InstanceCopyInvalid' })
  const job = await prepareInstanceCopy(source, fresh()); job.files.push({ ...job.files[0], path: job.files[0].path.toUpperCase() }); await saveInstanceCopy(target, job)
  await expect(readInstanceCopy(target)).rejects.toMatchObject({ name: 'InstanceCopyInvalid' })
  job.files.pop(); job.source = parse(source).root; await saveInstanceCopy(target, job)
  await expect(readInstanceCopy(target)).rejects.toMatchObject({ name: 'InstanceCopyInvalid' })
  job.source = target; await saveInstanceCopy(target, job)
  await expect(runInstanceCopy(job, target, fresh())).rejects.toMatchObject({ name: 'InstanceCopyUnsafePath' })
})
