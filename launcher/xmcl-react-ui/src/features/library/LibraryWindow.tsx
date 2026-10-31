import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import { useI18n } from '../../i18n'
import './window.css'

/** Keep small libraries in normal document flow and window large ones by measured rows. */
export function LibraryWindow({ ids, view, children }: { ids: string[]; view: 'grid' | 'list'; children: (index: number) => ReactNode }) {
  const host = useRef<HTMLDivElement>(null), pendingFocus = useRef<{ id: string; control: number } | null>(null)
  const [layout, setLayout] = useState({ columns: 3, margin: 0, width: 0, height: 0 })
  const [focused, setFocused] = useState('')
  const focusedControl = useRef(0)
  const { t } = useI18n()
  const large = ids.length > 60, columns = view === 'list' ? 1 : layout.columns
  const rowCount = Math.ceil(ids.length / columns)
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rowCount,
    enabled: large,
    getScrollElement: () => host.current?.closest<HTMLDivElement>('.page-scroll') || null,
    estimateSize: () => view === 'list' ? 130 : 260,
    getItemKey: useCallback((index: number) => ids[index * columns], [ids, columns]),
    scrollMargin: layout.margin,
    overscan: 2,
    useFlushSync: false,
    rangeExtractor: range => {
      const visible = defaultRangeExtractor(range), index = ids.indexOf(focused)
      // Preserve the focused card when the mouse scrolls it out of the visible range.
      if (index >= 0) visible.push(Math.floor(index / columns))
      return [...new Set(visible)].sort((a, b) => a - b)
    },
  })
  useLayoutEffect(() => {
    const element = host.current, parent = element?.closest<HTMLElement>('.page-scroll')
    if (!element || !parent || !large) return
    const measure = () => {
      const columns = Number(getComputedStyle(element).getPropertyValue('--library-columns')) || 3
      const margin = element.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop
      const width = parent.clientWidth, height = parent.clientHeight
      setLayout(previous => previous.columns === columns && previous.width === width && previous.height === height && Math.abs(previous.margin - margin) < 1 ? previous : { columns, margin, width, height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent); observer.observe(element)
    return () => observer.disconnect()
  }, [large, view])
  useLayoutEffect(() => {
    virtualizer.measure()
    if (focused && ids.includes(focused)) {
      pendingFocus.current = { id: focused, control: focusedControl.current }
      virtualizer.scrollToIndex(Math.floor(ids.indexOf(focused) / columns), { align: 'auto' })
    }
  }, [columns, view, layout.width, layout.height])
  useLayoutEffect(() => {
    // A layout reset can happen while scrolling skips synchronous ref measurements.
    if (!virtualizer.isScrolling) host.current?.querySelectorAll<HTMLDivElement>('.virtual-library-row').forEach(row => virtualizer.measureElement(row))
    const target = pendingFocus.current
    if (!target) return
    const card = Array.from(host.current?.querySelectorAll<HTMLElement>('[data-instance-path]') || []).find(card => card.dataset.instancePath === target.id)
    const buttons = card?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    const button = buttons?.[Math.min(target.control, buttons.length - 1)]
    if (button) { pendingFocus.current = null; button.focus({ preventScroll: true }) }
  })
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!large || event.altKey || event.metaKey || event.ctrlKey) return
    const target = event.target as HTMLElement, card = target.closest<HTMLElement>('[data-instance-path]')
    if (!card) return
    const index = ids.indexOf(card.dataset.instancePath || ''), buttons = Array.from(card.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    const control = buttons.indexOf(target as HTMLButtonElement)
    if (index < 0 || control < 0) return
    let next = index, nextControl = control
    const rtl = document.documentElement.dir === 'rtl'
    if (event.key === 'ArrowDown') next += columns
    else if (event.key === 'ArrowUp') next -= columns
    else if (event.key === 'ArrowRight') next += rtl ? -1 : 1
    else if (event.key === 'ArrowLeft') next += rtl ? 1 : -1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = ids.length - 1
    else if (event.key === 'Tab' && !event.shiftKey && control === buttons.length - 1 && index < ids.length - 1) { next++; nextControl = 0 }
    else if (event.key === 'Tab' && event.shiftKey && control === 0 && index > 0) { next--; nextControl = 2 }
    else return
    event.preventDefault()
    next = Math.max(0, Math.min(ids.length - 1, next))
    if (next === index && nextControl === control) {
      virtualizer.scrollToIndex(Math.floor(next / columns), { align: 'auto' })
      return
    }
    pendingFocus.current = { id: ids[next], control: nextControl }
    setFocused(ids[next])
    virtualizer.scrollToIndex(Math.floor(next / columns), { align: 'auto' })
  }
  function item(index: number) {
    return <div key={ids[index]} role="listitem" aria-posinset={index + 1} aria-setsize={ids.length}>{children(index)}</div>
  }
  return <>
    <p className="library-count" aria-live="polite">{t('react.instances.count', { count: ids.length })}</p>
    <p id="library-keyboard-help" className="library-keyboard-help">{t('react.instances.keyboard')}</p>
    <div ref={host} role="list" aria-label={t('react.instances.listLabel')} aria-describedby="library-keyboard-help" data-testid="library-window" data-virtualized={large} className={`instance-grid ${view === 'list' ? 'list-view' : ''} ${large ? 'virtual-library' : ''}`} style={large ? { height: virtualizer.getTotalSize() } : undefined} onKeyDown={keyboard} onFocusCapture={event => {
      const card = (event.target as HTMLElement).closest<HTMLElement>('[data-instance-path]')
      focusedControl.current = card ? Array.from(card.querySelectorAll('button:not(:disabled)')).indexOf(event.target) : 0
      setFocused(card?.dataset.instancePath || '')
    }} onBlurCapture={event => { if (!pendingFocus.current && !event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused('') }}>
      {large ? virtualizer.getVirtualItems().map(row => <div key={row.key} ref={virtualizer.measureElement} data-index={row.index} className="virtual-library-row" role="presentation" style={{ transform: `translateY(${row.start - layout.margin}px)` }}>
        {Array.from({ length: Math.min(columns, ids.length - row.index * columns) }, (_, column) => item(row.index * columns + column))}
      </div>) : ids.map((_, index) => item(index))}
    </div>
  </>
}
