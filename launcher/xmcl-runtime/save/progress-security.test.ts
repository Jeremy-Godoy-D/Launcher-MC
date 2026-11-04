import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { readSaveProgress, parseAdvancements, parseFtbQuests, parseStats } from './progress'
import { resolveProgressVersion, translateText } from './advancements'
import { readVanillaLangFromAssets } from '../util/minecraftLang'

let root: string, instance: string, save: string
beforeEach(async () => { root = await mkdtemp(join(process.cwd(), '.progress-security-test-')); instance = join(root, 'instance'); save = join(instance, 'saves/World'); await mkdir(save, { recursive: true }) })
afterEach(async () => { vi.restoreAllMocks(); expect(dirname(root)).toBe(process.cwd()); expect(root).toContain('.progress-security-test-'); await rm(root, { recursive: true, force: true }) })
async function file(path: string, value: string | Buffer) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, value) }

it('refuses linked advancement and quest sources without reading external progress', async () => {
  const outside = join(root, 'outside'); await file(join(outside, 'player.json'), '{"minecraft:story/root":{"done":true,"criteria":{}}}')
  await symlink(outside, join(save, 'advancements'), 'junction')
  await expect(readSaveProgress(save, instance)).rejects.toThrow('Unsafe install directory')
  await file(join(outside, 'chapter.snbt'), '{ id:"external" quests:[{id:"q"}] }')
  const chapters = join(instance, 'config/ftbquests/quests/chapters'); await mkdir(dirname(chapters), { recursive: true }); await symlink(outside, chapters, 'junction')
  await expect(parseFtbQuests(save, instance)).rejects.toThrow('Cannot read quests')
  expect(await readFile(join(outside, 'chapter.snbt'), 'utf8')).toBe('{ id:"external" quests:[{id:"q"}] }')
})

it('rejects oversized or malformed statistics instead of silently returning empty progress', async () => {
  const path = join(save, 'stats/player.json')
  await file(path, JSON.stringify({ stats: { 'minecraft:custom': { 'minecraft:deaths': 1 } }, padding: 'a'.repeat(4 * 1024 * 1024) }))
  await expect(parseStats(path)).rejects.toThrow('Cannot read statistics')
  await file(path, '{'); await expect(readSaveProgress(save, instance)).rejects.toThrow('Cannot read statistics')
})

it('rejects traversal, circular or linked version metadata and unsafe asset index paths', async () => {
  await file(join(instance, 'instance.json'), '{"version":"../outside"}')
  await expect(resolveProgressVersion(instance, root)).rejects.toThrow()
  await file(join(root, 'versions/a/a.json'), '{"id":"a","inheritsFrom":"b","libraries":[]}')
  await file(join(root, 'versions/b/b.json'), '{"id":"b","inheritsFrom":"a","libraries":[]}')
  await expect(resolveProgressVersion(instance, root, 'a')).rejects.toThrow('inheritance')
  await expect(readVanillaLangFromAssets(root, '../outside', 'en_us')).rejects.toThrow()
  const outside = join(root, 'outside'); await file(join(outside, 'linked.json'), '{}')
  await symlink(outside, join(root, 'versions/linked'), 'junction')
  await expect(resolveProgressVersion(instance, root, 'linked')).rejects.toThrow('Unsafe install directory')
})

it('bounds translation expansion and ignores inherited language keys', () => {
  expect(translateText({ translate: 'toString' }, {})).toBe('toString')
  expect(() => translateText({ translate: 'repeat', with: ['a'.repeat(1000)] }, { repeat: '%1$s'.repeat(1000) })).toThrow('limit')
  let nested: any = 'text'; for (let depth = 0; depth < 100; depth++) nested = { extra: [nested] }
  expect(() => translateText(nested, {})).toThrow('limit')
})

it('lays out deep and cyclic advancement trees without recursion or dropping nodes', async () => {
  const definitions = Object.fromEntries(Array.from({ length: 6000 }, (_, index) => [`minecraft:story/${index}`, { icon: '', frame: 'task' as const, title: 'Node', description: '', totalCriteria: 0, parent: index ? `minecraft:story/${index - 1}` : undefined }]))
  const chain = await parseAdvancements(undefined, definitions, true)
  expect(chain.items).toHaveLength(6000); expect(chain.items.find(item => item.id === 'minecraft:story/5999')?.x).toBe(5999 * 1.8)
  definitions['minecraft:story/0'].parent = 'minecraft:story/5999'
  const cycle = await parseAdvancements(undefined, definitions, true)
  expect(cycle.items).toHaveLength(6000); expect(cycle.items.every(item => Number.isFinite(item.x) && Number.isFinite(item.y))).toBe(true)
})

it('finishes cyclic model lookups, rejects texture traversal and refreshes its bounded artwork cache', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  await file(join(instance, 'config/ftbquests/quests/chapters/chapter.snbt'), '{id:"chapter" quests:[{id:"loop",icon:"minecraft:loop"},{id:"escape",icon:"minecraft:../../outside/secret"},{id:"valid",icon:"minecraft:valid"}]}')
  await file(join(instance, 'resources/minecraft/models/item/loop.json'), '{"textures":{"layer0":"minecraft:loop"}}')
  await file(join(instance, 'resources/minecraft/textures/item/valid.png'), png)
  const progress = await readSaveProgress(save, instance), quests = progress.quests!.chapters[0].quests
  expect(quests.find(quest => quest.id === 'loop')?.iconDataUrl).toBeUndefined()
  expect(quests.find(quest => quest.id === 'escape')?.iconDataUrl).toBeUndefined()
  expect(quests.find(quest => quest.id === 'valid')?.iconDataUrl).toBe('data:image/png;base64,' + png.toString('base64'))
  await file(join(instance, 'resources/minecraft/textures/item/valid.png'), 'invalid image')
  expect((await readSaveProgress(save, instance)).icons?.['minecraft:valid']).toBe(progress.icons?.['minecraft:valid'])
  const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 31000)
  expect((await readSaveProgress(save, instance)).icons?.['minecraft:valid']).toBeUndefined()
})
