import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import * as Dialog from '@radix-ui/react-dialog'
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { ArrowRight, ChevronLeft, ChevronRight, Compass, ExternalLink, Search, SlidersHorizontal, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useLibrary } from '../library/context'
import vanilla from '../../assets/ambient/vanilla-shaders.webp'
import ocean from '../../assets/ambient/vanilla-ocean.webp'
import { getCatalogDetail, getCatalogVersions, kinds, loaders, PAGE_SIZE, providers, readCatalogQuery, searchCatalog, sorts, type CatalogDetail, type CatalogQuery, type CatalogProject, type Provider } from './api'
import { catalogError, catalogQueries } from './queries'
import { catalogDescription } from './description'
import { ModpackServiceKey } from '@xmcl/runtime-api/src/services/ModpackService'
import { TaskState } from '@xmcl/runtime-api/src/task'
import { createOperationId } from '@xmcl/runtime-api/src/util/launch'
import { useService, useTasks } from '../../runtime'
import { isOperationCancelled } from '../library/operations'
import { modpackDownload } from './modpack'
import { ContentInstall, type ContentSelection } from './ContentInstall'
import { WorldFilesDialog, type WorldArchiveImport } from '../instance/WorldFilesDialog'
import { ModpackUpdate, type PackUpdateSelection } from './ModpackUpdateDialog'
import { isPackTarget } from './modpackUpdate'
import './catalog.css'

type ArchiveImport = { path: string } & ({ kind: 'modpack' } | { kind: 'world'; target: ContentSelection['target']; import: WorldArchiveImport } | { kind: 'update'; selection: PackUpdateSelection })

function Image({ src, alt, fallback = vanilla, ...props }: { src: string; alt: string; fallback?: string; className?: string }) {
  return <img {...props} src={src || fallback} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={event => { if (event.currentTarget.src !== new URL(fallback, location.href).href) event.currentTarget.src = fallback }} />
}

