import { useState } from 'react'
import { JavaServiceKey, JavaState } from '@xmcl/runtime-api/src/services/JavaService'
import { useService, useSharedState } from '../../runtime'
import { useI18n } from '../../i18n'
import type { AdvancedCreation, LinkPreferences } from './creation'

function JavaChoice({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (path: string) => void }) {
  const { t } = useI18n()
  const java = useService(JavaServiceKey)
  const state = useSharedState({ key: 'java', Type: JavaState, load: client => client.service(JavaServiceKey).getJavaState() })
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  return <>
    <label htmlFor="creation-java">Java</label>
    <select id="creation-java" value={value} disabled={disabled || busy} onChange={event => onChange(event.target.value)}>
      <option value="">{t('react.create.javaAutomatic')}</option>
      {state.data?.all.filter(java => java.valid).map(java => <option key={java.path} value={java.path}>Java {java.majorVersion} · {java.path}</option>)}
      {value && !state.data?.all.some(java => java.path === value) && <option value={value}>{value}</option>}
    </select>
    <button type="button" className="button secondary" disabled={disabled || busy} onClick={() => {
      setBusy(true); setError(false)
      void Promise.resolve(window.windowController?.showOpenDialog?.({ properties: ['openFile'], filters: [{ name: 'Java', extensions: ['exe'] }] })).then(async result => {
        if (!result) throw new Error('File picker unavailable')
        if (result.canceled || !result.filePaths[0]) return
        const resolved = await java.resolveJava(result.filePaths[0])
        if (!resolved) throw new Error('Invalid Java')
        onChange(resolved.path)
      }).catch(() => setError(true)).finally(() => setBusy(false))
    }}>{t('react.create.chooseJava')}</button>
    {(error || state.status === 'error') && <p role="alert" className="form-error">{t('react.create.javaError')}</p>}
  </>
}

export function AdvancedCreate({ value, onChange, links, onLinks, locked, storageError }: {
  value: AdvancedCreation; onChange: (value: AdvancedCreation) => void
  links: LinkPreferences; onLinks: (value: LinkPreferences) => void; locked: boolean; storageError: boolean
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const set = <K extends keyof AdvancedCreation>(key: K, next: AdvancedCreation[K]) => onChange({ ...value, [key]: next })
  return <details className="creation-advanced" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>{t('react.create.advanced')}</summary>
    {expanded && <div className="creation-advanced-body">
      <label htmlFor="creation-description">{t('react.create.descriptionLabel')}</label>
      <textarea id="creation-description" value={value.description} maxLength={1000} disabled={locked} onChange={event => set('description', event.target.value)} />
      <label htmlFor="creation-author">{t('react.create.author')}</label>
      <input id="creation-author" value={value.author} maxLength={100} disabled={locked} onChange={event => set('author', event.target.value)} />
      <JavaChoice value={value.java} onChange={path => set('java', path)} disabled={locked} />
      <p className="form-help">{t('react.create.javaHelp')}</p>
      <label htmlFor="creation-memory">{t('react.create.memory')}</label>
      <select id="creation-memory" value={value.memory} disabled={locked} onChange={event => set('memory', event.target.value as AdvancedCreation['memory'])}>
        {(['inherit', 'auto', 'manual'] as const).map(mode => <option key={mode} value={mode}>{t(`react.create.memory_${mode}`)}</option>)}
      </select>
      {value.memory === 'manual' && <>
        <label htmlFor="creation-min">{t('react.create.minMemory')}</label>
        <input id="creation-min" type="number" min="0" step="1" value={value.min} disabled={locked} onChange={event => set('min', event.target.value)} />
        <label htmlFor="creation-max">{t('react.create.maxMemory')}</label>
        <input id="creation-max" type="number" min="1" step="1" required value={value.max} disabled={locked} onChange={event => set('max', event.target.value)} />
      </>}
      <fieldset>
        <legend>{t('react.create.shared')}</legend>
        <p className="form-help">{t('react.create.sharedHelp')}</p>
        {(['saves', 'resourcepacks', 'shaderpacks', 'options', 'servers'] as const).map(key => <label className="creation-check" key={key}>
          <input type="checkbox" checked={links[key]} disabled={locked} onChange={event => onLinks({ ...links, [key]: event.target.checked })} />
          {t(`react.create.link_${key}`)}
        </label>)}
      </fieldset>
      {storageError && <p role="status">{t('react.create.linkStorageError')}</p>}
    </div>}
  </details>
}
