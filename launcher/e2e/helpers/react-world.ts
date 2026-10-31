import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

/** Small valid Java NBT fixture; no Minecraft process or user save is needed. */
export async function makeReactWorld(instance: string, folder: string, title = folder) {
  const text = (value: string) => { const bytes = Buffer.from(value), size = Buffer.alloc(2); size.writeUInt16BE(bytes.length); return Buffer.concat([size, bytes]) }
  const tag = (type: number, name: string, data: Buffer) => Buffer.concat([Buffer.from([type]), text(name), data])
  const int = (value: number) => { const bytes = Buffer.alloc(4); bytes.writeInt32BE(value); return bytes }
  const long = (value: bigint) => { const bytes = Buffer.alloc(8); bytes.writeBigInt64BE(value); return bytes }
  const data = Buffer.concat([
    tag(8, 'LevelName', text(title)), tag(3, 'GameType', int(0)), tag(1, 'Difficulty', Buffer.from([2])), tag(1, 'allowCommands', Buffer.from([1])),
    tag(4, 'Time', long(48000n)), tag(4, 'LastPlayed', long(1760000000000n)), tag(4, 'RandomSeed', long(0n)),
    tag(10, 'Version', Buffer.concat([tag(8, 'Name', text('1.21.1')), Buffer.from([0])])), Buffer.from([0]),
  ])
  const root = join(instance, 'saves', folder)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'level.dat'), gzipSync(tag(10, '', Buffer.concat([tag(10, 'Data', data), Buffer.from([0])]))))
  return root
}
