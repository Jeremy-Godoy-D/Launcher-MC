export interface LogEntry {
  id: string
  timestamp?: string
  level: 'info' | 'warn' | 'error' | 'debug'
  source?: string
  text: string
  raw: string
}

export function parseLogLine(line: string, index: number, defaultLevel?: 'info' | 'warn' | 'error' | 'debug'): LogEntry {
  const match = line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s+\[([^\]]+)\]:?\s*(.*)$/)
  if (match) {
    const [, timestamp, tag, text] = match
    const parts = tag.split('/')
    let level: 'info' | 'warn' | 'error' | 'debug' = 'info'
    let source = tag
    if (parts.length >= 2) {
      source = parts[0]
      const lvl = parts[parts.length - 1].toUpperCase()
      if (lvl === 'WARN' || lvl === 'WARNING') level = 'warn'
      else if (lvl === 'ERROR' || lvl === 'FATAL') level = 'error'
      else if (lvl === 'DEBUG' || lvl === 'TRACE') level = 'debug'
      else level = 'info'
    }
    return {
      id: `entry-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp,
      source,
      level,
      text: text || '',
      raw: line,
    }
  }

  let level: 'info' | 'warn' | 'error' | 'debug' = defaultLevel ?? 'info'
  const upper = line.toUpperCase()
  if (upper.includes('ERROR') || upper.includes('EXCEPTION') || line.trim().startsWith('at ')) {
    level = 'error'
  } else if (upper.includes('WARN')) {
    level = 'warn'
  } else if (upper.includes('DEBUG')) {
    level = 'debug'
  }

  return {
    id: `entry-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    level,
    text: line,
    raw: line,
  }
}

export const MAX_CONSOLE_LINES = 10000
export const MAX_CONSOLE_TEXT = 1024 * 1024
export const MAX_CONSOLE_LINE = 16384

/** A display prefix; the original file stays on disk for full inspection. */
export function parseLogFile(content: string, level: LogEntry['level'] = 'info') {
  const entries: LogEntry[] = []
  const limit = Math.min(content.length, MAX_CONSOLE_TEXT)
  let cursor = 0
  while (cursor < limit && entries.length < MAX_CONSOLE_LINES) {
    let end = cursor
    while (end < limit && end - cursor < MAX_CONSOLE_LINE && content[end] !== '\r' && content[end] !== '\n') end++
    // Keep a surrogate pair together when the display budget cuts a line.
    if (end > cursor && end < content.length && content.charCodeAt(end - 1) >= 0xd800 && content.charCodeAt(end - 1) <= 0xdbff && content.charCodeAt(end) >= 0xdc00 && content.charCodeAt(end) <= 0xdfff) end--
    entries.push(parseLogLine(content.slice(cursor, end), entries.length, level))
    cursor = end
    if (content[cursor] === '\r') { cursor++; if (content[cursor] === '\n') cursor++ }
    else if (content[cursor] === '\n') cursor++
    else break
  }
  return { entries, limited: cursor < content.length }
}
