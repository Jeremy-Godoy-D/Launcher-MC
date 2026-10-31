import { useRef, useState, type RefObject } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { InstanceServiceKey, type InstanceState } from '@xmcl/runtime-api/src/services/InstanceService'
import { useService } from '../../runtime'
import { useI18n } from '../../i18n'
import { useLibrary } from './context'
import { changeGroup } from './operations'

export function GroupsDialog({ onClose, onRemoved, returnFocus }: { onClose: () => void; onRemoved: (id: string) => void; returnFocus: RefObject<HTMLElement | null> }) {
  const library = useLibrary(), service = useService(InstanceServiceKey), { t } = useI18n()
  const [snapshot, setSnapshot] = useState(() => structuredClone(library?.data?.groups || []) as InstanceState['groups'])
  const groups = snapshot.flatMap(group => typeof group === 'string' ? [] : [group])
  const [id, setId] = useState(groups[0]?.id || '')
  const [name, setName] = useState(groups[0]?.name || '')
  const [remove, setRemove] = useState(false)
  const [busy, setBusy] = useState(false), running = useRef(false)
  const [saved, setSaved] = useState(false), [error, setError] = useState('')
  const available = library?.status === 'ready'
  function refresh() {
    const next = structuredClone(library?.data?.groups || []) as InstanceState['groups']
    const first = next.find(group => typeof group !== 'string')
    setSnapshot(next); setId(first && typeof first !== 'string' ? first.id : ''); setName(first && typeof first !== 'string' ? first.name : '')
    setRemove(false); setSaved(false); setError('')
  }
  async function save() {
    if (running.current || !available) return
    running.current = true; setBusy(true); setError('')
    try {
      await service.updateInstanceGroups(snapshot, changeGroup(snapshot, id, remove ? undefined : name))
      if (remove) onRemoved(id)
      setSaved(true)
    } catch (failure) {
      const name = failure && typeof failure === 'object' && 'name' in failure ? failure.name : ''
      const message = failure && typeof failure === 'object' && 'message' in failure ? failure.message : ''
      setError(name === 'InstanceGroupsChanged' || message === 'changed' ? 'changed' : message === 'invalidGroup' ? 'invalidGroup' : 'failed')
    } finally { running.current = false; setBusy(false) }
  }
  return <Dialog.Root open onOpenChange={value => { if (!value && !running.current) onClose() }}>
    <Dialog.Portal><Dialog.Overlay className="dialog-backdrop" />
      <Dialog.Content className="dialog creation-dialog operation-dialog" data-testid="library-groups-dialog" onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onCloseAutoFocus={event => {
        event.preventDefault()
        const target = returnFocus.current?.isConnected ? returnFocus.current : document.querySelector<HTMLElement>('main h1')
        if (target) { if (target.tagName === 'H1') target.tabIndex = -1; target.focus() }
      }}>
        <Dialog.Title>{t('react.groups.title')}</Dialog.Title>
        <Dialog.Description>{t('react.groups.help')}</Dialog.Description>
        <form className="operation-form" onSubmit={event => { event.preventDefault(); void save() }}>
          <div className="creation-body">
            {!!groups.length && <>
              <label htmlFor="managed-group">{t('react.operations.group')}</label>
              <select id="managed-group" value={id} disabled={busy || saved} onChange={event => {
                setId(event.target.value); setName(groups.find(group => group.id === event.target.value)?.name || ''); setRemove(false); setError('')
              }}>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
              <label htmlFor="managed-group-name">{t('react.operations.groupName')}</label>
              <input id="managed-group-name" value={name} maxLength={100} disabled={busy || saved || remove} onChange={event => setName(event.target.value)} />
              <label className="creation-check"><input type="checkbox" checked={remove} disabled={busy || saved} onChange={event => { setRemove(event.target.checked); setError('') }} />{t('react.groups.dissolve')}</label>
              {remove && <p>{t('react.groups.keep')}</p>}
            </>}
            {!groups.length && <p>{t('react.groups.empty')}</p>}
            {error && <p role="alert" className="form-error">{t(error === 'invalidGroup' ? 'react.operations.invalidGroup' : `react.groups.${error}`)}</p>}
            {!available && <p role="alert" className="form-error">{t('react.groups.unavailable')}</p>}
            {saved && <p role="status">{t('react.operations.saved')}</p>}
            {busy && <p role="status">{t('react.operations.busy')}</p>}
          </div>
          <div className="dialog-actions">
            <button type="button" className="button secondary" disabled={busy} onClick={onClose}>{t('react.operations.close')}</button>
            <button type="button" className="button secondary" disabled={busy || !available} onClick={refresh}>{t('react.groups.refresh')}</button>
            {!!groups.length && !saved && <button type="submit" className="button primary" data-testid="group-confirm" disabled={busy || !available}>{t(remove ? 'react.groups.confirmDissolve' : 'react.operations.save')}</button>}
          </div>
        </form>
        <Dialog.Close className="dialog-close" aria-label={t('react.operations.close')} disabled={busy}><X size={20} /></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
