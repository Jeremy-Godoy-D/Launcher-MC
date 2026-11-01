import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Clipboard,
  Copy,
  Crosshair,
  Grid,
  Layers,
  MapPin,
  RefreshCw,
  Sliders,
  Trash2,
  X,
} from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { InstanceSavesServiceKey } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import type { SaveRegionInfo } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import { useService } from '../../runtime'
import { useI18n } from '../../i18n'
import { useSavesChunkClipboard } from './savesChunkClipboard'

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
  const [regions, setRegions] = useState<SaveRegionInfo[]>([])
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
  const [deleting, setDeleting] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmPaste, setConfirmPaste] = useState(false)
  const [pasteOffset, setPasteOffset] = useState<{ x: number; z: number }>({ x: 0, z: 0 })

  // Dragging state
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef<{ clientX: number; clientY: number; centerX: number; centerZ: number } | null>(null)
  const [ctrlHeld, setCtrlHeld] = useState(false)
  const [shiftHeld, setShiftHeld] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const tileCacheRef = useRef<Map<string, ImageBitmap>>(new Map())
  const fetchingRegionsRef = useRef<Set<string>>(new Set())

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
      tileCacheRef.current.clear()
      try {
        const list = await service.getSaveRegions(savePath, dimension)
        if (active) setRegions(list)
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
  }, [service, savePath, dimension])

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
    if (!canvas) return
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

    // Draw regions
    for (const reg of regions) {
      const rx = reg.regionX
      const rz = reg.regionZ
      const key = `${dimension}:${rx},${rz}:${atTop ? 'top' : renderHeight}`
      const bitmap = tileCacheRef.current.get(key)
      const screen = toScreen(rx * 512, rz * 512)
      const size = 512 * scale

      // Check visibility
      if (screen.x + size < 0 || screen.x > w || screen.y + size < 0 || screen.y > h) {
        continue
      }

      if (bitmap) {
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(bitmap, screen.x, screen.y, size, size)
      } else if (!fetchingRegionsRef.current.has(key)) {
        // Fetch region
        fetchingRegionsRef.current.add(key)
        setRenderingCount((c) => c + 1)
        void service
          .renderSaveRegion(savePath, dimension, rx, rz, atTop ? undefined : renderHeight)
          .then(async (rendered) => {
            const clamped = new Uint8ClampedArray(
              rendered.data.buffer,
              rendered.data.byteOffset,
              rendered.data.byteLength,
            )
            const imgData = new ImageData(clamped as any, 512, 512)
            const bmp = await createImageBitmap(imgData)
            tileCacheRef.current.set(key, bmp)
            draw()
          })
          .catch(() => {})
          .finally(() => {
            fetchingRegionsRef.current.delete(key)
            setRenderingCount((c) => Math.max(0, c - 1))
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
  }, [center, dimension, regions, renderHeight, atTop, savePath, scale, service, showGrid, selectedChunks])

  useEffect(() => {
    draw()
  }, [draw])

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

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.25 : 0.8
    setScale((s) => Math.max(0.05, Math.min(8, s * factor)))
  }

  const resetView = () => {
    setCenter({ x: 0, z: 0 })
    setScale(0.5)
  }

  const clearSelection = () => {
    setSelectedChunks(new Set())
  }

  // Copy Chunks
  const handleCopy = async () => {
    if (selectedChunks.size === 0) return
    setError(null)
    const chunks = Array.from(selectedChunks).map((k) => {
      const [chunkX, chunkZ] = k.split(',').map(Number)
      return { chunkX, chunkZ }
    })
    try {
      const copied = await service.copySaveChunks({ savePath, dimension, chunks })
      setClipboard(copied)
      setStatusMessage(t('react.worldMap.copiedChunks', { count: n(copied.length) }))
      setTimeout(() => setStatusMessage(null), 4000)
    } catch {
      setError(t('react.worldMap.opFailed'))
    }
  }

  // Delete Chunks
  const handleDeleteConfirm = async () => {
    setDeleting(true)
    setError(null)
    const chunks = Array.from(selectedChunks).map((k) => {
      const [chunkX, chunkZ] = k.split(',').map(Number)
      return { chunkX, chunkZ }
    })
    try {
      await service.deleteSaveChunks({ savePath, dimension, chunks })
      setSelectedChunks(new Set())
      tileCacheRef.current.clear()
      setConfirmDelete(false)
      setStatusMessage(t('react.worldMap.deleteDone', { count: n(chunks.length) }))
      draw()
      setTimeout(() => setStatusMessage(null), 4000)
    } catch (err: any) {
      if (err?.name === 'InstanceRunningError' || err?.name === 'SharedWorldRunningError') {
        setError(t('react.worldMap.runningError'))
      } else {
        setError(t('react.worldMap.opFailed'))
      }
    } finally {
      setDeleting(false)
    }
  }

  // Paste Chunks
  const handlePasteConfirm = async () => {
    if (!clipboard.length) return
    setPasting(true)
    setError(null)
    try {
      await service.pasteSaveChunks({
        savePath,
        dimension,
        chunks: clipboard,
        offsetX: pasteOffset.x,
        offsetZ: pasteOffset.z,
      })
      tileCacheRef.current.clear()
      setConfirmPaste(false)
      setStatusMessage(t('react.worldMap.pasteDone', { count: n(clipboard.length) }))
      draw()
      setTimeout(() => setStatusMessage(null), 4000)
    } catch (err: any) {
      if (err?.name === 'InstanceRunningError' || err?.name === 'SharedWorldRunningError') {
        setError(t('react.worldMap.runningError'))
      } else {
        setError(t('react.worldMap.opFailed'))
      }
    } finally {
      setPasting(false)
    }
  }

  return (
    <section className="world-map-container" data-testid="world-map" aria-label={t('react.worldMap.tab')} style={{ display: 'flex', flexDirection: 'column', height: '600px', position: 'relative' }}>
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
                onClick={handleCopy}
              >
                <Copy size={15} />
                {t('react.worldMap.copyChunks')}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={deleting || running}
                data-testid="save-world-map-delete"
                onClick={() => setConfirmDelete(true)}
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
              disabled={pasting || running}
              data-testid="save-world-map-paste"
              onClick={() => setConfirmPaste(true)}
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

      {/* Main Canvas Viewport */}
      <div
        style={{
          flex: 1,
          minHeight: 380,
          background: '#0d1117',
          borderRadius: 8,
          overflow: 'hidden',
          position: 'relative',
          cursor: dragging ? 'grabbing' : ctrlHeld || shiftHeld ? 'crosshair' : 'grab',
        }}
      >
        <canvas
          ref={canvasRef}
          data-testid="save-world-map-canvas"
          style={{ width: '100%', height: '100%', display: 'block' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={handleClick}
          onWheel={handleWheel}
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

      {/* Delete Confirmation Dialog */}
      {confirmDelete && (
        <Dialog.Root open onOpenChange={(open) => !open && !deleting && setConfirmDelete(false)}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-backdrop" />
            <Dialog.Content className="dialog" data-testid="confirm-dialog">
              <Dialog.Title>{t('react.worldMap.deleteChunksTitle')}</Dialog.Title>
              <Dialog.Description>
                {t('react.worldMap.deleteChunksConfirm', { count: n(selectedChunks.size) })}
              </Dialog.Description>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 8 }}>
                {t('react.worldMap.backupNotice')}
              </p>
              <div className="content-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
                <button
                  type="button"
                  className="button secondary"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(false)}
                >
                  {t('react.workspace.cancel')}
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={deleting}
                  onClick={handleDeleteConfirm}
                >
                  {deleting ? t('react.worldMap.deleting') : t('react.worldMap.deleteChunks')}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      {/* Paste Confirmation Dialog */}
      {confirmPaste && (
        <Dialog.Root open onOpenChange={(open) => !open && !pasting && setConfirmPaste(false)}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-backdrop" />
            <Dialog.Content className="dialog" data-testid="confirm-dialog">
              <Dialog.Title>{t('react.worldMap.pasteChunksTitle')}</Dialog.Title>
              <Dialog.Description>
                {t('react.worldMap.pasteChunksConfirm', {
                  count: n(clipboard.length),
                  offsetX: pasteOffset.x,
                  offsetZ: pasteOffset.z,
                })}
              </Dialog.Description>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '12px 0' }}>
                <label className="field">
                  Offset X (chunks)
                  <input
                    type="number"
                    value={pasteOffset.x}
                    onChange={(e) => setPasteOffset({ ...pasteOffset, x: parseInt(e.target.value) || 0 })}
                  />
                </label>
                <label className="field">
                  Offset Z (chunks)
                  <input
                    type="number"
                    value={pasteOffset.z}
                    onChange={(e) => setPasteOffset({ ...pasteOffset, z: parseInt(e.target.value) || 0 })}
                  />
                </label>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                {t('react.worldMap.backupNotice')}
              </p>
              <div className="content-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
                <button
                  type="button"
                  className="button secondary"
                  disabled={pasting}
                  onClick={() => setConfirmPaste(false)}
                >
                  {t('react.workspace.cancel')}
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={pasting}
                  onClick={handlePasteConfirm}
                >
                  {pasting ? t('react.worldMap.pasting') : t('react.worldMap.pasteChunks', { count: n(clipboard.length) })}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </section>
  )
}
