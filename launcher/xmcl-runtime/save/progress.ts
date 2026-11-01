import {
  InstanceProgressAdvancement,
  InstanceProgressChapter,
  InstanceProgressQuestItem,
  InstanceProgressQuests,
  InstanceProgressStats,
  InstanceSaveProgress,
} from '@xmcl/runtime-api'
import { FileSystem } from '@xmcl/system'
import { basename, dirname, join } from 'path'
import { parseSnbt } from './snbt'
import { AdvancementDefinition, readAdvancementDefinitions, resolveProgressVersion } from './advancements'
import { chargeProgress, listProgressFiles, openProgressArchive, parseProgressJson, progressBudget, progressIdentifier, progressInfo, readProgressFile, type ProgressBudget } from './progressFiles'
import { staticPngDataUrl } from '../instance/utils/worldFiles'
import { instanceFileSource } from '../instanceIO/utils/instanceFileSource'

function normalizeId(id: unknown): string {
  if (!['string', 'number', 'bigint'].includes(typeof id)) return ''
  return String(id)
}

export function extractCleanItemId(raw: any): string {
  if (!raw) return ''
  if (typeof raw === 'object') {
    const id = raw.id || raw.name || raw.item
    return typeof id === 'string' ? id : ''
  }
  let s = String(raw).trim()
  const imgMatch = s.match(/\{image:([^\s}]+)/i)
  if (imgMatch) return imgMatch[1]
  const idMatch = s.match(/(?:id|item):\s*["']([^"']+)["']/i)
  if (idMatch) return idMatch[1]
  const unquotedMatch = s.match(/(?:id|item):\s*([a-zA-Z0-9_.-]+:[a-zA-Z0-9_./-]+)/i)
  if (unquotedMatch) return unquotedMatch[1]
  if (s.startsWith('{') && s.endsWith('}')) {
    s = s.substring(1, s.length - 1).trim()
  }
  return s
}

export function cleanTitle(title?: string): string {
  if (!title || typeof title !== 'string') return ''
  let cleaned = title
    .replace(/\{image:[^}]+\}/gi, '')
    .replace(/\u00a7[0-9a-fk-or]/gi, '')
    .replace(/&[0-9a-fk-or]/gi, '')
    .replace(/^[\p{Extended_Pictographic}\p{Emoji}\p{Symbol}\p{Punctuation}\s]+-\s*/u, '')
    .trim()
  return cleaned || title.trim()
}

async function findLatestFile(dir: string, preferredUuid: string | undefined, root: string, budget: ProgressBudget): Promise<{ file: string; uuid: string } | undefined> {
  const files = await listProgressFiles(root, dir, budget)
  const jsonFiles = files.filter(f => f.endsWith('.json'))
  if (jsonFiles.length === 0) return undefined

  if (preferredUuid) {
    progressIdentifier(preferredUuid)
    const match = jsonFiles.find(f => f.toLowerCase() === `${preferredUuid.toLowerCase()}.json`)
    if (match) {
      return { file: join(dir, match), uuid: match.replace(/\.json$/, '') }
    }
  }

  let latestFile = jsonFiles[0]
  let latestMtime = 0
  for (const f of jsonFiles) {
    try {
      const s = await progressInfo(root, join(dir, f), budget)
      if (!s?.isFile()) throw new Error('Invalid progress file')
      if (s.mtimeMs > latestMtime) {
        latestMtime = s.mtimeMs
        latestFile = f
      }
    } catch (cause) {
      throw new Error(`Cannot inspect progress file: ${join(dir, f)}`, { cause })
    }
  }

  return { file: join(dir, latestFile), uuid: latestFile.replace(/\.json$/, '') }
}

