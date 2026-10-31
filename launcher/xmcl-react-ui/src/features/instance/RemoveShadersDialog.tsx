import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ShaderRemovalReview } from '@xmcl/runtime-api/src/services/InstanceShaderPacksService'
import { useI18n } from '../../i18n'

export function RemoveShadersDialog({ review, busy, error, backup, close, remove, returnFocus, openBackup }: { review: ShaderRemovalReview; busy: boolean; error: string; backup: string; close: () => void; remove: () => void; returnFocus: () => void; openBackup: () => void }) {
  const { t, n } = useI18n()
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) close() }}><Dialog.Portal><Dialog.Overlay className="dialog-backdrop" /><Dialog.Content className="dialog creation-dialog" aria-busy={busy} onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }} onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onPointerDownOutside={event => event.preventDefault()}>
    <Dialog.Title>{t('react.shaders.removeTitle')}</Dialog.Title><button className="icon-button dialog-close" disabled={busy} aria-label={t('react.packs.cancelRemove')} onClick={close}><X size={20} aria-hidden="true" /></button>
    <Dialog.Description>{t('react.shaders.removeHelp')}</Dialog.Description>
    <div className="creation-body" role="region" aria-label={t('react.shaders.removeFiles')} tabIndex={0}>
      {error && <p role="alert" className="form-error">{error}</p>}
      {backup && <p className="instance-path">{t('react.packs.backup')}: {backup} <button className="button secondary" disabled={busy} onClick={openBackup}>{t('react.packs.openBackup')}</button></p>}
      {review.sharedDirectory && <p className="form-error">{t('react.shaders.removeShared')}</p>}
      <ul className="pack-removal-files">{review.files.map(file => <li key={file.fileName}><strong>{file.fileName}</strong><span>{t(file.directory ? 'react.packs.folderEntries' : 'react.packs.archiveSize', { count: n(file.entries), size: n(file.size) })}</span></li>)}</ul>
      {!!review.configurations.length && <><p>{t('react.shaders.removeConfigurations')}</p><ul className="pack-removal-files">{review.configurations.map(file => <li key={file.engine}>{file.engine === 'optifine' ? 'OptiFine' : file.engine === 'iris' ? 'Iris' : 'Oculus'}: {file.pack}</li>)}</ul></>}
    </div>
    <div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={close}>{t('react.packs.cancelRemove')}</button><button className="button primary" disabled={busy} onClick={remove}>{t('react.packs.confirmRemove')}</button></div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
