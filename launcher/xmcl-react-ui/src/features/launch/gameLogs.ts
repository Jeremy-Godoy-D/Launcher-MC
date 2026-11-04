import type { GameOutputIdentity } from '@xmcl/runtime-api/src/services/LaunchService'
import { MAX_CONSOLE_LINE, MAX_CONSOLE_LINES, MAX_CONSOLE_TEXT, parseLogLine, type LogEntry } from '../instance/consoleLog'

export type GameIdentity = Readonly<Omit<GameOutputIdentity, 'sequence'>>
type Channel = 'stdout' | 'stderr'
export type LifecycleMessage = Readonly<{ kind: 'start' | 'exit'; pid: number; code?: number; signal?: string }>
export type GameLogEntry = Readonly<LogEntry & GameIdentity & { channel: Channel | 'system'; system?: LifecycleMessage }>
export type GameLogsSnapshot = Readonly<{ entries: readonly GameLogEntry[]; limited: boolean }>
type Stream = { row?: Row; skipLF?: boolean; dropping?: boolean }
type Session = { identity: GameIdentity; stdout: Stream; stderr: Stream; last?: number; started: boolean }
type Row = { id: number; raw: string; identity: GameIdentity; channel: Channel | 'system'; timestamp?: string; system?: LifecycleMessage; stream?: Stream; cached?: GameLogEntry }
const same = (a: GameIdentity, b: GameIdentity) => a.pid === b.pid && a.launchId === b.launchId && a.gameDirectory === b.gameDirectory && a.side === b.side
const valid = (value: GameIdentity) => typeof value.launchId === 'string' && !!value.launchId && typeof value.gameDirectory === 'string' && !!value.gameDirectory && Number.isSafeInteger(value.pid) && value.pid > 0 && (value.side === 'client' || value.side === 'server')
const copyIdentity = (value: GameIdentity): GameIdentity => Object.freeze({ pid: value.pid, launchId: value.launchId, gameDirectory: value.gameDirectory, side: value.side })

