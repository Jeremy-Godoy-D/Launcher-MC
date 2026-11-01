function parse(value: string) {
  try {
    // Reject whitespace and controls before the URL parser normalizes them away.
    // eslint-disable-next-line no-control-regex
    if (typeof value !== 'string' || value.length > 16384 || /[\x00-\x20\x7f]/.test(value)) return undefined
    const url = new URL(value)
    return url.username || url.password ? undefined : url
  } catch { return undefined }
}

export function rendererNavigation(target: string, entry: string) {
  const url = parse(target), expected = parse(entry)
  if (!url || !expected || url.protocol !== expected.protocol || url.hostname !== expected.hostname || url.origin !== expected.origin) return false
  if (expected.protocol === 'file:') return url.pathname === expected.pathname
  return expected.protocol === 'http:' || expected.protocol === 'https:'
}

export function externalNavigation(target: string) {
  const url = parse(target)
  return url && ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : undefined
}

/** DeskGap maps the packaged entry to a virtual HTTPS host; pin its first native navigation. */
export function deskGapNavigation(entry: string) {
  let origin: string | undefined
  return (target: string) => {
    const url = parse(target)
    if (!url || url.protocol !== 'https:' || url.port || !/^[a-z0-9-]+\.deskgap\.test$/.test(url.hostname)) return false
    if (!origin) {
      if (!url.pathname.endsWith('/' + entry)) return false
      origin = url.origin
    }
    return url.origin === origin
  }
}
