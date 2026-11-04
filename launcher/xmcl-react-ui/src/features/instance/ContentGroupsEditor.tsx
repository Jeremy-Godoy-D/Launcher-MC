import { useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { useContentGroups } from './useContentGroups'
import { editContentGroup } from './contentGroups'
import { useI18n } from '../../i18n'

export function ContentGroupsEditor({ grouping, close }: { grouping: ReturnType<typeof useContentGroups>; close: () => void }) {
  const { t } = useI18n()
  const [reviewed] = useState(() => structuredClone(grouping.data?.groups || {}))
  const [selected, setSelected] = useState(''), [name, setName] = useState(''), [color, setColor] = useState('#f3b86a')
  const [colorTouched, setColorTouched] = useState(false)
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const pending = useRef(false), active = useRef(true), first = useRef<HTMLInputElement>(null), panel = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    active.current = true; first.current?.focus()
    let frame = 0
    const resize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const target = document.activeElement
        if (target instanceof HTMLElement && panel.current?.contains(target)) target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
    }
    window.addEventListener('resize', resize)
    return () => { active.current = false; window.removeEventListener('resize', resize); cancelAnimationFrame(frame) }
  }, [])
  const original = selected.startsWith('name:') ? selected.slice(5) : undefined
  function choose(value: string) {
    setSelected(value); setConfirm(false); setColorTouched(false); setError('')
    const original = value.startsWith('name:') ? value.slice(5) : undefined, group = original === undefined ? undefined : reviewed[original]
    setName(original || ''); setColor(group && /^#[0-9a-f]{6}$/i.test(group.color) ? group.color : '#f3b86a')
  }
  async function save(remove = false) {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try {
      await grouping.save(editContentGroup(reviewed, original, name, original !== undefined && !colorTouched ? reviewed[original].color : color, remove), reviewed)
      if (active.current) close()
    } catch (failure) {
      if (active.current) {
        const message = failure instanceof Error ? failure.message : ''
        setError(['invalid', 'duplicate', 'changed'].includes(message) ? message : 'failed')
      }
    } finally { pending.current = false; if (active.current) setBusy(false) }
  }
  return <section ref={panel} className="content-groups-editor" aria-labelledby="content-groups-title" data-testid="content-groups-editor" onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); close() } }}>
    <div className="section-heading"><h3 id="content-groups-title">{t('react.contentGroups.manage')}</h3><button className="icon-button" type="button" disabled={busy} aria-label={t('react.contentGroups.close')} onClick={close}><X size={18} aria-hidden="true" /></button></div>
    <p>{t('react.contentGroups.help')}</p>
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <label htmlFor="content-group-existing">{t('react.contentGroups.edit')}</label>
      <select id="content-group-existing" value={selected} disabled={busy} onChange={event => choose(event.target.value)}><option value="">{t('react.contentGroups.new')}</option>{Object.keys(reviewed).map(name => <option key={name} value={`name:${name}`}>{name}</option>)}</select>
      <label htmlFor="content-group-name">{t('react.contentGroups.name')}</label><input ref={first} id="content-group-name" maxLength={256} value={name} disabled={busy || confirm} onChange={event => setName(event.target.value)} />
      <label htmlFor="content-group-color">{t('react.contentGroups.color')}</label><input id="content-group-color" type="color" value={color} disabled={busy || confirm} onChange={event => { setColor(event.target.value); setColorTouched(true) }} />
      {error && <p className="form-error" role="alert">{t(`react.contentGroups.${error}`)}</p>}
      {confirm && <p>{t('react.contentGroups.dissolveHelp')}</p>}
      <div className="content-actions">
        <button className="button secondary" type="button" disabled={busy} onClick={close}>{t('react.contentGroups.cancel')}</button>
        {original !== undefined && <button className="button secondary" type="button" disabled={busy} onClick={() => confirm ? void save(true) : setConfirm(true)}>{t(confirm ? 'react.contentGroups.confirmDissolve' : 'react.contentGroups.dissolve')}</button>}
        {!confirm && <button className="button primary" disabled={busy || !name.trim()}>{t(busy ? 'react.contentGroups.saving' : 'react.contentGroups.save')}</button>}
        {error && <button className="button secondary" type="button" disabled={busy} onClick={() => { void grouping.refresh().then(close) }}>{t('react.contentGroups.discardReload')}</button>}
      </div>
    </form>
  </section>
}