function Failure({ error, retry, stale = false }: { error: unknown; retry: () => void; stale?: boolean }) {
  const { t, d } = useI18n(), kind = catalogError(error)
  const retryAt = error && typeof error === 'object' && 'retryAt' in error && typeof error.retryAt === 'number' ? error.retryAt : 0
  return <div className="catalog-error" role="alert">
    <p>{t(`react.catalog.${kind}`)} {stale && t('react.catalog.cached')}</p>
    {kind === 'limited' && retryAt > Date.now() && <p>{t('react.catalog.retryAt', { time: d(retryAt, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })}</p>}
    <button className="button secondary" onClick={retry}>{t('react.instances.retry')}</button>
  </div>
}

function ProjectVersions({ detail, query, onBusy, onImport, onReview }: { detail: CatalogDetail; query: CatalogQuery; onBusy: (busy: boolean) => void; onImport: (selection: ArchiveImport) => void; onReview: (selection: ContentSelection, trigger: HTMLButtonElement) => void }) {
  const { t, n, d } = useI18n(), library = useLibrary()
  const [params] = useSearchParams()
  const service = useService(ModpackServiceKey), tasks = useTasks()
  const [target, setTarget] = useState(params.get('target') || (detail.project.kind === 'modpack' ? '' : library?.current?.path || ''))
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [cancelling, setCancelling] = useState(false)
  const running = useRef(false), request = useRef(''), alive = useRef(true)
  const cancelButton = useRef<HTMLButtonElement>(null), downloadError = useRef<HTMLParagraphElement>(null)
  const current = tasks.tasks.find(task => task.type === 'downloadModpack' && task.operationId === request.current)
  const active = current?.state === TaskState.Running ? current : undefined
  const progress = current?.progress && typeof current.progress === 'object' ? current.progress : undefined
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (active && busy) cancelButton.current?.focus() }, [active?.id])
  useEffect(() => { if (error) downloadError.current?.focus() }, [error])
  async function download(id: string) {
    if (running.current || !versions.data) return
    let options
    try { options = modpackDownload(detail.project, versions.data, id) } catch { setError('archiveUnavailable'); return }
    const destination = detail.project.kind === 'world' && instance ? structuredClone(instance) : undefined
    const packTarget = detail.project.kind === 'modpack' && instance ? structuredClone(instance) : undefined
    if (detail.project.kind === 'world' && (!destination || options.market !== 1 || Array.isArray(options.file) || versions.data.provider !== 'curseforge' || !versions.data.versions.find(file => String(file.id) === id)?.gameVersions.includes(destination.runtime.minecraft))) { setError('archiveUnavailable'); return }
    running.current = true; request.current = createOperationId(); setBusy(true); onBusy(true); setError(''); setCancelling(false)
    try {
      const paths = await service.installModapckFromMarket(options, request.current)
      if (paths.length !== 1 || typeof paths[0] !== 'string' || !paths[0]) throw new Error('Invalid archive result')
      if (alive.current) {
        if (packTarget) onImport({ kind: 'update', path: paths[0], selection: { path: paths[0], target: packTarget, upstream: detail.project.provider === 'modrinth' ? { type: 'modrinth-modpack', projectId: detail.project.id, versionId: id } : { type: 'curseforge-modpack', modId: Number(detail.project.id), fileId: Number(id) } } })
        else onImport(destination && options.market === 1 && !Array.isArray(options.file)
          ? { kind: 'world', path: paths[0], target: destination, import: { sourcePath: paths[0], saveName: detail.project.name.replace(/[<>:"/\\|?*\p{Cc}]/gu, '-').trim().replace(/\.+$/, '').slice(0, 120) || 'World', targetName: `${destination.name} · ${destination.runtime.minecraft}`, curseforge: { projectId: Number(detail.project.id), fileId: options.file.fileId } } }
          : { kind: 'modpack', path: paths[0] })
      }
    } catch (failure) {
      if (alive.current) setError(isOperationCancelled(failure) ? 'downloadCancelled' : 'downloadFailed')
    } finally {
      running.current = false
      if (alive.current) { setBusy(false); setCancelling(false); onBusy(false) }
    }
  }
  async function cancel() {
    if (!active || cancelling) return
    setCancelling(true)
    try { await tasks.cancel(active.id) } catch { setError('cancelFailed'); setCancelling(false) }
  }
  const eligible = library?.instances.filter(instance => detail.project.kind !== 'modpack' || isPackTarget(instance, detail.project)) || []
  const instance = eligible.find(instance => instance.path === target)
  const minecraft = detail.project.kind === 'modpack' ? query.minecraft : instance?.runtime.minecraft || query.minecraft
  const loader = detail.project.kind === 'mod' ? instance ? instance.runtime.fabricLoader ? 'fabric' : instance.runtime.quiltLoader ? 'quilt' : instance.runtime.neoForged ? 'neoforge' : instance.runtime.forge ? 'forge' : '' : query.loader : ''
  const versions = useQuery({ queryKey: ['catalog-versions', detail.project.provider, detail.project.id, minecraft, loader, page], queryFn: ({ signal }) => getCatalogVersions(detail.project.provider, detail.project.id, minecraft, loader, page, signal) })
  const rows = versions.data?.provider === 'modrinth'
    ? versions.data.versions.map(version => ({ id: version.id, name: version.name, version: version.version_number, minecraft: version.game_versions.join(', '), loaders: version.loaders.join(', '), date: version.date_published, release: version.version_type }))
    : versions.data?.versions.map(file => ({ id: String(file.id), name: file.displayName, version: file.fileName, minecraft: file.gameVersions.join(', '), loaders: '', date: file.fileDate, release: ({ 1: 'release', 2: 'beta', 3: 'alpha' })[file.releaseType] })) || []
  return <section aria-label={t('react.catalog.versions')} className="catalog-versions">
    <label htmlFor="catalog-target">{t('react.catalog.target')}</label>
    <select id="catalog-target" value={target} disabled={busy} onChange={event => { setTarget(event.target.value); setPage(0) }}>
      <option value="">{t(detail.project.kind === 'modpack' ? 'react.catalog.newInstance' : 'react.catalog.allVersions')}</option>
      {eligible.map(instance => <option key={instance.path} value={instance.path}>{instance.name} · {instance.runtime.minecraft}</option>)}
    </select>
    <p className="form-help">{t('react.catalog.compatibility', { minecraft: minecraft || t('react.catalog.anyVersion'), loader: loader || t('react.catalog.anyLoader') })}</p>
    {!instance && ['mod', 'resourcepack', 'shader', 'world'].includes(detail.project.kind) && <p className="form-help">{t('react.catalogInstall.chooseTarget')} <Link to="/me?add=create">{t('react.catalog.newInstance')}</Link></p>}
    {detail.project.kind === 'modpack' && <p className="form-help">{t(instance ? 'react.packUpdate.downloadHelp' : 'react.catalog.importHelp')}</p>}
    {detail.project.kind === 'world' && <p className="form-help">{t('react.catalog.worldImportHelp')}</p>}
    {busy && <div className="catalog-download" role="status" data-testid="catalog-download">
      <p>{t(cancelling ? 'react.catalog.cancelling' : progress && progress.total > 0 ? 'react.catalog.downloading' : 'react.catalog.preparingDownload', { progress: n(progress?.progress || 0), total: n(progress?.total || 0) })}</p>
      <progress aria-label={t('react.catalog.downloadProgress')} max={progress && progress.total > 0 ? progress.total : undefined} value={progress && progress.total > 0 ? progress.progress : undefined} />
      <button ref={cancelButton} className="button secondary" disabled={!active || cancelling} onClick={() => void cancel()}>{t('react.catalog.cancelDownload')}</button>
    </div>}
    {error && <p ref={downloadError} tabIndex={-1} role="alert" className="form-error" data-testid="catalog-download-error">{t(`react.catalog.${error}`)}</p>}
    {versions.isPending && <p role="status">{t(versions.fetchStatus === 'paused' ? 'react.catalog.offline' : 'react.catalog.loadingVersions')}</p>}
    {versions.isError && <Failure error={versions.error} retry={() => void versions.refetch()} />}
    {!versions.isPending && !versions.isError && !rows.length && <p role="status">{t('react.catalog.noVersions')}</p>}
    <ul className="catalog-version-list" data-testid="catalog-versions">
      {rows.map(row => <li key={row.id} data-version-id={row.id}>
        <strong>{row.name}</strong><span>{row.version}</span><span>{row.minecraft} {row.loaders && `· ${row.loaders}`}</span>
        <span>{t(`react.catalog.${row.release || 'release'}`)} · {Number.isFinite(Date.parse(row.date)) ? d(new Date(row.date), { dateStyle: 'medium' }) : t('react.catalog.unknownDate')}</span>
        {['modpack', 'world'].includes(detail.project.kind) && <button className="button primary" data-testid="catalog-import-version" disabled={busy || versions.isFetching || detail.project.kind === 'world' && !instance} onClick={() => void download(row.id)}>{t(detail.project.kind === 'modpack' && instance ? 'react.packUpdate.download' : 'react.catalog.downloadImport')}</button>}
        {['mod', 'resourcepack', 'shader'].includes(detail.project.kind) && <button className="button primary" data-testid="catalog-review-version" disabled={busy || versions.isFetching || !instance} onClick={event => {
          if (!instance || !versions.data) return
          const result = versions.data
          if (result.provider === 'modrinth') {
            const version = result.versions.find(version => version.id === row.id)
            if (version) onReview({ project: detail.project, target: structuredClone(instance), candidate: { provider: 'modrinth', version } }, event.currentTarget)
          } else {
            const file = result.versions.find(file => String(file.id) === row.id)
            if (file) onReview({ project: detail.project, target: structuredClone(instance), candidate: { provider: 'curseforge', file } }, event.currentTarget)
          }
        }}>{t('react.catalogInstall.review')}</button>}
      </li>)}
    </ul>
    {!!versions.data?.total && <nav className="catalog-pagination" aria-label={t('react.catalog.versionPages')}>
      <button className="button secondary" disabled={busy || !page || versions.isFetching} onClick={() => setPage(page => page - 1)}><ChevronLeft size={16} />{t('react.catalog.previous')}</button>
      <span>{t('react.catalog.page', { page: n(page + 1), total: n(Math.min(200, Math.ceil(versions.data.total / 50))) })}</span>
      <button className="button secondary" disabled={busy || (page + 1) * 50 >= versions.data.total || page >= 199 || versions.isFetching} onClick={() => setPage(page => page + 1)}>{t('react.catalog.next')}<ChevronRight size={16} /></button>
    </nav>}
  </section>
}

function ProjectSheet({ provider, id, query, close, returnFocus, onImport }: { provider: Provider; id: string; query: CatalogQuery; close: () => void; returnFocus: () => void; onImport: (selection: ArchiveImport) => void }) {
  const { t, n } = useI18n(), [tab, setTab] = useState('about')
  const [busy, setBusy] = useState(false)
  const [versionsVisited, setVersionsVisited] = useState(false)
  const [operation, setOperation] = useState<ContentSelection>()
  const operationTrigger = useRef<HTMLButtonElement | null>(null)
  const detail = useQuery({ queryKey: ['catalog-detail', provider, id], queryFn: ({ signal }) => getCatalogDetail(provider, id, signal) })
  const html = useMemo(() => detail.data ? catalogDescription(detail.data.body, detail.data.markdown) : '', [detail.data])
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => { if (body.current) body.current.scrollTop = 0 }, [tab, id])
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) close() }}><Dialog.Portal>
    <Dialog.Overlay className="dialog-backdrop" />
    <Dialog.Content className="dialog creation-dialog catalog-sheet" data-testid="catalog-project" onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }} onPointerDownOutside={event => event.preventDefault()}>
      <div className="catalog-project-heading">
        {detail.data && <Image src={detail.data.project.icon} alt="" />}
        <div><Dialog.Title>{detail.data?.project.name || t('react.catalog.project')}</Dialog.Title>
          <Dialog.Description>{detail.data?.project.description || t('react.catalog.loadingProject')}</Dialog.Description></div>
      </div>
      <button className="icon-button dialog-close" aria-label={t('react.catalog.close')} disabled={busy} onClick={close}><X size={20} /></button>
      {detail.data && !operation && <nav className="source-tabs catalog-sheet-tabs" aria-label={t('react.catalog.projectSections')}>
        {['about', 'gallery', 'versions'].map(value => <button key={value} disabled={busy} aria-pressed={tab === value} onClick={() => { if (value === 'versions') setVersionsVisited(true); setTab(value) }}>{t(`react.catalog.${value}`)}</button>)}
      </nav>}
      <div className="creation-body catalog-sheet-body" ref={body} hidden={!!operation}>
        {detail.isPending && <p role="status">{t(detail.fetchStatus === 'paused' ? 'react.catalog.offline' : 'react.catalog.loadingProject')}</p>}
        {detail.isError && <Failure error={detail.error} retry={() => void detail.refetch()} />}
        {detail.data && <>
          {tab === 'about' && <>
            <p className="catalog-project-meta">{provider === 'modrinth' ? 'Modrinth' : 'CurseForge'} · {t('react.catalog.downloads', { count: n(detail.data.project.downloads) })}</p>
            <div className="catalog-description" data-testid="catalog-description" onClick={event => {
              const link = (event.target as Element).closest('a')
              if (!link) return
              event.preventDefault()
              const href = link.getAttribute('href')
              if (href) { try { const url = new URL(href); if (url.protocol === 'https:' && !url.username && !url.password) window.open(url.href, '_blank', 'noopener,noreferrer') } catch { /* Invalid remote links remain inert. */ } }
            }} dangerouslySetInnerHTML={{ __html: html }} />
          </>}
          {tab === 'gallery' && <div className="catalog-gallery">{detail.data.gallery.length ? detail.data.gallery.map((src, index) => <a key={src} href={src} target="_blank" rel="noopener noreferrer"><Image src={src} alt={t('react.catalog.galleryImage', { index: index + 1, name: detail.data.project.name })} /></a>) : <p>{t('react.catalog.noGallery')}</p>}</div>}
          <div hidden={tab !== 'versions'}>{versionsVisited && <ProjectVersions detail={detail.data} query={query} onBusy={setBusy} onImport={onImport} onReview={(selection, trigger) => { operationTrigger.current = trigger; setBusy(true); setOperation(selection) }} />}</div>
        </>}
      </div>
      {operation && <ContentInstall key={`${operation.target.path}:${operation.candidate.provider === 'modrinth' ? operation.candidate.version.id : operation.candidate.file.id}`} selection={operation} onBusy={setBusy} onBack={() => { setOperation(undefined); setBusy(false); requestAnimationFrame(() => operationTrigger.current?.focus()) }} />}
      {!operation && <footer className="dialog-actions">
        {detail.data?.website && <a className="button secondary" href={detail.data.website} target="_blank" rel="noopener noreferrer">{t('react.catalog.website')}<ExternalLink size={16} /></a>}
        <button className="button secondary" disabled={busy} onClick={close}>{t('react.catalog.close')}</button>
      </footer>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}

