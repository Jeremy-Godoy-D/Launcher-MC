/** The context comes from main after a committed move, never from URL parameters. */
export function migrateSelectedInstance(storage: Pick<Storage, 'getItem' | 'setItem'>, context: { from: string; to: string } | undefined) {
  if (!context) return
  const selected = storage.getItem('selectedInstancePath')
  if (!selected) return
  const normalize = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '')
  const from = `${normalize(context.from)}/instances/`, path = normalize(selected)
  const windows = /^[a-z]:\//i.test(from) || from.startsWith('//')
  if (!(windows ? path.toLowerCase().startsWith(from.toLowerCase()) : path.startsWith(from))) return
  const suffix = path.slice(from.length)
  if (!suffix || suffix.split('/').some(part => !part || part === '.' || part === '..')) return
  const destination = `${normalize(context.to)}/instances/${suffix}`
  storage.setItem('selectedInstancePath', context.to.includes('\\') ? destination.replace(/\//g, '\\') : destination)
}
