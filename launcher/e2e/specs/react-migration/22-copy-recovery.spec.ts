import { _electron, type Page } from '@playwright/test'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import axe from 'axe-core'
import { test, expect, snap } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { waitForAppWindow } from '../../fixtures/launcher'

test.use({ launcherOptions: { locale: 'es-ES' } })
async function file(path: string, data: string | Buffer) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, data) }
async function copyPanel(page: Page, name: string, pending = false) {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Opciones de ${name}`, exact: true }).click()
  await page.getByRole('button', { name: pending ? 'Reanudar copia' : 'Duplicar', exact: true }).click()
  return page.getByTestId('instance-copy')
}
test('real copy progress can be cancelled and resumed in the same folder after restarting the packaged launcher', async ({ launcher }, testInfo) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await file(join(paths[0], 'config/qa.txt'), 'copy-sentinel')
  await file(join(paths[0], 'saves/World/level.dat'), 'keep-source-world')
  const chunk = Buffer.alloc(64 * 1024 * 1024, 0x41)
  for (let index = 0; index < 16; index++) await file(join(paths[0], `mods/${index}.jar`), chunk)
  const panel = await copyPanel(page, 'Mi mundo')
  await page.getByTestId('instance-operation-confirm').click()
  await expect(page.getByTestId('copy-cancel')).toBeVisible()
  await expect(page.getByTestId('copy-path')).toBeVisible()
  const partial = (await page.getByTestId('copy-path').textContent())!
  await expect.poll(async () => readFile(join(partial, 'config/qa.txt'), 'utf8').catch(() => ''), { intervals: [10, 25, 50], timeout: 30000 }).toBe('copy-sentinel')
  await page.getByTestId('copy-cancel').click()
  await expect(panel.getByRole('alert')).toContainText('Copia cancelada')
  await expect(page.getByTestId('instance-operation-confirm')).toBeEnabled()
  const job = JSON.parse(await readFile(join(partial, '.copy-job.json'), 'utf8'))
  expect(job.source).toBe(paths[0]); expect(job.files).toHaveLength(18)
  expect(await readFile(join(paths[0], 'saves/World/level.dat'), 'utf8')).toBe('keep-source-world')
  const copyMeta = JSON.parse(await readFile(join(partial, 'instance.json'), 'utf8'))
  const reports: unknown[] = [], win = await launcher.app.browserWindow(page)
  for (const appearance of ['dark', 'light']) {
    await page.keyboard.press('Escape')
    await page.getByTestId('nav-settings').click(); await page.getByLabel('Apariencia', { exact: true }).selectOption(appearance)
    await copyPanel(page, copyMeta.name, true)
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await page.getByTestId('instance-operation-confirm').focus()
      await expect(page.getByTestId('instance-operation-confirm')).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.evaluate(axe.source)
      const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      expect(report.violations).toEqual([]); reports.push({ appearance, width, ...report })
      await snap(launcher, `copy-recovery-${appearance}-${width}`, 'Copia real cancelada: diario persistido, destino conservado y reanudación explícita en la misma instancia.')
    }
  }
  await writeFile(testInfo.outputPath('copy-accessibility.json'), JSON.stringify(reports, null, 2))
  await page.keyboard.press('Escape')
  const before = await stat(join(partial, 'config/qa.txt'))
  const executablePath = await launcher.app.evaluate(() => process.execPath)
  await launcher.app.close()
  const restarted = await _electron.launch({ executablePath, args: [], env: { ...process.env, XMCL_E2E: '1', XMCL_E2E_APP_DATA: launcher.appDataPath, XMCL_E2E_GAME_DATA: launcher.gameDataPath, XMCL_E2E_NO_LAUNCH: '1', XMCL_E2E_LOCALE: 'es-ES', NODE_ENV: 'production' }, timeout: 60000 })
  try {
    const next = await waitForAppWindow(restarted, /\/(index|setup)\.html(\?|#|$)/, 30000)
    await next.getByTestId('nav-library').click()
    await expect(next.getByRole('button', { name: `Revisar copia de ${copyMeta.name}`, exact: true })).toBeVisible()
    await next.getByRole('button', { name: `Revisar copia de ${copyMeta.name}`, exact: true }).click()
    await expect(next.getByTestId('instance-copy')).toContainText('no se crea otra instancia')
    await next.getByTestId('instance-operation-confirm').click()
    try { await expect(next.getByTestId('instance-operations')).toHaveCount(0, { timeout: 60000 }) } catch (error) {
      await writeFile(testInfo.outputPath('resumed-copy-state.txt'), await next.locator('body').innerText())
      await next.screenshot({ path: testInfo.outputPath('resumed-copy-failure.png') })
      throw error
    }
    expect(await next.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(partial)
    expect((await readdir(join(launcher.gameDataPath, 'instances'))).length).toBe(4)
    expect((await stat(join(partial, 'config/qa.txt'))).ino).toBe(before.ino)
    await expect(readFile(join(partial, '.copy-job.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(partial, 'saves/World/level.dat'), 'utf8')).toBe('keep-source-world')
    await file(join(partial, 'saves/World/level.dat'), 'copy-only-world')
    expect(await readFile(join(paths[0], 'saves/World/level.dat'), 'utf8')).toBe('keep-source-world')
    expect(await next.evaluate(async () => (window as any).serviceChannels.open('LaunchService').call('getGameProcesses'))).toEqual([])
  } finally { await restarted.close() }
  expect(errors).toEqual([])
})

test('pending-copy fixtures block privileged launch/export, preserve conflicting bytes and recover without another instance', async ({ launcher }) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  await file(join(paths[0], 'config/qa.txt'), 'pinned-config')
  const partial = await page.evaluate(async () => (window as any).serviceChannels.open('InstanceService').call('createInstance', { name: 'Pending QA', runtime: { minecraft: '1.21.1' } }))
  await file(join(partial, '.copy-job.json'), JSON.stringify({ version: 1, id: randomUUID(), source: paths[0], files: [{ path: 'config/qa.txt', size: 13, sha256: createHash('sha256').update('pinned-config').digest('hex') }] }))
  await file(join(partial, 'config/qa.txt'), 'keep-user-edit')
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('getInstanceCopyState', path), partial)
  const guarded = await page.evaluate(async path => {
    const failures: string[] = []
    for (const [service, method, argument] of [
      ['LaunchService', 'launch', { side: 'client', gameDirectory: path }],
      ['LaunchService', 'generateArguments', { side: 'client', gameDirectory: path }],
      ['ModpackService', 'previewInstanceExport', path],
    ] as const) try { await (window as any).serviceChannels.open(service).call(method, argument); failures.push('unexpected-success') } catch (error: any) { failures.push(error.name) }
    return failures
  }, partial)
  expect(guarded).toEqual(['InstanceCopyIncomplete', 'InstanceCopyIncomplete', 'InstanceCopyIncomplete'])
  const panel = await copyPanel(page, 'Pending QA', true)
  await page.getByTestId('instance-operation-confirm').click()
  await expect(panel.getByRole('alert')).toContainText('otros datos y se ha conservado')
  expect(await readFile(join(partial, 'config/qa.txt'), 'utf8')).toBe('keep-user-edit')
  await file(join(partial, 'config/qa.txt'), 'pinned-config')
  await page.getByTestId('instance-operation-confirm').click()
  await expect(page.getByTestId('instance-operations')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(partial)
  expect((await readdir(join(launcher.gameDataPath, 'instances'))).length).toBe(4)
})

test('a malformed persisted copy stays blocked after reload and does not create or launch another instance', async ({ launcher }) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  await file(join(paths[0], '.copy-job.json'), 'invalid-journal')
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('getInstanceCopyState', path), paths[0])
  await page.reload()
  const panel = await copyPanel(page, 'Mi mundo', true)
  await expect(panel.getByRole('alert')).toContainText('No se puede leer el registro')
  await expect(page.getByTestId('instance-operation-confirm')).toBeDisabled()
  expect((await readdir(join(launcher.gameDataPath, 'instances'))).length).toBe(3)
  expect(await page.evaluate(async () => (window as any).serviceChannels.open('LaunchService').call('getGameProcesses'))).toEqual([])
})
