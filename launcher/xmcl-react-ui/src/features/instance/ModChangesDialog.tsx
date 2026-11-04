import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { planModChanges } from '@xmcl/runtime-api/src/util/modChanges'
import { describeModRule } from '@xmcl/runtime-api/src/util/modRules'
import { useI18n } from '../../i18n'

export function ModChangesDialog({ plan, enable, incomplete, busy, error, close, apply, returnFocus }: { plan: ReturnType<typeof planModChanges>; enable: boolean; incomplete: boolean; busy: boolean; error: string; close: () => void; apply: () => void; returnFocus: () => void }) {
  const { t } = useI18n(), words = { any: t('react.modDiagnostics.any'), all: t('react.modDiagnostics.all'), unless: t('react.modDiagnostics.unless'), optional: t('react.modInfo.optional') }
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) close() }}><Dialog.Portal><Dialog.Overlay className="dialog-backdrop" /><Dialog.Content className="dialog creation-dialog content-remove-dialog" aria-busy={busy} onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }} onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onPointerDownOutside={event => event.preventDefault()}>
    <Dialog.Title>{t('react.modChanges.title')}</Dialog.Title><button className="icon-button dialog-close" aria-label={t('react.modChanges.cancel')} disabled={busy} onClick={close}><X size={20} aria-hidden="true" /></button>
    <Dialog.Description>{t(enable ? 'react.modChanges.enableHelp' : 'react.modChanges.disableHelp')}</Dialog.Description>
    <div className="creation-body" role="region" aria-label={t('react.modChanges.files')} tabIndex={0}>
      <h3>{t('react.modChanges.requested')}</h3><ul>{plan.requested.map(file => <li key={file.path}>{file.fileName}</li>)}</ul>
      {!!plan.additional.length && <><h3>{t('react.modChanges.additional')}</h3><ul>{plan.additional.map(file => <li key={file.path}>{file.fileName}</li>)}</ul></>}
      {incomplete && <p className="form-error">{t('react.modChanges.incomplete')}</p>}
      {!!plan.issues.length && <><h3>{t('react.modChanges.warnings')}</h3><ul>{plan.issues.map(issue => <li key={issue.key}>{issue.files.join(', ')} · {t(`react.modDiagnostics.kind.${issue.kind}`)}{issue.rule && ` · ${describeModRule(issue.rule, words)}`}</li>)}</ul></>}
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="content-actions"><button className="button secondary" disabled={busy} onClick={close}>{t('react.modChanges.cancel')}</button><button className="button primary" disabled={busy} onClick={apply}>{t('react.modChanges.apply')}</button></div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
