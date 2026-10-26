import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { test, expect, snap } from '../../helpers/scratch'
import { mockCreationMetadata } from '../../helpers/react-creation'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'

test.use({ launcherOptions: { locale: 'es-ES' } })

for (const kind of ['vanilla', 'prism'] as const)
  test(`${kind} modified client is isolated from vanilla and used by the native launch argument generator`, async ({ launcher }) => {
    const page = launcher.main
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await mockCreationMetadata(launcher)
    const source = join(launcher.gameDataPath, `source-${kind}`)
    const game = kind === 'prism' ? join(source, '.minecraft') : source
    const minecraft = kind === 'prism' ? '1.7.10' : '1.21.1'
    async function file(path: string, data: string) { const target = join(source, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, data) }
    await file(`${kind === 'prism' ? '.minecraft/' : ''}saves/Sentinel/level.dat`, 'source-world')
    const require = createRequire(new URL('../../../xmcl-runtime/package.json', import.meta.url))
    const { ZipFile } = require('yazl')
    async function jar(path: string, text: string) {
      await mkdir(dirname(path), { recursive: true })
      const zip = new ZipFile()
      zip.addBuffer(Buffer.from(text), 'qa.txt')
      const writing = pipeline(zip.outputStream, createWriteStream(path))
      zip.end(); await writing
      return readFile(path)
    }
    const officialPath = join(launcher.gameDataPath, `versions/${minecraft}/${minecraft}.jar`)
    const official = await jar(officialPath, 'keep official client')
    const modified = await jar(join(source, 'versions/alias/alias.jar'), 'custom modified client')
    const baseDownload = { url: 'https://example.com/official.jar', sha1: createHash('sha1').update(official).digest('hex'), size: official.length }
    if (kind === 'vanilla') {
      await file('launcher_profiles.json', JSON.stringify({ profiles: { qa: { name: 'Isolated Vanilla QA', lastVersionId: 'custom' } } }))
      await file(`versions/${minecraft}/${minecraft}.json`, JSON.stringify({ id: minecraft, mainClass: 'vanilla.Main', minecraftArguments: '--username ${auth_player_name}', libraries: [], downloads: { client: baseDownload }, javaVersion: { component: 'java-runtime-delta', majorVersion: 21 } }))
      await file('versions/custom/custom.json', JSON.stringify({ id: 'custom', inheritsFrom: minecraft, jar: 'alias', mainClass: 'custom.Main', libraries: [] }))
    } else {
      await file('instance.cfg', 'name=Isolated Prism QA\nJavaPath=untrusted.exe\nOverrideCommands=true\nPreLaunchCommand=never-run')
      await file('mmc-pack.json', JSON.stringify({ formatVersion: 1, components: [{ uid: 'net.minecraft', version: minecraft }] }))
      await file('patches/net.minecraft.json', JSON.stringify({ uid: 'net.minecraft', jar: 'alias', mainClass: 'custom.Main', minecraftArguments: '--username ${auth_player_name}', mainJar: { downloads: { artifact: baseDownload } }, libraries: [{ name: 'qa:bootstrap:1', 'MMC-hint': 'local' }], compatibleJavaMajors: [17, 21] }))
      await file('libraries/bootstrap-1.jar', 'fixture bootstrap')
    }
    await page.getByTestId('nav-library').click()
    await page.getByTestId('library-create-instance').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Importar modpack', exact: true }).click()
    await dialog.getByRole('button', { name: 'Carpeta existente', exact: true }).click()
    await page.getByLabel('Formato de la carpeta', { exact: true }).selectOption(kind)
    await stubOpenDialog(launcher, source)
    await dialog.getByRole('button', { name: 'Elegir carpeta de origen', exact: true }).click()
    await expect(page.getByTestId('instance-create-confirm')).toBeEnabled()
    expect(await launcher.app.evaluate(() => (globalThis as any).__creationCalls)).toEqual([])
    expect(await readFile(officialPath)).toEqual(official)
    await page.getByTestId('instance-create-confirm').click()
    await expect(dialog.getByRole('button', { name: 'Ver instancia', exact: true })).toBeVisible()
    await snap(launcher, `${kind}-client-isolated`, 'Cliente modificado confirmado en caché privada; el cliente Vanilla existente conserva sus bytes.')
    await dialog.getByRole('button', { name: 'Ver instancia', exact: true }).click()
    const instancePath = await page.evaluate(() => localStorage.getItem('selectedInstancePath'))
    const instance = JSON.parse(await readFile(join(instancePath!, 'instance.json'), 'utf8'))
    const resolved = await page.evaluate(async id => (window as any).serviceChannels.open('VersionService').call('resolveLocalVersion', id), instance.version)
    expect(resolved.minecraftVersion).toBe(minecraft)
    expect(resolved.clientJar).toMatch(/^\.client-[a-f0-9]{24}$/)
    const privatePath = join(launcher.gameDataPath, `versions/${resolved.clientJar}/${resolved.clientJar}.jar`)
    expect(await readFile(privatePath)).toEqual(modified)
    expect(await readFile(officialPath)).toEqual(official)
    expect(resolved.downloads.client.sha1).toBe(createHash('sha1').update(modified).digest('hex'))
    const javaStandIn = await launcher.app.evaluate(() => process.execPath)
    const args = await page.evaluate(async ({ instancePath, version, java }) => {
      const user = await (window as any).serviceChannels.open('UserService').call('login', { username: 'Client_QA', authority: 'x://dev' })
      return (window as any).serviceChannels.open('LaunchService').call('generateArguments', { side: 'client', version, java, gameDirectory: instancePath, user })
    }, { instancePath, version: instance.version, java: javaStandIn })
    const classpath = args[args.indexOf('-cp') + 1]
    expect(classpath).toContain(privatePath.replaceAll('\\', '/'))
    expect(classpath).not.toContain(officialPath.replaceAll('\\', '/'))
    expect(await page.evaluate(async () => (window as any).serviceChannels.open('LaunchService').call('getGameProcesses'))).toEqual([])
    await page.reload()
    const again = await page.evaluate(async id => (window as any).serviceChannels.open('VersionService').call('resolveLocalVersion', id), instance.version)
    expect(again.clientJar).toBe(resolved.clientJar)
    expect(await readFile(join(game, 'saves/Sentinel/level.dat'), 'utf8')).toBe('source-world')
    expect((await readdir(join(launcher.gameDataPath, 'versions'))).filter(name => name.startsWith('.client-'))).toHaveLength(1)
    expect(errors).toEqual([])
  })
