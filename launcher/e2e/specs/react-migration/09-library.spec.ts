import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import axe from 'axe-core'
import { test, expect, snap } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'

test.use({ launcherOptions: { locale: 'es-ES' } })

test('real Java library preserves selection and worlds, follows service mutations and never launches from browsing', async ({ launcher }, testInfo) => {
  const page = launcher.main
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const paths = await seedReactLibrary(page)
  await expect(page.locator('.featured h2')).toHaveText('Mi mundo')
  const world = join(paths[0], 'saves', 'preserved')
  await mkdir(world, { recursive: true })
  await writeFile(join(world, 'level.dat'), 'library-world-preserved', 'utf8')
  await page.evaluate(() => localStorage.setItem('unrelated-library-fixture', 'preserve'))
  await page.getByRole('button', { name: 'Siguiente instancia' }).click()
  await expect(page.locator('.featured h2')).toHaveText('Fabric QA')
  await expect(page.locator('.sidebar-instance strong')).toHaveText('Mi mundo')
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(paths[0])
  await page.getByRole('button', { name: 'Administrar', exact: true }).click()
  await expect(page.locator('h1')).toHaveText('Fabric QA')
  await page.reload()
  await expect(page.locator('h1')).toHaveText('Fabric QA')
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(paths[1])
  await page.getByTestId('nav-home').click()
  await expect(page.locator('.featured h2')).toHaveText('Fabric QA')
  const opening = launcher.app.waitForEvent('window')
  await launcher.app.evaluate(async ({ BrowserWindow, app }) => {
    const win = new BrowserWindow({ width: 800, height: 400, webPreferences: { preload: `${app.getAppPath()}/index-preload.js`, sandbox: true, contextIsolation: true, nodeIntegration: false } })
    await win.loadURL('http://xmcl.runtime/index.html#/me')
  })
  const other = await opening
  await expect(other.locator('.sidebar-instance strong')).toHaveText('Fabric QA')
  await other.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click()
  await expect(page.locator('.sidebar-instance strong')).toHaveText('Mi mundo')
  await expect(page.locator('.featured h2')).toHaveText('Fabric QA')
  await other.getByTestId('nav-library').click()
  await other.getByRole('button', { name: 'Administrar Fabric QA', exact: true }).click()
  await expect(page.locator('.sidebar-instance strong')).toHaveText('Fabric QA')
  await other.close()
  const iconFile = join(paths[1], 'fixture-icon.webp')
  await copyFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../../xmcl-react-ui/src/assets/ambient/vanilla-ocean.webp'), iconFile)
  const ownIcon = 'http://launcher/media?path=' + encodeURIComponent(iconFile)
  await page.evaluate(async ({ path, icon }) => {
    const service = (window as any).serviceChannels.open('InstanceService')
    await service.call('editInstance', { instancePath: path, name: 'Fabric renamed QA', runtime: { minecraft: '1.21.1', fabricLoader: '', neoForged: '21.1.0' }, upstream: { type: 'modrinth-modpack', projectId: 'qa', versionId: 'qa' }, icon })
    await service.call('createInstance', { name: 'Bedrock inert QA', edition: 'bedrock', runtime: { minecraft: '1.21.1' } })
  }, { path: paths[1], icon: ownIcon })
  await expect(page.locator('.featured h2')).toHaveText('Fabric renamed QA')
  await page.getByTestId('nav-library').click()
  await expect(page.locator('.instance-card')).toHaveCount(3)
  await expect(page.getByRole('heading', { name: 'Bedrock inert QA', exact: true })).toHaveCount(0)
  await page.getByLabel('Filtrar por loader').selectOption('NeoForge')
  await expect(page.locator('.instance-card')).toHaveCount(1)
  await expect(page.locator('.instance-card h3')).toHaveText('Fabric renamed QA')
  await expect(page.locator('.instance-identity p')).toHaveText('Minecraft 1.21.1')
  await expect(page.locator('.instance-card .instance-art img')).toHaveAttribute('src', /^http:\/\/launcher\/media\?path=/)
  await expect.poll(() => page.locator('.instance-card .instance-art img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0)
  await page.getByLabel('Filtrar por loader').selectOption('')
  await page.evaluate(axe.source)
  const main = await launcher.app.browserWindow(page)
  const accessibility: unknown[] = []
  for (const appearance of ['dark', 'light']) {
    await page.getByTestId('nav-settings').click()
    await page.getByLabel('Apariencia', { exact: true }).selectOption(appearance)
    await page.getByTestId('nav-library').click()
    for (const width of [1200, 800]) {
      await main.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      expect(result.violations).toEqual([])
      accessibility.push({ appearance, width, ...result })
      await snap(launcher, `library-real-${appearance}-${width}`, 'Instancias reales sintéticas: Java solamente, datos actuales del servicio; sin instalar ni lanzar.')
    }
  }
  await writeFile(testInfo.outputPath('library-accessibility.json'), JSON.stringify(accessibility, null, 2), 'utf8')
  const longName = 'UnaAventuraMuyLarga'.repeat(12)
  await page.evaluate(async ({ path, name }) => {
    await (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, name, description: 'Una descripción extensa sin cortes. '.repeat(12) })
  }, { path: paths[1], name: longName })
  await page.getByTestId('nav-home').click()
  await expect(page.locator('.featured h2')).toHaveText(longName)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Administrar', exact: true }).click()
  await expect(page.locator('h1')).toHaveText(longName)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByTestId('nav-library').click()
  await page.evaluate(async path => { await (window as any).serviceChannels.open('InstanceService').call('deleteInstance', path, false) }, paths[1])
  await expect(page.locator('.instance-card')).toHaveCount(2)
  await expect(page.locator('.sidebar-instance strong')).toHaveText('Sin instancia seleccionada')
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(paths[1])
  await page.evaluate(async paths => {
    for (const path of paths) await (window as any).serviceChannels.open('InstanceService').call('deleteInstance', path, false)
  }, [paths[0], paths[2]])
  await expect(page.getByTestId('library-state')).toContainText('Tu primera aventura empieza aquí')
  await expect(page.locator('.instance-card')).toHaveCount(0)
  await snap(launcher, 'library-empty-800', 'Biblioteca Java vacía: Bedrock se conserva inerte, datos y selección previa no se borran.')
  expect(await readFile(join(dirname(paths[0]), '.' + basename(paths[0]), 'saves', 'preserved', 'level.dat'), 'utf8')).toBe('library-world-preserved')
  expect(await page.evaluate(() => localStorage.getItem('unrelated-library-fixture'))).toBe('preserve')
  expect(await page.evaluate(async () => (window as any).serviceChannels.open('LaunchService').call('getGameProcesses'))).toEqual([])
  expect(errors).toEqual([])
})

test('library loading and IPC failure have an honest empty state and recover without changing saved selection', async ({ launcher }) => {
  const page = launcher.main
  await page.evaluate(() => localStorage.setItem('selectedInstancePath', 'C:\\missing-library-fixture'))
  await launcher.app.evaluate(({ ipcMain }) => {
    // Fault injection in the isolated test process; the shipped bridge remains unchanged.
    const handlers = (ipcMain as any)._invokeHandlers
    const original = handlers.get('service-call')
    ipcMain.removeHandler('service-call')
    ipcMain.handle('service-call', async (event, service, method, ...args) => {
      if (service === 'InstanceService' && method === 'getSharedInstancesState') {
        ipcMain.removeHandler('service-call')
        ipcMain.handle('service-call', original)
        await new Promise(resolve => setTimeout(resolve, 800))
        throw new Error('Fixture library temporarily unavailable')
      }
      return original(event, service, method, ...args)
    })
  })
  await page.reload()
  await expect(page.getByTestId('library-state')).toContainText('Cargando tus instancias')
  await expect(page.getByRole('alert')).toContainText('No se pudo cargar la biblioteca')
  await expect(page.locator('.featured')).toHaveCount(0)
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByTestId('library-state')).toContainText('Tu primera aventura empieza aquí')
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe('C:\\missing-library-fixture')
})
