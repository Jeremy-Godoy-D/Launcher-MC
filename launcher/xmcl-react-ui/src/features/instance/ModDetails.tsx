import { useMemo, useRef } from 'react'
import { X } from 'lucide-react'
import { describeModRule, getModRules, type ModLoader } from '@xmcl/runtime-api/src/util/modRules'
import type { SavedInstance } from '../library/model'
import { useI18n } from '../../i18n'
import { modModel, type ModResource } from './modModel'
import { usePanelFocus } from './usePanelFocus'

export function ModDetails({ file, runtime, close }: { file: ModResource; runtime: SavedInstance['runtime']; close: () => void }) {
  const { t, n } = useI18n(), first = useRef<HTMLButtonElement>(null), panel = useRef<HTMLElement>(null)
  const model = useMemo(() => modModel(file, runtime), [file, runtime])
  usePanelFocus(panel, first)
  const dependencies = model ? model.modLoaders.flatMap(loader => Object.entries(getModRules(model, loader as ModLoader)).filter(([, rules]) => rules.length).map(([kind, rules]) => ({ loader, kind, rules }))) : []
  const words = { any: t('react.modDiagnostics.any'), all: t('react.modDiagnostics.all'), unless: t('react.modDiagnostics.unless'), optional: t('react.modInfo.optional') }
  const authors = Array.isArray(model?.authors) ? model.authors.filter(author => typeof author === 'string').join(', ') : ''
  return <section ref={panel} className="content-info" aria-labelledby="mod-info-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
    <div className="section-heading"><h2 id="mod-info-title">{t('react.modInfo.title')}</h2><button ref={first} className="icon-button" aria-label={t('react.modInfo.close')} onClick={close}><X size={20} aria-hidden="true" /></button></div>
    <dl className="content-metadata">
      <dt>{t('react.modInfo.file')}</dt><dd>{file.fileName}</dd>
      <dt>{t('react.modInfo.version')}</dt><dd>{typeof model?.version === 'string' ? model.version : '—'}</dd>
      <dt>{t('react.modInfo.loaders')}</dt><dd>{model?.modLoaders.join(', ') || t('react.modInfo.unknown')}</dd>
      {authors && <><dt>{t('react.modInfo.authors')}</dt><dd>{authors}</dd></>}
      <dt>{t('react.modInfo.size')}</dt><dd>{t('react.modInfo.bytes', { size: n(file.size) })}</dd>
      <dt>SHA-1</dt><dd>{file.hash}</dd>
      <dt>{t('react.modInfo.origin')}</dt><dd>{file.metadata.modrinth ? `Modrinth · ${file.metadata.modrinth.projectId}` : file.metadata.curseforge ? `CurseForge · ${file.metadata.curseforge.projectId}` : t('react.content.local')}</dd>
    </dl>
    {typeof model?.description === 'string' && model.description && <p className="content-description" tabIndex={0}>{model.description}</p>}
    {!model && <p role="alert" className="form-error">{t('react.modInfo.failed')}</p>}
    <h3>{t('react.modInfo.dependencies')}</h3>
    {!dependencies.length && <p>{t('react.modInfo.noDependencies')}</p>}
    {dependencies.map(({ loader, kind, rules }) => <div key={`${loader}:${kind}`}><h4>{loader} · {t(`react.modDiagnostics.rule.${kind}`)}</h4><ul>{rules.map((rule, index) => <li key={index}>{describeModRule(rule, words)}</li>)}</ul></div>)}
  </section>
}
