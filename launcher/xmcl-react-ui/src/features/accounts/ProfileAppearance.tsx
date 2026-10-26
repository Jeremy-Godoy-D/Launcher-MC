import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useAccounts } from './context'
import type { ProfileEntry } from './model'
import '../library/creation.css'

export function ProfileAppearance({ entry, onClose, returnFocus }: { entry: ProfileEntry; onClose: () => void; returnFocus: RefObject<HTMLElement | null> }) {
  const accounts = useAccounts(), { t } = useI18n()
  const original = entry.user.profiles[entry.id].textures
  const [skin, setSkin] = useState<string | null>()
  const [cape, setCape] = useState<string>()
  const [slim, setSlim] = useState(original.SKIN.metadata?.model === 'slim')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const running = useRef(false), alert = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => { if (error) alert.current?.scrollIntoView({ block: 'nearest' }) }, [error])
  const current = accounts?.entries.find(candidate => candidate.user.id === entry.user.id && candidate.id === entry.id)
  const changedModel = slim !== (original.SKIN.metadata?.model === 'slim')
  const modified = skin !== undefined || cape !== undefined || changedModel && !!original.SKIN.url
  async function choose(kind: 'skin' | 'cape') {
    if (running.current) return
    try {
      const chosen = await window.windowController?.showOpenDialog?.({ properties: ['openFile'], filters: [{ name: 'PNG', extensions: ['png'] }] })
      if (chosen && !chosen.canceled && chosen.filePaths[0]) {
        if (kind === 'skin') setSkin(chosen.filePaths[0]); else setCape(chosen.filePaths[0])
        setError(false)
      }
    } catch { setError(true) }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !running.current) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-backdrop" />
      <Dialog.Content className="dialog creation-dialog" data-testid="profile-appearance" onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); else document.querySelector<HTMLInputElement>('[data-testid="local-profile-name"]')?.focus() }} onEscapeKeyDown={event => { if (running.current) event.preventDefault() }} onPointerDownOutside={event => { if (running.current) event.preventDefault() }}>
        <Dialog.Title>{t('react.accounts.appearanceTitle', { name: entry.name })}</Dialog.Title>
        <Dialog.Description>{t('react.accounts.appearanceHelp')}</Dialog.Description>
        <form className="profile-appearance-form" onSubmit={async event => {
          event.preventDefault()
          if (!accounts || !current || running.current || !modified) return
          running.current = true; setBusy(true); setError(false)
          try {
            await accounts.appearance(entry, { skin: skin === null ? null : skin !== undefined || changedModel && original.SKIN.url ? { url: skin ?? original.SKIN.url, slim } : undefined, cape })
            onClose()
          } catch { setError(true) }
          finally { running.current = false; setBusy(false) }
        }}>
          <div className="creation-body" role="region" tabIndex={0} aria-label={t('react.accounts.appearanceFields')}>
            <p>{t('react.accounts.identityHelp')}</p>
            <fieldset disabled={busy || accounts?.busy || !current}>
              <legend>{t('react.accounts.skin')}</legend>
              <p className="form-help">{t('react.accounts.skinHelp')}</p>
              <div className="profile-texture-actions">
                <button type="button" className="button secondary" onClick={() => void choose('skin')}>{t('react.accounts.chooseSkin')}</button>
                <button type="button" className="button secondary" onClick={() => { setSkin(null); setError(false) }}>{t('react.accounts.resetSkin')}</button>
              </div>
              <p className="profile-texture-source">{skin === null ? t('react.accounts.willReset') : skin ?? (original.SKIN.url ? t('react.accounts.savedTexture') : t('react.accounts.defaultSkin'))}</p>
              <label htmlFor="profile-model">{t('react.accounts.model')}</label>
              <select id="profile-model" value={slim ? 'slim' : 'classic'} disabled={skin === null || !skin && !original.SKIN.url} onChange={event => setSlim(event.target.value === 'slim')}><option value="classic">{t('react.accounts.classic')}</option><option value="slim">{t('react.accounts.slim')}</option></select>
            </fieldset>
            <fieldset disabled={busy || accounts?.busy || !current}>
              <legend>{t('react.accounts.cape')}</legend>
              <p className="form-help">{t('react.accounts.capeHelp')}</p>
              <div className="profile-texture-actions">
                <button type="button" className="button secondary" onClick={() => void choose('cape')}>{t('react.accounts.chooseCape')}</button>
                <button type="button" className="button secondary" onClick={() => { setCape(''); setError(false) }}>{t('react.accounts.resetCape')}</button>
              </div>
              <p className="profile-texture-source">{cape === '' ? t('react.accounts.willReset') : cape ?? (original.CAPE?.url ? t('react.accounts.savedTexture') : t('react.accounts.noCape'))}</p>
            </fieldset>
            {!current && <p role="alert" className="form-error">{t('react.accounts.profileMissing')}</p>}
            {error && <p ref={alert} role="alert" className="form-error">{t('react.accounts.appearanceError')}</p>}
          </div>
          <div className="dialog-actions">
            <button type="button" className="button secondary" disabled={busy} onClick={onClose}>{t('react.accounts.cancel')}</button>
            <button type="submit" className="button primary" data-testid="profile-appearance-save" disabled={busy || accounts?.busy || !current || !modified}>{t(busy ? 'react.accounts.saving' : 'react.accounts.saveAppearance')}</button>
          </div>
        </form>
        <Dialog.Close className="dialog-close" aria-label={t('react.accounts.close')} disabled={busy}><X size={20} /></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
