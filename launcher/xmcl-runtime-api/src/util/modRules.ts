import type { ModFile } from './mod'
import { getModCompatiblity, type Compatible } from './modCompatible'

export type ModLoader = 'fabric' | 'forge' | 'neoforge' | 'quilt' | 'liteloader'
export type VersionExpression = string | { kind: 'any' | 'all'; versions: VersionExpression[] }
export type ModRule = { kind: 'unknown'; label: string }
  | { kind: 'any'; rules: ModRule[] }
  | { kind: 'all'; rules: ModRule[] }
  | { kind: 'mod'; id: string; versions: VersionExpression; scheme: 'fabric' | 'quilt' | 'maven' | 'exact'; optional?: boolean; unless?: ModRule; environment?: string; role?: 'language' | 'feature' }
export type ModRuleSet = Record<'requires' | 'recommends' | 'breaks' | 'conflicts', ModRule[]>

const unknown = (label = '?'): ModRule => ({ kind: 'unknown', label })
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/\s/.test(value) && ![...value].some(character => character.charCodeAt(0) < 32)
function versions(value: unknown, depth = 0, budget = { remaining: 512 }): VersionExpression | undefined {
  if (depth > 16 || --budget.remaining < 0) return undefined
  if (typeof value === 'string') return value.length > 0 && value.length <= 2048 ? value : undefined
  if (Array.isArray(value)) {
    if (!value.length || value.length > 128) return undefined
    const children = value.map(child => versions(child, depth + 1, budget))
    return children.every((child): child is VersionExpression => child !== undefined) ? { kind: 'any', versions: children } : undefined
  }
  if (!record(value) || Object.keys(value).length !== 1) return undefined
  const kind = Object.hasOwn(value, 'any') ? 'any' : Object.hasOwn(value, 'all') ? 'all' : undefined
  if (!kind || !Array.isArray(value[kind])) return undefined
  const children = versions(value[kind], depth + 1, budget)
  return typeof children === 'object' ? { kind, versions: children.versions } : undefined
}
function leaf(id: unknown, value: unknown, scheme: 'fabric' | 'quilt' | 'maven' | 'exact', extra: { optional?: boolean; environment?: string; role?: 'language' | 'feature' } = {}): ModRule {
  const range = versions(value === undefined ? '*' : value)
  return identifier(id) && range ? { kind: 'mod', id, versions: range, scheme, ...extra } : unknown(typeof id === 'string' ? id.slice(0, 256) : '?')
}
function quiltRule(value: unknown, mode: 'any' | 'all', budget: { remaining: number }, depth = 0): ModRule {
  if (depth > 16 || --budget.remaining < 0) return unknown()
  if (typeof value === 'string') return leaf(value, '*', 'quilt')
  if (Array.isArray(value)) return value.length && value.length <= 128 ? { kind: mode, rules: value.map(child => quiltRule(child, mode, budget, depth + 1)) } : unknown()
  if (!record(value)) return unknown()
  const result = leaf(value.id, value.versions, 'quilt', { optional: value.optional === true, environment: typeof value.environment === 'string' ? value.environment : undefined })
  if (result.kind === 'mod' && value.unless !== undefined) result.unless = quiltRule(value.unless, 'any', budget, depth + 1)
  return result
}
function dictionary(value: unknown, environment?: string): ModRule[] {
  if (value === undefined) return []
  if (!record(value) || Object.keys(value).length > 512) return [unknown()]
  return Object.entries(value).map(([id, range]) => leaf(id, range, 'fabric', { environment }))
}

