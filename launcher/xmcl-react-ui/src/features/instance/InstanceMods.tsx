import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { FolderOpen, RefreshCw, Search } from 'lucide-react'
import { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import { InstanceModsServiceKey, getInstanceModStateKey } from '@xmcl/runtime-api/src/services/InstanceModsService'
import { LaunchServiceKey } from '@xmcl/runtime-api/src/services/LaunchService'
import { useService, useSharedStateStore } from '../../runtime'
import { useI18n } from '../../i18n'
import type { SavedInstance } from '../library/model'
import { modIdentity } from './modIdentity'

export function InstanceMods({ path, runtime, running }: { path: string; runtime: SavedInstance['runtime']; running: boolean }) {
  const { t } = useI18n(), service = useService(InstanceModsServiceKey), processes = useService(LaunchServiceKey)
  const store = useSharedStateStore({ key: getInstanceModStateKey(path), Type: ResourceState, load: client => client.service(InstanceModsServiceKey).watch(path) })
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const active = useRef(true), pending = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const files = (snapshot.data?.files || []).map(file => { const identity = modIdentity(file, runtime); return { ...file, name: identity.name, resourceVersion: identity.version } })
  const matches = files.filter(file => `${file.name} ${file.fileName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (filter === 'all' || file.fileName.endsWith('.disabled') === (filter === 'disabled')))
  const selection = files.filter(file => selected.includes(file.path))
  async function run(action: () => Promise<unknown>, mutating = false) {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setNotice('')
    try {
      if (mutating && (await processes.getGameProcesses()).some(process => process.options.gameDirectory === path)) throw new Error('running')
      if (!active.current) return
      await action()
      if (active.current && mutating) { setSelected([]); setNotice(t('react.content.applied')) }
    } catch (failure) {
      if (active.current) setError(t(failure instanceof Error && failure.message === 'running' ? 'react.content.running' : 'react.content.failed'))
    } finally { pending.current = false; if (active.current) setBusy(false) }
  }
  function toggle(targets: typeof files, enabled: boolean) {
    const changes = targets.filter(file => file.fileName.endsWith('.disabled') === enabled).map(file => file.path)
    if (changes.length) void run(async () => {
      if (enabled) await service.enable({ path, files: changes })
      else await service.disable({ path, files: changes })
      if (active.current) {
        await store.revalidate()
        if (store.getSnapshot().status === 'error') throw new Error('refresh')
      }
    }, true)
  }
  return <section aria-labelledby="instance-mods-title" data-testid="instance-mods" data-instance-path={path} aria-busy={busy || snapshot.status === 'loading'}>
    <div className="section-heading"><h2 id="instance-mods-title">{t('react.workspace.mods')}</h2><div className="content-actions">
      <button className="button secondary" disabled={busy} onClick={() => void run(() => service.showDirectory(path))}><FolderOpen size={16} aria-hidden="true" />{t('react.content.folder')}</button>
      <button className="button secondary" disabled={busy} onClick={() => void run(() => store.revalidate())}><RefreshCw size={16} aria-hidden="true" />{t('react.content.refresh')}</button>
    </div></div>
    <div className="content-filters">
      <label className="search"><Search size={16} aria-hidden="true" /><input aria-label={t('react.content.search')} placeholder={t('react.content.search')} value={query} onChange={event => setQuery(event.target.value)} /></label>
      <select aria-label={t('react.content.filter')} value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{t('react.content.all')}</option><option value="enabled">{t('react.content.enabled')}</option><option value="disabled">{t('react.content.disabled')}</option></select>
    </div>
    {snapshot.status === 'loading' && <p role="status">{t('react.content.loading')}</p>}
    {snapshot.status === 'error' && <p role="alert" className="form-error">{t('react.content.loadFailed')}</p>}
    {running && <p role="status">{t('react.content.running')}</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!!snapshot.data?.errors.length && <div role="alert" className="form-error"><p>{t('react.content.parseFailed')}</p><ul>{snapshot.data.errors.map(file => <li key={file.path}>{file.path.split(/[\\/]/).pop()} · {file.code}</li>)}</ul></div>}
    {!!selection.length && <div className="content-selection" role="group" aria-label={t('react.content.selection')}><span>{t('react.content.selected', { count: selection.length })}</span>
      <button className="button secondary" disabled={busy || running || snapshot.status !== 'ready' || !selection.some(file => file.fileName.endsWith('.disabled'))} onClick={() => toggle(selection, true)}>{t('react.content.enable')}</button>
      <button className="button secondary" disabled={busy || running || snapshot.status !== 'ready' || !selection.some(file => !file.fileName.endsWith('.disabled'))} onClick={() => toggle(selection, false)}>{t('react.content.disable')}</button>
      <button className="button secondary" disabled={busy} onClick={() => setSelected([])}>{t('react.content.clear')}</button>
    </div>}
    {snapshot.status === 'ready' && !files.length && <p className="empty">{t('react.content.empty')}</p>}
    {snapshot.status === 'ready' && !!files.length && !matches.length && <p className="empty">{t('react.content.noMatches')}</p>}
    <ul className="content-list" aria-label={t('react.workspace.mods')}>{matches.map(file => {
      const disabled = file.fileName.endsWith('.disabled')
      return <li key={file.path} data-file-name={file.fileName}>
        <input type="checkbox" aria-label={t('react.content.select', { name: file.name || file.fileName })} checked={selected.includes(file.path)} disabled={busy} onChange={event => setSelected(value => event.target.checked ? [...value, file.path] : value.filter(path => path !== file.path))} />
        <div className="content-file"><strong>{file.name || file.fileName}</strong><span>{file.fileName}{file.resourceVersion && ` · ${file.resourceVersion}`}</span><small>{file.metadata.modrinth ? 'Modrinth' : file.metadata.curseforge ? 'CurseForge' : t('react.content.local')}</small></div>
        <span className="content-state">{t(disabled ? 'react.content.disabled' : 'react.content.enabled')}</span>
        <button className="button secondary" aria-label={t(disabled ? 'react.content.enableName' : 'react.content.disableName', { name: file.name || file.fileName })} disabled={busy || running || snapshot.status !== 'ready'} onClick={() => toggle([file], disabled)}>{t(disabled ? 'react.content.enable' : 'react.content.disable')}</button>
      </li>
    })}</ul>
  </section>
}
