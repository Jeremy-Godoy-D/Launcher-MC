import type { Version } from '@xmcl/core'
import type { MMCModpackManifest } from '@xmcl/instance'
import { expect, test } from 'vitest'
import { resolveMmcStandaloneVersion } from './mmcStandaloneVersion'

test('completes partial bases without dropping conditional arguments, logging or legacy overrides', () => {
  const base: Version = { id: '1.21.1', type: 'release', time: '', releaseTime: '', minimumLauncherVersion: 0, mainClass: 'vanilla.Main', libraries: [{ name: 'base:library:1' }], arguments: { game: ['--base', { rules: [{ action: 'allow' }], value: '--conditional' }], jvm: ['-cp', '${classpath}'] }, logging: { client: { argument: '-Dlogging=${path}', type: 'log4j2-xml', file: { sha1: 'a'.repeat(40), size: 1, url: 'https://example.com/log.xml' } } } }
  const manifest: MMCModpackManifest = { json: { formatVersion: 1, components: [{ uid: 'net.minecraft', version: '1.21.1' }] }, cfg: { name: '', notes: '' }, patches: { 'net.minecraft': { uid: 'net.minecraft', arguments: { game: ['--custom'], jvm: ['-Dcustom=true'] } } } }
  const merged = resolveMmcStandaloneVersion(manifest, true, base)!
  expect(merged.arguments?.game).toEqual([...base.arguments!.game, '--custom'])
  expect(merged.logging).toEqual(base.logging)
  manifest.patches!['net.minecraft'] = { uid: 'net.minecraft', minecraftArguments: '--replacement value' }
  expect(resolveMmcStandaloneVersion(manifest, true, base)!.arguments!.game).toEqual(['--replacement', 'value'])
  expect(base.arguments!.game[0]).toBe('--base')
})
