import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FolderOpen, History, X } from 'lucide-react'
import { BaseServiceKey } from '@xmcl/runtime-api/src/services/BaseService'
import { InstanceSavesServiceKey, type SaveChunkBackup, type SaveChunkChange, type SaveChunkReview } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import { useService } from '../../runtime'
import { useI18n } from '../../i18n'

export function ChunkChangesDialog({ change, running, close, returnFocus, changed, recover }: {
  change: SaveChunkChange; running: boolean; close: () => void; returnFocus: () => void
  changed: (complete?: boolean) => void; recover: (id: string) => void
}) {
  const service = useService(InstanceSavesServiceKey), base = useService(BaseServiceKey), { t, n, d } = useI18n()
  const [offsetX, setOffsetX] = useState(String(change.type === 'paste' ? change.offsetX ?? 0 : 0)), [offsetZ, setOffsetZ] = useState(String(change.type === 'paste' ? change.offsetZ ?? 0 : 0))
  const [review, setReview] = useState<SaveChunkReview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [backup, setBackup] = useState<{ id?: string; path?: string; canRestore?: boolean }>({})
  const pending = useRef(false), alive = useRef(true), reviewed = useRef<SaveChunkChange | null>(null), body = useRef<HTMLDivElement>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (error) body.current?.scrollTo({ top: 0 }) }, [error])
  async function submit() {
    if (pending.current || running) return
    pending.current = true; setBusy(true); setError('')
    try {
      if (!review) {
        let operation = change
        if (change.type === 'paste') {
          if (![offsetX, offsetZ].every(value => /^-?\d+$/.test(value) && Number.isInteger(Number(value)) && Number(value) >= -2147483648 && Number(value) <= 2147483647)) { setError('offsetInvalid'); return }
          operation = { ...change, offsetX: Number(offsetX), offsetZ: Number(offsetZ) }
        }
        const result = await service.previewSaveChunkChanges(operation)
        if (alive.current) { reviewed.current = operation; setReview(result) }
      } else {
        await service.applySaveChunkChanges(reviewed.current!, review.snapshot)
        if (alive.current) { changed(true); close() }
      }
    } catch (failure) {
      if (!alive.current) return
      const value = failure && typeof failure === 'object' ? failure as { name?: string; backupId?: string; backupPath?: string; canRestore?: boolean } : {}
      setError(value.name === 'WorldChunksChangedError' || value.name === 'WorldChangedError' ? 'stale' : value.name === 'WorldChunkRestoreConflictError' ? 'restoreConflict' : value.name === 'InstanceRunningError' || value.name === 'SharedWorldRunningError' ? 'running' : value.name === 'WorldChunkOperationIncompleteError' ? 'incomplete' : 'failed')
      setReview(null); reviewed.current = null
      if (typeof value.backupId === 'string' && typeof value.backupPath === 'string') { setBackup({ id: value.backupId, path: value.backupPath, canRestore: value.canRestore === true }); changed() }
    } finally { pending.current = false; if (alive.current) setBusy(false) }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) close() }}><Dialog.Portal><Dialog.Overlay className="dialog-backdrop" />
    <Dialog.Content className="dialog creation-dialog world-files-dialog" data-testid="confirm-dialog" aria-busy={busy} onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }} onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onPointerDownOutside={event => event.preventDefault()}>
      <Dialog.Title>{t(`react.chunkChanges.${change.type}Title`)}</Dialog.Title>
      <button type="button" className="icon-button dialog-close" disabled={busy} aria-label={t('react.worldFiles.close')} onClick={close}><X size={20} aria-hidden="true" /></button>
      <Dialog.Description>{t(`react.chunkChanges.${change.type}Help`)}</Dialog.Description>
      <form onSubmit={event => { event.preventDefault(); void submit() }}>
        <div className="creation-body" role="region" aria-label={t('react.chunkChanges.review')} tabIndex={0} ref={body}>
          {error && <p className="form-error" role="alert">{t(`react.chunkChanges.${error}`)}</p>}
          {running && <p className="form-error" role="alert">{t('react.chunkChanges.running')}</p>}
          <p className="instance-path">{change.savePath}</p>
          {change.type === 'paste' && !review && <>
            <label className="field">{t('react.chunkChanges.offsetX')}<input required type="number" step="1" min="-2147483648" max="2147483647" disabled={busy} value={offsetX} onChange={event => setOffsetX(event.target.value)} /></label>
            <label className="field">{t('react.chunkChanges.offsetZ')}<input required type="number" step="1" min="-2147483648" max="2147483647" disabled={busy} value={offsetZ} onChange={event => setOffsetZ(event.target.value)} /></label>
          </>}
          {review && <div data-testid="chunk-change-review"><dl className="content-metadata">
            {review.backup && <><dt>{t('react.chunkChanges.backup')}</dt><dd>{d(review.backup.createdAt, { dateStyle: 'medium', timeStyle: 'medium' })} · {t(`react.chunkChanges.${review.backup.type}Title`)}</dd></>}
            <dt>{t('react.worldMap.dim')}</dt><dd>{review.dimension}</dd>
            {change.type !== 'restore' && <><dt>{t('react.chunkChanges.chunks')}</dt><dd>{n(review.chunks)}</dd></>}
            <dt>{t('react.chunkChanges.regions')}</dt><dd>{n(review.files)}</dd>
            <dt>{t('react.chunkChanges.bytes')}</dt><dd>{n(review.bytes)}</dd>
            {reviewed.current?.type === 'paste' && <><dt>{t('react.chunkChanges.offsetX')}</dt><dd>{n(reviewed.current.offsetX ?? 0)}</dd><dt>{t('react.chunkChanges.offsetZ')}</dt><dd>{n(reviewed.current.offsetZ ?? 0)}</dd></>}
          </dl>{review.shared && <p className="form-error">{t('react.worldFiles.shared')}</p>}{!review.files && <p role="status">{t('react.chunkChanges.noChanges')}</p>}</div>}
          <p>{t('react.worldMap.backupNotice')}</p><p>{t('react.chunkChanges.terrainScope')}</p>
          {busy && <p role="status">{t('react.worldFiles.working')}</p>}
          {backup.path && <button type="button" className="button secondary" disabled={busy} onClick={async () => { try { if (!await base.openDirectory(backup.path!)) throw new Error('missing') } catch { if (alive.current) setError('failed') } }}><FolderOpen size={17} aria-hidden="true" />{t('react.chunkChanges.openBackup')}</button>}
          {backup.id && backup.canRestore && <button type="button" className="button secondary" disabled={busy || running} onClick={() => recover(backup.id!)}>{t('react.chunkChanges.restore')}</button>}
        </div>
        <div className="dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={close}>{t('react.create.cancel')}</button>
          {review && <button type="button" className="button secondary" disabled={busy} onClick={() => { setReview(null); reviewed.current = null }}>{t('react.worldFiles.back')}</button>}
          <button type="submit" className="button primary" data-testid="chunk-change-submit" disabled={busy || running || error === 'incomplete' && backup.canRestore || !!review && !review.files}>{t(review ? 'react.chunkChanges.confirm' : 'react.chunkChanges.review')}</button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}