export async function parseAdvancements(
  filePath?: string,
  extraDefinitions: Record<string, AdvancementDefinition> = {},
  includeUnearned: boolean = false,
  budget = progressBudget(),
  root = filePath ? dirname(filePath) : process.cwd(),
): Promise<{
  completed: number
  categories: Record<string, number>
  items: InstanceProgressAdvancement[]
}> {
  try {
    let json: Record<string, any> = {}
    if (filePath) {
      const content = await readProgressFile(root, filePath, budget).catch(error => { if (error.code !== 'ENOENT') throw error })
      if (content) json = parseProgressJson(content.toString('utf8'))
    }

    const items: InstanceProgressAdvancement[] = []
    const categories: Record<string, number> = Object.create(null)
    let completed = 0

    const allDefs = extraDefinitions

    const validPlayerKeys = Object.keys(json).filter(k => k !== 'DataVersion' && !k.includes('recipes/'))
    const keys = includeUnearned
      ? new Set([...Object.keys(allDefs), ...validPlayerKeys])
      : validPlayerKeys
    if ((keys instanceof Set ? keys.size : keys.length) > 10000) throw new Error('Too many progress advancements')

    for (const key of keys) {
      const data = json[key]
      const def = allDefs[key]
      const done = Boolean(data?.done)
      const criteria = data?.criteria || {}
      const criteriaCompleted = Object.keys(criteria).length

      const colonIdx = key.indexOf(':')
      const mod = colonIdx !== -1 ? key.substring(0, colonIdx) : 'minecraft'

      if (done) {
        completed++
        categories[mod] = (categories[mod] || 0) + 1
      }

      items.push({
        id: key,
        mod,
        done,
        criteriaCompleted,
        totalCriteria: def?.totalCriteria ?? criteriaCompleted,
        completedTime: done && criteriaCompleted > 0 && typeof Object.values(criteria)[0] === 'string' ? Object.values(criteria)[0] as string : undefined,
        parent: def?.parent,
        icon: def?.icon || '',
        frame: def?.frame || 'task',
        title: def?.title || undefined,
        description: def?.description || undefined,
      })
    }

    // Compute tree layout coordinates (x, y) per branch
    layoutAdvancementTree(items)

    // Sort items: completed first, then alphabetical
    items.sort((a, b) => {
      if (a.done !== b.done) return a.done ? -1 : 1
      return a.id.localeCompare(b.id)
    })

    return { completed, categories, items }
  } catch (cause) {
    throw new Error(`Cannot read advancements: ${filePath}`, { cause })
  }
}

/**
 * Assign coordinates (x, y) for 2D tree layout per branch
 */
function layoutAdvancementTree(items: InstanceProgressAdvancement[]) {
  // Group by branch key (e.g. minecraft:story, minecraft:adventure)
  const branchMap = new Map<string, InstanceProgressAdvancement[]>()
  for (const item of items) {
    const colonIdx = item.id.indexOf(':')
    const mod = colonIdx !== -1 ? item.id.substring(0, colonIdx) : 'minecraft'
    const path = colonIdx !== -1 ? item.id.substring(colonIdx + 1) : item.id
    const slashIdx = path.indexOf('/')
    const branchName = slashIdx !== -1 ? path.substring(0, slashIdx) : path
    const branchKey = `${mod}:${branchName}`

    const list = branchMap.get(branchKey) || []
    list.push(item)
    branchMap.set(branchKey, list)
  }

  for (const [, branchItems] of branchMap) {
    const branchItemMap = new Map<string, InstanceProgressAdvancement>()
    for (const it of branchItems) branchItemMap.set(it.id, it)

    const roots: InstanceProgressAdvancement[] = []
    const childrenMap = new Map<string, InstanceProgressAdvancement[]>()

    for (const item of branchItems) {
      if (!item.parent || !branchItemMap.has(item.parent)) {
        roots.push(item)
      } else {
        const list = childrenMap.get(item.parent) || []
        list.push(item)
        childrenMap.set(item.parent, list)
      }
    }

    let yOffset = 0
    const visited = new Set<string>()
    for (const root of [...roots, ...branchItems]) {
      if (visited.has(root.id)) continue
      const stack = [{ node: root, depth: 0 }]
      while (stack.length) {
        const { node, depth } = stack.pop()!
        if (visited.has(node.id)) continue
        visited.add(node.id); node.x = depth * 1.8; node.y = yOffset
        const children = (childrenMap.get(node.id) || []).filter(child => !visited.has(child.id))
        if (!children.length) yOffset += 1.2
        else for (const child of [...children].reverse()) stack.push({ node: child, depth: depth + 1 })
      }
      yOffset += 1
    }
  }
}

