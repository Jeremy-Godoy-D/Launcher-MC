import { afterEach, beforeEach, expect, it } from 'vitest'
import { link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readShaderProperties, writeShaderProperties } from './shaderProperties'

let root: string, path: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'grimo-shader-options-')); path = join(root, 'instance'); await mkdir(path) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
async function put(text: string, name = 'config/iris.properties') { await mkdir(join(path, 'config'), { recursive: true }); await writeFile(join(path, name), Buffer.from(text, 'latin1')) }
it('reads an absent configuration without creating folders or files', async () => {
  const state = await readShaderProperties(path, 'iris'); expect(state.values).toEqual({}); expect(await readdir(path)).toEqual([])
})
it('updates only the selected properties and preserves comments, latin1 bytes, unknown keys and CRLF', async () => {
  const before = '# caf\xe9\r\nshaderPack=Old.zip\r\n! Keep comment\r\nmaxShadowRenderDistance=17\r\nenableShaders=false\r\nunknown=C:\\\\temp\\\\file\r\n'
  await put(before); const state = await readShaderProperties(path, 'iris')
  expect(state.values.unknown).toBe('C:\\temp\\file')
  await writeShaderProperties(path, 'iris', { shaderPack: 'Luz = Áurea.zip', enableShaders: 'true' }, state.snapshot)
  const actual = await readFile(join(path, 'config/iris.properties'))
  expect(actual).toEqual(Buffer.from(before.replace('shaderPack=Old.zip', 'shaderPack=Luz\\ \\=\\ \\u00c1urea.zip').replace('enableShaders=false', 'enableShaders=true'), 'latin1'))
  expect((await readShaderProperties(path, 'iris')).values.shaderPack).toBe('Luz = Áurea.zip')
})
it('parses whitespace and colon separators, escaped keys, values with equals and continuations with Java last-value semantics', async () => {
  await put('shaderPack: old.zip\nshader\\u0050ack   final\\\n   \\ name\\=yes.zip\nfoo bar=baz\nliteral=\\\\u0041\n')
  const state = await readShaderProperties(path, 'iris')
  expect(state.values).toMatchObject({ shaderPack: 'final name=yes.zip', foo: 'bar=baz', literal: '\\u0041' })
  await writeShaderProperties(path, 'iris', { shaderPack: 'new.zip' }, state.snapshot)
  expect((await readShaderProperties(path, 'iris')).values.shaderPack).toBe('new.zip')
  expect(await readFile(join(path, 'config/iris.properties'), 'latin1')).toContain('shaderPack: old.zip\n')
})
it('adds missing keys without merging the final line and preserves Unicode surrogate escapes', async () => {
  await put('# keep\ncustom=unchanged')
  const before = await readShaderProperties(path, 'iris')
  await writeShaderProperties(path, 'iris', { shaderPack: 'Luz 🌙.zip', enableShaders: 'true' }, before.snapshot)
  expect((await readShaderProperties(path, 'iris')).values.shaderPack).toBe('Luz 🌙.zip')
  expect(await readFile(join(path, 'config/iris.properties'), 'latin1')).toContain('custom=unchanged\nshaderPack=')
})
it('does not follow a linked config directory or a linked config file', async () => {
  const outside = join(root, 'outside'); await mkdir(outside); await writeFile(join(outside, 'iris.properties'), 'KEEP')
  await symlink(outside, join(path, 'config'), 'junction')
  await expect(readShaderProperties(path, 'iris')).rejects.toThrow('Unsafe install directory')
  expect(await readFile(join(outside, 'iris.properties'), 'utf8')).toBe('KEEP')
})
it('rejects a shared inode on write without breaking or editing either link', async () => {
  await put('shaderPack=Old.zip\n'); await link(join(path, 'config/iris.properties'), join(root, 'shared.properties'))
  const before = await readShaderProperties(path, 'iris')
  await expect(writeShaderProperties(path, 'iris', { shaderPack: 'new.zip' }, before.snapshot)).rejects.toThrow('Shared shader configuration')
  expect(await readFile(join(root, 'shared.properties'), 'utf8')).toBe('shaderPack=Old.zip\n')
})
it('rejects an edited or replaced file before publishing and leaves no temporary file', async () => {
  await put('shaderPack=old.zip\n'); const before = await readShaderProperties(path, 'iris'); await put('shaderPack=USER.zip\n')
  await expect(writeShaderProperties(path, 'iris', { shaderPack: 'new.zip' }, before.snapshot)).rejects.toHaveProperty('name', 'ShaderSelectionChangedError')
  expect(await readdir(join(path, 'config'))).toEqual(['iris.properties']); expect(await readFile(join(path, 'config/iris.properties'), 'utf8')).toBe('shaderPack=USER.zip\n')
})
it('keeps the original when the last Native guard fails and cleans only its temporary file', async () => {
  await put('shaderPack=old.zip\n'); const before = await readShaderProperties(path, 'iris')
  await expect(writeShaderProperties(path, 'iris', { shaderPack: 'new.zip' }, before.snapshot, async () => { throw new Error('changed engine') })).rejects.toThrow('changed engine')
  expect(await readdir(join(path, 'config'))).toEqual(['iris.properties']); expect(await readFile(join(path, 'config/iris.properties'), 'utf8')).toBe('shaderPack=old.zip\n')
})
it('bounds file size and validates engine and patch keys before writes', async () => {
  await put('x'.repeat(1024 * 1024 + 1)); await expect(readShaderProperties(path, 'iris')).rejects.toThrow('Unsafe shader configuration')
  await expect(readShaderProperties(path, '../outside' as any)).rejects.toThrow('Invalid shader engine')
  await expect(writeShaderProperties(path, 'iris', { 'bad\nkey': 'value' }, 'a'.repeat(64))).rejects.toThrow('Invalid shader options')
})

it('bounds decoded shader identifiers and physical property lines before returning UI data', async () => {
  await put('shaderPack=' + 'x'.repeat(1025)); await expect(readShaderProperties(path, 'iris')).rejects.toThrow('Invalid shader pack property')
  await put('shaderPack=bad\\nname.zip'); await expect(readShaderProperties(path, 'iris')).rejects.toThrow('Invalid shader pack property')
  await put('# comment\n'.repeat(10001)); await expect(readShaderProperties(path, 'iris')).rejects.toThrow('Too many shader properties')
})
