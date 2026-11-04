import { mkdir, readFile, readdir, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'
import { test, expect, snap } from '../../helpers/scratch'
import { makeReactModpack, mockCreationMetadata } from '../../helpers/react-creation'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'

test.use({ launcherOptions: { locale: 'es-ES' } })

test('HTTPS import requires review, validates URLs and retries a fresh preview before native confirmation', async ({ launcher }) => {
  const page = launcher.main
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const archive = join(launcher.gameDataPath, 'https-fixture.mrpack')
  await makeReactModpack(archive)
  await mockCreationMetadata(launcher)
  await launcher.app.evaluate(({ ipcMain }, archive) => {
    const original = (ipcMain as any)._invokeHandlers.get('service-call')
    ;(globalThis as any).__urlCalls = []
    let failed = false
    ipcMain.removeHandler('service-call')
    ipcMain.handle('service-call', (event, service, method, ...args) => {
      if (service === 'ModpackService' && method === 'openModpack' && args[0].startsWith('https:')) {
        ;(globalThis as any).__urlCalls.push(args[0])
        if (!failed) { failed = true; throw new Error('Fixture network unavailable') }
        return original(event, service, method, archive)
      }
      return original(event, service, method, ...args)
    })
  }, archive)
  await page.getByTestId('nav-library').click()
  await page.getByTestId('library-create-instance').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Importar modpack', exact: true }).click()
  await dialog.getByRole('button', { name: 'Enlace HTTPS', exact: true }).click()
  const input = page.getByLabel('Enlace al archivo del modpack', { exact: true })
  await input.fill('http://example.com/pack.mrpack')
  await dialog.getByRole('button', { name: 'Revisar enlace', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('HTTPS válido')
  expect(await launcher.app.evaluate(() => (globalThis as any).__urlCalls)).toEqual([])
  await input.fill('https://example.com/pack.mrpack?version=2')
  expect(await launcher.app.evaluate(() => (globalThis as any).__urlCalls)).toEqual([])
  await dialog.getByRole('button', { name: 'Revisar enlace', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('No se pudo leer')
  await expect(page.getByTestId('instance-create-confirm')).toBeDisabled()
  await dialog.getByRole('button', { name: 'Revisar enlace', exact: true }).click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Import QA' })).toBeVisible()
  expect(await launcher.app.evaluate(() => (globalThis as any).__creationCalls)).toEqual([])
  await dialog.getByRole('button', { name: 'Revisar enlace', exact: true }).click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Import QA' })).toBeVisible()
  expect(await launcher.app.evaluate(() => (globalThis as any).__urlCalls.length)).toBe(3)
  await snap(launcher, 'https-reviewed', 'Revisión explícita HTTPS y reintento: transporte de descarga sustituido por un archivo local; parser e instalación nativos.')
  await page.getByTestId('instance-create-confirm').click()
  await expect(dialog.getByRole('button', { name: 'Ver instancia', exact: true })).toBeVisible()
  expect(await launcher.app.evaluate(() => (globalThis as any).__creationCalls.length)).toBe(1)
  expect(errors).toEqual([])
})

test('folder import reviews profiles without writing, copies world bytes independently and refuses links', async ({ launcher }) => {
  const page = launcher.main
  await mockCreationMetadata(launcher)
  const source = join(launcher.gameDataPath, 'vanilla-source')
  await mkdir(join(source, 'saves', 'Sentinel'), { recursive: true })
  await writeFile(join(source, 'saves', 'Sentinel', 'level.dat'), 'original-world')
  await writeFile(join(source, 'launcher_accounts.json'), 'private-fixture')
  await writeFile(join(source, 'launcher_profiles.json'), JSON.stringify({ profiles: { one: { name: 'First folder QA', lastVersionId: '1.21.1', javaDir: 'untrusted.exe', javaArgs: '-javaagent:evil.jar' }, two: { name: 'Second folder QA', lastVersionId: '1.20.4' } } }))
  await page.evaluate(() => localStorage.setItem('addInstanceLinkPreferences', JSON.stringify({ version: 1, saves: true, resourcepacks: true, shaderpacks: true, options: true, servers: true })))
  await page.reload()
  await page.getByTestId('nav-library').click()
  await page.getByTestId('library-create-instance').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Importar modpack', exact: true }).click()
  await dialog.getByRole('button', { name: 'Carpeta existente', exact: true }).click()
  await stubOpenDialog(launcher, source)
  await dialog.getByRole('button', { name: 'Elegir carpeta de origen', exact: true }).click()
  await expect(page.getByLabel('Perfil que se importará', { exact: true })).toBeEnabled()
  await page.getByLabel('Perfil que se importará', { exact: true }).selectOption('1')
  await expect(page.getByTestId('instance-create-confirm')).toBeEnabled()
  await expect(page.getByTestId('instance-name')).toHaveValue('Second folder QA')
  await page.keyboard.press('Escape')
  await page.getByTestId('library-create-instance').click()
  await expect(page.getByLabel('Perfil que se importará', { exact: true })).toHaveValue('1')
  await expect(page.getByTestId('instance-create-confirm')).toBeEnabled()
  expect(await launcher.app.evaluate(() => (globalThis as any).__creationCalls)).toEqual([])
  expect(await readFile(join(source, 'saves', 'Sentinel', 'level.dat'), 'utf8')).toBe('original-world')
  await page.getByTestId('instance-name').fill('Folder copy QA')
  await snap(launcher, 'folder-reviewed', 'Dos perfiles Vanilla, origen visible, revisión sin escrituras ni importación de cuentas/Java.')
  await page.getByTestId('instance-create-confirm').click()
  await expect(dialog.getByRole('button', { name: 'Ver instancia', exact: true })).toBeVisible()
  const folders = await readdir(join(launcher.gameDataPath, 'instances'))
  expect(folders).toHaveLength(1)
  const destination = join(launcher.gameDataPath, 'instances', folders[0])
  const saved = JSON.parse(await readFile(join(destination, 'instance.json'), 'utf8'))
  expect(saved.runtime.minecraft).toBe('1.20.4')
  expect(saved.java).not.toBe('untrusted.exe')
  expect(saved.vmOptions ?? []).not.toContain('-javaagent:evil.jar')
  expect(await readdir(destination)).not.toContain('launcher_accounts.json')
  const original = join(source, 'saves', 'Sentinel', 'level.dat'), copied = join(destination, 'saves', 'Sentinel', 'level.dat')
  expect(await readFile(copied, 'utf8')).toBe('original-world')
  expect((await stat(original)).ino).not.toBe((await stat(copied)).ino)
  await writeFile(copied, 'changed-copy')
  expect(await readFile(original, 'utf8')).toBe('original-world')
  await dialog.getByRole('button', { name: 'Ver instancia', exact: true }).click()
  await page.getByTestId('nav-library').click()
  await page.getByTestId('library-create-instance').click()
  await dialog.getByRole('button', { name: 'Importar modpack', exact: true }).click()
  await dialog.getByRole('button', { name: 'Carpeta existente', exact: true }).click()
  await symlink(join(source, 'saves'), join(source, 'linked-worlds'), 'junction')
  await stubOpenDialog(launcher, source)
  await dialog.getByRole('button', { name: 'Elegir carpeta de origen', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('no se admiten enlaces')
  await expect(page.getByTestId('instance-create-confirm')).toBeDisabled()
  expect(await launcher.app.evaluate(() => (globalThis as any).__creationCalls.length)).toBe(1)
})

test('advanced creation preserves legacy link preferences, validates RAM and retries native links without duplicating', async ({ launcher }, testInfo) => {
  const page = launcher.main
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await mockCreationMetadata(launcher)
  await launcher.app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get('service-call')
    const operations = new Set(['InstanceSavesService.linkSharedSave', 'InstanceResourcePacksService.linkShared', 'InstanceShaderPacksService.linkShared', 'InstanceOptionsService.linkGameOptions', 'InstanceServerInfoService.link'])
    ;(globalThis as any).__linkCalls = []
    let failed = false
    ipcMain.removeHandler('service-call')
    ipcMain.handle('service-call', async (event, service, method, ...args) => {
      if (service === 'JavaService' && method === 'getJavaState') {
        const response = await original(event, service, method, ...args)
        response.result.all = [{ path: 'fixture-java-not-spawned', majorVersion: 21, version: '21', valid: true }]
        return response
      }
      const key = `${service}.${method}`
      if (operations.has(key)) {
        ;(globalThis as any).__linkCalls.push({ key, path: args[0] })
        if (key === 'InstanceSavesService.linkSharedSave' && !failed) { failed = true; throw new Error('Fixture link failure') }
      }
      return original(event, service, method, ...args)
    })
  })
  await page.evaluate(() => localStorage.setItem('addInstanceLinkPreferences', JSON.stringify({ version: 1, saves: true, resourcepacks: true, shaderpacks: true, options: true, servers: true })))
  await page.reload()
  await page.getByTestId('nav-library').click()
  await page.getByTestId('library-create-instance').click()
  const dialog = page.getByRole('dialog')
  await page.getByTestId('instance-name').fill('Advanced QA')
  await dialog.locator('summary').click()
  await expect(page.getByLabel('Mundos', { exact: true })).toBeChecked()
  await page.getByLabel('Java', { exact: true }).selectOption('fixture-java-not-spawned')
  await page.getByLabel('Memoria RAM', { exact: true }).selectOption('manual')
  await page.getByLabel('Mínimo en MB (opcional)', { exact: true }).fill('4096')
  await page.getByLabel('Máximo en MB', { exact: true }).fill('1024')
  await page.getByTestId('instance-create-confirm').click()
  await expect(dialog.getByRole('alert')).toContainText('mínimo no puede superar')
  expect(await launcher.app.evaluate(() => (globalThis as any).__creationCalls)).toEqual([])
  await page.getByLabel('Máximo en MB', { exact: true }).fill('6144')
  await page.getByLabel('Descripción', { exact: true }).fill('Advanced fixture')
  await page.getByLabel('Autor', { exact: true }).fill('QA')
  await page.evaluate(axe.source)
  const win = await launcher.app.browserWindow(page)
  const reports: unknown[] = []
  for (const appearance of ['dark', 'light']) {
    await page.keyboard.press('Escape')
    await page.getByTestId('nav-settings').click()
    await page.getByLabel('Apariencia', { exact: true }).selectOption(appearance)
    await page.getByTestId('nav-library').click()
    await page.getByTestId('library-create-instance').click()
    await dialog.locator('summary').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', appearance)
    for (const width of [1200, 800]) {
    await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
    await page.getByTestId('instance-create-confirm').focus()
    await page.getByLabel('Lista de servidores', { exact: true }).focus()
    await expect(page.getByLabel('Lista de servidores', { exact: true })).toBeInViewport({ ratio: 1 })
    await expect(page.getByTestId('instance-create-confirm')).toBeInViewport({ ratio: 1 })
    const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
    expect(report.violations).toEqual([])
    reports.push({ appearance, width, ...report })
    await snap(launcher, `advanced-${appearance}-${width}`, 'Java sintético, RAM y preferencias compartidas: scroll interior y confirmación accesible en el tamaño mínimo.')
    if (width === 1200) {
      await page.getByLabel('Java', { exact: true }).focus()
      await snap(launcher, `advanced-java-${appearance}`, 'Selector Java y memoria conservados al cerrar y reabrir, sin iniciar procesos.')
    }
    }
  }
  await writeFile(testInfo.outputPath('imports-accessibility.json'), JSON.stringify(reports, null, 2))
  await page.getByTestId('instance-create-confirm').click()
  await expect(dialog.getByRole('alert')).toContainText('faltan los siguientes enlaces')
  expect(await launcher.app.evaluate(() => (globalThis as any).__creationCalls.length)).toBe(1)
  await page.getByTestId('instance-create-confirm').click()
  await expect(dialog.getByRole('button', { name: 'Ver instancia', exact: true })).toBeVisible()
  const calls = await launcher.app.evaluate(() => (globalThis as any).__linkCalls)
  expect(calls).toHaveLength(10)
  expect(new Set(calls.map((call: any) => call.path)).size).toBe(1)
  const saved = JSON.parse(await readFile(join(calls[0].path, 'instance.json'), 'utf8'))
  expect(saved).toMatchObject({ java: 'fixture-java-not-spawned', minMemory: 4096, maxMemory: 6144, assignMemory: true, author: 'QA', description: 'Advanced fixture' })
  expect(await readdir(join(calls[0].path, 'saves'))).toEqual([])
  await dialog.getByRole('button', { name: 'Ver instancia', exact: true }).click()
  await page.reload()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('addInstanceLinkPreferences')!))).toMatchObject({ version: 1, saves: true, servers: true })
  expect(await launcher.app.evaluate(() => (globalThis as any).__creationCalls.length)).toBe(1)
  expect(errors).toEqual([])
})

test('standard Prism, Modrinth and CurseForge folders retain their loaders through native review and copy', async ({ launcher }) => {
  const page = launcher.main
  await mockCreationMetadata(launcher)
  const prism = join(launcher.gameDataPath, 'prism-source')
  const modrinth = join(launcher.gameDataPath, 'modrinth-source')
  const curseforge = join(launcher.gameDataPath, 'curseforge-source')
  const mrProfile = join(modrinth, 'profiles', 'qa'), cfProfile = join(curseforge, 'Instances', 'qa')
  for (const dir of [join(prism, '.minecraft'), mrProfile, cfProfile]) { await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'options.txt'), 'original-options') }
  await writeFile(join(prism, 'instance.cfg'), 'name=Prism QA\nJavaPath=untrusted.exe\nJvmArgs=-javaagent:evil.jar')
  await writeFile(join(prism, 'mmc-pack.json'), JSON.stringify({ formatVersion: 1, components: [{ uid: 'net.minecraft', version: '1.21.1' }, { uid: 'net.fabricmc.fabric-loader', version: '0.16.0' }] }))
  await writeFile(join(mrProfile, 'profile.json'), JSON.stringify({ metadata: { name: 'Modrinth QA', game_version: '1.21.1', loader: 'fabric', loader_version: { id: '0.16.0' } } }))
  await writeFile(join(cfProfile, 'minecraftinstance.json'), JSON.stringify({ name: 'CurseForge QA', allocatedMemory: 12345, manifest: { name: 'CF', minecraft: { version: '1.21.1', modLoaders: [{ id: 'forge-52.0.0' }] } } }))
  await page.getByTestId('nav-library').click()
  for (const [type, source, loader, version] of [['prism', prism, 'fabricLoader', '0.16.0'], ['modrinth', modrinth, 'fabricLoader', '0.16.0'], ['curseforge', curseforge, 'forge', '52.0.0']]) {
    await page.getByTestId('library-create-instance').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Importar modpack', exact: true }).click()
    await dialog.getByRole('button', { name: 'Carpeta existente', exact: true }).click()
    await page.getByLabel('Formato de la carpeta', { exact: true }).selectOption(type)
    await stubOpenDialog(launcher, source)
    await dialog.getByRole('button', { name: 'Elegir carpeta de origen', exact: true }).click()
    await expect(page.getByTestId('instance-create-confirm')).toBeEnabled()
    await page.getByTestId('instance-create-confirm').click()
    await expect(dialog.getByRole('button', { name: 'Ver instancia', exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Ver instancia', exact: true }).click()
    const path = await page.evaluate(() => localStorage.getItem('selectedInstancePath'))
    const saved = JSON.parse(await readFile(join(path!, 'instance.json'), 'utf8'))
    expect(saved.runtime[loader]).toBe(version)
    expect(saved.java).not.toBe('untrusted.exe')
    expect(saved.minMemory).not.toBe(12345)
    expect(await readFile(join(path!, 'options.txt'), 'utf8')).toBe('original-options')
    for (const metadata of ['instance.cfg', 'mmc-pack.json', 'profile.json', 'minecraftinstance.json']) expect(await readdir(path!)).not.toContain(metadata)
    await page.getByTestId('nav-library').click()
  }
  expect(await launcher.app.evaluate(() => (globalThis as any).__creationCalls.length)).toBe(3)
})
