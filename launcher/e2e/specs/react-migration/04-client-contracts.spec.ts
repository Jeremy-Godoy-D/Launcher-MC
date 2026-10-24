import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, snap } from '../../helpers/scratch'

test.use({ launcherOptions: { seed: { name: 'Renderer Client baseline QA', minecraft: '1.20.4' }, locale: 'es-ES' } })

test('React development Strict Mode shares native state, applies live mutations once and releases all consumers', async ({ launcher }, testInfo) => {
  await expect(launcher.main.getByTestId('app-sidebar')).toBeVisible()
  const preload = resolve(dirname(fileURLToPath(import.meta.url)), '../../../xmcl-electron-app/dist/index-preload.js')
  const opening = launcher.app.waitForEvent('window')
  await launcher.app.evaluate(async ({ BrowserWindow }, preload) => {
    const win = new BrowserWindow({ width: 1200, height: 720, minWidth: 800, minHeight: 400, webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false } })
    await win.loadURL('http://localhost:3001/client-harness.html')
    win.focus()
  }, preload)
  const page = await opening
  expect(await page.evaluate(() => typeof window.serviceChannels?.open)).toBe('function')
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const stats = () => page.evaluate(() => (window as any).readClientHarness())
  for (const index of [0, 1]) await expect(page.getByTestId(`state-reader-${index}`)).toHaveAttribute('data-count', '1')
  await expect.poll(async () => (await stats()).reads).toBe(1)
  await expect.poll(async () => (await stats()).subscriptions).toBe(1)
  expect((await stats()).effects).toBeGreaterThanOrEqual(4)
  expect((await stats()).sameSnapshot).toBe(true)
  await expect.poll(async () => (await stats()).taskListeners).toBe(1)
  await expect.poll(async () => (await stats()).taskPolls).toBeGreaterThanOrEqual(1)
  expect((await stats()).maxTaskPolls).toBe(1)
  await page.getByRole('button', { name: 'Añadir vista alternativa' }).click()
  await expect(page.getByTestId('state-reader-2')).toHaveAttribute('data-count', '1')
  expect((await stats()).reads).toBe(2)
  expect((await stats()).subscriptions).toBe(1)
  await page.getByRole('button', { name: 'Crear instancia de prueba' }).click()
  for (const index of [0, 1, 2]) {
    await expect(page.getByTestId(`state-reader-${index}`)).toHaveAttribute('data-count', '2')
    await expect(page.getByTestId(`state-reader-${index}`)).toContainText('Renderer Client QA')
  }
  expect((await stats()).sameSnapshot).toBe(true)
  expect((await stats()).initialCount).toBe(1)
  await snap({ ...launcher, main: page }, 'client-native-shared-state', 'Harness de contrato: React Strict Mode, estado nativo compartido y snapshot inicial conservado.')
  await page.getByRole('button', { name: 'Desmontar consumidores' }).click()
  await expect.poll(async () => (await stats()).subscriptions).toBe(0)
  await expect.poll(async () => (await stats()).unrefs).toBe(1)
  await expect.poll(async () => (await stats()).taskListeners).toBe(0)
  await expect.poll(async () => (await stats()).taskActivePolls).toBe(0)
  await page.getByRole('button', { name: 'Montar consumidores' }).click()
  for (const index of [0, 1, 2]) await expect(page.getByTestId(`state-reader-${index}`)).toHaveAttribute('data-count', '2')
  expect((await stats()).subscriptions).toBe(1)
  await page.getByRole('button', { name: 'Desmontar consumidores' }).click()
  await expect.poll(async () => (await stats()).subscriptions).toBe(0)
  await expect.poll(async () => (await stats()).unrefs).toBe(2)
  await expect.poll(async () => (await stats()).taskListeners).toBe(0)
  expect((await stats()).maxTaskPolls).toBe(1)
  expect(errors).toEqual([])
  await writeFile(testInfo.outputPath('client-contracts.json'), JSON.stringify({ ...await stats(), errors }, null, 2), 'utf8')
  await page.close()
})
