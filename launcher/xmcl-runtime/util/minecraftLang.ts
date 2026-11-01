import { FileSystem } from '@xmcl/system'
import { join } from 'path'
import { parseProgressJson, progressBudget, progressIdentifier, readProgressFile, type ProgressBudget } from '../save/progressFiles'

export function toMcLang(locale: string): string {
  const lower = (locale || 'en').toLowerCase().replace(/-/g, '_')
  if (lower === 'en_in') return 'en_us'
  if (lower === 'ar_eg') return 'ar_sa'
  if (lower.includes('_')) return lower
  const defaults: Record<string, string> = {
    en: 'en_us', zh: 'zh_cn', ru: 'ru_ru', ja: 'ja_jp', ko: 'ko_kr', fr: 'fr_fr',
    de: 'de_de', es: 'es_es', pt: 'pt_br', it: 'it_it', uk: 'uk_ua', pl: 'pl_pl',
    nl: 'nl_nl', tr: 'tr_tr', cs: 'cs_cz', vi: 'vi_vn', th: 'th_th', gl: 'gl_es',
    kz: 'kk_kz', lolcat: 'lol_us', ar: 'ar_sa', bn: 'bn_bd', hi: 'hi_in',
    hu: 'hu_hu', id: 'id_id', sa: 'sa_in', ta: 'ta_in',
  }
  return defaults[lower] ?? `${lower}_${lower}`
}

export async function assignJarLang(
  fs: FileSystem | undefined,
  namespace: string,
  code: string,
  target: Record<string, string>,
): Promise<void> {
  if (!fs) return
  if (!/^[a-z0-9_.-]+$/.test(namespace) || !/^[a-z0-9_]+$/.test(code)) throw new Error('Invalid Minecraft language resource')
  for (const extension of ['json', 'lang']) {
    const path = `assets/${namespace}/lang/${code}.${extension}`
    if (!await fs.existsFile(path)) continue
    const content = await fs.readFile(path, 'utf-8')
    Object.assign(target, extension === 'json' ? parseProgressJson(content) : parseLegacyLang(content))
    return
  }
}

function parseLegacyLang(content: string): Record<string, string> {
  return Object.fromEntries(content.split(/\r?\n/).filter(line => !line.startsWith('#') && line.includes('='))
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
}

/** Read only the asset index belonging to the selected game version. */
export async function readVanillaLangFromAssets(root: string, indexId: string, code: string, budget: ProgressBudget = progressBudget()): Promise<Record<string, string> | undefined> {
  progressIdentifier(indexId); progressIdentifier(code)
  const indexPath = join(root, 'assets', 'indexes', `${indexId}.json`)
  const content = await readProgressFile(root, indexPath, budget).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (!content) return undefined
  const index = parseProgressJson(content.toString('utf8'))
  for (const extension of ['json', 'lang']) {
    const hash = index.objects?.[`minecraft/lang/${code}.${extension}`]?.hash
    if (typeof hash !== 'string' || !/^[a-f0-9]{40}$/i.test(hash)) continue
    const objectPath = join(root, 'assets', 'objects', hash.slice(0, 2), hash)
    const bytes = await readProgressFile(root, objectPath, budget).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (!bytes) return undefined
    return extension === 'json' ? parseProgressJson(bytes.toString('utf8')) : parseLegacyLang(bytes.toString('utf8'))
  }
  return undefined
}
