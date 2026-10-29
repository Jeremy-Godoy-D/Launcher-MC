import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowDown, ArrowUp, FolderOpen, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import { InstanceResourcePacksServiceKey, type ResourcePackRemovalReview } from '@xmcl/runtime-api/src/services/InstanceResourcePacksService'
import { BaseServiceKey } from '@xmcl/runtime-api/src/services/BaseService'
import { InstanceOptionsServiceKey, type ResourcePackSelection } from '@xmcl/runtime-api/src/services/InstanceOptionsService'
import packFormatVersionRange from '@xmcl/runtime-api/src/util/packFormatVersionRange'
import { useService, useSharedStateStore } from '../../runtime'
import { useI18n } from '../../i18n'
import { usePanelFocus } from './usePanelFocus'
import { RemovePacksDialog } from './RemovePacksDialog'

export function InstanceResourcePacks({ path, running }: { path: string; running: boolean }) {
  const { t } = useI18n(), service = useService(InstanceResourcePacksServiceKey), options = useService(InstanceOptionsServiceKey)
  const base = useService(BaseServiceKey)
  const store = useSharedStateStore({ key: `instance-resourcepacks://${path}`, Type: ResourceState, load: client => client.service(InstanceResourcePacksServiceKey).watch(path) })
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [selection, setSelection] = useState<ResourcePackSelection | null>(null), [busy, setBusy] = useState(false)
  const [query, setQuery] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<string[]>([]), [removal, setRemoval] = useState<ResourcePackRemovalReview | null>(null)
  const [sharedDirectory, setSharedDirectory] = useState(false), [backup, setBackup] = useState('')
  const removeButton = useRef<HTMLButtonElement>(null), search = useRef<HTMLInputElement>(null)
  const alive = useRef(true), pending = useRef(false)
  const priorityFocus = useRef<HTMLButtonElement | null>(null)
  const panel = useRef<HTMLElement>(null)
  usePanelFocus(panel)
  useEffect(() => {
    if (busy) return
    const target = priorityFocus.current
    priorityFocus.current = null
    if (target?.isConnected && (document.activeElement === document.body || document.activeElement === target)) {
      const next = target.disabled ? target.parentElement?.querySelector<HTMLButtonElement>('button:not(:disabled)') : target
      next?.focus()
    }
  }, [busy])
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false } }, [])
  async function read() {
    const [current, linked] = await Promise.all([options.getResourcePackSelection(path), service.isLinked(path)])
    if (alive.current) { setSelection(current); setSharedDirectory(linked) }
    await store.revalidate()
    if (store.getSnapshot().status === 'error') throw new Error('Resource pack refresh failed')
    if (alive.current) {
      const data = store.getSnapshot().data, names = new Set([...(data?.files || []).map(file => file.fileName), ...(data?.errors || []).map(error => error.path.replace(/\\/g, '/').split('/').pop()!)])
      setSelected(current => current.filter(name => names.has(name)))
    }
  }
  async function load() {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setNotice('')
    try {
      await read()
    } catch { if (alive.current) { setSelection(null); setError(t('react.packs.loadFailed')) } }
    finally { pending.current = false; if (alive.current) setBusy(false) }
  }
  function failure(error: unknown) {
    const name = error && typeof error === 'object' && 'name' in error ? error.name : ''
    return t(name === 'InstanceRunningError' ? 'react.packs.running' : name === 'SharedOptionsRunningError' ? 'react.packs.sharedRunning' : name === 'ResourcePackCollisionError' ? 'react.packs.collision' : name === 'ResourcePacksChangedError' || name === 'ResourcePackSelectionChangedError' ? 'react.packs.filesChanged' : name === 'ResourcePackRemovalIncompleteError' ? 'react.packs.incomplete' : 'react.packs.filesFailed')
  }
  async function run(action: () => Promise<void>) {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setNotice('')
    try { await action() }
    catch (error) {
      if (alive.current) {
        setError(failure(error))
        if (error && typeof error === 'object' && 'name' in error && error.name === 'ResourcePackRemovalIncompleteError') setBackup(path + '/.backups')
      }
    } finally { pending.current = false; if (alive.current) setBusy(false) }
  }
  async function add(folder: boolean) {
    const result = await window.windowController!.showOpenDialog!(folder ? { properties: ['openDirectory'] } : { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Minecraft resource packs', extensions: ['zip'] }] })
    if (result.canceled || !result.filePaths.length || !alive.current) return
    await service.install({ path, files: result.filePaths })
    if (!alive.current) return
    await read(); if (alive.current) setNotice(t('react.packs.added'))
  }
  async function save(packs: string[]) {
    if (!selection || pending.current) return
    pending.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const current = await options.editResourcePackSelection(path, { ...selection, packs })
      if (alive.current) { setSelection(current); setNotice(t('react.packs.applied')) }
    } catch (failure) {
      const name = failure && typeof failure === 'object' && 'name' in failure ? failure.name : ''
      if (alive.current) setError(t(name === 'InstanceRunningError' ? 'react.packs.running' : name === 'SharedOptionsRunningError' ? 'react.packs.sharedRunning' : name === 'ResourcePackSelectionChangedError' ? 'react.packs.changed' : 'react.packs.failed'))
    } finally { pending.current = false; if (alive.current) setBusy(false) }
  }
  const files = snapshot.data?.files || [], packs = selection?.packs || []
  const broken = (snapshot.data?.errors || []).map(error => error.path.replace(/\\/g, '/').split('/').pop()!).filter(name => name && !files.some(file => file.fileName === name))
  const occurrences = new Map<string, number>()
  const enabled = [...packs].reverse().map((id, index) => {
    const occurrence = occurrences.get(id) || 0; occurrences.set(id, occurrence + 1)
    const name = id.startsWith('file/') ? id.slice(5) : id
    const file = files.find(file => file.fileName === name)
    return { id, index, key: JSON.stringify([id, occurrence]), file, name: file?.name || (id === 'vanilla' ? 'Minecraft' : name) }
  })
  const disabled = files.filter(file => !packs.includes(file.fileName) && !packs.includes(`file/${file.fileName}`))
  const matches = (name: string, fileName = '') => `${name} ${fileName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  const blocked = busy || running || !selection || snapshot.status !== 'ready'
  const fileBlocked = busy || running || snapshot.status !== 'ready'
  function choose(name: string, checked: boolean) { setSelected(current => checked ? [...new Set([...current, name])] : current.filter(file => file !== name)) }
  function move(index: number, offset: number, trigger: HTMLButtonElement) {
    priorityFocus.current = trigger
    const order = [...enabled].map(entry => entry.id), target = index + offset
    ;[order[index], order[target]] = [order[target], order[index]]
    void save(order.reverse())
  }
  return <section ref={panel} aria-labelledby="instance-packs-title" data-testid="instance-resourcepacks" data-instance-path={path} aria-busy={busy || snapshot.status === 'loading'}>
    <div className="section-heading"><h2 id="instance-packs-title">{t('react.workspace.packs')}</h2><div className="content-actions">
      <button className="button primary" disabled={fileBlocked || !window.windowController?.showOpenDialog} onClick={event => { priorityFocus.current = event.currentTarget; void run(() => add(false)) }}><Plus size={17} aria-hidden="true" />{t('react.content.add')}</button>
      <button className="button secondary" disabled={fileBlocked || !window.windowController?.showOpenDialog} onClick={event => { priorityFocus.current = event.currentTarget; void run(() => add(true)) }}>{t('react.packs.addFolder')}</button>
      <button className="button secondary" disabled={busy} onClick={() => { void service.showDirectory(path).catch(() => { if (alive.current) setError(t('react.workspace.folderFailed')) }) }}><FolderOpen size={17} aria-hidden="true" />{t('react.packs.folder')}</button>
      <button className="button secondary" disabled={busy} onClick={() => void load()}><RefreshCw size={17} aria-hidden="true" />{t('react.content.refresh')}</button>
    </div></div>
    <p className="packs-help">{t('react.packs.help')}</p>
    {sharedDirectory && <p className="packs-help" role="status"><strong>{t('react.packs.sharedDirectory')}</strong></p>}
    {selection?.shared && <p className="packs-help" role="status"><strong>{t('react.packs.shared')}</strong></p>}
    <div className="content-filters"><label className="search"><Search size={18} aria-hidden="true" /><input ref={search} aria-label={t('react.packs.search')} placeholder={t('react.packs.search')} value={query} onChange={event => setQuery(event.target.value)} /></label></div>
    {busy && <p role="status">{t('react.packs.loading')}</p>}
    {(error || snapshot.status === 'error') && <p className="form-error" role="alert">{error || t('react.packs.loadFailed')}</p>}
    {!!snapshot.data?.errors.length && <p className="form-error" role="alert">{t('react.content.parseFailed')} {snapshot.data.errors.map(error => error.path).join(', ')}</p>}
    {!!broken.length && <ul className="pack-list" aria-label={t('react.packs.unreadFiles')}>{broken.map(name => <li key={name}><input type="checkbox" checked={selected.includes(name)} disabled={fileBlocked} aria-label={t('react.packs.selectUnread', { name })} onChange={event => choose(name, event.target.checked)} /><div className="content-file"><strong>{name}</strong><small>{t('react.packs.unreadFiles')}</small></div></li>)}</ul>}
    {notice && <p role="status">{notice}</p>}
    {running && <p role="status">{t('react.packs.running')}</p>}
    {!!selected.length && <div className="content-selection" role="group" aria-label={t('react.packs.selection')}><span>{t('react.content.selected', { count: selected.length })}</span><button className="button secondary" disabled={busy} onClick={() => setSelected([])}>{t('react.content.clear')}</button><button ref={removeButton} className="button secondary" disabled={blocked} onClick={() => void run(async () => { const review = await service.previewRemoval(path, selected); if (alive.current) setRemoval(review) })}><Trash2 size={17} aria-hidden="true" />{t('react.packs.remove')}</button></div>}
    {backup && <p className="instance-path">{t('react.packs.backup')}: {backup} <button className="button secondary" disabled={busy} onClick={() => { void base.openDirectory(backup).then(open => { if (!open) throw new Error('Missing backup') }).catch(() => { if (alive.current) setError(t('react.workspace.folderFailed')) }) }}>{t('react.packs.openBackup')}</button></p>}
    <h3 className="pack-heading">{t('react.packs.enabled')}</h3>
    {!enabled.length && selection && <p>{t('react.packs.noneEnabled')}</p>}
    <ul className="pack-list" aria-label={t('react.packs.enabled')}>{enabled.filter(entry => matches(entry.name, entry.file?.fileName)).map(entry => <li key={entry.key} data-pack-id={entry.id}>
      {entry.file ? <input type="checkbox" aria-label={t('react.content.select', { name: entry.name })} checked={selected.includes(entry.file.fileName)} disabled={fileBlocked} onChange={event => choose(entry.file!.fileName, event.target.checked)} /> : <span aria-hidden="true" />}
      <div className="content-file"><strong>{entry.name}</strong>{(entry.file?.fileName || entry.id) !== entry.name && <span>{entry.file?.fileName || entry.id}</span>}{!entry.file && entry.id !== 'vanilla' && <small>{t('react.packs.external')}</small>}</div>
      <div className="content-actions"><button className="icon-button" disabled={blocked || entry.index === 0} aria-label={t('react.packs.up', { name: entry.name })} onClick={event => move(entry.index, -1, event.currentTarget)}><ArrowUp size={18} aria-hidden="true" /></button><button className="icon-button" disabled={blocked || entry.index === enabled.length - 1} aria-label={t('react.packs.down', { name: entry.name })} onClick={event => move(entry.index, 1, event.currentTarget)}><ArrowDown size={18} aria-hidden="true" /></button><button className="button secondary" disabled={blocked} aria-label={t('react.content.disableName', { name: entry.name })} onClick={() => void save(packs.filter((_, index) => index !== packs.length - 1 - entry.index))}>{t('react.content.disable')}</button></div>
    </li>)}</ul>
    <h3 className="pack-heading">{t('react.packs.available')}</h3>
    {!files.length && snapshot.status === 'ready' && <p>{t('react.packs.empty')}</p>}
    {!!files.length && !disabled.some(file => matches(file.name, file.fileName)) && <p>{t(query ? 'react.packs.noMatches' : 'react.packs.noneAvailable')}</p>}
    <ul className="pack-list" aria-label={t('react.packs.available')}>{disabled.filter(file => matches(file.name, file.fileName)).map(file => <li key={file.path}>
      <input type="checkbox" aria-label={t('react.content.select', { name: file.name })} checked={selected.includes(file.fileName)} disabled={fileBlocked} onChange={event => choose(file.fileName, event.target.checked)} />
      <div className="content-file"><strong>{file.name}</strong>{file.name !== file.fileName && <span>{file.fileName}</span>}<small>{t('react.packs.format', { format: String(file.metadata.resourcepack?.pack_format ?? '?'), range: packFormatVersionRange[file.metadata.resourcepack?.pack_format ?? -1] || t('react.modInfo.unknown') })}</small><small>{file.metadata.modrinth ? 'Modrinth' : file.metadata.curseforge ? 'CurseForge' : t('react.content.local')}</small></div>
      <button className="button secondary" disabled={blocked} aria-label={t('react.content.enableName', { name: file.name })} onClick={() => void save([...packs, `file/${file.fileName}`])}>{t('react.content.enable')}</button>
    </li>)}</ul>
    {removal && <RemovePacksDialog review={removal} busy={busy} error={error} close={() => { setRemoval(null); setError('') }} returnFocus={() => (removeButton.current?.isConnected && !removeButton.current.disabled ? removeButton.current : search.current)?.focus()} remove={() => void run(async () => {
      const result = await service.removeReviewed(path, removal)
      if (!alive.current) return
      setBackup(result.backup); setRemoval(null); setSelected([])
      await read(); if (alive.current) setNotice(t('react.packs.removed'))
    })} />}
  </section>
}
