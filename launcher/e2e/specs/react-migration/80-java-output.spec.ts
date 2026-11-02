import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { test, expect } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'

const run = promisify(execFile)
async function executable(name: string) {
  const home = process.env.JAVA_HOME_17_X64 || process.env.JAVA_HOME
  return home ? join(home, 'bin', `${name}.exe`) : (await run('where.exe', [`${name}.exe`])).stdout.trim().split(/\r?\n/)[0]
}
test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true, prepareGameData: async root => {
  const classes = join(root, 'fixture-classes'); await mkdir(classes)
  try {
    await run(await executable('javac'), ['--release', '17', '-encoding', 'UTF-8', '-d', classes, fileURLToPath(new URL('../../fixtures/GrimoGameOutput.java', import.meta.url))], { windowsHide: true, timeout: 15000 })
  } catch (failure) {
    const error = failure as Error & { code?: unknown; signal?: unknown; killed?: boolean; stderr?: string }
    throw new Error(`Java fixture compilation failed: ${JSON.stringify({ code: error.code, signal: error.signal, killed: error.killed, stderr: error.stderr?.slice(-4096) })}`, { cause: failure })
  }
} } })

test('packaged Native delivers and archives real Java pipes with Unicode and launch identity', async ({ launcher }, testInfo) => {
  const page = launcher.main, paths = (await seedReactLibrary(page)).slice(0, 2), root = launcher.gameDataPath
  const java = await executable('java'), classes = join(root, 'fixture-classes'), version = 'grimo-output-fixture'
  const directory = join(root, 'versions', version)
  await mkdir(directory, { recursive: true }); await mkdir(join(root, 'assets/indexes'), { recursive: true })
  const require = createRequire(new URL('../../../xmcl-runtime/package.json', import.meta.url)), zip = new (require('yazl').ZipFile)()
  zip.addBuffer(await readFile(join(classes, 'GrimoGameOutput.class')), 'GrimoGameOutput.class')
  const writing = pipeline(zip.outputStream, createWriteStream(join(directory, `${version}.jar`))); zip.end(); await writing
  const jar = await readFile(join(directory, `${version}.jar`)), assets = JSON.stringify({ objects: {} })
  await writeFile(join(root, 'assets/indexes/fixture.json'), assets)
  const sha1 = (data: string | Buffer) => createHash('sha1').update(data).digest('hex')
  await writeFile(join(directory, `${version}.json`), JSON.stringify({ id: version, type: 'release', mainClass: 'GrimoGameOutput', assets: 'fixture', assetIndex: { id: 'fixture', url: 'https://example.invalid/assets', size: Buffer.byteLength(assets), totalSize: 0, sha1: sha1(assets) }, downloads: { client: { url: 'https://example.invalid/client', size: jar.length, sha1: sha1(jar) } }, javaVersion: { component: 'fixture-java', majorVersion: 17 }, libraries: [], arguments: { jvm: ['-cp', '${classpath}'], game: [] } }))
  const user = await page.evaluate(async () => (window as any).serviceChannels.open('UserService').call('login', { username: 'JavaPipe_QA', authority: 'x://dev' }))
  const noLaunch = await launcher.app.evaluate((_electron, expected) => {
    if (process.env.XMCL_E2E !== '1' || process.env.XMCL_E2E_APP_DATA !== expected) throw new Error('Isolated Electron profile required')
    const previous = process.env.XMCL_E2E_NO_LAUNCH
    delete process.env.XMCL_E2E_NO_LAUNCH
    return previous
  }, launcher.appDataPath)
  const pids: number[] = []
  try {
    await page.evaluate(() => {
      const state = window as any, channel = state.serviceChannels.open('LaunchService')
      state.__javaOutputEvents = []; state.__javaOutputChannel = channel; state.__javaOutputHandlers = []
      for (const name of ['minecraft-start', 'minecraft-stdout', 'minecraft-stderr', 'minecraft-exit']) {
        const listener = (event: any) => state.__javaOutputEvents.push({ name, ...event })
        state.__javaOutputHandlers.push([name, listener]); channel.on(name, listener)
      }
    })
    for (const path of paths) pids.push(await page.evaluate(async input => (window as any).__javaOutputChannel.call('launch', input), { gameDirectory: path, version, java, user, side: 'client', minMemory: 32, maxMemory: 128, hideLauncher: false, showLog: false, skipAssetsCheck: true }))
    await expect.poll(() => page.evaluate(() => (window as any).__javaOutputEvents.filter((event: any) => event.name === 'minecraft-exit').length), { timeout: 15000 }).toBe(2)
    const events = await page.evaluate(() => (window as any).__javaOutputEvents) as any[], summary = []
    for (const [index, path] of paths.entries()) {
      const start = events.find(event => event.name === 'minecraft-start' && event.gameDirectory === path)
      expect(start).toMatchObject({ pid: pids[index], side: 'client' })
      const own = events.filter(event => event.launchId === start.launchId), output = own.filter(event => event.sequence !== undefined)
      expect(own[0].name).toBe('minecraft-start'); expect(own.at(-1).name).toBe('minecraft-exit')
      expect(output.map(event => event.sequence)).toEqual(output.map((_, index) => index + 1))
      for (const event of output) expect(event).toMatchObject({ pid: pids[index], gameDirectory: path, side: 'client' })
      const stdout = output.filter(event => event.name === 'minecraft-stdout').map(event => event.stdout).join('')
      expect(stdout).toContain('start\ncafé 漢字 😀\n'); expect(stdout).not.toContain('\ufffd')
      expect(output.filter(event => event.name === 'minecraft-stderr').map(event => event.stderr).join('')).toBe('error café\n')
      expect(own.at(-1)).toMatchObject({ code: 1, errorLog: 'error café\n' })
      const archive = await page.evaluate(async ({ path, id }) => {
        const log = (window as any).serviceChannels.open('InstanceLogService')
        return { record: await log.call('getLaunch', path, id), crash: await log.call('getLaunchEvidence', path, id, 'crash-report.txt'), output: await log.call('getLaunchEvidence', path, id, 'launcher-output.log') }
      }, { path, id: start.launchId })
      expect(archive.record).toMatchObject({ state: 'exited', launchId: start.launchId, evidence: { crashReport: 'available', launcherOutput: 'available' } })
      expect(archive.crash).toBe('fixture crash café 😀\n'); expect(archive.output).toContain('😀')
      expect(await readFile(join(path, 'crash-reports/grimo-output-café-😀.txt'), 'utf8')).toBe(archive.crash)
      summary.push({ launchId: start.launchId, pid: pids[index], events: output.length, stdoutUnits: stdout.length, state: archive.record.state })
    }
    await writeFile(testInfo.outputPath('java-output-summary.json'), JSON.stringify(summary, null, 2), 'utf8')
    if (process.env.LAUNCHER_RENDERER === 'react') {
      await page.getByTestId('nav-library').click()
      await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click()
      await page.getByTestId('instance-workspace').getByLabel('Secciones de la instancia').getByRole('link', { name: 'Consola', exact: true }).click()
      const console = page.getByTestId('instance-console')
      await expect(console.getByTestId('console-entry').filter({ hasText: 'café 漢字 😀' })).toHaveCount(1)
      await expect(console.getByTestId('console-entry').filter({ hasText: 'error café' })).toHaveAttribute('data-level', 'error')
      await expect(console.locator('.console-statusbar')).toContainText('No hay procesos activos')
      await expect(console.getByTestId('console-entries')).not.toContainText(String(pids[1]))
    }
  } finally {
    for (const pid of pids) await page.evaluate(async pid => (window as any).serviceChannels.open('LaunchService').call('kill', pid, true), pid)
    await page.evaluate(() => { const state = window as any; for (const [name, listener] of state.__javaOutputHandlers ?? []) state.__javaOutputChannel.removeListener(name, listener) })
    await launcher.app.evaluate((_electron, previous) => { if (previous === undefined) delete process.env.XMCL_E2E_NO_LAUNCH; else process.env.XMCL_E2E_NO_LAUNCH = previous }, noLaunch)
  }
})
