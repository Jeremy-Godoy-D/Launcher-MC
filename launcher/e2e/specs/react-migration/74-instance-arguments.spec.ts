import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { activateLauncherControl, focusLauncher } from '../../helpers/focus-launcher'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
const vm = ['-Dpath=C:\\Games with spaces\\Java', '-Dquoted="valor literal"', '', '-Dmultiline=first\nsecond'], mc = ['--server', 'host with spaces', '', '"quoted"']
async function fixture(page: Page) {
  const [path] = await seedReactLibrary(page)
  await page.evaluate(({ path, vm, mc }) => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, vmOptions: vm, mcOptions: mc }), { path, vm, mc })
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Ajustes', exact: true }).click()
  return path
}
const disk = async (path: string) => JSON.parse(await readFile(join(path, 'instance.json'), 'utf8'))

test('saving another setting preserves exact argument boundaries, and custom empty lists differ from inheritance', async ({ launcher }) => {
  const page = launcher.main, path = await fixture(page), settings = page.getByTestId('instance-base-setting'), save = settings.getByTestId('setting-save-btn')
  await settings.getByTestId('setting-server-host').fill('example.test')
  await activateLauncherControl(launcher, save)
  await expect(settings.getByRole('status')).toContainText('guardados correctamente')
  expect((await disk(path)).vmOptions).toEqual(vm); expect((await disk(path)).mcOptions).toEqual(mc)
  await page.reload()
  const jvm = settings.getByTestId('setting-vm-options'), minecraft = settings.getByTestId('setting-mc-options')
  await expect(jvm.getByRole('textbox')).toHaveCount(vm.length)
  expect(await jvm.getByRole('textbox').evaluateAll(fields => fields.map(field => (field as HTMLTextAreaElement).value))).toEqual(vm)
  await activateLauncherControl(launcher, jvm.getByRole('button', { name: /Añadir argumento/ }))
  const added = jvm.getByRole('textbox').last(); await expect(added).toBeFocused(); await added.fill('-Dnew=dos palabras')
  await activateLauncherControl(launcher, jvm.getByRole('button', { name: /Subir argumento 5/ })); await expect(jvm.getByRole('textbox').nth(3)).toBeFocused()
  await activateLauncherControl(launcher, jvm.getByRole('button', { name: /Retirar argumento 3/ })); await expect(jvm.getByRole('textbox').nth(2)).toBeFocused()
  await activateLauncherControl(launcher, save)
  await expect.poll(async () => (await disk(path)).vmOptions).toEqual([vm[0], vm[1], '-Dnew=dos palabras', vm[3]])
  await minecraft.getByRole('combobox').selectOption('inherit'); await minecraft.getByRole('combobox').selectOption('custom')
  await expect(minecraft.getByRole('textbox')).toHaveCount(0); await activateLauncherControl(launcher, save)
  await expect.poll(async () => (await disk(path)).mcOptions).toEqual([])
  await jvm.getByRole('combobox').selectOption('inherit'); await activateLauncherControl(launcher, save)
  await expect.poll(async () => Object.hasOwn(await disk(path), 'vmOptions')).toBe(false)
  await page.reload(); await expect(jvm.getByRole('combobox')).toHaveValue('inherit'); await expect(minecraft.getByRole('combobox')).toHaveValue('custom')
  await expect(minecraft).toContainText('no agregará argumentos'); expect((await disk(path)).mcOptions).toEqual([])
})

test('argument lists keep editing and keyboard recovery reachable in both themes and native sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main; await fixture(page); const win = await launcher.app.browserWindow(page), settings = page.getByTestId('instance-base-setting')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme); await page.reload()
    for (const [width, height] of [[1200, 720], [800, 400]]) {
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), [width, height]); await focusLauncher(launcher)
      const jvm = settings.getByTestId('setting-vm-options'), first = jvm.getByRole('textbox').first()
      await first.focus(); await expect(first).toBeFocused(); await expect(first).toBeInViewport({ ratio: 1 })
      await activateLauncherControl(launcher, jvm.getByRole('button', { name: /Añadir argumento/ }))
      const last = jvm.getByRole('textbox').last(); await expect(last).toBeFocused(); await expect(last).toBeInViewport({ ratio: 1 }); await last.fill('-Dlong=C:\\Carpeta con espacios\\' + 'directorio'.repeat(20))
      const remove = jvm.getByRole('button', { name: /Retirar argumento/ }).last(); await remove.focus(); await expect(remove).toBeInViewport({ ratio: 1 }); await remove.press('Enter')
      await expect(jvm.getByRole('textbox').last()).toBeFocused()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.addScriptTag({ content: axe.source }); const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      await writeFile(testInfo.outputPath(`arguments-${theme}-${width}-axe.json`), JSON.stringify(report, null, 2)); expect(report.violations).toEqual([])
      await snap(launcher, `arguments-${theme}-${width}`, 'Argument boundaries, multiline values, empty arguments and keyboard editing remain visible in the native settings page.')
    }
  }
})
