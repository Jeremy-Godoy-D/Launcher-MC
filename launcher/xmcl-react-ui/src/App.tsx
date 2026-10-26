import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  ExternalLink,
  FolderOpen,
  Grid2X2,
  Home,
  Layers,
  List,
  Maximize2,
  Minus,
  Moon,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
  Terminal,
  UserRound,
  X,
} from 'lucide-react'
import projects from './project-fixtures.json'
import brandIcon from '../../branding/copper/app-64.png'
import sunset from './assets/ambient/vanilla-shaders.webp'
import caves from './assets/ambient/vanilla-caves.webp'
import cavesVideo from './assets/ambient/vanilla-caves.mp4'
import ocean from './assets/ambient/vanilla-ocean.webp'
import credits from './assets/ambient/credits.json'
import { allowAmbientMotion, isPlaybackInterruption, nextFeatured, ROTATION_MS } from './presentation'
import { usePreferences } from './preferences-context'
import { useI18n } from './i18n'
import { Accounts } from './features/accounts/Accounts'
import { useAccounts } from './features/accounts/context'
import { useLibrary } from './features/library/context'
import { instanceIcon, loaderName, type SavedInstance } from './features/library/model'
import { AddInstance } from './features/library/AddInstance'
import { useLaunch } from './features/launch/context'
import { LaunchDialog } from './features/launch/LaunchDialog'
import { InstanceOperations } from './features/library/InstanceOperations'
import { GroupsDialog } from './features/library/GroupsDialog'

declare global {
  interface Window {
    windowController?: {
      minimize(): void
      maximize(): void
      close(): void
      showOpenDialog?: import('@xmcl/runtime-api/src/controller').WindowController['showOpenDialog']
      on(channel: 'window-active', listener: (active: boolean) => void): unknown
      removeListener(channel: 'window-active', listener: (active: boolean) => void): unknown
    }
  }
}

function presentInstance(instance: SavedInstance) {
  const icon = instanceIcon(instance.icon)
  const caveScene = instance.runtime.minecraft.startsWith('1.20.')
  const pack = !!instance.upstream && instance.upstream.type !== 'server'
  return {
    id: instance.path, name: instance.name,
    version: instance.runtime.minecraft || instance.version,
    loader: loaderName(instance), icon,
    // shortcut: use the pack's stored icon as its cover; resolve provider galleries in the catalog/media block.
    image: pack && icon ? icon : caveScene ? caves : sunset,
    video: !pack && caveScene ? cavesVideo : undefined,
    description: instance.description,
    ambientFallback: !pack || !icon,
  }
}
type Instance = ReturnType<typeof presentInstance>

function StoredImage({ src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...props} src={src} onError={event => {
    if (event.currentTarget.getAttribute('src') !== sunset) event.currentTarget.src = sunset
  }} />
}

