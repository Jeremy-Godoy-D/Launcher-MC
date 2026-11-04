import { lstat, open } from 'node:fs/promises'

const changed = () => Object.assign(new Error('World changed during read'), { name: 'WorldChangedError' })
export async function readBoundedFile(file: string, limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Invalid metadata size limit')
  const before = await lstat(file, { bigint: true })
  if (!before.isFile() || before.isSymbolicLink() || before.size > limit) throw new Error('Unsafe world metadata')
  const handle = await open(file, 'r')
  let data: Buffer
  try {
    const info = await handle.stat({ bigint: true })
    if (info.ino !== before.ino || info.dev !== before.dev || !info.isFile()) throw changed()
    const buffer = Buffer.alloc(Math.min(limit, Number(before.size)) + 1); let size = 0
    while (size < buffer.length) { const read = await handle.read(buffer, size, buffer.length - size, size); if (!read.bytesRead) break; size += read.bytesRead }
    if (size > limit) throw new Error('Oversized world metadata')
    data = buffer.subarray(0, size)
  } finally { await handle.close() }
  const after = await lstat(file, { bigint: true })
  if (after.isSymbolicLink() || before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw changed()
  return data
}
