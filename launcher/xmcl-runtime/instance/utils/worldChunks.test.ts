import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serialize, TagType } from '@xmcl/nbt'
import { link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { readSaveChunks, writeSaveChunks } from '../../save/region'

vi.mock('node:fs/promises', async original => {
  const fs = await original<typeof import('node:fs/promises')>()
  return { ...fs, rename: vi.fn(fs.rename) }
})
const { rename } = await import('node:fs/promises')
const { applySaveChunkPlan, planSaveChunkChanges, listSaveChunkBackups } = await import('./worldChunks')
class Chunk { @TagType(TagType.Int) xPos = 0; @TagType(TagType.Int) zPos = 0; @TagType(TagType.String) extra = 'unchanged' }
const authority = { identity: 'registered-world', shared: false }
let root: string, save: string
async function payload(chunkX = 0, chunkZ = 0) {
  const value = new Chunk(); value.xPos = chunkX; value.zPos = chunkZ
  return { chunkX, chunkZ, compression: 2, data: await serialize(value, { compressed: 'deflate' }) }
}
beforeEach(async () => {
  vi.mocked(rename).mockReset()
  const fs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(rename).mockImplementation(fs.rename)
  root = await realpath(await mkdtemp(join(tmpdir(), 'grimo-chunk-plan-')))
  save = join(root, 'World'); await mkdir(save); await writeFile(join(save, 'level.dat'), 'owned world metadata')
  await writeSaveChunks(save, 'minecraft:overworld', [await payload(0, 0), await payload(31, 0)])
})
afterEach(async () => {
  expect(dirname(root)).toBe(await realpath(tmpdir())); expect(root).toContain('grimo-chunk-plan-')
  await rm(root, { recursive: true, force: true })
})

describe('reviewed chunk changes', () => {
  it('reviews without writes, rejects changed inputs and restores a deletion with an exact region backup', async () => {
    const region = join(save, 'region/r.0.0.mca'), before = await readFile(region)
    const change = { type: 'delete', savePath: save, dimension: 'minecraft:overworld', chunks: [{ chunkX: 0, chunkZ: 0 }] } as const
    const plan = await planSaveChunkChanges(save, { ...change, chunks: [...change.chunks] }, authority)
    expect(plan.review).toMatchObject({ chunks: 1, files: 1, shared: false }); expect(await readFile(region)).toEqual(before)
    await expect(readFile(join(save, '.backups/manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    const edited = Buffer.from(before); edited.writeUInt32BE(123, 4096)
    await writeFile(region, edited)
    expect((await planSaveChunkChanges(save, { ...change, chunks: [...change.chunks] }, authority)).review.snapshot).not.toBe(plan.review.snapshot)
    await expect(applySaveChunkPlan(plan, async () => {})).rejects.toMatchObject({ name: 'WorldChunksChangedError', applied: 0 })
    expect(await readFile(region)).toEqual(edited)
    const current = await planSaveChunkChanges(save, { ...change, chunks: [...change.chunks] }, authority)
    const result = await applySaveChunkPlan(current, async () => {})
    expect(await readSaveChunks(save, change.dimension, [...change.chunks])).toEqual([])
    expect(await readFile(join(result.backupPath!, 'World/minecraft_overworld/r.0.0.mca'))).toEqual(edited)
    const restore = await planSaveChunkChanges(save, { type: 'restore', savePath: save, backupId: result.backupId! }, authority)
    await applySaveChunkPlan(restore, async () => {})
    expect(await readFile(region)).toEqual(edited)
  })

  it('preserves unselected sectors and hard link bytes when pasting into existing and new regions', async () => {
    const region = join(save, 'region/r.0.0.mca'), before = await readFile(region), otherLink = join(root, 'outside-alias.mca')
    await link(region, otherLink)
    const chunks = await readSaveChunks(save, 'minecraft:overworld', [{ chunkX: 0, chunkZ: 0 }, { chunkX: 31, chunkZ: 0 }])
    const change = { type: 'paste', savePath: save, dimension: 'minecraft:overworld', chunks, offsetX: 1 } as const
    const plan = await planSaveChunkChanges(save, change, authority)
    expect(plan.review).toMatchObject({ files: 2, chunks: 2 })
    const result = await applySaveChunkPlan(plan, async () => {})
    expect(await readFile(otherLink)).toEqual(before)
    expect((await readFile(region)).subarray(8192, before.length)).toEqual(before.subarray(8192))
    expect(await readSaveChunks(save, 'minecraft:overworld', [{ chunkX: 1, chunkZ: 0 }, { chunkX: 32, chunkZ: 0 }])).toHaveLength(2)
    await applySaveChunkPlan(await planSaveChunkChanges(save, { type: 'restore', savePath: save, backupId: result.backupId! }, authority), async () => {})
    expect(await readFile(region)).toEqual(before)
    await expect(readFile(join(save, 'region/r.1.0.mca'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('retains an incomplete journal after a failed second rename and recovers without losing either original', async () => {
    const file = join(save, 'region/r.0.0.mca'), before = await readFile(file)
    const chunks = await readSaveChunks(save, 'minecraft:overworld', [{ chunkX: 0, chunkZ: 0 }, { chunkX: 31, chunkZ: 0 }])
    const change = { type: 'paste', savePath: save, dimension: 'minecraft:overworld', chunks, offsetX: 1 } as const
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    let published = 0
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (String(from).includes('.prepared') && ++published === 2) throw Object.assign(new Error('simulated disk failure'), { code: 'EIO' })
      await actual.rename(from, to)
    })
    let failure: any
    try { await applySaveChunkPlan(await planSaveChunkChanges(save, change, authority), async () => {}) } catch (error) { failure = error }
    expect(failure).toMatchObject({ name: 'WorldChunkOperationIncompleteError', applied: 1, canRestore: true })
    expect(await readFile(join(failure.backupPath, 'World/minecraft_overworld/r.0.0.mca'))).toEqual(before)
    const history = await listSaveChunkBackups(save)
    expect(history.entries.find(entry => entry.id === failure.backupId)?.state).toBe('incomplete')
    vi.mocked(rename).mockImplementation(actual.rename)
    await applySaveChunkPlan(await planSaveChunkChanges(save, { type: 'restore', savePath: save, backupId: failure.backupId }, authority), async () => {})
    expect(await readFile(file)).toEqual(before)
    await expect(readFile(join(save, 'region/r.1.0.mca'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses restoration over subsequent edits and rejects damaged or linked backups', async () => {
    const change = { type: 'delete', savePath: save, dimension: 'minecraft:overworld', chunks: [{ chunkX: 0, chunkZ: 0 }] } as const
    const result = await applySaveChunkPlan(await planSaveChunkChanges(save, { ...change, chunks: [...change.chunks] }, authority), async () => {})
    const file = join(save, 'region/r.0.0.mca'), bytes = await readFile(file)
    const edited = Buffer.from(bytes); edited.writeUInt32BE(987, 4096 + 31 * 4); await writeFile(file, edited)
    await expect(planSaveChunkChanges(save, { type: 'restore', savePath: save, backupId: result.backupId! }, authority)).rejects.toHaveProperty('name', 'WorldChunkRestoreConflictError')
    expect(await readFile(file)).toEqual(edited)
    await writeFile(file, bytes)
    await writeFile(join(result.backupPath!, 'World/minecraft_overworld/r.0.0.mca'), 'damaged')
    await expect(planSaveChunkChanges(save, { type: 'restore', savePath: save, backupId: result.backupId! }, authority)).rejects.toThrow('checksum')
    const other = join(root, 'linked-world'); await mkdir(other); await writeFile(join(other, 'level.dat'), 'metadata')
    await symlink(join(save, '.backups'), join(other, '.backups'), 'junction')
    await expect(listSaveChunkBackups(other)).rejects.toThrow('Unsafe install directory')
    expect(await readFile(file)).toEqual(bytes)
  })

  it('stops before the first rename if a process guard fails after backups are prepared', async () => {
    const file = join(save, 'region/r.0.0.mca'), before = await readFile(file)
    const change = { type: 'delete', savePath: save, dimension: 'minecraft:overworld', chunks: [{ chunkX: 0, chunkZ: 0 }] } as const
    let checks = 0
    await expect(applySaveChunkPlan(await planSaveChunkChanges(save, { ...change, chunks: [...change.chunks] }, authority), async () => {
      if (++checks === 2) throw Object.assign(new Error('game started'), { name: 'InstanceRunningError' })
    })).rejects.toMatchObject({ name: 'InstanceRunningError', applied: 0, canRestore: true })
    expect(await readFile(file)).toEqual(before)
  })

  it('refuses modified prepared data and overlapping sector headers without changing the world', async () => {
    const file = join(save, 'region/r.0.0.mca'), before = await readFile(file)
    const change = { type: 'paste' as const, savePath: save, dimension: 'minecraft:overworld', chunks: [await payload()], offsetX: 1 }
    const plan = await planSaveChunkChanges(save, change, authority)
    let checks = 0
    await expect(applySaveChunkPlan(plan, async () => {
      if (++checks === 2) {
        const [{ id }] = (await listSaveChunkBackups(save)).entries
        await writeFile(join(save, '.backups', 'world-chunks-' + id, '.prepared/r.0.0.mca'), 'corrupt staging')
      }
    })).rejects.toMatchObject({ applied: 0, canRestore: true })
    expect(await readFile(file)).toEqual(before)
    const overlap = Buffer.from(before); overlap.writeUInt32BE(overlap.readUInt32BE(0), 31 * 4); await writeFile(file, overlap)
    await expect(planSaveChunkChanges(save, change, authority)).rejects.toThrow('Overlapping region sectors')
    expect(await readFile(file)).toEqual(overlap)
  })
})
