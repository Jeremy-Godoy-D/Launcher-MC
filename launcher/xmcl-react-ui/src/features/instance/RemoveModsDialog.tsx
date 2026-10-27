import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useI18n } from '../../i18n'

export type ReviewedMod = { path: string; fileName: string; hash: string }
export function RemoveModsDialog({ files, busy, error, close, remove, returnFocus }: { files: ReviewedMod[]; busy: boolean; error: string; close: () => void; remove: () => void; returnFocus: () => void }) {
  const { t } = useI18n()
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) close() }}><Dialog.Portal><Dialog.Overlay className="dialog-backdrop" /><Dialog.Content className="dialog creation-dialog content-remove-dialog" aria-busy={busy} onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }} onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onPointerDownOutside={event => event.preventDefault()}>
    <Dialog.Title>{t('react.content.removeTitle', { count: files.length })}</Dialog.Title><button className="icon-button dialog-close" aria-label={t('react.content.cancelRemove')} disabled={busy} onClick={close}><X size={20} aria-hidden="true" /></button>
    <Dialog.Description>{t('react.content.removeHelp')}</Dialog.Description>
    <ul className="content-remove-files">{files.map(file => <li key={file.path}>{file.fileName}</li>)}</ul>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="content-actions"><button className="button secondary" disabled={busy} onClick={close}>{t('react.content.cancelRemove')}</button><button className="button primary" disabled={busy} onClick={remove}>{t('react.content.confirmRemove')}</button></div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
