import { open } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fileTypeFromBuffer } from 'file-type'

const MAX_TEXTURE_BYTES = 1024 * 1024

export async function readLocalProfileTexture(source: string, kind: 'skin' | 'cape') {
  if (typeof source !== 'string') throw new TypeError('Invalid local texture')
  const path = source.startsWith('file:') ? fileURLToPath(source) : source
  if (!isAbsolute(path) || path.startsWith('\\\\') || path.startsWith('//')) throw new TypeError('Choose a local PNG file')
  const file = await open(path, 'r')
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > MAX_TEXTURE_BYTES) throw new TypeError('Texture exceeds the PNG size limit')
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      size += chunk.length
      if (size > MAX_TEXTURE_BYTES) throw new TypeError('Texture exceeds the PNG size limit')
      chunks.push(chunk)
    }
    const bytes = Buffer.concat(chunks)
    if (bytes.length < 33 || (await fileTypeFromBuffer(bytes))?.mime !== 'image/png' || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new TypeError('Texture must be a PNG image')
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
    if (width !== 64 || (kind === 'skin' ? height !== 32 && height !== 64 : height !== 32)) throw new TypeError('Invalid Minecraft texture dimensions')
    return bytes
  } finally {
    await file.close()
  }
}
