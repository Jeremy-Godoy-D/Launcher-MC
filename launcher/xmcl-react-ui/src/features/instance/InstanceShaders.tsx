import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { FolderOpen, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { InstanceShaderPacksServiceKey, type ShaderPackSelection, type ShaderRemovalReview } from '@xmcl/runtime-api/src/services/InstanceShaderPacksService'
import { InstanceModsServiceKey } from '@xmcl/runtime-api/src/services/InstanceModsService'
import { BaseServiceKey } from '@xmcl/runtime-api/src/services/BaseService'
import { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import { useService, useSharedStateStore } from '../../runtime'
import { useI18n } from '../../i18n'
import type { SavedInstance } from '../library/model'
import { usePanelFocus } from './usePanelFocus'
import { RemoveShadersDialog } from './RemoveShadersDialog'
import { ShaderDetails } from './ShaderDetails'
import { useContentGroups } from './useContentGroups'
import { ContentGroupsEditor } from './ContentGroupsEditor'
import { assignContentGroup, contentGroupMemberships } from './contentGroups'
import type { ResourcePackSharingReview } from '@xmcl/runtime-api/src/services/InstanceResourcePacksService'
import { SharePacksDialog } from './SharePacksDialog'

export function InstanceShaders({ path, running, runtime }: { path: string; running: boolean; runtime: SavedInstance['runtime'] }) {
  const { t, n } = useI18n(), service = useService(InstanceShaderPacksServiceKey), base = useService(BaseServiceKey)
  const grouping = useContentGroups(path, 'shaderpacks'), groups = grouping.data?.groups || {}, groupReady = grouping.status === 'ready' && !grouping.data?.error
  const [editingGroups, setEditingGroups] = useState(false), [groupFilter, setGroupFilter] = useState('all'), [assignTo, setAssignTo] = useState(''), [detailsPath, setDetailsPath] = useState('')
  const manageGroups = useRef<HTMLButtonElement>(null), detailsTrigger = useRef<HTMLButtonElement | null>(null)
  const shaders = useSharedStateStore({ key: `instance-shaderpacks://${path}`, Type: ResourceState, load: client => client.service(InstanceShaderPacksServiceKey).watch(path) })
  const mods = useSharedStateStore({ key: `instance-mods://${path}`, Type: ResourceState, load: client => client.service(InstanceModsServiceKey).watch(path) })
  const snapshot = useSyncExternalStore(shaders.subscribe, shaders.getSnapshot, shaders.getSnapshot), modSnapshot = useSyncExternalStore(mods.subscribe, mods.getSnapshot, mods.getSnapshot)
  const [selection, setSelection] = useState<ShaderPackSelection | null>(null), [query, setQuery] = useState(''), [working, setWorking] = useState(false), [reading, setReading] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<string[]>([]), [removal, setRemoval] = useState<ShaderRemovalReview | null>(null), [backup, setBackup] = useState('')
  const [sharing, setSharing] = useState<ResourcePackSharingReview | null>(null), shareButton = useRef<HTMLButtonElement>(null)
  const alive = useRef(true), request = useRef(0), operation = useRef(false), panel = useRef<HTMLElement>(null), focusAfter = useRef<HTMLButtonElement | HTMLInputElement | null>(null)
  const search = useRef<HTMLInputElement>(null), removeButton = useRef<HTMLButtonElement>(null)
  usePanelFocus(panel)
  const blocked = working || editingGroups
  const fileBusy = blocked || snapshot.status !== 'ready'
  const busy = working || snapshot.status !== 'ready' || reading || modSnapshot.status !== 'ready'
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++ } }, [])
  useEffect(() => {
    if (busy || editingGroups) return
    const target = focusAfter.current; focusAfter.current = null
    if (target?.isConnected) (target.disabled ? search.current : target)?.focus()
  }, [busy, editingGroups])
  async function read() {
    const revision = ++request.current; setReading(true)
    try { const value = await service.getSelection(path); if (alive.current && revision === request.current) setSelection(value) }
    catch { if (alive.current && revision === request.current) { setSelection(null); setError(t('react.shaders.loadFailed')) } }
    finally { if (alive.current && revision === request.current) setReading(false) }
  }
  useEffect(() => { if (snapshot.status === 'ready' && modSnapshot.status === 'ready') void read() }, [snapshot.data, snapshot.status, modSnapshot.data, modSnapshot.status, runtime])
  async function refresh() {
    if (operation.current || editingGroups) return
    operation.current = true; setWorking(true); setError(''); setNotice('')
    try { await Promise.all([shaders.revalidate(), mods.revalidate(), grouping.refresh()]); await read() }
    catch { if (alive.current) setError(t('react.shaders.loadFailed')) }
    finally { operation.current = false; if (alive.current) setWorking(false) }
  }
  async function add(folder: boolean, button: HTMLButtonElement) {
    if (operation.current || fileBusy || running) return
    operation.current = true; focusAfter.current = button; setWorking(true); setError(''); setNotice('')
    try {
      const result = await window.windowController!.showOpenDialog!(folder ? { properties: ['openDirectory'] } : { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Minecraft shaders', extensions: ['zip'] }] })
      if (result.canceled || !result.filePaths.length || !alive.current) return
      await service.install({ path, files: result.filePaths })
      if (!alive.current) return
      await shaders.revalidate(); await read()
      if (alive.current) setNotice(t('react.shaders.added'))
    } catch (error) {
      const name = error && typeof error === 'object' && 'name' in error ? error.name : ''
      if (alive.current) setError(t(name === 'ResourcePackCollisionError' ? 'react.shaders.collision' : name === 'InstanceRunningError' ? 'react.content.running' : name === 'SharedOptionsRunningError' ? 'react.shaders.sharedRunning' : 'react.shaders.addFailed'))
    } finally { operation.current = false; if (alive.current) setWorking(false) }
  }
  async function select(pack: string, enabled: boolean, button: HTMLButtonElement) {
    if (operation.current || !selection?.engine || busy || running || editingGroups) return
    operation.current = true; focusAfter.current = button; setWorking(true); setError(''); setNotice('')
    try {
      const value = await service.setSelection(path, { snapshot: selection.snapshot, engine: selection.engine, pack, enabled })
      if (alive.current) { setSelection(value); setNotice(t('react.shaders.saved')) }
    } catch (error) {
      if (alive.current) {
        const name = error && typeof error === 'object' && 'name' in error ? error.name : ''
        setError(t(name === 'ShaderSelectionChangedError' ? 'react.shaders.changed' : name === 'InstanceRunningError' ? 'react.content.running' : name === 'ShaderEngineUnavailableError' ? 'react.shaders.noEngine' : 'react.shaders.saveFailed'))
        await read()
      }
    } finally { operation.current = false; if (alive.current) setWorking(false) }
  }
  function removalFailure(error: unknown) {
    const name = error && typeof error === 'object' && 'name' in error ? error.name : ''
    return t(name === 'ShaderRemovalChangedError' ? 'react.shaders.removeChanged' : name === 'ShaderRemovalIncompleteError' ? 'react.shaders.removeIncomplete' : name === 'ShaderConfigurationSharedError' ? 'react.shaders.sharedConfiguration' : name === 'InstanceRunningError' ? 'react.content.running' : name === 'SharedOptionsRunningError' ? 'react.shaders.sharedRunning' : 'react.shaders.removeFailed')
  }
  async function reviewRemoval() {
    if (operation.current || fileBusy || running || !selected.length) return
    operation.current = true; setWorking(true); setError(''); setNotice(''); setBackup('')
    try { const value = await service.previewRemoval(path, selected); if (alive.current) setRemoval(value) }
    catch (error) { if (alive.current) { setError(removalFailure(error)); focusAfter.current = removeButton.current } }
    finally { operation.current = false; if (alive.current) setWorking(false) }
  }
  async function removeFiles() {
    if (operation.current || !removal || running) return
    operation.current = true; setWorking(true); setError(''); setNotice('')
    try {
      const result = await service.removeReviewed(path, removal)
      if (!alive.current) return
      setBackup(result.backup); setRemoval(null); setSelected([]); focusAfter.current = search.current
      await shaders.revalidate(); await read()
      if (alive.current) setNotice(t('react.shaders.removed'))
    } catch (error) {
      if (alive.current) {
        setError(removalFailure(error))
        if (error && typeof error === 'object' && 'name' in error && error.name === 'ShaderRemovalIncompleteError') setBackup('backup' in error && typeof error.backup === 'string' ? error.backup : path + '/.backups')
      }
    } finally { operation.current = false; if (alive.current) setWorking(false) }
  }
  async function openBackup() {
    try { if (!await base.openDirectory(backup)) throw new Error('Missing backup') }
    catch { if (alive.current) setError(t('react.workspace.folderFailed')) }
  }
  function sharingFailure(error: unknown) {
    const name = error && typeof error === 'object' && 'name' in error ? error.name : ''
    return t(name === 'ResourcePacksChangedError' ? 'react.shaders.removeChanged' : name === 'ResourcePackSharingIncompleteError' ? 'react.shaderSharing.incomplete' : name === 'InstanceRunningError' ? 'react.content.running' : name === 'SharedOptionsRunningError' ? 'react.shaders.sharedRunning' : 'react.shaderSharing.failed')
  }
  async function reviewSharing() {
    if (operation.current || fileBusy || running || !selection) return
    operation.current = true; setWorking(true); setError(''); setNotice(''); setBackup('')
    try { const review = await service.previewSharing(path, !selection.shared); if (alive.current) setSharing(review) }
    catch (error) { if (alive.current) { setError(sharingFailure(error)); focusAfter.current = shareButton.current } }
    finally { operation.current = false; if (alive.current) setWorking(false) }
  }
  async function applySharing() {
    if (operation.current || !sharing || running) return
    operation.current = true; setWorking(true); setError(''); setNotice('')
    try {
      const result = await service.applySharing(path, sharing)
      if (!alive.current) return
      if (result.backup) setBackup(result.backup)
      setSharing(null); setSelected([]); setDetailsPath('')
      await shaders.revalidate(); await read()
      if (alive.current) setNotice(t(sharing.shared ? 'react.shaderSharing.linked' : 'react.shaderSharing.unlinked'))
    } catch (error) {
      if (alive.current) {
        setError(sharingFailure(error))
        if (error && typeof error === 'object' && 'name' in error && error.name === 'ResourcePackSharingIncompleteError') setBackup('backup' in error && typeof error.backup === 'string' ? error.backup : path + '/.backups')
      }
    } finally { operation.current = false; if (alive.current) setWorking(false) }
  }
  function returnSharingFocus() {
    const target = shareButton.current
    if (target && !target.disabled) { focusAfter.current = null; target.focus() }
    else { focusAfter.current = target; search.current?.focus() }
  }
  async function assignGroups() {
    if (operation.current || !groupReady || !selected.length || editingGroups) return
    operation.current = true; setWorking(true); setError(''); setNotice('')
    try {
      const previous = structuredClone(groups)
      await grouping.save(assignContentGroup(previous, selected, assignTo ? assignTo.slice(5) : undefined), previous); await grouping.refresh()
      if (alive.current) { setSelected([]); setNotice(t('react.contentGroups.applied')); focusAfter.current = search.current }
    } catch { if (alive.current) setError(t('react.contentGroups.failed')) }
    finally { operation.current = false; if (alive.current) setWorking(false) }
  }
  const memberships = contentGroupMemberships(groups), fileGroups = (name: string) => memberships.get(name.replace(/\.disabled$/, '')) || []
  const matches = (name: string) => name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (!groupReady || groupFilter === 'all' || (groupFilter === 'none' ? !fileGroups(name).length : fileGroups(name).includes(groupFilter.slice(5))))
  const files = (snapshot.data?.files || []).filter(file => matches(file.fileName)), detailsFile = snapshot.data?.files.find(file => file.path === detailsPath)
  function closeDetails() { setDetailsPath(''); (detailsTrigger.current?.isConnected && !detailsTrigger.current.disabled ? detailsTrigger.current : search.current)?.focus() }
  useEffect(() => { if (snapshot.status === 'ready' && detailsPath && !detailsFile) closeDetails() }, [snapshot.data, snapshot.status, detailsPath])
  useEffect(() => {
    if (!groupReady) return
    if (groupFilter.startsWith('name:') && !Object.hasOwn(groups, groupFilter.slice(5))) setGroupFilter('all')
    if (assignTo.startsWith('name:') && !Object.hasOwn(groups, assignTo.slice(5))) setAssignTo('')
  }, [grouping.data, groupFilter, assignTo, groupReady])
  const broken = (snapshot.data?.errors || []).map(error => error.path.replace(/\\/g, '/').split('/').pop()!).filter(name => name && !snapshot.data?.files.some(file => file.fileName === name))
  useEffect(() => {
    if (snapshot.status === 'ready') { const names = new Set([...(snapshot.data?.files.map(file => file.fileName) || []), ...broken]); setSelected(current => current.filter(name => names.has(name))) }
  }, [snapshot.data, snapshot.status])
  function choose(name: string, checked: boolean) { setSelected(current => checked ? [...new Set([...current, name])] : current.filter(file => file !== name)) }
  const activePresent = snapshot.data?.files.some(file => file.fileName === selection?.pack)
  return <section ref={panel} data-testid="instance-shaders" aria-labelledby="shaders-title" aria-busy={busy}>
    <div className="section-heading"><h2 id="shaders-title">{t('react.workspace.shaders')}</h2><div className="content-actions">
      <button className="button primary" disabled={fileBusy || running || !window.windowController?.showOpenDialog} onClick={event => void add(false, event.currentTarget)}><Plus size={17} aria-hidden="true" />{t('react.content.add')}</button>
      <button className="button secondary" disabled={fileBusy || running || !window.windowController?.showOpenDialog} onClick={event => void add(true, event.currentTarget)}>{t('react.packs.addFolder')}</button>
      <button className="button secondary" disabled={blocked} onClick={() => void service.showDirectory(path).catch(() => { if (alive.current) setError(t('react.workspace.folderFailed')) })}><FolderOpen size={17} aria-hidden="true" />{t('react.shaders.folder')}</button>
      <button ref={shareButton} className="button secondary" disabled={fileBusy || running || !selection} onClick={() => void reviewSharing()}>{t(selection?.shared ? 'react.shaderSharing.unlink' : 'react.shaderSharing.link')}</button>
      <button ref={manageGroups} className="button secondary" disabled={blocked || !groupReady} aria-expanded={editingGroups} onClick={() => { setDetailsPath(''); setEditingGroups(true) }}>{t('react.contentGroups.manage')}</button>
      <button className="button secondary" disabled={blocked} onClick={() => void refresh()}><RefreshCw size={17} aria-hidden="true" />{t('react.content.refresh')}</button>
    </div></div>
    <p className="packs-help">{t('react.shaders.help')}</p>
    {selection?.engine && <p className="packs-help"><strong>{t('react.shaders.engine', { name: selection.engine === 'optifine' ? 'OptiFine' : selection.engine === 'iris' ? 'Iris' : 'Oculus' })}</strong></p>}
    {selection?.shared && <p className="packs-help" role="status">{t('react.shaders.shared')}</p>}
    {selection && (!selection.engine || selection.metadataPending) && <p className="packs-help" role="status">{t(selection.metadataPending ? 'react.shaders.metadataPending' : selection.engines.length > 1 ? 'react.shaders.ambiguous' : 'react.shaders.noEngine')} <Link to="/instance/mods">{t('react.shaders.manageMods')}</Link></p>}
    {running && <p role="status">{t('react.content.running')}</p>}
    {(grouping.status === 'error' || grouping.data?.error) && <p role="alert" className="form-error">{t(grouping.data?.error === 'write' ? 'react.contentGroups.failed' : grouping.data?.error === 'changed' ? 'react.contentGroups.changed' : 'react.contentGroups.readFailed')}</p>}
    {editingGroups && <ContentGroupsEditor grouping={grouping} close={() => { focusAfter.current = manageGroups.current; setEditingGroups(false) }} />}
    {detailsFile && <ShaderDetails key={detailsFile.path} file={detailsFile} close={closeDetails} />}
    <div className="content-filters"><label className="search"><Search size={18} aria-hidden="true" /><input ref={search} aria-label={t('react.shaders.search')} placeholder={t('react.shaders.search')} value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label={t('react.shaders.groupFilter')} value={groupFilter} disabled={!groupReady || blocked} onChange={event => setGroupFilter(event.target.value)}><option value="all">{t('react.contentGroups.all')}</option><option value="none">{t('react.contentGroups.none')}</option>{Object.keys(groups).map(name => <option key={name} value={`name:${name}`}>{name}</option>)}</select></div>
    {busy && <p role="status">{t('react.shaders.loading')}</p>}
    {(error || snapshot.status === 'error' || modSnapshot.status === 'error') && <p role="alert" className="form-error">{error || t('react.shaders.loadFailed')}</p>}
    {!!snapshot.data?.errors.length && <p role="alert" className="form-error">{t('react.content.parseFailed')} {snapshot.data.errors.map(error => error.path).join(', ')}</p>}
    {!!broken.length && <ul className="pack-list" aria-label={t('react.shaders.unreadFiles')}>{broken.filter(matches).map(name => <li key={name}><input type="checkbox" checked={selected.includes(name)} disabled={fileBusy || running} aria-label={t('react.content.select', { name })} onChange={event => choose(name, event.target.checked)} /><div className="content-file"><strong>{name}</strong><small>{t('react.shaders.unreadFiles')}</small></div></li>)}</ul>}
    {notice && <p role="status">{notice}</p>}
    {selection?.pack && !activePresent && <p role="status" className="packs-help">{t('react.shaders.missing', { name: selection.pack })}</p>}
    {selection?.engine && selection.enabled && <button className="button secondary" disabled={busy || running || editingGroups} onClick={event => void select(selection.pack, false, event.currentTarget)}>{t('react.shaders.disableAll')}</button>}
    {!!selected.length && <div className="content-selection" role="group" aria-label={t('react.shaders.selection')}><span>{t('react.content.selected', { count: selected.length })}</span><button className="button secondary" disabled={blocked} onClick={() => setSelected([])}>{t('react.content.clear')}</button><button ref={removeButton} className="button secondary" disabled={fileBusy || running} onClick={() => void reviewRemoval()}><Trash2 size={17} aria-hidden="true" />{t('react.packs.remove')}</button><select aria-label={t('react.shaders.groupAssignment')} value={assignTo} disabled={blocked || !groupReady} onChange={event => setAssignTo(event.target.value)}><option value="">{t('react.contentGroups.none')}</option>{Object.keys(groups).map(name => <option key={name} value={`name:${name}`}>{name}</option>)}</select><button className="button secondary" disabled={blocked || !groupReady} onClick={() => void assignGroups()}>{t('react.contentGroups.assign')}</button></div>}
    {backup && !removal && !sharing && <p className="instance-path">{t('react.packs.backup')}: {backup} <button className="button secondary" disabled={working} onClick={() => void openBackup()}>{t('react.packs.openBackup')}</button></p>}
    {snapshot.status === 'ready' && !files.length && !broken.some(matches) && <p>{t(query || groupFilter !== 'all' ? 'react.shaders.noMatches' : 'react.shaders.empty')}</p>}
    <ul className="pack-list">{files.map(file => {
      const enabled = selection?.pack === file.fileName && selection.enabled
      return <li key={file.path}><input type="checkbox" checked={selected.includes(file.fileName)} disabled={fileBusy || running} aria-label={t('react.content.select', { name: file.fileName })} onChange={event => choose(file.fileName, event.target.checked)} /><div className="content-file"><button className="content-file-name" disabled={blocked} aria-label={t('react.modInfo.open', { name: file.fileName })} aria-expanded={detailsPath === file.path} onClick={event => { detailsTrigger.current = event.currentTarget; if (detailsPath === file.path) closeDetails(); else setDetailsPath(file.path) }}>{file.fileName}</button>{!!fileGroups(file.fileName).length && <div className="content-group-labels">{fileGroups(file.fileName).map(name => <span className="content-group-label" key={name}><span className="content-group-dot" aria-hidden="true" style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(groups[name].color) ? groups[name].color : 'var(--accent)' }} />{name}</span>)}</div>}<small>{file.isDirectory ? t('react.shaders.unpacked') : `${n(file.size / 1024, { maximumFractionDigits: 1 })} KiB`} · {file.metadata.modrinth ? 'Modrinth' : file.metadata.curseforge ? 'CurseForge' : t('react.shaders.local')}</small><span>{t(enabled ? 'react.shaders.active' : 'react.shaders.available')}</span></div>
        <button className="button secondary" disabled={busy || running || !selection?.engine || editingGroups} aria-pressed={!!enabled} aria-label={t(enabled ? 'react.shaders.disableName' : 'react.shaders.enableName', { name: file.fileName })} onClick={event => void select(file.fileName, !enabled, event.currentTarget)}>{t(enabled ? 'react.shaders.disable' : 'react.shaders.enable')}</button></li>
    })}</ul>
    {removal && <RemoveShadersDialog review={removal} busy={working} error={error} backup={backup} openBackup={() => void openBackup()} close={() => { setRemoval(null); setError('') }} returnFocus={() => (removeButton.current?.isConnected && !removeButton.current.disabled ? removeButton.current : search.current)?.focus()} remove={() => void removeFiles()} />}
    {sharing && <SharePacksDialog shaders review={sharing} busy={working} error={error} close={() => { setSharing(null); setError('') }} returnFocus={returnSharingFocus} apply={() => void applySharing()} />}
  </section>
}
