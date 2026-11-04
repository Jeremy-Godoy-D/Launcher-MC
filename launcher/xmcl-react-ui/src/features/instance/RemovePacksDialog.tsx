import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ResourcePackRemovalReview } from '@xmcl/runtime-api/src/services/InstanceResourcePacksService'
import { useI18n } from '../../i18n'

export function RemovePacksDialog({ review, busy, error, close, remove, returnFocus }: { review: ResourcePackRemovalReview; busy: boolean; error: string; close: () => void; remove: () => void; returnFocus: () => void }) {
  const { t, n } = useI18n()
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) close() }}><Dialog.Portal><Dialog.Overlay className="dialog-backdrop" /><Dialog.Content className="dialog creation-dialog" aria-busy={busy} onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }} onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onPointerDownOutside={event => event.preventDefault()}>
    <Dialog.Title>{t('react.packs.removeTitle')}</Dialog.Title><button className="icon-button dialog-close" disabled={busy} aria-label={t('react.packs.cancelRemove')} onClick={close}><X size={20} aria-hidden="true" /></button>
    <Dialog.Description>{t('react.packs.removeHelp')}</Dialog.Description>
    <div className="creation-body" role="region" aria-label={t('react.packs.removeFiles')} tabIndex={0}>
      {review.sharedDirectory && <p className="form-error">{t('react.packs.sharedDirectory')}</p>}
      {review.sharedOptions && <p>{t('react.packs.shared')}</p>}
      <ul className="pack-removal-files">{review.files.map(file => <li key={file.fileName}><strong>{file.fileName}</strong><span>{t(file.directory ? 'react.packs.folderEntries' : 'react.packs.archiveSize', { count: n(file.entries), size: n(file.size) })}</span></li>)}</ul>
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={close}>{t('react.packs.cancelRemove')}</button><button className="button primary" disabled={busy} onClick={remove}>{t('react.packs.confirmRemove')}</button></div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