export async function parseStats(filePath: string, budget = progressBudget(), root = dirname(filePath)): Promise<InstanceProgressStats | undefined> {
  try {
    const content = await readProgressFile(root, filePath, budget)
    const json = parseProgressJson(content.toString('utf8'))
    const statsObj = json.stats || json

    const custom = statsObj['minecraft:custom'] || statsObj
    const mined = statsObj['minecraft:mined'] || {}
    const count = (value: unknown) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw new Error('Invalid world statistic')
      return value
    }

    const playTimeTicks = custom['minecraft:play_time'] ??
      custom['minecraft:total_world_time'] ??
      custom['stat.playOneMinute'] ?? 0

    const deaths = custom['minecraft:deaths'] ?? custom['stat.deaths'] ?? 0
    const mobKills = custom['minecraft:mob_kills'] ?? custom['stat.mobKills'] ?? 0
    const damageDealt = custom['minecraft:damage_dealt'] ?? custom['stat.damageDealt'] ?? 0
    const damageTaken = custom['minecraft:damage_taken'] ?? custom['stat.damageTaken'] ?? 0
    const jump = custom['minecraft:jump'] ?? custom['stat.jump'] ?? 0

    let minedBlocksTotal = 0
    for (const count of Object.values(mined)) {
      if (typeof count === 'number') minedBlocksTotal += count
    }

    return {
      playTimeTicks: count(playTimeTicks),
      deaths: count(deaths),
      mobKills: count(mobKills),
      damageDealt: count(damageDealt),
      damageTaken: count(damageTaken),
      jump: count(jump),
      minedBlocksTotal: count(minedBlocksTotal),
    }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new Error(`Cannot read statistics: ${filePath}`, { cause })
  }
}

export async function locateFtbPlayerFile(savePath: string, playerUuid?: string, budget = progressBudget()): Promise<string | undefined> {
  const possiblePlayerDirs = [
    join(savePath, 'ftbquests', 'players'),
    join(savePath, 'ftbquests', 'teams'),
    join(savePath, 'ftbquests'),
    join(savePath, 'serverconfig', 'ftbquests', 'players'),
    join(savePath, 'serverconfig', 'ftbquests', 'teams'),
    join(savePath, 'ftbteams', 'player'),
  ]

  for (const dir of possiblePlayerDirs) {
    const directory = await progressInfo(savePath, dir, budget)
    if (!directory) continue
    if (!directory.isDirectory()) throw new Error('Invalid progress directory')
    if (playerUuid) {
      progressIdentifier(playerUuid)
      const candidate = join(dir, `${playerUuid}.snbt`)
      if ((await progressInfo(savePath, candidate, budget))?.isFile()) {
        return candidate
      }
    }
    const files = await listProgressFiles(savePath, dir, budget)
    const snbtCandidates = files.filter(f => f.endsWith('.snbt') && !['data.snbt', 'chapter_groups.snbt', 'snbt'].includes(f.toLowerCase()))
    if (snbtCandidates.length > 0) {
      let newestFile: string | undefined
      let newestMtime = -1
      for (const f of snbtCandidates) {
        const filePath = join(dir, f)
        const s = await progressInfo(savePath, filePath, budget)
        if (s?.isFile() && s.mtimeMs > newestMtime) {
          newestMtime = s.mtimeMs
          newestFile = filePath
        }
      }
      if (newestFile) {
        return newestFile
      }
    }
  }
  return undefined
}

