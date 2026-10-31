import { test, expect, snap } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { createWriteStream } from 'node:fs'
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pipeline } from 'node:stream/promises'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES' } })
async function pack(path: string, name: string) {
  await mkdir(join(path, 'resourcepacks'), { recursive: true })
  const require = createRequire(new URL('../../../xmcl-runtime/package.json', import.meta.url)), { ZipFile } = require('yazl'), zip = new ZipFile()
  zip.addBuffer(Buffer.from(JSON.stringify({ pack: { pack_format: 34, description: `Synthetic resource pack ${name}` } })), 'pack.mcmeta'); zip.end()
  await pipeline(zip.outputStream, createWriteStream(join(path, 'resourcepacks', `${name}.zip`)))
}

test('resource packs activation and keyboard priority preserve Minecraft entries, unrelated options and another instance', async ({ launcher }, testInfo) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' })
  await pack(a, 'alpha'); await pack(a, 'beta'); await pack(b, 'other')
  const original = 'lang:es_es\r\nresourcePacks:["vanilla","fabric","file/missing.zip","file/alpha.zip"]\r\nunrelated:KEEP\r\n', originalB = 'resourcePacks:["vanilla"]\nlang:en_us\n'
  await writeFile(join(a, 'options.txt'), original); await writeFile(join(b, 'options.txt'), originalB)
  await mkdir(join(a, 'saves/keep'), { recursive: true }); await writeFile(join(a, 'saves/keep/level.dat'), 'KEEP PACK WORLD')
  const alpha = await readFile(join(a, 'resourcepacks/alpha.zip')), beta = await readFile(join(a, 'resourcepacks/beta.zip'))
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Packs', exact: true }).click()
  const area = page.getByTestId('instance-resourcepacks'), enabled = area.getByRole('list', { name: 'Activados · mayor prioridad primero', exact: true })
  await expect(enabled.locator('li')).toHaveCount(4)
  expect(await readFile(join(a, 'options.txt'), 'utf8')).toBe(original)
  await area.getByLabel('Buscar packs instalados', { exact: true }).fill(' beta ')
  await expect(area.getByRole('list', { name: 'Disponibles para activar', exact: true }).locator('li')).toHaveCount(1)
  await area.getByRole('button', { name: /^Activar .*beta/ }).click()
  await expect(area.getByRole('status').filter({ hasText: 'Selección de packs guardada' })).toBeVisible()
  await area.getByLabel('Buscar packs instalados', { exact: true }).fill('')
  await expect(enabled.locator('li').first()).toHaveAttribute('data-pack-id', 'file/beta.zip')
  const down = enabled.locator('li').first().getByRole('button', { name: /Reducir prioridad/ })
  await down.focus(); await page.keyboard.press('Enter')
  await expect(enabled.locator('li').nth(1)).toHaveAttribute('data-pack-id', 'file/beta.zip')
  await expect(enabled.locator('[data-pack-id="file/beta.zip"]').getByRole('button', { name: /Reducir prioridad/ })).toBeFocused()
  expect(await readFile(join(a, 'options.txt'), 'utf8')).toBe(original.replace('"file/alpha.zip"]', '"file/beta.zip","file/alpha.zip"]'))
  const betaRow = enabled.locator('[data-pack-id="file/beta.zip"]')
  for (let move = 0; move < 3; move++) {
    await betaRow.getByRole('button', { name: /Reducir prioridad/ }).press('Enter')
    await expect(enabled.locator('li').nth(2 + move)).toHaveAttribute('data-pack-id', 'file/beta.zip')
    if (move < 2) await expect(betaRow.getByRole('button', { name: /Reducir prioridad/ })).toBeFocused()
  }
  await expect(enabled.locator('li').last()).toHaveAttribute('data-pack-id', 'file/beta.zip')
  await expect(betaRow.getByRole('button', { name: /Aumentar prioridad/ })).toBeFocused()
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', preferences = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...preferences, appearance: theme })) }, theme)
    await page.reload(); await expect(enabled.locator('li')).toHaveCount(5)
    const win = await launcher.app.browserWindow(page)
    for (const [width, height] of [[1200, 720], [800, 400]]) {
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), [width, height])
      await enabled.locator('li').first().getByRole('button', { name: /Desactivar/ }).focus()
      await expect(enabled.locator('li').first().getByRole('button', { name: /Desactivar/ })).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.addScriptTag({ content: axe.source })
      const accessibility = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      await writeFile(testInfo.outputPath(`packs-axe-${theme}-${width}.json`), JSON.stringify(accessibility, null, 2)); expect(accessibility.violations).toEqual([])
      await snap(launcher, `packs-${theme}-${width}`, 'Resource packs use Native activation and keyboard priority; unavailable and built-in entries stay in the Minecraft order.')
    }
  }
  await enabled.locator('[data-pack-id="file/alpha.zip"]').getByRole('button', { name: /Desactivar/ }).click()
  await expect(enabled.locator('[data-pack-id="file/alpha.zip"]')).toHaveCount(0)
  await page.evaluate(b => { localStorage.setItem('selectedInstancePath', b); window.dispatchEvent(new StorageEvent('storage', { key: 'selectedInstancePath', newValue: b })) }, b)
  await expect(area).toHaveAttribute('data-instance-path', b); await expect(enabled.locator('li')).toHaveCount(1)
  await expect(area.getByLabel('Buscar packs instalados', { exact: true })).toHaveValue('')
  expect(await readFile(join(b, 'options.txt'), 'utf8')).toBe(originalB)
  expect(await readFile(join(a, 'resourcepacks/alpha.zip'))).toEqual(alpha); expect(await readFile(join(a, 'resourcepacks/beta.zip'))).toEqual(beta)
  expect(await readFile(join(a, 'saves/keep/level.dat'), 'utf8')).toBe('KEEP PACK WORLD'); expect(errors).toEqual([])
})

