import { open } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function readBoundedLocalFile(source: string, maximum: number): Promise<Buffer> {
  if (typeof source !== 'string') throw new TypeError('Invalid local file')
  const path = source.startsWith('file:') ? fileURLToPath(source) : source
  if (!isAbsolute(path) || path.startsWith('\\\\') || path.startsWith('//')) throw new TypeError('Choose a local PNG or image file')
  const file = await open(path, 'r')
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > maximum) throw new TypeError('Image exceeds the size limit')
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      size += chunk.length
      if (size > maximum) throw new TypeError('Image exceeds the size limit')
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  } finally { await file.close() }
}
