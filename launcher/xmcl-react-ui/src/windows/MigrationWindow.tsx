import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { MigrationProgress } from '@xmcl/runtime-api/migration'
import { useI18n } from '../i18n'
import { usePreferences } from '../preferences-context'
import brandIcon from '../../../branding/copper/app-64.png'
import './migration.css'

export function MigrationWindow() {
  const { t, n } = useI18n(), { preferences } = usePreferences()
  const [progress, setProgress] = useState<MigrationProgress>(), [error, setError] = useState(false), [attempt, setAttempt] = useState(0)
  const text = (key: string) => t(`react.migration.${key}`)
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => { document.documentElement.dataset.theme = preferences.appearance === 'system' ? media.matches ? 'dark' : 'light' : preferences.appearance; document.documentElement.dataset.performance = String(preferences.performanceMode) }
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply)
  }, [preferences.appearance, preferences.performanceMode])
  useEffect(() => {
    const bridge = window.migration
    if (!bridge) { setError(true); return }
    let active = true, received = false
    setError(false)
    const changed = (value: MigrationProgress) => { if (active) { received = true; setProgress(value); setError(false) } }
    const failed = () => { if (active) { received = true; setProgress(value => value ? { ...value, phase: 'failed', error: value.error ?? { file: value.file, rollback: 'incomplete' } } : value); setError(true) } }
    bridge.on('progress', changed); bridge.on('error', failed)
    void bridge.getProgress().then(value => { if (active && !received) setProgress(value) }, () => { if (active && !received) setError(true) })
    return () => { active = false; bridge.off('progress', changed); bridge.off('error', failed) }
  }, [attempt])
  const complete = progress?.phase === 'done', failed = progress?.phase === 'failed', dismiss = complete || failed || error
  const value = progress && progress.totalBytes > 0 ? Math.min(100, Math.max(0, progress.copiedBytes / progress.totalBytes * 100)) : complete ? 100 : undefined
  return <div className="migration-window" data-testid="react-migration-window">
    <header className="titlebar"><div className="titlebar-left"><img className="titlebar-logo" src={brandIcon} alt="" /><span>Grimo Launcher</span></div><div className="window-controls"><button aria-label={text('dismiss')} disabled={!dismiss} onClick={() => window.windowController?.hide()}><X size={17} aria-hidden="true" /></button></div></header>
    <main className="migration-content"><h1>{text('title')}</h1><p role={failed ? 'alert' : 'status'} data-testid="migration-status">{text(progress?.phase ?? (error ? 'progressError' : 'loading'))}</p>
      {progress && <><dl className="migration-paths"><dt>{text('source')}</dt><dd>{progress.from}</dd><dt>{text('destination')}</dt><dd>{progress.to}</dd></dl>
        <progress aria-label={text('progress')} max="100" value={value} /><p className="text-muted">{n(progress.copiedFiles)} / {n(progress.totalFiles)} {text('files')}</p>
        {progress.file && <p className="migration-current" title={progress.file}>{progress.file}</p>}
        {failed && <p role="alert" data-testid="migration-recovery">{text(progress.error?.rollback === 'complete' ? 'restored' : 'incomplete')}</p>}
      </>}
      {!progress && error && <button className="button secondary" data-testid="migration-retry" onClick={() => setAttempt(value => value + 1)}>{text('retry')}</button>}
      <p className="text-muted">{text(complete ? 'doneHelp' : failed ? 'failedHelp' : 'keepOpen')}</p>
    </main>
    {dismiss && <footer className="dialog-actions"><button type="button" className="button secondary" data-testid="migration-dismiss" onClick={() => window.windowController?.hide()}>{text('dismiss')}</button></footer>}
  </div>
}
