import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect, type CSSProperties } from 'react'
import {
  Terminal,
  Copy,
  Check,
  Trash2,
  Download,
  ExternalLink,
  FolderOpen,
  RefreshCw,
  ArrowDownToLine,
} from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { parseLogFile, parseLogLine, type LogEntry } from './consoleLog'
import { InstanceLogServiceKey } from '@xmcl/runtime-api/src/services/InstanceLogService'
import { LaunchServiceKey } from '@xmcl/runtime-api/src/services/LaunchService'
import type { SavedInstance } from '../library/model'
import { useService, useServiceEvent } from '../../runtime'
import { useI18n } from '../../i18n'
import { useGameLogs, useLaunch } from '../launch/context'

export function InstanceConsole({ instance, initialSource = '__live__', detached = false }: { instance: SavedInstance; initialSource?: string; detached?: boolean }) {
  const { t } = useI18n()
  const logService = useService(InstanceLogServiceKey)
  const launch = useLaunch()
  const logs = useGameLogs()

  const [selectedSource, setSelectedSource] = useState(initialSource)
  const [logFiles, setLogFiles] = useState<string[]>([])
  const [crashReports, setCrashReports] = useState<string[]>([])
  const liveEntries = useMemo(() => logs.entries.filter(entry => entry.gameDirectory === instance.path).map(entry => {
    if (!entry.system) return entry
    const message = entry.system
    const text = message.kind === 'start' ? t('react.instanceConsole.started', { pid: message.pid })
      : message.signal ? t('react.instanceConsole.exitedSignal', { pid: message.pid, signal: message.signal })
        : message.code !== undefined ? t('react.instanceConsole.exitedCode', { pid: message.pid, code: message.code })
          : t('react.instanceConsole.exited', { pid: message.pid })
    return { ...entry, ...parseLogLine(`[${entry.timestamp}] [${t('react.instanceConsole.system')}/INFO]: ${text}`, 0), id: entry.id }
  }), [logs, instance.path, t])
  const [fileView, setFileView] = useState<{ source: string; entries: LogEntry[]; limited: boolean }>()
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'debug'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [autoscroll, setAutoscroll] = useState(true)
  const [action, setAction] = useState<'copy' | 'export'>()
  const [success, setSuccess] = useState<'copy' | 'export'>()
  const [actionError, setActionError] = useState<'copyError' | 'exportError'>()
  const actionBusy = useRef(false)
  const opening = useRef(false)
  const [openingWindow, setOpeningWindow] = useState(false)
  const [windowError, setWindowError] = useState(false)
  const actionEpoch = useRef(0)
  const mounted = useRef(false)
  const successTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [listing, setListing] = useState(false)
  const [reading, setReading] = useState(false)
  const [fileRevision, setFileRevision] = useState(0)
  const [fileErrors, setFileErrors] = useState<Partial<Record<'list' | 'read' | 'show', string>>>({})
  const loading = listing || reading
  const hasActiveProcess = !!launch?.running.some(process => process.path === instance.path)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const listRequest = useRef(0)
  const showRequest = useRef(0)
  const fileErrorKey = (error: unknown) => error && typeof error === 'object' && 'name' in error && error.name === 'InstanceLogTooLarge' ? 'tooLarge' : 'fileError'

  // Load available log and crash report files
  const refreshFiles = useCallback(() => {
    const request = ++listRequest.current
    setListing(true)
    setFileErrors(previous => ({ ...previous, list: undefined, show: undefined }))
    void Promise.allSettled([logService.listLogs(instance.path), logService.listCrashReports(instance.path)]).then(([logs, crashes]) => {
      if (listRequest.current !== request) return
      if (logs.status === 'fulfilled') setLogFiles(logs.value)
      if (crashes.status === 'fulfilled') setCrashReports(crashes.value)
      setSelectedSource(previous => previous.startsWith('log:') && logs.status === 'fulfilled' && !logs.value.includes(previous.slice(4))
        || previous.startsWith('crash:') && crashes.status === 'fulfilled' && !crashes.value.includes(previous.slice(6)) ? '__live__' : previous)
      const failure = [logs, crashes].find(result => result.status === 'rejected')
      if (failure?.status === 'rejected') setFileErrors(previous => ({ ...previous, list: fileErrorKey(failure.reason) }))
      setListing(false)
    })
  }, [logService, instance.path])

  useEffect(() => {
    refreshFiles()
    return () => { listRequest.current++; showRequest.current++ }
  }, [refreshFiles])

  useServiceEvent(LaunchServiceKey, 'minecraft-exit', (event) => {
    if (event.gameDirectory === instance.path) refreshFiles()
  })

  // Load file content when a stored log or crash report is selected
  useEffect(() => {
    let cancelled = false
    showRequest.current++
    setFileErrors(previous => ({ ...previous, read: undefined, show: undefined }))
    if (selectedSource === '__live__') {
      setFileView(undefined)
      setReading(false)
      return
    }

    setReading(true)
    const isCrash = selectedSource.startsWith('crash:')
    const loadPromise = isCrash
      ? logService.getCrashReportContent(instance.path, selectedSource.slice(6))
      : logService.getLogContent(instance.path, selectedSource.slice(4))

    loadPromise
      .then((content) => {
        if (cancelled) return
        setFileView({ source: selectedSource, ...parseLogFile(content, isCrash ? 'error' : 'info') })
      })
      .catch((error) => {
        if (!cancelled) { setFileView(undefined); setFileErrors(previous => ({ ...previous, read: fileErrorKey(error) })) }
      })
      .finally(() => {
        if (!cancelled) setReading(false)
      })
    return () => { cancelled = true }
  }, [selectedSource, instance.path, logService, fileRevision])

  // Filter entries based on level and search query
  const currentEntries = useMemo(() => selectedSource === '__live__' ? liveEntries : fileView?.source === selectedSource ? fileView.entries : [], [selectedSource, liveEntries, fileView])

  const filteredEntries = useMemo(() => {
    let result = currentEntries

    if (levelFilter !== 'all') {
      result = result.filter((e) => e.raw.trim() && e.level === levelFilter)
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

  const large = filteredEntries.length > 80
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: filteredEntries.length,
    enabled: large,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 22,
    getItemKey: useCallback((index: number) => filteredEntries[index].id, [filteredEntries]),
    overscan: 8,
    useFlushSync: false,
  })
  useLayoutEffect(() => { virtualizer.measure() }, [selectedSource, levelFilter, searchQuery, fileView])
  useLayoutEffect(() => {
    // The virtualizer retains sizes by key after old live rows leave the window budget.
    if (virtualizer.itemSizeCache.size <= filteredEntries.length) return
    const keys = new Set(filteredEntries.map(entry => entry.id))
    for (const key of virtualizer.itemSizeCache.keys()) if (!keys.has(String(key))) virtualizer.itemSizeCache.delete(key)
  }, [filteredEntries])

  // Autoscroll
  useLayoutEffect(() => {
    if (autoscroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [filteredEntries, autoscroll, virtualizer.getTotalSize()])

  useLayoutEffect(() => {
    mounted.current = true; actionEpoch.current++
    setSuccess(undefined); setActionError(undefined)
    if (successTimer.current !== undefined) clearTimeout(successTimer.current)
    return () => {
      mounted.current = false; actionEpoch.current++
      if (successTimer.current !== undefined) clearTimeout(successTimer.current)
    }
  }, [selectedSource, levelFilter, searchQuery])

  async function runAction(kind: 'copy' | 'export') {
    if (actionBusy.current || !filteredEntries.length) return
    actionBusy.current = true; setAction(kind); setSuccess(undefined); setActionError(undefined)
    if (successTimer.current !== undefined) clearTimeout(successTimer.current)
    const epoch = actionEpoch.current
    const text = filteredEntries.map((e) => e.raw).join('\n')
    const source = selectedSource === '__live__' ? 'live' : selectedSource.slice(selectedSource.startsWith('crash:') ? 6 : 4)
    const name = `${`${instance.name}-${source}`.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 140)}-${Date.now()}.log`
    try {
      const controller = window.windowController
      if (kind === 'copy') {
        if (!controller?.writeClipboard) throw new Error('Native clipboard unavailable')
        await controller.writeClipboard(text)
      } else {
        if (!controller?.exportLogView) throw new Error('Native log export unavailable')
        if (!await controller.exportLogView(text, name)) return
      }
      if (mounted.current && epoch === actionEpoch.current) {
        setSuccess(kind)
        successTimer.current = setTimeout(() => { if (mounted.current && epoch === actionEpoch.current) setSuccess(undefined) }, 2000)
      }
    } catch {
      if (mounted.current && epoch === actionEpoch.current) setActionError(kind === 'copy' ? 'copyError' : 'exportError')
    } finally {
      actionBusy.current = false
      if (mounted.current) setAction(undefined)
    }
  }

  // Clear
  function clearLogs() {
    setSuccess(undefined); setActionError(undefined)
    if (successTimer.current !== undefined) clearTimeout(successTimer.current)
    if (selectedSource === '__live__') {
      launch?.store.clearLogs(instance.path)
    } else {
      setFileView(undefined)
    }
  }

  // Open external window
  async function openWindow() {
    if (opening.current) return
    opening.current = true; setOpeningWindow(true); setWindowError(false)
    try {
      if (!window.windowController?.openLogger) throw new Error('Native logger unavailable')
      await window.windowController.openLogger(instance.path, selectedSource)
    } catch { if (mounted.current) setWindowError(true) }
    finally { opening.current = false; if (mounted.current) setOpeningWindow(false) }
  }

  // Show in explorer
  async function showInFolder() {
    const request = ++showRequest.current
    setFileErrors(previous => ({ ...previous, show: undefined }))
    if (selectedSource && selectedSource !== '__live__') {
      try {
        if (selectedSource.startsWith('crash:')) await logService.showCrash(instance.path, selectedSource.slice(6))
        else await logService.showLog(instance.path, selectedSource.slice(4))
      } catch (error) { if (showRequest.current === request) setFileErrors(previous => ({ ...previous, show: fileErrorKey(error) })) }
    }
  }

  function row(entry: LogEntry, index: number, style?: CSSProperties) {
    return <div key={entry.id} ref={large ? virtualizer.measureElement : undefined} data-index={index} style={style}
      data-testid="console-entry" data-level={entry.level} className={`console-line level-${entry.level}`}
      role="listitem" aria-posinset={index + 1} aria-setsize={filteredEntries.length}>
      {entry.raw.trim() ? <>
        {entry.timestamp && <span className="console-time">[{entry.timestamp}]</span>}
        <span className="console-level">[{entry.level}]</span>
        {entry.source && <span className="console-source">[{entry.source}]</span>}
        <span className="console-text">{entry.text}</span>
      </> : <span className="console-text" aria-hidden="true">{entry.raw || '\u00a0'}</span>}
    </div>
  }

  return (
    <section className="instance-console" data-testid="instance-console" aria-label={t('react.instanceConsole.title')}>
      {!detached && <div className="console-header">
        <h2>{t('react.instanceConsole.title')}</h2>
        <p className="form-description">{t('react.instanceConsole.description')}</p>
      </div>}

      <div className="console-toolbar" role="toolbar" aria-label={t('react.instanceConsole.title')}>
        <div className="console-toolbar-group">
          <label htmlFor="console-file-select" className="sr-only">
            {t('react.instanceConsole.sourceLabel')}
          </label>
          <select
            id="console-file-select"
            data-testid="console-file-select"
            value={selectedSource}
            title={selectedSource === '__live__' ? t('react.instanceConsole.liveLogs') : selectedSource.slice(selectedSource.startsWith('crash:') ? 6 : 4)}
            onChange={(e) => setSelectedSource(e.target.value)}
            aria-label={t('react.instanceConsole.sourceLabel')}
          >
            <option value="__live__">{t('react.instanceConsole.liveLogs')}</option>
            {logFiles.length > 0 && (
              <optgroup label={t('react.instanceConsole.logsHeader')}>
                {logFiles.map((file) => (
                  <option key={file} value={`log:${file}`}>
                    {file}
                  </option>
                ))}
              </optgroup>
            )}
            {crashReports.length > 0 && (
              <optgroup label={t('react.instanceConsole.crashesHeader')}>
                {crashReports.map((file) => (
                  <option key={file} value={`crash:${file}`}>
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
          {!autoscroll && <button type="button" className="button secondary" data-testid="console-follow" onClick={() => setAutoscroll(true)}>
            <ArrowDownToLine size={16} aria-hidden="true" />{t('react.instanceConsole.follow')}
          </button>}
        </div>

        <div className="console-toolbar-group">
          <button
            type="button"
            className="button secondary"
            data-testid="console-copy"
            onClick={() => { void runAction('copy') }}
            disabled={filteredEntries.length === 0 || !!action}
            aria-busy={action === 'copy'}
            title={t('react.instanceConsole.copy')}
          >
            {success === 'copy' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            <span aria-live="polite">{action === 'copy' ? t('react.instanceConsole.copyPending') : success === 'copy' ? t('react.instanceConsole.copied') : t('react.instanceConsole.copy')}</span>
          </button>

          <button
            type="button"
            className="button secondary"
            data-testid="console-export"
            onClick={() => { void runAction('export') }}
            disabled={filteredEntries.length === 0 || !!action}
            aria-busy={action === 'export'}
            title={t('react.instanceConsole.export')}
          >
            <Download size={16} aria-hidden="true" />
            <span aria-live="polite">{action === 'export' ? t('react.instanceConsole.exportPending') : success === 'export' ? t('react.instanceConsole.exported') : t('react.instanceConsole.export')}</span>
          </button>

          <button
            type="button"
            className="button secondary"
            data-testid="console-clear"
            onClick={clearLogs}
            disabled={currentEntries.length === 0 || !!action}
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

          {!detached && <button
            type="button"
            className="button secondary"
            data-testid="console-open-window"
            onClick={() => { void openWindow() }}
            disabled={openingWindow}
            aria-busy={openingWindow}
            title={t('react.instanceConsole.openWindow')}
          >
            <ExternalLink size={16} aria-hidden="true" />
            {t('react.instanceConsole.openWindow')}
          </button>}

          <button
            type="button"
            className="button secondary"
            data-testid="console-refresh"
            onClick={() => { refreshFiles(); setFileRevision(value => value + 1); void launch?.store.refreshProcesses() }}
            disabled={loading}
            title={t('react.instanceConsole.refresh')}
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div>
        {windowError && <p className="form-error" role="alert">{t('react.instanceConsole.openError')}</p>}
        {actionError && <p className="form-error" role="alert">{t(`react.instanceConsole.${actionError}`)}</p>}
        {Object.entries(fileErrors).filter(([, value]) => value).map(([operation, key]) => <p key={operation} className="form-error" role="alert">{t(`react.instanceConsole.${key}`)}</p>)}
        {fileView?.source === selectedSource && fileView.limited && <p className="form-description" role="status">{t('react.instanceConsole.limited')}</p>}
        {selectedSource === '__live__' && logs.limited && <p className="form-description" role="status">{t('react.instanceConsole.liveLimited')}</p>}
        {launch?.processError && <p className="form-error" role="alert">{t('react.instanceConsole.processError')}</p>}
      </div>

      <div
        data-testid="console-entries"
        className="console-entries"
        ref={scrollContainerRef}
        role="region"
        aria-label={t('react.instanceConsole.title')}
        tabIndex={0}
        onScroll={event => { const element = event.currentTarget; if (autoscroll && element.scrollHeight - element.clientHeight - element.scrollTop > 32) setAutoscroll(false) }}
        onKeyDown={event => {
          if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || !['Home', 'End'].includes(event.key)) return
          event.preventDefault(); setAutoscroll(false)
          event.currentTarget.scrollTop = event.key === 'Home' ? 0 : event.currentTarget.scrollHeight
        }}
      >
        {filteredEntries.length === 0 ? (
          <div data-testid="console-empty" className="console-empty">
            <Terminal size={32} style={{ opacity: 0.4, marginBottom: 8 }} aria-hidden="true" />
            <p>{searchQuery ? t('react.instanceConsole.noMatches') : t('react.instanceConsole.empty')}</p>
          </div>
        ) : (
          <div role="list" aria-label={t('react.instanceConsole.title')} style={large ? { height: virtualizer.getTotalSize(), position: 'relative' } : undefined}>
            {large ? virtualizer.getVirtualItems().map(item => row(filteredEntries[item.index], item.index, { position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)` })) : filteredEntries.map((entry, index) => row(entry, index))}
          </div>
        )}
      </div>

      <footer className="console-statusbar">
        <div className="console-process-status">
          <span className={`console-status-dot ${hasActiveProcess ? 'active' : ''}`} aria-hidden="true" />
          <span>
            {launch?.processError ? t('react.instanceConsole.processUnknown') : hasActiveProcess
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
