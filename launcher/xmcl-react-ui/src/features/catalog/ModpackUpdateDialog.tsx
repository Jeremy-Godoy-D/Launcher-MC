import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from 'react-router'
import { X } from 'lucide-react'
import { ModpackServiceKey, ModpackState } from '@xmcl/runtime-api/src/services/ModpackService'
import { InstanceInstallServiceKey, InstanceInstallStatus, type InstanceFileUpdate } from '@xmcl/runtime-api/src/services/InstanceInstallService'
import { InstanceServiceKey } from '@xmcl/runtime-api/src/services/InstanceService'
import { LaunchServiceKey } from '@xmcl/runtime-api/src/services/LaunchService'
import { TaskState } from '@xmcl/runtime-api/src/task'
import { createOperationId } from '@xmcl/runtime-api/src/util/launch'
import { useService, useSharedStateStore, useTasks } from '../../runtime'
import { useLibrary } from '../library/context'
import type { SavedInstance } from '../library/model'
import { isOperationCancelled } from '../library/operations'
import { useI18n } from '../../i18n'
import { assertPackUpdateChanges, preparePackUpdate, type PackUpstream } from './modpackUpdate'

export type PackUpdateSelection = { path: string; target: SavedInstance; upstream: PackUpstream }
type Review = ReturnType<typeof preparePackUpdate> & { changes: InstanceFileUpdate[]; resume: boolean }

