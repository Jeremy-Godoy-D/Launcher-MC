import type { RuntimeVersions } from '@xmcl/instance'
import type { ModFile } from './mod'
import type { Compatible } from './modCompatible'
import { getModProvides } from './modDependencies'
import { allRules, anyRules, getModRules, matchesModVersion, type ModLoader, type ModRule } from './modRules'

type Provider = { version: string; mod?: ModFile }
export interface ModContext {
  loaders: ModLoader[]
  providers: Map<string, Provider[]>
  enabled: ReadonlySet<string>
  unknownPresence: Set<string>
  ambiguousRuntime: boolean
}
export interface ModDiagnostic {
  key: string
  kind: 'loader' | 'configuration' | 'missing' | 'version' | 'breaks' | 'conflicts' | 'duplicate' | 'unknown' | 'java' | 'language' | 'feature'
  severity: 'error' | 'warning' | 'unknown'
  path: string
  files: string[]
  id?: string
  rule?: ModRule
}

export function activeModLoader(mod: ModFile, context: ModContext): ModLoader | undefined {
  return context.loaders.find(loader => mod.modLoaders.includes(loader))
}
export function isClientMod(mod: ModFile, loader: ModLoader): boolean {
  if (loader === 'fabric' && mod.fabric) return (Array.isArray(mod.fabric) ? mod.fabric : [mod.fabric]).some(metadata => metadata.environment !== 'server')
  if (loader === 'quilt' && mod.quilt) return (mod.quilt.minecraft?.environment || mod.quilt.quilt_loader.minecraft?.environment) !== 'dedicated_server'
  return true
}
function activeProvides(mod: ModFile, loader: ModLoader) {
  const metadata = {
    fabric: loader === 'fabric' ? Array.isArray(mod.fabric) ? mod.fabric.filter(item => item.environment !== 'server') : mod.fabric : undefined,
    forge: loader === 'forge' ? mod.forge : undefined,
    neoforge: loader === 'neoforge' ? mod.neoforge : undefined,
    quilt: loader === 'quilt' ? mod.quilt : undefined,
    liteloader: loader === 'liteloader' ? mod.liteloader : undefined,
  }
  return getModProvides({ metadata })
}
const connector = (mod: ModFile) => mod.forge?.manifest?.['Automatic-Module-Name'] === 'org.sinytra.connector' || mod.forge?.manifest?.['Implementation-Title'] === 'Connector'

/** Built-in versions come from the instance or known Java, never from a mod claiming their ids. */
export function createModContext(mods: readonly ModFile[], runtime: RuntimeVersions, enabled: ReadonlySet<string> = new Set(mods.filter(mod => mod.enabled).map(mod => mod.path)), javaVersion?: string): ModContext {
  const context: ModContext = { loaders: [], providers: new Map(), enabled, unknownPresence: new Set(), ambiguousRuntime: [runtime.forge, runtime.neoForged, runtime.fabricLoader, runtime.quiltLoader].filter(Boolean).length > 1 }
  const builtin = (ids: string[], version: string | undefined, present = true) => {
    for (const id of ids) {
      if (present) context.providers.set(id, [{ version: version || '' }])
      else context.unknownPresence.add(id)
    }
  }
  builtin(['minecraft', 'com.mojang:minecraft'], runtime.minecraft, !!runtime.minecraft)
  builtin(['java'], javaVersion, !!javaVersion)
  const bridges = mods.filter(mod => enabled.has(mod.path) && connector(mod))
  if (!context.ambiguousRuntime) {
    if (runtime.forge) {
      context.loaders = bridges.length ? ['forge', 'fabric'] : ['forge']
      builtin(['forge'], runtime.forge)
      builtin(['@language:javafml', '@language:lowcodefml'], runtime.forge)
      if (bridges.length) builtin(['fabricloader', 'fabric-loader', 'fabric_loader'], bridges.map(mod => mod.provideRuntime.fabricloader).find(Boolean))
    } else if (runtime.fabricLoader) {
      context.loaders = ['fabric']
      builtin(['fabricloader', 'fabric-loader', 'fabric_loader', 'net.fabricmc:fabricloader'], runtime.fabricLoader)
    } else if (runtime.neoForged) {
      context.loaders = ['neoforge']
      builtin(['neoforge'], runtime.neoForged)
      // NeoForge's JavaFML language version differs from the NeoForge release number.
      builtin(['@language:javafml', '@language:lowcodefml'], undefined)
    } else if (runtime.quiltLoader) {
      context.loaders = ['quilt', 'fabric']
      builtin(['quilt_loader', 'quilt-loader', 'org.quiltmc:quilt_loader'], runtime.quiltLoader)
      builtin(['fabricloader', 'fabric-loader', 'fabric_loader'], undefined)
    }
  }
  const reserved = new Set([...context.providers.keys(), ...context.unknownPresence])
  for (const mod of mods) {
    const loader = activeModLoader(mod, context)
    if (!enabled.has(mod.path) || !loader || !isClientMod(mod, loader)) continue
    for (const [id, version] of Object.entries(activeProvides(mod, loader))) {
      if (!id || reserved.has(id) || typeof version !== 'string') continue
      const entries = context.providers.get(id) || []
      entries.push({ version, mod }); context.providers.set(id, entries)
    }
  }
  return context
}

