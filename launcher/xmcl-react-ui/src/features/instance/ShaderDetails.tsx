import { useRef } from 'react'
import { X } from 'lucide-react'
import type { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import type { StateData } from '@launcher/renderer-client'
import { useI18n } from '../../i18n'
import { usePanelFocus } from './usePanelFocus'

export function ShaderDetails({ file, close }: { file: StateData<ResourceState>['files'][number]; close: () => void }) {
  const { t, n } = useI18n(), panel = useRef<HTMLElement>(null), first = useRef<HTMLButtonElement>(null)
  usePanelFocus(panel, first)
  const sources = [file.metadata.modrinth && `Modrinth · ${file.metadata.modrinth.projectId}`, file.metadata.curseforge && `CurseForge · ${file.metadata.curseforge.projectId}`].filter(Boolean)
  return <section ref={panel} className="content-info" aria-labelledby="shader-info-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
    <div className="section-heading"><h2 id="shader-info-title">{t('react.shaders.infoTitle')}</h2><button ref={first} className="icon-button" aria-label={t('react.shaders.infoClose')} onClick={close}><X size={20} aria-hidden="true" /></button></div>
    <dl className="content-metadata">
      <dt>{t('react.modInfo.file')}</dt><dd>{file.fileName}</dd>
      <dt>{t('react.shaders.infoKind')}</dt><dd>{file.isDirectory ? t('react.shaders.unpacked') : 'ZIP'}</dd>
      <dt>{t('react.modInfo.size')}</dt><dd>{file.isDirectory ? t('react.shaders.folderSize') : t('react.modInfo.bytes', { size: n(file.size) })}</dd>
      <dt>SHA-1</dt><dd>{/^[a-f0-9]{40}$/i.test(file.hash) ? file.hash : t('react.modInfo.unknown')}</dd>
      <dt>{t('react.modInfo.origin')}</dt><dd>{sources.length ? sources.join(' · ') : t('react.shaders.local')}</dd>
    </dl>
    <p>{t('react.shaders.infoHelp')}</p>
  </section>
}
