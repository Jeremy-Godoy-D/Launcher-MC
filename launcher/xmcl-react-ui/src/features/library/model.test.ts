import { describe, expect, it } from 'vitest'
import { InstanceSchema } from '../../../../packages/instance/instance'
import { compareRecentInstances, homeOrder, instanceIcon, javaInstances, loaderName, matchesInstanceQuery, selectedInstance } from './model'

const a = { ...InstanceSchema.parse({ name: 'Same', runtime: { minecraft: '1.21.1' } }), path: 'C:\\instances\\a', creationDate: 0, lastPlayedDate: 0, lastAccessDate: 1, playtime: 0 }
const b = { ...a, path: 'C:\\instances\\b', lastAccessDate: 9 }
describe('saved Java library', () => {
  it('prioritizes actual last-played dates over a newer access date without replacing a saved selection', () => {
    const played = { ...a, lastPlayedDate: 100 }, accessed = { ...b, lastAccessDate: 9999 }
    const items = [accessed, played], before = structuredClone(items)
    expect(selectedInstance(items, '')).toBe(played)
    expect(selectedInstance(items, accessed.path)).toBe(accessed)
    expect([...items].sort(compareRecentInstances)).toEqual([played, accessed])
    expect(homeOrder(items, accessed.path)).toEqual([accessed, played])
    expect(homeOrder(items, 'missing')).toEqual([played, accessed])
    expect(items).toEqual(before)
  })
  it('keeps native Home order for equal unknown play dates and uses historic access/creation only for recency ties', () => {
    expect(homeOrder([a, b], '')).toEqual([a, b])
    expect([a, b].sort(compareRecentInstances)).toEqual([b, a])
    expect(compareRecentInstances({ ...a, lastAccessDate: 0, creationDate: 1 }, { ...b, lastAccessDate: 0, creationDate: 2 })).toBeGreaterThan(0)
    expect(homeOrder([a, b], b.path)).toEqual([b, a])
  })
  it('ignores negative/non-finite legacy activity and supports empty history', () => {
    for (const lastPlayedDate of [Number.NaN, Number.POSITIVE_INFINITY, -100]) {
      expect(selectedInstance([{ ...a, lastPlayedDate, lastAccessDate: -1, creationDate: Number.NaN }, b], '')).toBe(b)
    }
    expect(homeOrder([], '')).toEqual([])
  })
  it('matches trimmed names, Minecraft and every loader/version without mutating the instance', () => {
    for (const query of [' same ', ' 1.21.1 ', 'VANILLA', '   ']) expect(matchesInstanceQuery(a, query)).toBe(true)
    expect(matchesInstanceQuery(a, 'Fabric')).toBe(false)
    const keys = ['forge', 'neoForged', 'fabricLoader', 'quiltLoader', 'optifine', 'labyMod'] as const
    const labels = ['Forge', 'NeoForge', 'Fabric', 'Quilt', 'OptiFine', 'LabyMod']
    for (const [index, key] of keys.entries()) {
      const instance = { ...a, runtime: { ...a.runtime, [key]: '47.2.1' } }, before = structuredClone(instance)
      expect(matchesInstanceQuery(instance, ` ${labels[index].toUpperCase()} 47.2.1 `)).toBe(true)
      expect(matchesInstanceQuery(instance, 'Vanilla')).toBe(false)
      expect(instance).toEqual(before)
    }
    expect(matchesInstanceQuery({ ...a, version: 'custom-client', runtime: { ...a.runtime, minecraft: '' } }, 'custom-client')).toBe(true)
  })
  it('preserves exact paths and a saved selection; only chooses recent when none was saved', () => {
    const instances = [a, b]
    expect(selectedInstance(instances, a.path)).toBe(a)
    expect(selectedInstance(instances, '')).toBe(b)
    expect(selectedInstance(instances, 'missing')).toBeUndefined()
    expect(selectedInstance([], '')).toBeUndefined()
    expect(instances).toEqual([a, b])
  })
  it('keeps Bedrock data inert and derives all Java loaders from runtime fields', () => {
    expect(javaInstances([a, { ...b, edition: 'bedrock' }])).toEqual([a])
    expect(loaderName(a)).toBe('Vanilla')
    expect(loaderName({ ...a, runtime: { ...a.runtime, forge: '1', optifine: '1' } })).toBe('Forge + OptiFine')
    for (const [key, label] of [['fabricLoader', 'Fabric'], ['neoForged', 'NeoForge'], ['quiltLoader', 'Quilt'], ['labyMod', 'LabyMod']])
      expect(loaderName({ ...a, runtime: { ...a.runtime, [key]: '1' } })).toBe(label)
  })
  it('uses saved images without accepting script URLs, credentials or arbitrary HTTP endpoints', () => {
    for (const url of ['', 'javascript:alert(1)', 'file:///C:/secret', 'https://user:password@example.com/image', 'http://example.com/image', 'http://launcher/secret', 'http://launcher.evil/image/a']) expect(instanceIcon(url)).toBe('')
    for (const url of ['http://launcher/image/abc', 'http://launcher/media?path=C:/instances/a/icon.png', 'https://cdn.modrinth.com/data/a/icon.png']) expect(instanceIcon(url)).toBe(url)
  })
})
