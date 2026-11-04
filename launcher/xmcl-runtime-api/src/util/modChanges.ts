import type { RuntimeVersions } from '@xmcl/instance'
import type { ModFile } from './mod'
import { activeModLoader, createModContext, diagnoseMods, evaluateModRule, isClientMod, type ModContext } from './modDiagnostics'
import { getModRules, type ModRule } from './modRules'

function required(mod: ModFile, context: ModContext) {
  const loader = activeModLoader(mod, context)
  return loader && isClientMod(mod, loader) ? getModRules(mod, loader).requires : []
}
function positiveIds(rule: ModRule): string[] {
  if (rule.kind === 'all' || rule.kind === 'any') return rule.rules.flatMap(positiveIds)
  return rule.kind === 'mod' && !rule.role && !rule.optional ? [rule.id] : []
}

/** A proposal only: ambiguous providers and unknown requirements are never chosen silently. */
export function planModChanges(mods: readonly ModFile[], runtime: RuntimeVersions, paths: readonly string[], enable: boolean, includeDependencies = true) {
  const requestedPaths = new Set(paths)
  if ([...requestedPaths].some(path => !mods.some(mod => mod.path === path))) throw new Error('Mod selection changed')
  const requested = mods.filter(mod => requestedPaths.has(mod.path) && mod.enabled !== enable)
  const enabled = new Set(mods.filter(mod => mod.enabled).map(mod => mod.path)), original = createModContext(mods, runtime, new Set(enabled))
  const additional: ModFile[] = []
  for (const mod of requested) { if (enable) enabled.add(mod.path); else enabled.delete(mod.path) }
  const providers = new Map<string, ModFile[]>()
  for (const mod of mods) for (const id of Object.keys(mod.provideRuntime)) {
    const entries = providers.get(id) || []; entries.push(mod); providers.set(id, entries)
  }
  const queue = [...requested]
  if (enable && includeDependencies) {
    const addRequired = (rule: ModRule) => {
      const context = createModContext(mods, runtime, enabled)
      if (evaluateModRule(rule, context) !== false) return
      if (rule.kind === 'all') { rule.rules.forEach(addRequired); return }
      const before = new Set(diagnoseMods(mods, context).filter(issue => issue.severity === 'error').map(issue => issue.key))
      const candidates = [...new Set(positiveIds(rule).flatMap(id => providers.get(id) || []))].filter(mod => {
        if (enabled.has(mod.path) || requestedPaths.has(mod.path) || !activeModLoader(mod, context)) return false
        const next = createModContext(mods, runtime, new Set([...enabled, mod.path]))
        if (evaluateModRule(rule, next) !== true) return false
        return !diagnoseMods(mods, next).some(issue => issue.severity === 'error' && ['duplicate', 'breaks', 'loader', 'configuration'].includes(issue.kind) && (!before.has(issue.key) || issue.kind === 'duplicate' && issue.files.includes(mod.fileName)))
      })
      if (candidates.length !== 1) return
      const mod = candidates[0]
      enabled.add(mod.path); additional.push(mod); queue.push(mod)
    }
    for (let index = 0; index < queue.length; index++) required(queue[index], createModContext(mods, runtime, enabled)).forEach(addRequired)
  } else if (!enable && includeDependencies) {
    // Remove newly broken dependents, then only dependencies no remaining mod needs.
    const closeDependents = () => {
      let removed = true
      while (removed) {
        removed = false
        const context = createModContext(mods, runtime, enabled)
        for (const mod of mods) if (enabled.has(mod.path) && required(mod, original).some(rule => evaluateModRule(rule, original) === true && evaluateModRule(rule, context) === false)) {
          enabled.delete(mod.path); additional.push(mod); queue.push(mod); removed = true
        }
      }
    }
    closeDependents()
    for (let index = 0; index < queue.length; index++) {
      const rules = required(queue[index], original).filter(rule => evaluateModRule(rule, original) === true)
      for (const candidate of new Set(rules.flatMap(positiveIds).flatMap(id => providers.get(id) || []))) {
        if (!enabled.has(candidate.path)) continue
        const withoutOriginal = createModContext(mods, runtime, new Set([...original.enabled].filter(path => path !== candidate.path)))
        if (!rules.some(rule => evaluateModRule(rule, withoutOriginal) === false)) continue
        const context = createModContext(mods, runtime, enabled), without = createModContext(mods, runtime, new Set([...enabled].filter(path => path !== candidate.path)))
        const needed = mods.some(mod => enabled.has(mod.path) && mod.path !== candidate.path && required(mod, context).some(rule => evaluateModRule(rule, context) === true && evaluateModRule(rule, without) !== true))
        if (needed) continue
        enabled.delete(candidate.path); additional.push(candidate); queue.push(candidate)
        closeDependents()
      }
    }
  }
  const before = new Set(diagnoseMods(mods, original).map(issue => issue.key))
  return { requested, additional, files: [...requested, ...additional], issues: diagnoseMods(mods, createModContext(mods, runtime, enabled)).filter(issue => !before.has(issue.key)) }
}