export async function readCompletedQuestIds(playerProgressFile: string, budget = progressBudget(), root = dirname(playerProgressFile)): Promise<Set<string>> {
  const completedQuestIds = new Set<string>()
  try {
    const raw = (await readProgressFile(root, playerProgressFile, budget)).toString('utf8')
    const parsed = parseSnbt(raw)
    if (parsed) {
      if (parsed.completed) {
        const comp = Array.isArray(parsed.completed) ? parsed.completed : Object.keys(parsed.completed)
        for (const item of comp) completedQuestIds.add(normalizeId(item))
      }
      if (Array.isArray(parsed.quests)) {
        for (const q of parsed.quests) {
          if (q?.id && (q.completed || q.done)) completedQuestIds.add(normalizeId(q.id))
        }
      }
    }
  } catch (cause) {
    throw new Error(`Cannot read quest progress ${playerProgressFile}: ${String(cause)}`, { cause })
  }
  return completedQuestIds
}

export async function parseFtbQuests(
  savePath: string,
  instancePath: string,
  playerUuid?: string,
  budget = progressBudget(),
): Promise<InstanceProgressQuests | undefined> {
  try {
    let chaptersDir: string | undefined
    let chaptersRoot = instancePath
    const possibleChapterDirs = [
      [instancePath, 'config/ftbquests/quests/chapters'],
      [instancePath, 'config/ftbquests/chapters'],
      [savePath, 'ftbquests/quests/chapters'],
      [savePath, 'ftbquests/chapters'],
      [instancePath, 'config/ftbquests/normal/chapters'],
      [instancePath, 'defaultconfigs/ftbquests/quests/chapters'],
      [instancePath, 'defaultconfigs/ftbquests/chapters'],
      [instancePath, 'kubejs/data/ftbquests/chapters'],
    ]

    for (const [root, path] of possibleChapterDirs) {
      const dir = join(root, path), info = await progressInfo(root, dir, budget)
      if (info) {
        if (!info.isDirectory()) throw new Error('Invalid quest directory')
        chaptersRoot = root
        chaptersDir = dir
        break
      }
    }

    if (!chaptersDir) return undefined

    const chapterFiles = await listProgressFiles(chaptersRoot, chaptersDir, budget)
    const snbtFiles = chapterFiles.filter(f => f.endsWith('.snbt'))
    if (snbtFiles.length > 256) throw new Error('Too many quest chapters')
    if (snbtFiles.length === 0) return undefined

    // 1. Locate player progress first to calculate completion & locked state
    const playerProgressFile = await locateFtbPlayerFile(savePath, playerUuid, budget)
    const completedQuestIds = playerProgressFile ? await readCompletedQuestIds(playerProgressFile, budget, savePath) : new Set<string>()

    // 2. Parse chapters with quest coordinates, shapes, icons, and dependencies
    const chapters: InstanceProgressChapter[] = []
    let totalCompletedQuests = 0
    let totalAllQuests = 0

    for (const file of snbtFiles) {
      try {
        const raw = (await readProgressFile(chaptersRoot, join(chaptersDir, file), budget)).toString('utf8')
        const parsed = parseSnbt(raw)
        if (!parsed) continue

        const chapterId = normalizeId(parsed.id || file.replace(/\.snbt$/, ''))
        const rawChapterTitle = parsed.title || parsed.filename || file.replace(/\.snbt$/, '')
        const imgMatch = rawChapterTitle.match(/\{image:([^\s}]+)/i)
        const chapterIcon = extractCleanItemId(parsed.icon) || imgMatch?.[1]
        let chapterTitle = cleanTitle(rawChapterTitle)
        if (!chapterTitle || chapterTitle === parsed.filename || chapterTitle === file.replace(/\.snbt$/, '')) {
          chapterTitle = (parsed.filename || file.replace(/\.snbt$/, '')).replace(/[_-]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        }
        const defaultShape = parsed.default_quest_shape || 'circle'
        const rawQuests = Array.isArray(parsed.quests) ? parsed.quests : []
        if (totalAllQuests + rawQuests.length > 10000) throw new Error('Too many world quests')

        const questItems: InstanceProgressQuestItem[] = []
        let chCompleted = 0

        for (const q of rawQuests) {
          const qId = normalizeId(q?.id)
          if (!qId) continue

          const isDone = completedQuestIds.has(qId)
          if (isDone) chCompleted++

          // Extract dependencies
          const depsRaw = Array.isArray(q?.dependencies) ? q.dependencies : []
          const dependencies: string[] = depsRaw.map(normalizeId).filter((d: string | undefined): d is string => Boolean(d))

          // Check if locked (if any dependency is incomplete)
          let locked = false
          if (!isDone && dependencies.length > 0) {
            locked = dependencies.some((depId: string) => !completedQuestIds.has(depId))
          }

          // Extract icon
          let icon: string | undefined
          if (q?.icon) {
            icon = extractCleanItemId(q.icon)
          } else if (Array.isArray(q?.tasks)) {
            for (const t of q.tasks) {
              if (t?.icon) {
                icon = extractCleanItemId(t.icon)
                if (icon) break
              }
              if (t?.item) {
                icon = extractCleanItemId(t.item)
                if (icon) break
              }
            }
          }

          // Extract coordinates
          const x = typeof q?.x === 'number' ? q.x : (typeof q?.x === 'string' ? parseFloat(q.x) || 0 : 0)
          const y = typeof q?.y === 'number' ? q.y : (typeof q?.y === 'string' ? parseFloat(q.y) || 0 : 0)
          const size = typeof q?.size === 'number' ? q.size : 1
          if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e6 || Math.abs(y) > 1e6 || !Number.isFinite(size) || size <= 0 || size > 128) throw new Error('Invalid quest coordinates or size')
          const shape = typeof q?.shape === 'string' ? q.shape : typeof defaultShape === 'string' ? defaultShape : 'circle'

          // Format description
          let description: string | undefined
          if (Array.isArray(q?.description)) {
            description = q.description.join('\n')
          } else if (typeof q?.description === 'string') {
            description = q.description
          }

          const tasksCount = Array.isArray(q?.tasks) ? q.tasks.length : 0

          questItems.push({
            id: qId,
            title: cleanTitle(q?.title) || qId,
            subtitle: cleanTitle(q?.subtitle),
            description,
            icon,
            x,
            y,
            size,
            shape,
            dependencies,
            done: isDone,
            locked,
            tasksCount,
            tasksCompleted: isDone ? tasksCount : 0,
          })
        }

        if (questItems.length > 0) {
          totalCompletedQuests += chCompleted
          totalAllQuests += questItems.length
          const percentage = questItems.length > 0 ? Math.round((chCompleted / questItems.length) * 100) : 0

          chapters.push({
            id: chapterId,
            title: chapterTitle,
            icon: chapterIcon,
            defaultShape,
            completedQuests: chCompleted,
            totalQuests: questItems.length,
            percentage,
            quests: questItems,
          })
        }
      } catch (cause) {
        throw new Error(`Cannot read quest chapter ${join(chaptersDir, file)}: ${String(cause)}`, { cause })
      }
    }

    if (totalAllQuests === 0) return undefined

    const overallPercentage = totalAllQuests > 0 ? Math.round((totalCompletedQuests / totalAllQuests) * 100) : 0

    return {
      modType: 'ftbquests',
      completedQuests: totalCompletedQuests,
      totalQuests: totalAllQuests,
      percentage: overallPercentage,
      chapters,
    }
  } catch (cause) {
    throw new Error(`Cannot read quests for save ${savePath}: ${String(cause)}`, { cause })
  }
}

