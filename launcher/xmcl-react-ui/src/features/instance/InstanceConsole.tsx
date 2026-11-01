import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Terminal,
  Copy,
  Check,
  Trash2,
  Download,
  ExternalLink,
  FolderOpen,
  RefreshCw,
} from 'lucide-react'
import { InstanceLogServiceKey } from '@xmcl/runtime-api/src/services/InstanceLogService'
import { LaunchServiceKey } from '@xmcl/runtime-api/src/services/LaunchService'
import type { SavedInstance } from '../library/model'
import { useService, useServiceEvent } from '../../runtime'
import { useI18n } from '../../i18n'

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

export function InstanceConsole({ instance, running }: { instance: SavedInstance; running: boolean }) {
  const { t } = useI18n()
  const logService = useService(InstanceLogServiceKey)
  const launchService = useService(LaunchServiceKey)

  const [selectedSource, setSelectedSource] = useState<'__live__' | string>('__live__')
  const [logFiles, setLogFiles] = useState<string[]>([])
  const [crashReports, setCrashReports] = useState<string[]>([])
  const [liveEntries, setLiveEntries] = useState<LogEntry[]>([])
  const [fileEntries, setFileEntries] = useState<LogEntry[]>([])
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'debug'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [autoscroll, setAutoscroll] = useState(true)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasActiveProcess, setHasActiveProcess] = useState(running)

  const activePids = useRef<Set<number>>(new Set())
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Load existing processes for this instance path
  useEffect(() => {
    launchService.getGameProcesses().then((processes) => {
      const mine = processes.filter((p) => p.options?.gameDirectory === instance.path)
      activePids.current.clear()
      mine.forEach((p) => activePids.current.add(p.pid))
      setHasActiveProcess(mine.length > 0 || running)
    }).catch(() => {})
  }, [launchService, instance.path, running])

  // Load available log and crash report files
  const refreshFiles = () => {
    setLoading(true)
    Promise.all([
      logService.listLogs(instance.path).catch(() => [] as string[]),
      logService.listCrashReports(instance.path).catch(() => [] as string[]),
    ]).then(([logs, crashes]) => {
      setLogFiles(logs)
      setCrashReports(crashes)
    }).finally(() => {
      setLoading(false)
    })
  }

  useEffect(() => {
    refreshFiles()
  }, [instance.path])

  // Real-time events with instance process isolation
  useServiceEvent(LaunchServiceKey, 'minecraft-start', (event) => {
    if (event.gameDirectory === instance.path) {
      activePids.current.add(event.pid)
      setHasActiveProcess(true)
      const now = new Date().toTimeString().slice(0, 8)
      setLiveEntries((prev) => [
        ...prev,
        parseLogLine(`[${now}] [Sistema/INFO]: Proceso iniciado (PID ${event.pid})`, prev.length),
      ])
    }
  })

  useServiceEvent(LaunchServiceKey, 'minecraft-stdout', ({ pid, stdout }) => {
    if (activePids.current.has(pid)) {
      const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0)
      if (lines.length > 0) {
        setLiveEntries((prev) => [
          ...prev,
          ...lines.map((l, i) => parseLogLine(l, prev.length + i)),
        ])
      }
    }
  })

  useServiceEvent(LaunchServiceKey, 'minecraft-stderr', ({ pid, stderr }) => {
    if (activePids.current.has(pid)) {
      const lines = stderr.split(/\r?\n/).filter((l) => l.trim().length > 0)
      if (lines.length > 0) {
        setLiveEntries((prev) => [
          ...prev,
          ...lines.map((l, i) => parseLogLine(l, prev.length + i, 'error')),
        ])
      }
    }
  })

  useServiceEvent(LaunchServiceKey, 'minecraft-exit', (event) => {
    if (activePids.current.has(event.pid)) {
      activePids.current.delete(event.pid)
      setHasActiveProcess(activePids.current.size > 0)
      const now = new Date().toTimeString().slice(0, 8)
      setLiveEntries((prev) => [
        ...prev,
        parseLogLine(`[${now}] [Sistema/INFO]: Proceso terminado (Código ${event.code ?? 0})`, prev.length),
      ])
      refreshFiles()
    }
  })

  // Load file content when a stored log or crash report is selected
  useEffect(() => {
    if (selectedSource === '__live__') {
      setFileEntries([])
      return
    }

    setLoading(true)
    const isCrash = crashReports.includes(selectedSource)
    const loadPromise = isCrash
      ? logService.getCrashReportContent(instance.path, selectedSource)
      : logService.getLogContent(instance.path, selectedSource)

    loadPromise
      .then((content) => {
        const lines = content.split(/\r?\n/).filter((l) => l.length > 0)
        setFileEntries(lines.map((l, i) => parseLogLine(l, i, isCrash ? 'error' : 'info')))
      })
      .catch(() => {
        setFileEntries([])
      })
      .finally(() => {
        setLoading(false)
      })
  }, [selectedSource, instance.path, crashReports, logService])

  // Filter entries based on level and search query
  const currentEntries = selectedSource === '__live__' ? liveEntries : fileEntries

  const filteredEntries = useMemo(() => {
    let result = currentEntries

    if (levelFilter !== 'all') {
      result = result.filter((e) => e.level === levelFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (e) =>
          e.text.toLowerCase().includes(q) ||
          (e.source && e.source.toLowerCase().includes(q)) ||
          e.raw.toLowerCase().includes(q),
      )
    }

    return result
  }, [currentEntries, levelFilter, searchQuery])

  // Autoscroll
  useEffect(() => {
    if (autoscroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [filteredEntries, autoscroll])

  // Copy
  async function copyLogs() {
    const text = filteredEntries.map((e) => e.raw).join('\n')
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Ignore
    }
  }

  // Clear
  function clearLogs() {
    if (selectedSource === '__live__') {
      setLiveEntries([])
    } else {
      setFileEntries([])
    }
  }

  // Export
  function exportLogs() {
    const text = filteredEntries.map((e) => e.raw).join('\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${instance.name.replace(/[^a-zA-Z0-9_-]/g, '_')}-${selectedSource === '__live__' ? 'live' : selectedSource}-${Date.now()}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Open external window
  function openWindow() {
    window.open('logger.html', 'grimo-logger', 'width=900,height=600')
  }

  // Show in explorer
  function showInFolder() {
    if (selectedSource && selectedSource !== '__live__') {
      if (crashReports.includes(selectedSource)) {
        logService.showCrash(instance.path, selectedSource)
      } else {
        logService.showLog(instance.path, selectedSource)
      }
    }
  }

  return (
    <section className="instance-console" data-testid="instance-console" aria-label={t('react.instanceConsole.title')}>
      <div className="console-header">
        <h2>{t('react.instanceConsole.title')}</h2>
        <p className="form-description">{t('react.instanceConsole.description')}</p>
      </div>

      <div className="console-toolbar" role="toolbar" aria-label={t('react.instanceConsole.title')}>
        <div className="console-toolbar-group">
          <label htmlFor="console-file-select" className="sr-only">
            {t('react.instanceConsole.sourceLabel')}
          </label>
          <select
            id="console-file-select"
            data-testid="console-file-select"
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            aria-label={t('react.instanceConsole.sourceLabel')}
          >
            <option value="__live__">{t('react.instanceConsole.liveLogs')}</option>
            {logFiles.length > 0 && (
              <optgroup label={t('react.instanceConsole.logsHeader')}>
                {logFiles.map((file) => (
                  <option key={file} value={file}>
                    {file}
                  </option>
                ))}
              </optgroup>
            )}
            {crashReports.length > 0 && (
              <optgroup label={t('react.instanceConsole.crashesHeader')}>
                {crashReports.map((file) => (
                  <option key={file} value={file}>
                    {file}
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          <label htmlFor="console-level-filter" className="sr-only">
            {t('react.instanceConsole.levelLabel')}
          </label>
          <select
            id="console-level-filter"
            data-testid="console-level-filter"
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as any)}
            aria-label={t('react.instanceConsole.levelLabel')}
          >
            <option value="all">{t('react.instanceConsole.levelAll')}</option>
            <option value="info">{t('react.instanceConsole.levelInfo')}</option>
            <option value="warn">{t('react.instanceConsole.levelWarn')}</option>
            <option value="error">{t('react.instanceConsole.levelError')}</option>
            <option value="debug">{t('react.instanceConsole.levelDebug')}</option>
          </select>

          <label htmlFor="console-search" className="sr-only">
            {t('react.instanceConsole.searchLabel')}
          </label>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <input
              id="console-search"
              data-testid="console-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('react.instanceConsole.searchPlaceholder')}
              aria-label={t('react.instanceConsole.searchLabel')}
            />
          </div>

          <label className="console-autoscroll-label" htmlFor="console-autoscroll">
            <input
              id="console-autoscroll"
              data-testid="console-autoscroll"
              type="checkbox"
              checked={autoscroll}
              onChange={(e) => setAutoscroll(e.target.checked)}
            />
            {t('react.instanceConsole.autoscroll')}
          </label>
        </div>

        <div className="console-toolbar-group">
          <button
            type="button"
            className="button secondary"
            data-testid="console-copy"
            onClick={copyLogs}
            disabled={filteredEntries.length === 0}
            title={t('react.instanceConsole.copy')}
          >
            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copied ? t('react.instanceConsole.copied') : t('react.instanceConsole.copy')}
          </button>

          <button
            type="button"
            className="button secondary"
            data-testid="console-export"
            onClick={exportLogs}
            disabled={filteredEntries.length === 0}
            title={t('react.instanceConsole.export')}
          >
            <Download size={16} aria-hidden="true" />
            {t('react.instanceConsole.export')}
          </button>

          <button
            type="button"
            className="button secondary"
            data-testid="console-clear"
            onClick={clearLogs}
            disabled={currentEntries.length === 0}
            title={t('react.instanceConsole.clear')}
          >
            <Trash2 size={16} aria-hidden="true" />
            {t('react.instanceConsole.clear')}
          </button>

          {selectedSource !== '__live__' && (
            <button
              type="button"
              className="button secondary"
              data-testid="console-show-file"
              onClick={showInFolder}
              title={t('react.instanceConsole.showInFolder')}
            >
              <FolderOpen size={16} aria-hidden="true" />
              {t('react.instanceConsole.showInFolder')}
            </button>
          )}

          <button
            type="button"
            className="button secondary"
            data-testid="console-open-window"
            onClick={openWindow}
            title={t('react.instanceConsole.openWindow')}
          >
            <ExternalLink size={16} aria-hidden="true" />
            {t('react.instanceConsole.openWindow')}
          </button>

          <button
            type="button"
            className="button secondary"
            data-testid="console-refresh"
            onClick={refreshFiles}
            disabled={loading}
            title={t('react.instanceConsole.refresh')}
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        data-testid="console-entries"
        className="console-entries"
        ref={scrollContainerRef}
        role="region"
        aria-label={t('react.instanceConsole.title')}
        tabIndex={0}
      >
        {filteredEntries.length === 0 ? (
          <div data-testid="console-empty" className="console-empty">
            <Terminal size={32} style={{ opacity: 0.4, marginBottom: 8 }} aria-hidden="true" />
            <p>{searchQuery ? t('react.instanceConsole.noMatches') : t('react.instanceConsole.empty')}</p>
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <div
              key={entry.id}
              data-testid="console-entry"
              data-level={entry.level}
              className={`console-line level-${entry.level}`}
            >
              {entry.timestamp && <span className="console-time">[{entry.timestamp}]</span>}
              <span className="console-level">[{entry.level}]</span>
              {entry.source && <span className="console-source">[{entry.source}]</span>}
              <span className="console-text">{entry.text}</span>
            </div>
          ))
        )}
      </div>

      <footer className="console-statusbar">
        <div className="console-process-status">
          <span className={`console-status-dot ${hasActiveProcess ? 'active' : ''}`} aria-hidden="true" />
          <span>
            {hasActiveProcess
              ? t('react.instanceConsole.processRunning')
              : t('react.instanceConsole.processStopped')}
          </span>
        </div>
        <div>
          {t('react.instanceConsole.linesCount', { count: filteredEntries.length })}
        </div>
      </footer>
    </section>
  )
}
