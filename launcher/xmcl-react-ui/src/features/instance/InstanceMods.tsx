import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { FolderOpen, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import { InstanceModsServiceKey, getInstanceModStateKey, type ModFilesSnapshot } from '@xmcl/runtime-api/src/services/InstanceModsService'
import { LaunchServiceKey } from '@xmcl/runtime-api/src/services/LaunchService'
import { useService, useSharedStateStore } from '../../runtime'
import { useI18n } from '../../i18n'
import type { SavedInstance } from '../library/model'
import { modIdentity } from './modIdentity'
import { useContentGroups } from './useContentGroups'
import { ContentGroupsEditor } from './ContentGroupsEditor'
import { assignContentGroup, contentGroupMemberships } from './contentGroups'
import { normalizeModFileName } from '@xmcl/runtime-api/src/services/InstanceModsGroupService'
import { RemoveModsDialog, type ReviewedMod } from './RemoveModsDialog'
import { ModDetails } from './ModDetails'
import { ModDiagnostics } from './ModDiagnostics'

export function InstanceMods({ path, runtime, running, configuredJava }: { path: string; runtime: SavedInstance['runtime']; running: boolean; configuredJava?: SavedInstance['java'] }) {
  const { t } = useI18n(), service = useService(InstanceModsServiceKey), processes = useService(LaunchServiceKey)
  const grouping = useContentGroups(path)
  const [groupFilter, setGroupFilter] = useState('all'), [assignTo, setAssignTo] = useState(''), [editingGroups, setEditingGroups] = useState(false)
  const manageGroups = useRef<HTMLButtonElement>(null), searchInput = useRef<HTMLInputElement>(null)
  const groups = grouping.data?.groups || {}, groupReady = grouping.status === 'ready' && !grouping.data?.error && !grouping.migrating
  useEffect(() => {
    if (grouping.status !== 'ready') return
    if (groupFilter.startsWith('name:') && !Object.hasOwn(groups, groupFilter.slice(5))) setGroupFilter('all')
    if (assignTo.startsWith('name:') && !Object.hasOwn(groups, assignTo.slice(5))) setAssignTo('')
  }, [grouping.data, groupFilter, assignTo])
  const store = useSharedStateStore({ key: getInstanceModStateKey(path), Type: ResourceState, load: client => client.service(InstanceModsServiceKey).watch(path) })
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [removing, setRemoving] = useState<ReviewedMod[] | null>(null)
  const [detailsPath, setDetailsPath] = useState('')
  const [diagnostics, setDiagnostics] = useState<ModFilesSnapshot | null>(null), diagnosticsButton = useRef<HTMLButtonElement>(null)
  const detailsTrigger = useRef<HTMLButtonElement | null>(null)
  const removeButton = useRef<HTMLButtonElement>(null)
  const active = useRef(true), pending = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const files = (snapshot.data?.files || []).map(file => { const identity = modIdentity(file, runtime); return { ...file, name: identity.name, resourceVersion: identity.version } })
  const memberships = useMemo(() => contentGroupMemberships(groups), [grouping.data?.groups])
  const fileGroups = (file: typeof files[number]) => memberships.get(normalizeModFileName(file.fileName)) || []
  const matches = files.filter(file => `${file.name} ${file.fileName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (filter === 'all' || file.fileName.endsWith('.disabled') === (filter === 'disabled')) && (!groupReady || groupFilter === 'all' || (groupFilter === 'none' ? !fileGroups(file).length : fileGroups(file).includes(groupFilter.slice(5)))))
  const selection = files.filter(file => selected.includes(file.path))
  const detailsFile = files.find(file => file.path === detailsPath)
  useEffect(() => { if (snapshot.status === 'ready' && detailsPath && !detailsFile) closeDetails() }, [snapshot, detailsPath])
  function closeDetails() { setDetailsPath(''); (detailsTrigger.current?.isConnected && !detailsTrigger.current.disabled ? detailsTrigger.current : searchInput.current)?.focus() }
  async function run(action: () => Promise<unknown>, mutating = false) {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setNotice('')
    try {
      if (mutating && (await processes.getGameProcesses()).some(process => process.options.gameDirectory === path)) throw new Error('running')
      if (!active.current) return
      const result = await action()
      if (active.current && mutating && result !== false) { setSelected([]); setNotice(t('react.content.applied')) }
    } catch (failure) {
      if (active.current) setError(t(failure instanceof Error && (failure.message === 'running' || failure.name === 'InstanceRunningError') ? 'react.content.running' : failure instanceof Error && failure.name === 'ModFilesChangedError' ? 'react.content.changed' : 'react.content.failed'))
    } finally { pending.current = false; if (active.current) setBusy(false) }
  }
  function toggle(targets: typeof files, enabled: boolean) {
    const changes = targets.filter(file => file.fileName.endsWith('.disabled') === enabled).map(file => file.path)
    if (changes.length) void run(async () => {
      const review = await service.getModFilesSnapshot(path)
      if (!active.current) return false
      const options = { path, files: changes, expectedSnapshot: review.fingerprint, expectedHashes: Object.fromEntries(targets.filter(file => changes.includes(file.path)).map(file => [file.path, file.hash])) }
      if (enabled) await service.enable(options)
      else await service.disable(options)
      if (active.current) {
        await refreshFiles()
      }
    }, true)
  }
  async function refreshFiles() {
    if (!active.current) return
    await store.revalidate()
    if (store.getSnapshot().status === 'error') throw new Error('refresh')
    if (diagnostics) {
      const inventory = await service.getModFilesSnapshot(path)
      if (active.current) setDiagnostics(inventory)
    }
  }
  function closeRemoval() { setRemoving(null) }
  return <section aria-labelledby="instance-mods-title" data-testid="instance-mods" data-instance-path={path} aria-busy={busy || snapshot.status === 'loading'}>
    <div className="section-heading"><h2 id="instance-mods-title">{t('react.workspace.mods')}</h2><div className="content-actions">
      <button className="button primary" disabled={busy || running || !window.windowController?.showOpenDialog} onClick={() => void run(async () => {
        const chosen = await window.windowController!.showOpenDialog!({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Minecraft mods', extensions: ['jar', 'zip', 'litemod'] }] })
        if (!chosen.canceled && chosen.filePaths.length && active.current) {
          await service.install({ path, files: chosen.filePaths })
          await refreshFiles()
        } else return false
      }, true)}><Plus size={16} aria-hidden="true" />{t('react.content.add')}</button>
      <button className="button secondary" disabled={busy} onClick={() => void run(() => service.showDirectory(path))}><FolderOpen size={16} aria-hidden="true" />{t('react.content.folder')}</button>
      <button ref={manageGroups} className="button secondary" disabled={busy || !groupReady} aria-expanded={editingGroups} onClick={() => { setDetailsPath(''); setDiagnostics(null); setEditingGroups(true) }}>{t('react.contentGroups.manage')}</button>
      <button ref={diagnosticsButton} className="button secondary" disabled={busy || snapshot.status !== 'ready'} aria-expanded={!!diagnostics} onClick={() => {
        if (diagnostics) { setDiagnostics(null); return }
        void run(async () => { const inventory = await service.getModFilesSnapshot(path); await refreshFiles(); if (active.current) { setDetailsPath(''); setEditingGroups(false); setDiagnostics(inventory) } })
      }}><ShieldCheck size={16} aria-hidden="true" />{t('react.modDiagnostics.open')}</button>
      <button className="button secondary" disabled={busy} onClick={() => void run(async () => { await refreshFiles(); await grouping.refresh() })}><RefreshCw size={16} aria-hidden="true" />{t('react.content.refresh')}</button>
    </div></div>
    {grouping.migrating && <p role="status">{t('react.contentGroups.migrating')}</p>}
    {grouping.migrationError && <p role="alert" className="form-error">{t('react.contentGroups.migrationFailed')} <button className="button secondary" disabled={busy || grouping.migrating} onClick={() => void grouping.migrate()}>{t('react.contentGroups.retryMigration')}</button></p>}
    {(grouping.status === 'error' || grouping.data?.error) && <p role="alert" className="form-error">{t(grouping.data?.error === 'write' ? 'react.contentGroups.failed' : grouping.data?.error === 'changed' ? 'react.contentGroups.changed' : 'react.contentGroups.readFailed')}</p>}
    {editingGroups && <ContentGroupsEditor grouping={grouping} close={() => { setEditingGroups(false); (manageGroups.current?.disabled ? searchInput.current : manageGroups.current)?.focus() }} />}
    {detailsFile && <ModDetails key={detailsFile.path} file={detailsFile} runtime={runtime} close={closeDetails} />}
    {diagnostics && <ModDiagnostics inventory={diagnostics} files={snapshot.data?.files || []} errors={snapshot.data?.errors || []} runtime={runtime} configuredJava={configuredJava} close={() => { setDiagnostics(null); (diagnosticsButton.current?.disabled ? searchInput.current : diagnosticsButton.current)?.focus() }} inspect={file => { detailsTrigger.current = diagnosticsButton.current; setDiagnostics(null); setDetailsPath(file) }} />}
    <div className="content-filters">
      <label className="search"><Search size={16} aria-hidden="true" /><input ref={searchInput} aria-label={t('react.content.search')} placeholder={t('react.content.search')} value={query} onChange={event => setQuery(event.target.value)} /></label>
      <select aria-label={t('react.content.filter')} value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{t('react.content.all')}</option><option value="enabled">{t('react.content.enabled')}</option><option value="disabled">{t('react.content.disabled')}</option></select>
      <select aria-label={t('react.contentGroups.filter')} value={groupFilter} disabled={!groupReady} onChange={event => setGroupFilter(event.target.value)}><option value="all">{t('react.contentGroups.all')}</option><option value="none">{t('react.contentGroups.none')}</option>{Object.keys(groups).map(name => <option key={name} value={`name:${name}`}>{name}</option>)}</select>
    </div>
    {snapshot.status === 'loading' && <p role="status">{t('react.content.loading')}</p>}
    {snapshot.status === 'error' && <p role="alert" className="form-error">{t('react.content.loadFailed')}</p>}
    {running && <p role="status">{t('react.content.running')}</p>}
    {error && !removing && <p role="alert" className="form-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!!snapshot.data?.errors.length && <div role="alert" className="form-error"><p>{t('react.content.parseFailed')}</p><ul>{snapshot.data.errors.map(file => <li key={file.path}>{file.path.split(/[\\/]/).pop()} · {file.code}</li>)}</ul></div>}
    {!!selection.length && <div className="content-selection" role="group" aria-label={t('react.content.selection')}><span>{t('react.content.selected', { count: selection.length })}</span>
      <button className="button secondary" disabled={busy || running || snapshot.status !== 'ready' || !selection.some(file => file.fileName.endsWith('.disabled'))} onClick={() => toggle(selection, true)}>{t('react.content.enable')}</button>
      <button className="button secondary" disabled={busy || running || snapshot.status !== 'ready' || !selection.some(file => !file.fileName.endsWith('.disabled'))} onClick={() => toggle(selection, false)}>{t('react.content.disable')}</button>
      <button ref={removeButton} className="button secondary" disabled={busy || running || snapshot.status !== 'ready'} onClick={() => { setError(''); setRemoving(selection.map(file => ({ path: file.path, fileName: file.fileName, hash: file.hash }))) }}>{t('react.content.remove')}</button>
      <select aria-label={t('react.contentGroups.assignment')} disabled={busy || !groupReady} value={assignTo} onChange={event => setAssignTo(event.target.value)}><option value="">{t('react.contentGroups.none')}</option>{Object.keys(groups).map(name => <option key={name} value={`name:${name}`}>{name}</option>)}</select>
      <button className="button secondary" disabled={busy || !groupReady} onClick={() => void run(async () => {
        const previous = structuredClone(groups)
        await grouping.save(assignContentGroup(previous, selection.map(file => file.fileName), assignTo ? assignTo.slice(5) : undefined), previous)
        if (active.current) { setSelected([]); setNotice(t('react.contentGroups.applied')) }
      })}>{t('react.contentGroups.assign')}</button>
      <button className="button secondary" disabled={busy} onClick={() => setSelected([])}>{t('react.content.clear')}</button>
    </div>}
    {snapshot.status === 'ready' && !files.length && <p className="empty">{t('react.content.empty')}</p>}
    {snapshot.status === 'ready' && !!files.length && !matches.length && <p className="empty">{t('react.content.noMatches')}</p>}
    <ul className="content-list" aria-label={t('react.workspace.mods')}>{matches.map(file => {
      const disabled = file.fileName.endsWith('.disabled')
      return <li key={file.path} data-file-name={file.fileName}>
        <input type="checkbox" aria-label={t('react.content.select', { name: file.name || file.fileName })} checked={selected.includes(file.path)} disabled={busy} onChange={event => setSelected(value => event.target.checked ? [...value, file.path] : value.filter(path => path !== file.path))} />
        <div className="content-file"><button className="content-file-name" aria-label={t('react.modInfo.open', { name: file.name || file.fileName })} aria-expanded={detailsPath === file.path} onClick={event => { detailsTrigger.current = event.currentTarget; if (detailsPath === file.path) closeDetails(); else { setEditingGroups(false); setDiagnostics(null); setDetailsPath(file.path) } }}>{file.name || file.fileName}</button><span>{file.fileName}{file.resourceVersion && ` · ${file.resourceVersion}`}</span><small>{file.metadata.modrinth ? 'Modrinth' : file.metadata.curseforge ? 'CurseForge' : t('react.content.local')}</small>{!!fileGroups(file).length && <div className="content-group-labels">{fileGroups(file).map(name => <span className="content-group-label" key={name}><span className="content-group-dot" aria-hidden="true" style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(groups[name].color) ? groups[name].color : 'var(--accent)' }} />{name}</span>)}</div>}</div>
        <span className="content-state">{t(disabled ? 'react.content.disabled' : 'react.content.enabled')}</span>
        <button className="button secondary" aria-label={t(disabled ? 'react.content.enableName' : 'react.content.disableName', { name: file.name || file.fileName })} disabled={busy || running || snapshot.status !== 'ready'} onClick={() => toggle([file], disabled)}>{t(disabled ? 'react.content.enable' : 'react.content.disable')}</button>
      </li>
    })}</ul>
    {removing && <RemoveModsDialog files={removing} busy={busy} error={error} close={closeRemoval} returnFocus={() => { (removeButton.current || searchInput.current)?.focus() }} remove={() => void run(async () => {
      await service.uninstall({ path, files: removing.map(file => file.path), expectedHashes: Object.fromEntries(removing.map(file => [file.path, file.hash])) })
      await refreshFiles()
      if (active.current) setRemoving(null)
    }, true)} />}
  </section>
}
