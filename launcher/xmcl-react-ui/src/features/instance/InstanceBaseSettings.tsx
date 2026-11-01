import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router'
import * as Dialog from '@radix-ui/react-dialog'
import { Cpu, HardDrive, Monitor, Server, Play, RotateCcw, Save, Undo2, FolderOpen } from 'lucide-react'
import { InstanceServiceKey } from '@xmcl/runtime-api/src/services/InstanceService'
import { JavaServiceKey, JavaState } from '@xmcl/runtime-api/src/services/JavaService'
import { instanceSettingsKeys, instanceSettingsSnapshot, type InstanceSettingsKey } from '@xmcl/runtime-api/src/util/instanceSettings'
import { useService, useSharedState } from '../../runtime'
import { useI18n } from '../../i18n'
import { useLibrary } from '../library/context'
import type { SavedInstance } from '../library/model'
import { ArgumentEditor } from './ArgumentEditor'
import { conflictingInstanceSettings, createInstanceSettingsDraft, dirtyInstanceSettings, instanceSettingsChanges, instanceSettingsForm, reconcileInstanceSettings, type InstanceSettingsForm } from './settingsDraft'

type Intent = { kind: 'leave'; proceed: () => void } | { kind: 'reset' | 'reload' }
type Failure = { name: string; field?: InstanceSettingsKey }
const fieldLabels = { java: 'javaTitle', assignMemory: 'memoryTitle', minMemory: 'memoryMin', maxMemory: 'memoryMax', vmOptions: 'jvmOptions', mcOptions: 'mcOptions', resolution: 'resolutionTitle', server: 'serverTitle', fastLaunch: 'fastLaunch', hideLauncher: 'hideLauncher', showLog: 'showLog' } as const
const fieldHelp = { java: 'invalidJava', assignMemory: 'invalidMemory', minMemory: 'invalidMemory', maxMemory: 'invalidMemory', vmOptions: 'invalidArguments', mcOptions: 'invalidArguments', resolution: 'invalidResolution', server: 'invalidServer', fastLaunch: 'invalid', hideLauncher: 'invalid', showLog: 'invalid' } as const

