import { fileTypeFromBuffer } from 'file-type'
import { readBoundedLocalFile } from '../../util/readBoundedLocalFile'

const MAX_TEXTURE_BYTES = 1024 * 1024

export async function readLocalProfileTexture(source: string, kind: 'skin' | 'cape') {
  const bytes = await readBoundedLocalFile(source, MAX_TEXTURE_BYTES)
  if (bytes.length < 33 || (await fileTypeFromBuffer(bytes))?.mime !== 'image/png' || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new TypeError('Texture must be a PNG image')
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  if (width !== 64 || (kind === 'skin' ? height !== 32 && height !== 64 : height !== 32)) throw new TypeError('Invalid Minecraft texture dimensions')
  return bytes
}
