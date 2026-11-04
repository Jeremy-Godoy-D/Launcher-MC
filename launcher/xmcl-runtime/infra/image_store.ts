import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { ensureDir } from 'fs-extra'
import { lstat } from 'node:fs/promises'
import { writeFile as writeAtomically } from 'atomically'
import { join } from 'path'
import { checksum, linkOrCopyFile } from '~/util/fs'

/**
 * The image storage is used to store images in a content addressable way.
 */
export class ImageStorage {
  init: Promise<void>

  constructor(readonly root: string) {
    this.init = ensureDir(root)
  }

  async addImage(pathOrData: string | Uint8Array) {
    await this.init
    if (typeof pathOrData === 'string' && pathOrData.startsWith('image://')) {
      pathOrData = pathOrData.substring('image://'.length)
    }
    const sha1 = typeof pathOrData === 'string' ? await checksum(pathOrData, 'sha1') : createHash('sha1').update(pathOrData).digest('hex')
    const imagePath = join(this.root, sha1)
    if (typeof pathOrData === 'string') {
      if (!existsSync(imagePath)) await linkOrCopyFile(pathOrData, imagePath)
    } else {
      const current = await lstat(imagePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
      // Replace legacy links atomically so owning bytes never changes their original file.
      if (!current?.isFile() || current.nlink > 1) await writeAtomically(imagePath, pathOrData)
    }
    return `http://launcher/image/${sha1}`
  }
}
