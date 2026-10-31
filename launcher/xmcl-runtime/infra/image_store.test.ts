import { createHash } from 'node:crypto'
import { link, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { ImageStorage } from './image_store'

test('byte imports detach an existing legacy hard link without modifying its original', async () => {
  const root = await mkdtemp(join(tmpdir(), 'grimo-image-owner-'))
  try {
    const bytes = Buffer.from('owned-image-bytes'), source = join(root, 'original.png')
    const hash = createHash('sha1').update(bytes).digest('hex'), store = new ImageStorage(join(root, 'images'))
    await store.init; await writeFile(source, bytes); await link(source, join(store.root, hash))
    expect((await stat(source)).nlink).toBe(2)
    expect(await store.addImage(bytes)).toBe(`http://launcher/image/${hash}`)
    expect((await stat(source)).nlink).toBe(1)
    expect(await readFile(source)).toEqual(bytes)
    await writeFile(source, 'changed-original')
    expect(await readFile(join(store.root, hash))).toEqual(bytes)
  } finally { await rm(root, { recursive: true, force: true }) }
})
