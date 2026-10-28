import { expect, it } from 'vitest'
import { RuntimeVersionsSchema } from '@xmcl/instance'
import type { Resource } from '@xmcl/resource'
import { getModFileFromResource } from './mod'
import { createModContext, diagnoseMods, evaluateModRule } from './modDiagnostics'
import { describeModRule, getModRules, matchesModVersion } from './modRules'

const fabricRuntime = RuntimeVersionsSchema.parse({ minecraft: '1.21.1', fabricLoader: '0.16.0' })
const quiltRuntime = RuntimeVersionsSchema.parse({ minecraft: '1.21.1', quiltLoader: '0.27.0' })
const neoRuntime = RuntimeVersionsSchema.parse({ minecraft: '1.21.1', neoForged: '21.1.1' })
function mod(metadata: Record<string, unknown>, path = '/mods/example.jar', runtime = fabricRuntime) {
  const resource = { path, fileName: path.split('/').pop(), metadata, name: '', hash: 'a'.repeat(40), version: 3, ino: 1, size: 100, mtime: 1, ctime: 1, atime: 1, isDirectory: false } as Resource
  return getModFileFromResource(resource, runtime)
}
const fabric = (id: string, extra: Record<string, unknown> = {}) => ({ schemaVersion: 1, id, name: id, version: '1.0.0', ...extra })
const quilt = (id: string, extra: Record<string, unknown> = {}) => ({ schema_version: 1, quilt_loader: { id, group: 'test', version: '1.0.0', ...extra } })
const neo = (extra: Record<string, unknown> = {}) => ({ modid: 'neo', displayName: 'Neo', version: '1.0.0', description: '', authors: '', loaderVersion: '[4,)', modLoader: 'javafml', children: [], dependencies: [], ...extra })

