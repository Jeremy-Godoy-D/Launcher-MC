import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FolderOpen, X } from 'lucide-react'
import { InstanceSavesServiceKey, type WorldFileOperation, type WorldFileReview } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import { BaseServiceKey } from '@xmcl/runtime-api/src/services/BaseService'
import { useService } from '../../runtime'
import { useI18n } from '../../i18n'
import { useLibrary } from '../library/context'

export function WorldFilesDialog({ path, name, type, close, returnFocus, changed }: { path: string; name: string; type: WorldFileOperation['type']; close: () => void; returnFocus: () => void; changed: () => void }) {
  const service = useService(InstanceSavesServiceKey), base = useService(BaseServiceKey), library = useLibrary(), { t, n } = useI18n()
  const [input, setInput] = useState<WorldFileOperation>(() => type === 'copy' ? { type, instancePath: path, saveName: name, destinationInstancePath: path, destinationName: `${name} (copy)` } : type === 'export' ? { type, instancePath: path, saveName: name, destinationDirectory: '', fileName: `${name}.zip` } : { type, instancePath: path, saveName: name })
  const [review, setReview] = useState<WorldFileReview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [finished, setFinished] = useState(false), [folder, setFolder] = useState('')
  const alive = useRef(true), pending = useRef(false), body = useRef<HTMLDivElement>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (error) body.current?.scrollTo({ top: 0 }) }, [error])
  function failure(error: unknown) {
    const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
    return ['WorldFilesChangedError', 'WorldDestinationExistsError', 'WorldOperationIncompleteError', 'InstanceRunningError', 'SharedWorldRunningError'].includes(name) ? name : 'failed'
  }
  async function chooseFolder() {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try {
      const result = await window.windowController!.showOpenDialog!({ properties: ['openDirectory'] })
      if (alive.current && !result.canceled && result.filePaths[0] && input.type === 'export') { setInput({ ...input, destinationDirectory: result.filePaths[0] }); setReview(null) }
    } catch { if (alive.current) setError('failed') }
    finally { pending.current = false; if (alive.current) setBusy(false) }
  }
  async function submit() {
    if (pending.current || finished) return
    pending.current = true; setBusy(true); setError('')
    try {
      if (!review) { const value = await service.previewWorldFiles(input); if (alive.current) setReview(value) }
      else {
        const result = await service.applyWorldFiles(review)
        if (alive.current) { setFinished(true); setFolder(result.backup || (input.type === 'export' ? input.destinationDirectory : result.path)); changed() }
      }
    } catch (error) {
      if (alive.current) {
        setError(failure(error)); setReview(null)
        if (error && typeof error === 'object' && 'path' in error && typeof error.path === 'string') setFolder(error.path)
      }
    } finally { pending.current = false; if (alive.current) setBusy(false) }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) close() }}><Dialog.Portal><Dialog.Overlay className="dialog-backdrop" /><Dialog.Content className="dialog creation-dialog world-files-dialog" data-testid="world-files-dialog" aria-busy={busy} onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }} onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onPointerDownOutside={event => event.preventDefault()}>
    <Dialog.Title>{t(`react.worldFiles.${type}Title`)}</Dialog.Title><button className="icon-button dialog-close" disabled={busy} aria-label={t('react.worldFiles.close')} onClick={close}><X size={20} aria-hidden="true" /></button>
    <Dialog.Description>{t(`react.worldFiles.${type}Help`)}</Dialog.Description>
    <form onSubmit={event => { event.preventDefault(); void submit() }}>
      <div className="creation-body" ref={body} role="region" aria-label={t('react.worldFiles.review')} tabIndex={0}>
        {error && <p role="alert" className="form-error">{t(`react.worldFiles.${error}`)}</p>}
        <p className="instance-path">{name}</p>
        {!finished && !review && input.type === 'copy' && <>
          <label className="field">{t('react.worldFiles.instance')}<select disabled={busy || !!review} value={input.destinationInstancePath} onChange={event => setInput({ ...input, destinationInstancePath: event.target.value })}>{library?.instances.map(instance => <option key={instance.path} value={instance.path}>{instance.name}</option>)}</select></label>
          <label className="field">{t('react.worldFiles.name')}<input required maxLength={255} disabled={busy || !!review} value={input.destinationName} onChange={event => setInput({ ...input, destinationName: event.target.value })} /></label>
        </>}
        {!finished && !review && input.type === 'export' && <>
          <label className="field">{t('react.worldFiles.archive')}<input required maxLength={255} disabled={busy || !!review} value={input.fileName} onChange={event => setInput({ ...input, fileName: event.target.value })} /></label>
          <button className="button secondary" type="button" disabled={busy || !!review} onClick={() => void chooseFolder()}><FolderOpen size={17} aria-hidden="true" />{t('react.worldFiles.chooseFolder')}</button><p className="instance-path">{input.destinationDirectory}</p>
        </>}
        {review && !finished && <div data-testid="world-files-review">
          <p>{t(review.files === 1 ? 'react.worldFiles.summaryOne' : 'react.worldFiles.summary', { count: n(review.files), bytes: n(review.bytes) })}</p><p className="instance-path">{review.destination}</p>
          {review.linkOnly ? <p>{t('react.worldFiles.linkOnly')}</p> : review.shared ? <p className="form-error">{t('react.worldFiles.shared')}</p> : null}
        </div>}
        {busy && <p role="status">{t('react.worldFiles.working')}</p>}
        {finished && <p role="status">{t(`react.worldFiles.${type}Done`)}</p>}
        {folder && <button type="button" className="button secondary" disabled={busy} onClick={async () => { try { if (!await base.openDirectory(folder)) throw new Error('missing') } catch { if (alive.current) setError('failed') } }}>{t('react.operations.openFolder')}</button>}
      </div>
      <div className="dialog-actions"><button className="button secondary" type="button" disabled={busy} onClick={close}>{t('react.worldFiles.close')}</button>
        {review && !finished && <button className="button secondary" type="button" disabled={busy} onClick={() => setReview(null)}>{t('react.worldFiles.back')}</button>}
        {!finished && <button className="button primary" type="submit" disabled={busy || input.type === 'export' && !input.destinationDirectory}>{t(review ? 'react.worldFiles.confirm' : 'react.worldFiles.review')}</button>}
      </div>
    </form>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
