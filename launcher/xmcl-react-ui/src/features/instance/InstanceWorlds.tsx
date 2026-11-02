import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Info, Layers, Map, Plus, RefreshCw, Search, Trophy, X } from 'lucide-react'
import { InstanceSavesServiceKey, type LegacyWorldMigrationStatus } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import type { InstanceDatapack, InstanceSavePreview } from '@xmcl/runtime-api/src/entities/save'
import { useService } from '../../runtime'
import { useI18n } from '../../i18n'
import { usePanelFocus } from './usePanelFocus'
import { WorldFilesDialog } from './WorldFilesDialog'
import { WorldProgress } from './WorldProgress'
import { WorldMap } from './WorldMap'
import type { WorldFileOperation } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import { WorldSharingDialog, type WorldSharingAction } from './WorldSharingDialog'

export function InstanceWorlds({ path, running }: { path: string; running: boolean }) {
  const service = useService(InstanceSavesServiceKey), { t, d, n } = useI18n()
  const [worlds, setWorlds] = useState<InstanceSavePreview[]>([]), [query, setQuery] = useState(''), [reading, setReading] = useState(true)
  const [error, setError] = useState(false), [revision, setRevision] = useState(0), [opening, setOpening] = useState(false), [details, setDetails] = useState('')
  const [initialTab, setInitialTab] = useState<'info' | 'progress' | 'map'>('info')
  const [migration, setMigration] = useState<LegacyWorldMigrationStatus>(), [recovering, setRecovering] = useState(false), recovery = useRef(false)
  const recoveryFocus = useRef(false), retryButton = useRef<HTMLButtonElement>(null)
  const [common, setCommon] = useState<InstanceSavePreview[]>([]), [linked, setLinked] = useState<boolean | null>(null), [commonError, setCommonError] = useState(false)
  const [sharing, setSharing] = useState<WorldSharingAction | null>(null), shareTrigger = useRef<HTMLButtonElement | null>(null)
  const [action, setAction] = useState<{ name: string; type: WorldFileOperation['type']; datapackFileName?: string } | null>(null), actionTrigger = useRef<HTMLButtonElement | null>(null), search = useRef<HTMLInputElement>(null)
  const alive = useRef(true), openingFolder = useRef(false), trigger = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!recovering && recoveryFocus.current) { recoveryFocus.current = false; (migration?.status === 'ready' ? search.current : retryButton.current)?.focus() }
  }, [recovering, migration])
  useEffect(() => {
    let active = true, pending = false, again = false
    async function read() {
      if (pending) { again = true; return }
      pending = true; setReading(true); setError(false)
      try {
        const [saves, status, shared, connection] = await Promise.allSettled([running ? Promise.resolve(undefined) : service.getInstanceSaves(path), service.getLegacyWorldMigrationStatus(), service.getSharedSaves(), service.isSaveLinked(path)])
        if (active) {
          if (saves.status === 'fulfilled' && saves.value) setWorlds(saves.value)
          if (status.status === 'fulfilled') setMigration(status.value)
          if (shared.status === 'fulfilled') setCommon(shared.value)
          if (connection.status === 'fulfilled') setLinked(connection.value)
          setCommonError(shared.status === 'rejected' || connection.status === 'rejected')
          setError(saves.status === 'rejected' || status.status === 'rejected')
        }
      }
      catch { if (active) setError(true) }
      finally { pending = false; if (active) { setReading(false); if (again) { again = false; void read() } } }
    }
    void read()
    window.addEventListener('focus', read)
    return () => { active = false; window.removeEventListener('focus', read) }
  }, [service, path, running, revision])
  async function recover() {
    if (recovery.current) return
    recovery.current = true; recoveryFocus.current = true; setRecovering(true)
    try { const status = await service.retryLegacyWorldMigration(); if (alive.current) { setMigration(status); setRevision(value => value + 1) } }
    catch { if (alive.current) setError(true) }
    finally { recovery.current = false; if (alive.current) setRecovering(false) }
  }
  async function openFolder() {
    if (openingFolder.current) return
    openingFolder.current = true; setOpening(true); setError(false)
    try { await service.showDirectory(path) }
    catch { if (alive.current) setError(true) }
    finally { openingFolder.current = false; if (alive.current) setOpening(false) }
  }
  const selected = worlds.find(world => world.name === details)
  const visible = worlds.filter(world => `${world.levelName || ''} ${world.name} ${world.gameVersion || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  function closeDetails() { setDetails(''); setInitialTab('info'); trigger.current?.focus() }
  function openSharing(action: WorldSharingAction, button: HTMLButtonElement) { shareTrigger.current = button; setSharing(action) }
  return <section data-testid="instance-worlds" aria-labelledby="worlds-title" aria-busy={reading}>
    <div className="section-heading"><h2 id="worlds-title">{t('react.workspace.worlds')}</h2><div className="content-actions">
      <button className="button primary" disabled={reading || running || !window.windowController?.showOpenDialog} onClick={event => { actionTrigger.current = event.currentTarget; setAction({ type: 'import', name: '' }) }}><Plus size={17} aria-hidden="true" />{t('react.worldFiles.importTitle')}</button>
      <button className="button secondary" disabled={reading || running} onClick={() => setRevision(value => value + 1)} data-testid="worlds-refresh"><RefreshCw size={17} aria-hidden="true" />{t('react.worlds.refresh')}</button>
      <button className="button secondary" disabled={opening} onClick={() => void openFolder()}><FolderOpen size={17} aria-hidden="true" />{t('react.operations.openFolder')}</button>
    </div></div>
    {migration && migration.status !== 'ready' && <div className="form-error" role="alert" data-testid="worlds-migration-warning">
      <p>{t('react.worlds.migrationPending')}</p>
      <p>{t(migration.status === 'blocked' && !recovering ? `react.worlds.migrationReason.${migration.reason}` : 'react.worlds.migrationProgress')}</p>
      <button ref={retryButton} className="button secondary" disabled={running || recovering || migration.status === 'running'} onClick={() => void recover()}>{t(recovering ? 'react.worlds.migrationProgress' : 'react.worlds.migrationRetry')}</button>
    </div>}
    {error && <p className="form-error" role="alert">{t('react.worlds.loadFailed')}</p>}
    {running && <p role="status">{t('react.worlds.running')}</p>}
    <div className="content-filters"><label className="search"><Search size={17} aria-hidden="true" /><input ref={search} aria-label={t('react.worlds.search')} placeholder={t('react.worlds.search')} value={query} onChange={event => setQuery(event.target.value)} /></label><span aria-live="polite">{t(visible.length === 1 ? 'react.worlds.one' : 'react.worlds.count', { count: n(visible.length) })}</span></div>
    {selected && <WorldDetails key={`${selected.name}:${initialTab}`} path={path} world={selected} running={running} revision={revision} initialTab={initialTab} close={closeDetails} onAction={(act, btn) => { actionTrigger.current = btn; setAction(act) }} />}
    {reading && <p role="status">{t('react.worlds.loading')}</p>}
    {!reading && !error && !visible.length && <p className="empty">{t(query ? 'react.worlds.noMatches' : 'react.worlds.empty')}</p>}
    <ul className="pack-list world-list" data-testid="worlds-list">{visible.map(world => <li key={world.name} data-world-name={world.name}>
      <div className="world-icon">{world.icon ? <img src={world.icon} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none' }} /> : <Map size={24} aria-hidden="true" />}</div>
      <div className="content-file"><button className="content-file-name" onClick={event => { trigger.current = event.currentTarget; setInitialTab('info'); setDetails(world.name) }}>{world.levelName || world.name}</button><small>{world.name} · {world.gameVersion || t('react.workspace.unknown')}{world.linkTo ? ` · ${t('react.worlds.shared')}` : ''}</small>
        {world.error ? <p className="form-error">{t(`react.worlds.${world.error}`)}</p> : <small>{t(`react.worlds.mode${world.mode}`)} · {world.lastPlayed ? d(world.lastPlayed) : t('react.workspace.never')}</small>}
        <div className="content-actions">
          <button
            type="button"
            className="button secondary"
            disabled={running || reading || !!world.error}
            data-testid="world-action-progress"
            aria-label={`${t('react.worldProgress.tab')}: ${world.name}`}
            onClick={event => {
              trigger.current = event.currentTarget
              setInitialTab('progress')
              setDetails(world.name)
            }}
          >
            <Trophy size={14} aria-hidden="true" />
            {t('react.worldProgress.tab')}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={running || reading || !!world.error}
            data-testid="world-action-map"
            aria-label={`${t('react.worldMap.tab')}: ${world.name}`}
            onClick={event => {
              trigger.current = event.currentTarget
              setInitialTab('map')
              setDetails(world.name)
            }}
          >
            <Map size={14} aria-hidden="true" />
            {t('react.worldMap.tab')}
          </button>
          {(['metadata', 'copy', 'export', 'remove'] as const).map(type => <button key={type} className="button secondary" disabled={running || reading || world.error === 'unsafe' || type === 'metadata' && !!world.error} aria-label={t(`react.worldFiles.${type}Name`, { name: world.name })} onClick={event => { actionTrigger.current = event.currentTarget; setAction({ name: world.name, type }) }}>{t(`react.worldFiles.${type}`)}</button>)}
          {linked === false && <button className="button secondary" disabled={running || reading || !!world.error || commonError} onClick={event => openSharing({ type: world.linkTo ? 'deactivate' : 'share', world }, event.currentTarget)}>{t(world.linkTo ? 'react.worldSharing.deactivate' : 'react.worldSharing.share')}</button>}
        </div>
      </div>
    </li>)}</ul>
    <section aria-labelledby="common-worlds-title" className="common-worlds" data-testid="worlds-common">
      <div className="section-heading"><h3 id="common-worlds-title">{t('react.worldSharing.title')}</h3><button className="button secondary" disabled={running || reading || linked === null || commonError} onClick={event => openSharing({ type: linked ? 'disconnect' : 'connect' }, event.currentTarget)}>{t(linked ? 'react.worldSharing.disconnect' : 'react.worldSharing.connect')}</button></div>
      <p>{t(linked ? 'react.worldSharing.connected' : 'react.worldSharing.description')}</p>
      {commonError && <p className="form-error" role="alert">{t('react.worldSharing.loadFailed')}</p>}
      {!linked && !commonError && !reading && !common.length && <p className="empty">{t('react.worldSharing.empty')}</p>}
      {!linked && <ul className="pack-list world-list">{common.map(world => {
        const active = worlds.some(local => local.linkTo && local.linkTo.replace(/\\/g, '/').split('/').pop()?.toLowerCase() === world.name.toLowerCase())
        return <li key={world.name} data-common-world={world.name}><Map size={24} aria-hidden="true" /><div className="content-file"><strong>{world.levelName || world.name}</strong><small>{world.name} · {world.gameVersion || t('react.workspace.unknown')}</small><div className="content-actions">
          <button className="button secondary" disabled={running || reading || active || commonError} onClick={event => openSharing({ type: 'activate', world }, event.currentTarget)}>{t(active ? 'react.worldSharing.active' : 'react.worldSharing.activate')}</button>
          <button className="button secondary" disabled={running || reading || commonError} onClick={event => openSharing({ type: 'remove', world }, event.currentTarget)}>{t('react.worldSharing.remove')}</button>
        </div></div></li>
      })}</ul>}
    </section>
    {sharing && <WorldSharingDialog key={`${sharing.type}:${'world' in sharing ? sharing.world.name : ''}`} path={path} action={sharing} close={() => setSharing(null)} changed={() => setRevision(value => value + 1)} returnFocus={() => { const button = shareTrigger.current; if (button?.isConnected && !button.disabled) button.focus(); else search.current?.focus() }} />}
    {action && <WorldFilesDialog key={`${action.name}:${action.type}:${action.datapackFileName || ''}`} path={path} name={action.name} type={action.type} datapackFileName={action.datapackFileName} world={worlds.find(world => world.name === action.name)} close={() => setAction(null)} changed={() => { setRevision(value => value + 1) }} returnFocus={() => { const target = actionTrigger.current; if (target?.isConnected && !target.disabled) target.focus(); else search.current?.focus() }} />}
  </section>
}

function WorldDetails({
  path,
  world,
  running,
  close,
  onAction,
  revision,
  initialTab = 'info',
}: {
  path: string
  world: InstanceSavePreview
  running: boolean
  close: () => void
  onAction: (action: { name: string; type: WorldFileOperation['type']; datapackFileName?: string }, trigger: HTMLButtonElement) => void
  revision: number
  initialTab?: 'info' | 'progress' | 'map'
}) {
  const service = useService(InstanceSavesServiceKey), { t, d, n } = useI18n(), panel = useRef<HTMLElement>(null), first = useRef<HTMLButtonElement>(null)
  const [tab, setTab] = useState<'info' | 'progress' | 'map'>(initialTab)
  const [datapacks, setDatapacks] = useState<InstanceDatapack[]>([])
  const [loadingDatapacks, setLoadingDatapacks] = useState(true)
  const [dpError, setDpError] = useState(false)
  const [dpRevision, setDpRevision] = useState(0)
  usePanelFocus(panel, first)
  const unknown = t('react.workspace.unknown')

  useEffect(() => {
    let active = true
    async function load() {
      if (world.error) { setLoadingDatapacks(false); return }
      setLoadingDatapacks(true); setDpError(false)
      try {
        const result = await service.getWorldDatapacks(path, world.name)
        if (active) setDatapacks(result)
      } catch {
        if (active) setDpError(true)
      } finally {
        if (active) setLoadingDatapacks(false)
      }
    }
    void load()
    return () => { active = false }
  }, [service, path, world.name, world.error, dpRevision, revision])

  return <section ref={panel} className="content-info" aria-labelledby="world-info-title" data-testid="world-info" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
    <div className="section-heading">
      <h2 id="world-info-title">{world.levelName || world.name}</h2>
      <button ref={first} className="icon-button" aria-label={t('react.worlds.close')} onClick={close}>
        <X size={20} aria-hidden="true" />
      </button>
    </div>

    <div className="content-selection" style={{ padding: '4px 0 12px 0', borderBottom: '1px solid var(--line)', marginBottom: '16px', gap: '8px' }}>
      <button
        type="button"
        className={`button ${tab === 'info' ? 'primary' : 'secondary'}`}
        data-testid="world-tab-info"
        onClick={() => setTab('info')}
      >
        <Info size={15} aria-hidden="true" />
        {t('react.worlds.tabInfo')}
      </button>
      <button
        type="button"
        className={`button ${tab === 'progress' ? 'primary' : 'secondary'}`}
        data-testid="world-tab-progress"
        disabled={!!world.error}
        onClick={() => setTab('progress')}
      >
        <Trophy size={15} aria-hidden="true" />
        {t('react.worldProgress.tab')}
      </button>
      <button
        type="button"
        className={`button ${tab === 'map' ? 'primary' : 'secondary'}`}
        data-testid="world-tab-map"
        disabled={!!world.error}
        onClick={() => setTab('map')}
      >
        <Map size={15} aria-hidden="true" />
        {t('react.worldMap.tab')}
      </button>
    </div>

    {tab === 'info' && (
      <>
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

        <div className="section-heading" style={{ marginTop: '1.25rem' }}>
          <h3>{t('react.worldDatapacks.title')}</h3>
          <div className="content-actions">
            <button
              className="button secondary"
              disabled={running || !!world.error || !window.windowController?.showOpenDialog}
              data-testid="datapack-import"
              onClick={event => onAction({ name: world.name, type: 'import-datapack' }, event.currentTarget)}
            >
              <Plus size={16} aria-hidden="true" />
              {t('react.worldDatapacks.import')}
            </button>
            <button
              className="button secondary"
              disabled={loadingDatapacks || running || !!world.error}
              data-testid="datapack-refresh"
              onClick={() => setDpRevision(v => v + 1)}
            >
              <RefreshCw size={16} aria-hidden="true" />
              {t('react.worldDatapacks.refresh')}
            </button>
          </div>
        </div>
        {loadingDatapacks && <p role="status">{t('react.worldDatapacks.loading')}</p>}
        {dpError && <p className="form-error" role="alert">{t('react.worldDatapacks.loadFailed')}</p>}
        {!loadingDatapacks && !dpError && !datapacks.length && <p className="empty">{t('react.worldDatapacks.empty')}</p>}
        {!loadingDatapacks && !dpError && !!datapacks.length && (
          <ul className="pack-list" data-testid="world-datapacks" aria-label={t('react.worldDatapacks.title')}>
            {datapacks.map(dp => (
              <li key={dp.fileName} data-datapack-name={dp.fileName}>
                <div className="world-icon">
                  {dp.icon ? <img src={dp.icon} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none' }} /> : <Layers size={20} aria-hidden="true" />}
                </div>
                <div>
                  <strong>{dp.name}</strong>
                  <small>{dp.fileName} · {dp.directory ? t('react.worldDatapacks.folder') : 'ZIP'}{dp.packFormat !== undefined && dp.packFormat >= 0 ? ` · format ${dp.packFormat}` : ''}</small>
                  {dp.description && <p className="content-description">{dp.description}</p>}
                  {dp.error && <p className="form-error">{t(`react.worldDatapacks.${dp.error}`)}</p>}
                  <div className="content-actions">
                    <button
                      className="button secondary"
                      disabled={running || dp.error === 'unsafe'}
                      data-testid="datapack-remove"
                      aria-label={t('react.worldFiles.removeDatapackName', { name: dp.name })}
                      onClick={event => onAction({ name: world.name, type: 'remove-datapack', datapackFileName: dp.fileName }, event.currentTarget)}
                    >
                      {t('react.worldFiles.remove')}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </>
    )}

    {tab === 'progress' && (
      <WorldProgress savePath={world.path} instancePath={path} running={running} />
    )}

    {tab === 'map' && (
      <WorldMap savePath={world.path} running={running} />
    )}
  </section>
}

