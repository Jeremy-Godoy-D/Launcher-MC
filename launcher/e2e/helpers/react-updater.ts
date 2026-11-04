import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import type { LauncherFixture } from '../fixtures/launcher'

/** Owned bytes test transfer/hash handling; no installer or ASAR application is invoked. */
export async function mockReactUpdater(launcher: LauncherFixture) {
  const current = await launcher.app.evaluate(({ app }) => app.getVersion())
  const major = Number(current.split('.')[0])
  if (!Number.isSafeInteger(major) || major < 0) throw new Error('Unexpected packaged launcher version')
  const version = `${major + 1}.0.0-beta.1`, name = `app-${version}-win.asar`
  const bytes = Buffer.from('OWNED INTEGRITY FIXTURE\n'.repeat(65536)), hash = createHash('sha256').update(bytes).digest('hex')
  const state = { feedStatus: 200, slow: false, corrupt: false, started: false, aborted: false, release: () => {} }
  const requests: { method: string; path: string }[] = []
  const asset = (id: number, name: string) => ({ id, name, url: `https://api.github.com/repos/Jeremy-Godoy-D/Launcher-MC/releases/assets/${id}`, browser_download_url: `https://github.com/Jeremy-Godoy-D/Launcher-MC/releases/download/v${version}/${name}` })
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://fixture.invalid'); requests.push({ method: request.method!, path: url.pathname })
    response.setHeader('cache-control', 'no-store')
    if (url.pathname === '/repos/Jeremy-Godoy-D/Launcher-MC/releases') {
      response.writeHead(state.feedStatus, { 'content-type': 'application/json' })
      response.end(JSON.stringify(state.feedStatus === 200 ? [{ tag_name: `v${version}`, draft: false, prerelease: true, published_at: '2026-11-01T00:00:00Z', body: '## Actualización de prueba\n\nDescarga local con integridad verificada.', assets: [asset(1, name), asset(2, `${name}.sha256`), asset(3, `GrimoLauncher-${version}-win-x64.exe`)] }] : { error: 'Owned failure' }))
    } else if (url.pathname.endsWith('/2') || url.pathname.endsWith('.sha256')) { response.writeHead(200); response.end(`${hash}  ${name}`) }
    else if (url.pathname.endsWith('/1') || url.pathname.endsWith('.asar')) {
      const data = state.corrupt ? Buffer.concat([Buffer.from('BAD'), bytes.subarray(3)]) : bytes
      state.started = true; response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': data.length })
      if (state.slow) {
        response.write(data.subarray(0, 64)); response.once('close', () => { if (!response.writableEnded) state.aborted = true })
        state.release = () => { if (!response.destroyed) response.end(data.subarray(64)) }
      } else response.end(data)
    } else { response.writeHead(404); response.end() }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing owned server address')
  const base = `http://127.0.0.1:${address.port}`
  await launcher.app.evaluate(({ session }, base) => {
    process.env.LAUNCHER_UPDATE_TOKEN = 'e2e-not-a-secret'
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://api.github.com/repos/Jeremy-Godoy-D/Launcher-MC/releases*', 'https://github.com/Jeremy-Godoy-D/Launcher-MC/releases/download/*'] }, (details: { url: string; webContentsId?: number }, callback: (result: { redirectURL?: string }) => void) => {
      if (details.webContentsId && details.webContentsId > 0) { callback({}); return }
      const url = new URL(details.url)
      callback({ redirectURL: base + url.pathname + url.search })
    })
  }, base)
  return { state, requests, hash, bytes, version, close: async () => {
    state.release()
    try { await launcher.app.evaluate(({ session }) => { session.defaultSession.webRequest.onBeforeRequest(null); delete process.env.LAUNCHER_UPDATE_TOKEN }) }
    finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
  } }
}