/**
 * Extract textures from local client jar or mod jars
 */
const localTextureCache = new Map<string, { value?: string; expires: number }>()
function cacheTexture(key: string, value?: string) {
  localTextureCache.delete(key); localTextureCache.set(key, { value, expires: Date.now() + 30000 })
  while (localTextureCache.size > 128 || [...localTextureCache.values()].reduce((sum, item) => sum + (item.value?.length || 0), 0) > 4 * 1024 * 1024) localTextureCache.delete(localTextureCache.keys().next().value!)
}

const NS_ALIASES: Record<string, string[]> = {
  ae2: ['appliedenergistics2', 'ae2'],
  appliedenergistics2: ['ae2', 'appliedenergistics2'],
  rs: ['refinedstorage'],
  refinedstorage: ['rs', 'refinedstorage'],
  ie: ['immersiveengineering', 'immersive_engineering'],
  immersiveengineering: ['ie', 'immersiveengineering', 'immersive_engineering'],
  tc: ['tconstruct', 'thaumcraft'],
  tconstruct: ['tc', 'tconstruct'],
  ftbq: ['ftbquests', 'ftb-quests', 'ftb_quests'],
  ftbquests: ['ftbquests', 'ftb-quests', 'ftb_quests'],
  ftbt: ['ftbteams', 'ftb-teams', 'ftb_teams'],
  ftblibrary: ['ftblibrary', 'ftb-library', 'ftb_library'],
  thermal: ['thermal_expansion', 'thermal_foundation', 'thermal'],
  refurbished_furniture: ['refurbished_furniture', 'furniture'],
  endrem: ['endrem', 'end_rem'],
}


