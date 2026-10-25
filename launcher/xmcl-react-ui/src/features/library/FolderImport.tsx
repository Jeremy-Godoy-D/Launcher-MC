import { useEffect, useRef, useState, type RefObject } from 'react'
import { FolderOpen } from 'lucide-react'
import { InstanceIOServiceKey, type InstanceType, type ThirdPartyLauncherManifest } from '@xmcl/runtime-api/src/services/InstanceIOService'
import { ModpackState } from '@xmcl/runtime-api/src/services/ModpackService'
import { InstanceDataSchema } from '../../../../packages/instance/instance'
import { useService } from '../../runtime'
import { useI18n } from '../../i18n'
import { importedOptions, validateImportFiles } from './creation'

export type FolderDraft = { type: InstanceType; path: string; candidates: ThirdPartyLauncherManifest['instances']; selected: number }
export function FolderImport({ locked, onReady, onName, draft }: { locked: boolean; onReady: (data: ModpackState | undefined) => void; onName: (name: string) => void; draft: RefObject<FolderDraft> }) {
  const { t } = useI18n()
  const service = useService(InstanceIOServiceKey)
  const [type, setType] = useState(draft.current.type)
  const [path, setPath] = useState(draft.current.path)
  const [candidates, setCandidates] = useState(draft.current.candidates)
  const [selected, setSelected] = useState(draft.current.selected)
  const [count, setCount] = useState<number>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const request = useRef(0)
  const ready = useRef(onReady), name = useRef(onName)
  ready.current = onReady; name.current = onName
  useEffect(() => { draft.current = { type, path, candidates, selected } }, [type, path, candidates, selected, draft])
  useEffect(() => {
    if (draft.current.selected >= 0) void select(draft.current.candidates[draft.current.selected], draft.current.selected)
    return () => { request.current++; ready.current(undefined) }
  }, [])
  async function select(candidate: ThirdPartyLauncherManifest['instances'][number], index: number) {
    const id = ++request.current
    setSelected(index); setBusy(true); setError(false); setCount(undefined); ready.current(undefined)
    try {
      const config = InstanceDataSchema.parse(candidate.options)
      importedOptions(config, 'Imported')
      const files = await service.previewFolderFiles(candidate.path, type)
      validateImportFiles(files)
      if (id !== request.current) return
      const value = new ModpackState()
      Object.assign(value, { config, files, ready: true, modpackPath: candidate.path })
      ready.current(value); name.current(config.name); setCount(files.length)
    } catch { if (id === request.current) setError(true) }
    finally { if (id === request.current) setBusy(false) }
  }
  async function inspect() {
    setBusy(true); setError(false)
    const id = ++request.current
    try {
      const picked = await window.windowController?.showOpenDialog?.({ properties: ['openDirectory'] })
      if (!picked || picked.canceled || !picked.filePaths[0]) return
      const source = picked.filePaths[0]
      ready.current(undefined)
      setCount(undefined)
      setPath(source); setCandidates([]); setSelected(-1)
      const data = await service.parseLauncherData(source, type)
      if (id !== request.current) return
      if (!data.instances.length) throw new Error('No Java profiles')
      setCandidates(data.instances)
      await select(data.instances[0], 0)
    } catch { if (id === request.current) setError(true) }
    finally { if (id === request.current) setBusy(false) }
  }
  return <div className="folder-import">
    <label htmlFor="import-folder-type">{t('react.create.folderType')}</label>
    <select id="import-folder-type" value={type} disabled={locked || busy} onChange={event => {
      request.current++; setType(event.target.value as InstanceType); setCandidates([]); setSelected(-1); setPath(''); setCount(undefined); setError(false); ready.current(undefined)
    }}>
      {(['vanilla', 'prism', 'modrinth', 'curseforge'] as const).map(type => <option key={type} value={type}>{({ vanilla: 'Minecraft Vanilla', prism: 'Prism / MultiMC', modrinth: 'Modrinth App', curseforge: 'CurseForge App' })[type]}</option>)}
    </select>
    <button type="button" className="button secondary" disabled={locked || busy} onClick={() => { void inspect() }}><FolderOpen size={18} aria-hidden="true" />{t('react.create.chooseFolder')}</button>
    {path && <p className="import-preview">{path}</p>}
    {!!candidates.length && <>
      <label htmlFor="import-folder-profile">{t('react.create.folderProfile')}</label>
      <select id="import-folder-profile" value={selected} disabled={locked || busy} onChange={event => { const index = Number(event.target.value); void select(candidates[index], index) }}>
        {candidates.map((candidate, index) => <option value={index} key={`${candidate.path}:${index}`}>{candidate.options.name} · {candidate.options.runtime?.minecraft}</option>)}
      </select>
    </>}
    {selected >= 0 && <p className="import-preview">{candidates[selected]?.path}</p>}
    {count !== undefined && <p role="status">Minecraft {candidates[selected]?.options.runtime?.minecraft} · {t('react.create.fileCount', { count })}</p>}
    {busy && <p role="status">{t('react.create.folderScanning')}</p>}
    {error && <p role="alert" className="form-error">{t('react.create.folderError')}</p>}
    <p className="form-help">{t('react.create.folderHelp')}</p>
  </div>
}
