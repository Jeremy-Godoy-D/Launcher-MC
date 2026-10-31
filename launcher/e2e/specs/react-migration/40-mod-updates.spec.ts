import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactMod } from '../../helpers/react-content'
import type { LauncherFixture } from '../../fixtures/launcher'
import { createHash } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES' } })
async function fixture(launcher: LauncherFixture, mode: 'ready' | 'failed' | 'limited' = 'ready') {
  const page = launcher.main, [, path] = await seedReactLibrary(page)
  await makeReactMod(path, 'alpha', 'Alpha'); await rename(join(path, 'mods/alpha.jar'), join(path, 'mods/alpha.jar.disabled'))
  const original = await readFile(join(path, 'mods/alpha.jar.disabled')), hash = createHash('sha1').update(original).digest('hex')
  await page.evaluate(async path => { const state = await (window as any).serviceChannels.open('InstanceModsService').call('watch', path); await state.revalidate() }, path)
  // Only source metadata and application responses are synthetic. Inventory and preview remain Native.
  await launcher.app.evaluate(({ ipcMain, BrowserWindow }, { hash, mode }) => {
    const original = (ipcMain as any)._invokeHandlers.get('service-call')
    ;(globalThis as any).__upgradeCalls = []
    const decorate = (file: any) => file.hash === hash ? { ...file, metadata: { ...file.metadata, modrinth: { projectId: 'abcdefgh', versionId: 'version1' } } } : file
    for (const win of BrowserWindow.getAllWindows()) {
      const send = win.webContents.send.bind(win.webContents)
      win.webContents.send = ((channel: string, ...args: any[]) => {
        if (channel === 'commit' && args[1] === 'filesUpdates') args[2] = args[2].map(([file, action]: any[]) => [action === 0 && typeof file === 'object' ? decorate(file) : file, action])
        return send(channel, ...args)
      }) as typeof win.webContents.send
    }
    ipcMain.removeHandler('service-call')
    ipcMain.handle('service-call', async (event: unknown, service: string, method: string, ...args: any[]) => {
      if (service === 'InstanceModsService' && method === 'getModSources') return { result: [{ hash, modrinth: { projectId: 'abcdefgh', versionId: 'version1' } }] }
      if (service === 'InstanceModsService' && method === 'refreshMetadata') return { result: undefined }
      if (service === 'InstanceInstallService' && method === 'installInstanceFiles') {
        ;(globalThis as any).__upgradeCalls.push(args[0])
        return mode === 'failed' ? { error: { name: 'ModFilesChangedError' } } : { result: undefined }
      }
      const response = await original(event, service, method, ...args)
      if (service === 'InstanceModsService' && method === 'watch' && response.result?.files) response.result = { ...response.result, files: response.result.files.map(decorate) }
      return response
    })
  }, { hash, mode })
  await page.addInitScript(({ hash, mode }) => {
    const original = window.fetch.bind(window)
    ;(window as any).__providerCalls = []
    window.fetch = async (input, init) => {
      const url = String(input)
      if (!url.startsWith('https://api.modrinth.com/') && !url.startsWith('https://api.curseforge.com/')) return original(input, init)
      ;(window as any).__providerCalls.push({ url, body: init?.body, headers: init?.headers })
      if (mode === 'limited') return new Response('{}', { status: 429, headers: { 'retry-after': '60' } })
      const version = { id: 'version1', project_id: 'abcdefgh', version_type: 'release', game_versions: ['1.21.1'], loaders: ['fabric'], version_number: '1', date_published: '2026-01-01', files: [{ primary: true, filename: 'alpha.jar', hashes: { sha1: hash } }] }
      const result = url.endsWith('/version_files/update') ? { [hash]: { ...version, id: 'version2', version_number: '2.0.0', date_published: '2026-02-01', files: [{ primary: true, filename: 'alpha-new.jar', hashes: { sha1: 'b'.repeat(40) } }] } } : { [hash]: version }
      return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } })
    }
  }, { hash, mode })
  await page.reload()
  return { path, original }
}
async function open(page: Page) {
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Fabric QA', exact: true }).click(); await page.getByRole('link', { name: 'Mods', exact: true }).click()
  await expect(page.getByTestId('instance-mods').locator('.content-list li')).toHaveCount(1)
  const trigger = page.getByRole('button', { name: 'Buscar actualizaciones', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Actualizar mods', exact: true })
  await expect(dialog.getByRole('button', { name: 'Consultar proveedores', exact: true })).toBeEnabled()
  return { dialog, trigger }
}

test('mod updates query public metadata, preserve disabled filenames, review Native operations and require confirmation', async ({ launcher }, testInfo) => {
  const page = launcher.main, { path, original } = await fixture(launcher), { dialog, trigger } = await open(page)
  await dialog.getByRole('button', { name: 'Consultar proveedores', exact: true }).click()
  await expect(dialog).toContainText('2.0.0'); await expect(dialog).toContainText('Permanecerá desactivado')
  expect(await launcher.app.evaluate(() => (globalThis as any).__upgradeCalls)).toEqual([])
  await dialog.getByRole('button', { name: 'Revisar archivos', exact: true }).click()
  await expect(dialog).toContainText('mods/alpha-new.jar.disabled'); await expect(dialog).toContainText('mods/alpha.jar.disabled')
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused()
  expect(await readFile(join(path, 'mods/alpha.jar.disabled'))).toEqual(original)
  await trigger.click(); await expect(dialog).toContainText('mods/alpha-new.jar.disabled')
  await dialog.getByRole('button', { name: 'Instalar estos cambios', exact: true }).click(); await expect(dialog).toContainText('Actualización completada')
  const calls = await launcher.app.evaluate(() => (globalThis as any).__upgradeCalls)
  expect(calls).toHaveLength(1); expect(calls[0].path).toBe(path); expect(calls[0].review.snapshot).toMatch(/^[a-f0-9]{64}$/)
  expect(calls[0].review.changes).toEqual(expect.arrayContaining([{ path: 'mods/alpha-new.jar.disabled', operation: 'add' }, { path: 'mods/alpha.jar.disabled', operation: 'remove' }]))
  const requests = await page.evaluate(() => (window as any).__providerCalls)
  expect(requests).toHaveLength(2); expect(JSON.parse(requests[1].body).version_types).toEqual(['release'])
  expect(requests.every((request: { headers: Record<string, string> }) => !JSON.stringify(request.headers).includes('api-key') && !JSON.stringify(request.headers).includes('Authorization'))).toBe(true)
  await writeFile(testInfo.outputPath('reviewed-request.json'), JSON.stringify({ calls, requests }, null, 2))
})

test('failed confirmation preserves selection and bytes and offers a new review', async ({ launcher }) => {
  const page = launcher.main, { path, original } = await fixture(launcher, 'failed'), { dialog } = await open(page)
  await dialog.getByRole('button', { name: 'Consultar proveedores', exact: true }).click(); await expect(dialog).toContainText('2.0.0')
  await dialog.getByRole('button', { name: 'Revisar archivos', exact: true }).click(); await expect(dialog).toContainText('mods/alpha-new.jar.disabled')
  await dialog.getByRole('button', { name: 'Instalar estos cambios', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('cambiaron'); await expect(dialog.getByRole('button', { name: 'Revisar archivos', exact: true })).toBeEnabled()
  await expect(dialog.locator('.mod-update-list input')).toBeChecked(); expect(await readFile(join(path, 'mods/alpha.jar.disabled'))).toEqual(original)
})

test('rate limits are visible and a retry during Retry-After does not send another request', async ({ launcher }) => {
  const page = launcher.main; await fixture(launcher, 'limited'); const { dialog } = await open(page)
  await dialog.getByRole('button', { name: 'Consultar proveedores', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('Límite de consultas')
  await expect(dialog.getByRole('button', { name: 'Revisar archivos', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Consultar proveedores', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Consultar proveedores', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => (window as any).__providerCalls.length)).toBe(1)
})

test('update selection and review fit both themes and sizes with keyboard and no automated accessibility violations', async ({ launcher }, testInfo) => {
  const page = launcher.main, errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await fixture(launcher); await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme)
    await page.reload(); const { dialog, trigger } = await open(page)
    for (const size of [[1200, 720], [800, 400]]) {
      const win = await launcher.app.browserWindow(page); await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
      await dialog.getByRole('button', { name: 'Consultar proveedores', exact: true }).click(); await expect(dialog).toContainText('2.0.0')
      for (const state of ['selection', 'review']) {
        if (state === 'review') {
          await dialog.getByRole('button', { name: 'Revisar archivos', exact: true }).click()
          await expect(dialog.locator('.mod-update-changes li').first()).toBeInViewport({ ratio: 1 })
          await expect(dialog.locator('.mod-update-changes li').last()).toBeInViewport({ ratio: 1 })
        }
        const action = dialog.getByRole('button', { name: state === 'review' ? 'Instalar estos cambios' : 'Revisar archivos', exact: true })
        await action.focus(); await expect(action).toBeInViewport({ ratio: 1 }); expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
        await page.addScriptTag({ content: axe.source }); const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
        await writeFile(testInfo.outputPath(`updates-axe-${theme}-${size[0]}-${state}.json`), JSON.stringify(result, null, 2)); expect(result.violations).toEqual([])
        await snap(launcher, `updates-${theme}-${size[0]}-${state}`, 'Synthetic provider versions and real Native file preview, with scroll and persistent confirmation actions.')
      }
      await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused(); await trigger.click()
      await dialog.getByRole('button', { name: 'Volver a la selección', exact: true }).click()
    }
    await dialog.getByRole('button', { name: 'Cerrar actualizaciones', exact: true }).last().click()
  }
  expect(errors).toEqual([])
})


async function holdUpdateResponse(page: Page, ignoreAbort = false) {
  await page.evaluate(ignoreAbort => {
    const base = window.fetch.bind(window)
    ;(window as any).__updateWaiting = false
    window.fetch = async (input, init) => {
      if (!String(input).endsWith('/version_files/update')) return base(input, init)
      ;(window as any).__updateWaiting = true
      return new Promise<Response>((resolve, reject) => {
        ;(window as any).__releaseUpdate = () => { void base(input, init).then(resolve, reject) }
        if (!ignoreAbort) init?.signal?.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true })
      })
    }
  }, ignoreAbort)
}

test('a cancelled provider query can be retried without installing or losing the instance', async ({ launcher }) => {
  const page = launcher.main, { path, original } = await fixture(launcher), { dialog } = await open(page)
  await holdUpdateResponse(page)
  await dialog.getByRole('button', { name: 'Consultar proveedores', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__updateWaiting)).toBe(true)
  await dialog.getByRole('button', { name: 'Detener operación', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Consulta detenida')
  await expect(dialog.getByRole('button', { name: 'Revisar archivos', exact: true })).toBeDisabled()
  await page.evaluate(() => { (window as any).__updateWaiting = false })
  await dialog.getByRole('button', { name: 'Consultar proveedores', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__updateWaiting)).toBe(true)
  await page.evaluate(() => { (window as any).__releaseUpdate() })
  await expect(dialog).toContainText('2.0.0'); await expect(dialog.getByRole('button', { name: 'Revisar archivos', exact: true })).toBeEnabled()
  expect(await launcher.app.evaluate(() => (globalThis as any).__upgradeCalls)).toEqual([])
  expect(await readFile(join(path, 'mods/alpha.jar.disabled'))).toEqual(original)
})

test('a late update response from instance A cannot become a selection or action for instance B', async ({ launcher }) => {
  const page = launcher.main, { path: a, original } = await fixture(launcher)
  const b = await page.evaluate(async () => (window as any).serviceChannels.open('InstanceService').call('createInstance', { name: 'Other update QA', runtime: { minecraft: '1.21.1', fabricLoader: '0.16.0' } }))
  await makeReactMod(b, 'beta', 'Beta')
  const originalB = await readFile(join(b, 'mods/beta.jar')), { dialog } = await open(page)
  await holdUpdateResponse(page, true)
  await dialog.getByRole('button', { name: 'Consultar proveedores', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__updateWaiting)).toBe(true)
  await page.evaluate(b => { localStorage.setItem('selectedInstancePath', b); window.dispatchEvent(new StorageEvent('storage', { key: 'selectedInstancePath', newValue: b })) }, b)
  await expect(page.getByTestId('instance-mods')).toHaveAttribute('data-instance-path', b); await expect(dialog).toHaveCount(0)
  await page.evaluate(() => { (window as any).__releaseUpdate() })
  await page.getByRole('button', { name: 'Buscar actualizaciones', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Consultar proveedores', exact: true })).toBeEnabled()
  await expect(dialog.locator('.mod-update-list li')).toHaveCount(0); await expect(dialog.getByRole('button', { name: 'Revisar archivos', exact: true })).toBeDisabled()
  expect(await launcher.app.evaluate(() => (globalThis as any).__upgradeCalls)).toEqual([])
  expect(await readFile(join(a, 'mods/alpha.jar.disabled'))).toEqual(original); expect(await readFile(join(b, 'mods/beta.jar'))).toEqual(originalB)
})
