import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ambientScene } from './ambient'
import manifest from './assets/ambient/manifest.json'
import credits from './assets/ambient/credits.json'

describe('bundled Vanilla ambience', () => {
  it('assigns a stable scene without a world, provider or name dependency', () => {
    const scenes = ['a', 'b', 'c'].map(path => ambientScene(path))
    expect(new Set(scenes.map(scene => scene.id)).size).toBe(3)
    for (const path of ['', 'C:\\worlds\\abc', '世界/العالم']) expect(ambientScene(path)).toBe(ambientScene(path))
  })
  it('ships three bounded clips with attributed, intact posters and thumbnails', () => {
    expect(manifest.map(scene => scene.id)).toEqual(['overworld', 'nether', 'end'])
    let total = 0
    for (const scene of manifest) {
      expect(scene.video.bytes).toBeLessThanOrEqual(5 * 1024 * 1024)
      total += scene.video.bytes
      for (const asset of [scene.video, scene.poster, scene.thumbnail]) {
        expect(asset.file).toMatch(/^vanilla-[a-z-]+\.(mp4|webp)$/)
        const bytes = readFileSync(resolve('xmcl-react-ui/src/assets/ambient', asset.file))
        expect(bytes.byteLength).toBe(asset.bytes)
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256)
        const attribution = credits.find(credit => credit.file === asset.file)
        expect(attribution?.sha256).toBe(asset.sha256)
        expect(attribution?.licenseUrl).toMatch(/^https:\/\/creativecommons.org\//)
        expect(attribution?.changes).toBeTruthy()
      }
    }
    expect(total).toBeLessThanOrEqual(15 * 1024 * 1024)
  })
})
