import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { ResourcePackSharingReview } from '@xmcl/runtime-api/src/services/InstanceResourcePacksService'
import { useI18n } from '../../i18n'

export function SharePacksDialog({ review, busy, error, close, apply, returnFocus, shaders = false }: { review: ResourcePackSharingReview; busy: boolean; error: string; close: () => void; apply: () => void; returnFocus: () => void; shaders?: boolean }) {
  const { t, n } = useI18n()
  const prefix = shaders ? 'react.shaderSharing' : 'react.packSharing'
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => { if (error) body.current?.scrollTo({ top: 0 }) }, [error])
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) close() }}><Dialog.Portal><Dialog.Overlay className="dialog-backdrop" /><Dialog.Content className="dialog creation-dialog" aria-busy={busy} onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }} onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onPointerDownOutside={event => event.preventDefault()}>
    <Dialog.Title>{t(`${prefix}.${review.shared ? 'link' : 'unlink'}`)}</Dialog.Title><button className="icon-button dialog-close" disabled={busy} aria-label={t(`${prefix}.cancel`)} onClick={close}><X size={20} aria-hidden="true" /></button>
    <Dialog.Description>{t(`${prefix}.${review.shared ? 'linkHelp' : 'unlinkHelp'}`)}</Dialog.Description>
    <div ref={body} className="creation-body" role="region" aria-label={t(`${prefix}.review`)} tabIndex={0}>
      {error && <p role="alert" className="form-error">{error}</p>}
      {!review.linked && <p>{t(`${prefix}.localCount`, { count: n(review.localPacks) })}</p>}
      <p>{t(`${prefix}.sharedCount`, { count: n(review.sharedPacks) })}</p>
      <p>{t(`${prefix}.copyCount`, { count: n(review.files), bytes: n(review.bytes) })}</p>
      <p>{t(`${prefix}.selection`)}</p>
      {!!review.conflicts.length && <div role="alert" className="form-error"><p>{t(`${prefix}.conflicts`, { count: n(review.conflicts.length) })}</p><ul>{review.conflicts.slice(0, 100).map(name => <li key={name}>{name}</li>)}</ul>{review.conflicts.length > 100 && <p>{t(`${prefix}.moreConflicts`)}</p>}</div>}
    </div>
    <div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={close}>{t(`${prefix}.cancel`)}</button><button className="button primary" disabled={busy || !!review.conflicts.length} onClick={apply}>{t(`${prefix}.${review.shared ? 'confirmLink' : 'confirmUnlink'}`)}</button></div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
