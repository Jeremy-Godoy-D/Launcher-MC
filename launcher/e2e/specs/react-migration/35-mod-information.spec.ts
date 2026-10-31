import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactMod } from '../../helpers/react-content'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES' } })
async function openMods(page: Page, name = 'Mi mundo') {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Administrar ${name}`, exact: true }).click()
  await page.getByRole('link', { name: 'Mods', exact: true }).click()
  return page.getByTestId('instance-mods')
}

test('mod information reads real archive metadata and renders untrusted descriptions as text', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  const description = '<img src=x onerror="window.__modInfoAttack=true">'
  await makeReactMod(path, 'alpha', 'Alpha', { description, authors: ['Pack Author'], depends: { minecraft: '>=1.20', fabricloader: '>=0.14' } })
  const bytes = await readFile(join(path, 'mods/alpha.jar')), hash = createHash('sha1').update(bytes).digest('hex'), list = await openMods(page)
  const trigger = list.getByRole('button', { name: 'Información de Alpha', exact: true }), info = page.getByRole('region', { name: 'Información del mod', exact: true })
  await trigger.focus(); await page.keyboard.press('Enter')
  await expect(info.getByRole('button', { name: 'Cerrar información del mod' })).toBeFocused()
  await expect(info).toContainText('alpha.jar'); await expect(info).toContainText('Pack Author'); await expect(info).toContainText('1.0.0')
  await expect(info).toContainText(hash); await expect(info).toContainText('minecraft · >=1.20'); await expect(info).toContainText('fabricloader · >=0.14')
  await expect(info).toContainText(description); await expect(info.locator('img,script')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).__modInfoAttack)).toBeUndefined()
  await page.keyboard.press('Escape'); await expect(info).toHaveCount(0); await expect(trigger).toBeFocused()
  await trigger.click(); await trigger.click(); await expect(info).toHaveCount(0)
  expect(await readFile(join(path, 'mods/alpha.jar'))).toEqual(bytes)
})

test('information follows current file metadata, closes on removal and stays within its selected instance', async ({ launcher }) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page)
  await makeReactMod(a, 'alpha', 'Alpha', { description: 'Description A' }); await makeReactMod(b, 'beta', 'Beta', { description: 'Description B' })
  const list = await openMods(page), info = page.getByRole('region', { name: 'Información del mod', exact: true })
  await list.getByRole('button', { name: 'Información de Alpha', exact: true }).click()
  await expect(info).toContainText('Description A')
  await makeReactMod(a, 'alpha', 'Alpha', { description: 'Updated description', version: '2.0.0' })
  await list.getByRole('button', { name: 'Volver a leer', exact: true }).click()
  await expect(info).toContainText('Updated description'); await expect(info).toContainText('2.0.0')
  await list.getByRole('button', { name: 'Desactivar Alpha', exact: true }).click()
  await expect(info).toHaveCount(0)
  await expect(list.getByLabel('Buscar mods instalados')).toBeFocused()
  await openMods(page, 'Fabric QA'); await expect(info).toHaveCount(0)
  await list.getByRole('button', { name: 'Información de Beta', exact: true }).click()
  await expect(info).toContainText('Description B'); await expect(info).not.toContainText('Updated description')
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(b)
})

test('information remains readable and keyboard accessible in both themes and window sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await makeReactMod(path, 'alpha', 'Alpha', { authors: ['Author'], description: 'A real local archive. '.repeat(30), depends: { minecraft: '>=1.20', fabricloader: '>=0.14' } })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const list = await openMods(page), info = page.getByRole('region', { name: 'Información del mod', exact: true })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme)
    await page.reload()
    await list.getByRole('button', { name: 'Información de Alpha', exact: true }).click()
    for (const size of [[1200, 720], [800, 400]]) {
      const win = await launcher.app.browserWindow(page)
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
      await expect(info.getByRole('button', { name: 'Cerrar información del mod' })).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.addScriptTag({ content: axe.source })
      const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      await writeFile(testInfo.outputPath(`info-axe-${theme}-${size[0]}.json`), JSON.stringify(result, null, 2)); expect(result.violations).toEqual([])
      await snap(launcher, `info-${theme}-${size[0]}`, 'Archive metadata shown as text; independent scrolling keeps the rest of the instance accessible.')
      await info.getByRole('heading', { name: 'Dependencias declaradas', exact: true }).scrollIntoViewIfNeeded()
      await snap(launcher, `info-dependencies-${theme}-${size[0]}`, 'Declared dependency ranges from the shared legacy parser, without claiming a compatibility check.')
      await info.getByRole('button', { name: 'Cerrar información del mod' }).focus()
      await page.keyboard.press('Tab'); await expect(info.locator('.content-description')).toBeFocused()
      if (await info.locator('.content-description').evaluate(element => element.scrollHeight > element.clientHeight)) {
        await page.keyboard.press('End'); await expect.poll(() => info.locator('.content-description').evaluate(element => element.scrollTop)).toBeGreaterThan(0)
        await page.keyboard.press('Home')
      }
      await page.keyboard.press('Tab'); await expect(list.getByLabel('Buscar mods instalados')).toBeFocused()
      await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab'); await expect(info.getByRole('button', { name: 'Cerrar información del mod' })).toBeFocused()
    }
    await page.keyboard.press('Escape'); await expect(info).toHaveCount(0)
    await expect(list.getByRole('button', { name: 'Información de Alpha', exact: true })).toBeFocused()
  }
  expect(errors).toEqual([])
})
