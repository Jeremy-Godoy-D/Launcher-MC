import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { pluginMediaProtocol } from './pluginMediaProtocol'
import { toMediaIconUrl } from '../instance/instanceIcon'

test('media query paths are decoded once and serve literal percent, hash and ampersand filenames', async () => {
  const root = await mkdtemp(join(tmpdir(), 'grimo-media-protocol-'))
  try {
    const bytes = await readFile(join(process.cwd(), 'xmcl-keystone-ui/src/assets/steve_skin.png'))
    const path = join(root, 'imagen #&%20 %.png'); await writeFile(path, bytes)
    let handle: any
    const app = { appDataPath: root, platform: { os: process.platform === 'win32' ? 'windows' : 'linux' }, protocol: { registerHandler: (scheme: string, handler: unknown) => { if (scheme === 'http') handle = handler } } }
    await pluginMediaProtocol(app as any, {} as any)
    const response: any = {}
    await handle({ request: { url: new URL(toMediaIconUrl(path)) }, response })
    expect(response.status).toBe(200); expect(response.headers['content-type']).toBe('image/png')
    const chunks: Buffer[] = []
    for await (const chunk of response.body) chunks.push(chunk)
    expect(Buffer.concat(chunks)).toEqual(bytes)
    const missing: any = {}
    await handle({ request: { url: new URL('http://launcher/media') }, response: missing })
    expect(missing.status).toBe(400)
  } finally { await rm(root, { recursive: true, force: true }) }
})
