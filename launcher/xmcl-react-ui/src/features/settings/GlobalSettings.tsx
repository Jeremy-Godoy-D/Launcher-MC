import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link, useBlocker } from 'react-router'
import * as Dialog from '@radix-ui/react-dialog'
import { Cpu, Download, FolderOpen, Globe, Palette, Save, Search, Settings2, Undo2 } from 'lucide-react'
import type { StateData, StateStore } from '@launcher/renderer-client'
import { Settings } from '@xmcl/runtime-api/src/entities/setting'
import { BaseServiceKey, type Environment } from '@xmcl/runtime-api/src/services/BaseService'
import { JavaServiceKey, JavaState } from '@xmcl/runtime-api/src/services/JavaService'
import { useI18n } from '../../i18n'
import { useService, useSharedState, useSharedStateStore } from '../../runtime'
import { ArgumentEditor } from '../instance/ArgumentEditor'
import { LauncherUpdates } from './LauncherUpdates'
import { VisualCache } from './VisualCache'
import { dirtyGlobalSettings, globalDraft, invalidGlobalSetting, prepareGlobalSettings, reconcileGlobalSettings, type GlobalField, type GlobalSettingsForm } from './settingsDraft'
import './settings.css'

const categories = [['general', Settings2], ['appearance', Palette], ['game', Cpu], ['network', Globe], ['updates', Download]] as const
type Category = typeof categories[number][0]
const fieldIds: Partial<Record<GlobalField, string>> = { minMemory: 'memory-min', maxMemory: 'memory-max', fastLaunch: 'fast-launch', hideLauncher: 'hide-launcher', showLog: 'show-log', maxSockets: 'max-sockets', maxAPISockets: 'max-api-sockets', allowPrerelease: 'allow-prerelease', autoDownload: 'auto-download', autoInstallOnAppQuit: 'auto-install-on-app-quit' }
const descriptor = { key: 'settings', Type: Settings, load: (client: import('@launcher/renderer-client').RendererClient) => client.service(BaseServiceKey).getSettings() }

export function GlobalSettings({ appearance, native }: { appearance: ReactNode; native: boolean }) {
  const { t } = useI18n()
  return native ? <NativeSettings appearance={appearance} /> : <section className="settings-page"><div className="page-heading"><h1>{t('react.globalSettings.title')}</h1></div>{appearance}</section>
}
function NativeSettings({ appearance }: { appearance: ReactNode }) {
  const store = useSharedStateStore(descriptor), snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot), { t } = useI18n()
  if (snapshot.status === 'error') return <section className="settings-page" role="alert"><h1>{t('react.globalSettings.title')}</h1><p>{t('react.globalSettings.loadError')}</p><button className="button secondary" onClick={() => void store.revalidate()}>{t('react.globalSettings.retry')}</button></section>
  if (!snapshot.data) return <section className="settings-page" role="status">{t('react.globalSettings.loading')}</section>
  return <SettingsContent store={store} data={snapshot.data} appearance={appearance} />
}