function getTextureSubpaths(name: string): string[] {
  const clean = name.replace(/^\/+/, '').replace(/\.png$/i, '')
  if (name.includes('/') || name.endsWith('.png')) {
    return [name, `${clean}.png`, `textures/${clean}.png`, `textures/gui/${clean}.png`, `textures/gui/icons/${clean}.png`]
  }
  return [
    `textures/item/${clean}.png`,
    `textures/block/${clean}.png`,
    `textures/items/${clean}.png`,
    `textures/blocks/${clean}.png`,
    `textures/gui/${clean}.png`,
    `textures/gui/icons/${clean}.png`,
    `textures/${clean}.png`,
  ]
}

function validTextureResource(ns: string, name: string) {
  return /^[a-z0-9_.-]+$/.test(ns) && name.length <= 2048 && /^[a-z0-9_./-]+$/.test(name) && name.split('/').every(part => part && part !== '.' && part !== '..')
}

async function extractLocalTextures(itemIds: string[], instancePath: string, clientJarPath: string | undefined, gameDataPath: string | undefined, budget: ProgressBudget): Promise<Record<string, string>> {
  const result: Record<string, string> = Object.create(null)
  if (!itemIds.length) return result
  budget.expires = Math.min(budget.expires, Date.now() + 3000)
  const opened: FileSystem[] = [], jars = new Map<string, FileSystem | null>()
  try {
    const clientStat = clientJarPath && gameDataPath ? await progressInfo(gameDataPath, clientJarPath, budget).catch(() => undefined) : undefined
    const key = (id: string) => JSON.stringify([instancePath, clientJarPath, clientStat?.ino, clientStat?.mtimeMs, clientStat?.size, id])
    const targets: string[] = []
    for (const id of [...new Set(itemIds)].slice(0, 150)) {
      if (typeof id !== 'string' || id.length > 2048) continue
      const cached = localTextureCache.get(key(id))
      if (cached && cached.expires > Date.now()) { localTextureCache.delete(key(id)); localTextureCache.set(key(id), cached); if (cached.value) result[id] = cached.value }
      else { localTextureCache.delete(key(id)); targets.push(id) }
    }
    if (!targets.length) return result
    let clientFs: FileSystem | undefined
    if (clientJarPath && gameDataPath && clientStat) {
      clientFs = await openProgressArchive(gameDataPath, clientJarPath, budget).catch(() => undefined)
      if (clientFs) opened.push(clientFs)
    }
    const directories: Array<{ root: string; path: string }> = []
    for (const path of ['kubejs/assets', 'resources', 'config/openloader/resources']) {
      const directory = join(instancePath, path)
      if ((await progressInfo(instancePath, directory, budget).catch(() => undefined))?.isDirectory()) directories.push({ root: instancePath, path: directory })
    }
    const packs = await instanceFileSource(instancePath, 'resourcepacks', gameDataPath, true).catch(() => undefined)
    for (const source of [{ root: instancePath, path: 'config/openloader/resources' }, ...(packs ? [packs] : [])]) {
      const directory = join(source.root, source.path)
      for (const name of await listProgressFiles(source.root, directory, budget).catch(() => [])) {
        const path = join(directory, name, 'assets')
        if ((await progressInfo(source.root, path, budget).catch(() => undefined))?.isDirectory()) directories.push({ root: source.root, path })
      }
    }
    const modsDir = join(instancePath, 'mods'), modJars = (await listProgressFiles(instancePath, modsDir, budget).catch(() => [])).filter(name => name.endsWith('.jar'))
    for (const itemId of targets) {
      chargeProgress(budget)
      const cleanId = extractCleanItemId(itemId)
      if (typeof cleanId !== 'string') continue
      const colon = cleanId.indexOf(':'), ns = colon < 0 ? 'minecraft' : cleanId.slice(0, colon), name = colon < 0 ? cleanId : cleanId.slice(colon + 1)
      if (!validTextureResource(ns, name)) continue
      let value: string | undefined
      for (const directory of directories) { value = await readTextureFromDisk(directory.root, directory.path, ns, name, budget); if (value) break }
      if (!value && ns === 'minecraft' && clientFs) value = await readTextureFromFs(clientFs, ns, name)
      if (!value && ns !== 'minecraft') {
        const aliases = Object.hasOwn(NS_ALIASES, ns) ? NS_ALIASES[ns] : [ns]
        for (const mod of modJars.filter(jar => aliases.some(alias => jar.toLowerCase().includes(alias))).slice(0, 2)) {
          if (!jars.has(mod)) {
            const fs = opened.length < 32 ? await openProgressArchive(instancePath, join(modsDir, mod), budget).catch(() => null) : null
            jars.set(mod, fs); if (fs) opened.push(fs)
          }
          const fs = jars.get(mod)
          if (fs) value = await readTextureFromFs(fs, ns, name)
          if (value) break
        }
        if (!value && clientFs) value = await readTextureFromFs(clientFs, 'minecraft', name)
      }
      cacheTexture(key(itemId), value); if (cleanId !== itemId) cacheTexture(key(cleanId), value)
      if (value) { result[itemId] = value; result[cleanId] = value }
    }
  } catch {
    // Optional artwork falls back; every started read completes before its archive closes.
  } finally { for (const fs of opened) fs.close() }
  return result
}

