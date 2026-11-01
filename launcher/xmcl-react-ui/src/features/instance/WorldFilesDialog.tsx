import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FolderOpen, X } from 'lucide-react'
import { InstanceSavesServiceKey, type WorldFileOperation, type WorldFileReview } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import type { InstanceSavePreview } from '@xmcl/runtime-api/src/entities/save'
import { BaseServiceKey } from '@xmcl/runtime-api/src/services/BaseService'
import { useService } from '../../runtime'
import { useI18n } from '../../i18n'
import { useLibrary } from '../library/context'

export function WorldFilesDialog({ path, name, type, world, close, returnFocus, changed }: { path: string; name: string; type: WorldFileOperation['type']; world?: InstanceSavePreview; close: () => void; returnFocus: () => void; changed: () => void }) {
  const service = useService(InstanceSavesServiceKey), base = useService(BaseServiceKey), library = useLibrary(), { t, n } = useI18n()
  const [input, setInput] = useState<WorldFileOperation>(() => type === 'import' ? { type, instancePath: path, saveName: '', sourcePath: '' } : type === 'metadata' ? { type, instancePath: path, saveName: name, metadata: { levelName: world?.levelName || name, seed: world?.seed ?? '', difficulty: (world?.difficulty !== undefined && world.difficulty >= 0 && world.difficulty <= 3 ? world.difficulty : 2) as 0 | 1 | 2 | 3, cheat: Boolean(world?.cheat) } } : type === 'copy' ? { type, instancePath: path, saveName: name, destinationInstancePath: path, destinationName: `${name} (copy)` } : type === 'export' ? { type, instancePath: path, saveName: name, destinationDirectory: '', fileName: `${name}.zip` } : { type, instancePath: path, saveName: name })
  const [review, setReview] = useState<WorldFileReview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [finished, setFinished] = useState(false), [folder, setFolder] = useState('')
  const alive = useRef(true), pending = useRef(false), body = useRef<HTMLDivElement>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (error) body.current?.scrollTo({ top: 0 }) }, [error])
  function failure(error: unknown) {
    const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
    return ['WorldFilesChangedError', 'WorldDestinationExistsError', 'WorldOperationIncompleteError', 'InstanceRunningError', 'SharedWorldRunningError', 'WorldArchiveInvalidError', 'WorldImportInvalidError', 'WorldImportLimitError', 'WorldArchiveChecksumError', 'WorldMetadataInvalidError'].includes(name) ? name : type === 'import' ? 'importFailed' : 'failed'
  }
  async function chooseFolder(archive = false) {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try {
      const result = await window.windowController!.showOpenDialog!(archive ? { properties: ['openFile'], filters: [{ name: 'Minecraft world', extensions: ['zip'] }] } : { properties: ['openDirectory'] })
      if (alive.current && !result.canceled && result.filePaths[0]) {
        if (input.type === 'export') setInput({ ...input, destinationDirectory: result.filePaths[0] })
        if (input.type === 'import') { const sourcePath = result.filePaths[0]; setInput({ ...input, sourcePath, saveName: sourcePath.replace(/\\/g, '/').split('/').pop()!.replace(/\.zip$/i, '') }) }
        setReview(null)
      }
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
        <p className="instance-path">{input.type === 'import' ? input.sourcePath : name}</p>
        {!finished && !review && input.type === 'import' && <>
          <div className="content-actions"><button className="button secondary" type="button" disabled={busy} onClick={() => void chooseFolder(true)}>{t('react.worldFiles.chooseZip')}</button><button className="button secondary" type="button" disabled={busy} onClick={() => void chooseFolder()}>{t('react.worldFiles.chooseWorldFolder')}</button></div>
          <label className="field">{t('react.worldFiles.importName')}<input required maxLength={255} disabled={busy} value={input.saveName} onChange={event => setInput({ ...input, saveName: event.target.value })} /></label>
        </>}
        {!finished && !review && input.type === 'metadata' && <>
          <label className="field">{t('react.worldFiles.levelName')}<input required maxLength={256} disabled={busy} value={input.metadata.levelName} onChange={event => setInput({ ...input, metadata: { ...input.metadata, levelName: event.target.value } })} /></label>
          <label className="field">{t('react.worlds.difficulty')}<select disabled={busy} value={input.metadata.difficulty} onChange={event => setInput({ ...input, metadata: { ...input.metadata, difficulty: Number(event.target.value) as 0 | 1 | 2 | 3 } })}>{([0, 1, 2, 3] as const).map(value => <option key={value} value={value}>{t(`react.worlds.difficulty${value}`)}</option>)}</select></label>
          <label className="field">{t('react.worlds.cheats')}<select disabled={busy} value={input.metadata.cheat ? 'enabled' : 'disabled'} onChange={event => setInput({ ...input, metadata: { ...input.metadata, cheat: event.target.value === 'enabled' } })}><option value="enabled">{t('react.worlds.enabled')}</option><option value="disabled">{t('react.worlds.disabled')}</option></select></label>
          <label className="field">{t('react.worlds.seed')}<input required={Boolean(world?.seed)} maxLength={20} disabled={busy} value={input.metadata.seed} onChange={event => setInput({ ...input, metadata: { ...input.metadata, seed: event.target.value } })} /></label>
        </>}
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
          {review.metadata && <dl className="content-metadata">
            <dt>{t('react.worldFiles.levelName')}</dt><dd>{review.metadata.after.levelName}</dd>
            <dt>{t('react.worlds.difficulty')}</dt><dd>{t(`react.worlds.difficulty${review.metadata.after.difficulty}`)}</dd>
            <dt>{t('react.worlds.cheats')}</dt><dd>{t(review.metadata.after.cheat ? 'react.worlds.enabled' : 'react.worlds.disabled')}</dd>
            <dt>{t('react.worlds.seed')}</dt><dd>{review.metadata.after.seed || t('react.workspace.unknown')}</dd>
          </dl>}
          {review.linkOnly ? <p>{t('react.worldFiles.linkOnly')}</p> : review.shared ? <p className="form-error">{t(input.type === 'import' ? 'react.worldFiles.importShared' : input.type === 'metadata' ? 'react.worldFiles.metadataShared' : 'react.worldFiles.shared')}</p> : null}
        </div>}
        {busy && <p role="status">{t('react.worldFiles.working')}</p>}
        {finished && <p role="status">{t(`react.worldFiles.${type}Done`)}</p>}
        {folder && <button type="button" className="button secondary" disabled={busy} onClick={async () => { try { if (!await base.openDirectory(folder)) throw new Error('missing') } catch { if (alive.current) setError('failed') } }}>{t('react.operations.openFolder')}</button>}
      </div>
      <div className="dialog-actions"><button className="button secondary" type="button" disabled={busy} onClick={close}>{t('react.worldFiles.close')}</button>
        {review && !finished && <button className="button secondary" type="button" disabled={busy} onClick={() => setReview(null)}>{t('react.worldFiles.back')}</button>}
        {!finished && <button className="button primary" type="submit" disabled={busy || input.type === 'export' && !input.destinationDirectory || input.type === 'import' && !input.sourcePath}>{t(review ? 'react.worldFiles.confirm' : 'react.worldFiles.review')}</button>}
      </div>
    </form>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
