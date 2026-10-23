import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { getGitHubReleaseFiles, validateUpdateAsset, verifyUpdate } from './verifyUpdate'

test.each([false, true])('browser downloads stay public when authenticated=%s', authenticated => {
  const asset = { name: 'LauncherMC-0.2.0-beta.2-win-x64.exe', url: 'https://api.github.com/repos/owner/launcher/releases/assets/123', browser_download_url: 'https://github.com/owner/launcher/releases/download/v0.2.0-beta.2/LauncherMC-0.2.0-beta.2-win-x64.exe' }
  const [file] = getGitHubReleaseFiles([asset], authenticated)
  expect(file.url).toBe(asset.browser_download_url)
  expect(file.apiUrl).toBe(authenticated ? asset.url : undefined)
})

test('accepts the downloaded bytes only when the expected hash matches', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'launcher-hash-'))
  const path = join(dir, 'candidate.asar')
  try {
    const bytes = Buffer.from('trusted candidate')
    const hash = createHash('sha256').update(bytes).digest('hex')
    await writeFile(path, bytes)
    await expect(verifyUpdate(path, hash)).resolves.toBeUndefined()
    await writeFile(path, 'corrupted candidate')
    await expect(verifyUpdate(path, hash)).rejects.toThrow('mismatch')
    await expect(verifyUpdate(path, '')).rejects.toThrow('invalid')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('update assets and checksums must come from the configured GitHub repository', () => {
  const repository = 'owner/launcher'
  const name = 'app-0.2.0-beta.1-win.asar'
  const validate = (url: string) => validateUpdateAsset(url, name, repository, '0.2.0-beta.1')
  expect(() => validate(`https://github.com/${repository}/releases/download/v0.2.0-beta.1/${name}`)).not.toThrow()
  expect(() => validate(`https://api.github.com/repos/${repository}/releases/assets/123`)).not.toThrow()
  for (const url of ['https://untrusted.example/app.asar', 'http://github.com/owner/launcher/app.asar', 'https://api.github.com/repos/other/launcher/releases/assets/123', 'https://user:password@api.github.com/repos/owner/launcher/releases/assets/123', 'https://api.github.com/repos/owner/launcher/releases/assets/123?url=https://evil.example']) expect(() => validate(url)).toThrow()
})