async function readTextureFromDisk(root: string, baseDir: string, ns: string, name: string, budget: ProgressBudget, visited = new Set<string>()): Promise<string | undefined> {
  chargeProgress(budget)
  const key = ns + ':' + name
  if (!validTextureResource(ns, name) || visited.has(key) || visited.size >= 8) return undefined
  visited.add(key)
  for (const sub of getTextureSubpaths(name)) {
    try { const value = staticPngDataUrl(await readProgressFile(root, join(baseDir, ns, sub), budget, 64 * 1024)); if (value) return value } catch {}
  }
  const cleanName = name.replace(/\.png$/i, '')
  for (const sub of ['item', 'block']) {
    try {
      const bytes = await readProgressFile(root, join(baseDir, ns, 'models', sub, cleanName + '.json'), budget, 256 * 1024)
      const model = parseProgressJson(bytes.toString('utf8')), ref = model?.textures?.layer0 || model?.textures?.particle || (model?.textures && Object.values(model.textures)[0])
      if (typeof ref !== 'string') continue
      const colon = ref.indexOf(':'), targetNs = colon < 0 ? ns : ref.slice(0, colon), target = colon < 0 ? ref : ref.slice(colon + 1)
      const value = await readTextureFromDisk(root, baseDir, targetNs, target, budget, visited)
      if (value) return value
    } catch {}
  }
  return undefined
}

