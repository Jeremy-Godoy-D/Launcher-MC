import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { readBoundedFile } from '../util/readBoundedFile'

/** Read only the old appearance flag; never initialize or migrate the retired theme engine. */
export async function readLegacyAppearance(root: string): Promise<'dark' | 'light' | 'system' | undefined> {
  const old = join(root, 'themes')
  const names = await readdir(old).catch(() => [])
  const files = [join(root, 'theme.json'), join(old, 'default.json'), ...names.filter(name => name !== 'default.json' && name.endsWith('.json')).sort().slice(0, 32).map(name => join(old, name))]
  for (const file of files) {
    try {
      const data = JSON.parse((await readBoundedFile(file, 256 * 1024)).toString('utf8')), dark = data?.settings?.dark
      if (dark === true || dark === 'dark') return 'dark'
      if (dark === false || dark === 'light') return 'light'
      if (dark === 'system' || dark === 'auto') return 'system'
    } catch { /* Malformed, linked or oversized legacy files stay inert. */ }
  }
}
