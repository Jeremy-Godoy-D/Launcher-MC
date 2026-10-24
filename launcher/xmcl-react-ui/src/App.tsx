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
import sunset from './assets/ambient/vanilla-shaders.webp'
import caves from './assets/ambient/vanilla-caves.webp'
import cavesVideo from './assets/ambient/vanilla-caves.mp4'
import ocean from './assets/ambient/vanilla-ocean.webp'
import credits from './assets/ambient/credits.json'
import { allowAmbientMotion, nextFeatured, ROTATION_MS } from './presentation'

declare global {
  interface Window {
    windowController?: {
      minimize(): void
      maximize(): void
      close(): void
      on(channel: 'window-active', listener: (active: boolean) => void): unknown
      removeListener(channel: 'window-active', listener: (active: boolean) => void): unknown
    }
  }
}

const optimized = projects[0]
const instances = [
  {
    id: 'vanilla',
    name: 'Mi mundo',
    version: '1.21.1',
    loader: 'Vanilla',
    image: sunset,
    icon: '',
    description: 'Un refugio entre montañas. Una aventura que continúa.',
    video: undefined as string | undefined,
  },
  {
    id: 'optimized',
    name: optimized.title,
    version: '1.21.1',
    loader: 'Fabric',
    image: optimized.gallery.find((image) => image.featured)?.url ?? sunset,
    icon: optimized.icon,
    description: 'Tu Minecraft de siempre, preparado para ir más lejos.',
    video: undefined as string | undefined,
  },
  {
    id: 'exploration',
    name: 'Bajo la superficie',
    version: '1.20.4',
    loader: 'Vanilla',
    image: caves,
    icon: '',
    description: 'Hay todo un mundo esperando al otro lado de la luz.',
    video: cavesVideo,
  },
]
type Instance = (typeof instances)[number]

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

