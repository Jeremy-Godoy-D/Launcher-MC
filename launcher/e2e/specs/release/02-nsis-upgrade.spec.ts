import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { _electron, expect, test, type ElectronApplication } from '@playwright/test'
import { AppShell } from '../../helpers/pom/AppShell'
import { seedSandbox } from '../../helpers/sandbox'

const baseline = process.env.XMCL_BETA2_INSTALLER
const run = promisify(execFile)
const hash = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex')
const exists = (file: string) => access(file).then(() => true, () => false)

test.skip(process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || !baseline, 'NSIS validation requires the disposable Windows runner and verified beta.2 installer')

test('NSIS upgrades beta.2 in place and also supports a clean installation', async ({}, info) => {
  test.setTimeout(360_000)
  const root = await mkdtemp(join(await realpath(tmpdir()), 'grimo-nsis-'))
  const program = join(root, 'Launcher QA'), appData = join(root, 'profile'), gameData = join(root, 'gameData')
  const profile = join(appData, 'LauncherMC'), instance = join(gameData, 'instances', 'UpgradeQA')
  const candidateOutput = resolve('../xmcl-electron-app/build/output')
  const version = JSON.parse(await readFile(resolve('../xmcl-electron-app/package.json'), 'utf8')).version
  const candidate = join(candidateOutput, `GrimoLauncher-${version}-win-x64.exe`)
  const candidateHash = await hash(candidate)
  expect(candidateHash).toBe((await readFile(`${candidate}.sha256`, 'utf8')).trim().toLowerCase())
  expect(await hash(baseline!)).toBe('01233e355406b1790d45b091a8dea580841bd8ec9ab258813dce5ee9a28da624')
  const candidateAsar = await hash(join(candidateOutput, 'win-unpacked', 'resources', 'app.asar'))
  const installed = join(program, 'Grimo Launcher.exe')
  const install = (file: string) => run(file, ['/S', `/D=${program}`], { windowsVerbatimArguments: true, windowsHide: true, timeout: 90_000 })
  let app: ElectronApplication | undefined
  async function launch(executablePath: string, profileRoot = appData, dataRoot = gameData) {
    await mkdir(profileRoot, { recursive: true })
    await mkdir(dataRoot, { recursive: true })
    app = await _electron.launch({ executablePath, env: { ...process.env, LAUNCHER_UPDATE_TOKEN: '', GITHUB_TOKEN: '', XMCL_E2E: '1', XMCL_E2E_APP_DATA: profileRoot, XMCL_E2E_GAME_DATA: dataRoot, XMCL_E2E_NO_LAUNCH: '1', XMCL_E2E_LOCALE: 'en', NODE_ENV: 'production' } })
    return app.firstWindow()
  }
  try {
    await install(baseline!)
    const oldExecutable = join(program, (await readdir(program)).find(name => /^(?:Launcher MC|Grimo Launcher)\.exe$/i.test(name))!)
    const previousAsar = await hash(join(program, 'resources', 'app.asar'))
    await mkdir(profile, { recursive: true })
    await writeFile(join(profile, 'root'), gameData)
    await writeFile(join(profile, 'setting.json'), JSON.stringify({ globalMaxMemory: 2718, globalAssignMemory: true }))
    await seedSandbox(gameData, { name: 'UpgradeQA', minecraft: '1.20.4' })
    const world = join(instance, 'saves', 'QA', 'level.dat')
    await mkdir(join(instance, 'saves', 'QA'), { recursive: true })
    await writeFile(world, 'NSIS owned world bytes')
    const worldHash = await hash(world)
    const old = await launch(oldExecutable)
    await old.waitForFunction(() => !!(window as any).serviceChannels)
    expect(await app!.evaluate(({ app }) => app.getVersion())).toBe('0.2.0-beta.2')
    await old.evaluate(async path => {
      const user = (window as any).serviceChannels.open('UserService')
      await user.call('getUserState')
      await user.call('login', { username: 'NsisUpgradeQA', authority: 'x://dev' })
      localStorage.setItem('selectedInstancePath', path)
    }, instance)
    await expect.poll(() => readFile(join(profile, 'user.json'), 'utf8').catch(() => '')).toContain('NsisUpgradeQA')
    await app!.close(); app = undefined

    await install(candidate)
    expect(await hash(join(program, 'resources', 'app.asar'))).toBe(candidateAsar)
    expect(candidateAsar).not.toBe(previousAsar)
    const upgraded = await launch(installed)
    expect(await app!.evaluate(({ app }) => app.getVersion())).toBe(version)
    await expect(upgraded.getByTestId('react-prototype')).toBeVisible()
    await expect(upgraded.locator('.featured h2')).toHaveText('UpgradeQA')
    expect(await upgraded.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(instance)
    await new AppShell(upgraded).goto('/accounts')
    await expect(upgraded.getByText('NsisUpgradeQA', { exact: true }).first()).toBeVisible()
    const settings = await upgraded.evaluate(async () => (await (window as any).serviceChannels.open('BaseService').call('getSettings')).globalMaxMemory)
    expect(settings).toBe(2718)
    expect(await readFile(join(profile, 'root'), 'utf8')).toBe(gameData)
    expect(await hash(world)).toBe(worldHash)
    const shortcuts = await run('powershell.exe', ['-NoProfile', '-Command', `$shell = New-Object -ComObject WScript.Shell; foreach ($folder in @('Desktop', 'Programs')) { $link = Join-Path ([Environment]::GetFolderPath($folder)) 'Grimo Launcher.lnk'; if (-not (Test-Path -LiteralPath $link)) { throw 'Missing launcher shortcut' }; $shell.CreateShortcut($link).TargetPath }`], { windowsHide: true, timeout: 15_000 })
    expect(shortcuts.stdout.trim().split(/\r?\n/).map(path => path.toLowerCase())).toEqual([installed.toLowerCase(), installed.toLowerCase()])
    await app!.close(); app = undefined

    const uninstaller = (await readdir(program)).find(name => /^Uninstall .+\.exe$/i.test(name))
    expect(uninstaller).toBeTruthy()
    await run(join(program, uninstaller!), ['/S'], { windowsHide: true, timeout: 90_000 })
    await expect.poll(() => exists(installed), { timeout: 30_000 }).toBe(false)
    await install(candidate)
    const clean = await launch(installed, join(root, 'clean-profile'), join(root, 'clean-data'))
    expect(await app!.evaluate(({ app }) => app.getVersion())).toBe(version)
    await expect(clean.getByTestId('setup-root')).toBeVisible()
    expect(await hash(join(program, 'resources', 'app.asar'))).toBe(candidateAsar)
    expect(await hash(world)).toBe(worldHash)
    await writeFile(info.outputPath('nsis-validation.json'), JSON.stringify({ version, candidateHash, candidateAsar, previousAsar, worldHash, clean: true, inPlaceUpgrade: true, shortcutsVerified: true }, null, 2))
  } finally {
    await app?.close()
  }
})
