import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, snap } from '../../helpers/scratch'
import { mockCreationMetadata } from '../../helpers/react-creation'

test.use({ launcherOptions: { bootstrap: true, locale: 'es-ES' } })

for (const [choice, label] of [['create', 'Crear una instancia'], ['import', 'Importar un modpack']] as const) {
  test(`setup confirms the root before opening ${choice} and never starts the game`, async ({ launcher }) => {
    const page = launcher.main
    await expect(page.getByTestId('setup-path')).toHaveValue(launcher.gameDataPath)
    await mockCreationMetadata(launcher)
    await page.getByTestId('setup-next').click()
    await page.getByTestId('setup-next').click()
    const main = await launcher.app.browserWindow(page)
    await main.evaluate(win => win.setContentSize(800, 400))
    await page.getByRole('radio', { name: label, exact: true }).check()
    await expect(page.getByTestId('setup-next')).toBeInViewport({ ratio: 1 })
    await snap(launcher, `setup-next-${choice}-800`, 'Último paso del onboarding: elegir la siguiente acción, sin instalación ni lanzamiento automáticos.')
    await page.getByTestId('setup-next').click()
    await expect(page.getByTestId('setup-root')).toHaveCount(0)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    expect(page.url()).not.toContain('bootstrap')
    expect(await readFile(join(launcher.appDataPath, 'LauncherMC', 'root'), 'utf8')).toBe(launcher.gameDataPath)
    expect(await launcher.app.evaluate(() => (globalThis as any).__creationCalls.length)).toBe(0)
    if (choice === 'create') {
      await page.getByTestId('instance-name').fill('Onboarding creation QA')
      await expect(page.getByTestId('instance-minecraft')).toHaveValue('1.21.1')
      await page.getByTestId('instance-create-confirm').click()
      await dialog.getByRole('button', { name: 'Ver instancia', exact: true }).click()
      await expect(page.locator('h1')).toHaveText('Onboarding creation QA')
      expect(await launcher.app.evaluate(() => (globalThis as any).__creationCalls.length)).toBe(1)
    } else {
      await expect(dialog.getByRole('button', { name: 'Importar modpack', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('instance-create-confirm')).toBeDisabled()
      await page.keyboard.press('Escape')
      await expect(page.locator('h1')).toBeFocused()
    }
    expect(await page.evaluate(async () => (window as any).serviceChannels.open('LaunchService').call('getGameProcesses'))).toEqual([])
  })
}