function Ambient({ instance, playing }: { instance: Instance; playing: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const element = video.current
    if (!element) return
    if (playing && !failed) void element.play().catch(() => setFailed(true))
    else element.pause()
    return () => element.pause()
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
      {instance.video && (
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
}: {
  instance: Instance
  view: 'grid' | 'list'
  onManage: (instance: Instance) => void
  onPlay: (instance: Instance) => void
  onOptions: (instance: Instance) => void
}) {
  return (
    <article key={instance.id} className={`instance-card ${view === 'list' ? 'instance-row' : ''}`}>
      <button
        className="instance-art"
        onClick={() => onManage(instance)}
        aria-label={`Administrar ${instance.name}`}
      >
        <img src={instance.image} alt="" loading="lazy" />
        <span className="art-shade" />
        <span className="runtime-tag">{instance.loader}</span>
      </button>
      <div className="instance-card-body">
        <div className="instance-identity">
          {instance.icon ? (
            <img src={instance.icon} alt="" />
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
            Lista para jugar
          </span>
          <button
            className="icon-button"
            aria-label={`Jugar ${instance.name}`}
            onClick={() => onPlay(instance)}
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
  const location = useLocation()
  const navigate = useNavigate()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [featured, setFeatured] = useState(0)
  const [selected, setSelected] = useState('vanilla')
  const [query, setQuery] = useState('')
  const [loader, setLoader] = useState('')
  const restoreFocus = useRef<HTMLElement | null>(null)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const [paused, setPaused] = useState(false)
  const [performanceMode, setPerformanceMode] = useState(false)
  const [focused, setFocused] = useState(() => document.hasFocus())
  const [nativeActive, setNativeActive] = useState(true)
  const [visible, setVisible] = useState(() => !document.hidden)
  const [dialog, setDialog] = useState<{ title: string; message: string } | null>(null)
  const [showCredits, setShowCredits] = useState(false)
  const reducedMotion = useMediaSetting('(prefers-reduced-motion: reduce)')
  const instance = instances[featured]
  const current = instances.find((instance) => instance.id === selected)!
  const home = location.pathname === '/'
  const library = location.pathname === '/me'
  const catalog = location.pathname.startsWith('/store')
  const settings = location.pathname === '/setting'
  const title = home
    ? 'Inicio'
    : library
      ? 'Tu biblioteca'
      : catalog
        ? 'Descubrir'
        : settings
          ? 'Ajustes'
          : 'Tu instancia'
  const canMove = allowAmbientMotion({
    focused: focused && nativeActive,
    visible,
    reducedMotion,
    performanceMode,
    interacting: hovered || focusWithin,
    dialogOpen: !!dialog || showCredits,
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
    if (!home || !canMove) return
    const interval = window.setInterval(
      () => setFeatured((index) => nextFeatured(index, instances.length)),
      ROTATION_MS,
    )
    return () => clearInterval(interval)
  }, [home, canMove])
  const preview = (
    title: string,
    message = 'Esta vista previa utiliza datos de ejemplo. La conexión a tus instancias se implementará después de revisar el diseño.',
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
    (!loader || instance.loader === loader)
  const matchingProjects = projects.filter((project) =>
    `${project.title} ${project.description}`.toLowerCase().includes(query.toLowerCase()),
  )
  useEffect(() => {
    setQuery('')
    setLoader('')
  }, [location.pathname])
  const play = (instance: Instance) => {
    setSelected(instance.id)
    preview(
      `Jugar: ${instance.name}`,
      `Se ha seleccionado «${instance.name}» en la vista previa. No se inicia Minecraft ni se modifican tus archivos.`,
    )
  }
  const changeFeatured = (direction: number) => {
    setPaused(true)
    setFeatured((index) => nextFeatured(index, instances.length, direction))
  }

  return (
    <div className="app" data-testid="react-prototype" data-performance={performanceMode}>
      <div
        className="app-backdrop"
        data-testid="app-backdrop"
        aria-hidden="true"
        style={{ backgroundImage: `url(${home ? instance.image : current.image})` }}
      />
      <header className="titlebar">
        <div className="titlebar-left">
          <Box size={15} />
          <span>Launcher MC</span>
          <span className="preview-label">Vista previa · datos de ejemplo</span>
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
        <Link to="/" className="brand" aria-label="Launcher MC, Inicio">
          <span className="brand-mark">
            <Box size={28} strokeWidth={1.7} />
          </span>
          <span>
            Launcher<span className="brand-mc">MC</span>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Navegación principal">
          {[
            { to: '/', label: 'Inicio', Icon: Home, id: 'nav-home' },
            { to: '/me', label: 'Biblioteca', Icon: Layers, id: 'nav-library' },
            { to: '/store', label: 'Descubrir', Icon: Compass, id: 'nav-store' },
          ].map(({ to, label, Icon, id }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={label}
              data-testid={id}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={21} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-instance">
          <span className="sidebar-caption">Instancia seleccionada</span>
          <button onClick={() => navigate('/instance')} title={current.name}>
            <Box size={20} />
            <span>
              <strong>{current.name}</strong>
              <small>
                {current.version} · {current.loader}
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
            title="Cuenta local"
            onClick={() => preview('Tu cuenta local')}
          >
            <span className="avatar">
              <UserRound size={20} />
            </span>
            <span>
              <strong>Jugador</strong>
              <small>Perfil local</small>
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
          {home && (
            <div className="home-page">
              <div className="page-heading">
                <div>
                  <h1>El siguiente capítulo es tuyo.</h1>
                  <p>Vuelve a tu mundo o encuentra una nueva aventura.</p>
                </div>
              </div>
              <section
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
                <Ambient key={instance.id} instance={instance} playing={canMove} />
                <div className="featured-shade" />
                <div className="featured-copy">
                  <div className="featured-runtime">
                    <span>
                      <span className="status-dot" />
                      Lista para jugar
                    </span>
                    <span>
                      {instance.loader} · {instance.version}
                    </span>
                  </div>
                  <h2>{instance.name}</h2>
                  <p>{instance.description}</p>
                  <div className="featured-actions">
                    <button
                      className="button primary"
                      data-testid="featured-play"
                      onClick={() => play(instance)}
                    >
                      <Play size={19} fill="currentColor" />
                      Jugar
                    </button>
                    <button
                      className="button on-art"
                      onClick={() => {
                        setSelected(instance.id)
                        navigate('/instance')
                      }}
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
                      onClick={() => changeFeatured(-1)}
                    >
                      <ChevronLeft size={19} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={paused ? 'Reanudar presentación' : 'Pausar presentación'}
                      onClick={() => setPaused(!paused)}
                    >
                      {paused ? <Play size={16} /> : <Pause size={16} />}
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Siguiente instancia"
                      onClick={() => changeFeatured(1)}
                    >
                      <ChevronRight size={19} />
                    </button>
                  </div>
                </div>
              </section>
              <section className="recent-section">
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
                      view="grid"
                      onPlay={play}
                      onManage={(item) => {
                        setSelected(item.id)
                        navigate('/instance')
                      }}
                      onOptions={(item) => preview(`Opciones de ${item.name}`)}
                    />
                  ))}
                </div>
              </section>
            </div>
          )}
          {library && (
            <section className="library-page">
              <div className="page-heading">
                <div>
                  <h1>Tu biblioteca</h1>
                  <p>Tres formas de volver a Minecraft.</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => preview('Añadir instancia')}
                  data-testid="library-create-instance"
                >
                  <Plus size={18} />
                  Añadir instancia
                </button>
              </div>
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
                  <option>Vanilla</option>
                  <option>Fabric</option>
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
              </div>
              <div className={`instance-grid ${view === 'list' ? 'list-view' : ''}`}>
                {instances.filter(matchesInstance).map((instance) => (
                  <InstanceCard
                    key={instance.id}
                    instance={instance}
                    view={view}
                    onPlay={play}
                    onManage={(item) => {
                      setSelected(item.id)
                      navigate('/instance')
                    }}
                    onOptions={(item) => preview(`Opciones de ${item.name}`)}
                  />
                ))}
              </div>
              {!instances.some(matchesInstance) && (
                <div className="empty">
                  <Search size={28} />
                  <h2>No encontramos esa instancia</h2>
                  <p>Prueba otro nombre o limpia los filtros.</p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setQuery('')
                      setLoader('')
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
                <div className="setting-row">
                  <div>
                    <strong>Apariencia</strong>
                    <p>La misma interfaz, con otra luz.</p>
                  </div>
                  <select
                    aria-label="Apariencia"
                    value={theme}
                    onChange={(event) => setTheme(event.target.value as 'dark' | 'light')}
                  >
                    <option value="dark">Oscura</option>
                    <option value="light">Clara</option>
                  </select>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Modo rendimiento</strong>
                    <p>
                      Utiliza imágenes estáticas, detiene la presentación y desactiva el desenfoque.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    aria-label="Modo rendimiento"
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
          {!home && !library && !catalog && !settings && (
            <section className="instance-page">
              <div className="page-heading">
                <div>
                  <h1>{current.name}</h1>
                  <p>
                    Minecraft {current.version} · {current.loader}
                  </p>
                </div>
                <button className="button primary" onClick={() => play(current)}>
                  <Play size={18} fill="currentColor" />
                  Jugar
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
              <img className="instance-cover" src={current.image} alt="" />
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
                ? 'Material de Minecraft obtenido de sus fuentes, con atribución a sus autores. Launcher MC no está afiliado con Mojang ni Microsoft.'
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
