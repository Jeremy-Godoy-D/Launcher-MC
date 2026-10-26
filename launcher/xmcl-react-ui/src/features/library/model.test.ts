import { describe, expect, it } from 'vitest'
import { InstanceSchema } from '../../../../packages/instance/instance'
import { instanceIcon, javaInstances, loaderName, matchesInstanceQuery, selectedInstance } from './model'

const a = { ...InstanceSchema.parse({ name: 'Same', runtime: { minecraft: '1.21.1' } }), path: 'C:\\instances\\a', creationDate: 0, lastPlayedDate: 0, lastAccessDate: 1, playtime: 0 }
const b = { ...a, path: 'C:\\instances\\b', lastAccessDate: 9 }
describe('saved Java library', () => {
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
