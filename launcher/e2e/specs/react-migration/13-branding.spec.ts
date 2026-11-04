import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { test, expect, snap } from '../../helpers/scratch'

test.use({ launcherOptions: { seed: { name: 'Grimo preserved QA', minecraft: '1.21.1' }, locale: 'es-ES' } })

test('Grimo displays adapted supplied logos in both themes and keeps existing launcher data', async ({ launcher }, testInfo) => {
  const page = launcher.main
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const native = await launcher.app.evaluate(({ app }) => ({ name: app.getName(), exe: app.getPath('exe'), userData: app.getPath('userData') }))
  expect(native.name).toBe('Grimo Launcher')
  expect(basename(native.exe)).toBe('Grimo Launcher.exe')
  expect(native.userData).toBe(join(launcher.appDataPath, 'LauncherMC'))
  await expect(page).toHaveTitle(/Grimo Launcher/)
  await expect(page.locator('.titlebar-left')).toContainText('Grimo Launcher')
  const brand = page.getByRole('link', { name: 'Grimo Launcher, Inicio', exact: true })
  await expect(brand).toBeVisible()
  await expect.poll(() => brand.locator('img').evaluate(img => img.naturalWidth)).toBe(64)
  const bytes = await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch('http://launcher/icons/logoDark')).arrayBuffer())))
  expect(createHash('sha256').update(Buffer.from(bytes)).digest('hex')).toBe(createHash('sha256').update(await readFile('../branding/copper/app-256.png')).digest('hex'))
  const win = await launcher.app.browserWindow(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const appearance of ['dark', 'light']) {
    await page.getByTestId('nav-settings').click()
    await page.getByLabel('Apariencia', { exact: true }).selectOption(appearance)
    await page.getByTestId('nav-home').click()
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await expect(brand).toBeInViewport({ ratio: 1 })
      expect(await brand.evaluate(element => { const img = element.querySelector('img')!.getBoundingClientRect(); const rail = element.closest('aside')!.getBoundingClientRect(); return img.left >= rail.left && img.right <= rail.right })).toBe(true)
      await snap(launcher, `grimo-${appearance}-${width}`, 'Marca e icono adaptados a cobre desde los originales del usuario; navegación y tamaños existentes conservados.')
    }
  }
  const path = await page.evaluate(() => localStorage.getItem('selectedInstancePath'))
  await page.reload()
  await expect(page.locator('.sidebar-instance button')).toHaveAttribute('title', 'Grimo preserved QA')
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(path)
  expect(await readFile(join(launcher.appDataPath, 'LauncherMC', 'root'), 'utf8')).toBe(launcher.gameDataPath)
  await writeFile(testInfo.outputPath('branding.json'), JSON.stringify({ ...native, iconMatchesSource: true, errors }, null, 2))
  expect(errors).toEqual([])
})

test.describe('onboarding wordmarks', () => {
  test.use({ launcherOptions: { bootstrap: true, locale: 'es-ES' } })
  test('uses the horizontal version for each appearance and reserves controls at minimum height', async ({ launcher }) => {
    const page = launcher.main
    await expect(page.getByTestId('setup-root')).toBeVisible()
    const win = await launcher.app.browserWindow(page)
    for (const appearance of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: appearance, reducedMotion: 'reduce' })
      await expect(page.locator('html')).toHaveAttribute('data-theme', appearance)
      await win.evaluate(win => win.setContentSize(1200, 720))
      const wordmark = page.locator(`.setup-brand .brand-wordmark-${appearance}`)
      await expect(wordmark).toBeVisible()
      await expect.poll(() => wordmark.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
      await expect(page.locator(`.setup-brand .brand-wordmark-${appearance === 'dark' ? 'light' : 'dark'}`)).toBeHidden()
      await snap(launcher, `grimo-setup-${appearance}-1200`, 'Logo horizontal adaptado al tema sin sustituir controles ni modificar datos.')
      await win.evaluate(win => win.setContentSize(800, 400))
      await expect(page.locator('.setup-brand')).toBeHidden()
      await expect(page.getByTestId('setup-next')).toBeInViewport({ ratio: 1 })
      await snap(launcher, `grimo-setup-${appearance}-800`, 'En altura mínima se conserva el icono en la barra y se reserva espacio para la configuración.')
    }
  })
})
