import { useMemo, useRef, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { JavaServiceKey, JavaState } from '@xmcl/runtime-api/src/services/JavaService'
import { createModContext, diagnoseMods } from '@xmcl/runtime-api/src/util/modDiagnostics'
import { describeModRule } from '@xmcl/runtime-api/src/util/modRules'
import type { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import type { ModFilesSnapshot } from '@xmcl/runtime-api/src/services/InstanceModsService'
import type { StateData } from '@launcher/renderer-client'
import { useSharedStateStore } from '../../runtime'
import { useI18n } from '../../i18n'
import type { SavedInstance } from '../library/model'
import { modModel, type ModResource } from './modModel'
import { usePanelFocus } from './usePanelFocus'

export function ModDiagnostics({ files, errors, inventory, runtime, configuredJava, close, inspect }: { files: readonly ModResource[]; errors: StateData<ResourceState>['errors']; inventory: ModFilesSnapshot; runtime: SavedInstance['runtime']; configuredJava?: SavedInstance['java']; close: () => void; inspect: (path: string) => void }) {
  const { t } = useI18n(), panel = useRef<HTMLElement>(null), first = useRef<HTMLButtonElement>(null)
  usePanelFocus(panel, first)
  const javaStore = useSharedStateStore({ key: 'java', Type: JavaState, load: client => client.service(JavaServiceKey).getJavaState() })
  const java = useSyncExternalStore(javaStore.subscribe, javaStore.getSnapshot, javaStore.getSnapshot)
  const javaVersion = configuredJava ? java.data?.all.find(record => record.valid && record.path === configuredJava)?.version : undefined
  const models = useMemo(() => files.map(file => ({ file, model: modModel(file, runtime) })), [files, runtime])
  const parsed = useMemo(() => models.flatMap(({ model }) => model ? [model] : []), [models])
  const issues = useMemo(() => diagnoseMods(parsed, createModContext(parsed, runtime, undefined, javaVersion)), [parsed, runtime, javaVersion])
  const failed = models.filter(item => !item.model).map(item => item.file.fileName)
  const received = new Map(files.map(file => [file.path, file])), broken = new Set(errors.map(error => error.path))
  const pending = inventory.entries.filter(entry => {
    const file = received.get(entry.path)
    return !entry.directory && !broken.has(entry.path) && (!file || file.size !== entry.size || file.mtime !== entry.mtime)
  })
  const words = { any: t('react.modDiagnostics.any'), all: t('react.modDiagnostics.all'), unless: t('react.modDiagnostics.unless'), optional: t('react.modInfo.optional') }
  const errorCount = issues.filter(issue => issue.severity === 'error').length
  return <section ref={panel} className="content-info content-diagnostics" aria-labelledby="mod-diagnostics-title" aria-busy={java.status === 'loading' || !!pending.length} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
    <div className="section-heading"><h2 id="mod-diagnostics-title">{t('react.modDiagnostics.title')}</h2><button ref={first} className="icon-button" aria-label={t('react.modDiagnostics.close')} onClick={close}><X size={20} aria-hidden="true" /></button></div>
    <p>{t('react.modDiagnostics.help')}</p>
    <p role="status">{t('react.modDiagnostics.count', { errors: errorCount, uncertain: issues.length - errorCount + failed.length + errors.length + pending.length })}</p>
    {!!pending.length && <p>{t('react.modDiagnostics.pending')} {pending.map(entry => entry.fileName).join(', ')}</p>}
    {javaVersion && <p>{t('react.modDiagnostics.javaKnown', { version: javaVersion })}</p>}
    {java.status === 'loading' && <p role="status">{t('react.modDiagnostics.javaLoading')}</p>}
    {java.status === 'error' && <p role="alert" className="form-error">{t('react.modDiagnostics.javaFailed')} <button className="button secondary" onClick={() => void javaStore.revalidate()}>{t('react.modDiagnostics.javaRetry')}</button></p>}
    {!issues.length && !failed.length && !errors.length && !pending.length && java.status !== 'loading' && <p>{t('react.modDiagnostics.clear')}</p>}
    {!!failed.length && <p role="alert" className="form-error">{t('react.modDiagnostics.metadataFailed')} {failed.join(', ')}</p>}
    {!!errors.length && <p role="alert" className="form-error">{t('react.modDiagnostics.parseFailed')} {errors.map(error => error.path.split(/[\\/]/).pop()).join(', ')}</p>}
    <ul className="mod-diagnostic-list">{issues.map(issue => <li key={issue.key} data-severity={issue.severity}>
      <div><strong>{issue.files.join(', ')}</strong><span>{t(`react.modDiagnostics.kind.${issue.kind}`)}{issue.id && ` · ${issue.id}`}</span>{issue.rule && <span>{describeModRule(issue.rule, words)}</span>}<small>{t(`react.modDiagnostics.severity.${issue.severity}`)}</small></div>
      <button className="button secondary" aria-label={t('react.modDiagnostics.inspect', { file: issue.files[0] })} onClick={() => inspect(issue.path)}>{t('react.modDiagnostics.details')}</button>
    </li>)}</ul>
  </section>
}
