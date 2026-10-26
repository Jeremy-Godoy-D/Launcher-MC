import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'

test.use({ launcherOptions: { locale: 'es-ES' } })
async function history(page: Page) {
  const paths = await seedReactLibrary(page)
  // Synthetic history through the real metadata service, not evidence of a game session.
  await page.evaluate(async paths => {
    const service = (window as any).serviceChannels.open('InstanceService')
    for (const [index, lastPlayedDate, lastAccessDate] of [[0, 100, 9000], [1, 300, 100], [2, 200, 100]])
      await service.call('editInstance', { instancePath: paths[index], lastPlayedDate, lastAccessDate })
    localStorage.setItem('selectedInstancePath', paths[2])
  }, paths)
  await page.reload()
  return paths
}

test('Home starts at the saved selection, follows last played and retains identity through reorder/deletion', async ({ launcher }) => {
  const page = launcher.main, paths = await history(page)
  const before = await Promise.all(paths.map(path => readFile(join(path, 'instance.json'), 'utf8')))
  await expect(page.locator('.featured h2')).toHaveText('Bajo la superficie')
  await expect(page.locator('.carousel-footer > span')).toHaveText(/^01\s*\/\s*03$/)
  await page.getByRole('button', { name: 'Siguiente instancia', exact: true }).click()
  await expect(page.locator('.featured h2')).toHaveText('Fabric QA')
  await expect(page.locator('.sidebar-instance strong')).toHaveText('Bajo la superficie')
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(paths[2])
  expect(await Promise.all(paths.map(path => readFile(join(path, 'instance.json'), 'utf8')))).toEqual(before)
  for (const lastPlayedDate of [1000, 100]) {
    await page.evaluate(async ({ path, lastPlayedDate }) => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, lastPlayedDate }), { path: paths[0], lastPlayedDate })
    await expect(page.locator('.featured h2')).toHaveText('Fabric QA')
  }
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: 'Opciones de Fabric QA', exact: true }).click()
  await page.getByRole('button', { name: 'Retirar o eliminar', exact: true }).click()
  await page.getByTestId('instance-operation-confirm').click()
  await expect(page.getByTestId('instance-operations')).toHaveCount(0)
  await page.getByTestId('nav-home').click()
  await expect(page.locator('.featured h2')).toHaveText('Mi mundo')
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(paths[2])
  await page.locator('.featured').getByRole('button', { name: 'Administrar', exact: true }).click()
  await expect(page.locator('.instance-page h1')).toHaveText('Mi mundo')
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(paths[0])
})

test('library last-played, name and manual orders remain independent and the chosen sort persists', async ({ launcher }) => {
  const page = launcher.main, paths = await history(page)
  await page.getByTestId('nav-library').click()
  const sort = page.getByLabel('Ordenar instancias', { exact: true }), names = page.locator('.instance-card h3')
  await sort.selectOption('recent'); await expect(names).toHaveText(['Fabric QA', 'Bajo la superficie', 'Mi mundo'])
  await sort.selectOption('name'); await expect(names).toHaveText(['Bajo la superficie', 'Fabric QA', 'Mi mundo'])
  await sort.selectOption('manual'); await expect(names).toHaveText(['Mi mundo', 'Fabric QA', 'Bajo la superficie'])
  await sort.selectOption('recent'); await page.reload(); await page.getByTestId('nav-library').click()
  await expect(sort).toHaveValue('recent'); await expect(names).toHaveText(['Fabric QA', 'Bajo la superficie', 'Mi mundo'])
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(paths[2])
})

test('no saved selection chooses last played, while an invalid saved path is retained until explicit choice', async ({ launcher }) => {
  const page = launcher.main, paths = await history(page)
  await page.evaluate(() => localStorage.removeItem('selectedInstancePath')); await page.reload()
  await expect(page.locator('.featured h2')).toHaveText('Fabric QA')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(paths[1])
  await page.evaluate(() => localStorage.setItem('selectedInstancePath', 'missing-saved-instance')); await page.reload()
  await expect(page.locator('.featured h2')).toHaveText('Fabric QA')
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe('missing-saved-instance')
  expect(await page.evaluate(async () => (window as any).serviceChannels.open('LaunchService').call('getGameProcesses'))).toEqual([])
})
