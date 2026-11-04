import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect } from '../../helpers/scratch'

test.skip(process.env.XMCL_E2E_LIVE_CATALOG !== '1', 'Requires the public providers and the deployed CurseForge proxy')
test.use({ launcherOptions: { seed: { name: 'LiveCatalogQA', minecraft: '1.20.4' }, locale: 'es-ES' } })

test('React searches real providers and verifies a CurseForge mod download', async ({ launcher, shell }, info) => {
  const page = launcher.main, errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const root = join(launcher.gameDataPath, 'instances')
  expect(await readdir(root)).toEqual(['LiveCatalogQA'])
  const path = join(root, 'LiveCatalogQA')
  await page.evaluate(instancePath => (window as any).serviceChannels.open('InstanceService').call('editInstance', {
    instancePath, runtime: { minecraft: '1.20.4', fabricLoader: '0.15.11' },
  }), path)
  await shell.goto('/store?source=modrinth&kind=mod&q=AppleSkin&minecraft=1.20.4&loader=fabric')
  await expect(page.getByTestId('catalog-results').locator('.project-card').filter({ hasText: 'AppleSkin' }).first()).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('catalog-source-curseforge').click()
  const appleSkin = page.getByTestId('catalog-results').locator('.project-card[data-project-id="248787"]')
  await expect(appleSkin).toBeVisible({ timeout: 30_000 })
  await appleSkin.getByRole('button', { name: 'Ver contenido', exact: true }).click()
  const sheet = page.getByTestId('catalog-project')
  await sheet.getByRole('button', { name: 'Versiones', exact: true }).click()
  await sheet.locator('#catalog-target').selectOption(path)
  await sheet.locator('[data-version-id="4953893"]').getByTestId('catalog-review-version').click({ timeout: 30_000 })
  await page.getByTestId('catalog-install-confirm').click()
  await expect(page.getByTestId('catalog-install-complete')).toBeVisible({ timeout: 60_000 })
  const file = join(path, 'mods', 'appleskin-fabric-mc1.20.3-2.5.1.jar')
  const bytes = await readFile(file), sha1 = createHash('sha1').update(bytes).digest('hex')
  expect(sha1).toBe('d8c8f47cadf0bec89b0539f44e3c67df73d8e048')
  expect(bytes.length).toBe(1_077_002)
  await page.reload()
  expect(await readFile(file)).toEqual(bytes)
  expect(errors).toEqual([])
  await writeFile(info.outputPath('live-catalog.json'), JSON.stringify({ modrinthSearch: true, curseforge: { projectId: 248787, fileId: 4953893, bytes: bytes.length, sha1 } }, null, 2))
})
