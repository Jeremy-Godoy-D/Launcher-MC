import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

/** Verify the expanded ASAR, before it is committed as the pending update. */
export async function verifyUpdate(file: string, expected: string) {
  if (!/^[a-f\d]{64}$/i.test(expected)) throw new Error('Missing or invalid update SHA-256')
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  if (hash.digest('hex') !== expected.toLowerCase()) throw new Error('Update SHA-256 mismatch')
}
export function validateUpdateAsset(url: string, name: string, repository: string, version: string) {
  const target = new URL(url)
  const download = target.origin === 'https://github.com' && target.pathname === `/${repository}/releases/download/v${version}/${name}`
  const apiPrefix = `/repos/${repository}/releases/assets/`
  const api = target.origin === 'https://api.github.com' && target.pathname.startsWith(apiPrefix) && /^[1-9]\d*$/.test(target.pathname.slice(apiPrefix.length))
  if (target.username || target.password || target.search || target.hash || (!download && !api)) throw new Error('El origen de la actualización no es válido.')
}