/** One bounded history for the window, shared by all instance views. */
export class GameLogBuffer {
  private rows: (Row | undefined)[] = []
  private head = 0
  private units = 0
  private serial = 0
  private limited = false
  private sessions = new Map<string, Session>()
  private closed = new Set<string>()
  private session(identity: GameIdentity) {
    if (!valid(identity) || this.closed.has(identity.launchId)) return undefined
    const known = this.sessions.get(identity.launchId)
    if (known) return same(known.identity, identity) ? known : undefined
    if (this.sessions.size >= 256) {
      const id = this.sessions.keys().next().value!, session = this.sessions.get(id)!
      this.finish(session.stdout); this.finish(session.stderr); this.sessions.delete(id); this.limited = true
    }
    const session: Session = { identity: copyIdentity(identity), stdout: {}, stderr: {}, started: false }
    this.sessions.set(identity.launchId, session)
    return session
  }
  private cost(row: Row) {
    // Reserve room for the localized lifecycle text added by the view.
    return row.system ? 256 : row.raw.length + 1
  }
  private add(identity: GameIdentity, channel: Row['channel'], stream?: Stream, system?: LifecycleMessage) {
    const row: Row = { id: ++this.serial, raw: '', identity, channel, stream, system, ...(system ? { timestamp: new Date().toTimeString().slice(0, 8) } : {}) }
    this.rows.push(row); this.units += this.cost(row)
    if (stream) stream.row = row
    return row
  }
  private finish(stream: Stream) {
    if (stream.row) stream.row.stream = undefined
    stream.row = undefined; stream.dropping = false; stream.skipLF = false
  }
  private trim() {
    while (this.rows.length - this.head > MAX_CONSOLE_LINES || this.units > MAX_CONSOLE_TEXT) {
      const row = this.rows[this.head]!
      this.rows[this.head++] = undefined; this.units -= this.cost(row); this.limited = true
      if (row.stream?.row === row) { row.stream.row = undefined; row.stream.dropping = true }
    }
    if (this.head > MAX_CONSOLE_LINES) { this.rows = this.rows.slice(this.head); this.head = 0 }
  }
  private fragment(session: Session, channel: Channel, text: string) {
    if (!text) return
    const stream = session[channel]
    if (stream.dropping) return
    const row = stream.row ?? this.add(session.identity, channel, stream)
    let end = Math.min(text.length, MAX_CONSOLE_LINE - row.raw.length)
    if (end > 0 && end < text.length && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff && text.charCodeAt(end) >= 0xdc00 && text.charCodeAt(end) <= 0xdfff) end--
    const previous = row.raw.length
    row.raw += text.slice(0, end)
    if (end < text.length) {
      if (row.raw.charCodeAt(row.raw.length - 1) >= 0xd800 && row.raw.charCodeAt(row.raw.length - 1) <= 0xdbff) row.raw = row.raw.slice(0, -1)
      stream.dropping = true; this.limited = true
    }
    this.units += row.raw.length - previous; row.cached = undefined
  }
  start(identity: GameIdentity) {
    const session = this.session(identity)
    if (!session || session.started) return false
    session.started = true; session.last ??= 0
    this.add(session.identity, 'system', undefined, Object.freeze({ kind: 'start', pid: identity.pid })); this.trim()
    return true
  }
  output(identity: GameOutputIdentity, channel: Channel, text: string) {
    if (!Number.isSafeInteger(identity.sequence) || identity.sequence < 1 || typeof text !== 'string') return false
    const session = this.session(identity)
    if (!session || (session.last !== undefined && identity.sequence <= session.last)) return false
    const gap = session.last !== undefined && identity.sequence !== session.last + 1
    if (gap) {
      this.finish(session.stdout); this.finish(session.stderr); this.limited = true
    }
    session.last = identity.sequence
    const stream = session[channel]
    let start = 0
    for (let index = 0; index < text.length; index++) {
      const char = text[index]
      if (stream.skipLF) { stream.skipLF = false; if (char === '\n') { start = index + 1; continue } }
      if (char !== '\r' && char !== '\n') continue
      this.fragment(session, channel, text.slice(start, index))
      if (!stream.row && !stream.dropping) this.add(session.identity, channel, stream)
      this.finish(stream); stream.skipLF = char === '\r'; start = index + 1
      this.trim()
    }
    this.fragment(session, channel, text.slice(start)); this.trim()
    return !!text.length || gap
  }
  exit(identity: GameIdentity, result: { code?: number; signal?: string }) {
    if (!valid(identity) || this.closed.has(identity.launchId)) return false
    const session = this.sessions.get(identity.launchId)
    if (session && !same(session.identity, identity)) return false
    if (session) { this.finish(session.stdout); this.finish(session.stderr); this.sessions.delete(identity.launchId) }
    this.closed.add(identity.launchId)
    if (this.closed.size > 256) this.closed.delete(this.closed.values().next().value!)
    this.add(session?.identity ?? copyIdentity(identity), 'system', undefined, Object.freeze({ kind: 'exit', pid: identity.pid, code: result.code, signal: result.signal })); this.trim()
    return true
  }
  clear(path: string) {
    const remaining: Row[] = []
    for (const row of this.rows.slice(this.head)) {
      if (row!.identity.gameDirectory !== path) { remaining.push(row!); continue }
      const stream = row!.stream
      if (stream && stream.row === row) { stream.row = undefined; stream.dropping = false }
    }
    this.rows = remaining; this.head = 0; this.units = remaining.reduce((total, row) => total + this.cost(row), 0)
    if (!remaining.length) this.limited = false
  }
  snapshot(): GameLogsSnapshot {
    const entries = this.rows.slice(this.head).map(row => {
      if (!row!.cached) {
        const last = row!.raw.charCodeAt(row!.raw.length - 1)
        const raw = last >= 0xd800 && last <= 0xdbff ? row!.raw.slice(0, -1) : row!.raw
        row!.cached = Object.freeze({ ...parseLogLine(raw, row!.id, row!.channel === 'stderr' ? 'error' : 'info'), ...row!.identity, id: `live-${row!.id}`, channel: row!.channel, ...(row!.system ? { system: row!.system, timestamp: row!.timestamp } : {}) })
      }
      return row!.cached
    })
    return Object.freeze({ entries: Object.freeze(entries), limited: this.limited })
  }
}
