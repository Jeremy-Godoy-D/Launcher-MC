type NbtChild = { start: number; type: number; key: string; valueStart: number; end: number; children?: NbtChild[]; closeOffset?: number }
// The shared decoder allocates from NBT counts; bound structure before giving it untrusted world or chunk data.
export function validateNbt(data: Buffer) {
  if (data.length > 16 * 1024 * 1024) throw new Error('NBT buffer too large')
  let offset = 0, nodes = 0
  const skip = (size: number) => { if (!Number.isSafeInteger(size) || size < 0 || size > data.length - offset) throw new Error('Invalid NBT length'); offset += size }
  const byte = () => { skip(1); return data[offset - 1] }
  const length = () => { skip(4); const size = data.readInt32BE(offset - 4); if (size < 0 || size > 100000) throw new Error('NBT collection too large'); return size }
  const string = (name = false) => {
    skip(2); const size = data.readUInt16BE(offset - 2), start = offset; skip(size)
    const text = name ? data.toString('utf8', start, offset) : ''
    if (name && text === '__proto__') throw new Error('Unsafe NBT key')
    return text
  }
  function value(type: number, depth: number): { children?: NbtChild[]; closeOffset?: number } {
    if (++nodes > 200000 || depth > 64) throw new Error('NBT structure too large')
    if (type >= 1 && type <= 6) { skip([0, 1, 2, 4, 8, 4, 8][type]); return {} }
    if (type === 8) { string(); return {} }
    if (type === 7 || type === 11 || type === 12) { skip(length() * (type === 7 ? 1 : type === 11 ? 4 : 8)); return {} }
    if (type === 9) {
      const item = byte(), count = length()
      if (item > 12 || !item && count) throw new Error('Invalid NBT list type')
      for (let index = 0; index < count; index++) value(item, depth + 1)
      return {}
    }
    if (type === 10) {
      const children: NbtChild[] = []
      for (let start = offset, child = byte(); child; start = offset, child = byte()) {
        const key = string(true), valueStart = offset, nested = depth <= 2 ? value(child, depth + 1) : (value(child, depth + 1), {})
        if (depth <= 2) children.push({ start, type: child, key, valueStart, end: offset, ...nested })
      }
      return depth <= 2 ? { children, closeOffset: offset - 1 } : {}
    }
    throw new Error('Invalid NBT type')
  }
  if (byte() !== 10) throw new Error('Invalid NBT root')
  string(true)
  const root = value(10, 0)
  if (offset !== data.length) throw new Error('Trailing NBT data')
  return root.children || []
}