test('stale pack selection rejects a write and reload recovers without losing an external edit', async ({ launcher }) => {
  const page = launcher.main, [a] = await seedReactLibrary(page)
  await pack(a, 'alpha'); await writeFile(join(a, 'options.txt'), 'resourcePacks:["vanilla"]\nlang:es_es\n')
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Packs', exact: true }).click()
  const area = page.getByTestId('instance-resourcepacks')
  await expect(area.getByRole('button', { name: /^Activar .*alpha/ })).toBeEnabled()
  const external = 'resourcePacks:["vanilla"]\nlang:en_us\n'
  await writeFile(join(a, 'options.txt'), external)
  await area.getByRole('button', { name: /^Activar .*alpha/ }).click()
  await expect(area.getByRole('alert')).toContainText('options.txt cambió')
  expect(await readFile(join(a, 'options.txt'), 'utf8')).toBe(external)
  await area.getByRole('button', { name: 'Volver a leer', exact: true }).click()
  await area.getByRole('button', { name: /^Activar .*alpha/ }).click()
  await expect(area.getByRole('status').filter({ hasText: 'Selección de packs guardada' })).toBeVisible()
  expect(await readFile(join(a, 'options.txt'), 'utf8')).toBe('resourcePacks:["vanilla","file/alpha.zip"]\nlang:en_us\n')
})

test('shared options are disclosed before activation and keep their intentional shared inode', async ({ launcher }) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page), root = launcher.gameDataPath
  await pack(root, 'shared'); await writeFile(join(root, 'options.txt'), 'resourcePacks:["vanilla"]\nlang:es_es\n')
  await page.evaluate(async paths => {
    for (const path of paths) {
      await (window as any).serviceChannels.open('InstanceResourcePacksService').call('linkShared', path)
      await (window as any).serviceChannels.open('InstanceOptionsService').call('linkGameOptions', path)
    }
  }, [a, b])
  const ino = (await lstat(join(root, 'options.txt'))).ino
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Packs', exact: true }).click()
  const area = page.getByTestId('instance-resourcepacks')
  await expect(area.getByRole('status').filter({ hasText: 'options.txt está compartido' })).toBeVisible()
  await area.getByRole('button', { name: /^Activar .*shared/ }).click()
  await expect(area.getByRole('status').filter({ hasText: 'Selección de packs guardada' })).toBeVisible()
  for (const path of [root, a, b]) {
    expect((await lstat(join(path, 'options.txt'))).ino).toBe(ino)
    expect(await readFile(join(path, 'options.txt'), 'utf8')).toBe('resourcePacks:["vanilla","file/shared.zip"]\nlang:es_es\n')
  }
  await snap(launcher, 'packs-shared-settings', 'Intentional shared settings are disclosed before changing pack activation; all linked options retain their inode.')
})
