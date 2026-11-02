import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowDownToLine, Bell, Check, CircleAlert, Clock, Square, X } from 'lucide-react'
import { TaskState } from '@xmcl/runtime-api/src/task'
import { useTasks } from '../../runtime'
import { useI18n } from '../../i18n'
import { useLibrary } from '../library/context'
import { taskInstance, taskLabel, taskProgress } from './taskView'
import './activity.css'

export function GlobalActivity() {
  const { t, n } = useI18n(), tasks = useTasks(), library = useLibrary()
  const [panel, setPanel] = useState<'tasks' | 'notices'>(), [limit, setLimit] = useState(100), [action, setAction] = useState<string>(), [failure, setFailure] = useState(false)
  const pending = useRef(false), trigger = useRef<HTMLButtonElement | null>(null), close = useRef<HTMLButtonElement>(null)
  const active = tasks.tasks.filter(task => task.state === TaskState.Running), finished = tasks.tasks.filter(task => task.state !== TaskState.Running)
  const errors = tasks.tasks.filter(task => task.state === TaskState.Failed)
  const items = panel === 'notices' ? finished.filter(task => task.state !== TaskState.Succeed || task.type !== 'resolveMarketFiles') : tasks.tasks
  const text = (key: string) => t(`react.activity.${key}`)
  async function operation(id?: string) {
    if (pending.current) return
    pending.current = true; setAction(id ?? 'clear'); setFailure(false)
    try { if (id) await tasks.cancel(id); else await tasks.clear() }
    catch { setFailure(true) }
    finally { pending.current = false; setAction(undefined) }
  }
  return <>
    <button className="icon-button activity-button" data-testid="global-tasks-open" aria-label={text('tasks')} onClick={event => { trigger.current = event.currentTarget; setLimit(100); setPanel('tasks') }}><ArrowDownToLine size={19} aria-hidden="true" />{!!active.length && <span className="activity-count" aria-hidden="true">{n(active.length)}</span>}</button>
    <button className="icon-button activity-button" data-testid="global-notices-open" aria-label={text('notices')} onClick={event => { trigger.current = event.currentTarget; setLimit(100); setPanel('notices') }}><Bell size={19} aria-hidden="true" />{!!errors.length && <span className="activity-count" aria-hidden="true">{n(errors.length)}</span>}</button>
    <Dialog.Root open={!!panel} onOpenChange={open => { if (!open) setPanel(undefined) }}><Dialog.Portal><Dialog.Overlay className="dialog-backdrop" /><Dialog.Content className="dialog activity-panel" data-testid="global-activity" onOpenAutoFocus={event => { event.preventDefault(); close.current?.focus() }} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus() }}>
      <header className="activity-heading"><div><Dialog.Title>{text(panel === 'notices' ? 'notices' : 'tasks')}</Dialog.Title><Dialog.Description>{text(panel === 'notices' ? 'noticesHelp' : 'tasksHelp')}</Dialog.Description></div><Dialog.Close asChild><button ref={close} type="button" className="icon-button" aria-label={text('close')}><X size={19} aria-hidden="true" /></button></Dialog.Close></header>
      <div className="activity-body">
        {(tasks.error || failure) && <div role="alert"><p>{text('failed')}</p><button type="button" className="button secondary" disabled={!!action} onClick={() => { setFailure(false); void tasks.refresh() }}>{text('retry')}</button></div>}
        <p role="status" className="text-muted">{t('react.activity.running', { count: active.length })}</p>
        {!items.length && <div className="activity-empty"><Check size={28} aria-hidden="true" /><p>{text(tasks.loading ? 'loading' : panel === 'notices' ? 'noNotices' : 'noTasks')}</p></div>}
        <ol className="activity-list">{items.slice(0, limit).map(task => {
          const progress = taskProgress(task), name = taskInstance(task, library?.instances ?? [])
          const status = task.state === TaskState.Running ? 'runningState' : task.state === TaskState.Failed ? 'failedState' : task.state === TaskState.Cancelled ? 'cancelledState' : 'doneState'
          const title = text(taskLabel(task))
          return <li key={task.id} className={`activity-item ${status}`} data-testid="global-activity-item" data-task-id={task.id} data-task-type={task.type}>
            <div className="activity-item-heading">{task.state === TaskState.Running ? <Clock size={18} aria-hidden="true" /> : task.state === TaskState.Failed ? <CircleAlert size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}<div><strong>{title}</strong>{name && <p>{name}</p>}</div><span data-testid="global-task-state">{text(status)}</span></div>
            {task.state === TaskState.Running && <><progress aria-label={title} {...progress} />{progress && <p className="text-muted">{n(progress.value / progress.max, { style: 'percent', maximumFractionDigits: 0 })}</p>}<button type="button" className="button secondary" data-testid="global-task-cancel" disabled={!!action} onClick={() => void operation(task.id)}><Square size={14} aria-hidden="true" />{text(action === task.id ? 'cancelling' : 'cancel')}</button></>}
            {task.state === TaskState.Failed && <p>{text('operationFailed')}</p>}
          </li>
        })}</ol>
        {items.length > limit && <button type="button" className="button secondary" onClick={() => setLimit(value => value + 100)}>{text('more')}</button>}
      </div>
      <footer className="activity-footer">{panel === 'notices' && <button type="button" className="button secondary" onClick={() => setPanel('tasks')}>{text('viewTasks')}</button>}<button type="button" className="button secondary" data-testid="global-tasks-clear" disabled={!finished.length || !!action} onClick={() => void operation()}>{text(action === 'clear' ? 'clearing' : 'clear')}</button></footer>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </>
}
