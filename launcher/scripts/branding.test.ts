import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import assets from '../branding/assets.json'
import copper from '../branding/copper/assets.json'
import { config } from '../xmcl-electron-app/build/electron-builder.config'
import { LAUNCHER_NAME } from '../xmcl-runtime/constant'

describe('Grimo branding and compatibility', () => {
  it('preserves the supplied PNG/ICO bytes and contains Windows icon sizes', () => {
    for (const [folder, manifest] of [['', assets], ['copper', copper]] as const) for (const asset of manifest.files) {
      const bytes = readFileSync(resolve('branding', folder, asset.file))
      expect(createHash('sha256').update(bytes).digest('hex'), asset.file).toBe(asset.sha256)
      if (asset.file.endsWith('.png')) {
        expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
        expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([asset.width, asset.height])
      } else {
        expect(bytes.readUInt16LE(2)).toBe(1)
        const sizes = Array.from({ length: bytes.readUInt16LE(4) }, (_, i) => bytes[6 + i * 16] || 256)
        expect(sizes).toEqual(expect.arrayContaining([16, 32, 48, 256]))
      }
    }
  })
  it('changes public names while keeping installed identity, data and old deep links', () => {
    expect(config.productName).toBe('Grimo Launcher')
    expect(config.nsis.shortcutName).toBe('Grimo Launcher')
    expect(config.win.artifactName).toBe('GrimoLauncher-${version}-win-${arch}.${ext}')
    expect(config.win.icon).toBe('../branding/copper/grimo.ico')
    expect(config.appId).toBe('local.launchermc.desktop')
    expect(config.protocols.schemes).toEqual(['launchermc'])
    expect(LAUNCHER_NAME).toBe('LauncherMC')
  })
})
