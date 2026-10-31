import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Map, RefreshCw, Search, X } from 'lucide-react'
import { InstanceSavesServiceKey } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import type { InstanceSavePreview } from '@xmcl/runtime-api/src/entities/save'
import { useService } from '../../runtime'
import { useI18n } from '../../i18n'
import { usePanelFocus } from './usePanelFocus'
import { WorldFilesDialog } from './WorldFilesDialog'
import type { WorldFileOperation } from '@xmcl/runtime-api/src/services/InstanceSavesService'

export function InstanceWorlds({ path, running }: { path: string; running: boolean }) {
  const service = useService(InstanceSavesServiceKey), { t, d, n } = useI18n()
  const [worlds, setWorlds] = useState<InstanceSavePreview[]>([]), [query, setQuery] = useState(''), [reading, setReading] = useState(true)
  const [error, setError] = useState(false), [revision, setRevision] = useState(0), [opening, setOpening] = useState(false), [details, setDetails] = useState('')
  const [action, setAction] = useState<{ name: string; type: WorldFileOperation['type'] } | null>(null), actionTrigger = useRef<HTMLButtonElement | null>(null), search = useRef<HTMLInputElement>(null)
  const alive = useRef(true), openingFolder = useRef(false), trigger = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    let active = true, pending = false, again = false
    async function read() {
      if (running) { setReading(false); return }
      if (pending) { again = true; return }
      pending = true; setReading(true); setError(false)
      try { const value = await service.getInstanceSaves(path); if (active) setWorlds(value) }
      catch { if (active) setError(true) }
      finally { pending = false; if (active) { setReading(false); if (again) { again = false; void read() } } }
    }
    void read()
    window.addEventListener('focus', read)
    return () => { active = false; window.removeEventListener('focus', read) }
  }, [service, path, running, revision])
  async function openFolder() {
    if (openingFolder.current) return
    openingFolder.current = true; setOpening(true); setError(false)
    try { await service.showDirectory(path) }
    catch { if (alive.current) setError(true) }
    finally { openingFolder.current = false; if (alive.current) setOpening(false) }
  }
  const selected = worlds.find(world => world.name === details)
  const visible = worlds.filter(world => `${world.levelName || ''} ${world.name} ${world.gameVersion || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  function closeDetails() { setDetails(''); trigger.current?.focus() }
  return <section data-testid="instance-worlds" aria-labelledby="worlds-title" aria-busy={reading}>
    <div className="section-heading"><h2 id="worlds-title">{t('react.workspace.worlds')}</h2><div className="content-actions">
      <button className="button secondary" disabled={reading || running} onClick={() => setRevision(value => value + 1)} data-testid="worlds-refresh"><RefreshCw size={17} aria-hidden="true" />{t('react.worlds.refresh')}</button>
      <button className="button secondary" disabled={opening} onClick={() => void openFolder()}><FolderOpen size={17} aria-hidden="true" />{t('react.operations.openFolder')}</button>
    </div></div>
    {error && <p className="form-error" role="alert">{t('react.worlds.loadFailed')}</p>}
    {running && <p role="status">{t('react.worlds.running')}</p>}
    <div className="content-filters"><label className="search"><Search size={17} aria-hidden="true" /><input ref={search} aria-label={t('react.worlds.search')} placeholder={t('react.worlds.search')} value={query} onChange={event => setQuery(event.target.value)} /></label><span aria-live="polite">{t(visible.length === 1 ? 'react.worlds.one' : 'react.worlds.count', { count: n(visible.length) })}</span></div>
    {selected && <WorldDetails key={selected.name} world={selected} close={closeDetails} />}
    {reading && <p role="status">{t('react.worlds.loading')}</p>}
    {!reading && !error && !visible.length && <p className="empty">{t(query ? 'react.worlds.noMatches' : 'react.worlds.empty')}</p>}
    <ul className="pack-list world-list" data-testid="worlds-list">{visible.map(world => <li key={world.name} data-world-name={world.name}>
      <div className="world-icon">{world.icon ? <img src={world.icon} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none' }} /> : <Map size={24} aria-hidden="true" />}</div>
      <div><button className="content-file-name" onClick={event => { trigger.current = event.currentTarget; setDetails(world.name) }}>{world.levelName || world.name}</button><small>{world.name} · {world.gameVersion || t('react.workspace.unknown')}{world.linkTo ? ` · ${t('react.worlds.shared')}` : ''}</small>
        {world.error ? <p className="form-error">{t(`react.worlds.${world.error}`)}</p> : <small>{t(`react.worlds.mode${world.mode}`)} · {world.lastPlayed ? d(world.lastPlayed) : t('react.workspace.never')}</small>}
        <div className="content-actions">{(['copy', 'export', 'remove'] as const).map(type => <button key={type} className="button secondary" disabled={running || reading || world.error === 'unsafe'} aria-label={t(`react.worldFiles.${type}Name`, { name: world.name })} onClick={event => { actionTrigger.current = event.currentTarget; setAction({ name: world.name, type }) }}>{t(`react.worldFiles.${type}`)}</button>)}</div>
      </div>
    </li>)}</ul>
    {action && <WorldFilesDialog key={`${action.name}:${action.type}`} path={path} name={action.name} type={action.type} close={() => setAction(null)} changed={() => { setDetails(''); setRevision(value => value + 1) }} returnFocus={() => { const target = actionTrigger.current; if (target?.isConnected && !target.disabled) target.focus(); else search.current?.focus() }} />}
  </section>
}

function WorldDetails({ world, close }: { world: InstanceSavePreview; close: () => void }) {
  const { t, d, n } = useI18n(), panel = useRef<HTMLElement>(null), first = useRef<HTMLButtonElement>(null)
  usePanelFocus(panel, first)
  const unknown = t('react.workspace.unknown')
  return <section ref={panel} className="content-info" aria-labelledby="world-info-title" data-testid="world-info" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
    <div className="section-heading"><h2 id="world-info-title">{world.levelName || world.name}</h2><button ref={first} className="icon-button" aria-label={t('react.worlds.close')} onClick={close}><X size={20} aria-hidden="true" /></button></div>
    {world.error && <p className="form-error">{t(`react.worlds.${world.error}`)}</p>}
    <dl className="content-metadata">
      <dt>{t('react.worlds.folder')}</dt><dd>{world.name}</dd><dt>Minecraft</dt><dd>{world.gameVersion || unknown}</dd>
      <dt>{t('react.worlds.mode')}</dt><dd>{world.mode === undefined ? unknown : t(`react.worlds.mode${world.mode}`)}</dd>
      <dt>{t('react.worlds.difficulty')}</dt><dd>{world.difficulty === undefined || world.difficulty < 0 ? unknown : t(`react.worlds.difficulty${world.difficulty}`)}</dd>
      <dt>{t('react.worlds.cheats')}</dt><dd>{world.cheat === undefined ? unknown : t(world.cheat ? 'react.worlds.enabled' : 'react.worlds.disabled')}</dd>
      <dt>{t('react.workspace.lastPlayed')}</dt><dd>{world.lastPlayed ? d(world.lastPlayed) : unknown}</dd>
      <dt>{t('react.worlds.time')}</dt><dd>{world.time === undefined ? unknown : n(Math.floor(world.time / 24000))}</dd>
      <dt>{t('react.worlds.seed')}</dt><dd>{world.seed || unknown}</dd>
      <dt>{t('react.workspace.folder')}</dt><dd>{world.path}</dd>
    </dl>{world.linkTo && <p>{t('react.worlds.sharedHelp')}</p>}
  </section>
}
