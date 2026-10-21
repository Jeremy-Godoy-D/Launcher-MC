import { describe, expect, it } from 'vitest'
import { DEFAULT_GITHUB_REPO, isUpstreamService } from './productPolicy'
import { ManualUpdater } from './ManualUpdater'

describe('Launcher MC isolation', () => {
  it.each(['https://xmcl.app', 'https://api.xmcl.app/latest', 'https://api-staging.xmcl.app', 'https://xmcl-core-api.azurewebsites.net/api/flights'])('blocks upstream infrastructure: %s', (url) => {
    expect(isUpstreamService(url)).toBe(true)
  })
  it.each([
    'https://api.modrinth.com/v2',
    'https://api.curseforge.com',
    'https://api.minecraftservices.com',
    'https://xmcl.app.example.com',
    `https://api.github.com/repos/${DEFAULT_GITHUB_REPO}/releases`,
    `https://github.com/${DEFAULT_GITHUB_REPO}/releases/download/v0.1.0-beta.1/LauncherMC-0.1.0-beta.1-win-x64.exe`,
  ])('does not misclassify another host: %s', (url) => {
    expect(isUpstreamService(new URL(url))).toBe(false)
  })
  it('points default update repository to Jeremy-Godoy-D/Launcher-MC', () => {
    expect(DEFAULT_GITHUB_REPO).toBe('Jeremy-Godoy-D/Launcher-MC')
  })
  it('reports no update without a network client and refuses installation in ManualUpdater', async () => {
    const updater = new ManualUpdater(() => '0.1.0-beta.1')
    expect(await updater.checkUpdateTask()).toMatchObject({ name: '0.1.0-beta.1', newUpdate: false, files: [] })
    await expect(updater.downloadUpdate()).rejects.toThrow('desactivadas')
    await expect(updater.installUpdateAndQuit()).rejects.toThrow('desactivadas')
  })
})
