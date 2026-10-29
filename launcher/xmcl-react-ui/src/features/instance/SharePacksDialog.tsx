import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ResourcePackSharingReview } from '@xmcl/runtime-api/src/services/InstanceResourcePacksService'
import { useI18n } from '../../i18n'

export function SharePacksDialog({ review, busy, error, close, apply, returnFocus }: { review: ResourcePackSharingReview; busy: boolean; error: string; close: () => void; apply: () => void; returnFocus: () => void }) {
  const { t, n } = useI18n()
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) close() }}><Dialog.Portal><Dialog.Overlay className="dialog-backdrop" /><Dialog.Content className="dialog creation-dialog" aria-busy={busy} onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }} onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onPointerDownOutside={event => event.preventDefault()}>
    <Dialog.Title>{t(review.shared ? 'react.packSharing.link' : 'react.packSharing.unlink')}</Dialog.Title><button className="icon-button dialog-close" disabled={busy} aria-label={t('react.packSharing.cancel')} onClick={close}><X size={20} aria-hidden="true" /></button>
    <Dialog.Description>{t(review.shared ? 'react.packSharing.linkHelp' : 'react.packSharing.unlinkHelp')}</Dialog.Description>
    <div className="creation-body" role="region" aria-label={t('react.packSharing.review')} tabIndex={0}>
      {!review.linked && <p>{t('react.packSharing.localCount', { count: n(review.localPacks) })}</p>}
      <p>{t('react.packSharing.sharedCount', { count: n(review.sharedPacks) })}</p>
      <p>{t('react.packSharing.copyCount', { count: n(review.files), bytes: n(review.bytes) })}</p>
      <p>{t('react.packSharing.selection')}</p>
      {!!review.conflicts.length && <div role="alert" className="form-error"><p>{t('react.packSharing.conflicts', { count: n(review.conflicts.length) })}</p><ul>{review.conflicts.slice(0, 100).map(name => <li key={name}>{name}</li>)}</ul>{review.conflicts.length > 100 && <p>{t('react.packSharing.moreConflicts')}</p>}</div>}
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={close}>{t('react.packSharing.cancel')}</button><button className="button primary" disabled={busy || !!review.conflicts.length} onClick={apply}>{t(review.shared ? 'react.packSharing.confirmLink' : 'react.packSharing.confirmUnlink')}</button></div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
