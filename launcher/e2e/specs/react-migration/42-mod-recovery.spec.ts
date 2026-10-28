import { test, expect, snap } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactMod } from '../../helpers/react-content'
import { createHash } from 'node:crypto'
import { createServer, type ServerResponse } from 'node:http'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES' } })
const hash = (bytes: Buffer) => ({ sha1: createHash('sha1').update(bytes).digest('hex') })

test('real recovery UI cancels a held download, reviews edited files, rejects a stale review and preserves backups and another manifest', async ({ launcher }, testInfo) => {
  const page = launcher.main, [, path] = await seedReactLibrary(page), source = join(launcher.gameDataPath, 'recovery-source')
  for (const [root, name, title] of [[path, 'a-old', 'Original A'], [path, 'b-old', 'Original B'], [source, 'a-new', 'New A'], [source, 'b-new', 'New B']]) await makeReactMod(root, name, title)
  const a = await readFile(join(path, 'mods/a-old.jar')), b = await readFile(join(path, 'mods/b-old.jar')), nextA = await readFile(join(source, 'mods/a-new.jar')), nextB = await readFile(join(source, 'mods/b-new.jar'))
  await mkdir(join(path, 'saves/keep'), { recursive: true }); await writeFile(join(path, 'saves/keep/level.dat'), 'KEEP RECOVERY WORLD')
  let mode: 'fail' | 'hold' | 'allow' = 'fail'
  const held = new Set<ServerResponse>()
  const server = createServer((request, response) => {
    if (request.url !== '/b.jar') { response.writeHead(404); response.end(); return }
    if (mode === 'fail') { response.writeHead(503); response.end(); return }
    response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': nextB.length })
    if (request.method === 'HEAD') { response.end(); return }
    if (mode === 'allow') { response.end(nextB); return }
    response.flushHeaders(); held.add(response); response.once('close', () => held.delete(response))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture server')
  try {
    const options = { path, oldFiles: [{ path: 'mods/a-old.jar', hashes: hash(a) }, { path: 'mods/b-old.jar', hashes: hash(b) }], files: [{ path: 'mods/a-new.jar', hashes: hash(nextA), downloads: [pathToFileURL(join(source, 'mods/a-new.jar')).href] }, { path: 'mods/b-new.jar', hashes: hash(nextB), downloads: [`http://127.0.0.1:${address.port}/b.jar`] }] }
    const initial = await page.evaluate(async options => {
      const mods = (window as any).serviceChannels.open('InstanceModsService'), install = (window as any).serviceChannels.open('InstanceInstallService')
      const inventory = await mods.call('getModFilesSnapshot', options.path), changes = await install.call('previewInstanceFiles', options)
      try { await install.call('installInstanceFiles', { ...options, review: { snapshot: inventory.fingerprint, changes: changes.map((change: { file: { path: string }; operation: string }) => ({ path: change.file.path, operation: change.operation })) } }); return false } catch { return true }
    }, options)
    expect(initial).toBe(true); expect(await readFile(join(path, 'mods/a-new.jar'))).toEqual(nextA)
    await page.evaluate(async path => (window as any).serviceChannels.open('InstanceInstallService').call('stageInstanceFiles', { path, oldFiles: [], files: [{ path: 'config/other.txt', hashes: { sha1: 'c'.repeat(40) } }] }), path)
    const otherManifest = await readFile(join(path, '.install-manifest'))
    mode = 'hold'
    await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Fabric QA', exact: true }).click(); await page.getByRole('link', { name: 'Mods', exact: true }).click()
    await page.getByRole('button', { name: 'Buscar actualizaciones', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Actualizar mods', exact: true })
    await dialog.getByRole('button', { name: 'Reanudar esta operación', exact: true }).click()
    await expect.poll(() => held.size).toBeGreaterThan(0)
    await dialog.getByRole('button', { name: 'Detener operación', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Operación detenida', { timeout: 30000 })
    await expect(dialog.getByRole('button', { name: 'Revisar esta operación', exact: true })).toBeEnabled()
    expect(await readFile(join(path, 'mods/a-new.jar'))).toEqual(nextA)
    await makeReactMod(path, 'a-new', 'User edited A')
    const userA = await readFile(join(path, 'mods/a-new.jar'))
    await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, runtime: { minecraft: '1.21.1', fabricLoader: '0.16.1' } }), path)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const win = await launcher.app.browserWindow(page); await win.evaluate(win => win.setContentSize(800, 400))
    await dialog.getByRole('region', { name: 'Versiones, selección y archivos' }).evaluate(element => { element.scrollTop = 0 })
    await expect(dialog.getByRole('button', { name: 'Revisar esta operación', exact: true })).toBeInViewport({ ratio: 1 })
    await expect(dialog.getByRole('button', { name: 'Reanudar esta operación', exact: true })).toBeInViewport({ ratio: 1 })
    await snap(launcher, 'recovery-pending-800', 'Saved operations precede query filters, keeping recovery easy to find in the minimum window.')
    await dialog.getByRole('button', { name: 'Revisar esta operación', exact: true }).click()
    await expect(dialog).toContainText('Cambió la configuración de ejecución')
    await expect(dialog.locator('.mod-update-changes')).toContainText('Respaldar y añadir')
    expect(await readFile(join(path, 'mods/a-new.jar'))).toEqual(userA)
    const region = dialog.getByRole('region', { name: 'Versiones, selección y archivos' })
    await region.focus(); await page.keyboard.press('End')
    await snap(launcher, 'recovery-review-800', 'Real interrupted Native operation; edited file backup and configuration change are reviewed before applying.')
    await makeReactMod(path, 'b-old', 'User edited B after review')
    const userB = await readFile(join(path, 'mods/b-old.jar'))
    await dialog.getByRole('button', { name: 'Aplicar recuperación revisada', exact: true }).click()
    await expect(dialog.getByRole('alert').filter({ hasText: 'Los archivos o la configuración cambiaron' })).toBeVisible()
    expect(await readFile(join(path, 'mods/a-new.jar'))).toEqual(userA); expect(await readFile(join(path, 'mods/b-old.jar'))).toEqual(userB)
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { const key = 'launcher.react.preferences', preferences = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...preferences, appearance: theme })) }, theme)
      await page.reload()
      await page.getByRole('button', { name: 'Buscar actualizaciones', exact: true }).click()
      await dialog.getByRole('button', { name: 'Revisar esta operación', exact: true }).click()
      await expect(dialog.locator('.mod-update-changes')).toContainText('Respaldar y retirar')
      await expect(dialog).toContainText('Cambió la configuración de ejecución')
      for (const size of [[1200, 720], [800, 400]]) {
        await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
        await region.focus(); await page.keyboard.press('End')
        const action = dialog.getByRole('button', { name: 'Aplicar recuperación revisada', exact: true })
        await action.focus(); await expect(action).toBeInViewport({ ratio: 1 })
        expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
        const layout = await dialog.evaluate(element => ({ dialog: element.getBoundingClientRect().toJSON(), title: element.querySelector('h2')!.getBoundingClientRect().toJSON(), scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, overflow: getComputedStyle(element).overflow }))
        await writeFile(testInfo.outputPath(`recovery-layout-before-${theme}-${size[0]}.json`), JSON.stringify(layout, null, 2))
        await expect(dialog.getByRole('heading', { name: 'Actualizar mods', exact: true })).toBeInViewport({ ratio: 1 })
        await page.addScriptTag({ content: axe.source }); const accessibility = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
        await writeFile(testInfo.outputPath(`recovery-axe-${theme}-${size[0]}.json`), JSON.stringify(accessibility, null, 2)); expect(accessibility.violations).toEqual([])
        await writeFile(testInfo.outputPath(`recovery-layout-after-${theme}-${size[0]}.json`), JSON.stringify(await dialog.evaluate(element => ({ dialog: element.getBoundingClientRect().toJSON(), title: element.querySelector('h2')!.getBoundingClientRect().toJSON(), scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight })), null, 2))
        await expect(dialog.getByRole('heading', { name: 'Actualizar mods', exact: true })).toBeInViewport({ ratio: 1 })
        await snap(launcher, `recovery-${theme}-${size[0]}`, 'A new Native review survives reload, keeps backup operations explicit and remains reachable with the keyboard.')
      }
    }
    mode = 'allow'; for (const response of held) if (!response.writableEnded) response.end(nextB)
    await dialog.getByRole('button', { name: 'Aplicar recuperación revisada', exact: true }).click()
    await expect(dialog).toContainText('Actualización completada', { timeout: 30000 })
    expect(await readFile(join(path, 'mods/a-new.jar'))).toEqual(nextA); expect(await readFile(join(path, 'mods/b-new.jar'))).toEqual(nextB)
    await expect(readFile(join(path, 'mods/a-old.jar'))).rejects.toMatchObject({ code: 'ENOENT' }); await expect(readFile(join(path, 'mods/b-old.jar'))).rejects.toMatchObject({ code: 'ENOENT' })
    const backups = await readdir(join(path, '.backups'), { recursive: true }), bytes = await Promise.all(backups.filter(file => file.endsWith('.jar')).map(file => readFile(join(path, '.backups', file))))
    expect(bytes.some(data => data.equals(userA))).toBe(true); expect(bytes.some(data => data.equals(userB))).toBe(true)
    expect(await readFile(join(path, '.install-manifest'))).toEqual(otherManifest); expect(await readFile(join(path, 'saves/keep/level.dat'), 'utf8')).toBe('KEEP RECOVERY WORLD')
    await snap(launcher, 'recovery-complete-800', 'Native re-review completed; user edits survive in backups and the unrelated staged manifest remains unchanged.')
  } finally {
    for (const response of held) response.destroy()
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
