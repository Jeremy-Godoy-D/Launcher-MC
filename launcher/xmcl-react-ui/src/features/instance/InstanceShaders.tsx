import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { FolderOpen, RefreshCw, Search } from 'lucide-react'
import { InstanceShaderPacksServiceKey, type ShaderPackSelection } from '@xmcl/runtime-api/src/services/InstanceShaderPacksService'
import { InstanceModsServiceKey } from '@xmcl/runtime-api/src/services/InstanceModsService'
import { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import { useService, useSharedStateStore } from '../../runtime'
import { useI18n } from '../../i18n'
import type { SavedInstance } from '../library/model'
import { usePanelFocus } from './usePanelFocus'

export function InstanceShaders({ path, running, runtime }: { path: string; running: boolean; runtime: SavedInstance['runtime'] }) {
  const { t, n } = useI18n(), service = useService(InstanceShaderPacksServiceKey)
  const shaders = useSharedStateStore({ key: `instance-shaderpacks://${path}`, Type: ResourceState, load: client => client.service(InstanceShaderPacksServiceKey).watch(path) })
  const mods = useSharedStateStore({ key: `instance-mods://${path}`, Type: ResourceState, load: client => client.service(InstanceModsServiceKey).watch(path) })
  const snapshot = useSyncExternalStore(shaders.subscribe, shaders.getSnapshot, shaders.getSnapshot), modSnapshot = useSyncExternalStore(mods.subscribe, mods.getSnapshot, mods.getSnapshot)
  const [selection, setSelection] = useState<ShaderPackSelection | null>(null), [query, setQuery] = useState(''), [working, setWorking] = useState(false), [reading, setReading] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const alive = useRef(true), request = useRef(0), operation = useRef(false), panel = useRef<HTMLElement>(null), focusAfter = useRef<HTMLButtonElement | null>(null)
  usePanelFocus(panel)
  const busy = working || reading || snapshot.status !== 'ready' || modSnapshot.status !== 'ready'
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++ } }, [])
  useEffect(() => { if (!busy && focusAfter.current?.isConnected && !focusAfter.current.disabled) { focusAfter.current.focus(); focusAfter.current = null } }, [busy])
  async function read() {
    const revision = ++request.current; setReading(true)
    try { const value = await service.getSelection(path); if (alive.current && revision === request.current) setSelection(value) }
    catch { if (alive.current && revision === request.current) { setSelection(null); setError(t('react.shaders.loadFailed')) } }
    finally { if (alive.current && revision === request.current) setReading(false) }
  }
  useEffect(() => { if (snapshot.status === 'ready' && modSnapshot.status === 'ready') void read() }, [snapshot.data, snapshot.status, modSnapshot.data, modSnapshot.status, runtime])
  async function refresh() {
    if (operation.current) return
    operation.current = true; setWorking(true); setError(''); setNotice('')
    try { await Promise.all([shaders.revalidate(), mods.revalidate()]); await read() }
    catch { if (alive.current) setError(t('react.shaders.loadFailed')) }
    finally { operation.current = false; if (alive.current) setWorking(false) }
  }
  async function select(pack: string, enabled: boolean, button: HTMLButtonElement) {
    if (operation.current || !selection?.engine || busy || running) return
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
  const files = (snapshot.data?.files || []).filter(file => file.fileName.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const activePresent = snapshot.data?.files.some(file => file.fileName === selection?.pack)
  return <section ref={panel} data-testid="instance-shaders" aria-labelledby="shaders-title" aria-busy={busy}>
    <div className="section-heading"><h2 id="shaders-title">{t('react.workspace.shaders')}</h2><div className="content-actions">
      <button className="button secondary" disabled={working} onClick={() => void service.showDirectory(path).catch(() => { if (alive.current) setError(t('react.workspace.folderFailed')) })}><FolderOpen size={17} aria-hidden="true" />{t('react.shaders.folder')}</button>
      <button className="button secondary" disabled={working} onClick={() => void refresh()}><RefreshCw size={17} aria-hidden="true" />{t('react.content.refresh')}</button>
    </div></div>
    <p className="packs-help">{t('react.shaders.help')}</p>
    {selection?.engine && <p className="packs-help"><strong>{t('react.shaders.engine', { name: selection.engine === 'optifine' ? 'OptiFine' : selection.engine === 'iris' ? 'Iris' : 'Oculus' })}</strong></p>}
    {selection?.shared && <p className="packs-help" role="status">{t('react.shaders.shared')}</p>}
    {selection && (!selection.engine || selection.metadataPending) && <p className="packs-help" role="status">{t(selection.metadataPending ? 'react.shaders.metadataPending' : selection.engines.length > 1 ? 'react.shaders.ambiguous' : 'react.shaders.noEngine')} <Link to="/instance/mods">{t('react.shaders.manageMods')}</Link></p>}
    {running && <p role="status">{t('react.content.running')}</p>}
    <div className="content-filters"><label className="search"><Search size={18} aria-hidden="true" /><input aria-label={t('react.shaders.search')} placeholder={t('react.shaders.search')} value={query} onChange={event => setQuery(event.target.value)} /></label></div>
    {busy && <p role="status">{t('react.shaders.loading')}</p>}
    {(error || snapshot.status === 'error' || modSnapshot.status === 'error') && <p role="alert" className="form-error">{error || t('react.shaders.loadFailed')}</p>}
    {!!snapshot.data?.errors.length && <p role="alert" className="form-error">{t('react.content.parseFailed')} {snapshot.data.errors.map(error => error.path).join(', ')}</p>}
    {notice && <p role="status">{notice}</p>}
    {selection?.pack && !activePresent && <p role="status" className="packs-help">{t('react.shaders.missing', { name: selection.pack })}</p>}
    {selection?.engine && selection.enabled && <button className="button secondary" disabled={busy || running} onClick={event => void select(selection.pack, false, event.currentTarget)}>{t('react.shaders.disableAll')}</button>}
    {snapshot.status === 'ready' && !files.length && <p>{t(query ? 'react.shaders.noMatches' : 'react.shaders.empty')}</p>}
    <ul className="content-list shader-list">{files.map(file => {
      const enabled = selection?.pack === file.fileName && selection.enabled
      return <li key={file.path}><div className="content-file"><strong>{file.fileName}</strong><small>{file.isDirectory ? t('react.shaders.unpacked') : `${n(file.size / 1024, { maximumFractionDigits: 0 })} KiB`} · {file.metadata.modrinth ? 'Modrinth' : file.metadata.curseforge ? 'CurseForge' : t('react.shaders.local')}</small><span>{t(enabled ? 'react.shaders.active' : 'react.shaders.available')}</span></div>
        <button className="button secondary" disabled={busy || running || !selection?.engine} aria-pressed={!!enabled} aria-label={t(enabled ? 'react.shaders.disableName' : 'react.shaders.enableName', { name: file.fileName })} onClick={event => void select(file.fileName, !enabled, event.currentTarget)}>{t(enabled ? 'react.shaders.disable' : 'react.shaders.enable')}</button></li>
    })}</ul>
  </section>
}
