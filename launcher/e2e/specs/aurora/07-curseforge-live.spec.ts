import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, snap } from '../../helpers/scratch'

test.skip(process.env.XMCL_LIVE_CURSEFORGE !== '1', 'Requires the deployed catalog proxy and real CDN downloads')
test.use({ launcherOptions: { seed: { name: 'Aurora CurseForge QA', minecraft: '1.20.4' }, locale: 'es-ES' } })

test('CurseForge search, detail and verified mod installation work through the live proxy', async ({ launcher, shell }, testInfo) => {
  const errors: string[] = []
  launcher.main.on('pageerror', error => errors.push(error.message))
  await shell.waitReady()
  await shell.dismissTutorial()
  const instancesRoot = join(launcher.gameDataPath, 'instances')
  const folders = await readdir(instancesRoot)
  expect(folders).toHaveLength(1)
  const instancePath = join(instancesRoot, folders[0])
  await launcher.main.evaluate(async instancePath => {
    await (window as any).serviceChannels.open('InstanceService').call('editInstance', {
      instancePath, runtime: { minecraft: '1.20.4', fabricLoader: '0.15.11' },
    })
  }, instancePath)
  await shell.goto('/instance/mods?keyword=appleskin&id=curseforge:248787&source=remote&modrinthActive=false&modLoader=fabric')
  const install = launcher.main.getByTestId('market-detail-install')
  await expect(install).toBeEnabled({ timeout: 30_000 })
  await expect(launcher.main.locator('#left-pane')).toContainText('AppleSkin')
  const win = await launcher.app.browserWindow(launcher.main)
  for (const width of [1200, 800]) {
    await win.evaluate((window, width) => window.setContentSize(width, width === 800 ? 400 : 720), width)
    const detail = launcher.main.locator(width === 800 ? '.v-dialog .mod-detail' : '.aurora-market-detail .mod-detail')
    await expect(detail).toBeVisible()
    await expect(detail.getByTestId('market-detail-install')).toBeEnabled()
    await detail.getByTestId('market-detail-install').scrollIntoViewIfNeeded()
    await snap(launcher, 'live-curseforge-detail-' + width, 'Real CurseForge search and AppleSkin detail before installation.')
  }
  await win.evaluate(window => window.setContentSize(1200, 720))
  const desktopInstall = launcher.main.locator('.aurora-market-detail').getByTestId('market-detail-install')
  await expect(desktopInstall).toBeVisible()
  await desktopInstall.click()
  const file = join(instancePath, 'mods', 'appleskin-fabric-mc1.20.3-2.5.1.jar')
  await expect.poll(async () => createHash('sha1').update(await readFile(file).catch(() => Buffer.alloc(0))).digest('hex'), { timeout: 60_000 }).toBe('d8c8f47cadf0bec89b0539f44e3c67df73d8e048')
  expect((await readFile(file)).length).toBe(1_077_002)
  await launcher.main.reload()
  await shell.waitReady()
  await shell.goto('/instance/mods?source=local')
  await expect(launcher.main.locator('#left-pane')).toContainText('AppleSkin', { timeout: 30_000 })
  expect(await readFile(join(launcher.appDataPath, 'LauncherMC', 'logs', 'main.log'), 'utf8')).not.toContain('Cannot get group state on empty path')
  await snap(launcher, 'live-curseforge-installed', 'The downloaded mod remains installed after reloading the launcher.')
  await testInfo.attach('curseforge-live-install', { body: JSON.stringify({ projectId: 248787, fileId: 4953893, bytes: 1_077_002, sha1: 'd8c8f47cadf0bec89b0539f44e3c67df73d8e048', persistedAfterReload: true }), contentType: 'application/json' })
  expect(errors).toEqual([])
})
