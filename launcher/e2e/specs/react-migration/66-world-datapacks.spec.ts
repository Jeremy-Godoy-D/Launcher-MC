import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactWorld } from '../../helpers/react-world'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'
import { activateLauncherControl } from '../../helpers/focus-launcher'
import { createRequire } from 'node:module'
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })

async function makeDatapackZip(targetPath: string, meta: { pack_format: number; description: string }, files: Record<string, string> = {}) {
  const require = createRequire(new URL('../../../xmcl-runtime/package.json', import.meta.url))
  const { ZipFile } = require('yazl')
  const { createWriteStream } = require('node:fs')
  const zip = new ZipFile()
  zip.addBuffer(Buffer.from(JSON.stringify({ pack: meta })), 'pack.mcmeta')
  for (const [name, content] of Object.entries(files)) {
    zip.addBuffer(Buffer.from(content), name)
  }
  await new Promise<void>((resolve, reject) => {
    zip.outputStream.pipe(createWriteStream(targetPath)).on('close', resolve).on('error', reject)
    zip.end()
  })
}

async function open(page: Page) {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click()
  await page.getByRole('link', { name: 'Mundos', exact: true }).click()
  const area = page.getByTestId('instance-worlds')
  await expect(area).toHaveAttribute('aria-busy', 'false')
  return area
}

test('world datapack import reviews formats, preserves source, detects collisions and updates the list', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  const root = await makeReactWorld(path, 'Alpha', 'Alpha World')
  const external = join(launcher.appDataPath, 'datapack-source')
  await mkdir(external, { recursive: true })
  const zipPath = join(external, 'sample_pack.zip')
  await makeDatapackZip(zipPath, { pack_format: 48, description: 'Sample Datapack Description' }, { 'data/custom/test.json': '{"hello":"world"}' })
  const originalBytes = await readFile(zipPath)

  const area = await open(page)
  await area.getByRole('button', { name: 'Alpha World', exact: true }).click()
  const info = page.getByTestId('world-info')
  await expect(info).toBeVisible()
  await expect(info.getByText('Datapacks del mundo')).toBeVisible()
  await expect(info.getByText('Este mundo no tiene datapacks instalados.')).toBeVisible()

  // Click import datapack
  await info.getByTestId('datapack-import').click()
  const dialog = page.getByTestId('world-files-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Importar datapack')

  // Stub file picker
  await stubOpenDialog(launcher, zipPath)
  await dialog.getByRole('button', { name: 'Elegir ZIP de datapack', exact: true }).click()
  await expect(dialog.getByLabel('Nombre del datapack en el mundo')).toHaveValue('sample_pack.zip')

  // Review
  await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }))
  const review = dialog.getByTestId('world-files-review')
  await expect(review).toBeVisible()
  await expect(review).toContainText('sample_pack')
  await expect(review).toContainText('48')
  await expect(review).toContainText('Sample Datapack Description')

  // Confirm
  await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Datapack importado en el mundo')

  // Verify file created and source preserved
  const importedFile = join(root, 'datapacks/sample_pack.zip')
  expect(await readFile(importedFile)).toEqual(originalBytes)
  expect(await readFile(zipPath)).toEqual(originalBytes)

  // Close dialog
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  // Verify list in world-info updated
  const dps = info.getByTestId('world-datapacks')
  await expect(dps).toBeVisible()
  await expect(dps.locator('[data-datapack-name="sample_pack.zip"]')).toBeVisible()
  await expect(dps).toContainText('sample_pack')
  await expect(dps).toContainText('format 48')

  // Re-importing same name should collide
  await info.getByTestId('datapack-import').click()
  await stubOpenDialog(launcher, zipPath)
  await dialog.getByRole('button', { name: 'Elegir ZIP de datapack', exact: true }).click()
  await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }))
  await expect(dialog.getByRole('alert')).toContainText('El destino ya existe')
  await page.keyboard.press('Escape')
})