async function readTextureFromFs(fs: FileSystem, ns: string, name: string): Promise<string | undefined> {
  if (!validTextureResource(ns, name)) return undefined
  for (const path of getTextureSubpaths(name)) {
    try { const value = staticPngDataUrl(Buffer.from(await fs.readFileBuffered(`assets/${ns}/${path}`))); if (value) return value } catch {}
  }
  return undefined
}

export async function readSaveProgress(
  savePath: string,
  instancePath: string,
  gameDataPath?: string,
  preferredPlayerUuid?: string,
  locale = 'en',
  versionId?: string,
): Promise<InstanceSaveProgress> {
  const saveName = basename(savePath)
  const budget = progressBudget()

  const levelDatPath = join(savePath, 'level.dat')
  let levelDatMtime = 0
  try {
    const s = await progressInfo(savePath, levelDatPath, budget)
    if (s) levelDatMtime = s.mtimeMs
  } catch {}

  const advInfo = await findLatestFile(join(savePath, 'advancements'), preferredPlayerUuid, savePath, budget)
  const statsInfo = await findLatestFile(join(savePath, 'stats'), preferredPlayerUuid || advInfo?.uuid, savePath, budget)
  const playerUuid = advInfo?.uuid || statsInfo?.uuid || preferredPlayerUuid
  const version = await resolveProgressVersion(instancePath, gameDataPath, versionId, budget)
  let definitions: Record<string, AdvancementDefinition> = {}
  let clientFs: FileSystem | undefined
  try {
    if (version && gameDataPath && await progressInfo(gameDataPath, version.clientJarPath, budget)) {
      clientFs = await openProgressArchive(gameDataPath, version.clientJarPath, budget)
      definitions = await readAdvancementDefinitions(clientFs, locale, gameDataPath, version.assetIndex, budget)
    }
  } finally {
    clientFs?.close()
  }

  const quests = await parseFtbQuests(savePath, instancePath, playerUuid, budget)
  const isFtbPack = !!quests && quests.chapters.length > 0

  const advancements = await parseAdvancements(advInfo?.file, definitions, !isFtbPack, budget, savePath)
  const stats = statsInfo ? await parseStats(statsInfo.file, budget, savePath) : undefined

  // Collect item icons needed
  const iconItemIds = new Set<string>()
  if (quests) {
    for (const ch of quests.chapters) {
      if (ch.icon) iconItemIds.add(ch.icon)
      for (const q of ch.quests) {
        if (q.icon) iconItemIds.add(q.icon)
      }
    }
  }
  if (!isFtbPack) {
    for (const adv of advancements.items) {
      if (adv.icon) iconItemIds.add(adv.icon)
    }
  }

  let icons: Record<string, string> = {}
  try {
    // Extract textures locally from Minecraft JAR & mods
    icons = await extractLocalTextures(Array.from(iconItemIds), instancePath, version?.clientJarPath, gameDataPath, budget)
  } catch {}

  // Assign data URLs
  for (const adv of advancements.items) {
    if (adv.icon && typeof icons[adv.icon] === 'string') {
      adv.iconDataUrl = icons[adv.icon]
    }
  }
  if (quests) {
    for (const ch of quests.chapters) {
      if (ch.icon && typeof icons[ch.icon] === 'string') ch.iconDataUrl = icons[ch.icon]
      for (const q of ch.quests) {
        if (q.icon && typeof icons[q.icon] === 'string') q.iconDataUrl = icons[q.icon]
      }
    }
  }

  const result: InstanceSaveProgress = {
    savePath,
    saveName,
    playerUuid,
    lastPlayed: levelDatMtime,
    advancements,
    quests,
    stats,
    icons,
  }

  return result
}