export function evaluateModRule(rule: ModRule, context: ModContext, presence = false): Compatible {
  if (rule.kind === 'unknown') return 'maybe'
  if (rule.kind === 'any' || rule.kind === 'all') return (rule.kind === 'any' ? anyRules : allRules)(rule.rules.map(child => evaluateModRule(child, context, presence)))
  if (rule.environment && !['*', 'client', 'server', 'dedicated_server'].includes(rule.environment)) return 'maybe'
  if (rule.environment === 'server' || rule.environment === 'dedicated_server') return presence ? false : true
  if (rule.unless) {
    const exempt = evaluateModRule(rule.unless, context, true)
    if (exempt === true) return presence ? false : true
    if (exempt === 'maybe') return 'maybe'
  }
  const id = rule.role ? `@${rule.role}:${rule.id}` : rule.id
  if (context.unknownPresence.has(id)) return 'maybe'
  const providers = context.providers.get(id) || []
  if (!providers.length) return rule.role ? 'maybe' : !presence && rule.optional ? true : false
  return anyRules(providers.map(provider => matchesModVersion(rule.versions, provider.version, rule.scheme)))
}

export function diagnoseMods(mods: readonly ModFile[], context: ModContext): ModDiagnostic[] {
  const issues: ModDiagnostic[] = [], declared = new Map<string, ModFile[]>()
  const add = (mod: ModFile, kind: ModDiagnostic['kind'], severity: ModDiagnostic['severity'], index: number, rule?: ModRule, id?: string, files = [mod.fileName]) => {
    issues.push({ key: JSON.stringify([mod.path, kind, index, severity, id]), kind, severity, path: mod.path, files, rule, id })
  }
  for (const mod of mods) {
    if (!context.enabled.has(mod.path)) continue
    if (context.ambiguousRuntime) { add(mod, 'configuration', 'error', 0); continue }
    if (!context.loaders.length) { add(mod, 'loader', 'unknown', 0); continue }
    const loader = activeModLoader(mod, context)
    if (!loader) { add(mod, 'loader', mod.modLoaders.length ? 'error' : 'unknown', 0); continue }
    if (!isClientMod(mod, loader)) continue
    const ids = loader === 'fabric' && mod.fabric ? (Array.isArray(mod.fabric) ? mod.fabric : [mod.fabric]).filter(item => item.environment !== 'server').map(item => item.id)
      : loader === 'forge' && mod.forge ? [mod.forge.modid, ...mod.forge.modsToml.map(item => item.modid)]
        : loader === 'neoforge' && mod.neoforge ? [mod.neoforge.modid, ...mod.neoforge.children.map(item => item.modid)] : [mod.modId]
    for (const id of new Set(ids)) { const current = declared.get(id) || []; current.push(mod); declared.set(id, current) }
    const rules = getModRules(mod, loader)
    rules.requires.forEach((rule, index) => {
      const value = evaluateModRule(rule, context)
      if (value === true) return
      const kind = rule.kind === 'mod' && rule.id === 'java' ? 'java' : rule.kind === 'mod' && rule.role ? rule.role
        : value === 'maybe' ? 'unknown' : rule.kind === 'mod' && context.providers.has(rule.id) ? 'version' : 'missing'
      add(mod, kind, value === false ? 'error' : kind === 'java' || kind === 'language' || kind === 'feature' ? 'warning' : 'unknown', index, rule)
    })
    for (const kind of ['breaks', 'conflicts'] as const) rules[kind].forEach((rule, index) => {
      const value = evaluateModRule(rule, context, true)
      if (value !== false) add(mod, kind, value === 'maybe' ? 'unknown' : kind === 'breaks' ? 'error' : 'warning', index, rule)
    })
    rules.recommends.forEach((rule, index) => { if (evaluateModRule(rule, context) !== true) add(mod, 'missing', 'warning', rules.requires.length + index, rule) })
  }
  for (const [id, providers] of declared) if (providers.length > 1) add(providers[0], 'duplicate', 'error', 0, undefined, id, providers.map(mod => mod.fileName))
  return issues
}
