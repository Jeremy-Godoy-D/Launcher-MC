import { useRef } from 'react'
import { X } from 'lucide-react'
import type { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import type { StateData } from '@launcher/renderer-client'
import packFormatVersionRange from '@xmcl/runtime-api/src/util/packFormatVersionRange'
import { useI18n } from '../../i18n'
import { usePanelFocus } from './usePanelFocus'
import { resourcePackDescription, resourcePackFormat } from './resourcePackMetadata'

export function PackDetails({ file, close }: { file: StateData<ResourceState>['files'][number]; close: () => void }) {
  const { t, n } = useI18n(), panel = useRef<HTMLElement>(null), first = useRef<HTMLButtonElement>(null)
  usePanelFocus(panel, first)
  const metadata = file.metadata.resourcepack, description = resourcePackDescription(metadata?.description), format = resourcePackFormat(metadata?.pack_format)
  return <section ref={panel} className="content-info" aria-labelledby="pack-info-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
    <div className="section-heading"><h2 id="pack-info-title">{t('react.packInfo.title')}</h2><button ref={first} className="icon-button" aria-label={t('react.packInfo.close')} onClick={close}><X size={20} aria-hidden="true" /></button></div>
    <dl className="content-metadata">
      <dt>{t('react.modInfo.file')}</dt><dd>{file.fileName}</dd>
      <dt>{t('react.packInfo.format')}</dt><dd>{format ?? t('react.modInfo.unknown')}</dd>
      <dt>{t('react.packInfo.range')}</dt><dd>{packFormatVersionRange[format ?? -1] || t('react.modInfo.unknown')}</dd>
      <dt>{t('react.modInfo.size')}</dt><dd>{t('react.modInfo.bytes', { size: n(file.size) })}</dd>
      <dt>SHA-1</dt><dd>{file.hash || t('react.modInfo.unknown')}</dd>
      <dt>{t('react.modInfo.origin')}</dt><dd>{file.metadata.modrinth ? `Modrinth · ${file.metadata.modrinth.projectId}` : file.metadata.curseforge ? `CurseForge · ${file.metadata.curseforge.projectId}` : t('react.content.local')}</dd>
    </dl>
    <p>{t('react.packInfo.help')}</p>
    {description.text ? <p className="content-description" tabIndex={0}>{description.text}</p> : <p>{t('react.packInfo.noDescription')}</p>}
    {description.truncated && <p role="status">{t('react.packInfo.truncated')}</p>}
  </section>
}