function useMediaSetting(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const media = matchMedia(query)
    const update = () => setMatches(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

function Ambient({ instance, playing, videoEnabled }: { instance: Instance; playing: boolean; videoEnabled: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const element = video.current
    if (!element) return
    let active = true
    if (playing && !failed) void element.play().catch(error => {
      if (active && !isPlaybackInterruption(error)) setFailed(true)
    })
    else element.pause()
    return () => { active = false; element.pause() }
  }, [playing, failed])
  return (
    <div className="ambient" aria-hidden="true">
      <img
        src={instance.image}
        alt=""
        onError={(event) => {
          event.currentTarget.onerror = null
          event.currentTarget.src = sunset
        }}
      />
      {instance.video && videoEnabled && (
        <video
          ref={video}
          src={instance.video}
          muted
          loop
          playsInline
          preload="metadata"
          poster={instance.image}
          onLoadedData={() => setReady(true)}
          onError={() => setFailed(true)}
          data-state={playing && !failed ? 'playing' : 'paused'}
          data-error={failed}
          style={{ opacity: ready && playing && !failed ? 1 : 0 }}
        />
      )}
    </div>
  )
}

function InstanceCard({
  instance,
  view,
  onManage,
  onPlay,
  onOptions,
  running,
  busy,
}: {
  instance: Instance
  view: 'grid' | 'list'
  onManage: (instance: Instance) => void
  onPlay: (instance: Instance) => void
  onOptions: (instance: Instance) => void
  running?: boolean
  busy?: boolean
}) {
  const { t } = useI18n()
  return (
    <article key={instance.id} data-instance-path={instance.id} className={`instance-card ${view === 'list' ? 'instance-row' : ''}`} onContextMenu={event => { event.preventDefault(); event.currentTarget.querySelector<HTMLButtonElement>('.instance-card-actions button:last-child')?.focus(); onOptions(instance) }} onKeyDown={event => {
      if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) { event.preventDefault(); onOptions(instance) }
    }}>
      <button
        className="instance-art"
        onClick={() => onManage(instance)}
        aria-label={`Administrar ${instance.name}`}
      >
        <StoredImage src={instance.image} alt="" loading="lazy" />
        <span className="art-shade" />
        <span className="runtime-tag">{instance.loader}</span>
      </button>
      <div className="instance-card-body">
        <div className="instance-identity">
          {instance.icon ? (
            <StoredImage src={instance.icon} alt="" />
          ) : (
            <Box size={22} aria-hidden="true" />
          )}
          <div>
            <h3>{instance.name}</h3>
            <p>Minecraft {instance.version}</p>
          </div>
        </div>
        <div className="instance-card-actions">
          <span className="ready">
            <span />
            {t(running ? 'react.launch.running' : busy ? 'react.launch.preparing' : 'react.instances.saved')}
          </span>
          <button
            className="icon-button"
            aria-label={`Jugar ${instance.name}`}
            onClick={() => onPlay(instance)}
            disabled={busy}
          >
            <Play size={17} fill="currentColor" />
          </button>
          <button
            className="icon-button"
            aria-label={`Opciones de ${instance.name}`}
            onClick={() => onOptions(instance)}
          >
            <MoreHorizontal size={19} />
          </button>
        </div>
      </div>
    </article>
  )
}