function CatalogPage({ onImport }: { onImport: (path: string, trigger: HTMLElement | null) => void }) {
  const { t, n } = useI18n(), [params, setParams] = useSearchParams(), location = useLocation(), navigate = useNavigate()
  const query = readCatalogQuery(params), [text, setText] = useState(query.text), [filters, setFilters] = useState(false)
  const [minecraft, setMinecraft] = useState(query.minecraft)
  const restore = useRef<HTMLElement | null>(null), scroll = useRef(0), search = useRef<HTMLInputElement>(null)
  const pendingImport = useRef<ArchiveImport | undefined>(undefined), handoff = useRef(false)
  const [worldImport, setWorldImport] = useState<Extract<ArchiveImport, { kind: 'world' }>>()
  const [packUpdate, setPackUpdate] = useState<PackUpdateSelection>()
  const result = useQuery({ queryKey: ['catalog-search', query], queryFn: ({ signal }) => searchCatalog(query, signal) })
  const route = /^\/store\/(modrinth|curseforge)\/([^/]+)\/?$/.exec(location.pathname)
  const change = (values: Record<string, string>, replace = false) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key) }
    if (!('page' in values)) next.delete('page')
    setParams(next, { replace, preventScrollReset: true, flushSync: true })
  }
  useEffect(() => { setText(query.text) }, [query.text])
  useEffect(() => { setMinecraft(query.minecraft) }, [query.minecraft])
  const opened = useRef(false)
  useEffect(() => {
    if (route) { opened.current = true; return }
    if (opened.current) {
      opened.current = false
      requestAnimationFrame(() => {
        const area = document.querySelector('.page-scroll')
        if (area) area.scrollTop = scroll.current
        const target = restore.current?.isConnected ? restore.current : search.current
        if (!handoff.current) target?.focus({ preventScroll: true })
      })
    }
  }, [location.pathname])
  function open(project: CatalogProject, target: HTMLElement) {
    handoff.current = false
    restore.current = target; scroll.current = document.querySelector('.page-scroll')?.scrollTop || 0
    void navigate(`/store/${project.provider}/${project.id}${location.search}`, { state: { catalogSheet: true }, preventScrollReset: true })
  }
  function close() {
    if (location.state?.catalogSheet) void navigate(-1)
    else void navigate(`/store${location.search}`, { replace: true, preventScrollReset: true })
  }
  return <section className="catalog-page" data-testid="catalog">
    <div className="page-heading"><div><h1>{t('react.catalog.title')}</h1><p>{t('react.catalog.subtitle')}</p></div></div>
    <div className="catalog-banner" style={{ backgroundImage: `linear-gradient(90deg, #111923ed, #11192355), url(${ocean})` }}><div><h2>{t('react.catalog.banner')}</h2><p>{t('react.catalog.bannerHelp')}</p></div><Compass size={64} strokeWidth={1} aria-hidden="true" /></div>
    <form className="filterbar" role="search" onSubmit={event => { event.preventDefault(); change({ q: text.trim() }) }}>
      <label className="search"><Search size={18} aria-hidden="true" /><input ref={search} data-testid="store-search" placeholder={t('react.catalog.search')} aria-label={t('react.catalog.search')} maxLength={256} value={text} onChange={event => setText(event.target.value)} /></label>
      <button className="button primary" type="submit">{t('react.catalog.find')}</button>
      <button className="button secondary" type="button" aria-expanded={filters} aria-controls="catalog-filters" onClick={() => setFilters(!filters)}><SlidersHorizontal size={17} aria-hidden="true" />{t('react.catalog.filters')}</button>
    </form>
    <div className="source-tabs" aria-label={t('react.catalog.source')}>{providers.map(provider => <button data-testid={`catalog-source-${provider}`} key={provider} aria-pressed={query.provider === provider} onClick={() => change({ source: provider })}>{provider === 'modrinth' ? 'Modrinth' : 'CurseForge'}</button>)}</div>
    <div id="catalog-filters" className="catalog-filters" hidden={!filters}>
      <label>{t('react.catalog.kind')}<select data-testid="catalog-kind" value={query.kind} onChange={event => change({ kind: event.target.value })}>{kinds.map(kind => <option key={kind} value={kind}>{t(`react.catalog.kind_${kind}`)}</option>)}</select></label>
      <label>{t('react.catalog.minecraft')}<input data-testid="catalog-minecraft" placeholder="1.21.1" maxLength={40} pattern="[A-Za-z0-9_.-]{1,40}" value={minecraft} onChange={event => setMinecraft(event.target.value)} onBlur={event => { if (event.currentTarget.reportValidity() && minecraft !== query.minecraft) change({ minecraft }, true) }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} /></label>
      <label>{t('react.catalog.loader')}<select data-testid="catalog-loader" value={query.loader} disabled={query.kind !== 'mod' && query.kind !== 'modpack'} onChange={event => change({ loader: event.target.value })}>{loaders.map(loader => <option key={loader} value={loader}>{loader || t('react.catalog.anyLoader')}</option>)}</select></label>
      <label>{t('react.catalog.sort')}<select data-testid="catalog-sort" value={query.sort} onChange={event => change({ sort: event.target.value })}>{sorts.map(sort => <option key={sort} value={sort}>{t(`react.catalog.sort_${sort}`)}</option>)}</select></label>
      <button className="button secondary" onClick={() => { setText(''); setParams({ source: query.provider }, { preventScrollReset: true, flushSync: true }) }}>{t('react.catalog.clear')}</button>
    </div>
    {query.kind === 'world' && query.provider === 'modrinth' && <p role="status">{t('react.catalog.worldSource')} <button className="button secondary" onClick={() => change({ source: 'curseforge' })}>CurseForge</button></p>}
    {result.isPending && <p role="status">{t(result.fetchStatus === 'paused' ? 'react.catalog.offline' : 'react.catalog.loading')}</p>}
    {result.isError && <Failure error={result.error} retry={() => void result.refetch()} stale={!!result.data} />}
    {result.data && <>
      <p className="catalog-count" role="status">{t('react.catalog.results', { count: n(result.data.total) })}{result.isFetching && ` · ${t('react.catalog.refreshing')}`}</p>
      <div className="catalog-grid" data-testid="catalog-results">
        {result.data.projects.map(project => <article key={`${project.provider}:${project.id}`} className="project-card" data-project-id={project.id}>
          <button className="project-art" aria-label={t('react.catalog.openProject', { name: project.name })} onClick={event => open(project, event.currentTarget)}><Image src={project.image || project.icon} alt="" /></button>
          <div className="project-card-copy"><Image src={project.icon} alt="" /><div><span className="project-kind">{t(`react.catalog.kind_${project.kind}`)}</span><h2>{project.name}</h2></div></div>
          {project.author && <span className="catalog-author">{project.author}</span>}<p>{project.description}</p>
          <span className="catalog-downloads">{t('react.catalog.downloads', { count: n(project.downloads) })}</span>
          <button className="button secondary" onClick={event => open(project, event.currentTarget)}>{t('react.catalog.view')}<ArrowRight size={16} aria-hidden="true" /></button>
        </article>)}
      </div>
      {!result.data.projects.length && !(query.kind === 'world' && query.provider === 'modrinth') && <div className="empty"><Search size={28} aria-hidden="true" /><h2>{t('react.catalog.empty')}</h2><p>{t('react.catalog.emptyHelp')}</p></div>}
      {result.data.total > PAGE_SIZE && <nav className="catalog-pagination" aria-label={t('react.catalog.resultPages')}>
        <button className="button secondary" disabled={!query.page || result.isFetching} onClick={() => change({ page: String(query.page - 1) })}><ChevronLeft size={16} />{t('react.catalog.previous')}</button>
        <span>{t('react.catalog.page', { page: n(query.page + 1), total: n(Math.min(417, Math.ceil(result.data.total / PAGE_SIZE))) })}</span>
        <button className="button secondary" disabled={(query.page + 1) * PAGE_SIZE >= result.data.total || query.page >= 416 || result.isFetching} onClick={() => change({ page: String(query.page + 1) })}>{t('react.catalog.next')}<ChevronRight size={16} /></button>
      </nav>}
    </>}
    {location.pathname !== '/store' && !route && <div role="alert"><p>{t('react.catalog.missing')}</p><Link className="button secondary" to={`/store${location.search}`}>{t('react.catalog.back')}</Link></div>}
    {route && <ProjectSheet key={`${route[1]}:${route[2]}`} provider={route[1] as Provider} id={route[2]} query={query} close={close} onImport={path => { pendingImport.current = path; handoff.current = true; close() }} returnFocus={() => {
      const trigger = restore.current?.isConnected ? restore.current : search.current
      if (pendingImport.current) {
        const archive = pendingImport.current; pendingImport.current = undefined
        if (archive.kind === 'world') setWorldImport(archive)
        else if (archive.kind === 'update') setPackUpdate(archive.selection)
        else onImport(archive.path, trigger)
      }
      else trigger?.focus({ preventScroll: true })
    }} />}
    {worldImport && <WorldFilesDialog type="import" path={worldImport.target.path} name="" initialImport={worldImport.import} changed={() => {}} close={() => setWorldImport(undefined)} returnFocus={() => (restore.current?.isConnected ? restore.current : search.current)?.focus({ preventScroll: true })} />}
    {packUpdate && <ModpackUpdate selection={packUpdate} close={() => setPackUpdate(undefined)} returnFocus={() => (restore.current?.isConnected ? restore.current : search.current)?.focus({ preventScroll: true })} />}
  </section>
}

export function Catalog({ onImport }: { onImport: (path: string, trigger: HTMLElement | null) => void }) { return <QueryClientProvider client={catalogQueries}><CatalogPage onImport={onImport} /></QueryClientProvider> }
