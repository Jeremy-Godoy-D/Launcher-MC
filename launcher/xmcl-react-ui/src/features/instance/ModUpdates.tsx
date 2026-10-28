import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Download, X } from 'lucide-react'
import type { StateData } from '@launcher/renderer-client'
import type { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import { InstanceInstallServiceKey, type InstallInstanceOptions, type InstanceFileUpdate, type ReviewedModInstall, type ReviewedModRecovery } from '@xmcl/runtime-api/src/services/InstanceInstallService'
import { InstanceModsServiceKey, type ModFilesSnapshot } from '@xmcl/runtime-api/src/services/InstanceModsService'
import { TaskState } from '@xmcl/runtime-api/src/task'
import { createOperationId } from '@xmcl/runtime-api/src/util/launch'
import { buildModUpgradeManifest } from '@xmcl/runtime-api/src/util/modUpgradeManifest'
import { useI18n } from '../../i18n'
import { useService, useTasks } from '../../runtime'
import type { SavedInstance } from '../library/model'
import { isOperationCancelled } from '../library/operations'
import { queryModUpdates, updateLoaders, updateMods, type UpdateOptions } from './queryModUpdates'

type Review = { kind: 'update'; options: Extract<InstallInstanceOptions, { oldFiles: unknown }>; changes: InstanceFileUpdate[] } | ({ kind: 'recovery'; operationId: string } & ReviewedModRecovery)
function preferences(path: string): UpdateOptions {
  try {
    const read = (key: string) => JSON.parse(localStorage.getItem(`modsUpgrade${key}:${path}`) || 'null')
    const policy = read('Policy')
    return { policy: ['modrinth', 'curseforge', 'modrinthOnly', 'curseforgeOnly'].includes(policy) ? policy : 'modrinth', releaseOnly: read('IgnoreAlphaBeta') !== false, skipVersion: read('SkipVersion') === true }
  } catch { return { policy: 'modrinth', releaseOnly: true, skipVersion: false } }
}

export function ModUpdates({ path, runtime, getFiles, disabled, running, refresh, onBusy }: { path: string; runtime: SavedInstance['runtime']; getFiles: () => StateData<ResourceState>['files']; disabled: boolean; running: boolean; refresh: () => Promise<void>; onBusy: (busy: boolean) => void }) {
  const { t } = useI18n(), installs = useService(InstanceInstallServiceKey), mods = useService(InstanceModsServiceKey), tasks = useTasks()
  const [open, setOpen] = useState(false), [options, setOptions] = useState(() => preferences(path)), [phase, setPhase] = useState<'idle' | 'query' | 'review' | 'install'>('idle')
  const [result, setResult] = useState<Awaited<ReturnType<typeof queryModUpdates>> | null>(null), [selected, setSelected] = useState<string[]>([])
  const [review, setReview] = useState<Review | null>(null), [pending, setPending] = useState<ReviewedModInstall[]>([]), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const trigger = useRef<HTMLButtonElement>(null), alive = useRef(true), controller = useRef<AbortController | null>(null), request = useRef(''), operation = useRef(false)
  const inventory = useRef<ModFilesSnapshot | null>(null), cancelling = useRef(false), resultsElement = useRef<HTMLParagraphElement>(null), body = useRef<HTMLDivElement>(null)
  const busy = phase !== 'idle', active = tasks.tasks.find(task => task.type === 'installInstance' && task.state === TaskState.Running && task.instancePath === path && task.taskId === request.current)
  const otherInstall = tasks.tasks.some(task => task.type === 'installInstance' && task.instancePath === path && task.state === TaskState.Running && task.taskId !== request.current)
  const progress = active?.progress && 'progress' in active.progress ? active.progress : undefined
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort() } }, [])
  useEffect(() => { onBusy(busy) }, [busy])
  useEffect(() => { if (result && !busy && !review) resultsElement.current?.scrollIntoView({ block: 'start' }) }, [result, busy, review])
  useEffect(() => { if (review && body.current) body.current.scrollTop = 0 }, [review])
  async function readPending() { const plans = await installs.getReviewedModInstalls(path); if (alive.current) setPending(plans) }
  function failure(error: unknown) {
    const name = error && typeof error === 'object' && 'name' in error ? error.name : ''
    return name === 'MetadataPending' ? 'metadataPending' : name === 'ModFilesChangedError' ? 'changed' : name === 'InstanceRunningError' ? 'running' : isOperationCancelled(error) || cancelling.current ? 'cancelled' : 'failed'
  }
  async function execute(next: typeof phase, work: () => Promise<void>) {
    if (operation.current) return
    operation.current = true; cancelling.current = false; setPhase(next); setError(''); setNotice('')
    try { await work() } catch (error) { if (alive.current) setError(next === 'query' && isOperationCancelled(error) ? 'searchCancelled' : failure(error)) }
    finally { operation.current = false; if (alive.current) setPhase('idle') }
  }
  function change(next: UpdateOptions) {
    setOptions(next); setResult(null); setSelected([]); setReview(null)
    try {
      for (const [key, value] of [['Policy', next.policy], ['IgnoreAlphaBeta', next.releaseOnly], ['SkipVersion', next.skipVersion]]) localStorage.setItem(`modsUpgrade${key}:${path}`, JSON.stringify(value))
    } catch { setError('preferencesFailed') }
  }
  async function search() {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort
    setResult(null); setReview(null); setSelected([])
    await execute('query', async () => {
      await mods.refreshMetadata(path)
      abort.signal.throwIfAborted()
      const captured = await mods.getModFilesSnapshot(path)
      await refresh(); abort.signal.throwIfAborted()
      const sources = await mods.getModSources(path)
      abort.signal.throwIfAborted()
      const current = getFiles()
      if (captured.entries.some(entry => !entry.directory && !current.some(file => file.path === entry.path && file.mtime === entry.mtime && file.size === entry.size && /^[a-f0-9]{40}$/i.test(file.hash)))) throw { name: 'MetadataPending' }
      const next = await queryModUpdates(updateMods(current, captured.configuration?.runtime || runtime, sources), captured.configuration?.runtime || runtime, options, abort.signal)
      if (!alive.current || abort.signal.aborted) return
      inventory.current = captured; setResult(next); setSelected(next.updates.map(update => update.mod.path))
    })
  }
  async function prepare() {
    await execute('review', async () => {
      const captured = await mods.getModFilesSnapshot(path)
      if (JSON.stringify(captured.configuration) !== JSON.stringify(inventory.current?.configuration)) throw { name: 'ModFilesChangedError' }
      const chosen = result?.updates.filter(update => selected.includes(update.mod.path)) || []
      if (!chosen.length) return
      for (const { mod } of chosen) {
        const entry = captured.entries.find(entry => entry.path === mod.path), current = getFiles().find(file => file.path === mod.path)
        if (!entry || !current || current.hash !== mod.hash || current.mtime !== entry.mtime || current.size !== entry.size || entry.directory) throw { name: 'ModFilesChangedError' }
      }
      const options = { path, ...buildModUpgradeManifest(chosen) }, changes = await installs.previewInstanceFiles(options)
      if (alive.current) setReview({ kind: 'update', options: { ...options, review: { snapshot: captured.fingerprint, changes: changes.map(change => ({ path: change.file.path, operation: change.operation })) } }, changes })
    })
  }
  async function prepareRecovery(plan: ReviewedModInstall) {
    await execute('review', async () => {
      const recovery = await installs.previewModInstallRecovery(path, plan.operationId)
      if (alive.current) setReview({ kind: 'recovery', operationId: plan.operationId, ...recovery })
    })
  }
  async function install(resume?: ReviewedModInstall) {
    if (running || otherInstall) return
    const prepared = review
    if (!resume && !prepared) return
    await execute('install', async () => {
      request.current = resume?.operationId || (prepared?.kind === 'recovery' ? prepared.operationId : createOperationId())
      try {
        if (resume) {
          const errors = await installs.resumeInstanceInstall(path, undefined, resume.operationId)
          if (errors?.length) throw new Error('Unresolved install')
        } else if (prepared?.kind === 'recovery') {
          const errors = await installs.resumeInstanceInstall(path, undefined, prepared.operationId, prepared.review)
          if (errors?.length) throw new Error('Unresolved install')
        } else if (prepared) await installs.installInstanceFiles({ ...prepared.options, id: request.current })
        if (alive.current) { setReview(null); setResult(null); setSelected([]); setNotice('complete') }
      } finally {
        if (alive.current) { setReview(null); await readPending(); await refresh() }
      }
    })
  }
  async function cancel() {
    if (phase === 'query') { controller.current?.abort(); return }
    if (!active || cancelling.current) return
    cancelling.current = true
    try { await tasks.cancel(active.id) } catch { cancelling.current = false; setError('cancelFailed') }
  }
  let loader = ''
  try { loader = updateLoaders(runtime)[0] } catch { /* A visible explanation blocks queries for ambiguous or missing loaders. */ }
  return <>
    <button ref={trigger} className="button secondary" disabled={disabled} onClick={() => { setOpen(true); void execute('review', readPending) }}><Download size={16} aria-hidden="true" />{t('react.modUpdates.open')}</button>
    <Dialog.Root open={open} onOpenChange={open => { if (!busy) setOpen(open) }}><Dialog.Portal><Dialog.Overlay className="dialog-backdrop" /><Dialog.Content className="dialog creation-dialog mod-updates-dialog" aria-busy={busy} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus() }} onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onPointerDownOutside={event => event.preventDefault()}>
      <Dialog.Title>{t('react.modUpdates.title')}</Dialog.Title><button className="icon-button dialog-close" aria-label={t('react.modUpdates.close')} disabled={busy} onClick={() => setOpen(false)}><X size={20} aria-hidden="true" /></button>
      <Dialog.Description>{t(review ? 'react.modUpdates.reviewHelp' : pending.length ? 'react.modUpdates.pendingHelp' : 'react.modUpdates.help')}</Dialog.Description>
      <div ref={body} className="creation-body" role="region" aria-label={t('react.modUpdates.details')} tabIndex={0}>
        {!review && !pending.length && <p>{runtime.minecraft} · {loader || t('react.modUpdates.noLoader')}</p>}
        {!loader && <p role="alert" className="form-error">{t('react.modUpdates.noLoader')}</p>}
        {!!pending.length && !review && <><h3 className="mod-update-pending-heading">{t('react.modUpdates.pending')}</h3><ul className="mod-update-pending">{pending.map(plan => <li key={plan.operationId}><div>{(plan.files.length ? plan.files : plan.oldFiles).map(file => <span key={file.path}>{file.path}</span>)}</div><div className="content-actions"><button className="button secondary" disabled={busy || running || otherInstall} onClick={() => void prepareRecovery(plan)}>{t('react.modUpdates.recover')}</button><button className="button secondary" disabled={busy || running || otherInstall} onClick={() => void install(plan)}>{t('react.modUpdates.resume')}</button></div></li>)}</ul></>}
        {!review && <div className="mod-update-options">
          <label>{t('react.modUpdates.policy')}<select disabled={busy} value={options.policy} onChange={event => change({ ...options, policy: event.target.value as UpdateOptions['policy'] })}>{(['modrinth', 'curseforge', 'modrinthOnly', 'curseforgeOnly'] as const).map(policy => <option key={policy} value={policy}>{t(`react.modUpdates.${policy}`)}</option>)}</select></label>
          <label><input type="checkbox" disabled={busy} checked={options.releaseOnly} onChange={event => change({ ...options, releaseOnly: event.target.checked })} />{t('react.modUpdates.releaseOnly')}</label>
          <label><input type="checkbox" disabled={busy} checked={options.skipVersion} onChange={event => change({ ...options, skipVersion: event.target.checked })} />{t('react.modUpdates.skipVersion')}</label>
          <button className="button secondary" disabled={busy || !loader} onClick={() => void search()}>{t('react.modUpdates.search')}</button>
        </div>}
        {result && !review && <>
          <p ref={resultsElement} role="status">{t(result.updates.length ? 'react.modUpdates.found' : result.issues.length ? 'react.modUpdates.partial' : 'react.modUpdates.none', { count: result.updates.length })}</p>
          {result.unidentified > 0 && <p>{t('react.modUpdates.unidentified', { count: result.unidentified })}</p>}
          {!!result.issues.length && <div role="alert" className="form-error"><p>{t('react.modUpdates.partial')}</p><ul>{result.issues.map((issue, index) => <li key={index}>{issue.provider === 'modrinth' ? 'Modrinth' : 'CurseForge'}{issue.file && ` · ${issue.file}`} · {t(`react.modUpdates.${issue.kind === 'failed' ? 'queryFailed' : issue.kind}`)}</li>)}</ul></div>}
          <ul className="mod-update-list">{result.updates.map(update => <li key={update.mod.path}><label><input type="checkbox" disabled={busy} checked={selected.includes(update.mod.path)} onChange={event => { setReview(null); setSelected(selected => event.target.checked ? [...selected, update.mod.path] : selected.filter(path => path !== update.mod.path)) }} /><span><strong>{update.mod.name}</strong><small>{update.mod.fileName}</small><span>{'version' in update ? `Modrinth · ${update.version.version_number} · ${update.version.version_type}` : `CurseForge · ${update.file.displayName} · ${t(update.file.releaseType === 1 ? 'react.modUpdates.release' : update.file.releaseType === 2 ? 'react.modUpdates.beta' : 'react.modUpdates.alpha')}`}</span>{/\.disabled$/i.test(update.mod.fileName) && <small>{t('react.modUpdates.staysDisabled')}</small>}</span></label></li>)}</ul>
        </>}
        {review?.kind === 'recovery' && <p>{t('react.modUpdates.recoveryHelp')}</p>}
        {review?.kind === 'recovery' && review.configurationChanged && <p className="form-error" role="alert">{t('react.modUpdates.configurationChanged')}</p>}
        {review && <><ul className="mod-update-changes">{review.changes.map((change, index) => <li key={index}><span>{t(`react.modUpdates.operations.${change.operation}`)}</span><span>{change.file.path}</span></li>)}</ul></>}
        {busy && <div role="status"><p>{t(`react.modUpdates.${phase === 'query' ? 'searching' : phase === 'review' ? 'reviewing' : 'installing'}`)}</p>{phase === 'install' && <progress aria-label={t('react.modUpdates.progress')} max={progress && progress.total > 0 ? progress.total : undefined} value={progress && progress.total > 0 ? progress.progress : undefined} />}</div>}
        {(running || otherInstall) && <p role="status">{t(running ? 'react.content.running' : 'react.modUpdates.otherInstall')}</p>}
        {error && <p role="alert" className="form-error">{t(`react.modUpdates.${error}`)}</p>}
        {notice && <p role="status">{t(`react.modUpdates.${notice}`)}</p>}
      </div>
      <div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => { if (review) { setReview(null); setError('') } else setOpen(false) }}>{t(review ? 'react.modUpdates.back' : 'react.modUpdates.close')}</button>
        {phase === 'query' || active ? <button className="button secondary" onClick={() => void cancel()}>{t('react.modUpdates.cancel')}</button> : null}
        {review ? <button className="button primary" disabled={busy || running || otherInstall || !review.changes.length} onClick={() => void install()}>{t(review.kind === 'recovery' ? 'react.modUpdates.applyRecovery' : 'react.modUpdates.install')}</button> : <button className="button primary" disabled={busy || running || otherInstall || !selected.length} onClick={() => void prepare()}>{t('react.modUpdates.review')}</button>}
      </div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </>
}