it('distinguishes required dependencies, recommendations, missing files and incompatible versions', () => {
  const root = mod({ fabric: fabric('root', { depends: { minecraft: '>=1.20', library: '>=2' }, recommends: { recommendation: '*' }, suggests: { suggestion: '*' } }) })
  const library = mod({ fabric: fabric('library') }, '/mods/library.jar')
  const issues = diagnoseMods([root, library], createModContext([root, library], fabricRuntime))
  expect(issues.filter(issue => issue.severity === 'error').map(issue => issue.kind)).toEqual(['version'])
  expect(issues.filter(issue => issue.severity === 'warning').map(issue => issue.kind)).toEqual(['missing'])
  const missing = diagnoseMods([root, library], createModContext([root, library], fabricRuntime, new Set([root.path])))
  expect(missing.filter(issue => issue.severity === 'error').map(issue => issue.kind)).toEqual(['missing'])
})
it('evaluates Fabric OR version ranges and opaque strings without NaN comparisons', () => {
  expect(matchesModVersion({ kind: 'any', versions: ['>=2', '1.0.0'] }, '1.0.0', 'fabric')).toBe(true)
  expect(matchesModVersion('release-custom', 'release-custom', 'fabric')).toBe(true)
  expect(matchesModVersion('other-release', 'release-custom', 'fabric')).toBe(false)
  expect(matchesModVersion('>=invalid', 'release-custom', 'fabric')).toBe('maybe')
  expect(matchesModVersion('[2,3)', '1.0', 'maven')).toBe(false)
  expect(matchesModVersion('*', 'release-custom', 'fabric')).toBe(true)
})
it('uses Quilt alternatives, conditional exemptions and grouped version ranges', () => {
  const root = mod({ quilt: quilt('root', { depends: [['absent', 'alias'], { id: 'test:library', versions: { all: ['>=1.0', '<2'] } }, { id: 'other', unless: 'bridge' }] }) }, '/mods/root.jar', quiltRuntime)
  const library = mod({ quilt: quilt('library', { provides: [{ id: 'alias', version: '3.0.0' }] }) }, '/mods/lib.jar', quiltRuntime)
  const bridge = mod({ quilt: quilt('bridge') }, '/mods/bridge.jar', quiltRuntime)
  const context = createModContext([root, library, bridge], quiltRuntime)
  expect(getModRules(root, 'quilt').requires.map(rule => evaluateModRule(rule, context))).toEqual([true, true, true])
  expect(diagnoseMods([root, library, bridge], context)).toEqual([])
  const withoutBridge = createModContext([root, library, bridge], quiltRuntime, new Set([root.path, library.path]))
  expect(evaluateModRule(getModRules(root, 'quilt').requires[2], withoutBridge)).toBe(false)
  expect(matchesModVersion('1.0.0', '1.9.0', 'quilt')).toBe(true)
  expect(matchesModVersion('=1.0.0', '1.9.0', 'quilt')).toBe(false)
})
it('uses ALL for Quilt break groups and never treats an absent optional mod as a conflict', () => {
  const root = mod({ quilt: quilt('root', { depends: [{ id: 'optional', optional: true, versions: '>=2' }], breaks: [['bad_a', 'bad_b'], { id: 'optional', optional: true }] }) }, '/mods/root.jar', quiltRuntime)
  const a = mod({ quilt: quilt('bad_a') }, '/mods/a.jar', quiltRuntime), b = mod({ quilt: quilt('bad_b') }, '/mods/b.jar', quiltRuntime)
  expect(diagnoseMods([root, a], createModContext([root, a], quiltRuntime))).toEqual([])
  expect(diagnoseMods([root, a, b], createModContext([root, a, b], quiltRuntime)).map(issue => issue.kind)).toEqual(['breaks'])
  const optional = mod({ quilt: quilt('optional') }, '/mods/optional.jar', quiltRuntime)
  expect(diagnoseMods([root, optional], createModContext([root, optional], quiltRuntime)).some(issue => issue.kind === 'version')).toBe(true)
})
it('keeps qualified Quilt providers separate and reports contributors by name', () => {
  const root = mod({ quilt: quilt('root', { depends: ['other:library'], metadata: { contributors: { Person: ['Developer', 'Maintainer'] } } }) }, '/mods/root.jar', quiltRuntime)
  const library = mod({ quilt: quilt('library') }, '/mods/lib.jar', quiltRuntime)
  expect(root.authors).toEqual(['Person'])
  expect(diagnoseMods([root, library], createModContext([root, library], quiltRuntime)).map(issue => issue.kind)).toEqual(['missing'])
})
it('does not load server-only Fabric providers or require server-side NeoForge dependencies', () => {
  const server = mod({ fabric: fabric('server', { environment: 'server', depends: { absent: '*' } }) })
  expect(diagnoseMods([server], createModContext([server], fabricRuntime))).toEqual([])
  const root = mod({ neoforge: neo({ dependencies: [{ modId: 'server_only', type: 'required', versionRange: '*', side: 'SERVER' }] }) }, '/mods/neo.jar', neoRuntime)
  expect(diagnoseMods([root], createModContext([root], neoRuntime)).some(issue => issue.kind === 'missing')).toBe(false)
})
it('distinguishes NeoForge required/optional/incompatible and language versions', () => {
  const root = mod({ neoforge: neo({ dependencies: [{ modId: 'optional', type: 'optional', versionRange: '[2,)' }, { modId: 'forbidden', type: 'incompatible', versionRange: '*' }] }) }, '/mods/neo.jar', neoRuntime)
  const optional = mod({ neoforge: neo({ modid: 'optional', version: '1.0.0', loaderVersion: '' }) }, '/mods/optional.jar', neoRuntime)
  const forbidden = mod({ neoforge: neo({ modid: 'forbidden', loaderVersion: '' }) }, '/mods/forbidden.jar', neoRuntime)
  const alone = diagnoseMods([root], createModContext([root], neoRuntime))
  expect(alone.map(issue => issue.kind)).toEqual(['language'])
  expect(alone[0].severity).toBe('warning')
  const kinds = diagnoseMods([root, optional, forbidden], createModContext([root, optional, forbidden], neoRuntime)).map(issue => issue.kind)
  expect(kinds).toContain('version'); expect(kinds).toContain('breaks'); expect(kinds).not.toContain('missing')
})
it('uses Java feature requirements while preserving unknown hardware capabilities', () => {
  const root = mod({ neoforge: neo({ features: { javaVersion: '[21,)', openGLVersion: '[4.6,)' } }) }, '/mods/neo.jar', neoRuntime)
  expect(diagnoseMods([root], createModContext([root], neoRuntime, undefined, '17.0.12')).some(issue => issue.kind === 'java' && issue.severity === 'error')).toBe(true)
  expect(diagnoseMods([root], createModContext([root], neoRuntime, undefined, '21.0.4')).some(issue => issue.kind === 'java')).toBe(false)
  expect(diagnoseMods([root], createModContext([root], neoRuntime)).some(issue => issue.kind === 'feature' && issue.severity === 'warning')).toBe(true)
})
it('does not let an installed mod impersonate the actual Java or Minecraft version', () => {
  const root = mod({ fabric: fabric('root', { depends: { java: '>=22', minecraft: '>=2' } }) })
  const fakeJava = mod({ fabric: fabric('java', { version: '99.0.0' }) }, '/mods/fake-java.jar')
  const fakeMinecraft = mod({ fabric: fabric('minecraft', { version: '99.0.0' }) }, '/mods/fake-mc.jar')
  const issues = diagnoseMods([root, fakeJava, fakeMinecraft], createModContext([root, fakeJava, fakeMinecraft], fabricRuntime, undefined, '21.0.4'))
  expect(issues.some(issue => issue.path === root.path && issue.kind === 'java' && issue.severity === 'error')).toBe(true)
  expect(issues.some(issue => issue.path === root.path && issue.kind === 'version')).toBe(true)
})
it('indexes identifiers as data, including constructor, without prototype inheritance', () => {
  const root = mod({ fabric: fabric('root', { depends: { constructor: '*' } }) })
  expect(diagnoseMods([root], createModContext([root], fabricRuntime)).map(issue => issue.kind)).toEqual(['missing'])
  const provider = mod({ fabric: fabric('constructor') }, '/mods/constructor.jar')
  expect(diagnoseMods([root, provider], createModContext([root, provider], fabricRuntime))).toEqual([])
})
it('allows Fabric on Quilt, but does not invent the compatibility layer version', () => {
  const root = mod({ fabric: fabric('root', { depends: { fabricloader: '>=0.16', minecraft: '>=1.20' } }) })
  const issues = diagnoseMods([root], createModContext([root], quiltRuntime))
  expect(issues.map(issue => issue.kind)).toEqual(['unknown'])
  expect(issues[0].severity).toBe('unknown')
})
it('reports all duplicate bundled ids with distinct stable keys', () => {
  const a = mod({ fabric: [fabric('alpha'), fabric('beta')] }, '/mods/a.jar'), b = mod({ fabric: [fabric('alpha'), fabric('beta')] }, '/mods/b.jar')
  const issues = diagnoseMods([a, b], createModContext([a, b], fabricRuntime))
  expect(issues.map(issue => issue.id)).toEqual(['alpha', 'beta'])
  expect(new Set(issues.map(issue => issue.key)).size).toBe(2)
})
it('bounds malformed/deep metadata and describes conditions without interpreting markup', () => {
  let value: unknown = 'library'
  for (let index = 0; index < 25; index++) value = [value]
  const root = mod({ quilt: quilt('root', { depends: [value] }) }, '/mods/root.jar', quiltRuntime)
  expect(diagnoseMods([root], createModContext([root], quiltRuntime)).some(issue => issue.kind === 'unknown')).toBe(true)
  const words = { any: 'or', all: 'and', unless: 'unless', optional: 'optional' }
  expect(describeModRule({ kind: 'unknown', label: '<img src=x>' }, words)).toBe('<img src=x> · ?')
})
it('reports ambiguous loader configuration without selecting one silently', () => {
  const root = mod({ fabric: fabric('root') }), runtime = RuntimeVersionsSchema.parse({ minecraft: '1.21.1', fabricLoader: '0.16.0', forge: '52.0.0' })
  expect(diagnoseMods([root], createModContext([root], runtime)).map(issue => issue.kind)).toEqual(['configuration'])
})

it('keeps malformed dependency records and excessive feature lists unverified instead of throwing', () => {
  const root = mod({ neoforge: neo() }, '/mods/root.jar', neoRuntime)
  root.neoforge!.dependencies = [null, 'invalid'] as unknown as NonNullable<typeof root.neoforge>['dependencies']
  root.neoforge!.features = Object.fromEntries(Array.from({ length: 513 }, (_, index) => [`feature_${index}`, '*']))
  const rules = getModRules(root, 'neoforge').requires
  expect(rules.filter(rule => rule.kind === 'unknown')).toHaveLength(3)
  expect(diagnoseMods([root], createModContext([root], neoRuntime)).filter(issue => issue.kind === 'unknown')).toHaveLength(3)
})
