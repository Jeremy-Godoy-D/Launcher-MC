import { useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowDownToLine, ExternalLink, RefreshCw } from 'lucide-react'
import type { StateData } from '@launcher/renderer-client'
import type { Settings } from '@xmcl/runtime-api/src/entities/setting'
import { BaseServiceKey } from '@xmcl/runtime-api/src/services/BaseService'
import { TaskState } from '@xmcl/runtime-api/src/task'
import { useService, useTasks } from '../../runtime'
import { useI18n } from '../../i18n'
import { useLaunch } from '../launch/context'
import { catalogDescription } from '../catalog/description'
import { publicUpdateFiles, releasePage, releasesPage } from './updateLinks'

export function LauncherUpdates({ settings, getCurrent, dirty }: { settings: StateData<Settings>; getCurrent: () => StateData<Settings> | undefined; dirty: boolean }) {
  const { t, n } = useI18n(), service = useService(BaseServiceKey), tasks = useTasks(), launch = useLaunch()
  const text = (key: string) => t(`react.globalSettings.${key}`)
  const [phase, setPhase] = useState<'idle' | 'check' | 'download' | 'apply'>('idle'), [error, setError] = useState(false), [checked, setChecked] = useState(false)
  const [review, setReview] = useState<string>(), pending = useRef(false), stay = useRef<HTMLButtonElement>(null), trigger = useRef<HTMLButtonElement | null>(null)
  const info = settings.updateInfo
  const notes = useMemo(() => { try { return info?.body ? catalogDescription(info.body, true) : '' } catch { return '' } }, [info?.body])
  const active = tasks.tasks.find(task => task.type === 'downloaUpdate' && task.state === TaskState.Running)
  const busy = phase !== 'idle' || !!active, playing = !!launch?.running.length || launch?.phase === 'preparing'
  const latest = useRef({ playing, dirty }); latest.current = { playing, dirty }
  const files = info ? publicUpdateFiles(info) : []
  const automatic = info && ['autoupdater', 'asar', 'appx', 'deskgap'].includes(info.operation)
  async function action(kind: 'check' | 'download' | 'apply') {
    if (pending.current || latest.current.dirty) return
    const current = getCurrent()
    if (kind === 'apply' && (latest.current.playing || current?.updateStatus !== 'ready' || !review || current.updateInfo?.name !== review)) { setError(true); return }
    if (kind === 'download' && (!current?.updateInfo?.newUpdate || current.updateInfo.name !== info?.name || !automatic)) return
    pending.current = true; setPhase(kind); setError(false)
    try {
      if (kind === 'check') { await service.checkUpdate(); setChecked(true) }
      else if (kind === 'download') await service.downloadUpdate()
      else { await service.quitAndInstall(); setReview(undefined) }
    } catch { setError(true) }
    finally { pending.current = false; setPhase('idle') }
  }
  return <div className="launcher-updates" data-testid="global-updates">
    <div className="settings-update-heading"><h3>{text('updateTitle')}</h3><button type="button" className="button secondary" data-testid="update-check" disabled={busy || dirty} onClick={() => void action('check')}><RefreshCw size={16} aria-hidden="true" />{text(phase === 'check' ? 'checkingUpdate' : 'checkUpdate')}</button></div>
    {dirty && <p className="text-muted">{text('saveBeforeUpdate')}</p>}
    {error && <p role="alert" className="form-error">{text('updateError')}</p>}
    {checked && !info?.newUpdate && <p role="status">{text('noUpdate')}</p>}
    {info?.newUpdate && <>
      <p className="settings-release-name">{info.name}</p>
      {notes ? <div className="catalog-description release-notes" dangerouslySetInnerHTML={{ __html: notes }} /> : <p>{text('noNotes')}</p>}
      {!automatic && <p>{text('manualUpdate')}</p>}
      {automatic && <div className="settings-update-actions">
        {settings.updateStatus === 'ready' ? <button type="button" className="button primary" data-testid="update-install" disabled={busy || dirty || playing} onClick={event => { trigger.current = event.currentTarget; setReview(info.name) }}>{text('installUpdate')}</button>
          : <button type="button" className="button primary" data-testid="update-download" disabled={busy || dirty} onClick={() => void action('download')}><ArrowDownToLine size={16} aria-hidden="true" />{text('downloadUpdate')}</button>}
        {playing && <p className="text-muted">{text('closeGameUpdate')}</p>}
      </div>}
      {busy && <div role="status"><p>{text(phase === 'apply' ? 'applyingUpdate' : phase === 'check' ? 'checkingUpdate' : 'downloadingUpdate')}</p>{active?.progress && active.progress.total > 0 && <><progress aria-label={text('downloadingUpdate')} max={active.progress.total} value={active.progress.progress} /><p>{n(active.progress.progress / active.progress.total, { style: 'percent', maximumFractionDigits: 0 })}</p></>}</div>}
      {!!active && <button type="button" className="button secondary" data-testid="update-cancel" onClick={() => void tasks.cancel(active.id).catch(() => setError(true))}>{text('cancelUpdate')}</button>}
      {!!files.length && <ul className="settings-update-files">{files.map(file => <li key={file.url}><a href={file.url} target="_blank" rel="noopener noreferrer">{file.name}<ArrowDownToLine size={15} aria-hidden="true" /></a></li>)}</ul>}
      <a className="button secondary" href={releasePage(info.name)} target="_blank" rel="noopener noreferrer">{text('releasePage')}<ExternalLink size={16} aria-hidden="true" /></a>
    </>}
    {!info?.newUpdate && <a className="button secondary" href={releasesPage} target="_blank" rel="noopener noreferrer">{text('releasePage')}<ExternalLink size={16} aria-hidden="true" /></a>}
    <Dialog.Root open={!!review} onOpenChange={open => { if (!open && !pending.current) setReview(undefined) }}><Dialog.Portal><Dialog.Overlay className="dialog-backdrop" /><Dialog.Content className="dialog creation-dialog operation-dialog" data-testid="update-confirm" onOpenAutoFocus={event => { event.preventDefault(); stay.current?.focus() }} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus() }} onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (pending.current) event.preventDefault() }}>
      <Dialog.Title>{text('installUpdate')}</Dialog.Title><Dialog.Description>{t('react.globalSettings.installUpdateHelp', { version: review ?? '' })}</Dialog.Description>
      <div className="creation-body">{error && <p role="alert" className="form-error">{text('updateError')}</p>}{playing && <p>{text('closeGameUpdate')}</p>}</div>
      <div className="dialog-actions"><button ref={stay} type="button" className="button secondary" disabled={phase === 'apply'} onClick={() => setReview(undefined)}>{text('stay')}</button><button type="button" className="button primary" data-testid="update-confirm-install" disabled={busy || dirty || playing} onClick={() => void action('apply')}>{text('installUpdate')}</button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>
}
