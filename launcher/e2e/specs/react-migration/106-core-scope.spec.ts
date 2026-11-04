import { once } from 'node:events'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { test, expect } from '../../helpers/scratch'
import { seedSandbox } from '../../helpers/sandbox'

const requests: string[] = []
const server = createServer((request, response) => {
  requests.push(request.url ?? '')
  response.writeHead(410).end()
})
const legacyFiles = new Map<string, string>()
const retiredServices = [
  'AgentService', 'BedrockService', 'CollectionService', 'XmclAccountService',
  'PeerServiceKey', 'PresenceService', 'RemoteServerService', 'ServerService',
  'MinecraftFriendsService', 'BlueprintMarketService', 'InstanceBlueprintsService',
  'ThemeService', 'InstanceThemeService',
]

test.beforeAll(async () => {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
})
test.afterAll(async () => {
  if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()))
})

test.use({ launcherOptions: { locale: 'es-ES', seed: { name: 'OwnedJava', minecraft: '1.21.1' }, prepareGameData: async root => {
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Legacy endpoint fixture was not started')
  const origin = `http://127.0.0.1:${address.port}`, profile = join(dirname(root), 'appData', 'LauncherMC')
  await seedSandbox(root, { name: 'OwnedBedrock', minecraft: '1.21.1', edition: 'bedrock' })
  const bedrock = join(root, 'instances', 'OwnedBedrock', 'instance.json')
  legacyFiles.set(bedrock, await readFile(bedrock, 'utf8'))
  for (const [file, content] of [
    [join(profile, 'apps', 'apps.json'), JSON.stringify({ default: `${origin}/legacy-app` })],
    [join(profile, 'theme.json'), JSON.stringify({ settings: { dark: false, enableCustomCss: true, background: `${origin}/legacy-background`, backgroundMusic: [`${origin}/legacy-audio`] } })],
    [join(profile, 'theme.css'), `@import url('${origin}/legacy-style'); body { display: none !important; }`],
    [join(profile, 'theme-media', 'old.mp3'), 'Owned legacy media sentinel'],
  ]) {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, content)
    legacyFiles.set(file, content)
  }
} } })

test('the public React host leaves retired apps, themes and editions inert', async ({ launcher, shell }) => {
  const page = launcher.main
  await expect(page).toHaveURL(/xmcl\.runtime\/index\.html/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByTestId('nav-library').click()
  await expect(page.getByText('OwnedJava', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('OwnedBedrock', { exact: true })).toHaveCount(0)
  await shell.goto('/mods?source=legacy#content')
  await expect(page).toHaveURL(/#\/instance\/mods\?source=legacy#content$/)
  await shell.goto('/store/ftb/123')
  await expect(page).toHaveURL(/#\/me$/)

  const result = await page.evaluate(async keys => {
    const { serviceChannels, appsHost, rendererTelemetry, multiplayerNetworkDiagnostics } = window as any
    const failures = await Promise.all(keys.map(async key => {
      try { await serviceChannels.open(key).call('getState'); return 'registered' } catch (error) { return (error as Error).name }
    }))
    const users = serviceChannels.open('UserService')
    const authorToken = await users.call('hasModrinthToken')
    let authorLogin = 'enabled'
    try { await users.call('loginModrinth', true) } catch (error) { authorLogin = (error as Error).name }
    return { failures, authorToken, authorLogin, retiredBridge: !!(appsHost || rendererTelemetry || multiplayerNetworkDiagnostics) }
  }, retiredServices)
  expect(result).toEqual({ failures: retiredServices.map(() => 'ServiceNotFoundError'), authorToken: false, authorLogin: 'FeatureUnavailableError', retiredBridge: false })
  expect(launcher.app.windows()).toEqual([page])
  expect(requests).toEqual([])
  for (const [file, content] of legacyFiles) expect(await readFile(file, 'utf8'), file).toBe(content)
})
