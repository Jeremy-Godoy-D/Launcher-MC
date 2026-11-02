import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { InstanceSavePreview } from '@xmcl/runtime-api/src/entities/save'
import { InstanceSavesServiceKey } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import { useService } from '../../runtime'
import { useI18n } from '../../i18n'
import { useLibrary } from '../library/context'

export type WorldSharingAction = { type: 'share' | 'activate' | 'deactivate' | 'remove'; world: InstanceSavePreview } | { type: 'connect' | 'disconnect' }

export function WorldSharingDialog({ path, action, close, changed, returnFocus }: { path: string; action: WorldSharingAction; close: () => void; changed: () => void; returnFocus: () => void }) {
  const service = useService(InstanceSavesServiceKey), { t } = useI18n(), library = useLibrary()
  const [busy, setBusy] = useState(false), [finished, setFinished] = useState(false), [error, setError] = useState(''), [confirmation, setConfirmation] = useState('')
  const pending = useRef(false), body = useRef<HTMLDivElement>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const world = 'world' in action ? action.world : undefined, instance = library?.instances.find(instance => instance.path === path)?.name || path
  async function submit() {
    if (pending.current || finished || action.type === 'remove' && confirmation !== world?.name) return
    pending.current = true; setBusy(true); setError('')
    try {
      if (action.type === 'connect') await service.linkSharedSave(path)
      else if (action.type === 'disconnect') await service.unlinkSharedSave(path)
      else if (action.type === 'activate') await service.importSave({ instancePath: path, path: action.world.path })
      else if (action.type === 'share') await service.shareSave({ instancePath: path, saveName: action.world.name })
      else if ('world' in action) await service.deleteSave({ ...(action.type === 'deactivate' ? { instancePath: path } : {}), saveName: action.world.name })
      if (alive.current) { setFinished(true); changed() }
    } catch (failure) {
      const name = failure && typeof failure === 'object' && 'name' in failure ? String(failure.name) : ''
      if (alive.current) { setError(['InstanceRunningError', 'SharedWorldRunningError'].includes(name) ? 'running' : name === 'WorldLockUnavailableError' ? 'session' : 'failed'); body.current?.scrollTo({ top: 0 }) }
    } finally { pending.current = false; if (alive.current) setBusy(false) }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !pending.current) close() }}><Dialog.Portal><Dialog.Overlay className="dialog-backdrop" /><Dialog.Content className="dialog creation-dialog world-files-dialog" data-testid="world-sharing-dialog" aria-busy={busy} onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }} onEscapeKeyDown={event => { if (pending.current) event.preventDefault() }} onPointerDownOutside={event => event.preventDefault()}>
    <Dialog.Title>{t(`react.worldSharing.${action.type}`)}</Dialog.Title><Dialog.Description>{t(`react.worldSharing.${action.type}Help`, { name: world?.levelName || world?.name || '', instance })}</Dialog.Description>
    <button className="icon-button dialog-close" disabled={busy} aria-label={t('react.worldFiles.close')} onClick={close}><X size={20} aria-hidden="true" /></button>
    <form onSubmit={event => { event.preventDefault(); void submit() }}>
      <div className="creation-body" ref={body} role="region" aria-label={t('react.worldFiles.review')} tabIndex={0}>
        <dl className="content-metadata"><dt>{t('react.worldFiles.instance')}</dt><dd>{instance}</dd>{world && <><dt>{t('react.worlds.folder')}</dt><dd>{world.name}</dd></>}</dl>
        {error && <p className="form-error" role="alert">{t(error === 'session' ? 'react.worlds.migrationReason.session' : `react.worldSharing.${error}`)}</p>}
        {action.type === 'remove' && !finished && <label className="field">{t('react.worldSharing.confirmName', { name: world?.name || '' })}<input value={confirmation} disabled={busy} autoComplete="off" onChange={event => setConfirmation(event.target.value)} /></label>}
        {busy && <p role="status">{t('react.worldFiles.working')}</p>}
        {finished && <p role="status">{t('react.worldSharing.done')}</p>}
      </div>
      <div className="dialog-actions"><button className="button secondary" type="button" disabled={busy} onClick={close}>{t('react.worldFiles.close')}</button>{!finished && <button className="button primary" type="submit" disabled={busy || action.type === 'remove' && confirmation !== world?.name}>{t('react.worldFiles.confirm')}</button>}</div>
    </form>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
