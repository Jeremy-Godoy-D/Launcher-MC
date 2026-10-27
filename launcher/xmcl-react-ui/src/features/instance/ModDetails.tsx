import { useLayoutEffect, useMemo, useRef } from 'react'
import { X } from 'lucide-react'
import { getModFileFromResource } from '@xmcl/runtime-api/src/util/mod'
import type { StateData } from '@launcher/renderer-client'
import type { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import type { SavedInstance } from '../library/model'
import { useI18n } from '../../i18n'

type File = StateData<ResourceState>['files'][number]
export function ModDetails({ file, runtime, close }: { file: File; runtime: SavedInstance['runtime']; close: () => void }) {
  const { t, n } = useI18n(), first = useRef<HTMLButtonElement>(null), panel = useRef<HTMLElement>(null)
  const model = useMemo(() => {
    // Normalize a private copy rather than handing legacy code the frozen native snapshot.
    try { return getModFileFromResource(structuredClone(file) as ResourceState['files'][number], runtime) } catch { return undefined }
  }, [file, runtime])
  useLayoutEffect(() => {
    first.current?.focus()
    let frame = 0
    const resize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { const target = document.activeElement; if (target instanceof HTMLElement && panel.current?.contains(target)) target.scrollIntoView({ block: 'nearest', inline: 'nearest' }) })
    }
    window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [])
  const dependencies = Object.entries(model?.dependencies || {}).filter(([, deps]) => deps.length)
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
    {dependencies.map(([loader, deps]) => <div key={loader}><h4>{loader}</h4><ul>{deps.map((dep, index) => <li key={index}>{typeof dep.modId === 'string' ? dep.modId : '?'} · {typeof dep.versionRange === 'string' ? dep.versionRange : Array.isArray(dep.semanticVersion) ? dep.semanticVersion.filter(value => typeof value === 'string').join(' || ') : typeof dep.semanticVersion === 'string' ? dep.semanticVersion : '?'}{dep.optional && ` · ${t('react.modInfo.optional')}`}</li>)}</ul></div>)}
  </section>
}
