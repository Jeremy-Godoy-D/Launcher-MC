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
import './catalog.css'

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

function ProjectVersions({ detail, query }: { detail: CatalogDetail; query: CatalogQuery }) {
  const { t, n, d } = useI18n(), library = useLibrary()
  const [target, setTarget] = useState(library?.current?.path || '')
  const [page, setPage] = useState(0)
  const instance = library?.instances.find(instance => instance.path === target)
  const minecraft = instance?.runtime.minecraft || query.minecraft
  const loader = detail.project.kind === 'mod' ? instance ? instance.runtime.fabricLoader ? 'fabric' : instance.runtime.quiltLoader ? 'quilt' : instance.runtime.neoForged ? 'neoforge' : instance.runtime.forge ? 'forge' : '' : query.loader : ''
  const versions = useQuery({ queryKey: ['catalog-versions', detail.project.provider, detail.project.id, minecraft, loader, page], queryFn: ({ signal }) => getCatalogVersions(detail.project.provider, detail.project.id, minecraft, loader, page, signal) })
  const rows = versions.data?.provider === 'modrinth'
    ? versions.data.versions.map(version => ({ id: version.id, name: version.name, version: version.version_number, minecraft: version.game_versions.join(', '), loaders: version.loaders.join(', '), date: version.date_published, release: version.version_type }))
    : versions.data?.versions.map(file => ({ id: String(file.id), name: file.displayName, version: file.fileName, minecraft: file.gameVersions.join(', '), loaders: '', date: file.fileDate, release: ({ 1: 'release', 2: 'beta', 3: 'alpha' })[file.releaseType] })) || []
  return <section aria-label={t('react.catalog.versions')} className="catalog-versions">
    <label htmlFor="catalog-target">{t('react.catalog.target')}</label>
    <select id="catalog-target" value={target} onChange={event => { setTarget(event.target.value); setPage(0) }}>
      <option value="">{t(detail.project.kind === 'modpack' ? 'react.catalog.newInstance' : 'react.catalog.allVersions')}</option>
      {library?.instances.map(instance => <option key={instance.path} value={instance.path}>{instance.name} · {instance.runtime.minecraft}</option>)}
    </select>
    <p className="form-help">{t('react.catalog.compatibility', { minecraft: minecraft || t('react.catalog.anyVersion'), loader: loader || t('react.catalog.anyLoader') })}</p>
    {versions.isPending && <p role="status">{t('react.catalog.loadingVersions')}</p>}
    {versions.isError && <Failure error={versions.error} retry={() => void versions.refetch()} />}
    {!versions.isPending && !versions.isError && !rows.length && <p role="status">{t('react.catalog.noVersions')}</p>}
    <ul className="catalog-version-list" data-testid="catalog-versions">
      {rows.map(row => <li key={row.id} data-version-id={row.id}>
        <strong>{row.name}</strong><span>{row.version}</span><span>{row.minecraft} {row.loaders && `· ${row.loaders}`}</span>
        <span>{t(`react.catalog.${row.release || 'release'}`)} · {Number.isFinite(Date.parse(row.date)) ? d(new Date(row.date), { dateStyle: 'medium' }) : t('react.catalog.unknownDate')}</span>
      </li>)}
    </ul>
    {!!versions.data?.total && <nav className="catalog-pagination" aria-label={t('react.catalog.versionPages')}>
      <button className="button secondary" disabled={!page || versions.isFetching} onClick={() => setPage(page => page - 1)}><ChevronLeft size={16} />{t('react.catalog.previous')}</button>
      <span>{t('react.catalog.page', { page: n(page + 1), total: n(Math.min(200, Math.ceil(versions.data.total / 50))) })}</span>
      <button className="button secondary" disabled={(page + 1) * 50 >= versions.data.total || page >= 199 || versions.isFetching} onClick={() => setPage(page => page + 1)}>{t('react.catalog.next')}<ChevronRight size={16} /></button>
    </nav>}
  </section>
}

function ProjectSheet({ provider, id, query, close, returnFocus }: { provider: Provider; id: string; query: CatalogQuery; close: () => void; returnFocus: () => void }) {
  const { t, n } = useI18n(), [tab, setTab] = useState('about')
  const detail = useQuery({ queryKey: ['catalog-detail', provider, id], queryFn: ({ signal }) => getCatalogDetail(provider, id, signal) })
  const html = useMemo(() => detail.data ? catalogDescription(detail.data.body, detail.data.markdown) : '', [detail.data])
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => { if (body.current) body.current.scrollTop = 0 }, [tab, id])
  return <Dialog.Root open onOpenChange={open => { if (!open) close() }}><Dialog.Portal>
    <Dialog.Overlay className="dialog-backdrop" />
    <Dialog.Content className="dialog creation-dialog catalog-sheet" data-testid="catalog-project" onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }} onPointerDownOutside={event => event.preventDefault()}>
      <div className="catalog-project-heading">
        {detail.data && <Image src={detail.data.project.icon} alt="" />}
        <div><Dialog.Title>{detail.data?.project.name || t('react.catalog.project')}</Dialog.Title>
          <Dialog.Description>{detail.data?.project.description || t('react.catalog.loadingProject')}</Dialog.Description></div>
      </div>
      <button className="icon-button dialog-close" aria-label={t('react.catalog.close')} onClick={close}><X size={20} /></button>
      {detail.data && <nav className="source-tabs catalog-sheet-tabs" aria-label={t('react.catalog.projectSections')}>
        {['about', 'gallery', 'versions'].map(value => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{t(`react.catalog.${value}`)}</button>)}
      </nav>}
      <div className="creation-body catalog-sheet-body" ref={body}>
        {detail.isPending && <p role="status">{t('react.catalog.loadingProject')}</p>}
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
          {tab === 'versions' && <ProjectVersions detail={detail.data} query={query} />}
        </>}
      </div>
      <footer className="dialog-actions">
        {detail.data?.website && <a className="button secondary" href={detail.data.website} target="_blank" rel="noopener noreferrer">{t('react.catalog.website')}<ExternalLink size={16} /></a>}
        <button className="button secondary" onClick={close}>{t('react.catalog.close')}</button>
      </footer>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}

