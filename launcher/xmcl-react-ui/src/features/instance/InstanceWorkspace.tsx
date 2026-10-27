import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { FolderOpen, MoreHorizontal, Play } from 'lucide-react'
import { BaseServiceKey } from '@xmcl/runtime-api/src/services/BaseService'
import type { SavedInstance } from '../library/model'
import { instanceIcon, loaderName } from '../library/model'
import { useService } from '../../runtime'
import { useI18n } from '../../i18n'
import { InstanceMods } from './InstanceMods'
import './instance.css'

const tabs = [['summary', '/instance'], ['mods', '/instance/mods'], ['packs', '/instance/resourcepacks'], ['shaders', '/instance/shaderpacks'], ['worlds', '/instance/save'], ['settings', '/instance/base-setting'], ['console', '/instance/console']] as const

export function InstanceWorkspace({ instance, media, cover, headerRef, play, options, running, busy, copyPending, onHover, onFocus }: {
  instance: SavedInstance; media: ReactNode; cover?: string; headerRef: RefObject<HTMLElement | null>; play: () => void; options: () => void; running: boolean; busy: boolean; copyPending: boolean
  onHover: (value: boolean) => void; onFocus: (value: boolean) => void
}) {
  const { t, d, n } = useI18n(), location = useLocation(), base = useService(BaseServiceKey)
  const [error, setError] = useState(false), [opening, setOpening] = useState(false), pending = useRef(false), active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const tab = tabs.find(([, path]) => location.pathname === path)?.[0], icon = cover || instanceIcon(instance.icon)
  async function openFolder() {
    if (pending.current) return
    pending.current = true; setOpening(true); setError(false)
    try { if (!await base.openDirectory(instance.path)) throw new Error('missing') }
    catch { if (active.current) setError(true) }
    finally { pending.current = false; if (active.current) setOpening(false) }
  }
  return <section className="instance-page" data-testid="instance-workspace" data-instance-path={instance.path}>
    <header className="instance-header" ref={headerRef} onPointerEnter={() => onHover(true)} onPointerLeave={() => onHover(false)} onFocusCapture={() => onFocus(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onFocus(false) }}>
      {media}
      <div className="instance-identity">{icon && <img key={icon} className="instance-logo" src={icon} alt="" onError={event => { event.currentTarget.style.display = 'none' }} />}
        <div><h1>{instance.name}</h1><p>Minecraft {instance.runtime.minecraft || instance.version} · {loaderName(instance)}</p><span>{t(copyPending ? 'react.workspace.copyPending' : running ? 'react.workspace.running' : 'react.workspace.stopped')}</span>{instance.upstream && instance.upstream.type !== 'server' && <small>{t('react.instances.genericAmbient')}</small>}</div>
      </div>
      <div className="instance-header-actions"><button className="button primary" disabled={busy} onClick={play}><Play size={18} fill="currentColor" aria-hidden="true" />{t(copyPending ? 'react.copy.review' : running ? 'react.launch.view' : 'react.launch.play')}</button>
        <button className="button secondary" aria-label={t('react.workspace.options', { name: instance.name })} onClick={options}><MoreHorizontal size={20} aria-hidden="true" /></button>
      </div>
    </header>
    <nav className="instance-tabs" aria-label={t('react.workspace.navigation')}>{tabs.map(([key, path]) => <NavLink key={key} to={path} end>{t(`react.workspace.${key}`)}</NavLink>)}</nav>
    {tab === 'summary' ? <section aria-labelledby="instance-summary-title">
      <div className="section-heading"><h2 id="instance-summary-title">{t('react.workspace.summary')}</h2><button className="button secondary" disabled={opening} onClick={() => void openFolder()}><FolderOpen size={17} aria-hidden="true" />{t('react.operations.openFolder')}</button></div>
      {error && <p className="form-error" role="alert">{t('react.workspace.folderFailed')}</p>}
      {instance.description && <p className="instance-description">{instance.description}</p>}
      <dl className="instance-details"><div><dt>Minecraft</dt><dd>{instance.runtime.minecraft || instance.version || t('react.workspace.unknown')}</dd></div><div><dt>Loader</dt><dd>{loaderName(instance)}</dd></div>
        <div><dt>{t('react.workspace.lastPlayed')}</dt><dd>{instance.lastPlayedDate > 0 ? d(instance.lastPlayedDate) : t('react.workspace.never')}</dd></div>
        <div><dt>{t('react.workspace.playtime')}</dt><dd>{t('react.workspace.minutes', { value: n(Math.floor(instance.playtime / 60000)) })}</dd></div>
      </dl>
      <p className="instance-path">{t('react.workspace.folder')}: {instance.path}</p>
    </section> : tab === 'mods' ? <InstanceMods key={instance.path} path={instance.path} runtime={instance.runtime} running={running} /> : tab ? <div role="status" className="empty"><h2>{t(`react.workspace.${tab}`)}</h2><p>{t('react.instances.featurePending')}</p></div> : <div className="empty"><h2>{t('react.workspace.notFound')}</h2><Link to="/instance" className="button secondary">{t('react.workspace.summary')}</Link></div>}
  </section>
}
