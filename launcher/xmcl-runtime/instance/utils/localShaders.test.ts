import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { move } from 'fs-extra'
import { checksum } from '@xmcl/core'
vi.mock('@xmcl/core', async original => { const actual = await original<typeof import('@xmcl/core')>(); return { ...actual, checksum: vi.fn(actual.checksum) } })
vi.mock('fs-extra', async original => { const actual = await original<typeof import('fs-extra')>(); return { ...actual, move: vi.fn(actual.move) } })
import { previewShaderRemoval, removeReviewedShaders } from './localShaders'
import { readShaderProperties } from './shaderProperties'

let root: string, path: string
beforeEach(async () => {
  vi.clearAllMocks()
  root = await realpath(await mkdtemp(join(tmpdir(), 'grimo-remove-shaders-'))); path = join(root, 'instance')
  await mkdir(join(path, 'shaderpacks/Folder/shaders'), { recursive: true }); await mkdir(join(path, 'config'))
  await writeFile(join(path, 'shaderpacks/New.zip'), 'SHADER BYTES'); await writeFile(join(path, 'shaderpacks/Other.zip'), 'OTHER SHADER')
  await writeFile(join(path, 'shaderpacks/Folder/shaders/final.fsh'), 'UNPACKED SHADER')
})
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }) })
const preview = (names = ['New.zip', 'Folder']) => previewShaderRemoval(path, names, root)
const remove = (review: Awaited<ReturnType<typeof preview>>) => removeReviewedShaders(path, review, root)
it('backs up reviewed archives, folders and only affected engine configurations before disabling their selections', async () => {
  const iris = '# KEEP\r\nshaderPack=New.zip\r\nunknown=value=equal\r\n', optifine = '# OPTI\nshaderPack=Folder\nquality=1\n', oculus = 'shaderPack=Other.zip\nenableShaders=true\n'
  await writeFile(join(path, 'config/iris.properties'), iris); await writeFile(join(path, 'optionsshaders.txt'), optifine); await writeFile(join(path, 'config/oculus.properties'), oculus)
  await writeFile(join(path, 'options.txt'), 'KEEP GAME OPTIONS'); await mkdir(join(path, 'saves/keep'), { recursive: true }); await writeFile(join(path, 'saves/keep/level.dat'), 'WORLD')
  const review = await preview(); expect(review.configurations).toEqual([{ engine: 'optifine', pack: 'Folder' }, { engine: 'iris', pack: 'New.zip' }]); expect(review.files.map(file => file.entries)).toEqual([1, 1])
  const { backup } = await remove(review)
  expect(await readFile(join(backup, 'shaderpacks/New.zip'), 'utf8')).toBe('SHADER BYTES'); expect(await readFile(join(backup, 'shaderpacks/Folder/shaders/final.fsh'), 'utf8')).toBe('UNPACKED SHADER')
  expect(await readFile(join(backup, 'config/iris.properties'), 'utf8')).toBe(iris); expect(await readFile(join(backup, 'optionsshaders.txt'), 'utf8')).toBe(optifine)
  expect((await readShaderProperties(path, 'iris')).values).toMatchObject({ shaderPack: '', enableShaders: 'false', unknown: 'value=equal' })
  expect((await readShaderProperties(path, 'optifine')).values).toMatchObject({ shaderPack: '', quality: '1' })
  expect(await readFile(join(path, 'config/oculus.properties'), 'utf8')).toBe(oculus)
  expect(await readdir(join(path, 'shaderpacks'))).toEqual(['Other.zip']); expect(await readFile(join(path, 'options.txt'), 'utf8')).toBe('KEEP GAME OPTIONS'); expect(await readFile(join(path, 'saves/keep/level.dat'), 'utf8')).toBe('WORLD')
})
it.each(['archive', 'folder', 'configuration'])('rejects stale %s reviews before creating backups or changing selections', async kind => {
  await writeFile(join(path, 'config/iris.properties'), 'shaderPack=New.zip\n'); const review = await preview()
  if (kind === 'archive') await writeFile(join(path, 'shaderpacks/New.zip'), 'USER EDIT')
  if (kind === 'folder') await writeFile(join(path, 'shaderpacks/Folder/shaders/final.fsh'), 'USER EDIT')
  if (kind === 'configuration') await writeFile(join(path, 'config/iris.properties'), 'shaderPack=Other.zip\n')
  await expect(remove(review)).rejects.toHaveProperty('name', 'ShaderRemovalChangedError')
  expect((await lstat(join(path, 'shaderpacks/New.zip'))).isFile()).toBe(true); await expect(lstat(join(path, '.backups'))).rejects.toHaveProperty('code', 'ENOENT')
})
it('reviews broken archives without parsing and removes inactive shaders without creating configuration files', async () => {
  const { backup } = await remove(await preview(['New.zip']))
  expect(await readFile(join(backup, 'shaderpacks/New.zip'), 'utf8')).toBe('SHADER BYTES')
  await expect(lstat(join(path, 'config/iris.properties'))).rejects.toHaveProperty('code', 'ENOENT'); await expect(lstat(join(path, 'optionsshaders.txt'))).rejects.toHaveProperty('code', 'ENOENT')
})
it('discloses a shared directory but leaves another instance configuration and other common shaders untouched', async () => {
  const other = join(root, 'other'); await mkdir(join(other, 'config'), { recursive: true }); await writeFile(join(other, 'config/iris.properties'), 'OTHER INSTANCE')
  await mkdir(join(root, 'shaderpacks')); await writeFile(join(root, 'shaderpacks/Shared.zip'), 'COMMON'); await writeFile(join(root, 'shaderpacks/Keep.zip'), 'KEEP')
  await symlink(join(root, 'shaderpacks'), join(other, 'shaderpacks'), 'junction')
  const review = await previewShaderRemoval(other, ['Shared.zip'], root); expect(review.sharedDirectory).toBe(true)
  const { backup } = await removeReviewedShaders(other, review, root)
  expect(await readFile(join(backup, 'shaderpacks/Shared.zip'), 'utf8')).toBe('COMMON'); expect(await readFile(join(root, 'shaderpacks/Keep.zip'), 'utf8')).toBe('KEEP')
  expect(await readFile(join(other, 'config/iris.properties'), 'utf8')).toBe('OTHER INSTANCE'); expect((await lstat(join(other, 'shaderpacks'))).isSymbolicLink()).toBe(true)
})
it('rejects linked entries and a linked backup directory without changing their targets', async () => {
  const foreign = join(root, 'foreign'); await mkdir(foreign); await writeFile(join(foreign, 'keep'), 'FOREIGN')
  await symlink(foreign, join(path, 'shaderpacks/Linked'), 'junction'); await expect(preview(['Linked'])).rejects.toThrow()
  const review = await preview(); await symlink(foreign, join(path, '.backups'), 'junction')
  await expect(remove(review)).rejects.toThrow(); expect(await readFile(join(foreign, 'keep'), 'utf8')).toBe('FOREIGN'); expect(await readdir(foreign)).toEqual(['keep'])
})
it('refuses to replace an affected hard-linked configuration', async () => {
  const config = join(path, 'config/iris.properties'); await writeFile(config, 'shaderPack=New.zip\n'); await link(config, join(root, 'shared.properties'))
  await expect(preview()).rejects.toHaveProperty('name', 'ShaderConfigurationSharedError')
  expect(await readFile(config, 'utf8')).toBe('shaderPack=New.zip\n'); await expect(lstat(join(path, '.backups'))).rejects.toHaveProperty('code', 'ENOENT')
})
it('retains configuration backups, moved files and remaining originals when moving the second file fails', async () => {
  await writeFile(join(path, 'config/iris.properties'), 'shaderPack=New.zip\ncustom=KEEP\n'); const review = await preview(), original = vi.mocked(move).getMockImplementation()!
  vi.mocked(move).mockImplementationOnce(original).mockRejectedValueOnce(new Error('Move fixture failure'))
  const error = await remove(review).catch(error => error)
  expect(error.name).toBe('ShaderRemovalIncompleteError'); expect(await readFile(join(error.backup, 'config/iris.properties'), 'utf8')).toBe('shaderPack=New.zip\ncustom=KEEP\n')
  expect(await readFile(join(error.backup, 'shaderpacks/New.zip'), 'utf8')).toBe('SHADER BYTES'); expect(await readFile(join(path, 'shaderpacks/Folder/shaders/final.fsh'), 'utf8')).toBe('UNPACKED SHADER')
  expect((await readShaderProperties(path, 'iris')).values.shaderPack).toBe('')
  await remove(await preview(['Folder'])); expect(await readFile(join(error.backup, 'shaderpacks/New.zip'), 'utf8')).toBe('SHADER BYTES')
})
it('separates shader folder names from configuration backup names', async () => {
  await mkdir(join(path, 'shaderpacks/config')); await writeFile(join(path, 'shaderpacks/config/keep'), 'FOLDER'); await writeFile(join(path, 'config/iris.properties'), 'shaderPack=config\n')
  const { backup } = await remove(await preview(['config']))
  expect(await readFile(join(backup, 'shaderpacks/config/keep'), 'utf8')).toBe('FOLDER'); expect(await readFile(join(backup, 'config/iris.properties'), 'utf8')).toBe('shaderPack=config\n')
})
it('fails closed on unreadable checksums and invalid identifiers', async () => {
  for (const value of [null, undefined]) { vi.mocked(checksum).mockResolvedValueOnce(value as any); await expect(preview(['New.zip'])).rejects.toThrow('checksum unavailable') }
  for (const names of [[], ['../outside'], ['Folder/shaders'], Array(201).fill('New.zip')]) await expect(preview(names)).rejects.toThrow()
  expect(await readFile(join(path, 'shaderpacks/New.zip'), 'utf8')).toBe('SHADER BYTES')
})
it('rechecks folder authority after the final checksum even when a foreign target contains the same hard-linked file', async () => {
  const foreign = join(root, 'foreign'), directory = join(path, 'shaderpacks'), archive = join(directory, 'New.zip')
  await mkdir(foreign); await link(archive, join(foreign, 'New.zip')); await writeFile(join(path, 'config/iris.properties'), 'shaderPack=New.zip\n')
  const review = await preview(['New.zip']), original = vi.mocked(checksum).getMockImplementation()!
  vi.mocked(checksum).mockImplementationOnce(original).mockImplementationOnce(original).mockImplementationOnce(async (file, algorithm) => {
    const value = await original(file, algorithm); await rename(directory, directory + '-previous'); await symlink(foreign, directory, 'junction'); return value
  })
  await expect(remove(review)).rejects.toHaveProperty('name', 'ShaderRemovalIncompleteError')
  expect(await readFile(join(foreign, 'New.zip'), 'utf8')).toBe('SHADER BYTES'); expect(await readFile(join(directory + '-previous', 'New.zip'), 'utf8')).toBe('SHADER BYTES')
  expect(move).not.toHaveBeenCalled()
})
it.skipIf(process.platform !== 'win32')('clears a differently cased Windows filename without altering its backup bytes', async () => {
  await writeFile(join(path, 'config/iris.properties'), 'shaderPack=new.ZIP\n'); const { backup } = await remove(await preview(['New.zip']))
  expect((await readShaderProperties(path, 'iris')).values.shaderPack).toBe(''); expect(await readFile(join(backup, 'config/iris.properties'), 'utf8')).toBe('shaderPack=new.ZIP\n')
})
