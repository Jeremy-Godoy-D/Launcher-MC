import { expect, it } from 'vitest'
import { RuntimeVersionsSchema } from '@xmcl/instance'
import type { Resource } from '@xmcl/resource'
import { getModFileFromResource } from './mod'
import { planModChanges } from './modChanges'

const runtime = RuntimeVersionsSchema.parse({ minecraft: '1.21.1', fabricLoader: '0.16.0' })
function mod(id: string, depends: Record<string, string> = {}, enabled = true, extra: Record<string, unknown> = {}, name = id) {
  return getModFileFromResource({ path: `/mods/${name}.jar${enabled ? '' : '.disabled'}`, fileName: `${name}.jar${enabled ? '' : '.disabled'}`, metadata: { fabric: { schemaVersion: 1, id, version: '1.0.0', depends, ...extra } }, hash: 'a'.repeat(40), version: 3, size: 100, ino: 1, mtime: 1, ctime: 1, atime: 1, isDirectory: false } as Resource, runtime)
}
it('proposes transitive installed dependencies once, without changing models or selecting optional mods', () => {
  const a = mod('root', { library: '*' }, false, { suggests: { optional: '*' } }), b = mod('library', { core: '*' }, false), c = mod('core', { root: '*' }, false), optional = mod('optional', {}, false)
  const plan = planModChanges([a, b, c, optional], runtime, [a.path], true)
  expect(plan.additional.map(mod => mod.modId)).toEqual(['library', 'core'])
  expect(plan.issues).toEqual([])
  expect([a, b, c, optional].every(mod => !mod.enabled)).toBe(true)
})
it('never chooses between ambiguous providers or enables a duplicate id to satisfy a version', () => {
  const a = mod('root', { library: '>=2' }, false), b = mod('library', {}, false, { version: '2.0.0' }, 'lib2'), c = mod('library', {}, false, { version: '3.0.0' }, 'lib3')
  expect(planModChanges([a, b, c], runtime, [a.path], true).additional).toEqual([])
  const installed = mod('library')
  expect(planModChanges([a, b, installed], runtime, [a.path], true).additional).toEqual([])
})
it('selects the sole compatible provider while leaving recommended and optional dependencies alone', () => {
  const a = mod('root', { library: '>=2' }, false, { recommends: { recommended: '*' }, suggests: { suggestion: '*' } }), b = mod('library', {}, false, { version: '2.0.0' }, 'lib2'), c = mod('library', {}, false, {}, 'lib1'), recommended = mod('recommended', {}, false)
  const plan = planModChanges([a, b, c, recommended], runtime, [a.path], true)
  expect(plan.additional).toEqual([b])
  expect(plan.issues.map(issue => issue.severity)).toEqual(['warning'])
})
it('does not propose a dependency that introduces a declared incompatibility', () => {
  const a = mod('root', { library: '*' }, false), b = mod('library', {}, false, { breaks: { existing: '*' } }), existing = mod('existing')
  const plan = planModChanges([a, b, existing], runtime, [a.path], true)
  expect(plan.additional).toEqual([]); expect(plan.issues.map(issue => issue.kind)).toEqual(['missing'])
})
it('disables newly broken dependents and orphan requirements but preserves shared dependencies', () => {
  const root = mod('root', { library: '*' }), library = mod('library', { core: '*' }), core = mod('core'), other = mod('other', { core: '*' })
  const plan = planModChanges([root, library, core, other], runtime, [library.path], false)
  expect(plan.additional.map(mod => mod.modId)).toEqual(['root']); expect(plan.files).not.toContain(core)
  const alone = planModChanges([root, library, core], runtime, [root.path], false)
  expect(alone.additional.map(mod => mod.modId)).toEqual(['library', 'core'])
})
it('does not cascade preexisting unmet requirements and refuses disappeared selections', () => {
  const root = mod('root', { missing: '*' }), other = mod('other')
  expect(planModChanges([root, other], runtime, [other.path], false).additional).toEqual([])
  expect(() => planModChanges([root], runtime, ['/gone.jar'], false)).toThrow('selection changed')
})

const quiltRuntime = RuntimeVersionsSchema.parse({ minecraft: '1.21.1', quiltLoader: '0.27.0' })
function quilt(id: string, depends: unknown[] = [], enabled = true) {
  const file = mod(id, {}, enabled)
  file.fabric = undefined
  file.quilt = { schema_version: 1, quilt_loader: { group: 'test', id, version: '1.0.0', depends: depends as NonNullable<typeof file.quilt>['quilt_loader']['depends'] } }
  file.modLoaders = ['quilt']; file.provideRuntime = { [id]: '1.0.0' }
  return file
}
it('preserves Quilt alternatives and never activates an exemption instead of its actual dependency', () => {
  const root = quilt('root', [['alpha', 'beta'], { id: 'main', unless: 'bridge' }], false), a = quilt('alpha', [], false), b = quilt('beta', [], false), main = quilt('main', [], false), bridge = quilt('bridge', [], false)
  const plan = planModChanges([root, a, main, bridge], quiltRuntime, [root.path], true)
  expect(plan.additional).toEqual([a, main]); expect(plan.issues).toEqual([])
  const ambiguous = planModChanges([root, a, b, main, bridge], quiltRuntime, [root.path], true)
  expect(ambiguous.additional).toEqual([main]); expect(ambiguous.issues.map(issue => issue.kind)).toEqual(['missing'])
})
it('keeps a dependent when its alternative remains and reviews dependents of removed exemptions', () => {
  const root = quilt('root', [['alpha', 'beta']]), a = quilt('alpha'), b = quilt('beta')
  expect(planModChanges([root, a, b], quiltRuntime, [a.path], false).additional).toEqual([])
  const conditional = quilt('conditional', [{ id: 'missing', unless: 'bridge' }]), bridge = quilt('bridge')
  expect(planModChanges([conditional, bridge], quiltRuntime, [bridge.path], false).additional).toEqual([conditional])
})

it('can restrict a review with incomplete metadata to the explicit selection', () => {
  const root = mod('root', { library: '*' }, false), library = mod('library', {}, false)
  expect(planModChanges([root, library], runtime, [root.path], true, false).additional).toEqual([])
  const enabledRoot = mod('root', { library: '*' }), enabledLibrary = mod('library')
  expect(planModChanges([enabledRoot, enabledLibrary], runtime, [enabledRoot.path], false, false).files).toEqual([enabledRoot])
})
