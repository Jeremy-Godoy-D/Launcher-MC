import { beforeEach, afterEach, expect, it } from 'vitest'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { ZipFile } from 'yazl'
import { listProgressFiles, openProgressArchive, parseProgressJson, progressBudget, readProgressFile } from './progressFiles'

let root: string
beforeEach(async () => { root = await mkdtemp(join(process.cwd(), '.progress-files-test-')) })
afterEach(async () => { expect(dirname(root)).toBe(process.cwd()); expect(root).toContain('.progress-files-test-'); await rm(root, { recursive: true, force: true }) })
async function archive(files: Record<string, string | Buffer>, name = 'client.jar') {
  const zip = new ZipFile(), path = join(root, name)
  zip.addEmptyDirectory('data/minecraft/advancement/story/')
  zip.addEmptyDirectory('data/')
  for (const [name, data] of Object.entries(files)) zip.addBuffer(Buffer.from(data), name, { compress: false })
  const done = pipeline(zip.outputStream, createWriteStream(path)); zip.end(); await done
  return path
}

it('bounds owned disk reads and directory enumeration, refusing links and external paths', async () => {
  const bytes = Buffer.from('{"done":true}'), path = join(root, 'data.json'); await writeFile(path, bytes)
  expect(await readProgressFile(root, path, progressBudget())).toEqual(bytes)
  await expect(readProgressFile(root, path, { ...progressBudget(), bytes: 2 })).rejects.toThrow()
  await expect(readProgressFile(join(root, 'owned'), path, progressBudget())).rejects.toThrow('Unsafe install directory')
  await mkdir(join(root, 'outside')); await writeFile(join(root, 'outside/secret.json'), 'unchanged'); await symlink(join(root, 'outside'), join(root, 'redirect'), 'junction')
  await expect(readProgressFile(root, join(root, 'redirect/secret.json'), progressBudget())).rejects.toThrow('Unsafe install directory')
  await expect(listProgressFiles(root, root, { ...progressBudget(), entries: 1 })).rejects.toThrow('read limit')
  expect(await readFile(join(root, 'outside/secret.json'), 'utf8')).toBe('unchanged')
})

it('bounds JSON structure and rejects prototype keys and non-finite numbers', () => {
  expect(parseProgressJson('{"criteria":{"normal":"date"}}')).toEqual({ criteria: { normal: 'date' } })
  expect(parseProgressJson('\uFEFF{"criteria":{}}')).toEqual({ criteria: {} })
  for (const input of ['['.repeat(66) + '0' + ']'.repeat(66), '{"__proto__":{"polluted":true}}', '{"count":1e999}']) expect(() => parseProgressJson(input)).toThrow()
})

it('reads ZIP resources with fixed paths, bounded entries/output and deterministic closure', async () => {
  const path = await archive({ 'data/minecraft/advancement/story/root.json': '{"display":{}}', 'assets/minecraft/lang/en_us.json': '{}' })
  const fs = await openProgressArchive(root, path, progressBudget())
  try {
    expect(await fs.listFiles('data/minecraft/advancement/story')).toEqual(['root.json'])
    expect(await fs.isDirectory('data/minecraft/advancement/story')).toBe(true)
    expect(await fs.readFile('assets/minecraft/lang/en_us.json', 'utf-8')).toBe('{}')
    await expect(fs.readFile('../outside.json')).rejects.toThrow('Unsafe progress resource path')
    expect(await fs.listFiles('data/minecraft/advancement/story/')).toEqual(['root.json'])
  } finally { fs.close() }
  expect(fs.isClosed()).toBe(true)
  await expect(openProgressArchive(root, path, { ...progressBudget(), entries: 2 })).rejects.toThrow('read limit')
  await expect(openProgressArchive(root, path, { ...progressBudget(), bytes: 1 })).rejects.toThrow('read limit')
})

it('rejects oversized entries before expansion and verifies CRC of stored entries', async () => {
  const path = await archive({ 'large.json': Buffer.alloc(4 * 1024 * 1024 + 1) }), fs = await openProgressArchive(root, path, progressBudget())
  try { await expect(fs.readFile('large.json')).rejects.toThrow('ZIP entry') } finally { fs.close() }
  const corrupt = await archive({ 'data.json': 'ADVANCEMENT' }, 'corrupt.jar'), bytes = await readFile(corrupt)
  bytes[bytes.indexOf('ADVANCEMENT')] ^= 1; await writeFile(corrupt, bytes)
  const broken = await openProgressArchive(root, corrupt, progressBudget())
  try { await expect(broken.readFile('data.json')).rejects.toThrow('ZIP entry') } finally { broken.close() }
})