/** Preserve conditional Quilt rules instead of flattening alternatives into mandatory mods. */
export function getModRules(mod: ModFile, loader: ModLoader): ModRuleSet {
  const result: ModRuleSet = { requires: [], recommends: [], breaks: [], conflicts: [] }
  if (loader === 'fabric' && mod.fabric) {
    const metadata = Array.isArray(mod.fabric) ? mod.fabric : [mod.fabric]
    if (metadata.length > 512) { result.requires.push(unknown()); return result }
    for (const item of metadata) {
      if (!record(item)) { result.requires.push(unknown()); continue }
      result.requires.push(...dictionary(item.depends, item.environment))
      result.recommends.push(...dictionary(item.recommends, item.environment))
      result.breaks.push(...dictionary(item.breaks, item.environment))
      result.conflicts.push(...dictionary(item.conflicts, item.environment))
    }
  } else if (loader === 'quilt' && mod.quilt) {
    const metadata = mod.quilt.quilt_loader, budget = { remaining: 4096 }
    for (const [input, output, mode] of [['depends', 'requires', 'any'], ['breaks', 'breaks', 'all']] as const) {
      const values = metadata[input]
      if (values === undefined) continue
      if (!Array.isArray(values) || values.length > 512) { result[output].push(unknown()); continue }
      result[output].push(...values.map(value => quiltRule(value, mode, budget)))
    }
  } else if (loader === 'liteloader' && mod.liteloader) {
    result.requires.push(leaf('minecraft', mod.liteloader.mcversion || '', 'exact'))
    for (const id of mod.liteloader.dependsOn || []) result.requires.push(leaf(id, '*', 'exact'))
  } else if (loader === 'forge' || loader === 'neoforge') {
    const tomls = loader === 'forge' ? mod.forge?.modsToml : mod.neoforge ? [mod.neoforge, ...mod.neoforge.children] : undefined
    if (!tomls?.length) {
      for (const dep of mod.dependencies[loader] || []) result.requires.push(leaf(dep.modId, dep.versionRange || dep.semanticVersion, dep.versionRange ? 'maven' : 'fabric', { optional: dep.optional }))
    } else {
      if (tomls.length > 512) { result.requires.push(unknown()); return result }
      result.requires.push(leaf(loader, '*', 'maven'))
      for (const metadata of tomls) {
        if (!record(metadata)) { result.requires.push(unknown()); continue }
        if (!Array.isArray(metadata.dependencies) || metadata.dependencies.length > 512) { result.requires.push(unknown()); continue }
        for (const dep of metadata.dependencies) {
          if (!record(dep)) { result.requires.push(unknown()); continue }
          const type = dep.type || (loader === 'neoforge' ? dep.mandatory === false ? 'optional' : 'required' : dep.mandatory === undefined ? 'unknown' : dep.mandatory ? 'required' : 'optional')
          const rule = leaf(dep.modId, dep.versionRange || '*', 'maven', { optional: type === 'optional', environment: dep.side === 'SERVER' ? 'server' : dep.side === undefined || dep.side === 'CLIENT' || dep.side === 'BOTH' ? undefined : dep.side })
          if (type === 'required' || type === 'optional') result.requires.push(rule)
          else if (type === 'incompatible') result.breaks.push(rule)
          else if (type === 'discouraged') result.conflicts.push(rule)
          else result.requires.push(unknown(dep.modId))
        }
        if (metadata.modLoader && metadata.loaderVersion) result.requires.push(leaf(metadata.modLoader, metadata.loaderVersion, 'maven', { role: 'language' }))
        if (metadata.features !== undefined && (!record(metadata.features) || Object.keys(metadata.features).length > 512)) result.requires.push(unknown('features'))
        else for (const [id, value] of Object.entries(metadata.features || {})) result.requires.push(id === 'java_version' || id === 'javaVersion' ? leaf('java', value, 'maven') : leaf(id, value, 'maven', { role: 'feature' }))
      }
    }
  }
  return result
}

export const allRules = (values: Compatible[]): Compatible => values.some(value => value === false) ? false : values.some(value => value === 'maybe') ? 'maybe' : true
export const anyRules = (values: Compatible[]): Compatible => values.some(value => value === true) ? true : values.some(value => value === 'maybe') ? 'maybe' : false

export function matchesModVersion(expression: VersionExpression, version: string, scheme: 'fabric' | 'quilt' | 'maven' | 'exact'): Compatible {
  if (typeof expression !== 'string') return (expression.kind === 'all' ? allRules : anyRules)(expression.versions.map(child => matchesModVersion(child, version, scheme)))
  if (expression === '*') return true
  if (!version) return 'maybe'
  if (scheme === 'exact') return expression === version
  const requirement = scheme === 'quilt' && /^\d/.test(expression) ? `^${expression}` : expression
  return getModCompatiblity(scheme === 'maven' ? { modId: '', versionRange: requirement } : { modId: '', semanticVersion: requirement }, version)
}

export interface ModRuleWords { any: string; all: string; unless: string; optional: string }
export function describeModRule(rule: ModRule, words: ModRuleWords): string {
  if (rule.kind === 'unknown') return `${rule.label} · ?`
  if (rule.kind === 'all' || rule.kind === 'any') return `(${rule.rules.map(child => describeModRule(child, words)).join(` ${words[rule.kind]} `)})`
  const range = (value: VersionExpression): string => typeof value === 'string' ? value : `(${value.versions.map(range).join(` ${words[value.kind]} `)})`
  return `${rule.id} · ${range(rule.versions)}${rule.optional ? ` · ${words.optional}` : ''}${rule.environment ? ` [${rule.environment}]` : ''}${rule.unless ? ` ${words.unless} ${describeModRule(rule.unless, words)}` : ''}`
}