function SettingsContent({ store, data, appearance }: { store: StateStore<Settings>; data: StateData<Settings>; appearance: ReactNode }) {
  const { t } = useI18n(), base = useService(BaseServiceKey), javaService = useService(JavaServiceKey)
  const javaState = useSharedState({ key: 'java', Type: JavaState, load: client => client.service(JavaServiceKey).getJavaState() })
  const text = (key: string) => t(`react.globalSettings.${key}`), gameText = (key: string) => t(`react.instanceSettings.${key}`)
  const [category, setCategory] = useState<Category>('appearance'), [query, setQuery] = useState('')
  const [draft, setDraft] = useState(() => globalDraft(data)), [saving, setSaving] = useState(false), [browsing, setBrowsing] = useState(false)
  const [closing, setClosing] = useState(false)
  const [failure, setFailure] = useState<'invalid' | 'conflict' | 'save' | 'java' | 'directory' | ''>(''), [field, setField] = useState<GlobalField>(), [saved, setSaved] = useState(false)
  const [directory, setDirectory] = useState(''), [environment, setEnvironment] = useState<Environment>(), [detailsError, setDetailsError] = useState(false), [detailsAttempt, setDetailsAttempt] = useState(0)
  const pending = useRef(false), alive = useRef(true), allowExit = useRef(false), stay = useRef<HTMLButtonElement>(null), errorFocus = useRef<HTMLParagraphElement>(null), dialogErrorFocus = useRef<HTMLParagraphElement>(null), returnFocus = useRef<HTMLElement | null>(null)
  const dirty = dirtyGlobalSettings(draft).length > 0, busy = saving || browsing, values = draft.values
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !allowExit.current && (dirty || pending.current) && currentLocation.pathname !== nextLocation.pathname)
  const dialogOpen = closing || blocker.state === 'blocked'
  const latest = useRef(draft); latest.current = draft
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { setDraft(previous => reconcileGlobalSettings(previous, data)) }, [data])
  useEffect(() => {
    let active = true; setDetailsError(false)
    void Promise.all([base.getGameDataDirectory(), base.getEnvironment()]).then(([path, env]) => { if (active) { setDirectory(path); setEnvironment(env) } }, () => { if (active) setDetailsError(true) })
    return () => { active = false }
  }, [base, detailsAttempt])
  useEffect(() => {
    const close = (event: BeforeUnloadEvent) => { if (!allowExit.current && (dirtyGlobalSettings(latest.current).length || pending.current)) { event.preventDefault(); event.returnValue = 'false'; setClosing(true) } }
    window.addEventListener('beforeunload', close); return () => window.removeEventListener('beforeunload', close)
  }, [dirty])
  useEffect(() => { if (failure) (dialogOpen ? dialogErrorFocus.current : errorFocus.current)?.focus() }, [failure])
  function change<K extends GlobalField>(key: K, value: GlobalSettingsForm[K]) {
    allowExit.current = false; setDraft(previous => ({ ...previous, values: { ...previous.values, [key]: value } })); setFailure(''); setField(undefined); setSaved(false)
  }
  function discard() { const current = store.getSnapshot().data; if (current) setDraft(globalDraft(current)); setFailure(''); setField(undefined); setSaved(false) }
  async function save() {
    if (pending.current) return false
    pending.current = true; setSaving(true); setFailure(''); setField(undefined); setSaved(false)
    try {
      const current = store.getSnapshot().data
      if (!current) throw new Error('Settings unavailable')
      const plan = prepareGlobalSettings(latest.current, current)
      if (plan.dirty.includes('java') && plan.values.java && !await javaService.resolveJava(plan.values.java)) invalidGlobalSetting('java')
      const fresh = store.getSnapshot().data
      if (!fresh) throw new Error('Settings unavailable')
      await base.editSettings(prepareGlobalSettings(latest.current, fresh).edit)
      await store.revalidate()
      const confirmed = store.getSnapshot()
      if (!confirmed.data || confirmed.error) throw new Error('Settings unavailable')
      if (alive.current) { setDraft(globalDraft(confirmed.data)); setSaved(true) }
      return true
    } catch (error) {
      if (alive.current) {
        const invalid = error && typeof error === 'object' && 'field' in error ? String(error.field) : undefined
        const current = store.getSnapshot().data
        if (current) setDraft(previous => reconcileGlobalSettings(previous, current))
        setField(invalid as GlobalField | undefined)
        if (invalid) setQuery('')
        setFailure(invalid ? 'invalid' : error && typeof error === 'object' && ('conflict' in error || 'name' in error && error.name === 'LauncherSettingsConflict') ? 'conflict' : 'save')
        if (invalid && ['java', 'assignMemory', 'minMemory', 'maxMemory', 'vmOptions', 'mcOptions', 'width', 'height', 'fullscreen'].includes(invalid)) setCategory('game')
        else if (invalid && ['httpProxy', 'maxSockets', 'maxAPISockets'].includes(invalid)) setCategory('network')
      }
      return false
    } finally { pending.current = false; if (alive.current) setSaving(false) }
  }
  async function browseJava() {
    if (pending.current) return
    pending.current = true; setBrowsing(true); setFailure('')
    try {
      if (!window.windowController?.showOpenDialog) throw new Error('Picker unavailable')
      const result = await window.windowController.showOpenDialog({ title: gameText('javaManual'), properties: ['openFile'], filters: [{ name: 'Java', extensions: ['exe', ''] }] })
      const path = !result.canceled && result.filePaths[0]
      if (path && alive.current) {
        if (!await javaService.resolveJava(path)) { if (alive.current) setFailure('java') }
        else if (alive.current) change('java', path)
      }
    } catch { if (alive.current) setFailure('java') }
    finally { pending.current = false; if (alive.current) setBrowsing(false) }
  }
  const matches = categories.filter(([id]) => `${text(id)} ${text(`${id}Keywords`)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const visible = matches.some(([id]) => id === category) ? category : matches[0]?.[0]
  const issue = (key: GlobalField) => ({ 'aria-invalid': field === key || undefined, 'aria-describedby': field === key ? 'global-settings-error' : undefined })
  const javas = javaState.data?.all.filter(java => java.valid) ?? []
  function stayHere() { if (pending.current) return; setClosing(false); if (blocker.state === 'blocked') blocker.reset() }
  function leave() { allowExit.current = true; discard(); setClosing(false); if (closing) { if (blocker.state === 'blocked') blocker.reset(); window.windowController?.close() } else if (blocker.state === 'blocked') blocker.proceed() }
  return <section className="settings-page global-settings" data-testid="global-settings">
    <div className="page-heading"><div><h1>{text('title')}</h1><p>{text('subtitle')}</p></div></div>
    <div className="global-settings-search"><Search size={18} aria-hidden="true" /><input type="search" data-testid="settings-search" aria-label={text('search')} placeholder={text('search')} value={query} onChange={event => setQuery(event.target.value)} /></div>
    <div className="global-settings-layout">
      <nav className="settings-categories" aria-label={text('categories')}>{matches.map(([id, Icon]) => <button type="button" key={id} data-testid={`settings-category-${id}`} aria-pressed={visible === id} className={visible === id ? 'active' : ''} onClick={() => setCategory(id)}><Icon size={18} aria-hidden="true" />{text(id)}</button>)}</nav>
      {!!matches.length && <select className="settings-category-select" aria-label={text('categories')} data-testid="settings-category-select" value={visible} onChange={event => setCategory(event.target.value as Category)}>{matches.map(([id]) => <option key={id} value={id}>{text(id)}</option>)}</select>}
      <div className="settings-category-content">
        {!matches.length && <p role="status">{text('noResults')}</p>}
        <div className="settings-section settings-appearance" hidden={visible !== 'appearance'}>{appearance}<VisualCache /></div>
        <section className="settings-group settings-section" hidden={visible !== 'general'} aria-labelledby="global-general-title"><h2 id="global-general-title">{text('general')}</h2>
          <div className="setting-row"><div><label htmlFor="global-locale">{text('language')}</label><p>{text('languageHelp')}</p></div><select id="global-locale" data-testid="global-locale" value={values.locale} disabled={busy} onChange={event => change('locale', event.target.value)}>{[...new Map([{ locale: 'es-ES', name: 'Español' }, { locale: 'en', name: 'English' }, ...data.locales, { locale: data.locale, name: data.locales.find(item => item.locale === data.locale)?.name ?? data.locale }].map(item => [item.locale, item])).values()].map(item => <option key={item.locale} value={item.locale}>{item.name}</option>)}</select></div>
          <div className="setting-row"><div><strong>{text('dataDirectory')}</strong><p className="settings-path" data-testid="global-data-directory">{directory || text('loading')}</p></div><button type="button" className="button secondary" disabled={!directory || busy} onClick={() => void base.openDirectory(directory).then(opened => { if (!opened) setFailure('directory') }, () => setFailure('directory'))}><FolderOpen size={16} aria-hidden="true" />{text('openDirectory')}</button></div>
          {detailsError && <p role="alert">{text('detailsError')} <button type="button" className="button secondary" onClick={() => setDetailsAttempt(value => value + 1)}>{text('retry')}</button></p>}
          <div className="setting-row"><div><strong>{text('accounts')}</strong><p>{text('accountsHelp')}</p></div><Link className="button secondary" to="/accounts">{text('manageAccounts')}</Link></div>
          <details className="settings-help"><summary>{text('help')}</summary><p>{text('helpJava')}</p><p>{text('helpContent')}</p><p>{text('helpData')}</p></details>
        </section>
        <section className="settings-group settings-section instance-settings" hidden={visible !== 'game'} aria-labelledby="global-game-title"><h2 id="global-game-title">{text('game')}</h2><p>{text('gameHelp')}</p>
          <fieldset disabled={busy}><legend>{gameText('javaTitle')}</legend><p className="text-muted">{text('javaAutomaticHelp')}</p><div className="settings-java"><label className="sr-only" htmlFor="global-java">{gameText('javaTitle')}</label><select id="global-java" data-testid="global-java" value={values.java} onChange={event => change('java', event.target.value)} {...issue('java')}><option value="">{text('javaAutomatic')}</option>{javas.map(java => <option key={java.path} value={java.path}>Java {java.majorVersion} · {java.path}</option>)}{values.java && !javas.some(java => java.path === values.java) && <option value={values.java}>{values.java}</option>}</select><button type="button" className="button secondary" data-testid="global-java-browse" onClick={() => void browseJava()}><FolderOpen size={16} aria-hidden="true" />{gameText('javaManual')}</button></div></fieldset>
          <fieldset disabled={busy}><legend>{gameText('memoryTitle')}</legend><div className="settings-choices">{([['auto', 'auto', 'memoryAuto'], ['custom', true, 'memoryCustom'], ['none', false, 'memoryNone']] as const).map(([id, value, label]) => <label key={id}><input type="radio" name="global-memory-mode" data-testid={`global-memory-${id}`} checked={values.assignMemory === value} onChange={() => change('assignMemory', value)} />{id === 'custom' ? text('memoryCustom') : gameText(label)}</label>)}</div><p className="text-muted">{text('memoryHelp')}</p><div className="settings-grid">{(['minMemory', 'maxMemory'] as const).map((key, index) => <div className="field" key={key}><label htmlFor={`global-${key}`}>{gameText(index ? 'memoryMax' : 'memoryMin')}</label><input id={`global-${key}`} data-testid={`global-${fieldIds[key] ?? key}`} inputMode="numeric" value={values[key]} disabled={values.assignMemory !== true} onChange={event => change(key, event.target.value)} {...issue(key)} /></div>)}</div></fieldset>
          <fieldset disabled={busy}><legend>{gameText('jvmTitle')}</legend><p className="text-muted">{text('argumentsHelp')}</p><div className="settings-arguments"><ArgumentEditor id="global-vm-options" title={gameText('jvmOptions')} value={values.vmOptions} disabled={busy} inherit={false} change={value => change('vmOptions', value ?? [])} /><ArgumentEditor id="global-mc-options" title={gameText('mcOptions')} value={values.mcOptions} disabled={busy} inherit={false} change={value => change('mcOptions', value ?? [])} /></div></fieldset>
          <fieldset disabled={busy}><legend>{gameText('resolutionTitle')}</legend><div className="settings-grid">{(['width', 'height'] as const).map(key => <div className="field" key={key}><label htmlFor={`global-${key}`}>{gameText(key === 'width' ? 'resolutionWidth' : 'resolutionHeight')}</label><input id={`global-${key}`} data-testid={`global-${fieldIds[key] ?? key}`} inputMode="numeric" placeholder={text('automatic')} value={values[key]} onChange={event => change(key, event.target.value)} {...issue(key)} /></div>)}</div><label className="settings-check"><input type="checkbox" checked={values.fullscreen} onChange={event => change('fullscreen', event.target.checked)} />{gameText('resolutionFullscreen')}</label></fieldset>
          <fieldset disabled={busy}><legend>{gameText('launchTitle')}</legend>{(['fastLaunch', 'hideLauncher', 'showLog'] as const).map(key => <label className="settings-check" key={key}><input type="checkbox" data-testid={`global-${fieldIds[key] ?? key}`} checked={values[key]} onChange={event => change(key, event.target.checked)} />{gameText(key)}</label>)}</fieldset>
        </section>
        <section className="settings-group settings-section" hidden={visible !== 'network'} aria-labelledby="global-network-title"><h2 id="global-network-title">{text('network')}</h2><p className="text-muted">{text('networkHelp')}</p>
          <div className="setting-row"><label htmlFor="global-source">{text('downloadSource')}</label><select id="global-source" data-testid="global-source" disabled={busy} value={values.apiSetsPreference} onChange={event => change('apiSetsPreference', event.target.value as GlobalSettingsForm['apiSetsPreference'])}><option value="">{text('automatic')}</option><option value="mojang">Mojang</option><option value="bmcl">BMCLAPI</option></select></div>
          <label className="settings-check"><input type="checkbox" data-testid="global-proxy-enabled" checked={values.httpProxyEnabled} disabled={busy} onChange={event => change('httpProxyEnabled', event.target.checked)} />{text('enableProxy')}</label>
          <div className="field"><label htmlFor="global-proxy">{text('proxy')}</label><input id="global-proxy" data-testid="global-proxy" type="password" autoComplete="off" spellCheck={false} value={values.httpProxy} disabled={busy} onChange={event => change('httpProxy', event.target.value)} placeholder="http://127.0.0.1:8080" {...issue('httpProxy')} /></div>
          <div className="settings-grid">{(['maxSockets', 'maxAPISockets'] as const).map(key => <div className="field" key={key}><label htmlFor={`global-${key}`}>{text(key)}</label><input id={`global-${key}`} data-testid={`global-${fieldIds[key] ?? key}`} inputMode="numeric" value={values[key]} disabled={busy} onChange={event => change(key, event.target.value)} {...issue(key)} /></div>)}</div><p className="text-muted">{text('connectionsHelp')}</p>
        </section>
        <section className="settings-group settings-section" hidden={visible !== 'updates'} aria-labelledby="global-updates-title"><h2 id="global-updates-title">{text('updates')}</h2><p className="text-muted">Grimo Launcher {environment?.version ?? ''}{environment ? ` · ${environment.os} ${environment.arch}` : ''}</p>
          {(['allowPrerelease', 'autoDownload', 'autoInstallOnAppQuit'] as const).map(key => <label className="settings-check" key={key}><input type="checkbox" data-testid={`global-${fieldIds[key] ?? key}`} checked={values[key]} disabled={busy} onChange={event => change(key, event.target.checked)} />{text(key)}</label>)}
          <LauncherUpdates settings={data} getCurrent={() => store.getSnapshot().data} dirty={dirty || busy} />
        </section>
      </div>
    </div>
    {failure && <p id="global-settings-error" ref={errorFocus} tabIndex={-1} role="alert" className="form-error" data-testid="global-settings-error">{text(`${failure}Error`)}</p>}
    <div className="global-settings-save"><p role="status" data-testid="global-settings-status">{text(busy ? browsing ? 'checkingJava' : 'saving' : saved ? 'saved' : dirty ? 'unsaved' : 'upToDate')}</p><div><button type="button" className="button secondary" data-testid="global-settings-discard" disabled={!dirty || busy} onClick={discard}><Undo2 size={16} aria-hidden="true" />{text('discard')}</button><button type="button" className="button primary" data-testid="global-settings-save" disabled={!dirty || busy} onClick={() => void save()}><Save size={16} aria-hidden="true" />{text('save')}</button></div></div>
    <Dialog.Root open={dialogOpen} onOpenChange={open => { if (!open) stayHere() }}><Dialog.Portal><Dialog.Overlay className="dialog-backdrop" /><Dialog.Content className="dialog creation-dialog operation-dialog settings-draft-dialog" data-testid="global-settings-leave" onOpenAutoFocus={event => { event.preventDefault(); returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; stay.current?.focus() }} onCloseAutoFocus={event => { event.preventDefault(); if (!allowExit.current) returnFocus.current?.focus() }} onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault() }}>
      <Dialog.Title>{text('leaveTitle')}</Dialog.Title><Dialog.Description>{text('leaveHelp')}</Dialog.Description><div className="creation-body">{failure && <p ref={dialogErrorFocus} tabIndex={-1} role="alert">{text(`${failure}Error`)}</p>}</div><div className="dialog-actions"><button ref={stay} type="button" className="button secondary" disabled={busy} onClick={stayHere}>{text('stay')}</button><button type="button" className="button secondary" data-testid="global-settings-leave-discard" disabled={busy} onClick={leave}>{text('discardContinue')}</button><button type="button" className="button primary" data-testid="global-settings-leave-save" disabled={busy} onClick={async () => { if (await save()) leave() }}>{text('saveContinue')}</button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>
}
