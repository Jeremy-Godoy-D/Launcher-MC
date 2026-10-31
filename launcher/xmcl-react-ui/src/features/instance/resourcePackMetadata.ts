export function resourcePackFormat(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

/** Extract display text only; pack click/hover actions and formatting never reach the DOM. */
export function resourcePackDescription(value: unknown) {
  let text = '', visited = 0, truncated = false
  function visit(value: unknown, depth = 0) {
    if (depth > 32 || ++visited > 2048 || text.length >= 32768) { truncated = true; return }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      const part = String(value).replace(/§[0-9a-fk-or]/gi, '')
      if (part.length > 32768 - text.length) truncated = true
      text += part.slice(0, 32768 - text.length)
    } else if (Array.isArray(value)) {
      for (const child of value) { visit(child, depth + 1); if (truncated) break }
    } else if (value && typeof value === 'object') {
      const node = value as Record<string, unknown>
      visit(typeof node.text === 'string' ? node.text : typeof node.translate === 'string' ? node.translate : '', depth + 1)
      if (Array.isArray(node.extra)) visit(node.extra, depth + 1)
    }
  }
  visit(value)
  return { text, truncated }
}