export function InstanceBaseSettings({ instance, running }: { instance: SavedInstance; running: boolean }) {
  const { t, n } = useI18n(), library = useLibrary(), service = useService(InstanceServiceKey), javaService = useService(JavaServiceKey)
  const javaState = useSharedState({ key: 'java', Type: JavaState, load: client => client.service(JavaServiceKey).getJavaState() })
  const incoming = instanceSettingsSnapshot(instance), incomingKey = JSON.stringify(incoming)
  const [draft, setDraft] = useState(() => createInstanceSettingsDraft(incoming))
  const [saving, setSaving] = useState(false), [browsing, setBrowsing] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null), [message, setMessage] = useState(''), [intent, setIntent] = useState<Intent | null>(null)
  const pending = useRef(false), alive = useRef(true), allowExit = useRef(false), returnFocus = useRef<HTMLElement | null>(null), stay = useRef<HTMLButtonElement>(null)
  const errorFocus = useRef<HTMLParagraphElement>(null), dialogErrorFocus = useRef<HTMLParagraphElement>(null)
  const latest = useRef({ draft, running }); latest.current = { draft, running }
  const dirty = dirtyInstanceSettings(draft).length > 0, busy = saving || browsing, disabled = busy || running
  const conflicts = conflictingInstanceSettings(draft, incoming)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !allowExit.current && (dirty || pending.current) && currentLocation.pathname !== nextLocation.pathname)
  const dialogOpen = !!intent || blocker.state === 'blocked'
  const text = (key: string) => t(`react.instanceSettings.${key}`)
  useEffect(() => { if (failure) (dialogOpen ? dialogErrorFocus.current : errorFocus.current)?.focus() }, [failure])
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    // Only launch fields reconcile; playtime/name events must not erase a draft.
    if (!pending.current) setDraft(previous => reconcileInstanceSettings(previous, incoming))
  }, [incomingKey])
  function openIntent(next: Intent) {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setIntent(next)
  }
  useLayoutEffect(() => {
    if (!library) return
    const guard = (next: string, proceed: () => void) => {
      if (allowExit.current || next === instance.path || (!dirtyInstanceSettings(latest.current.draft).length && !pending.current)) return true
      openIntent({ kind: 'leave', proceed }); return false
    }
    library.selectionGuard.current = guard
    return () => { if (library.selectionGuard.current === guard) library.selectionGuard.current = null }
  }, [library?.selectionGuard, instance.path])
  useEffect(() => {
    const close = (event: BeforeUnloadEvent) => {
      if (allowExit.current || (!dirtyInstanceSettings(latest.current.draft).length && !pending.current)) return
      event.preventDefault(); event.returnValue = 'false'
      openIntent({ kind: 'leave', proceed: () => { window.windowController?.close() } })
    }
    window.addEventListener('beforeunload', close)
    return () => window.removeEventListener('beforeunload', close)
  }, [])
  function change<K extends keyof InstanceSettingsForm>(key: K, value: InstanceSettingsForm[K]) {
    allowExit.current = false
    setDraft(previous => ({ ...previous, values: { ...previous.values, [key]: value } })); setFailure(null); setMessage('')
  }
  function fresh() { return instanceSettingsSnapshot(library?.readInstance(instance.path) ?? instance) }
  function discard() { setDraft(createInstanceSettingsDraft(fresh())); setFailure(null); setMessage('') }
  function cancelIntent() { if (pending.current) return; setIntent(null); if (blocker.state === 'blocked') blocker.reset() }
  function leave() {
    allowExit.current = true
    discard()
    const next = intent; setIntent(null)
    if (next?.kind === 'leave') { if (blocker.state === 'blocked') blocker.reset(); next.proceed() }
    else if (blocker.state === 'blocked') blocker.proceed()
  }
  async function save(reset = false) {
    if (pending.current || latest.current.running) return false
    const captured = latest.current.draft
    pending.current = true; setSaving(true); setFailure(null); setMessage('')
    try {
      const changes = reset ? Object.fromEntries(instanceSettingsKeys.map(key => [key, null])) : instanceSettingsChanges(captured)
      const result = await service.editInstanceSettings({ instancePath: instance.path, expected: captured.base, changes })
      if (alive.current) { setDraft(createInstanceSettingsDraft(result)); setMessage(reset ? 'resetSuccess' : 'saveSuccess') }
      return true
    } catch (error) {
      if (alive.current) {
        // Native can briefly contain our change before a failed disk write rolls it back.
        setDraft(captured)
        const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
        const field = error && typeof error === 'object' && 'field' in error && instanceSettingsKeys.includes(error.field as InstanceSettingsKey) ? error.field as InstanceSettingsKey : undefined
        setFailure({ name, field })
      }
      return false
    } finally { pending.current = false; if (alive.current) setSaving(false) }
  }
  async function browseJava() {
    if (pending.current || running) return
    pending.current = true; setBrowsing(true); setFailure(null)
    try {
      const picker = window.windowController?.showOpenDialog
      if (!picker) return
      const result = await picker({ title: text('javaManual'), properties: ['openFile'], filters: [{ name: 'Java', extensions: ['exe', ''] }] })
      const file = !result?.canceled && result?.filePaths[0]
      if (!file || !alive.current) return
      const resolved = await javaService.resolveJava(file)
      if (!alive.current || latest.current.running) return
      if (resolved) change('java', file)
      else setFailure({ name: 'JavaNotFound' })
    } catch { if (alive.current) setFailure({ name: 'JavaNotFound' }) }
    finally {
      pending.current = false
      if (alive.current) { setDraft(previous => reconcileInstanceSettings(previous, fresh())); setBrowsing(false) }
    }
  }
  const values = draft.values, javas = javaState.data?.all.filter(java => java.valid) ?? []
  const flagValue = (value: boolean | null) => value === null ? 'inherit' : value ? 'enabled' : 'disabled'
  const readFlag = (value: string) => value === 'inherit' ? null : value === 'enabled'
  const errorText = failure ? failure.name === 'InstanceSettingsInvalid' ? text('invalid') + (failure.field ? ` ${text(fieldLabels[failure.field])}: ${text(fieldHelp[failure.field])}` : '')
    : failure.name === 'InstanceSettingsChanged' ? text('changed') : failure.name === 'InstanceRunningError' ? text('runningWarning')
      : failure.name === 'JavaNotFound' ? text('javaNotFound') : text('saveError') : ''
  const issue = (key: InstanceSettingsKey, help = '') => ({ 'aria-invalid': failure?.field === key || undefined, 'aria-describedby': [failure?.field === key ? 'settings-error' : '', help].filter(Boolean).join(' ') || undefined })

  return <section className="instance-settings" data-testid="instance-base-setting" aria-labelledby="base-setting-title" aria-busy={busy}>
    <div className="section-heading"><div><h2 id="base-setting-title">{text('title')}</h2><p className="text-muted">{text('subtitle')}</p></div></div>
    {running && <p className="settings-notice" role="alert">{text('runningWarning')}</p>}
    {!!conflicts.length && <div className="settings-notice" role="alert" data-testid="setting-conflict"><p>{text('changed')}</p><p>{conflicts.map(key => text(fieldLabels[key])).join(', ')}</p><button type="button" className="button secondary" disabled={busy} onClick={() => openIntent({ kind: 'reload' })}>{text('reload')}</button></div>}
    {failure && <p ref={errorFocus} tabIndex={-1} id="settings-error" className="form-error" role="alert">{errorText}</p>}
    <p className="settings-status" role="status">{busy ? text(browsing ? 'javaChecking' : 'saving') : message ? text(message) : dirty ? text('unsaved') : text('upToDate')}</p>
    <form onSubmit={event => { event.preventDefault(); void save() }} noValidate>
      <fieldset disabled={disabled}><legend><Cpu size={18} aria-hidden="true" />{text('javaTitle')}</legend><p className="text-muted">{text('javaDesc')}</p>
        <div className="settings-java"><label className="sr-only" htmlFor="setting-java-select">{text('javaTitle')}</label><select id="setting-java-select" data-testid="setting-java-select" value={values.java} onChange={event => change('java', event.target.value)} {...issue('java')}>
          <option value="">{text('javaInherit')}</option>{javas.map(java => <option key={java.path} value={java.path}>Java {java.majorVersion} ({java.version}) · {java.path}</option>)}{values.java && !javas.some(java => java.path === values.java) && <option value={values.java}>{values.java}</option>}
        </select><button type="button" className="button secondary" data-testid="setting-java-browse" onClick={() => void browseJava()}><FolderOpen size={16} aria-hidden="true" />{text('javaManual')}</button></div>
        {values.java && <p className="text-muted settings-path">{t('react.instanceSettings.javaSelected', { path: values.java })}</p>}
      </fieldset>
      <fieldset disabled={disabled}><legend><HardDrive size={18} aria-hidden="true" />{text('memoryTitle')}</legend><p className="text-muted">{text('memoryDesc')}</p>
        <div className="settings-choices">{([['inherit', null, 'memoryInherit'], ['custom', true, 'memoryCustom'], ['auto', 'auto', 'memoryAuto'], ['none', false, 'memoryNone']] as const).map(([id, value, label]) => <label key={id}><input type="radio" name="memory-mode" data-testid={`setting-memory-mode-${id}`} checked={values.assignMemory === value} onChange={() => change('assignMemory', value)} />{text(label)}</label>)}</div>
        <p id="memory-bounds-help" className="text-muted">{text(values.assignMemory === 'auto' || values.assignMemory === false ? 'memoryInactiveBounds' : 'memoryBoundsHelp')}</p>
        <div className="settings-grid">{(['minMemory', 'maxMemory'] as const).map((key, index) => <div className="field" key={key}><label htmlFor={`setting-memory-${index ? 'max' : 'min'}`}>{text(fieldLabels[key])}</label><input type="text" inputMode="numeric" id={`setting-memory-${index ? 'max' : 'min'}`} data-testid={`setting-memory-${index ? 'max' : 'min'}`} value={values[key]} onChange={event => change(key, event.target.value)} placeholder={text('boundInherit')} disabled={values.assignMemory === 'auto' || values.assignMemory === false} {...issue(key, 'memory-bounds-help')} />{!!values[key] && /^\d+$/.test(values[key]) && <small className="text-muted">{n(Number(values[key]) / 1024, { maximumFractionDigits: 2 })} GiB</small>}</div>)}</div>
      </fieldset>
      <fieldset disabled={disabled}><legend><Cpu size={18} aria-hidden="true" />{text('jvmTitle')}</legend><p className="text-muted">{text('jvmDesc')}</p><div className="settings-arguments">
        <div data-testid="setting-vm-options"><ArgumentEditor id="setting-vm-options" title={text('jvmOptions')} value={values.vmOptions ?? undefined} change={value => change('vmOptions', value ?? null)} disabled={disabled} /></div><div data-testid="setting-mc-options"><ArgumentEditor id="setting-mc-options" title={text('mcOptions')} value={values.mcOptions ?? undefined} change={value => change('mcOptions', value ?? null)} disabled={disabled} /></div>
      </div></fieldset>
      <fieldset disabled={disabled}><legend><Monitor size={18} aria-hidden="true" />{text('resolutionTitle')}</legend><p className="text-muted">{text('resolutionDesc')}</p><div className="settings-choices">{(['inherit', 'custom'] as const).map(mode => <label key={mode}><input type="radio" name="resolution-mode" data-testid={`setting-resolution-mode-${mode}`} checked={values.resolution.enabled === (mode === 'custom')} onChange={() => change('resolution', { ...values.resolution, enabled: mode === 'custom' })} />{text(mode === 'custom' ? 'resolutionCustom' : 'resolutionInherit')}</label>)}</div>
        {values.resolution.enabled && <div className="settings-grid">{(['width', 'height'] as const).map(key => <div className="field" key={key}><label htmlFor={`setting-resolution-${key}`}>{text(key === 'width' ? 'resolutionWidth' : 'resolutionHeight')}</label><input type="text" inputMode="numeric" id={`setting-resolution-${key}`} data-testid={`setting-resolution-${key}`} value={values.resolution[key]} placeholder={text('defaultValue')} onChange={event => change('resolution', { ...values.resolution, [key]: event.target.value })} {...issue('resolution')} /></div>)}<div className="field"><label htmlFor="setting-resolution-fullscreen">{text('resolutionFullscreen')}</label><select id="setting-resolution-fullscreen" data-testid="setting-resolution-fullscreen" value={flagValue(values.resolution.fullscreen)} onChange={event => change('resolution', { ...values.resolution, fullscreen: readFlag(event.target.value) })}><option value="inherit">{text('defaultValue')}</option><option value="enabled">{text('enabled')}</option><option value="disabled">{text('disabled')}</option></select></div>{values.resolution.monitor && <p className="text-muted settings-path">{text('monitorKept')}: {values.resolution.monitor}</p>}</div>}
      </fieldset>
      <fieldset disabled={disabled}><legend><Server size={18} aria-hidden="true" />{text('serverTitle')}</legend><p className="text-muted">{text('serverDesc')}</p><label className="settings-check"><input type="checkbox" data-testid="setting-server-enabled" checked={values.server.enabled} onChange={event => change('server', { ...values.server, enabled: event.target.checked })} />{text('serverEnabled')}</label>
        <div className="settings-grid"><div className="field"><label htmlFor="setting-server-host">{text('serverHost')}</label><input id="setting-server-host" data-testid="setting-server-host" value={values.server.host} onChange={event => change('server', { ...values.server, enabled: !!event.target.value || values.server.enabled, host: event.target.value })} spellCheck={false} {...issue('server')} /></div><div className="field"><label htmlFor="setting-server-port">{text('serverPort')}</label><input type="text" inputMode="numeric" id="setting-server-port" data-testid="setting-server-port" value={values.server.port} placeholder="25565" onChange={event => change('server', { ...values.server, port: event.target.value })} {...issue('server')} /></div><div className="field"><label htmlFor="setting-server-name">{text('serverName')}</label><input id="setting-server-name" data-testid="setting-server-name" value={values.server.name} onChange={event => change('server', { ...values.server, name: event.target.value })} /></div></div>
        <button type="button" className="button secondary" data-testid="setting-server-clear" disabled={!values.server.enabled && !values.server.host} onClick={() => change('server', instanceSettingsForm({ ...draft.base, server: null }).server)}>{text('serverClear')}</button>
      </fieldset>
      <fieldset disabled={disabled}><legend><Play size={18} aria-hidden="true" />{text('launchTitle')}</legend><div className="settings-grid">{([['fastLaunch', 'setting-fast-launch'], ['hideLauncher', 'setting-hide-launcher'], ['showLog', 'setting-show-log']] as const).map(([key, id]) => <div className="field" key={key}><label htmlFor={id}>{text(fieldLabels[key])}</label><select id={id} data-testid={id} value={flagValue(values[key])} onChange={event => change(key, readFlag(event.target.value))}><option value="inherit">{text('inherit')}</option><option value="enabled">{text('enabled')}</option><option value="disabled">{text('disabled')}</option></select></div>)}</div></fieldset>
      <div className="settings-actions"><button type="button" className="button secondary" data-testid="setting-reset-btn" disabled={disabled} onClick={() => openIntent({ kind: 'reset' })}><RotateCcw size={16} aria-hidden="true" />{text('resetDefaults')}</button><button type="button" className="button secondary" data-testid="setting-discard-btn" disabled={busy} onClick={discard}><Undo2 size={16} aria-hidden="true" />{text('discardChanges')}</button><button type="submit" className="button primary" data-testid="setting-save-btn" disabled={disabled || !!conflicts.length}><Save size={16} aria-hidden="true" />{text('saveChanges')}</button></div>
    </form>
    <Dialog.Root open={dialogOpen} onOpenChange={open => { if (!open) cancelIntent() }}><Dialog.Portal><Dialog.Overlay className="dialog-backdrop" /><Dialog.Content className="dialog creation-dialog operation-dialog settings-draft-dialog" data-testid="settings-draft-dialog" onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onOpenAutoFocus={event => { event.preventDefault(); if (blocker.state === 'blocked' && !intent) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; stay.current?.focus() }} onCloseAutoFocus={event => { event.preventDefault(); if (!allowExit.current) returnFocus.current?.focus() }}>
      <Dialog.Title>{text(intent?.kind === 'reset' ? 'resetDefaults' : intent?.kind === 'reload' ? 'reload' : 'leaveTitle')}</Dialog.Title><Dialog.Description>{text(intent?.kind === 'reset' ? 'resetConfirm' : intent?.kind === 'reload' ? 'reloadConfirm' : 'leaveHelp')}</Dialog.Description><div className="creation-body">{failure && <p ref={dialogErrorFocus} tabIndex={-1} role="alert" className="form-error">{errorText}</p>}{!!conflicts.length && <p className="form-error">{text('changed')}</p>}{busy && <p role="status">{text('saving')}</p>}</div>
      <div className="dialog-actions"><button ref={stay} type="button" className="button secondary" data-testid="settings-stay" disabled={busy} onClick={cancelIntent}>{text('stay')}</button>{intent?.kind === 'reload' ? <button type="button" className="button primary" data-testid="settings-reload-confirm" onClick={() => { discard(); setIntent(null) }}>{text('reload')}</button> : intent?.kind === 'reset' ? <button type="button" className="button primary" data-testid="settings-reset-confirm" disabled={disabled} onClick={async () => { if (await save(true)) setIntent(null) }}>{text('resetDefaults')}</button> : <><button type="button" className="button secondary" data-testid="settings-leave-discard" disabled={busy} onClick={leave}>{text('discardContinue')}</button><button type="button" className="button primary" data-testid="settings-leave-save" disabled={disabled || !!conflicts.length} onClick={async () => { if (await save()) leave() }}>{text('saveContinue')}</button></>}</div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>
}
