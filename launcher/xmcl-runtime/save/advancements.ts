import { Version } from '@xmcl/core'
import { FileSystem } from '@xmcl/system'
import { join } from 'path'
import { assignJarLang, readVanillaLangFromAssets, toMcLang } from '../util/minecraftLang'
import { chargeProgress, parseProgressJson, progressBudget, progressIdentifier, readProgressFile, type ProgressBudget } from './progressFiles'

export interface AdvancementDefinition {
  parent?: string
  icon: string
  frame: 'task' | 'goal' | 'challenge'
  title: string
  description: string
  totalCriteria: number
}

export async function resolveProgressVersion(instancePath: string, gameDataPath?: string, versionId?: string, budget = progressBudget()) {
  if (!gameDataPath) return undefined
  let id = versionId
  if (!id) {
    const instanceFile = join(instancePath, 'instance.json')
    const content = await readProgressFile(instancePath, instanceFile, budget).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (!content) return undefined
    const instance = parseProgressJson(content.toString('utf8'))
    id = instance.version || instance.runtime?.minecraft
  }
  if (!id) return undefined
  const hierarchy: ReturnType<typeof Version.normalizeVersionJson>[] = [], seen = new Set<string>()
  while (id) {
    progressIdentifier(id)
    if (seen.has(id) || seen.size >= 32) throw new Error('Invalid progress version inheritance')
    seen.add(id)
    const content = await readProgressFile(gameDataPath, join(gameDataPath, 'versions', id, `${id}.json`), budget).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (!content) { if (!hierarchy.length) return undefined; throw new Error('Missing progress version parent') }
    const json = parseProgressJson(content.toString('utf8'))
    for (const value of [json.id, json.inheritsFrom, json.jar, json.clientVersion, json._minecraftVersion, json.assets, json.assetIndex?.id]) if (value !== undefined) progressIdentifier(value)
    hierarchy.push(Version.normalizeVersionJson(JSON.stringify({ ...json, id }), gameDataPath))
    id = json.inheritsFrom
  }
  const version = Version.resolve(gameDataPath, hierarchy)
  const clientId = progressIdentifier(version.clientJar || version.minecraftVersion)
  const assetIndex = version.assetIndex?.id || version.assets
  if (assetIndex) progressIdentifier(assetIndex)
  return {
    clientJarPath: join(gameDataPath, 'versions', clientId, `${clientId}.jar`),
    assetIndex,
  }
}

export function translateText(component: unknown, lang: Record<string, string>): string {
  let nodes = 0
  const bounded = (text: string) => { if (text.length > 16384) throw new Error('Progress text size limit exceeded'); return text }
  function visit(component: unknown, depth = 0): string {
    if (++nodes > 2048 || depth > 64) throw new Error('Progress text structure limit exceeded')
    if (typeof component === 'string') return bounded(component)
    if (Array.isArray(component)) { let text = ''; for (const child of component) text = bounded(text + visit(child, depth + 1)); return text }
    if (!component || typeof component !== 'object') return ''
    const value = component as { text?: unknown; translate?: string; fallback?: string; with?: unknown[]; extra?: unknown[] }
    let text = typeof value.text === 'string' ? bounded(value.text) : ''
    if (typeof value.translate === 'string') {
      const translated = Object.hasOwn(lang, value.translate) ? lang[value.translate] : undefined
      const template = bounded(typeof translated === 'string' ? translated : typeof value.fallback === 'string' ? value.fallback : value.translate)
      let index = 0, size = template.length
      text = template.replace(/%%|%(?:(\d+)\$)?s/g, (match, position) => {
        if (match === '%%') { size--; return '%' }
        const arg = value.with?.[position ? Number(position) - 1 : index++]
        const result = arg === undefined ? match : visit(arg, depth + 1)
        size += result.length - match.length
        if (size > 16384) throw new Error('Progress text expansion limit exceeded')
        return result
      })
    }
    if (Array.isArray(value.extra)) for (const child of value.extra) text = bounded(text + visit(child, depth + 1))
    return text
  }
  return visit(component)
}

export async function readAdvancementDefinitions(
  fs: FileSystem,
  locale: string,
  gameDataPath?: string,
  assetIndex?: string,
  budget: ProgressBudget = progressBudget(),
): Promise<Record<string, AdvancementDefinition>> {
  const result: Record<string, AdvancementDefinition> = {}
  let definitions = 0
  const code = toMcLang(locale)
  const vanillaLang = gameDataPath && assetIndex && code !== 'en_us'
    ? await readVanillaLangFromAssets(gameDataPath, assetIndex, code, budget)
    : undefined
  // 1.12 stores definitions in assets; 1.13+ uses data, with singular paths in 1.21+.
  for (const root of ['assets', 'data']) {
    if (!await fs.existsFile(root) || !await fs.isDirectory(root)) continue
    for (const namespace of await fs.listFiles(root)) {
      if (!namespace) continue
      if (!/^[a-z0-9_.-]+$/.test(namespace)) throw new Error('Invalid progress namespace')
      const lang: Record<string, string> = Object.create(null)
      await assignJarLang(fs, namespace, 'en_us', lang)
      if (code !== 'en_us') await assignJarLang(fs, namespace, code, lang)
      if (namespace === 'minecraft' && vanillaLang) Object.assign(lang, vanillaLang)
      for (const directory of ['advancements', 'advancement']) {
        const base = fs.join(root, namespace, directory)
        if (!await fs.existsFile(base) || !await fs.isDirectory(base)) continue
        await walkFiles(fs, base, async path => {
          if (!path.endsWith('.json')) return
          const definition = parseProgressJson(await fs.readFile(path, 'utf-8'))
          if (!definition.display) return
          const relative = path.slice(base.length + 1).replace(/\\/g, '/').slice(0, -5)
          const display = definition.display
          if (definition.parent !== undefined && (typeof definition.parent !== 'string' || definition.parent.length > 2048)) throw new Error('Invalid advancement parent')
          result[`${namespace}:${relative}`] = {
            parent: definition.parent,
            icon: typeof (display.icon?.id || display.icon?.item) === 'string' ? display.icon.id || display.icon.item : '',
            frame: ['task', 'goal', 'challenge'].includes(display.frame) ? display.frame : 'task',
            title: translateText(display.title, lang),
            description: translateText(display.description, lang),
            totalCriteria: Object.keys(definition.criteria || {}).length,
          }
          if (++definitions > 10000) throw new Error('Too many advancement definitions')
        }, budget)
      }
    }
  }
  return result
}

async function walkFiles(fs: FileSystem, path: string, read: (path: string) => Promise<void>, budget: ProgressBudget, depth = 0): Promise<void> {
  chargeProgress(budget)
  if (depth > 32) throw new Error('Progress resource nesting limit exceeded')
  if (!await fs.isDirectory(path)) return read(path)
  for (const child of await fs.listFiles(path)) {
    if (child) await walkFiles(fs, fs.join(path, child), read, budget, depth + 1)
  }
}
