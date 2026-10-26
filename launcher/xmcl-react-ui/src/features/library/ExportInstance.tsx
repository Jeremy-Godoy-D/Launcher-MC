import { useEffect, useRef, useState } from 'react'
import { ModpackServiceKey, type InstanceExportPreview, type LocalExportFormat } from '@xmcl/runtime-api/src/services/ModpackService'
import { BaseServiceKey } from '@xmcl/runtime-api/src/services/BaseService'
import { TaskState } from '@xmcl/runtime-api/src/task'
import { useService, useTasks } from '../../runtime'
import { useI18n } from '../../i18n'

export function ExportInstance({ path, busy, onBusy, onBack }: { path: string; busy: boolean; onBusy: (value: boolean) => void; onBack: () => void }) {
  const service = useService(ModpackServiceKey), base = useService(BaseServiceKey), tasks = useTasks()
  const { t } = useI18n()
  const [preview, setPreview] = useState<InstanceExportPreview>()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [format, setFormat] = useState<LocalExportFormat>('modrinth')
  const [version, setVersion] = useState('1.0.0')
  const [directory, setDirectory] = useState('')
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const running = useRef(false)
  const task = tasks.tasks.find(task => task.type === 'exportModpack' && task.key === `reviewed-export-${path}` && task.state === TaskState.Running)
  useEffect(() => {
    let current = true
    setLoading(true); setPreview(undefined); setError('')
    service.previewInstanceExport(path).then(value => {
      if (!current) return
      setPreview(value); setSelected(new Set(value.files.filter(file => file.selected).map(file => file.path)))
      if (!value.portable) setFormat('offline')
    }).catch(() => { if (current) setError('reviewFailed') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [service, path, attempt])
  async function save() {
    if (!preview || running.current) return
    running.current = true; onBusy(true); setError('')
    try { setResult(await service.exportReviewedInstance({ instancePath: path, fingerprint: preview.fingerprint, files: [...selected], format, version, destinationDirectory: directory })) }
    catch (failure) {
      const name = failure && typeof failure === 'object' && 'name' in failure && typeof failure.name === 'string' ? failure.name : ''
      setError(['ExportSourceChanged', 'ExportDestinationExists', 'ExportNeedsOffline', 'ExportMissingRuntime', 'ExportGameRunning', 'ExportInvalid', 'ExportInstanceUnavailable'].includes(name) ? name : 'failed')
    } finally { running.current = false; onBusy(false) }
  }
  const visible = (preview?.files || []).filter(file => file.path.toLowerCase().includes(query.trim().toLowerCase()))
  return <form className="operation-form" data-testid="instance-export" onSubmit={event => { event.preventDefault(); void save() }}>
    <div className="creation-body">
      <p className="operation-path">{path}</p>
      {!result && <>
        <label htmlFor="export-format">{t('react.export.format')}</label>
        <select id="export-format" disabled={busy || loading} value={format} onChange={event => setFormat(event.target.value as LocalExportFormat)}>
          <option value="modrinth" disabled={preview && !preview.portable}>Modrinth (.mrpack)</option>
          <option value="curseforge" disabled={preview && !preview.portable}>CurseForge (.zip)</option>
          <option value="offline">{t('react.export.offline')}</option>
        </select>
        <p>{t(format === 'offline' ? 'react.export.offlineHelp' : 'react.export.portableHelp')}</p>
        {preview && !preview.portable && <p>{t('react.export.customVersion')}</p>}
        <label htmlFor="export-version">{t('react.export.version')}</label>
        <input id="export-version" maxLength={80} value={version} disabled={busy} onChange={event => setVersion(event.target.value)} />
        <button type="button" className="button secondary" disabled={busy} onClick={() => {
          void window.windowController?.showOpenDialog?.({ properties: ['openDirectory'] }).then(value => { if (!value.canceled && value.filePaths[0]) { setDirectory(value.filePaths[0]); setError('') } }).catch(() => setError('failed'))
        }}>{t('react.export.chooseFolder')}</button>
        {directory && <p className="operation-path">{directory}</p>}
        <p>{t('react.export.privacy')}</p>
        {loading && <p role="status">{t('react.export.reviewing')}</p>}
        {preview && <>
          <p aria-live="polite">{t('react.export.count', { selected: selected.size, total: preview.files.length })}</p>
          <label htmlFor="export-search">{t('react.export.search')}</label>
          <input id="export-search" type="search" value={query} disabled={busy} onChange={event => setQuery(event.target.value)} />
          <fieldset className="export-files" disabled={busy}>
            <legend>{t('react.export.files')}</legend>
            {visible.slice(0, 200).map(file => <label className="creation-check" key={file.path}><input type="checkbox" checked={selected.has(file.path)} onChange={event => setSelected(previous => {
              const next = new Set(previous); if (event.target.checked) next.add(file.path); else next.delete(file.path); return next
            })} /><span>{file.path} <small>({Math.ceil(file.size / 1024)} KiB)</small></span></label>)}
            {visible.length > 200 && <p>{t('react.export.refine')}</p>}
            {!visible.length && <p>{t('react.export.empty')}</p>}
          </fieldset>
        </>}
        {!busy && <button type="button" className="button secondary" disabled={loading} onClick={() => setAttempt(value => value + 1)}>{t('react.export.reviewAgain')}</button>}
      </>}
      {result && <><p role="status">{t('react.export.saved')}</p><p className="operation-path" data-testid="export-result">{result}</p><button type="button" className="button secondary" onClick={async () => { try { await base.showItemInDirectory(result) } catch { setError('failed') } }}>{t('react.export.reveal')}</button></>}
      {error && <p role="alert" className="form-error">{t(`react.export.${error}`)}</p>}
      {busy && <p role="status">{t('react.export.working')}</p>}
    </div>
    <div className="dialog-actions">
      <button type="button" className="button secondary" disabled={busy} onClick={onBack}>{t('react.operations.back')}</button>
      {busy && task && <button type="button" className="button secondary" onClick={() => void tasks.cancel(task.id).catch(() => setError('failed'))}>{t('react.export.cancel')}</button>}
      {!result && <button type="submit" className="button primary" data-testid="export-confirm" disabled={busy || loading || !preview || !directory || !version.trim()}>{t('react.export.save')}</button>}
    </div>
  </form>
}
