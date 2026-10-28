import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactMod } from '../../helpers/react-content'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES' } })
async function disabled(path: string, id: string, title: string, depends: Record<string, string> = {}) {
  await makeReactMod(path, id, title, { depends }); await rename(join(path, `mods/${id}.jar`), join(path, `mods/${id}.jar.disabled`))
}
async function openMods(page: Page) {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: 'Administrar Fabric QA', exact: true }).click()
  await page.getByRole('link', { name: 'Mods', exact: true }).click()
  return page.getByTestId('instance-mods')
}
test('dependency changes require a review and cancellation preserves bytes before transitive enable and disable', async ({ launcher }) => {
  const page = launcher.main, [, path] = await seedReactLibrary(page)
  await disabled(path, 'root', 'Root', { library: '*' }); await disabled(path, 'library', 'Library', { core: '*' }); await disabled(path, 'core', 'Core')
  const original = await readFile(join(path, 'mods/root.jar.disabled')), list = await openMods(page)
  await expect(list.locator('.content-list li')).toHaveCount(3)
  const trigger = list.getByRole('button', { name: 'Activar Root', exact: true }), review = page.getByRole('dialog', { name: 'Revisar cambios de mods', exact: true })
  await trigger.click(); await expect(review).toContainText('library.jar.disabled'); await expect(review).toContainText('core.jar.disabled')
  await expect(readFile(join(path, 'mods/root.jar'))).rejects.toMatchObject({ code: 'ENOENT' })
  await page.keyboard.press('Escape'); await expect(review).toHaveCount(0); await expect(trigger).toBeFocused()
  expect(await readFile(join(path, 'mods/root.jar.disabled'))).toEqual(original)
  await trigger.click(); await review.getByRole('button', { name: 'Aplicar estos cambios', exact: true }).click()
  await expect(review).toHaveCount(0); await expect(list.locator('[data-file-name$=".disabled"]')).toHaveCount(0)
  expect(await readFile(join(path, 'mods/root.jar'))).toEqual(original)
  await list.getByRole('button', { name: 'Desactivar Library', exact: true }).click()
  await expect(review).toContainText('root.jar'); await expect(review).toContainText('core.jar')
  await review.getByRole('button', { name: 'Aplicar estos cambios', exact: true }).click()
  await expect(review).toHaveCount(0); await expect(list.locator('[data-file-name$=".disabled"]')).toHaveCount(3)
})

test('reviewed dependency changes refuse file or loader changes made after opening the review', async ({ launcher }) => {
  const page = launcher.main, [, path] = await seedReactLibrary(page)
  await disabled(path, 'root', 'Root', { library: '*' }); await disabled(path, 'library', 'Library')
  const original = await readFile(join(path, 'mods/root.jar.disabled')), list = await openMods(page)
  await expect(list.locator('.content-list li')).toHaveCount(2)
  const review = page.getByRole('dialog', { name: 'Revisar cambios de mods', exact: true })
  for (const change of ['file', 'configuration']) {
    await list.getByRole('button', { name: 'Activar Root', exact: true }).click(); await expect(review).toContainText('library.jar.disabled')
    if (change === 'file') await makeReactMod(path, 'unrelated', 'Unrelated')
    else await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, runtime: { minecraft: '1.21.1', fabricLoader: '0.16.1' } }), path)
    await review.getByRole('button', { name: 'Aplicar estos cambios', exact: true }).click()
    await expect(review.getByRole('alert')).toContainText('cambiaron')
    expect(await readFile(join(path, 'mods/root.jar.disabled'))).toEqual(original)
    await expect(readFile(join(path, 'mods/root.jar'))).rejects.toMatchObject({ code: 'ENOENT' })
    await review.getByRole('button', { name: 'Cancelar cambios', exact: true }).last().click()
    await list.getByRole('button', { name: 'Volver a leer', exact: true }).click()
    await expect(list.locator('.content-list li')).toHaveCount(3)
  }
})

test('dependency review fits both themes and window sizes with keyboard, scrolling and reduced motion', async ({ launcher }, testInfo) => {
  const page = launcher.main, [, path] = await seedReactLibrary(page), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const dependency = `library_${'x'.repeat(100)}.jar`
  await disabled(path, 'root', 'Root', { library: '*', missing: '*' })
  await makeReactMod(path, dependency.slice(0, -4), 'Library', { id: 'library', depends: {} })
  await rename(join(path, 'mods', dependency), join(path, 'mods', `${dependency}.disabled`))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const list = await openMods(page), review = page.getByRole('dialog', { name: 'Revisar cambios de mods', exact: true })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme)
    await page.reload(); await expect(list.locator('.content-list li')).toHaveCount(2)
    for (const size of [[1200, 720], [800, 400]]) {
      const win = await launcher.app.browserWindow(page)
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
      await list.getByRole('button', { name: 'Activar Root', exact: true }).click()
      await expect(review).toContainText(`${dependency}.disabled`); await expect(review).toContainText('missing · *')
      await expect(review.getByRole('heading', { name: 'Revisar cambios de mods', exact: true })).toBeInViewport({ ratio: 1 })
      await page.keyboard.press('Tab'); await expect(review.getByRole('region', { name: 'Archivos y requisitos de los cambios' })).toBeFocused()
      await page.keyboard.press('End')
      await review.getByRole('button', { name: 'Aplicar estos cambios', exact: true }).focus()
      await expect(review.getByRole('button', { name: 'Aplicar estos cambios', exact: true })).toBeInViewport({ ratio: 1 })
      expect(await review.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await page.addScriptTag({ content: axe.source })
      const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      await writeFile(testInfo.outputPath(`changes-axe-${theme}-${size[0]}.json`), JSON.stringify(result, null, 2)); expect(result.violations).toEqual([])
      await snap(launcher, `changes-${theme}-${size[0]}`, 'Explicit review of requested files, dependency changes and unresolved requirements before writing.')
      await page.keyboard.press('Escape'); await expect(review).toHaveCount(0)
      await expect(list.getByRole('button', { name: 'Activar Root', exact: true })).toBeFocused()
    }
  }
  expect(errors).toEqual([])
})
