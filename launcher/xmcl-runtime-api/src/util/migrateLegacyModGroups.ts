type LegacyStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

export async function migrateLegacyModGroups(storage: LegacyStorage, path: string, persist: (path: string, mapping: Record<string, string>) => Promise<'existing' | 'imported'>) {
  const raw = storage.getItem('modsGrouping')
  if (!raw) return 'none'
  const source = JSON.parse(raw)
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('InvalidLegacyContentGroups')
  if (!Object.hasOwn(source, path)) return 'none'
  const mapping = source[path]
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping) || Object.values(mapping).some(value => typeof value !== 'string')) throw new Error('InvalidLegacyContentGroups')
  const reviewed = JSON.stringify(mapping)
  const result = await persist(path, mapping)
  if (result !== 'imported') return result
  const latest = JSON.parse(storage.getItem('modsGrouping') || '{}')
  if (!latest || typeof latest !== 'object' || Array.isArray(latest) || JSON.stringify(latest[path]) !== reviewed) return result
  delete latest[path]
  if (Object.keys(latest).length) storage.setItem('modsGrouping', JSON.stringify(latest))
  else storage.removeItem('modsGrouping')
  return result
}
