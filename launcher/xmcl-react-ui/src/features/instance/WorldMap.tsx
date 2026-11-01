import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Clipboard,
  Copy,
  Crosshair,
  Grid,
  Layers,
  RefreshCw,
  Sliders,
  Trash2,
  X,
} from 'lucide-react'
import { InstanceSavesServiceKey } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import type { SaveChunkChange, SaveRegionInfo } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import { useService } from '../../runtime'
import { useI18n } from '../../i18n'
import { useSavesChunkClipboard } from './savesChunkClipboard'
import { ChunkBackups, ChunkChangesDialog } from './ChunkChangesDialog'

const EMPTY_REGIONS: SaveRegionInfo[] = []

export function WorldMap({
  savePath,
  running,
}: {
  savePath: string
  running: boolean
}) {
  const service = useService(InstanceSavesServiceKey)
  const { t, n } = useI18n()
  const [clipboard, setClipboard] = useSavesChunkClipboard()

  const [dimensions, setDimensions] = useState<string[]>([])
  const [dimension, setDimension] = useState<string>('minecraft:overworld')
  const [regionState, setRegionState] = useState<{ key: string; rows: SaveRegionInfo[] }>({ key: '', rows: [] })
  const [loading, setLoading] = useState(true)
  const [renderingCount, setRenderingCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // Camera & view controls
  const [showGrid, setShowGrid] = useState(true)
  const [renderHeight, setRenderHeight] = useState(320)
  const [scale, setScale] = useState(0.5) // pixels per block
  const [center, setCenter] = useState<{ x: number; z: number }>({ x: 0, z: 0 })

  // Selection & operations
  const [selectedChunks, setSelectedChunks] = useState<Set<string>>(new Set())
  const [change, setChange] = useState<SaveChunkChange | null>(null)
  const [revision, setRevision] = useState(0)
  const sourceKey = `${savePath}:${dimension}:${revision}`
  const regions = regionState.key === sourceKey ? regionState.rows : EMPTY_REGIONS
  const [copying, setCopying] = useState(false), copyPending = useRef(false), statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [goX, setGoX] = useState('0'), [goZ, setGoZ] = useState('0')
  useEffect(() => () => clearTimeout(statusTimer.current), [])
  const returnTo = useRef<HTMLElement | null>(null)
  const changed = (complete = false) => { setSelectedChunks(new Set()); setRevision(value => value + 1); if (complete) { clearTimeout(statusTimer.current); setStatusMessage(t('react.chunkChanges.done')) } }
  const openChange = (value: SaveChunkChange) => { returnTo.current = document.activeElement as HTMLElement; setChange(value) }

  // Dragging state
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef<{ clientX: number; clientY: number; centerX: number; centerZ: number } | null>(null)
  const [ctrlHeld, setCtrlHeld] = useState(false)
  const [shiftHeld, setShiftHeld] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const tileCacheRef = useRef<Map<string, ImageBitmap>>(new Map())
  const fetchingRegionsRef = useRef<Set<string>>(new Set())
  const failedRegionsRef = useRef<Set<string>>(new Set())
  const generation = useRef(0), alive = useRef(true), activeRegion = useRef(false), drawRef = useRef<() => void>(() => {})
  const [zoomLimited, setZoomLimited] = useState(false)
  const invalidate = useCallback(() => {
    generation.current++
    for (const bitmap of tileCacheRef.current.values()) bitmap.close()
    tileCacheRef.current.clear(); failedRegionsRef.current.clear()
  }, [])
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; invalidate() } }, [invalidate])
  useLayoutEffect(() => { invalidate() }, [savePath, dimension, renderHeight, revision, running, invalidate])
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new IntersectionObserver(([entry]) => { activeRegion.current = entry.isIntersecting; drawRef.current() })
    observer.observe(canvas)
    const redraw = () => drawRef.current()
    document.addEventListener('visibilitychange', redraw); window.addEventListener('focus', redraw); window.addEventListener('blur', redraw)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', redraw); window.removeEventListener('focus', redraw); window.removeEventListener('blur', redraw) }
  }, [])

  const heightBounds = dimension === 'minecraft:overworld' ? { min: -64, max: 320 } : { min: 0, max: 256 }
  const atTop = renderHeight >= heightBounds.max

  // Load available dimensions
  useEffect(() => {
    let active = true
    async function loadDimensions() {
      setLoading(true)
      try {
        const dims = await service.listSaveDimensions(savePath)
        if (active) {
          setDimensions(dims)
          if (dims.length > 0 && !dims.includes(dimension)) {
            setDimension(dims[0])
          }
        }
      } catch {
        if (active) setError(t('react.worldMap.loadFailed'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadDimensions()
    return () => {
      active = false
    }
  }, [service, savePath])

  // Load regions when dimension changes
  useEffect(() => {
    let active = true
    async function loadRegions() {
      setLoading(true)
      setError(null)
      setSelectedChunks(new Set())
      try {
        if (running) return
        const list = await service.getSaveRegions(savePath, dimension)
        if (active) setRegionState({ key: sourceKey, rows: list })
      } catch {
        if (active) setError(t('react.worldMap.loadFailed'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadRegions()
    return () => {
      active = false
    }
  }, [service, savePath, dimension, revision, running])

  // Track modifier keys
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Control' || e.key === 'Meta') setCtrlHeld(true)
      if (e.key === 'Shift') setShiftHeld(true)
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Control' || e.key === 'Meta') setCtrlHeld(false)
      if (e.key === 'Shift') setShiftHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // Canvas drawing loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !alive.current) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = rect.width
    const h = rect.height
    if (w <= 0 || h <= 0) return

    const targetW = Math.max(1, Math.floor(w * dpr))
    const targetH = Math.max(1, Math.floor(h * dpr))
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // Background
    ctx.fillStyle = '#11151c'
    ctx.fillRect(0, 0, w, h)

    // Center offset
    const toScreen = (bx: number, bz: number) => ({
      x: w / 2 + (bx - center.x) * scale,
      y: h / 2 + (bz - center.z) * scale,
    })

    const visible = regions.filter(reg => {
      const screen = toScreen(reg.regionX * 512, reg.regionZ * 512), size = 512 * scale
      return screen.x + size >= 0 && screen.x <= w && screen.y + size >= 0 && screen.y <= h
    }).sort((a, b) => Math.hypot(a.regionX * 512 + 256 - center.x, a.regionZ * 512 + 256 - center.z) - Math.hypot(b.regionX * 512 + 256 - center.x, b.regionZ * 512 + 256 - center.z))
    setZoomLimited(visible.length > 32)
    const mayRead = activeRegion.current && !document.hidden && document.hasFocus() && !running && !change
    for (const [index, reg] of visible.entries()) {
      const rx = reg.regionX, rz = reg.regionZ, epoch = generation.current
      const key = `${epoch}:${savePath}:${dimension}:${rx},${rz}:${atTop ? 'top' : renderHeight}`
      const bitmap = index < 32 ? tileCacheRef.current.get(key) : undefined, screen = toScreen(rx * 512, rz * 512), size = 512 * scale
      if (bitmap) {
        tileCacheRef.current.delete(key); tileCacheRef.current.set(key, bitmap)
        ctx.imageSmoothingEnabled = false; ctx.drawImage(bitmap, screen.x, screen.y, size, size)
      } else if (index < 32 && mayRead && fetchingRegionsRef.current.size < 2 && !fetchingRegionsRef.current.has(key) && !failedRegionsRef.current.has(key)) {
        fetchingRegionsRef.current.add(key); setRenderingCount(fetchingRegionsRef.current.size)
        void service.renderSaveRegion(savePath, dimension, rx, rz, atTop ? undefined : renderHeight).then(async rendered => {
          if (!alive.current || generation.current !== epoch) return
          if (rendered.data.byteLength !== 512 * 512 * 4) throw new Error('Invalid region pixels')
          const bitmap = await createImageBitmap(new ImageData(new Uint8ClampedArray(rendered.data), 512, 512))
          if (!alive.current || generation.current !== epoch) { bitmap.close(); return }
          tileCacheRef.current.get(key)?.close(); tileCacheRef.current.set(key, bitmap)
          while (tileCacheRef.current.size > 32) {
            const oldest = tileCacheRef.current.keys().next().value!
            tileCacheRef.current.get(oldest)!.close(); tileCacheRef.current.delete(oldest)
          }
        }).catch(() => {
          if (alive.current && generation.current === epoch) {
            failedRegionsRef.current.add(key)
            while (failedRegionsRef.current.size > 128) failedRegionsRef.current.delete(failedRegionsRef.current.values().next().value!)
            setError(t('react.worldMap.loadFailed'))
          }
        }).finally(() => {
          fetchingRegionsRef.current.delete(key)
          if (alive.current) { setRenderingCount(fetchingRegionsRef.current.size); drawRef.current() }
        })
      }

      // Draw region borders
      if (showGrid) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
        ctx.lineWidth = 1
        ctx.strokeRect(screen.x, screen.y, size, size)
      }
    }

    // Highlight selected chunks
    if (selectedChunks.size > 0) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.45)'
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.9)'
      ctx.lineWidth = 1.5

      for (const key of selectedChunks) {
        const [cx, cz] = key.split(',').map(Number)
        const screen = toScreen(cx * 16, cz * 16)
        const chunkSize = 16 * scale
        ctx.fillRect(screen.x, screen.y, chunkSize, chunkSize)
        ctx.strokeRect(screen.x, screen.y, chunkSize, chunkSize)
      }
    }
  }, [center, dimension, regions, renderHeight, atTop, savePath, scale, service, showGrid, selectedChunks, running, change, t])

  useLayoutEffect(() => { drawRef.current = draw; draw() }, [draw])

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const observer = new ResizeObserver(() => {
      draw()
    })
    observer.observe(parent)
    return () => observer.disconnect()
  }, [draw])

  const movedRef = useRef(false)

  // Mouse / Pointer handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setDragging(true)
    movedRef.current = false
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      centerX: center.x,
      centerZ: center.z,
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging || !dragStartRef.current) return
    const dx = e.clientX - dragStartRef.current.clientX
    const dy = e.clientY - dragStartRef.current.clientY
    if (Math.hypot(dx, dy) > 4) {
      movedRef.current = true
      setCenter({
        x: dragStartRef.current.centerX - dx / scale,
        z: dragStartRef.current.centerZ - dy / scale,
      })
    }
  }

  const handlePointerUp = () => {
    setDragging(false)
    dragStartRef.current = null
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (movedRef.current) {
      movedRef.current = false
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const w = rect.width
    const h = rect.height

    const bx = center.x + (x - w / 2) / scale
    const bz = center.z + (y - h / 2) / scale
    const cx = Math.floor(bx / 16)
    const cz = Math.floor(bz / 16)
    const key = `${cx},${cz}`

    setSelectedChunks((prev) => {
      const next = new Set(prev)
      if (e.shiftKey || shiftHeld) {
        next.delete(key)
      } else if (e.ctrlKey || e.metaKey || ctrlHeld) {
        if (next.has(key)) next.delete(key)
        else next.add(key)
      } else {
        if (next.has(key) && next.size === 1) next.delete(key)
        else next.add(key)
      }
      return next
    })
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const wheel = (event: WheelEvent) => { event.preventDefault(); setScale(value => Math.max(0.05, Math.min(8, value * (event.deltaY < 0 ? 1.25 : 0.8)))) }
    canvas.addEventListener('wheel', wheel, { passive: false })
    return () => canvas.removeEventListener('wheel', wheel)
  }, [])

  const resetView = () => {
    setCenter({ x: 0, z: 0 })
    setScale(0.5)
  }

  const clearSelection = () => {
    setSelectedChunks(new Set())
  }

  // Copy Chunks
  const handleCopy = async () => {
    if (selectedChunks.size === 0 || copyPending.current) return
    copyPending.current = true; setCopying(true)
    const epoch = generation.current
    setError(null)
    const chunks = Array.from(selectedChunks).map((k) => {
      const [chunkX, chunkZ] = k.split(',').map(Number)
      return { chunkX, chunkZ }
    })
    try {
      const copied = await service.copySaveChunks({ savePath, dimension, chunks })
      if (!alive.current || generation.current !== epoch) return
      setClipboard(copied)
      setStatusMessage(t('react.worldMap.copiedChunks', { count: n(copied.length) }))
      clearTimeout(statusTimer.current); statusTimer.current = setTimeout(() => { if (alive.current) setStatusMessage(null) }, 4000)
    } catch {
      if (alive.current && generation.current === epoch) setError(t('react.worldMap.opFailed'))
    } finally { copyPending.current = false; if (alive.current) setCopying(false) }
  }


  return (
    <section className="world-map-container" data-testid="world-map" data-rendered-regions={tileCacheRef.current.size} aria-busy={loading || renderingCount > 0} aria-label={t('react.worldMap.tab')} style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Top Toolbar */}
      <div className="section-heading" style={{ flexWrap: 'wrap', gap: 8, zIndex: 10, padding: '8px 12px', background: 'var(--glass-elevated)', borderRadius: 8, marginBottom: 8 }}>
        <div className="content-selection" style={{ padding: 0 }}>
          <label htmlFor="save-world-map-dim" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
            <Layers size={16} />
            <select
              id="save-world-map-dim"
              data-testid="save-world-map-dim"
              aria-label={t('react.worldMap.dim')}
              value={dimension}
              onChange={(e) => setDimension(e.target.value)}
              disabled={loading || running}
            >
              {dimensions.map((d) => (
                <option key={d} value={d}>
                  {d === 'minecraft:overworld'
                    ? t('react.worldMap.overworld')
                    : d === 'minecraft:the_nether'
                      ? t('react.worldMap.nether')
                      : d === 'minecraft:the_end'
                        ? t('react.worldMap.end')
                        : d}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={`button ${showGrid ? 'primary' : 'secondary'}`}
            data-testid="save-world-map-grid-toggle"
            title={t('react.worldMap.gridToggle')}
            onClick={() => setShowGrid((g) => !g)}
          >
            <Grid size={16} />
          </button>

          <button
            type="button"
            className="button secondary"
            data-testid="save-world-map-reset"
            title={t('react.worldMap.resetView')}
            onClick={resetView}
          >
            <Crosshair size={16} />
          </button>
        </div>

        <button type="button" className="button secondary" disabled={running || loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />{t('react.worldMap.refresh')}</button>

        {/* Height Slider */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} data-testid="save-world-map-height">
          <Sliders size={16} className="text-muted" />
          <span style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
            {atTop ? t('react.worldMap.heightTop') : `Y: ${renderHeight}`}
          </span>
          <input
            id="save-world-map-height-slider"
            type="range"
            aria-label={t('react.worldMap.height')}
            min={heightBounds.min}
            max={heightBounds.max}
            step={1}
            value={renderHeight}
            onChange={(e) => setRenderHeight(Number(e.target.value))}
            style={{ width: 100 }}
          />
        </div>

        {/* Action Controls */}
        <div className="content-actions" style={{ marginLeft: 'auto' }}>
          {selectedChunks.size > 0 && (
            <>
              <span className="badge font-mono" data-testid="save-world-map-selected-count">
                {t('react.worldMap.selectedChunks', { count: n(selectedChunks.size) })}
              </span>
              <button
                type="button"
                className="button secondary"
                data-testid="save-world-map-clear-selection"
                onClick={clearSelection}
              >
                <X size={15} />
                {t('react.worldMap.clearSelection')}
              </button>
              <button
                type="button"
                className="button secondary"
                data-testid="save-world-map-copy"
                disabled={copying}
                onClick={handleCopy}
              >
                <Copy size={15} />
                {t('react.worldMap.copyChunks')}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={running}
                data-testid="save-world-map-delete"
                onClick={() => openChange({ type: 'delete', savePath, dimension, chunks: [...selectedChunks].map(key => { const [chunkX, chunkZ] = key.split(',').map(Number); return { chunkX, chunkZ } }) })}
              >
                <Trash2 size={15} />
                {t('react.worldMap.deleteChunks')}
              </button>
            </>
          )}

          {clipboard.length > 0 && (
            <button
              type="button"
              className="button primary"
              disabled={running}
              data-testid="save-world-map-paste"
              onClick={() => openChange({ type: 'paste', savePath, dimension, chunks: clipboard })}
            >
              <Clipboard size={15} />
              {t('react.worldMap.pasteChunks', { count: n(clipboard.length) })}
            </button>
          )}
        </div>
      </div>

      {/* Legend & Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          color: 'var(--muted)',
          marginBottom: 6,
          padding: '0 4px',
        }}
        data-testid="save-world-map-legend"
      >
        <div style={{ display: 'flex', gap: 12 }}>
          <span>{t('react.worldMap.legendPan')}</span>
          <span style={{ color: ctrlHeld ? 'var(--accent)' : undefined }}>
            {t('react.worldMap.legendSelect')}
          </span>
          <span style={{ color: shiftHeld ? 'var(--accent)' : undefined }}>
            {t('react.worldMap.legendDeselect')}
          </span>
        </div>
        <div>
          {renderingCount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={12} className="animate-spin" />
              {t('react.worldMap.loadingRegions', { count: renderingCount })}
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert" style={{ marginBottom: 8 }}>
          {error}
        </p>
      )}
      {statusMessage && (
        <p className="badge-success" role="status" style={{ padding: '6px 12px', borderRadius: 6, marginBottom: 8 }}>
          {statusMessage}
        </p>
      )}

      <p id="save-world-map-help" className="packs-help">{t('react.worldMap.keyboardHelp')}</p>
      <form className="world-map-coordinates" onSubmit={event => {
        event.preventDefault()
        const values = [goX, goZ]
        if (!values.every(value => /^-?\d+$/.test(value) && Number.isInteger(Number(value)) && Number(value) >= -2147483648 && Number(value) <= 2147483647)) { setError(t('react.chunkChanges.offsetInvalid')); return }
        setCenter({ x: (Number(goX) + 0.5) * 16, z: (Number(goZ) + 0.5) * 16 }); canvasRef.current?.focus()
      }}>
        <label className="field">{t('react.worldMap.chunkX')}<input required type="number" step="1" min="-2147483648" max="2147483647" value={goX} onChange={event => setGoX(event.target.value)} /></label>
        <label className="field">{t('react.worldMap.chunkZ')}<input required type="number" step="1" min="-2147483648" max="2147483647" value={goZ} onChange={event => setGoZ(event.target.value)} /></label>
        <button type="submit" className="button secondary">{t('react.worldMap.go')}</button>
      </form>
      <p data-testid="world-map-cursor">{t('react.worldMap.cursor', { x: n(Math.floor(center.x / 16)), z: n(Math.floor(center.z / 16)) })}</p>
      {/* Main Canvas Viewport */}
      <div
        style={{
          minHeight: 220,
          height: 'clamp(220px, calc(100dvh - 250px), 500px)',
          flexShrink: 0,
          background: '#0d1117',
          borderRadius: 8,
          overflow: 'hidden',
          position: 'relative',
          cursor: dragging ? 'grabbing' : ctrlHeld || shiftHeld ? 'crosshair' : 'grab',
        }}
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label={t('react.worldMap.canvas')}
          data-testid="save-world-map-canvas"
          style={{ width: '100%', height: '100%', display: 'block' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={handleClick}
          onKeyDown={event => {
            const key = event.key.toLowerCase(), step = event.shiftKey ? 512 : 16
            if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
              event.preventDefault()
              setCenter(value => ({ x: value.x + (key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0), z: value.z + (key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0) }))
            } else if (key === '+' || key === '=' || key === '-') {
              event.preventDefault(); setScale(value => Math.max(0.05, Math.min(8, value * (key === '-' ? 0.8 : 1.25))))
            } else if (key === 'enter' || key === ' ') {
              event.preventDefault()
              const selected = `${Math.floor(center.x / 16)},${Math.floor(center.z / 16)}`
              setSelectedChunks(values => { const next = new Set(values); if (next.has(selected)) next.delete(selected); else next.add(selected); return next })
            } else if (key === 'escape' && selectedChunks.size) {
              event.preventDefault(); event.stopPropagation(); clearSelection()
            } else if (key === 'c' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault(); void handleCopy()
            } else if (key === 'v' && (event.ctrlKey || event.metaKey) && clipboard.length && !running) {
              event.preventDefault(); openChange({ type: 'paste', savePath, dimension, chunks: clipboard })
            } else if (key === 'delete' && selectedChunks.size && !running) {
              event.preventDefault(); openChange({ type: 'delete', savePath, dimension, chunks: [...selectedChunks].map(key => { const [chunkX, chunkZ] = key.split(',').map(Number); return { chunkX, chunkZ } }) })
            }
          }}
          aria-describedby="save-world-map-help"
        />

        {!loading && regions.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted)',
              pointerEvents: 'none',
            }}
          >
            {t('react.worldMap.noRegions')}
          </div>
        )}
      </div>

      {zoomLimited && <p role="status">{t('react.worldMap.zoomForDetails')}</p>}
      <ChunkBackups savePath={savePath} running={running} revision={revision} restore={id => openChange({ type: 'restore', savePath, backupId: id })} />
      {change?.savePath === savePath && <ChunkChangesDialog key={`${change.type}:${change.type === 'restore' ? change.backupId : ''}`} change={change} running={running} close={() => setChange(null)} returnFocus={() => { if (returnTo.current?.isConnected) returnTo.current.focus(); else canvasRef.current?.focus() }} changed={changed} recover={id => setChange({ type: 'restore', savePath, backupId: id })} />}
    </section>
  )
}
