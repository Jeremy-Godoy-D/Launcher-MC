import { expect, it } from 'vitest'
import { publicUpdateFiles, releasePage, releasesPage } from './updateLinks'

it('opens only public release files for the reviewed repository and version, never asset API endpoints', () => {
  const name = 'GrimoLauncher-0.3.0-beta.1-win-x64.exe', url = `${releasesPage}/download/v0.3.0-beta.1/${name}`
  const valid = { name, url, apiUrl: 'https://api.github.com/repos/Jeremy-Godoy-D/Launcher-MC/releases/assets/1' }
  const invalid = [valid.apiUrl, url.replace('Jeremy-Godoy-D', 'other'), url.replace('beta.1/', 'beta.2/'), `${url}?token=secret`, `${url}#x`, url.replace('https://', 'https://user:pass@'), url.replace('https:', 'http:'), 'javascript:alert(1)']
  expect(publicUpdateFiles({ name: 'v0.3.0-beta.1', files: [valid, ...invalid.map(url => ({ name, url }))] })).toEqual([valid])
  expect(publicUpdateFiles({ name: 'invalid', files: [valid] })).toEqual([])
  expect(releasePage('0.3.0-beta.1')).toBe(`${releasesPage}/tag/v0.3.0-beta.1`)
  expect(releasePage('../unexpected')).toBe(releasesPage)
})