export function App() {
  const { t } = useI18n()
  const accounts = useAccounts()
  const savedLibrary = useLibrary()
  const launch = useLaunch()
  const instances = (savedLibrary?.status === 'ready' ? savedLibrary.instances : []).map(presentInstance)
  const location = useLocation()
  const navigate = useNavigate()
  const { preferences, set: setPreferences, error: preferencesError } = usePreferences()
  const systemDark = useMediaSetting('(prefers-color-scheme: dark)')
  const theme = preferences.appearance === 'system' ? systemDark ? 'dark' : 'light' : preferences.appearance
  const setTheme = (appearance: 'dark' | 'light' | 'system') => setPreferences({ appearance })
  const [featuredPath, setFeaturedPath] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [loader, setLoader] = useState('')
  const [group, setGroup] = useState('')
  const restoreFocus = useRef<HTMLElement | null>(null)
  const view = preferences.libraryView
  const setView = (libraryView: 'grid' | 'list') => setPreferences({ libraryView })
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const [paused, setPaused] = useState(false)
  const performanceMode = preferences.performanceMode
  const setPerformanceMode = (performanceMode: boolean) => setPreferences({ performanceMode })
  const [focused, setFocused] = useState(() => document.hasFocus())
  const [nativeActive, setNativeActive] = useState(true)
  const [visible, setVisible] = useState(() => !document.hidden)
  const [dialog, setDialog] = useState<{ title: string; message: string } | null>(null)
  const [showCredits, setShowCredits] = useState(false)
  const [adding, setAdding] = useState<'create' | 'import'>()
  const [operating, setOperating] = useState<SavedInstance>()
  const [managingGroups, setManagingGroups] = useState(false)
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('add')
    if (savedLibrary?.status === 'ready' && (requested === 'create' || requested === 'import')) {
      setAdding(requested)
      void navigate(location.pathname, { replace: true })
    }
  }, [location.search, savedLibrary?.status, navigate, location.pathname])
  const reducedMotion = useMediaSetting('(prefers-reduced-motion: reduce)')
  const current = instances.find(instance => instance.id === savedLibrary?.current?.path)
  const instance = instances.find(instance => instance.id === featuredPath) ?? current ?? instances[0]
  const featured = instances.findIndex(item => item.id === instance?.id)
  useEffect(() => {
    if (featuredPath === null && instance) setFeaturedPath(instance.id)
  }, [featuredPath, instance?.id])
  const home = location.pathname === '/'
  const library = location.pathname === '/me'
  const catalog = location.pathname.startsWith('/store')
  const settings = location.pathname === '/setting'
  const accountsPage = location.pathname === '/accounts'
  const title = home
    ? 'Inicio'
    : library
      ? 'Tu biblioteca'
      : catalog
        ? 'Descubrir'
        : settings
          ? 'Ajustes'
          : accountsPage ? t('react.accounts.title') : 'Tu instancia'
  const canMove = allowAmbientMotion({
    focused: focused && nativeActive,
    visible,
    reducedMotion,
    performanceMode,
    interacting: hovered || focusWithin,
    dialogOpen: !!dialog || showCredits || !!adding || !!operating || managingGroups || !!launch?.dialog || !!launch?.running.length,
    manuallyPaused: paused,
  })

  useEffect(() => {
    // Chromium automation can emulate DOM focus while the native window is minimized.
    const activity = (active: boolean) => setNativeActive(active)
    window.windowController?.on('window-active', activity)
    const focus = () => setFocused(true)
    const blur = () => setFocused(false)
    const visibility = () => setVisible(!document.hidden)
    window.addEventListener('focus', focus)
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.windowController?.removeListener('window-active', activity)
      window.removeEventListener('focus', focus)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.performance = String(performanceMode)
  }, [theme, performanceMode])
  useEffect(() => {
    if (!home || !canMove || !preferences.carouselEnabled || instances.length < 2) return
    const interval = window.setInterval(
      () => setFeaturedPath(instances[nextFeatured(featured, instances.length)].id),
      ROTATION_MS,
    )
    return () => clearInterval(interval)
  }, [home, canMove, preferences.carouselEnabled, featured, savedLibrary?.data])
  const preview = (
    title: string,
    message = t('react.instances.featurePending'),
  ) => {
    restoreFocus.current = document.activeElement as HTMLElement
    setDialog({ title, message })
  }
  const openCredits = () => {
    restoreFocus.current = document.activeElement as HTMLElement
    setShowCredits(true)
  }
  const matchesInstance = (instance: Instance) =>
    instance.name.toLowerCase().includes(query.toLowerCase()) &&
    (!loader || instance.loader === loader) &&
    (!group || (group === 'ungrouped' ? !savedLibrary?.data?.groups.some(entry => typeof entry !== 'string' && entry.instances.includes(instance.id)) : savedLibrary?.data?.groups.some(entry => typeof entry !== 'string' && `id:${entry.id}` === group && entry.instances.includes(instance.id))))
  const matchingProjects = projects.filter((project) =>
    `${project.title} ${project.description}`.toLowerCase().includes(query.toLowerCase()),
  )
  useEffect(() => {
    setQuery('')
    setLoader('')
    setGroup('')
  }, [location.pathname])
  const play = (instance: Instance) => {
    if (!savedLibrary?.select(instance.id)) return
    restoreFocus.current = document.activeElement as HTMLElement
    const selected = accounts?.selected
    launch?.store.open(instance.id, instance.name, selected && accounts.profile ? { userId: selected.id, profileId: accounts.profile.id, name: accounts.profile.name } : undefined)
  }
  const changeFeatured = (direction: number) => {
    setPaused(true)
    if (instances.length) setFeaturedPath(instances[nextFeatured(featured, instances.length, direction)].id)
  }
  const manage = (item: Instance) => {
    if (savedLibrary?.select(item.id)) navigate('/instance')
  }
  const openCreation = (mode: 'create' | 'import' = 'create') => {
    restoreFocus.current = document.activeElement as HTMLElement
    setAdding(mode)
  }
  const openOptions = (item: Instance) => {
    const captured = savedLibrary?.instances.find(instance => instance.path === item.id)
    if (!captured) return
    restoreFocus.current = document.activeElement as HTMLElement
    setOperating(captured)
  }
  const libraryState = !savedLibrary || savedLibrary.status !== 'ready' || !instances.length ? (
    <div className="empty" role={!savedLibrary || savedLibrary.status === 'error' ? 'alert' : 'status'} data-testid="library-state">
      <Box size={28} aria-hidden="true" />
      <h2>{t(!savedLibrary ? 'react.instances.runtimeRequired' : savedLibrary.status === 'loading' ? 'react.instances.loading' : savedLibrary.status === 'error' ? 'react.instances.loadError' : 'react.instances.empty')}</h2>
      {savedLibrary?.status === 'error' ? <button className="button secondary" disabled={savedLibrary.validating} onClick={() => void savedLibrary.retry()}>{t('react.instances.retry')}</button> : savedLibrary?.status === 'ready' && <p>{t('react.instances.emptyHelp')}</p>}
      {savedLibrary?.status === 'ready' && <div className="empty-actions"><button className="button primary" onClick={() => openCreation('create')}>{t('react.create.create')}</button><button className="button secondary" onClick={() => openCreation('import')}>{t('react.create.import')}</button></div>}
    </div>
  ) : null

  return (
    <div className="app" data-testid="react-prototype" data-performance={performanceMode} data-motion-state={JSON.stringify({ focused, nativeActive, visible, reducedMotion, hovered, focusWithin, paused, gameRunning: !!launch?.running.length })}>
      <div
        className="app-backdrop"
        data-testid="app-backdrop"
        aria-hidden="true"
        style={{ backgroundImage: `url(${JSON.stringify((home ? instance?.image : current?.image) ?? sunset)}), url(${JSON.stringify(sunset)})` }}
      />
      <header className="titlebar">
        <div className="titlebar-left">
          <img className="titlebar-logo" src={brandIcon} alt="" />
          <span>Grimo Launcher</span>
          <span className="preview-label">{accountsPage ? t('react.accounts.saved') : catalog ? 'Vista previa · datos de ejemplo' : t('react.instances.connected')}</span>
        </div>
        <div className="window-controls">
          <button
            aria-label="Minimizar"
            disabled={!window.windowController}
            onClick={() => window.windowController?.minimize()}
          >
            <Minus size={15} />
          </button>
          <button
            aria-label="Maximizar"
            disabled={!window.windowController}
            onClick={() => window.windowController?.maximize()}
          >
            <Maximize2 size={13} />
          </button>
          <button
            aria-label="Cerrar"
            disabled={!window.windowController}
            onClick={() => window.windowController?.close()}
          >
            <X size={17} />
          </button>
        </div>
      </header>
      <aside className="sidebar" data-testid="app-sidebar">
        <Link to="/" className="brand" aria-label="Grimo Launcher, Inicio">
          <span className="brand-mark">
            <img src={brandIcon} width="40" height="40" alt="" />
          </span>
          <span>
            Grimo<span className="brand-launcher">Launcher</span>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Navegación principal">
          {[
            { to: '/', label: t('react.home'), Icon: Home, testId: 'nav-home' },
            { to: '/me', label: t('react.library'), Icon: Layers, testId: 'nav-library' },
            { to: '/store', label: t('react.discover'), Icon: Compass, testId: 'nav-store' },
          ].map(({ to, label, Icon, testId }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={label}
              data-testid={testId}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={21} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-instance">
          <span className="sidebar-caption">Instancia seleccionada</span>
          <button onClick={() => navigate('/instance')} title={current?.name} disabled={!current}>
            <Box size={20} />
            <span>
              <strong>{current?.name ?? t('react.instances.noneSelected')}</strong>
              <small>
                {current ? `${current.version} · ${current.loader}` : t('react.instances.choose')}
              </small>
            </span>
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <NavLink
            to="/setting"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title="Ajustes"
            data-testid="nav-settings"
          >
            <Settings size={21} />
            <span>Ajustes</span>
          </NavLink>
          <button
            className="account"
            title={t('react.accounts.title')}
            data-testid="nav-accounts"
            onClick={() => navigate('/accounts')}
          >
            <span className="avatar">
              <UserRound size={20} />
            </span>
            <span>
              <strong>{accounts ? accounts.profile?.name ?? t('react.accounts.noneSelected') : 'Jugador'}</strong>
              <small>{accounts ? t('react.accounts.title') : 'Perfil local'}</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="page-toolbar">
          <div className="history">
            <button className="icon-button" aria-label="Atrás" onClick={() => navigate(-1)}>
              <ChevronLeft size={20} />
            </button>
            <span>{title}</span>
          </div>
          <div className="toolbar-actions">
            <button
              className="icon-button"
              aria-label={theme === 'dark' ? 'Usar apariencia clara' : 'Usar apariencia oscura'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="icon-button"
              aria-label="Tareas"
              onClick={() =>
                preview(
                  'No hay tareas en curso',
                  'Las instalaciones y descargas aparecerán aquí. Esta vista previa no descarga archivos del juego.',
                )
              }
            >
              <ArrowDownToLine size={19} />
            </button>
            <button
              className="icon-button"
              aria-label="Notificaciones"
              onClick={() => preview('Todo al día', 'No hay notificaciones en esta vista previa.')}
            >
              <Bell size={19} />
            </button>
          </div>
        </div>
        <div className="page-scroll">
          {(home || library) && savedLibrary?.storageError && <p role="alert">{t('react.instances.storageError')}</p>}
          {(home || library) && savedLibrary?.path && savedLibrary.status === 'ready' && !current && !!instances.length && <p role="status">{t('react.instances.missingSelection')} <Link to="/me">{t('react.instances.choose')}</Link></p>}
          {home && (
            <div className="home-page">
              <div className="page-heading">
                <div>
                  <h1>El siguiente capítulo es tuyo.</h1>
                  <p>Vuelve a tu mundo o encuentra una nueva aventura.</p>
                </div>
              </div>
              {libraryState}
              {instance && <section
                className="featured"
                aria-label="Instancia destacada"
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onFocusCapture={() => setFocusWithin(true)}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node))
                    setFocusWithin(false)
                }}
              >
                <Ambient key={`${instance.id}-${instance.image}-${instance.video}-${preferences.backgroundVideoEnabled}`} instance={instance} playing={canMove} videoEnabled={preferences.backgroundVideoEnabled} />
                <div className="featured-shade" />
                <div className="featured-copy">
                  <div className="featured-runtime">
                    <span>
                      <span className="status-dot" />
                      {t(launch?.running.some(process => process.path === instance.id) ? 'react.launch.running' : 'react.instances.saved')}
                    </span>
                    <span>
                      {instance.loader} · {instance.version}
                    </span>
                  </div>
                  <h2>{instance.name}</h2>
                  <p>{instance.description || t('react.instances.description')}</p>
                  {instance.ambientFallback && <p>{t('react.instances.ambient')}</p>}
                  <div className="featured-actions">
                    <button
                      className="button primary"
                      data-testid="featured-play"
                      onClick={() => play(instance)}
                      disabled={launch?.phase === 'preparing'}
                    >
                      <Play size={19} fill="currentColor" />
                      {t(launch?.running.some(process => process.path === instance.id) ? 'react.launch.view' : 'react.launch.play')}
                    </button>
                    <button
                      className="button on-art"
                      onClick={() => manage(instance)}
                    >
                      Administrar
                      <ArrowRight size={17} />
                    </button>
                  </div>
                </div>
                <div className="carousel-footer">
                  <span>
                    {String(featured + 1).padStart(2, '0')}
                    <span> / {String(instances.length).padStart(2, '0')}</span>
                  </span>
                  <div className="carousel-controls">
                    <button
                      className="icon-button"
                      aria-label="Instancia anterior"
                      onClick={() => changeFeatured(-1)} disabled={instances.length < 2}
                    >
                      <ChevronLeft size={19} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={paused ? 'Reanudar presentación' : 'Pausar presentación'}
                      onClick={() => setPaused(!paused)} disabled={instances.length < 2}
                    >
                      {paused ? <Play size={16} /> : <Pause size={16} />}
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Siguiente instancia"
                      onClick={() => changeFeatured(1)} disabled={instances.length < 2}
                    >
                      <ChevronRight size={19} />
                    </button>
                  </div>
                </div>
              </section>}
              {!!instances.length && <section className="recent-section">
                <div className="section-heading">
                  <h2>Tus mundos, a un paso</h2>
                  <Link to="/me">
                    Ver biblioteca
                    <ArrowRight size={15} />
                  </Link>
                </div>
                <div className="instance-grid">
                  {instances.map((instance) => (
                    <InstanceCard
                      key={instance.id}
                      instance={instance}
                      running={launch?.running.some(process => process.path === instance.id)}
                      busy={launch?.phase === 'preparing'}
                      view="grid"
                      onPlay={play}
                      onManage={manage}
                      onOptions={openOptions}
                    />
                  ))}
                </div>
              </section>}
            </div>
          )}
          {library && (
            <section className="library-page">
              <div className="page-heading">
                <div>
                  <h1>Tu biblioteca</h1>
                  <p>{t('react.instances.subtitle')}</p>
                </div>
                <div className="operation-order"><button className="button secondary" data-testid="library-groups" disabled={savedLibrary?.status !== 'ready'} onClick={event => { restoreFocus.current = event.currentTarget; setManagingGroups(true) }}><Layers size={18} aria-hidden="true" />{t('react.groups.title')}</button><button
                  className="button primary"
                  onClick={() => openCreation('create')}
                  disabled={savedLibrary?.status !== 'ready'}
                  data-testid="library-create-instance"
                >
                  <Plus size={18} />
                  Añadir instancia
                </button></div>
              </div>
              {libraryState}
              <div className="filterbar">
                <label className="search">
                  <Search size={18} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar una instancia…"
                    aria-label="Buscar instancias"
                  />
                </label>
                <select
                  aria-label="Filtrar por loader"
                  value={loader}
                  onChange={(event) => setLoader(event.target.value)}
                >
                  <option value="">Todos los loaders</option>
                  {[...new Set(instances.map(instance => instance.loader))].sort().map(name => <option key={name}>{name}</option>)}
                </select>
                <div className="view-switch">
                  <button
                    className="icon-button"
                    aria-label="Vista cuadrícula"
                    aria-pressed={view === 'grid'}
                    onClick={() => setView('grid')}
                  >
                    <Grid2X2 size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Vista lista"
                    aria-pressed={view === 'list'}
                    onClick={() => setView('list')}
                  >
                    <List size={19} />
                  </button>
                </div>
                <select aria-label={t('react.operations.sort')} value={savedLibrary?.sort || 'manual'} onChange={event => savedLibrary?.setSort(event.target.value)}>
                  {['manual', 'name', 'recent'].map(order => <option key={order} value={order}>{t(`react.operations.sort${order}`)}</option>)}
                </select>
                <select aria-label={t('react.operations.filterGroup')} value={group} onChange={event => setGroup(event.target.value)}>
                  <option value="">{t('react.operations.allGroups')}</option>
                  <option value="ungrouped">{t('react.operations.ungrouped')}</option>
                  {(savedLibrary?.data?.groups || []).flatMap(group => typeof group === 'string' ? [] : [<option key={group.id} value={`id:${group.id}`}>{group.name}</option>])}
                </select>
              </div>
              <div className={`instance-grid ${view === 'list' ? 'list-view' : ''}`}>
                {(savedLibrary?.ordered || []).map(presentInstance).filter(matchesInstance).map((instance) => (
                  <InstanceCard
                    key={instance.id}
                    instance={instance}
                    running={launch?.running.some(process => process.path === instance.id)}
                    busy={launch?.phase === 'preparing'}
                    view={view}
                    onPlay={play}
                    onManage={manage}
                    onOptions={openOptions}
                  />
                ))}
              </div>
              {!!instances.length && !instances.some(matchesInstance) && (
                <div className="empty">
                  <Search size={28} />
                  <h2>No encontramos esa instancia</h2>
                  <p>Prueba otro nombre o limpia los filtros.</p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setQuery('')
                      setLoader('')
                      setGroup('')
                    }}
                  >
                    Limpiar búsqueda
                  </button>
                </div>
              )}
            </section>
          )}
          {catalog && (
            <section className="catalog-page">
              <div className="page-heading">
                <div>
                  <h1>Dale otra vida a tu mundo.</h1>
                  <p>Encuentra mods, modpacks y nuevas formas de explorar.</p>
                </div>
              </div>
              <div
                className="catalog-banner"
                style={{
                  backgroundImage: `linear-gradient(90deg, #111923ed, #11192355), url(${ocean})`,
                }}
              >
                <div>
                  <h2>
                    Pequeños cambios.
                    <br />
                    Grandes aventuras.
                  </h2>
                  <p>Elige contenido para hacer Minecraft más tuyo.</p>
                </div>
                <Compass size={64} strokeWidth={1} aria-hidden="true" />
              </div>
              <div className="filterbar">
                <label className="search">
                  <Search size={18} />
                  <input
                    placeholder="Buscar contenido…"
                    aria-label="Buscar en el catálogo"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    data-testid="store-search"
                  />
                </label>
                <button
                  className="button secondary"
                  onClick={() =>
                    preview(
                      'Filtrar contenido',
                      'Versión de Minecraft, loader, tipo de contenido y fuente. En el prototipo se muestran proyectos de ejemplo de Modrinth.',
                    )
                  }
                >
                  <SlidersHorizontal size={17} />
                  Filtros
                </button>
              </div>
              <div className="source-tabs">
                <button aria-pressed="true">Modrinth</button>
                <button
                  aria-pressed="false"
                  onClick={() =>
                    preview(
                      'CurseForge',
                      'La búsqueda real se conectará al proxy actual. No se modifica ni se solicita tu API key.',
                    )
                  }
                >
                  CurseForge
                </button>
              </div>
              <div className="catalog-grid">
                {matchingProjects.map((project) => (
                  <article key={project.id} className="project-card">
                    <button
                      className="project-art"
                      onClick={() => preview(project.title, project.description)}
                    >
                      <img
                        src={
                          project.gallery.find((image) => image.featured)?.url ??
                          project.gallery[0]?.url ??
                          sunset
                        }
                        alt={`Ver ${project.title}`}
                        loading="lazy"
                      />
                    </button>
                    <div className="project-card-copy">
                      <img src={project.icon} alt="" />
                      <div>
                        <span className="project-kind">
                          {project.projectType === 'modpack' ? 'Modpack' : 'Mod'}
                        </span>
                        <h2>{project.title}</h2>
                      </div>
                    </div>
                    <p>{project.description}</p>
                    <button
                      className="button secondary full-width"
                      onClick={() => preview(project.title, project.description)}
                    >
                      Ver contenido
                      <ArrowRight size={16} />
                    </button>
                  </article>
                ))}
              </div>
              {matchingProjects.length === 0 && (
                <div className="empty">
                  <Search size={28} aria-hidden="true" />
                  <h2>No encontramos ese contenido</h2>
                  <p>Prueba otro nombre o vuelve a los proyectos de ejemplo.</p>
                  <button className="button secondary" onClick={() => setQuery('')}>
                    Limpiar búsqueda
                  </button>
                </div>
              )}
            </section>
          )}
          {settings && (
            <section className="settings-page">
              <div className="page-heading">
                <div>
                  <h1>A tu manera.</h1>
                  <p>Un launcher que se adapta a cómo juegas.</p>
                </div>
              </div>
              <div className="settings-group">
                <h2>Apariencia y rendimiento</h2>
                {preferencesError && <p role="status">{preferencesError === 'newer-version'
                  ? 'Tus preferencias pertenecen a una versión más reciente. Los cambios se aplicarán solo en esta ventana.'
                  : 'No se pudieron recuperar o guardar todas tus preferencias. Puedes seguir usando el launcher y cambiar estos ajustes.'}</p>}
                <div className="setting-row">
                  <div>
                    <strong>{t('react.appearance')}</strong>
                    <p>La misma interfaz, con otra luz.</p>
                  </div>
                  <select
                    aria-label={t('react.appearance')}
                    value={preferences.appearance}
                    onChange={(event) => setTheme(event.target.value as 'dark' | 'light' | 'system')}
                  >
                    <option value="system">{t('react.system')}</option>
                    <option value="dark">{t('react.dark')}</option>
                    <option value="light">{t('react.light')}</option>
                  </select>
                </div>
                <div className="setting-row">
                  <div><strong>{t('react.ambientVideo')}</strong><p>Reproduce los vídeos disponibles cuando la ventana esté activa.</p></div>
                  <input type="checkbox" aria-label={t('react.ambientVideo')} checked={preferences.backgroundVideoEnabled} onChange={event => setPreferences({ backgroundVideoEnabled: event.target.checked })} />
                </div>
                <div className="setting-row">
                  <div><strong>{t('react.carousel')}</strong><p>Alterna la instancia destacada mientras no estés interactuando.</p></div>
                  <input type="checkbox" aria-label={t('react.carousel')} checked={preferences.carouselEnabled} onChange={event => setPreferences({ carouselEnabled: event.target.checked })} />
                </div>
                <div className="setting-row">
                  <div>
                    <strong>{t('react.performance')}</strong>
                    <p>
                      Utiliza imágenes estáticas, detiene la presentación y desactiva el desenfoque.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    aria-label={t('react.performance')}
                    checked={performanceMode}
                    onChange={(event) => setPerformanceMode(event.target.checked)}
                  />
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Recursos visuales</strong>
                    <p>Autores, fuentes y licencias de las imágenes y vídeos.</p>
                  </div>
                  <button className="button secondary" onClick={openCredits}>
                    Ver créditos
                  </button>
                </div>
              </div>
            </section>
          )}
          {accountsPage && <Accounts />}
          {!home && !library && !catalog && !settings && !accountsPage && !current && <div className="empty" role="status"><h1>{t('react.instances.noneSelected')}</h1><Link className="button secondary" to="/me">{t('react.instances.choose')}</Link></div>}
          {!home && !library && !catalog && !settings && !accountsPage && current && (
            <section className="instance-page">
              <div className="page-heading">
                <div>
                  <h1>{current.name}</h1>
                  <p>
                    Minecraft {current.version} · {current.loader}
                  </p>
                </div>
                <button className="button primary" disabled={launch?.phase === 'preparing'} onClick={() => play(current)}>
                  <Play size={18} fill="currentColor" />
                    {t(launch?.running.some(process => process.path === current.id) ? 'react.launch.view' : 'react.launch.play')}
                </button>
              </div>
              <div className="instance-tabs">
                {['Resumen', 'Mods', 'Packs', 'Shaders', 'Mundos', 'Ajustes', 'Consola'].map(
                  (label) => (
                    <button key={label} onClick={() => preview(label)}>
                      {label}
                    </button>
                  ),
                )}
              </div>
              <StoredImage className="instance-cover" src={current.image} alt="" />
              <div className="section-heading">
                <h2>Tu próxima aventura empieza aquí.</h2>
                <button
                  className="button secondary"
                  onClick={() => preview('Carpeta de instancia')}
                >
                  <FolderOpen size={17} />
                  Abrir carpeta
                </button>
                <button className="button secondary" onClick={() => preview('Consola')}>
                  <Terminal size={17} />
                  Consola
                </button>
              </div>
            </section>
          )}
          <footer className="page-footer">
            <span>
              <Check size={13} />
              Minecraft Java, a tu manera.
            </span>
            <button onClick={openCredits}>Créditos visuales</button>
          </footer>
        </div>
      </main>
      {launch && <LaunchDialog launch={launch} returnFocus={restoreFocus} />}
      {managingGroups && <GroupsDialog returnFocus={restoreFocus} onClose={() => setManagingGroups(false)} onRemoved={id => { if (group === `id:${id}`) setGroup('') }} />}
      {operating && <InstanceOperations key={operating.path} instance={operating} onClose={() => setOperating(undefined)} returnFocus={restoreFocus} onCreated={path => {
        if (savedLibrary?.select(path)) void navigate('/instance')
      }} />}
      {savedLibrary && <AddInstance open={!!adding} initialMode={adding ?? 'create'} onClose={() => setAdding(undefined)} returnFocus={restoreFocus} onCreated={path => {
        setAdding(undefined)
        if (savedLibrary.select(path)) void navigate('/instance')
        else void navigate('/me')
      }} />}
      <Dialog.Root
        open={!!dialog || showCredits}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null)
            setShowCredits(false)
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-backdrop" />
          <Dialog.Content
            className="dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              restoreFocus.current?.focus()
            }}
          >
            <Dialog.Title>{showCredits ? 'Créditos visuales' : dialog?.title}</Dialog.Title>
            <Dialog.Description>
              {showCredits
                ? 'Material de Minecraft obtenido de sus fuentes, con atribución a sus autores. Grimo Launcher no está afiliado con Mojang ni Microsoft.'
                : dialog?.message}
            </Dialog.Description>
            {showCredits && (
              <ul className="credits-list">
                {credits.map((credit) => (
                  <li key={credit.file}>
                    <strong>{credit.title}</strong>
                    <span>
                      {credit.author} ·{' '}
                      <a href={credit.licenseUrl} target="_blank" rel="noreferrer">
                        {credit.license}
                      </a>
                    </span>
                    <span>{credit.changes}</span>
                    <a href={credit.source} target="_blank" rel="noreferrer">
                      Ver fuente
                      <ExternalLink size={13} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <Dialog.Close className="button primary">Entendido</Dialog.Close>
            <Dialog.Close className="icon-button dialog-close" aria-label="Cerrar diálogo">
              <X size={19} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
