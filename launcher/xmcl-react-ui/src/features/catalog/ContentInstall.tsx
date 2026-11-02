import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router'
import type { InstanceFile } from '../../../../packages/instance/files'
import { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import type { InstanceResourcesService } from '@xmcl/runtime-api/src/services/InstanceResourcesService'
import { InstanceModsServiceKey } from '@xmcl/runtime-api/src/services/InstanceModsService'
import { InstanceResourcePacksServiceKey } from '@xmcl/runtime-api/src/services/InstanceResourcePacksService'
import { InstanceShaderPacksServiceKey } from '@xmcl/runtime-api/src/services/InstanceShaderPacksService'
import { InstanceInstallServiceKey, type InstallInstanceOptions, type InstanceFileUpdate, type ReviewedModRecovery, type ReviewedModInstall } from '@xmcl/runtime-api/src/services/InstanceInstallService'
import { TaskState } from '@xmcl/runtime-api/src/task'
import { createOperationId } from '@xmcl/runtime-api/src/util/launch'
import { useService, useSharedStateStore, useTasks } from '../../runtime'
import { useI18n } from '../../i18n'
import { useLibrary } from '../library/context'
import type { SavedInstance } from '../library/model'
import { isOperationCancelled } from '../library/operations'
import { updateLoaders, updateMods, shaderUpdateLoader } from '../instance/queryModUpdates'
import { catalogClients, type CatalogProject } from './api'
import { CatalogRequirementError, resolveCatalogDependencies, type CatalogVersion, type DependencyNode } from './dependencies'
import { waitCatalogInventory } from './inventory'

export type ContentSelection = { project: CatalogProject; candidate: CatalogVersion; target: SavedInstance }
type Plan = Awaited<ReturnType<typeof resolveCatalogDependencies>>
type Review = { options: Extract<InstallInstanceOptions, { oldFiles: InstanceFile[] }>; changes: InstanceFileUpdate[] } | ({ operationId: string } & ReviewedModRecovery)
const candidateId = (node: CatalogVersion) => node.provider === 'modrinth' ? node.version.id : String(node.file.id)
const installedId = (node: DependencyNode) => node.provider === 'modrinth' ? node.current?.modrinth?.versionId : String(node.current?.curseforge?.fileId)
const needed = (node: DependencyNode) => !node.current || installedId(node) !== candidateId(node) || node.activate

export function ContentInstall({ selection, onBack, onBusy }: { selection: ContentSelection; onBack: () => void; onBusy: (busy: boolean) => void }) {
  const captured = useRef(selection).current, { target, project } = captured, path = target.path
  const domain = project.kind === 'mod' ? 'mods' : project.kind === 'shader' ? 'shaderpacks' : 'resourcepacks'
  const mods = useService(InstanceModsServiceKey), packs = useService(InstanceResourcePacksServiceKey), shaders = useService(InstanceShaderPacksServiceKey)
  const service = useService<InstanceResourcesService>(domain === 'mods' ? InstanceModsServiceKey : domain === 'resourcepacks' ? InstanceResourcePacksServiceKey : InstanceShaderPacksServiceKey)
  const installs = useService(InstanceInstallServiceKey), tasks = useTasks(), library = useLibrary(), navigate = useNavigate(), { t, n } = useI18n()
  const store = useSharedStateStore({ key: `instance-${domain}://${path}`, Type: ResourceState, load: client => client.service(domain === 'mods' ? InstanceModsServiceKey : domain === 'resourcepacks' ? InstanceResourcePacksServiceKey : InstanceShaderPacksServiceKey).watch(path) })
  const resources = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const engines = useSharedStateStore({ key: `instance-mods://${path}`, Type: ResourceState, load: client => client.service(InstanceModsServiceKey).watch(path) })
  const requiredPacks = useSharedStateStore({ key: `instance-resourcepacks://${path}`, Type: ResourceState, load: client => client.service(InstanceResourcePacksServiceKey).watch(path) })
  const requiredShaders = useSharedStateStore({ key: `instance-shaderpacks://${path}`, Type: ResourceState, load: client => client.service(InstanceShaderPacksServiceKey).watch(path) })
  const [phase, setPhase] = useState<'prepare' | 'review' | 'install' | 'done' | 'error'>('prepare')
  const [plan, setPlan] = useState<Plan>(), [review, setReview] = useState<Review>(), [error, setError] = useState(''), [optional, setOptional] = useState(new Set<string>()), [pending, setPending] = useState<ReviewedModInstall[]>([])
  const [cancelRequested, setCancelRequested] = useState(false)
  const [requirement, setRequirement] = useState<CatalogRequirementError['requirement']>()
  const alive = useRef(true), started = useRef(false), working = useRef(false), controller = useRef<AbortController | null>(null), request = useRef(''), cancelling = useRef(false), cancelledTask = useRef('')
  const message = useRef<HTMLParagraphElement>(null), cancelButton = useRef<HTMLButtonElement>(null)
  const engineSnapshot = useRef('')
  const busy = phase === 'prepare' || phase === 'install'
  useEffect(() => domain === 'shaderpacks' ? engines.subscribe(() => {}) : undefined, [domain, engines])
  const active = tasks.tasks.find(task => task.state === TaskState.Running && (task.type === 'resolveMarketFiles' && task.operationId === request.current || task.type === 'installInstance' && task.instancePath === path && task.taskId === request.current))
  const progress = active?.progress && typeof active.progress === 'object' ? active.progress : undefined
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort() } }, [])
  useEffect(() => { onBusy(busy) }, [busy])
  useEffect(() => { if (error) message.current?.focus() }, [error])
  useEffect(() => {
    if (!active) return
    cancelButton.current?.focus()
    if (cancelling.current && cancelledTask.current !== active.id) { cancelledTask.current = active.id; void tasks.cancel(active.id).catch(() => { if (alive.current) setError('cancelFailed') }) }
  }, [active?.id])
  useEffect(() => {
    let active = true
    if (resources.status === 'error') { setError('failed'); setPhase('error'); return }
    if (resources.status === 'ready' && !started.current) queueMicrotask(() => { if (active && !started.current) { started.current = true; void prepare(optional) } })
    return () => { active = false }
  }, [resources.status])
  const snapshotFiles = () => domain === 'mods' ? mods.getModFilesSnapshot(path) : domain === 'shaderpacks' ? shaders.getShaderFilesSnapshot(path) : packs.getPackFilesSnapshot(path)
  async function readPending() {
    const plans = await installs.getReviewedModInstalls(path, domain)
    if (alive.current) setPending(plans)
    return plans
  }
  async function prepare(selected: Set<string>) {
    if (working.current || resources.status !== 'ready' || !resources.data) return
    working.current = true; controller.current?.abort(); const abort = new AbortController(); controller.current = abort
    request.current = createOperationId(); cancelling.current = false; setCancelRequested(false); cancelledTask.current = ''; setError(''); setRequirement(undefined); setPhase('prepare'); setReview(undefined)
    try {
      if ((await readPending()).length) throw Object.assign(new Error('Pending reviewed installation'), { code: 'pending' })
      await store.revalidate()
      const inventory = await snapshotFiles()
      if (inventory.configuration && Object.keys({ ...target.runtime, ...inventory.configuration.runtime }).some(key => target.runtime[key as keyof typeof target.runtime] !== inventory.configuration!.runtime[key as keyof typeof target.runtime])) throw Object.assign(new Error('Instance runtime changed'), { code: 'incompatible' })
      const files = await waitCatalogInventory(store, inventory.entries, domain, AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]))
      const sources = domain === 'mods' ? await mods.getModSources(path) : domain === 'shaderpacks' ? await shaders.getShaderSources(path) : await packs.getPackSources(path)
      const current = updateMods(files, target.runtime, sources)
      let loader = ''
      try {
        if (domain === 'mods') loader = updateLoaders(target.runtime)[0]
        if (domain === 'shaderpacks') {
          await engines.revalidate()
          const metadata = await mods.getModFilesSnapshot(path)
          await waitCatalogInventory(engines, metadata.entries, 'mods', AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]))
          const selection = await shaders.getSelection(path)
          if (selection.metadataPending) throw new Error('Shader engine metadata pending')
          loader = shaderUpdateLoader(selection.engine); engineSnapshot.current = selection.snapshot
        }
      } catch { throw Object.assign(new Error('Missing compatible runtime'), { code: 'incompatible' }) }
      type Kind = CatalogRequirementError['requirement']['kind']
      const inventories = new Map<Kind, Promise<ReturnType<typeof updateMods>>>()
      const readRequired = (kind: Kind) => {
        if (!inventories.has(kind)) inventories.set(kind, (async () => {
          const requiredDomain = kind === 'mod' ? 'mods' : kind === 'shader' ? 'shaderpacks' : 'resourcepacks'
          if (requiredDomain === domain) return current.filter(file => !/\.disabled$/i.test(file.fileName))
          const other = requiredDomain === 'mods' ? engines : requiredDomain === 'shaderpacks' ? requiredShaders : requiredPacks, stop = other.subscribe(() => {})
          try {
            await other.revalidate()
            const snapshot = requiredDomain === 'mods' ? await mods.getModFilesSnapshot(path) : requiredDomain === 'shaderpacks' ? await shaders.getShaderFilesSnapshot(path) : await packs.getPackFilesSnapshot(path)
            const files = await waitCatalogInventory(other, snapshot.entries, requiredDomain, AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]))
            const sources = requiredDomain === 'mods' ? await mods.getModSources(path) : requiredDomain === 'shaderpacks' ? await shaders.getShaderSources(path) : await packs.getPackSources(path)
            return updateMods(files, target.runtime, sources).filter(file => !/\.disabled$/i.test(file.fileName))
          } finally { stop() }
        })())
        return inventories.get(kind)!
      }
      const installedRequirement = async (requirement: CatalogRequirementError['requirement'], version: string | undefined) => {
          const present = (await readRequired(requirement.kind)).filter(file => requirement.provider === 'modrinth' ? file.modrinth?.projectId === requirement.id : String(file.curseforge?.projectId) === requirement.id)
          if (present.length !== 1) return undefined
          let loaders: string[] = []
          if (requirement.kind === 'mod') { const loader = updateLoaders(target.runtime)[0]; loaders = loader === 'quilt' ? ['quilt', 'fabric'] : [loader] }
          if (requirement.kind === 'shader') {
            const stop = engines.subscribe(() => {})
            try { await engines.revalidate(); await readRequired('mod'); const selected = await shaders.getSelection(path); if (!selected.engine || selected.metadataPending) return undefined; loaders = selected.engine === 'iris' ? ['iris', 'optifine'] : ['optifine'] }
            finally { stop() }
          }
          if (requirement.provider === 'modrinth') {
            const id = present[0].modrinth!.versionId
            if (version && version !== id) return undefined
            const value = await catalogClients.modrinth.getProjectVersion(id, abort.signal)
            if (value.id !== id || value.project_id !== requirement.id || !value.game_versions.includes(target.runtime.minecraft) || loaders.length && !loaders.some(loader => value.loaders.includes(loader)) || !value.files.some(file => file.hashes.sha1 === present[0].hash)) return undefined
            return id
          }
          const id = present[0].curseforge!.fileId, values = await catalogClients.curseforge.getFiles([id], abort.signal), value = values.find(file => file.id === id)
          const declared = value?.gameVersions.map(tag => tag.toLowerCase().replace(/[ _-]/g, '')).filter(tag => ['fabric', 'quilt', 'forge', 'neoforge'].includes(tag)) || []
          if (!value || value.modId !== Number(requirement.id) || value.gameId !== 432 || !value.gameVersions.includes(target.runtime.minecraft) || requirement.kind === 'mod' && declared.length > 0 && !loaders.some(loader => declared.includes(loader)) || !value.hashes.some(hash => hash.algo === 1 && hash.value.toLowerCase() === present[0].hash)) return undefined
          return String(id)
      }
      const installedConflict = async (provider: 'modrinth' | 'curseforge', id: string, version: string | undefined) => {
        for (const kind of ['mod', 'resourcepack', 'shader'] as const) if ((await readRequired(kind)).some(file => provider === 'modrinth' ? file.modrinth?.projectId === id && (!version || file.modrinth.versionId === version) : String(file.curseforge?.projectId) === id && (!version || String(file.curseforge?.fileId) === version))) return true
        return false
      }
      const result = await resolveCatalogDependencies(captured.candidate, project, target.runtime.minecraft, loader, current, selected, { ...catalogClients, installedRequirement, installedConflict }, abort.signal)
      abort.signal.throwIfAborted()
      const changes = result.selected.filter(needed)
      const options: Extract<InstallInstanceOptions, { oldFiles: InstanceFile[] }> = { path, files: [], oldFiles: [], review: { ...(domain !== 'mods' ? { domain } : {}), snapshot: inventory.fingerprint, changes: [] } }
      if (changes.length) {
        const first = changes[0]
        const selectors = first.provider === 'modrinth'
          ? { market: 0 as const, version: changes.map(node => { if (node.provider !== 'modrinth') throw new Error('Provider changed'); return { versionId: node.version.id, projectId: node.project.id, ...(node.key === `${project.provider}:${project.id}` && project.icon ? { icon: project.icon } : {}) } }) }
          : { market: 1 as const, file: changes.map(node => { if (node.provider !== 'curseforge') throw new Error('Provider changed'); return { fileId: node.file.id, projectId: Number(node.project.id), ...(node.key === `${project.provider}:${project.id}` && project.icon ? { icon: project.icon } : {}) } }) }
        const resolved = await service.resolveFromMarket({ ...selectors, instancePath: path, id: request.current })
        abort.signal.throwIfAborted()
        for (const node of changes) {
          const found = resolved.find(file => node.provider === 'modrinth' ? file.modrinth?.projectId === node.project.id && file.modrinth.versionId === node.version.id : file.curseforge?.projectId === Number(node.project.id) && file.curseforge.fileId === node.file.id)
          if (!found || !/^[a-f0-9]{40}$/i.test(found.hashes.sha1 || '')) throw Object.assign(new Error('Missing file integrity'), { code: 'integrity' })
          const file = structuredClone(found)
          if (node.current) {
            options.oldFiles.push({ path: `${domain}/${node.current.fileName}`, hashes: { sha1: node.current.hash }, size: node.current.size, modrinth: node.current.modrinth, curseforge: node.current.curseforge })
            if (domain !== 'mods') file.path = `${domain}/${node.current.fileName}`
            else if (/\.disabled$/i.test(node.current.fileName) && !node.activate) file.path += '.disabled'
            if (node.activate) file.path = file.path.replace(/\.disabled$/i, '')
          } else if (inventory.entries.some(entry => entry.fileName.toLowerCase() === file.path.split('/').at(-1)!.toLowerCase()) && !files.some(existing => existing.fileName.toLowerCase() === file.path.split('/').at(-1)!.toLowerCase() && existing.hash === file.hashes.sha1)) throw Object.assign(new Error('Occupied filename'), { code: 'filenameConflict' })
          options.files.push(file)
        }
        if (new Set(options.files.map(file => file.path.toLowerCase())).size !== options.files.length) throw Object.assign(new Error('Conflicting filenames'), { code: 'filenameConflict' })
      }
      const updates = options.files.length ? await installs.previewInstanceFiles(options) : []
      abort.signal.throwIfAborted()
      options.review!.changes = updates.map(update => ({ path: update.file.path, operation: update.operation }))
      if (alive.current) { setPlan(result); setOptional(new Set(selected)); setReview({ options, changes: updates }); setPhase('review') }
    } catch (failure) {
      if (alive.current) {
        if (failure instanceof CatalogRequirementError) { setRequirement(failure.requirement); setError('requirement') }
        else setError(isOperationCancelled(failure) || abort.signal.aborted ? 'cancelled' : failure && typeof failure === 'object' && 'code' in failure && typeof failure.code === 'string' && ['incompatible', 'conflict', 'unavailable', 'tooMany', 'pending', 'integrity', 'filenameConflict'].includes(failure.code) ? failure.code : 'failed')
        setPhase('error')
      }
    } finally { working.current = false }
  }
  async function recover(operationId: string) {
    if (working.current) return
    working.current = true; cancelling.current = false; setCancelRequested(false); cancelledTask.current = ''; request.current = operationId; const abort = new AbortController(); controller.current = abort; setError(''); setPhase('prepare')
    try {
      const result = await installs.previewModInstallRecovery(path, request.current)
      abort.signal.throwIfAborted()
      if (result.configurationChanged) throw Object.assign(new Error('Configuration changed'), { code: 'incompatible' })
      if (alive.current) { setReview({ ...result, operationId: request.current }); setPhase('review') }
    } catch { if (alive.current) { setError(abort.signal.aborted ? 'cancelled' : 'recoveryFailed'); setPhase('error') } }
    finally { working.current = false }
  }
  async function install() {
    if (working.current || !review || phase !== 'review' || !review.changes.some(change => change.operation !== 'keep')) return
    working.current = true; cancelling.current = false; setCancelRequested(false); cancelledTask.current = ''; setError(''); setPhase('install')
    const prepared = review
    try {
      if (domain === 'shaderpacks' && 'options' in prepared && (await shaders.getSelection(path)).snapshot !== engineSnapshot.current) throw new Error('Shader configuration changed')
      if ('options' in prepared) await installs.installInstanceFiles({ ...prepared.options, id: request.current })
      else { const errors = await installs.resumeInstanceInstall(path, undefined, prepared.operationId, prepared.review); if (errors?.length) throw new Error('Unresolved files') }
      if ((await readPending()).length) throw new Error('Pending files')
      await store.revalidate()
      if (store.getSnapshot().status === 'error') throw new Error('Inventory refresh failed')
      if (alive.current) setPhase('done')
    } catch (failure) {
      if (alive.current) { setError(isOperationCancelled(failure) ? 'cancelled' : 'installFailed'); setPhase('error'); await readPending().catch(() => setError('recoveryFailed')) }
    } finally { working.current = false }
  }
  async function cancel() {
    if (!busy) { onBack(); return }
    if (cancelling.current) return
    cancelling.current = true; setCancelRequested(true); controller.current?.abort()
    if (!working.current) { started.current = true; setError('cancelled'); setPhase('error'); return }
    if (active) { cancelledTask.current = active.id; try { await tasks.cancel(active.id) } catch { setError('cancelFailed') } }
  }
  function showTarget() { library?.select(path, () => void navigate(`/instance/${domain}`)) }
  function retry() {
    if (resources.status === 'error') { started.current = false; setError(''); setPhase('prepare'); void store.revalidate(); return }
    void prepare(optional)
  }
  const hasChanges = !!review?.changes.some(change => change.operation !== 'keep')
  return <form className="operation-form catalog-install" data-testid="catalog-install" onSubmit={event => { event.preventDefault(); void install() }}>
    <div className="creation-body" role="region" aria-label={t('react.catalogInstall.review')} tabIndex={0}>
      <h3>{t('react.catalogInstall.destination', { name: target.name })}</h3>
      <p>{target.runtime.minecraft} · {path}</p>
      <p className="form-help">{t('react.catalogInstall.help')}</p>
      {busy && <div role="status"><p>{t(cancelRequested ? 'react.catalog.cancelling' : phase === 'prepare' ? 'react.catalogInstall.preparing' : 'react.catalogInstall.installing')}</p><progress aria-label={t('react.catalogInstall.progress')} max={progress && progress.total > 0 ? progress.total : undefined} value={progress && progress.total > 0 ? progress.progress : undefined} /></div>}
      {error && <p ref={message} tabIndex={-1} role="alert" className="form-error" data-testid="catalog-install-error">{t(`react.catalogInstall.${error}`)}</p>}
      {requirement && <p>{requirement.name} <button type="button" className="button secondary" data-testid="catalog-required-project" onClick={() => { const params = new URLSearchParams({ source: requirement.provider, kind: requirement.kind, target: path }); void navigate(`/store/${requirement.provider}/${requirement.id}?${params}`) }}>{t('react.catalogInstall.reviewRequirement')}</button></p>}
      {error === 'incompatible' && domain === 'shaderpacks' && <button type="button" className="button secondary" onClick={() => library?.select(path, () => void navigate('/instance/mods'))}>{t('react.shaders.manageMods')}</button>}
      {plan && <ul className="catalog-install-projects">{plan.selected.map(node => <li key={node.key}><strong>{node.project.name}</strong><span>{candidateId(node)} · {t(node.activate ? 'react.catalogInstall.activate' : needed(node) ? node.current ? 'react.catalogInstall.replace' : 'react.catalogInstall.add' : 'react.catalogInstall.installed')}</span></li>)}</ul>}
      {!!plan?.satisfied.length && <ul className="catalog-install-projects">{plan.satisfied.map(node => <li key={`${node.provider}:${node.id}`}><strong>{node.name}</strong><span>{node.version} · {t('react.catalogInstall.installed')}</span></li>)}</ul>}
      {phase === 'review' && plan && review && !('operationId' in review) && <>
        {!!(plan.optional.length + optional.size) && <fieldset><legend>{t('react.catalogInstall.optional')}</legend>{[...plan.optional, ...plan.selected.filter(node => !node.required)].map(node => <label key={node.key}><input type="checkbox" checked={optional.has(node.key)} onChange={event => { const next = new Set(optional); if (event.target.checked) next.add(node.key); else next.delete(node.key); void prepare(next) }} />{node.project.name}</label>)}</fieldset>}
        {!!optional.size && <button type="button" className="button secondary" onClick={() => void prepare(new Set())}>{t('react.catalogInstall.withoutOptional')}</button>}
        {!!plan.unavailableOptional.length && <p>{t('react.catalogInstall.optionalUnavailable', { count: n(plan.unavailableOptional.length) })}</p>}
      </>}
      {review && <><h4>{t('react.catalogInstall.files')}</h4><ul className="catalog-install-files" data-testid="catalog-install-changes">{review.changes.map(change => <li key={`${change.file.path}:${change.operation}`}><span>{t(`react.modUpdates.operations.${change.operation}`)}</span><code>{change.file.path}</code></li>)}</ul></>}
      {phase === 'review' && !hasChanges && <p role="status">{t('react.catalogInstall.installed')}</p>}
      {phase === 'done' && <p role="status" data-testid="catalog-install-complete">{t('react.catalogInstall.complete')}</p>}
      {!!pending.length && <p>{t('react.catalogInstall.retained')}</p>}
      {phase === 'error' && !!pending.length && <ul className="catalog-install-files">{pending.map(item => <li key={item.operationId}><code>{item.files[0]?.path}</code><button type="button" className="button secondary" onClick={() => void recover(item.operationId)}>{t('react.catalogInstall.recover')}</button></li>)}</ul>}
    </div>
    <footer className="dialog-actions">
      {busy ? <>
        <button ref={cancelButton} type="button" className="button secondary" disabled={cancelRequested} onClick={() => void cancel()}>{t('react.catalogInstall.cancel')}</button>
        {phase === 'install' && <button type="button" className="button primary" disabled>{t('react.catalogInstall.confirm')}</button>}
      </> : <>
        <button type="button" className="button secondary" onClick={onBack}>{t('react.catalogInstall.back')}</button>
        {(phase === 'done' || error === 'pending') && <button type="button" className="button primary" onClick={showTarget}>{t('react.catalogInstall.open')}</button>}
        {phase === 'error' && !pending.length && <button type="button" className="button secondary" disabled={resources.status === 'loading'} onClick={retry}>{t('react.instances.retry')}</button>}
        {phase === 'review' && hasChanges && <button type="submit" className="button primary" data-testid="catalog-install-confirm">{t('react.catalogInstall.confirm')}</button>}
      </>}
    </footer>
  </form>
}
