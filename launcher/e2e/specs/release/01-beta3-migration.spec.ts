import { _electron, test, expect, ElectronApplication } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { seedSandbox } from '../../helpers/sandbox'
import { AppShell } from '../../helpers/pom/AppShell'

test.skip(!process.env.XMCL_BETA3_BINARY, 'Requires the verified published beta.3 portable ZIP')

test('beta.3 offers a manual upgrade and Aurora preserves its account, instance and world', async ({}, testInfo) => {
  const root = await mkdtemp(join(tmpdir(), 'launcher-beta3-migration-'))
  const appData = join(root, 'appData')
  const gameData = join(root, 'gameData')
  const world = join(gameData, 'instances', 'Migration-QA', 'saves', 'QA', 'level.dat')
  let app: ElectronApplication | undefined
  const launch = async (executablePath: string) => {
    app = await _electron.launch({ executablePath, env: { ...process.env, XMCL_E2E: '1', XMCL_E2E_APP_DATA: appData, XMCL_E2E_GAME_DATA: gameData, XMCL_E2E_NO_LAUNCH: '1', XMCL_E2E_LOCALE: 'en', NODE_ENV: 'production' } })
    const page = await app.firstWindow()
    await page.waitForURL(/index\.html/)
    await page.waitForFunction(() => !!(window as any).serviceChannels)
    return page
  }
  try {
    await mkdir(join(appData, 'LauncherMC'), { recursive: true })
    await writeFile(join(appData, 'LauncherMC', 'root'), gameData)
    await seedSandbox(gameData, { name: 'Migration-QA', minecraft: '1.20.4' })
    await mkdir(join(world, '..'), { recursive: true })
    await writeFile(world, 'world preservation sentinel')
    const hash = createHash('sha256').update(await readFile(world)).digest('hex')
    const old = await launch(process.env.XMCL_BETA3_BINARY!)
    expect(await app!.evaluate(({ app }) => app.getVersion())).toBe('0.1.0-beta.3')
    await old.evaluate(() => (window as any).serviceChannels.open('UserService').call('getUserState'))
    await old.evaluate(() => (window as any).serviceChannels.open('UserService').call('login', { username: 'MigrationQA', authority: 'x://dev' }))
    await expect.poll(() => readFile(join(appData, 'LauncherMC', 'user.json'), 'utf8').catch(() => '')).toContain('MigrationQA')
    // Mock only release metadata; the shipped beta.3 updater still chooses the operation.
    await app!.evaluate(({ net }) => {
      const original = net.fetch.bind(net)
      net.fetch = (input: any, init?: any) => String(input).includes('/repos/Jeremy-Godoy-D/Launcher-MC/releases?')
        ? Promise.resolve(new Response(JSON.stringify([{ tag_name: 'v0.2.0-beta.1', prerelease: true, draft: false, assets: [{ name: 'LauncherMC-0.2.0-beta.1-win-x64.exe', browser_download_url: 'https://github.com/Jeremy-Godoy-D/Launcher-MC/releases/download/v0.2.0-beta.1/LauncherMC-0.2.0-beta.1-win-x64.exe' }] }]))) as any
        : original(input, init)
    })
    await expect.poll(() => old.evaluate(async () => {
      const base = (window as any).serviceChannels.open('BaseService')
      await base.call('checkUpdate')
      return (await base.call('getSettings')).updateInfo
    })).toMatchObject({ newUpdate: true, operation: 'manual', name: 'v0.2.0-beta.1' })
    const update = await old.evaluate(async () => (await (window as any).serviceChannels.open('BaseService').call('getSettings')).updateInfo)
    await app!.close()
    app = undefined
    // Full-package replacement: boot the genuine new binary with the same isolated data.
    const upgraded = await launch(resolve('../xmcl-electron-app/build/output/win-unpacked/Launcher MC.exe'))
    expect(await app!.evaluate(({ app }) => app.getVersion())).toBe('0.2.0-beta.1')
    const shell = new AppShell(upgraded)
    await shell.dismissTutorial()
    await shell.goto('/')
    await expect(upgraded.getByTestId('launch-center')).toBeVisible()
    await shell.goto('/me')
    await expect(shell.instanceItems.filter({ hasText: 'Migration-QA' })).toBeVisible()
    await shell.goto('/accounts')
    await expect(upgraded.getByText('MigrationQA', { exact: true }).first()).toBeVisible()
    expect(createHash('sha256').update(await readFile(world)).digest('hex')).toBe(hash)
    await testInfo.attach('beta3-migration', { body: JSON.stringify({ oldVersion: '0.1.0-beta.3', newVersion: '0.2.0-beta.1', operation: update.operation, accountPreserved: true, instancePreserved: true, worldHash: hash, nsisExecuted: false }), contentType: 'application/json' })
  } finally {
    await app?.close()
    if (!resolve(root).startsWith(resolve(tmpdir(), 'launcher-beta3-migration-'))) throw new Error('Unexpected test profile path')
    await rm(root, { recursive: true, force: true })
  }
})
