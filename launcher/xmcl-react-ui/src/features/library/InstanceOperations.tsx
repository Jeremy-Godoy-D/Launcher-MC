import { useRef, useState, type RefObject } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowDown, ArrowUp, Copy, FolderOpen, Layers, Pencil, Trash2, X } from 'lucide-react'
import { InstanceServiceKey } from '@xmcl/runtime-api/src/services/InstanceService'
import { LaunchServiceKey } from '@xmcl/runtime-api/src/services/LaunchService'
import { BaseServiceKey } from '@xmcl/runtime-api/src/services/BaseService'
import { useService } from '../../runtime'
import { useI18n } from '../../i18n'
import { useLibrary } from './context'
import type { SavedInstance } from './model'
import { metadataDraft, metadataEdit } from './operations'
import './operations.css'

type Mode = 'options' | 'edit' | 'duplicate' | 'remove' | 'group'
export function InstanceOperations({ instance, onClose, onCreated, returnFocus }: { instance: SavedInstance; onClose: () => void; onCreated: (path: string) => void; returnFocus: RefObject<HTMLElement | null> }) {
  const library = useLibrary()
  const service = useService(InstanceServiceKey)
  const processes = useService(LaunchServiceKey)
  const base = useService(BaseServiceKey)
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('options')
  const [draft, setDraft] = useState(() => metadataDraft(instance))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleteData, setDeleteData] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [success, setSuccess] = useState('')
  const [group, setGroup] = useState(() => {
    const entry = library?.data?.groups.find(group => typeof group !== 'string' && group.instances.includes(instance.path))
    return entry && typeof entry !== 'string' ? `id:${entry.id}` : ''
  })
  const [groupName, setGroupName] = useState('')
  const operation = useRef(false)
  const latest = library?.instances.find(item => item.path === instance.path)
  const unavailable = !latest || library?.status !== 'ready'
  function changeMode(value: Mode) { setMode(value); setError(''); setSuccess('') }
  async function run(action: () => Promise<void>, checkIdle = true) {
    if (operation.current) return
    operation.current = true; setBusy(true); setError('')
    try {
      if (unavailable) throw new Error('missing')
      if (checkIdle && (await processes.getGameProcesses()).some(process => process.options.gameDirectory === instance.path)) throw new Error('running')
      await action()
    } catch (failure) {
      const reason = failure instanceof Error ? ['InstanceMetadataChanged', 'InstanceGroupsChanged'].includes(failure.name) ? 'changed' : failure.name === 'InstanceNameDuplicatedError' ? 'duplicateName' : failure.message : ''
      setError(['missing', 'changed', 'invalid', 'invalidGroup', 'duplicateName', 'running'].includes(reason) ? reason : 'failed')
    } finally { operation.current = false; setBusy(false) }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !operation.current) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-backdrop" />
      <Dialog.Content className="dialog creation-dialog operation-dialog" data-testid="instance-operations" onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onCloseAutoFocus={event => {
        event.preventDefault()
        const target = returnFocus.current?.isConnected ? returnFocus.current : document.querySelector<HTMLElement>('main h1')
        if (target) { if (target.tagName === 'H1') target.tabIndex = -1; target.focus() }
      }}>
        <Dialog.Title>{t(`react.operations.${mode}Title`, { name: instance.name })}</Dialog.Title>
        <Dialog.Description>{t(`react.operations.${mode}Help`)}</Dialog.Description>
        <form className="operation-form" onSubmit={event => {
          event.preventDefault()
          if (mode === 'edit') void run(async () => {
            await service.editInstance(metadataEdit(instance, latest, draft, library?.instances || []))
            setSuccess('saved')
          })
          if (mode === 'duplicate') void run(async () => {
            const path = await service.duplicateInstance(instance.path)
            if (!path) throw new Error('missing')
            onCreated(path); onClose()
          })
          if (mode === 'remove' && (!deleteData || confirmation === instance.name)) void run(async () => {
            await service.deleteInstance(instance.path, deleteData)
            onClose()
          })
          if (mode === 'group') void run(async () => {
            if (!library) throw new Error('missing')
            await library.assignGroup(instance.path, group, groupName)
            setSuccess('saved')
          }, false)
        }}>
          <div className="creation-body">
            <p className="operation-path">{instance.path}</p>
            {mode === 'options' && <div className="operation-actions">
              <button type="button" className="button secondary" disabled={busy || unavailable} onClick={() => changeMode('edit')}><Pencil size={18} aria-hidden="true" />{t('react.operations.edit')}</button>
              <button type="button" className="button secondary" disabled={busy || unavailable} onClick={() => changeMode('duplicate')}><Copy size={18} aria-hidden="true" />{t('react.operations.duplicate')}</button>
              <button type="button" className="button secondary" disabled={busy || unavailable} onClick={() => changeMode('group')}><Layers size={18} aria-hidden="true" />{t('react.operations.group')}</button>
              <div className="operation-order">
                {([-1, 1] as const).map(direction => <button key={direction} type="button" className="button secondary" disabled={busy || unavailable} onClick={() => void run(async () => {
                  await library?.move(instance.path, direction)
                  library?.setSort('manual')
                  setSuccess('saved')
                }, false)}>{direction === -1 ? <ArrowUp size={18} aria-hidden="true" /> : <ArrowDown size={18} aria-hidden="true" />}{t(direction === -1 ? 'react.operations.moveUp' : 'react.operations.moveDown')}</button>)}
              </div>
              <button type="button" className="button secondary" disabled={busy || unavailable} onClick={() => void run(async () => { if (!await base.openDirectory(instance.path)) throw new Error('missing') }, false)}><FolderOpen size={18} aria-hidden="true" />{t('react.operations.openFolder')}</button>
              <button type="button" className="button secondary danger-text" disabled={busy || unavailable} onClick={() => changeMode('remove')}><Trash2 size={18} aria-hidden="true" />{t('react.operations.remove')}</button>
            </div>}
            {mode === 'edit' && <>
              <label htmlFor="instance-edit-name">{t('react.operations.name')}</label>
              <input id="instance-edit-name" value={draft.name} maxLength={100} disabled={busy || !!success} onChange={event => setDraft({ ...draft, name: event.target.value })} />
              <label htmlFor="instance-edit-description">{t('react.operations.description')}</label>
              <textarea id="instance-edit-description" value={draft.description} maxLength={1000} disabled={busy || !!success} onChange={event => setDraft({ ...draft, description: event.target.value })} />
              <label htmlFor="instance-edit-author">{t('react.operations.author')}</label>
              <input id="instance-edit-author" value={draft.author} maxLength={100} disabled={busy || !!success} onChange={event => setDraft({ ...draft, author: event.target.value })} />
            </>}
            {mode === 'duplicate' && <p>{t('react.operations.duplicateDetail')}</p>}
            {mode === 'group' && <>
              <label htmlFor="instance-group">{t('react.operations.group')}</label>
              <select id="instance-group" value={group} disabled={busy || !!success} onChange={event => setGroup(event.target.value)}>
                <option value="">{t('react.operations.ungrouped')}</option>
                {(library?.data?.groups || []).flatMap(group => typeof group === 'string' ? [] : [<option key={group.id} value={`id:${group.id}`}>{group.name}</option>])}
                <option value="new">{t('react.operations.newGroup')}</option>
              </select>
              {group === 'new' && <><label htmlFor="instance-group-name">{t('react.operations.groupName')}</label><input id="instance-group-name" maxLength={100} value={groupName} disabled={busy || !!success} onChange={event => setGroupName(event.target.value)} /></>}
            </>}
            {mode === 'remove' && <>
              <p>{t('react.operations.keepDetail')}</p>
              <label className="creation-check"><input type="checkbox" checked={deleteData} disabled={busy} onChange={event => { setDeleteData(event.target.checked); setConfirmation('') }} />{t('react.operations.deleteFiles')}</label>
              {deleteData && <>
                <p>{t('react.operations.deleteDetail')}</p>
                <label htmlFor="instance-remove-confirmation">{t('react.operations.typeName', { name: instance.name })}</label>
                <input id="instance-remove-confirmation" value={confirmation} disabled={busy} autoComplete="off" onChange={event => setConfirmation(event.target.value)} />
              </>}
            </>}
            {unavailable && <p role="alert" className="form-error">{t('react.operations.missing')}</p>}
            {!!error && <p role="alert" className="form-error">{t(`react.operations.${error}`)}</p>}
            {!!success && <p role="status">{t('react.operations.saved')}</p>}
            {busy && <p role="status">{t('react.operations.busy')}</p>}
          </div>
          <div className="dialog-actions">
            <button type="button" className="button secondary" disabled={busy} onClick={() => mode !== 'options' && !success ? changeMode('options') : onClose()}>{t(mode === 'options' || success ? 'react.operations.close' : 'react.operations.back')}</button>
            {mode !== 'options' && !success && <button type="submit" className="button primary" data-testid="instance-operation-confirm" disabled={busy || unavailable || mode === 'remove' && deleteData && confirmation !== instance.name}>{t(busy ? 'react.operations.busy' : mode === 'edit' || mode === 'group' ? 'react.operations.save' : mode === 'duplicate' ? 'react.operations.confirmDuplicate' : deleteData ? 'react.operations.confirmDelete' : 'react.operations.confirmRemove')}</button>}
          </div>
        </form>
        <Dialog.Close className="dialog-close" aria-label={t('react.operations.close')} disabled={busy}><X size={20} /></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
