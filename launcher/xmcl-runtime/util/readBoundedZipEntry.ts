import { Crc32 } from '@aws-crypto/crc32'
import { openEntryReadStream, type open } from '@xmcl/unzip'
import type { Entry } from '@xmcl/yauzl'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export async function readBoundedZipEntry(zip: Awaited<ReturnType<typeof open>>, entry: Entry, limit: number) {
  const invalid = () => new Error('Invalid or oversized ZIP entry')
  if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > limit) throw invalid()
  const chunks: Buffer[] = [], crc = new Crc32(); let bytes = 0
  const stream = await openEntryReadStream(zip, entry)
  await pipeline(stream, new Transform({ transform(chunk: Buffer, _encoding, callback) {
    bytes += chunk.length
    if (bytes > entry.uncompressedSize || bytes > limit) { callback(invalid()); return }
    crc.update(chunk); chunks.push(chunk); callback()
  } }))
  if (bytes !== entry.uncompressedSize || crc.digest() !== entry.crc32) throw invalid()
  return Buffer.concat(chunks, bytes)
}
