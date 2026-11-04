import { readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { test, expect } from '../../helpers/scratch'
import { addLaunchProfile } from '../../helpers/react-launch'

const supported = ['Vanilla', 'Fabric', 'Forge', 'NeoForge', 'Quilt', 'OptiFine', 'LabyMod']
const requested = process.env.XMCL_E2E_REAL_GAME
const loaders = requested === 'all' ? supported : supported.filter(loader => (requested === '1' ? ['Vanilla'] : requested?.split(','))?.includes(loader))
test.skip(!loaders.length, 'Opt-in test downloads and launches Minecraft in an isolated profile')
test.use({ launcherOptions: { locale: 'es-ES', launchGame: true, recordVideo: false } })

test('real Minecraft installations launch with compatible Java', async ({ launcher }, info) => {
  test.setTimeout((20 + 6 * (loaders.length - 1)) * 60_000)
  const page = launcher.main
  const processes = () => page.evaluate(async () => {
    const result = await (window as any).serviceChannels.open('LaunchService').call('getGameProcesses')
    return result.map(({ pid, launchId, ready, options }: { pid: number; launchId: string; ready: boolean; options: { java: string; version: string; gameDirectory: string } }) => ({ pid, launchId, ready, java: options.java, version: options.version, path: options.gameDirectory })) as { pid: number; launchId: string; ready: boolean; java: string; version: string; path: string }[]
  })
  await addLaunchProfile(launcher)
  for (const loader of loaders) await test.step(`Install and launch ${loader}`, async () => {
    let path: string | null = null
    const name = `Live ${loader} QA`
    try {
      await page.getByTestId('nav-library').click()
      await page.getByTestId('library-create-instance').click()
      const dialog = page.getByRole('dialog')
      await page.getByTestId('instance-name').fill(name)
      const minecraft = page.getByTestId('instance-minecraft')
      await minecraft.selectOption({ label: '1.21.1' }, { timeout: 60_000 })
      if (loader !== 'Vanilla') {
        await page.getByLabel('Loader', { exact: true }).selectOption(loader)
        await page.getByLabel('Versión del loader', { exact: true }).selectOption({ index: 1 }, { timeout: 60_000 })
      }
      await page.getByTestId('instance-create-confirm').click()
      await dialog.getByRole('button', { name: 'Ver instancia', exact: true }).click()
      path = await page.evaluate(() => localStorage.getItem('selectedInstancePath'))
      const within = relative(launcher.gameDataPath, path ?? '')
      expect(path && !isAbsolute(within) && !within.startsWith('..')).toBe(true)
      const workspace = page.getByTestId('instance-workspace')
      await expect(workspace.getByRole('heading', { level: 1 })).toHaveText(name)
      await workspace.getByRole('button', { name: 'Jugar', exact: true }).click()
      expect(await processes()).toEqual([])
      await page.getByTestId('launch-confirm').click()
      await expect.poll(async () => {
        if (await dialog.getByRole('alert').isVisible()) throw new Error(await dialog.getByRole('alert').innerText())
        return (await processes()).some(game => game.path === path && game.ready)
      }, { timeout: (loader === loaders[0] ? 17 : 5) * 60_000, intervals: [1000, 2000, 5000] }).toBe(true)
      const game = (await processes()).find(game => game.path === path)!
      const minecraftVersion = await page.evaluate(async version => (await (window as any).serviceChannels.open('VersionService').call('resolveLocalVersion', version)).minecraftVersion, game.version)
      expect(minecraftVersion).toBe('1.21.1')
      expect(() => process.kill(game.pid, 0)).not.toThrow()
      const java = await page.evaluate(async javaPath => {
        const { all } = await (window as any).serviceChannels.open('JavaService').call('getJavaState')
        const result = all.find((record: { path: string }) => record.path === javaPath)
        return { majorVersion: result?.majorVersion, valid: result?.valid }
      }, game.java)
      expect(java).toMatchObject({ majorVersion: 21, valid: true })
      const log = await readFile(join(path!, 'logs', 'latest.log'), 'utf8')
      expect(log).toMatch(/1\.21\.1|LWJGL/)
      const managed = relative(join(launcher.gameDataPath, 'jre'), game.java)
      await writeFile(info.outputPath(`real-${loader.toLowerCase()}.json`), JSON.stringify({ loader, minecraftVersion, versionId: game.version, pid: game.pid, ready: game.ready, javaMajor: java.majorVersion, managedJava: !!managed && !isAbsolute(managed) && !managed.startsWith('..'), gameLogBytes: Buffer.byteLength(log) }, null, 2))
    } finally {
      for (const game of await processes().catch(() => [])) if (game.path === path) {
        await page.evaluate(({ pid, launchId }) => (window as any).serviceChannels.open('LaunchService').call('kill', pid, true, launchId), game)
      }
      await expect.poll(async () => (await processes()).filter(game => game.path === path)).toEqual([])
      await page.keyboard.press('Escape')
    }
  })
})
