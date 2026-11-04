import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test as base, expect } from '../../helpers/scratch'
import { mockCatalogContent } from '../../helpers/react-catalog-content'
import { seedReactLibrary } from '../../helpers/react-library'
import { activateLauncherControl } from '../../helpers/focus-launcher'

const test = base.extend<{ catalog: Awaited<ReturnType<typeof mockCatalogContent>> }>({
  catalog: async ({ launcher }, use, info) => {
    const fixture = await mockCatalogContent(launcher, 'mod', true), errors: string[] = []
    launcher.main.on('pageerror', error => errors.push(error.message))
    try { await use(fixture) } finally {
      await writeFile(info.outputPath('requirement-http.json'), JSON.stringify({ requests: fixture.state.requests, content: fixture.content, errors }, null, 2))
      await fixture.close(); expect(errors).toEqual([])
    }
  },
})
test.use({ launcherOptions: { locale: 'es-ES' } })

for (const provider of ['modrinth', 'curseforge']) test(`React guides and verifies a ${provider} requirement in another content folder without a navigation loop`, async ({ launcher, catalog }) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  await page.getByTestId('nav-store').click(); await page.getByRole('button', { name: 'Filtros', exact: true }).click()
  await page.getByTestId(`catalog-source-${provider}`).click(); await page.getByTestId('catalog-kind').selectOption('mod')
  const rootId = provider === 'modrinth' ? 'AAAA0001' : '1', rootVersion = provider === 'modrinth' ? 'VVVV0001' : '101'
  await expect(page.locator('.project-card')).toHaveAttribute('data-project-id', rootId)
  await activateLauncherControl(launcher, page.locator('.project-card').getByRole('button', { name: 'Ver contenido', exact: true }))
  let sheet = page.getByTestId('catalog-project')
  await sheet.getByRole('button', { name: 'Versiones', exact: true }).click(); await sheet.locator('#catalog-target').selectOption(paths[1])
  await sheet.locator(`[data-version-id="${rootVersion}"]`).getByTestId('catalog-review-version').click()
  await expect(page.getByTestId('catalog-install-error')).toContainText('contenido de otro tipo')
  expect(catalog.content.transfers).toEqual([])
  await page.getByTestId('catalog-required-project').click()
  sheet = page.getByTestId('catalog-project')
  await sheet.getByRole('button', { name: 'Versiones', exact: true }).click()
  await expect(sheet.locator('#catalog-target')).toHaveValue(paths[1])
  const requirementVersion = provider === 'modrinth' ? 'DEPV0001' : '201'
  await sheet.locator(`[data-version-id="${requirementVersion}"]`).getByTestId('catalog-review-version').click()
  await expect(page.getByTestId('catalog-install-confirm')).toBeEnabled()
  await page.getByTestId('catalog-install-confirm').click(); await expect(page.getByTestId('catalog-install-complete')).toBeVisible()
  expect(await readFile(join(paths[1], 'resourcepacks/dependency.zip'))).toEqual(catalog.assets.find(asset => asset.key === 'dependency')!.bytes)
  expect(await readdir(join(paths[1], 'mods'))).toEqual([])
  await page.goBack()
  sheet = page.getByTestId('catalog-project')
  await sheet.getByRole('button', { name: 'Versiones', exact: true }).click()
  await expect(sheet.locator('#catalog-target')).toHaveValue(paths[1])
  await sheet.locator(`[data-version-id="${rootVersion}"]`).getByTestId('catalog-review-version').click()
  await expect(page.getByTestId('catalog-install-confirm')).toBeEnabled()
  await expect(page.getByTestId('catalog-required-project')).toHaveCount(0)
  await expect(page.getByTestId('catalog-install-changes').locator('li')).toHaveCount(1)
  await page.getByTestId('catalog-install-confirm').click(); await expect(page.getByTestId('catalog-install-complete')).toBeVisible()
  expect(await readdir(join(paths[1], 'mods'))).toEqual(['root1.jar'])
  expect(await readFile(join(paths[1], 'mods/root1.jar'))).toEqual(catalog.assets.find(asset => asset.key === 'root1')!.bytes)
})