test('world datapack removal backs up files including sidecars and updates the list', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  const root = await makeReactWorld(path, 'Alpha', 'Alpha World')
  const dpDir = join(root, 'datapacks')
  await mkdir(dpDir, { recursive: true })
  const zipPath = join(dpDir, 'remove_me.zip')
  await makeDatapackZip(zipPath, { pack_format: 48, description: 'To be removed' })
  const bytes = await readFile(zipPath)
  await writeFile(join(dpDir, '.remove_me.zip.modrinth'), JSON.stringify({ projectId: 'mod1', versionId: 'ver1' }))

  const area = await open(page)
  await area.getByRole('button', { name: 'Alpha World', exact: true }).click()
  const info = page.getByTestId('world-info')
  const dps = info.getByTestId('world-datapacks')
  await expect(dps.locator('[data-datapack-name="remove_me.zip"]')).toBeVisible()

  // Click remove button
  await dps.locator('[data-datapack-name="remove_me.zip"]').getByTestId('datapack-remove').click()
  const dialog = page.getByTestId('world-files-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Retirar datapack')

  // Review
  await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }))
  const review = dialog.getByTestId('world-files-review')
  await expect(review).toBeVisible()
  await expect(review).toContainText('remove_me')

  // Confirm removal
  await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Datapack retirado')

  // Verify removed from world
  await expect(lstat(zipPath)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(lstat(join(dpDir, '.remove_me.zip.modrinth'))).rejects.toMatchObject({ code: 'ENOENT' })

  // Verify backup exists with exact bytes
  const backups = (await readdir(join(path, '.backups'))).filter(name => name.startsWith('world-datapacks-'))
  expect(backups).toHaveLength(1)
  expect(await readFile(join(path, '.backups', backups[0], 'Alpha/remove_me.zip'))).toEqual(bytes)

  // Close dialog and verify empty state
  await page.keyboard.press('Escape')
  await expect(info.getByText('Este mundo no tiene datapacks instalados.')).toBeVisible()
})

test('world datapack dialog remains accessible in both themes and supported sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main, errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })

  const [path] = await seedReactLibrary(page)
  await makeReactWorld(path, 'Alpha', 'Alpha World')
  const external = join(launcher.appDataPath, 'datapack-source-a11y')
  await mkdir(external, { recursive: true })
  const zipPath = join(external, 'long_name_' + 'datapack_'.repeat(10) + '.zip')
  await makeDatapackZip(zipPath, { pack_format: 48, description: 'Accessible Datapack' })

  const area = await open(page)
  await area.getByRole('button', { name: 'Alpha World', exact: true }).click()
  const info = page.getByTestId('world-info')
  const dialog = page.getByTestId('world-files-dialog')
  const win = await launcher.app.browserWindow(page)

  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => {
      const key = 'launcher.react.preferences'
      const prefs = JSON.parse(localStorage.getItem(key)!)
      localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme }))
    }, theme)
    await page.reload()

    for (const size of [[1200, 720], [800, 400]]) {
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
      await area.getByRole('button', { name: 'Alpha World', exact: true }).click()
      const trigger = info.getByTestId('datapack-import')
      await trigger.click()
      await stubOpenDialog(launcher, zipPath)
      await dialog.getByRole('button', { name: 'Elegir ZIP de datapack', exact: true }).click()
      await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }))

      const confirm = dialog.getByRole('button', { name: 'Confirmar operación', exact: true })
      await confirm.focus()
      await expect(confirm).toBeFocused()
      await expect(confirm).toBeInViewport({ ratio: 1 })
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)

      await page.addScriptTag({ content: axe.source })
      const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      await writeFile(testInfo.outputPath(`datapack-${theme}-${size[0]}-axe.json`), JSON.stringify(report, null, 2))
      expect(report.violations).toEqual([])

      await snap(launcher, `world-datapacks-${theme}-${size[0]}`, 'World datapack import review preserves sources, backups and keyboard confirmation.')
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
    }
  }
  expect(errors).toEqual([])
})
