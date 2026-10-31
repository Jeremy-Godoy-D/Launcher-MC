import type { ProjectVersion } from '../../../packages/modrinth/types'
import { test, expect, snap } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

test.use({ launcherOptions: { locale: 'es-ES' } })
test.skip(process.env.XMCL_REACT_LIVE_PROVIDERS !== '1', 'Explicit opt-in: public provider APIs and downloads, isolated profile, no game process.')

for (const provider of ['modrinthOnly', 'curseforgeOnly']) test(`live ${provider}: query, review and Native download preserve disabled state and unrelated data`, async ({ launcher }, testInfo) => {
  const page = launcher.main, [, path] = await seedReactLibrary(page)
  const response = await fetch('https://api.modrinth.com/v2/version/v6Xx3fbU')
  expect(response.status).toBe(200)
  const version = await response.json() as ProjectVersion, artifact = version.files.find(file => file.primary) || version.files[0]
  expect(version.project_id).toBe('mOgUt4GM'); expect(version.version_number).toBe('11.0.4')
  expect(new URL(artifact.url).origin).toBe('https://cdn.modrinth.com'); expect(artifact.size).toBeLessThan(2 * 1024 * 1024)
  const download = await fetch(artifact.url); expect(download.status).toBe(200)
  const original = Buffer.from(await download.arrayBuffer())
  expect(original.length).toBe(artifact.size); expect(createHash('sha512').update(original).digest('hex')).toBe(artifact.hashes.sha512)
  const oldName = `${artifact.filename}.disabled`, world = join(path, 'saves/keep/level.dat')
  await mkdir(join(path, 'mods'), { recursive: true }); await mkdir(join(path, 'saves/keep'), { recursive: true })
  await writeFile(join(path, 'mods', oldName), original); await writeFile(world, 'KEEP LIVE QA WORLD')
  await page.evaluate(({ path, provider }) => { localStorage.setItem(`modsUpgradePolicy:${path}`, JSON.stringify(provider)); localStorage.setItem(`modsUpgradeIgnoreAlphaBeta:${path}`, 'true') }, { path, provider })
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Fabric QA', exact: true }).click(); await page.getByRole('link', { name: 'Mods', exact: true }).click()
  await expect(page.getByTestId('instance-mods').locator('.content-list li')).toHaveCount(1)
  await page.getByRole('button', { name: 'Buscar actualizaciones', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Actualizar mods', exact: true })
  await dialog.getByRole('button', { name: 'Consultar proveedores', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Revisar archivos', exact: true })).toBeEnabled({ timeout: 60000 })
  await expect(dialog).toContainText('Permanecerá desactivado')
  const publicSource = await page.evaluate(async path => {
    const state = await (window as any).serviceChannels.open('InstanceModsService').call('watch', path)
    return state.files.map((file: { fileName: string; hash: string; metadata: { modrinth?: unknown; curseforge?: unknown } }) => ({ fileName: file.fileName, hash: file.hash, modrinth: file.metadata.modrinth, curseforge: file.metadata.curseforge }))
  }, path)
  await dialog.getByRole('button', { name: 'Revisar archivos', exact: true }).click()
  await expect(dialog).toContainText(`mods/${oldName}`)
  expect(await readFile(join(path, 'mods', oldName))).toEqual(original)
  await snap(launcher, `${provider}-review`, 'Live public provider metadata and a real Native preview before confirmation; no game launched.')
  await dialog.getByRole('button', { name: 'Instalar estos cambios', exact: true }).click()
  await expect(dialog).toContainText('Actualización completada', { timeout: 60000 })
  const names = await readdir(join(path, 'mods')), newName = names.find(name => name !== oldName)
  expect(names).toHaveLength(1); expect(newName).toMatch(/\.jar\.disabled$/); expect(newName).not.toBe(oldName)
  const bytes = await readFile(join(path, 'mods', newName!)), sha1 = createHash('sha1').update(bytes).digest('hex')
  const lookup = await fetch(`https://api.modrinth.com/v2/version_file/${sha1}?algorithm=sha1`); expect(lookup.status).toBe(200)
  const installed = await lookup.json() as ProjectVersion; expect(installed.project_id).toBe('mOgUt4GM'); expect(installed.version_number).not.toBe('11.0.4')
  expect(installed.files.some(file => file.hashes.sha512 === createHash('sha512').update(bytes).digest('hex'))).toBe(true)
  expect(await readFile(world, 'utf8')).toBe('KEEP LIVE QA WORLD')
  expect(await page.evaluate(async path => (window as any).serviceChannels.open('InstanceInstallService').call('getReviewedModInstalls', path), path)).toEqual([])
  await writeFile(testInfo.outputPath('live-provider-result.json'), JSON.stringify({ provider, publicSource, oldName, newName, sha1, versionId: installed.id, versionNumber: installed.version_number, size: bytes.length, gameStarted: false }, null, 2))
  await snap(launcher, `${provider}-complete`, 'Actual Native download and checksum lookup completed in an isolated profile; disabled state and reference world preserved.')
})
