import type { ProjectVersion } from '../../../packages/modrinth/types'
import { test, expect, snap } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

test.use({ launcherOptions: { locale: 'es-ES' } })
test.skip(process.env.XMCL_REACT_LIVE_PROVIDERS !== '1', 'Explicit opt-in: public metadata/downloads, isolated profile, no Minecraft process.')
for (const provider of ['modrinthOnly', 'curseforgeOnly']) test(`live ${provider} resource pack update preserves a custom archive name, selection, priority, groups, world and backup`, async ({ launcher }, testInfo) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  const response = await fetch('https://api.modrinth.com/v2/version/1lpmCieT'); expect(response.status).toBe(200)
  const version = await response.json() as ProjectVersion, artifact = version.files.find(file => file.primary) || version.files[0]
  expect(version.project_id).toBe('dspVZXKP'); expect(version.loaders).toContain('minecraft'); expect(version.game_versions).toContain('1.21.1')
  expect(new URL(artifact.url).origin).toBe('https://cdn.modrinth.com'); expect(artifact.size).toBeLessThan(100 * 1024)
  const download = await fetch(artifact.url); expect(download.status).toBe(200)
  const original = Buffer.from(await download.arrayBuffer()); expect(original.length).toBe(artifact.size)
  expect(createHash('sha512').update(original).digest('hex')).toBe(artifact.hashes.sha512)
  const name = 'Grimo QA grass.zip', options = 'resourcePacks:["vanilla","file/Grimo QA grass.zip"]\r\nlang:es_es\r\n', groups = '{"Live":{"color":"#abcdef","files":["Grimo QA grass.zip"]}}'
  await mkdir(join(path, 'resourcepacks'), { recursive: true }); await mkdir(join(path, 'saves/keep'), { recursive: true })
  await writeFile(join(path, 'resourcepacks', name), original); await writeFile(join(path, 'options.txt'), options); await writeFile(join(path, 'resourcepacks-groups.json'), groups); await writeFile(join(path, 'saves/keep/level.dat'), 'KEEP LIVE WORLD')
  await page.evaluate(({ path, provider }) => localStorage.setItem(`resourcepacksUpgradePolicy:${path}`, JSON.stringify(provider)), { path, provider })
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Packs', exact: true }).click()
  const area = page.getByTestId('instance-resourcepacks'); await expect(area.getByRole('button', { name: `Información de ${name}`, exact: true })).toBeVisible()
  await area.getByRole('button', { name: 'Buscar actualizaciones', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Actualizar packs', exact: true })
  await dialog.getByRole('button', { name: 'Consultar proveedores', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Revisar archivos', exact: true })).toBeEnabled({ timeout: 60000 })
  const sources = await page.evaluate(async path => (window as any).serviceChannels.open('InstanceResourcePacksService').call('getPackSources', path), path)
  await dialog.getByRole('button', { name: 'Revisar archivos', exact: true }).click(); await expect(dialog.locator('.mod-update-changes')).toContainText(`resourcepacks/${name}`)
  expect(await readFile(join(path, 'resourcepacks', name))).toEqual(original)
  await snap(launcher, 'live-pack-review', 'Actual public metadata and Native review for a Vanilla resource pack; stable custom ZIP identity.')
  await dialog.getByRole('button', { name: 'Instalar estos cambios', exact: true }).click(); await expect(dialog).toContainText('Actualización completada', { timeout: 60000 })
  expect(await readdir(join(path, 'resourcepacks'))).toEqual([name])
  const bytes = await readFile(join(path, 'resourcepacks', name)), sha1 = createHash('sha1').update(bytes).digest('hex'); expect(sha1).not.toBe(artifact.hashes.sha1)
  const lookup = await fetch(`https://api.modrinth.com/v2/version_file/${sha1}?algorithm=sha1`); expect(lookup.status).toBe(200)
  const installed = await lookup.json() as ProjectVersion; expect(installed.project_id).toBe('dspVZXKP'); expect(installed.game_versions).toContain('1.21.1')
  expect(installed.files.some(file => file.hashes.sha512 === createHash('sha512').update(bytes).digest('hex'))).toBe(true)
  const [backup] = await readdir(join(path, '.backups')); expect(await readFile(join(path, '.backups', backup, 'resourcepacks', name))).toEqual(original)
  expect(await readFile(join(path, 'options.txt'), 'utf8')).toBe(options); expect(await readFile(join(path, 'resourcepacks-groups.json'), 'utf8')).toBe(groups); expect(await readFile(join(path, 'saves/keep/level.dat'), 'utf8')).toBe('KEEP LIVE WORLD')
  await writeFile(testInfo.outputPath('live-pack-result.json'), JSON.stringify({ provider, sources, oldVersion: version.id, versionId: installed.id, versionNumber: installed.version_number, name, sha1, size: bytes.length, gameStarted: false }, null, 2))
  await snap(launcher, 'live-pack-complete', 'Actual Native public download completed with verified checksum and original backup; no game process.')
})
