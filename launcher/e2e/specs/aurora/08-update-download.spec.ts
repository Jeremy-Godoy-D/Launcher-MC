import { test, expect, snap } from '../../helpers/scratch'

test.use({ launcherOptions: { seed: true, locale: 'es-ES' } })

test('authenticated update discovery opens the public installer and keeps the dialog actions visible', async ({ launcher, shell }) => {
  const downloadUrl = 'https://github.com/Jeremy-Godoy-D/Launcher-MC/releases/download/v999.0.0/LauncherMC-999.0.0-win-x64.exe'
  await shell.dismissTutorial()
  await launcher.app.evaluate(({ net, shell }, downloadUrl) => {
    process.env.LAUNCHER_UPDATE_TOKEN = 'e2e-not-a-secret'
    ;(globalThis as any).__updateOpened = []
    shell.openExternal = async url => { (globalThis as any).__updateOpened.push(url) }
    const original = net.fetch.bind(net)
    net.fetch = (input: any, init?: any) => String(input).includes('/repos/Jeremy-Godoy-D/Launcher-MC/releases?')
      ? Promise.resolve(new Response(JSON.stringify([{ tag_name: 'v999.0.0', published_at: '2026-10-23T00:00:00Z', body: ('## Notas de versión\n\nContenido de prueba para comprobar el scroll.\n\n').repeat(30), assets: [{ name: 'LauncherMC-999.0.0-win-x64.exe', url: 'https://api.github.com/repos/Jeremy-Godoy-D/Launcher-MC/releases/assets/123', browser_download_url: downloadUrl }] }]))) as any
      : original(input, init)
  }, downloadUrl)
  await shell.goto('/setting')
  await expect.poll(() => launcher.main.evaluate(async () => {
    const base = (window as any).serviceChannels.open('BaseService')
    await base.call('checkUpdate')
    return (await base.call('getSettings')).updateInfo?.files[0]?.url
  })).toBe(downloadUrl)
  const details = launcher.main.getByTestId('settings-update-details')
  await expect(details).toHaveText(/Ver actualización/)
  await details.click()
  const dialog = launcher.main.getByTestId('update-info-dialog')
  const install = launcher.main.getByTestId('update-download-installer')
  const win = await launcher.app.browserWindow(launcher.main)
  for (const width of [1200, 800]) {
    await win.evaluate((window, width) => window.setContentSize(width, width === 800 ? 400 : 720), width)
    await expect(dialog).toBeVisible()
    await expect.poll(() => install.evaluate(button => {
      const rect = button.getBoundingClientRect()
      return rect.top >= 0 && rect.bottom <= innerHeight
    })).toBe(true)
    expect(await launcher.main.getByTestId('update-release-notes').evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true)
    await snap(launcher, 'manual-update-' + width, 'The installer button stays visible while long release notes scroll independently.')
  }
  expect(await launcher.app.evaluate(() => (globalThis as any).__updateOpened)).toEqual([])
  await install.click()
  await expect.poll(() => launcher.app.evaluate(() => (globalThis as any).__updateOpened)).toEqual([downloadUrl])
})
