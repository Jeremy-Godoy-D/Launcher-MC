import { useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { DataMigrationReview } from '@xmcl/runtime-api/src/services/BaseService'
import { BaseServiceKey } from '@xmcl/runtime-api/src/services/BaseService'
import { useService } from '../../runtime'
import { useI18n } from '../../i18n'

export function DataDirectory({ disabled }: { disabled: boolean }) {
  const base = useService(BaseServiceKey), { t } = useI18n()
  const text = (key: string) => t(`react.migration.${key}`)
  const [open, setOpen] = useState(false), [path, setPath] = useState(''), [review, setReview] = useState<DataMigrationReview>()
  const [state, setState] = useState<'idle' | 'reviewing' | 'restarting'>('idle'), [issue, setIssue] = useState('')
  const pending = useRef(false), alive = useRef(true), errorFocus = useRef<HTMLParagraphElement>(null), reviewFocus = useRef<HTMLDivElement>(null), destinationFocus = useRef<HTMLInputElement>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (issue) errorFocus.current?.focus() }, [issue])
  useEffect(() => { if (review) reviewFocus.current?.focus(); else if (open) destinationFocus.current?.focus() }, [review, open])
  function failed(error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    setIssue(['invalid', 'occupied', 'nested', 'changed', 'busy'].includes(code) ? code : 'reviewError')
  }
  async function choose() {
    if (pending.current) return
    pending.current = true; setState('reviewing'); setIssue('')
    try {
      if (!window.windowController?.showOpenDialog) throw new Error('Picker unavailable')
      const result = await window.windowController.showOpenDialog({ title: text('choose'), properties: ['openDirectory', 'createDirectory'] })
      if (!result.canceled && result.filePaths[0] && alive.current) { setPath(result.filePaths[0]); setReview(undefined) }
    } catch (error) { if (alive.current) failed(error) }
    finally { pending.current = false; if (alive.current) setState('idle') }
  }
  async function check() {
    if (pending.current) return
    pending.current = true; setState('reviewing'); setIssue(''); setReview(undefined)
    try { const result = await base.reviewDataMigration(path); if (alive.current) setReview(result) }
    catch (error) { if (alive.current) failed(error) }
    finally { pending.current = false; if (alive.current) setState('idle') }
  }
  async function migrate() {
    if (pending.current || disabled || !review || review.unchanged) return
    pending.current = true; setState('restarting'); setIssue('')
    try { await base.migrate({ destination: review.destination, expectedSource: review.source }) }
    catch (error) { if (alive.current) { failed(error); setState('idle'); setReview(undefined) }; pending.current = false }
  }
  return <Dialog.Root open={open} onOpenChange={value => { if (!pending.current) { setOpen(value); setIssue(''); if (!value) setReview(undefined) } }}>
    <Dialog.Trigger asChild><button type="button" className="button secondary" data-testid="global-data-migrate" disabled={disabled}>{text('move')}</button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-backdrop" /><Dialog.Content className="dialog creation-dialog operation-dialog" data-testid="data-migration-dialog" onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (pending.current) event.preventDefault() }}>
      <Dialog.Title>{text('title')}</Dialog.Title><Dialog.Description>{text('help')}</Dialog.Description>
      <div className="creation-body">
        {!review && <><div className="field"><label htmlFor="migration-destination">{text('destination')}</label><input ref={destinationFocus} id="migration-destination" data-testid="data-migration-destination" value={path} disabled={state !== 'idle'} aria-invalid={!!issue || undefined} aria-describedby={issue ? 'data-migration-error' : undefined} onChange={event => { setPath(event.target.value); setReview(undefined); setIssue('') }} /></div>
        <button type="button" className="button secondary" data-testid="data-migration-choose" disabled={state !== 'idle'} onClick={() => void choose()}>{text('choose')}</button></>}
        {review && <div ref={reviewFocus} tabIndex={-1} role="group" aria-label={text('review')} className="data-migration-review" data-testid="data-migration-review"><dl><dt>{text('source')}</dt><dd>{review.source}</dd><dt>{text('destination')}</dt><dd>{review.destination}</dd></dl><p role="status">{text(review.unchanged ? 'unchanged' : 'reviewHelp')}</p></div>}
        {issue && <p id="data-migration-error" ref={errorFocus} tabIndex={-1} role="alert" data-testid="data-migration-error">{text(issue)}</p>}
        {state !== 'idle' && <p role="status">{text(state)}</p>}
      </div>
      <div className="dialog-actions"><Dialog.Close asChild><button type="button" className="button secondary" disabled={state !== 'idle'}>{text('cancel')}</button></Dialog.Close>{review && <button type="button" className="button secondary" disabled={state !== 'idle'} onClick={() => setReview(undefined)}>{text('edit')}</button>}<button type="button" className="button primary" data-testid={review ? 'data-migration-confirm' : 'data-migration-check'} disabled={disabled || state !== 'idle' || !path || !!review?.unchanged} onClick={() => void (review ? migrate() : check())}>{text(review ? 'confirm' : 'review')}</button></div>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>
}
