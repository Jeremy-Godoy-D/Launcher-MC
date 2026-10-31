import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { readForgeModToml } from './forge'

it('preserves Forge and NeoForge feature requirements without assigning another mod requirements', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'grimo-mod-features-'))
  try {
    await mkdir(join(directory, 'META-INF'))
    for (const [file, features] of [['mods.toml', '[mods.features]\njava_version="[17,)"\nopenGLVersion="[3.2,)"'], ['neoforge.mods.toml', '[features.example]\njavaVersion="[21,)"\n[features.other]\njavaVersion="[99,)"']]) {
      await writeFile(join(directory, 'META-INF', file), `modLoader="javafml"\nloaderVersion="[1,)"\n[[mods]]\nmodId="example"\nversion="1.0"\n${features}\n[[dependencies.example]]\nmodId="library"\ntype="required"\nversionRange="[2,)"\nside="CLIENT"`)
      const [metadata] = await readForgeModToml(directory, undefined, file)
      expect(metadata.features).toEqual(file === 'mods.toml' ? { java_version: '[17,)', openGLVersion: '[3.2,)' } : { javaVersion: '[21,)' })
      expect(metadata.dependencies[0]).toMatchObject({ modId: 'library', type: 'required', versionRange: '[2,)', side: 'CLIENT' })
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
