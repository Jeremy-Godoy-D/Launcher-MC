import { useLayoutEffect, useRef, useState } from 'react'
import { InstanceServiceKey } from '@xmcl/runtime-api/src/services/InstanceService'
import { BaseServiceKey } from '@xmcl/runtime-api/src/services/BaseService'
import { TaskState } from '@xmcl/runtime-api/src/task'
import { createOperationId } from '@xmcl/runtime-api/src/util/launch'
import { useService, useTasks } from '../../runtime'
import { useI18n } from '../../i18n'
import { useLibrary } from './context'
import { copyLegacyModGroups, isOperationCancelled } from './operations'

export function DuplicateInstance({ path, busy, onBusy, onBack, onCreated }: { path: string; busy: boolean; onBusy: (busy: boolean) => void; onBack: () => void; onCreated: (path: string) => void }) {
  const library = useLibrary(), service = useService(InstanceServiceKey), base = useService(BaseServiceKey), tasks = useTasks(), { t } = useI18n()
  const initial = library?.data?.pendingCopies[path]
  const source = useRef(initial?.sourcePath || path).current
  const [finished, setFinished] = useState('')
  const [partial, setPartial] = useState(initial ? path : '')
  const [invalid, setInvalid] = useState(!!initial?.invalid)
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const request = useRef(''), running = useRef(false), destination = useRef('')
  const errorElement = useRef<HTMLParagraphElement>(null)
  const current = tasks.tasks.filter(task => task.type === 'duplicateInstance').find(task => task.requestId === request.current && !!request.current || !!partial && task.to === partial && (!running.current || task.state === TaskState.Running))
  const active = current?.state === TaskState.Running ? current : undefined
  const progress = current?.progress && 'progress' in current.progress ? current.progress : undefined
  const completed = !!partial && library?.status === 'ready' && !library.data?.pendingCopies[partial] && current?.state === TaskState.Succeed && !busy && !active
  useLayoutEffect(() => { if (current?.requestId === request.current) destination.current = current.to }, [current])
  useLayoutEffect(() => { if (error) errorElement.current?.scrollIntoView({ block: 'nearest' }) }, [error])
  function finish(result: string) {
    setFinished(result); setPartial(result)
    try { copyLegacyModGroups(source, result, window.localStorage) }
    catch { setError('groupsFailed'); return }
    onCreated(result)
  }
  async function start() {
    if (finished) { finish(finished); return }
    if (running.current || active || invalid) return
    running.current = true; request.current = createOperationId(); destination.current = partial; onBusy(true); setError(''); setCancelling(false)
    try {
      const result = partial ? await service.resumeInstanceCopy(partial, request.current) : await service.duplicateInstance(path, request.current)
      if (!result) throw new Error('missing')
      finish(result)
    } catch (failure) {
      const details = failure && typeof failure === 'object' ? failure : {}
      const name = 'name' in details && typeof details.name === 'string' ? details.name : ''
      const candidate = 'destinationPath' in details && typeof details.destinationPath === 'string' ? details.destinationPath : partial || destination.current
      if (candidate) try {
        const info = await service.getInstanceCopyState(candidate)
        if (info) { setPartial(candidate); setInvalid(!!info.invalid) }
      } catch { /* An interrupted review may not have registered a destination. */ }
      setError(isOperationCancelled(failure) ? 'cancelled' : ['InstanceCopyInvalid', 'InstanceCopySourceChanged', 'InstanceCopySourceMissing', 'InstanceCopyConflict', 'InstanceCopyGameRunning', 'InstanceCopyUnsafePath', 'InstanceCopyTooLarge'].includes(name) ? name : 'failed')
    } finally { running.current = false; onBusy(false); setCancelling(false) }
  }
  async function cancel() {
    if (!active || cancelling) return
    setCancelling(true)
    try { await tasks.cancel(active.id) } catch { setError('cancelFailed'); setCancelling(false) }
  }
  return <form className="operation-form" data-testid="instance-copy" onSubmit={event => { event.preventDefault(); void start() }}>
    <div className="creation-body" role="region" aria-label={t('react.copy.details')} tabIndex={0}>
      <p>{t(finished ? 'react.copy.filesComplete' : partial ? 'react.copy.resumeHelp' : 'react.operations.duplicateDetail')}</p>
      <p className="operation-path">{source}</p>
      {(partial || current?.to) && <p className="operation-path" data-testid="copy-path">{partial || current?.to}</p>}
      {partial && !finished && !completed && <p>{t('react.copy.pendingHelp')}</p>}
      {!!active || busy ? <div role="status" aria-live="polite">
        <p>{t(cancelling || current?.state === TaskState.Cancelled ? 'react.copy.cancelling' : progress && progress.total > 0 ? progress.progress >= progress.total ? 'react.copy.verifying' : 'react.copy.progress' : 'react.copy.reviewing', { progress: progress?.progress || 0, total: progress?.total || 0 })}</p>
        <progress aria-label={t('react.copy.progressLabel')} max={progress && progress.total > 0 ? progress.total : undefined} value={progress && progress.total > 0 ? progress.progress : undefined} />
      </div> : null}
      {error && <p ref={errorElement} role="alert" className="form-error">{t(`react.copy.${error}`)}</p>}
      {invalid && !error && <p role="alert" className="form-error">{t('react.copy.InstanceCopyInvalid')}</p>}
      {completed && <p role="status">{t('react.copy.complete')}</p>}
      {partial && <button type="button" className="button secondary" onClick={async () => { try { if (!await base.openDirectory(partial)) setError('failed') } catch { setError('failed') } }}>{t('react.operations.openFolder')}</button>}
    </div>
    <div className="dialog-actions">
      <button type="button" className="button secondary" disabled={busy} onClick={onBack}>{t('react.operations.back')}</button>
      {!!active && <button type="button" className="button secondary" disabled={cancelling} data-testid="copy-cancel" onClick={() => void cancel()}>{t(cancelling ? 'react.copy.cancelling' : 'react.copy.cancel')}</button>}
      {finished || completed ? <button type="button" className="button primary" data-testid="copy-finish" onClick={() => finish(finished || partial)}>{t(error === 'groupsFailed' ? 'react.copy.retryGroups' : 'react.copy.view')}</button> : <button type="submit" className="button primary" data-testid="instance-operation-confirm" disabled={busy || !!active || invalid}>{t(partial ? 'react.copy.resume' : 'react.operations.confirmDuplicate')}</button>}
    </div>
  </form>
}