export function ModpackUpdate({ selection, close, returnFocus }: { selection: PackUpdateSelection; close: () => void; returnFocus: () => void }) {
  const captured = useRef(selection).current, { target, path, upstream } = captured
  const library = useLibrary(), navigate = useNavigate(), { t } = useI18n(), tasks = useTasks()
  const installs = useService(InstanceInstallServiceKey), instances = useService(InstanceServiceKey), launch = useService(LaunchServiceKey)
  const profileStore = useSharedStateStore({ key: `modpack-file://${path}`, Type: ModpackState, load: client => client.service(ModpackServiceKey).openModpack(path) })
  const pendingStore = useSharedStateStore({ key: `instance-install://${target.path}`, Type: InstanceInstallStatus, load: client => client.service(InstanceInstallServiceKey).watchInstanceInstall(target.path) })
  const profile = useSyncExternalStore(profileStore.subscribe, profileStore.getSnapshot, profileStore.getSnapshot), pending = useSyncExternalStore(pendingStore.subscribe, pendingStore.getSnapshot, pendingStore.getSnapshot)
  const [phase, setPhase] = useState<'prepare' | 'review' | 'install' | 'done' | 'error'>('prepare'), [review, setReview] = useState<Review>(), [error, setError] = useState(''), [stopping, setStopping] = useState(false)
  const working = useRef(false), started = useRef(false), alive = useRef(true), ownInstall = useRef(false), request = useRef(''), cancelling = useRef(false), cancelledTask = useRef('')
  const cancelButton = useRef<HTMLButtonElement>(null), message = useRef<HTMLParagraphElement>(null)
  const active = tasks.tasks.find(task => phase === 'install' && task.type === 'installInstance' && task.instancePath === target.path && (task.taskId === request.current || review?.resume) && task.state === TaskState.Running)
  const progress = active?.progress && typeof active.progress === 'object' ? active.progress : undefined
  const pendingFiles = !!pending.data && (pending.data.pendingFileCount > 0 || pending.data.unresolvedFiles.length > 0)
  const busy = phase === 'prepare' || phase === 'install'
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (error) message.current?.focus() }, [error])
  useEffect(() => {
    if (!active) return
    cancelButton.current?.focus()
    if (cancelling.current && cancelledTask.current !== active.id) { cancelledTask.current = active.id; void tasks.cancel(active.id).catch(() => { if (alive.current) setError('cancelFailed') }) }
  }, [active?.id])
  useEffect(() => {
    let current = true
    if (profile.status === 'error' || pending.status === 'error' || profile.data?.error) { setError('failed'); setPhase('error'); return }
    if (profile.data?.ready && pending.status === 'ready' && !started.current) queueMicrotask(() => { if (current && !started.current) { started.current = true; void prepare(false) } })
    return () => { current = false }
  }, [profile.status, profile.data?.ready, pending.status])
  function unchanged() {
    const current = library?.readInstance(target.path)
    if (!current || current.edition !== 'java' || JSON.stringify([current.runtime, current.version, current.upstream]) !== JSON.stringify([target.runtime, target.version, target.upstream])) throw Object.assign(new Error('Instance changed'), { code: 'changed' })
  }
  function failure(value: unknown) {
    if (cancelling.current || isOperationCancelled(value)) return 'cancelled'
    return value && typeof value === 'object' && 'code' in value && (value.code === 'userData' || value.code === 'changed' || value.code === 'pending') ? value.code : 'failed'
  }
  async function prepare(resume: boolean) {
    if (working.current || !profile.data) return
    working.current = true; setError(''); setPhase('prepare')
    try {
      unchanged(); await pendingStore.revalidate()
      const saved = pendingStore.getSnapshot()
      if (saved.status !== 'ready') throw new Error('Pending state unavailable')
      if (!resume && saved.data && (saved.data.pendingFileCount > 0 || saved.data.unresolvedFiles.length)) throw Object.assign(new Error('Pending install'), { code: 'pending' })
      if ((await Promise.all(['mods', 'resourcepacks', 'shaderpacks'].map(domain => installs.getReviewedModInstalls(target.path, domain as 'mods' | 'resourcepacks' | 'shaderpacks')))).some(plans => plans.length)) throw Object.assign(new Error('Reviewed content pending'), { code: 'pending' })
      const next = preparePackUpdate(profile.data, target, upstream), changes = await installs.previewInstanceFiles(next.options)
      assertPackUpdateChanges(changes)
      if (alive.current) { setReview({ ...next, changes, resume }); setPhase('review') }
    } catch (value) { if (alive.current) { setError(failure(value)); setPhase('error') } }
    finally { working.current = false }
  }
  async function install() {
    if (working.current || phase !== 'review' || !review) return
    working.current = true; request.current = createOperationId(); cancelling.current = false; cancelledTask.current = ''; setStopping(false); setError(''); setPhase('install')
    const prepared = review
    try {
      unchanged()
      if ((await launch.getGameProcesses()).some(process => process.options.gameDirectory === target.path)) throw new Error('Instance running')
      ownInstall.current = true
      if (prepared.resume) {
        const errors = await installs.resumeInstanceInstall(target.path)
        if (errors?.length) throw new Error('Unresolved files')
      } else await installs.installInstanceFiles({ ...prepared.options, id: request.current })
      await pendingStore.revalidate()
      const saved = pendingStore.getSnapshot()
      if (saved.status !== 'ready' || saved.data?.pendingFileCount || saved.data?.unresolvedFiles.length) throw new Error('Pending files')
      unchanged(); await instances.editInstance(prepared.edit)
      if (alive.current) setPhase('done')
    } catch (value) {
      await pendingStore.revalidate()
      if (alive.current) { setError(failure(value)); setPhase('error') }
    } finally { working.current = false }
  }
  async function cancel() {
    if (phase !== 'install') { close(); return }
    cancelling.current = true; setStopping(true)
    if (active && cancelledTask.current !== active.id) { cancelledTask.current = active.id; try { await tasks.cancel(active.id) } catch { if (alive.current) setError('cancelFailed') } }
  }
  const runtimeChanged = review && JSON.stringify([target.runtime, target.version]) !== JSON.stringify([review.edit.runtime, review.edit.version])
  return <Dialog.Root open onOpenChange={open => { if (!open && !working.current) close() }}><Dialog.Portal><Dialog.Overlay className="dialog-backdrop" /><Dialog.Content className="dialog creation-dialog" data-testid="modpack-update" onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }} onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (working.current) event.preventDefault() }}>
    <Dialog.Title>{t('react.packUpdate.title', { name: target.name })}</Dialog.Title><Dialog.Description>{t('react.packUpdate.help')}</Dialog.Description>
    <button type="button" className="icon-button dialog-close" disabled={working.current} aria-label={t('react.packUpdate.close')} onClick={close}><X size={20} aria-hidden="true" /></button>
    <form className="catalog-install operation-form" onSubmit={event => { event.preventDefault(); void install() }}>
      <div className="creation-body" role="region" tabIndex={0} aria-label={t('react.packUpdate.review')}>
        <p><strong>{target.name}</strong></p><p className="instance-path">{target.path}</p>
        {error && <p ref={message} tabIndex={-1} role="alert" className="form-error">{t(`react.packUpdate.${error}`)}</p>}
        {busy && <div role="status"><p>{t(stopping ? 'react.catalog.cancelling' : phase === 'install' ? 'react.packUpdate.installing' : 'react.packUpdate.preparing')}</p><progress aria-label={t('react.catalogInstall.progress')} max={progress && progress.total > 0 ? progress.total : undefined} value={progress && progress.total > 0 ? progress.progress : undefined} /></div>}
        {runtimeChanged && <p>{t('react.packUpdate.runtime', { before: target.runtime.minecraft, after: review.edit.runtime?.minecraft || target.runtime.minecraft })}</p>}
        {review && <ul className="catalog-install-files" data-testid="modpack-update-files">{review.changes.map(change => <li key={`${change.file.path}:${change.operation}`}><span>{t(`react.modUpdates.operations.${change.operation}`)}</span><code>{change.file.path}</code></li>)}</ul>}
        {phase === 'done' && <p role="status" data-testid="modpack-update-complete">{t('react.packUpdate.complete')}</p>}
        {phase === 'error' && pendingFiles && <p>{t('react.catalogInstall.retained')}</p>}
      </div>
      <footer className="dialog-actions">
        {phase === 'install' ? <button ref={cancelButton} type="button" className="button secondary" disabled={stopping} onClick={() => void cancel()}>{t('react.catalogInstall.cancel')}</button> : <button type="button" className="button secondary" onClick={close}>{t('react.packUpdate.close')}</button>}
        {phase === 'error' && <button type="button" className="button secondary" disabled={pendingFiles && !ownInstall.current} onClick={() => void prepare(pendingFiles && ownInstall.current)}>{t(pendingFiles ? 'react.packUpdate.recover' : 'react.instances.retry')}</button>}
        {phase === 'done' && <button type="button" className="button secondary" onClick={() => { library?.select(target.path, () => void navigate('/instance')); close() }}>{t('react.catalogInstall.open')}</button>}
        {(phase === 'review' || phase === 'install' || phase === 'done') && <button type="submit" className="button primary" disabled={phase !== 'review' || !review?.changes.some(change => change.operation !== 'keep') && !runtimeChanged}>{t('react.packUpdate.confirm')}</button>}
      </footer>
    </form>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
