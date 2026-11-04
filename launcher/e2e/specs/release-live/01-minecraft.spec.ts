import { readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { test, expect } from '../../helpers/scratch'
import { addLaunchProfile } from '../../helpers/react-launch'

test.skip(process.env.XMCL_E2E_REAL_GAME !== '1', 'Opt-in test downloads and launches Minecraft in an isolated profile')
test.use({ launcherOptions: { locale: 'es-ES', launchGame: true, recordVideo: false } })

test('real Vanilla installation launches Minecraft with compatible Java', async ({ launcher }, info) => {
  test.setTimeout(20 * 60_000)
  const page = launcher.main
  const processes = () => page.evaluate(async () => {
    const result = await (window as any).serviceChannels.open('LaunchService').call('getGameProcesses')
    return result.map(({ pid, launchId, ready, options }: { pid: number; launchId: string; ready: boolean; options: { java: string; version: string; gameDirectory: string } }) => ({ pid, launchId, ready, java: options.java, version: options.version, path: options.gameDirectory })) as { pid: number; launchId: string; ready: boolean; java: string; version: string; path: string }[]
  })
  let path: string | null = null
  try {
    await addLaunchProfile(launcher)
    await page.getByTestId('nav-library').click()
    await page.getByTestId('library-create-instance').click()
    const dialog = page.getByRole('dialog')
    await page.getByTestId('instance-name').fill('Live Vanilla QA')
    const minecraft = page.getByTestId('instance-minecraft')
    await expect(minecraft.locator('option[value="1.21.1"]')).toHaveCount(1, { timeout: 60_000 })
    await minecraft.selectOption('1.21.1')
    await page.getByTestId('instance-create-confirm').click()
    await dialog.getByRole('button', { name: 'Ver instancia', exact: true }).click()
    path = await page.evaluate(() => localStorage.getItem('selectedInstancePath'))
    const within = relative(launcher.gameDataPath, path ?? '')
    expect(path && !isAbsolute(within) && !within.startsWith('..')).toBe(true)
    await page.getByTestId('nav-home').click()
    await expect(page.locator('.featured h2')).toHaveText('Live Vanilla QA')
    await page.getByTestId('featured-play').click()
    expect(await processes()).toEqual([])
    await page.getByTestId('launch-confirm').click()
    await expect.poll(async () => {
      if (await dialog.getByRole('alert').isVisible()) throw new Error(await dialog.getByRole('alert').innerText())
      return (await processes()).some(game => game.path === path && game.ready)
    }, { timeout: 17 * 60_000, intervals: [1000, 2000, 5000] }).toBe(true)
    const game = (await processes()).find(game => game.path === path)!
    expect(game.version).toBe('1.21.1')
    expect(() => process.kill(game.pid, 0)).not.toThrow()
    const java = await page.evaluate(async javaPath => {
      const result = await (window as any).serviceChannels.open('JavaService').call('resolveJava', javaPath)
      return { majorVersion: result?.majorVersion, valid: result?.valid }
    }, game.java)
    expect(java).toMatchObject({ majorVersion: 21, valid: true })
    const log = await readFile(join(path!, 'logs', 'latest.log'), 'utf8')
    expect(log).toMatch(/1\.21\.1|LWJGL/)
    const managed = relative(join(launcher.gameDataPath, 'jre'), game.java)
    await writeFile(info.outputPath('real-vanilla.json'), JSON.stringify({ minecraft: game.version, pid: game.pid, ready: game.ready, javaMajor: java.majorVersion, managedJava: !!managed && !isAbsolute(managed) && !managed.startsWith('..'), gameLogBytes: Buffer.byteLength(log) }, null, 2))
  } finally {
    for (const game of await processes().catch(() => [])) if (game.path === path) {
      await page.evaluate(({ pid, launchId }) => (window as any).serviceChannels.open('LaunchService').call('kill', pid, true, launchId), game)
    }
    await expect.poll(async () => (await processes()).filter(game => game.path === path)).toEqual([])
  }
})
