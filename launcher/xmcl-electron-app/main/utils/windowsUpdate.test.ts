import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm, access, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from 'vitest'
import { getWindowsUpdateArgs } from './windowsUpdate'
import { quoteWindowsArgument } from './windowsCommand'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

test('Windows quoting retains spaces, quotes, empty arguments and trailing slashes', () => {
  expect(quoteWindowsArgument('')).toBe('""')
  expect(quoteWindowsArgument('simple')).toBe('simple')
  expect(quoteWindowsArgument('a b')).toBe('"a b"')
  expect(quoteWindowsArgument('a"b')).toBe('"a\\"b"')
  expect(quoteWindowsArgument('a b\\')).toBe('"a b\\\\"')
})

test('Windows helper rejects invalid verification data before spawning', () => {
  const options = { target: '', source: '', sha256: hash('candidate'), pid: 1, executable: '', args: [], cwd: '', errorLog: '' }
  for (const sha256 of ['', 'x'.repeat(64), 'a'.repeat(63)]) {
    expect(() => getWindowsUpdateArgs({ ...options, sha256 })).toThrow('Invalid update verification data')
  }
  for (const pid of [0, -1, 1.5, NaN]) {
    expect(() => getWindowsUpdateArgs({ ...options, pid })).toThrow('Invalid update verification data')
  }
})

for (const mode of ['valid', 'corrupt', 'replace-denied'] as const) {
  test.runIf(process.platform === 'win32')(`Windows update preserves a recoverable launcher: ${mode}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'launcher-update-'))
    if (!resolve(root).startsWith(resolve(tmpdir(), 'launcher-update-'))) throw new Error('Unexpected update fixture path')
    const dir = join(root, "prueba á ' & $ ( ) % !")
    try {
      await mkdir(dir)
      const target = join(dir, 'app.asar')
      const source = join(dir, 'pending_update')
      const output = join(dir, 'relaunch.json')
      const launcher = join(dir, 'launcher.cjs')
      const errorLog = join(dir, 'update-error.log')
      await writeFile(target, 'previous launcher')
      await writeFile(source, mode === 'corrupt' ? 'altered bytes' : 'verified candidate')
      await writeFile(launcher, "require('node:fs').writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)))")
      if (mode === 'replace-denied') await mkdir(target + '.previous')
      const originalArgs = ['', 'spaces and á', 'quote"value', 'trailing space\\', '$(&) %PATH% `value`', "O'Brien"]
      const options = { target, source, sha256: hash('verified candidate'), pid: 2_000_000_001, executable: process.execPath, args: [launcher, output, ...originalArgs], cwd: dir, errorLog }
      const run = () => {
        const [command, ...args] = getWindowsUpdateArgs(options)
        return promisify(execFile)(command, args, { windowsHide: true, timeout: 15_000 }).catch(async error => {
          throw Object.assign(new Error(await readFile(errorLog, 'utf8').catch(() => error.stderr || 'Update helper failed')), { code: error.code })
        })
      }
      if (mode === 'valid') {
        await run()
        expect(await readFile(target, 'utf8')).toBe('verified candidate')
        expect(await readFile(target + '.previous', 'utf8')).toBe('previous launcher')
      } else {
        await expect(run()).rejects.toMatchObject({ code: 1 })
        expect(await readFile(target, 'utf8')).toBe('previous launcher')
        expect(await readFile(errorLog, 'utf8')).toContain('previous launcher was preserved')
      }
      await expect.poll(async () => JSON.parse(await readFile(output, 'utf8').catch(() => 'null'))).toEqual(originalArgs)
      await expect(access(target + '.updating')).rejects.toThrow()
      if (mode === 'valid') {
        await unlink(output)
        await writeFile(source, 'next candidate')
        options.sha256 = hash('next candidate')
        await run()
        expect(await readFile(target, 'utf8')).toBe('next candidate')
        expect(await readFile(target + '.previous', 'utf8')).toBe('verified candidate')
        await expect.poll(() => readFile(output, 'utf8').catch(() => '')).not.toBe('')
      }
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 30_000)
}
