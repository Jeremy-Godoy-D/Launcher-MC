import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { readLegacyAppearance } from './legacyAppearance'

const roots: string[] = []
async function setup() { const root = await mkdtemp(join(tmpdir(), 'grimo-legacy-appearance-')); roots.push(root); return root }
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
it('preserves light and dark flags without changing theme JSON or media', async () => {
  const root = await setup(), file = join(root, 'theme.json')
  for (const dark of [false, true]) {
    const bytes = JSON.stringify({ settings: { dark, customCssEnabled: true }, customCss: 'body { display: none }', assets: { backgroundMusic: ['legacy.mp3'] } })
    await writeFile(file, bytes); await writeFile(join(root, 'legacy.mp3'), 'KEEP')
    expect(await readLegacyAppearance(root)).toBe(dark ? 'dark' : 'light')
    expect(await readFile(file, 'utf8')).toBe(bytes); expect(await readFile(join(root, 'legacy.mp3'), 'utf8')).toBe('KEEP')
  }
})
it('reads the old default and leaves missing, malformed or oversized data inert', async () => {
  const root = await setup(); expect(await readLegacyAppearance(root)).toBeUndefined(); expect(await readdir(root)).toEqual([])
  await mkdir(join(root, 'themes')); await writeFile(join(root, 'theme.json'), '{broken'); await writeFile(join(root, 'themes/default.json'), JSON.stringify({ settings: { dark: false } }))
  expect(await readLegacyAppearance(root)).toBe('light')
  await writeFile(join(root, 'themes/default.json'), 'x'.repeat(256 * 1024 + 1)); expect(await readLegacyAppearance(root)).toBeUndefined()
  expect((await readFile(join(root, 'themes/default.json'))).length).toBe(256 * 1024 + 1)
})