function CatalogPage() {
  const { t, n } = useI18n(), [params, setParams] = useSearchParams(), location = useLocation(), navigate = useNavigate()
  const query = readCatalogQuery(params), [text, setText] = useState(query.text), [filters, setFilters] = useState(false)
  const restore = useRef<HTMLElement | null>(null), scroll = useRef(0), search = useRef<HTMLInputElement>(null)
  const result = useQuery({ queryKey: ['catalog-search', query], queryFn: ({ signal }) => searchCatalog(query, signal) })
  const route = /^\/store\/(modrinth|curseforge)\/([^/]+)\/?$/.exec(location.pathname)
  const change = (values: Record<string, string>, replace = false) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key) }
    if (!('page' in values)) next.delete('page')
    setParams(next, { replace, preventScrollReset: true })
  }
  useEffect(() => { setText(query.text) }, [query.text])
  const opened = useRef(false)
  useEffect(() => {
    if (route) { opened.current = true; return }
    if (opened.current) {
      opened.current = false
      requestAnimationFrame(() => {
        const area = document.querySelector('.page-scroll')
        if (area) area.scrollTop = scroll.current
        const target = restore.current?.isConnected ? restore.current : search.current
        target?.focus({ preventScroll: true })
      })
    }
  }, [location.pathname])
  function open(project: CatalogProject, target: HTMLElement) {
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
      <label>{t('react.catalog.minecraft')}<input data-testid="catalog-minecraft" placeholder="1.21.1" maxLength={40} value={query.minecraft} onChange={event => change({ minecraft: event.target.value }, true)} /></label>
      <label>{t('react.catalog.loader')}<select data-testid="catalog-loader" value={query.loader} onChange={event => change({ loader: event.target.value })}>{loaders.map(loader => <option key={loader} value={loader}>{loader || t('react.catalog.anyLoader')}</option>)}</select></label>
      <label>{t('react.catalog.sort')}<select data-testid="catalog-sort" value={query.sort} onChange={event => change({ sort: event.target.value })}>{sorts.map(sort => <option key={sort} value={sort}>{t(`react.catalog.sort_${sort}`)}</option>)}</select></label>
      <button className="button secondary" onClick={() => { setText(''); setParams({ source: query.provider }, { preventScrollReset: true }) }}>{t('react.catalog.clear')}</button>
    </div>
    {query.kind === 'world' && query.provider === 'modrinth' && <p role="status">{t('react.catalog.worldSource')} <button className="button secondary" onClick={() => change({ source: 'curseforge' })}>CurseForge</button></p>}
    {result.isPending && <p role="status">{t('react.catalog.loading')}</p>}
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
      {!result.data.projects.length && query.kind !== 'world' && <div className="empty"><Search size={28} aria-hidden="true" /><h2>{t('react.catalog.empty')}</h2><p>{t('react.catalog.emptyHelp')}</p></div>}
      {result.data.total > PAGE_SIZE && <nav className="catalog-pagination" aria-label={t('react.catalog.resultPages')}>
        <button className="button secondary" disabled={!query.page || result.isFetching} onClick={() => change({ page: String(query.page - 1) })}><ChevronLeft size={16} />{t('react.catalog.previous')}</button>
        <span>{t('react.catalog.page', { page: n(query.page + 1), total: n(Math.min(417, Math.ceil(result.data.total / PAGE_SIZE))) })}</span>
        <button className="button secondary" disabled={(query.page + 1) * PAGE_SIZE >= result.data.total || query.page >= 416 || result.isFetching} onClick={() => change({ page: String(query.page + 1) })}>{t('react.catalog.next')}<ChevronRight size={16} /></button>
      </nav>}
    </>}
    {location.pathname !== '/store' && !route && <div role="alert"><p>{t('react.catalog.missing')}</p><Link className="button secondary" to={`/store${location.search}`}>{t('react.catalog.back')}</Link></div>}
    {route && <ProjectSheet key={`${route[1]}:${route[2]}`} provider={route[1] as Provider} id={route[2]} query={query} close={close} returnFocus={() => (restore.current?.isConnected ? restore.current : search.current)?.focus({ preventScroll: true })} />}
  </section>
}

export function Catalog() { return <QueryClientProvider client={catalogQueries}><CatalogPage /></QueryClientProvider> }