export function ChunkBackups({ savePath, running, revision, restore }: { savePath: string; running: boolean; revision: number; restore: (id: string) => void }) {
  const service = useService(InstanceSavesServiceKey), base = useService(BaseServiceKey), { t, d } = useI18n()
  const [entries, setEntries] = useState<SaveChunkBackup[]>([]), [unreadable, setUnreadable] = useState(0), [selected, setSelected] = useState(''), [error, setError] = useState(false), [busy, setBusy] = useState(true), [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true; setBusy(true); setError(false)
    void service.getSaveChunkBackups(savePath).then(result => {
      if (active) { setEntries(result.entries); setUnreadable(result.unreadable); setSelected(current => result.entries.some(entry => entry.id === current) ? current : result.entries[0]?.id || '') }
    }).catch(() => { if (active) setError(true) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [service, savePath, revision, refresh])
  return <details className="chunk-backups" data-testid="chunk-backups"><summary><History size={16} aria-hidden="true" /> {t('react.chunkChanges.backups')}</summary>
    {error && <p className="form-error" role="alert">{t('react.chunkChanges.historyFailed')}</p>}
    {unreadable > 0 && <p>{t('react.chunkChanges.unreadableBackups')}</p>}
    {busy ? <p role="status">{t('react.worlds.loading')}</p> : entries.length ? <label className="field">{t('react.chunkChanges.backup')}<select value={selected} disabled={running} onChange={event => setSelected(event.target.value)}>{entries.map(entry => <option key={entry.id} value={entry.id}>{d(entry.createdAt, { dateStyle: 'medium', timeStyle: 'medium' })} · {t(`react.chunkChanges.${entry.type}Title`)} · {t(`react.chunkChanges.${entry.state === 'incomplete' ? 'incompleteState' : entry.state}`)}</option>)}</select></label> : <p>{t('react.chunkChanges.noBackups')}</p>}
    <div className="content-actions"><button type="button" className="button secondary" disabled={busy || running || error || !selected} onClick={() => restore(selected)}>{t('react.chunkChanges.restore')}</button><button type="button" className="button secondary" disabled={busy} onClick={() => setRefresh(value => value + 1)}>{t('react.worlds.refresh')}</button>
      <button type="button" className="button secondary" disabled={busy || !entries.length && !unreadable} onClick={async () => { try { if (!await base.openDirectory(savePath.replace(/[\\/]$/, '') + '/.backups')) throw new Error('missing') } catch { setError(true) } }}>{t('react.chunkChanges.openBackup')}</button></div>
  </details>
}
