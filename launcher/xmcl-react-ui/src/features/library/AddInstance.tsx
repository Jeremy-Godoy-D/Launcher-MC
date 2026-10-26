import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FolderOpen, X } from 'lucide-react'
import { InstanceServiceKey } from '@xmcl/runtime-api/src/services/InstanceService'
import { InstanceIOServiceKey } from '@xmcl/runtime-api/src/services/InstanceIOService'
import {
  InstanceInstallServiceKey,
  InstanceInstallStatus,
} from '@xmcl/runtime-api/src/services/InstanceInstallService'
import { ModpackServiceKey, ModpackState } from '@xmcl/runtime-api/src/services/ModpackService'
import { VersionServiceKey } from '@xmcl/runtime-api/src/services/VersionService'
import { VersionMetadataServiceKey } from '@xmcl/runtime-api/src/services/VersionMetadataService'
import { LocalVersions, type MinecraftVersions } from '@xmcl/runtime-api/src/entities/version'
import { TaskState } from '@xmcl/runtime-api/src/task'
import { useService, useSharedState, useTasks, type StateDescriptor } from '../../runtime'
import { useI18n } from '../../i18n'
import { useLibrary } from './context'
import {
  CreationSession,
  creationOptions,
  importedOptions,
  loaderVersions,
  loaders,
  validInstanceName,
  validateImportFiles,
  type Loader,
  type ImportPreviewData,
} from './creation'
import { InstanceDataSchema } from '../../../../packages/instance/instance'
import { InstanceSavesServiceKey } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import { InstanceResourcePacksServiceKey } from '@xmcl/runtime-api/src/services/InstanceResourcePacksService'
import { InstanceShaderPacksServiceKey } from '@xmcl/runtime-api/src/services/InstanceShaderPacksService'
import { InstanceOptionsServiceKey } from '@xmcl/runtime-api/src/services/InstanceOptionsService'
import { InstanceServerInfoServiceKey } from '@xmcl/runtime-api/src/services/InstanceServerInfoService'
import { applyInstanceLinkPreferences } from '@xmcl/runtime-api/src/util/instanceCreation'
import { advancedOptions, defaultAdvanced, importUrl, LINKS_KEY, readLinkPreferences, type LinkPreferences } from './creation'
import { AdvancedCreate } from './AdvancedCreate'
import { FolderImport, type FolderDraft } from './FolderImport'
import './creation.css'

const localDescriptor: StateDescriptor<LocalVersions> = {
  key: 'local-versions',
  Type: LocalVersions,
  load: (client) => client.service(VersionServiceKey).getLocalVersions(),
}

function ImportPreview({
  path,
  onReady,
  onName,
  attempt,
}: {
  path: string
  onReady: (data: ModpackState | undefined) => void
  onName: (name: string) => void
  attempt: number
}) {
  const { t } = useI18n()
  const state = useSharedState({
    key: `modpack:${path}:${attempt}`,
    Type: ModpackState,
    load: (client) => client.service(ModpackServiceKey).openModpack(path),
  })
  const initialized = useRef(false)
  const data = state.data
  const config = useMemo(() => {
    if (!data?.ready || data.error) return undefined
    try {
      validateImportFiles(data.files)
      return InstanceDataSchema.parse(data.config)
    } catch {
      return undefined
    }
  }, [data])
  const usable =
    state.status === 'ready' &&
    data?.ready &&
    !data.error &&
    !!config?.runtime.minecraft &&
    config.edition === 'java'
  const failed = state.status === 'error' || !!data?.error || (!!data?.ready && !usable)
  const ready = useRef(onReady)
  const name = useRef(onName)
  ready.current = onReady
  name.current = onName
  useEffect(() => {
    ready.current(usable ? (structuredClone({ ...data, config }) as ModpackState) : undefined)
    if (usable && !initialized.current) {
      initialized.current = true
      name.current(config.name)
    }
    return () => ready.current(undefined)
  }, [usable, data, config])
  return (
    <div className="import-preview" role={failed ? 'alert' : 'status'}>
      {failed ? (
        t('react.create.parseError')
      ) : usable ? (
        <>
          <strong>{config.name}</strong>
          <span>
            Minecraft {config.runtime.minecraft} ·{' '}
            {t('react.create.fileCount', { count: data.files.length })}
          </span>
        </>
      ) : (
        t('react.create.parsing')
      )}
    </div>
  )
}

function InstallationStatus({
  path,
  onComplete,
}: {
  path: string
  onComplete: (complete: boolean) => void
}) {
  const state = useSharedState({
    key: `instance-install:${path}`,
    Type: InstanceInstallStatus,
    load: (client) => client.service(InstanceInstallServiceKey).watchInstanceInstall(path),
  })
  const { t } = useI18n()
  const complete =
    state.status === 'ready' &&
    !!state.data &&
    !state.data.pendingFileCount &&
    !state.data.unresolvedFiles.length
  const change = useRef(onComplete)
  change.current = onComplete
  useEffect(() => {
    change.current(complete)
  }, [complete])
  return state.status === 'error' ? (
    <p role="alert">{t('react.create.statusError')}</p>
  ) : state.data?.unresolvedFiles.length ? (
    <p role="alert">{t('react.create.unresolved', { count: state.data.unresolvedFiles.length })}</p>
  ) : null
}

export function AddInstance({
  open,
  initialMode,
  onClose,
  onCreated,
  returnFocus,
}: {
  open: boolean
  initialMode: 'create' | 'import'
  onClose: () => void
  onCreated: (path: string) => void
  returnFocus: RefObject<HTMLElement | null>
}) {
  const { t } = useI18n()
  const library = useLibrary()
  const instances = useService(InstanceServiceKey)
  const instanceIO = useService(InstanceIOServiceKey)
  const installs = useService(InstanceInstallServiceKey)
  const metadata = useService(VersionMetadataServiceKey)
  const saves = useService(InstanceSavesServiceKey)
  const packs = useService(InstanceResourcePacksServiceKey)
  const shaders = useService(InstanceShaderPacksServiceKey)
  const gameOptions = useService(InstanceOptionsServiceKey)
  const servers = useService(InstanceServerInfoServiceKey)
  const local = useSharedState(localDescriptor)
  const [mode, setMode] = useState<'create' | 'import'>('create')
  const [name, setName] = useState('')
  const [minecraft, setMinecraft] = useState('')
  const [loader, setLoader] = useState<Loader>('Vanilla')
  const [loaderVersion, setLoaderVersion] = useState('')
  const [versions, setVersions] = useState<MinecraftVersions>()
  const [metadataError, setMetadataError] = useState(false)
  const [metadataLoading, setMetadataLoading] = useState(false)
  const [loaderOptions, setLoaderOptions] = useState<string[]>([])
  const [loaderError, setLoaderError] = useState(false)
  const [loaderLoading, setLoaderLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const [snapshots, setSnapshots] = useState(false)
  const [archive, setArchive] = useState('')
  const [source, setSource] = useState<'file' | 'url' | 'folder'>('file')
  const [url, setUrl] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [advanced, setAdvanced] = useState({ ...defaultAdvanced })
  const [links, setLinks] = useState(() => readLinkPreferences(() => localStorage))
  const [failedLinks, setFailedLinks] = useState<string[]>([])
  const [preview, setPreview] = useState<ImportPreviewData>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [createdPath, setCreatedPath] = useState('')
  const [succeeded, setSucceeded] = useState(false)
  const [installationComplete, setInstallationComplete] = useState(false)
  const session = useRef<CreationSession | null>(null)
  const folderDraft = useRef<FolderDraft>({ type: 'vanilla', path: '', candidates: [], selected: -1 })
  const suggestedName = useRef('')
  const operation = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const errorMessage = useRef<HTMLParagraphElement>(null)
  const versionRequest = useRef<Promise<MinecraftVersions> | undefined>(undefined)
  const loaderRequests = useRef(new Map<string, Promise<string[]>>())
  const tasks = useTasks()
  useEffect(() => { if (open && error) errorMessage.current?.scrollIntoView({ block: 'nearest' }) }, [open, error])

  useEffect(() => {
    if (open && !session.current?.path && !name && !archive && !url && !folderDraft.current.path) setMode(initialMode)
  }, [open, initialMode])
  useEffect(() => {
    if (local.data?.local.length)
      setMinecraft((current) => current || local.data!.local[0].minecraft)
  }, [local.data])

  useEffect(() => {
    if (!open || mode !== 'create') return
    let active = true
    setMetadataLoading(true)
    setMetadataError(false)
    const request = (versionRequest.current ??= metadata
      .getMinecraftVersions(retry > 0)
      .catch((error) => {
        versionRequest.current = undefined
        throw error
      }))
    void request
      .then((result) => {
        if (!active) return
        setVersions(result)
        setMinecraft((current) => current || result.latest.release)
      })
      .catch(() => {
        if (active) setMetadataError(true)
      })
      .finally(() => {
        if (active) setMetadataLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, mode, metadata, retry])
  useEffect(() => {
    if (!open || mode !== 'create' || loader === 'Vanilla' || !minecraft) return
    let active = true
    const key = `${loader}:${minecraft}`
    setLoaderLoading(true)
    setLoaderError(false)
    const request =
      loaderRequests.current.get(key) ??
      loaderVersions(metadata, loader, minecraft, retry > 0).catch((error) => {
        loaderRequests.current.delete(key)
        throw error
      })
    loaderRequests.current.set(key, request)
    void request
      .then((result) => {
        if (active) setLoaderOptions(result)
      })
      .catch(() => {
        if (active) setLoaderError(true)
      })
      .finally(() => {
        if (active) setLoaderLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, mode, minecraft, loader, metadata, retry])

  const effectiveName = name.trim()
  const badName =
    !validInstanceName(effectiveName) ||
    !!library?.instances.some(
      (instance) => instance.name.toLowerCase() === effectiveName.toLowerCase(),
    )
  const remoteVersions = [
    ...new Set([
      ...(versions?.versions
        .filter((version) => snapshots || version.type === 'release')
        .map((version) => version.id) ?? []),
      ...(local.data?.local.map((version) => version.minecraft).filter(Boolean) ?? []),
    ]),
  ]
  const availableLoaders = [
    ...new Set([
      ...loaderOptions,
      ...(local.data?.local
        .filter((version) => version.minecraft === minecraft)
        .map(
          (version) =>
            ({
              Vanilla: '',
              Fabric: version.fabric,
              Forge: version.forge,
              NeoForge: version.neoForged,
              Quilt: version.quilt,
              OptiFine: version.optifine,
              LabyMod: version.labyMod,
            })[loader],
        )
        .filter(Boolean) ?? []),
    ]),
  ]
  const currentTask = tasks.tasks.find(
    (task) =>
      task.type === 'installInstance' &&
      task.instancePath === createdPath &&
      task.state === TaskState.Running,
  )
  const locked = busy || !!createdPath
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (!locked && (event.key === LINKS_KEY || event.key === null)) setLinks(readLinkPreferences(() => localStorage)) }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [locked])
  function changeLinks(preferences: LinkPreferences) {
    let error = !links.writable
    if (links.writable) try { localStorage.setItem(LINKS_KEY, JSON.stringify(preferences)) } catch { error = true }
    setLinks({ ...links, preferences, error })
  }
  function suggestName(suggested: string) {
    const previous = suggestedName.current
    setName(current => !current || current === previous ? suggested : current)
    suggestedName.current = suggested
  }

  async function submit() {
    if (operation.current || succeeded) return
    setSubmitted(true)
    if (badName && !createdPath) {
      nameInput.current?.focus()
      return
    }
    if (
      (mode === 'import' && !preview) ||
      (mode === 'create' &&
        (!remoteVersions.includes(minecraft) ||
          (loader !== 'Vanilla' && !availableLoaders.includes(loaderVersion))))
    )
      return
    let options
    try {
      options = mode === 'import' ? importedOptions(preview!.config, effectiveName)
        : { ...creationOptions(effectiveName, minecraft, loader, loaderVersion), ...advancedOptions(advanced) }
    } catch {
      setError(mode === 'create' ? 'react.create.advancedError' : 'react.create.parseError')
      return
    }
    operation.current = true
    setBusy(true)
    setError('')
    try {
      if (mode === 'import' && preview?.prismVersion && !session.current?.path) {
        const { source, fingerprint } = preview.prismVersion
        const prepared = await instanceIO.preparePrismVersion(source, effectiveName, fingerprint)
        if ('error' in prepared) { setError(`react.create.prism_${prepared.error}`); return }
        options.version = prepared.version
      }
      if (mode === 'import' && preview?.vanillaVersion && !session.current?.path) {
        const { root, version, fingerprint } = preview.vanillaVersion
        const prepared = await instanceIO.prepareVanillaVersion(root, version, fingerprint)
        if ('error' in prepared) { setError(`react.create.prism_${prepared.error}`); return }
        options.version = prepared.version
      }
      const controller = (session.current ??= new CreationSession(instances, installs))
      // Publish the retained identity even when installation fails after native creation.
      try {
        await controller.run(
          options,
          mode === 'import' ? structuredClone(preview!.files) : [],
          setCreatedPath,
          mode === 'create' ? async path => {
            const failed = await applyInstanceLinkPreferences(path, links.preferences, {
              linkSaves: path => saves.linkSharedSave(path), linkResourcePacks: path => packs.linkShared(path), linkShaderPacks: path => shaders.linkShared(path),
              linkOptions: path => gameOptions.linkGameOptions(path), linkServers: path => servers.link(path),
            })
            setFailedLinks(failed)
            if (failed.length) throw new Error('SharedLinksFailed')
          } : undefined,
        )
      } finally {
        setCreatedPath(controller.path)
      }
      setSucceeded(true)
    } catch (error) {
      setError(error instanceof Error && error.message === 'SharedLinksFailed' ? 'react.create.linkError' : 'react.create.actionError')
    } finally {
      setBusy(false)
      operation.current = false
    }
  }
  function retryMetadata() {
    versionRequest.current = undefined
    loaderRequests.current.clear()
    setRetry((value) => value + 1)
  }
  function reset() {
    setName('')
    setArchive('')
    setUrl('')
    setSource('file')
    setAdvanced({ ...defaultAdvanced })
    setFailedLinks([])
    setPreview(undefined)
    setCreatedPath('')
    setSucceeded(false)
    setSubmitted(false)
    setError('')
    session.current = null
    folderDraft.current = { type: 'vanilla', path: '', candidates: [], selected: -1 }
    suggestedName.current = ''
  }
  function finish() {
    if (!createdPath || !succeeded) return
    onCreated(createdPath)
    reset()
  }
  function close() {
    if (busy) return
    if (succeeded) reset()
    onClose()
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content
          className="dialog creation-dialog"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault()
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            if (!nameInput.current?.disabled) nameInput.current?.focus()
            else
              document
                .querySelector<HTMLButtonElement>(
                  '.creation-dialog .dialog-actions button:not(:disabled)',
                )
                ?.focus()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const target = returnFocus.current?.isConnected
              ? returnFocus.current
              : document.querySelector<HTMLElement>('main h1')
            if (target) {
              if (target.tagName === 'H1') target.tabIndex = -1
              target.focus()
            }
          }}
        >
          <Dialog.Title>{t('react.create.title')}</Dialog.Title>
          <Dialog.Description>{t('react.create.description')}</Dialog.Description>
          <form
            id="instance-creation"
            className="creation-body"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <div className="creation-modes" aria-label={t('react.create.source')}>
              {(['create', 'import'] as const).map((value) => (
                <button
                  type="button"
                  className={`button ${mode === value ? 'primary' : 'secondary'}`}
                  aria-pressed={mode === value}
                  disabled={locked}
                  key={value}
                  onClick={() => {
                    setMode(value)
                    setSubmitted(false)
                    setError('')
                  }}
                >
                  {t(`react.create.${value}`)}
                </button>
              ))}
            </div>
            <label htmlFor="instance-name">{t('react.create.name')}</label>
            <input
              id="instance-name"
              data-testid="instance-name"
              ref={nameInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={locked}
              maxLength={100}
              aria-invalid={submitted && badName && !createdPath}
              aria-describedby="instance-name-help"
            />
            <p
              id="instance-name-help"
              className={submitted && badName && !createdPath ? 'form-error' : 'form-help'}
              role={submitted && badName && !createdPath ? 'alert' : undefined}
            >
              {t(
                submitted && badName && !createdPath
                  ? 'react.create.nameError'
                  : 'react.create.nameHelp',
              )}
            </p>
            {mode === 'create' ? (
              <>
                <label htmlFor="instance-minecraft">Minecraft Java</label>
                <select
                  id="instance-minecraft"
                  data-testid="instance-minecraft"
                  value={minecraft}
                  disabled={locked || (metadataLoading && !remoteVersions.length)}
                  onChange={(event) => {
                    setMinecraft(event.target.value)
                    setLoaderVersion('')
                    setLoaderOptions([])
                  }}
                >
                  <option value="">
                    {t(metadataLoading ? 'react.create.loading' : 'react.create.chooseVersion')}
                  </option>
                  {remoteVersions.map((id) => (
                    <option key={id}>{id}</option>
                  ))}
                </select>
                <label className="creation-check">
                  <input
                    type="checkbox"
                    checked={snapshots}
                    disabled={locked}
                    onChange={(event) => {
                      setSnapshots(event.target.checked)
                      setMinecraft('')
                      setLoaderVersion('')
                    }}
                  />
                  {t('react.create.snapshots')}
                </label>
                {metadataError && (
                  <p role="alert" className="form-error">
                    {t('react.create.metadataError')}{' '}
                    <button className="button secondary" type="button" onClick={retryMetadata}>
                      {t('react.create.retry')}
                    </button>
                  </p>
                )}
                <label htmlFor="instance-loader">{t('react.create.loader')}</label>
                <select
                  id="instance-loader"
                  value={loader}
                  disabled={locked}
                  onChange={(event) => {
                    setLoader(event.target.value as Loader)
                    setLoaderVersion('')
                    setLoaderOptions([])
                  }}
                >
                  {loaders.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                {loader !== 'Vanilla' && (
                  <>
                    <label htmlFor="instance-loader-version">
                      {t('react.create.loaderVersion')}
                    </label>
                    <select
                      id="instance-loader-version"
                      value={loaderVersion}
                      disabled={locked || (loaderLoading && !availableLoaders.length)}
                      onChange={(event) => setLoaderVersion(event.target.value)}
                    >
                      <option value="">
                        {t(loaderLoading ? 'react.create.loading' : 'react.create.chooseVersion')}
                      </option>
                      {availableLoaders.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                    {!loaderLoading && (!availableLoaders.length || loaderError) && (
                      <p className="form-help" role="status">
                        {t(loaderError ? 'react.create.metadataError' : 'react.create.noLoader')}{' '}
                        <button type="button" className="button secondary" onClick={retryMetadata}>
                          {t('react.create.retry')}
                        </button>
                      </p>
                    )}
                  </>
                )}
                <p className="form-help">{t('react.create.noLaunch')}</p>
                <AdvancedCreate value={advanced} onChange={setAdvanced} links={links.preferences} onLinks={changeLinks} locked={locked} storageError={links.error} />
              </>
            ) : (
              <>
                <div className="creation-modes" aria-label={t('react.create.importSource')}>
                  {(['file', 'url', 'folder'] as const).map(value => <button type="button" key={value} className={`button ${source === value ? 'primary' : 'secondary'}`} aria-pressed={source === value} disabled={locked} onClick={() => { setSource(value); setArchive(''); setPreview(undefined); setError('') }}>{t(`react.create.source_${value}`)}</button>)}
                </div>
                {source === 'folder' ? <FolderImport locked={locked} draft={folderDraft} onReady={value => { setPreview(value); if (value && !createdPath) setError('') }} onName={suggestName} /> : source === 'url' ? <>
                  <label htmlFor="instance-url">{t('react.create.url')}</label>
                  <input id="instance-url" type="url" value={url} disabled={locked} maxLength={4096} onChange={event => { setUrl(event.target.value); setArchive(''); setPreview(undefined) }} />
                  <button type="button" className="button secondary" disabled={locked || !url.trim()} onClick={() => {
                    try { const value = importUrl(url); setPreview(undefined); setAttempt(value => value + 1); setArchive(value); setError('') }
                    catch { setArchive(''); setPreview(undefined); setError('react.create.urlError') }
                  }}>{t('react.create.reviewUrl')}</button>
                  <p className="form-help">{t('react.create.urlHelp')}</p>
                </> : <>
                <label htmlFor="instance-archive">{t('react.create.archive')}</label>
                <div className="creation-file">
                  <input
                    id="instance-archive"
                    value={archive}
                    readOnly
                    placeholder=".mrpack / .zip"
                  />
                  <button
                    type="button"
                    className="button secondary"
                    aria-label={t('react.create.chooseArchive')}
                    disabled={locked}
                    onClick={() => {
                      void window.windowController
                        ?.showOpenDialog?.({
                          properties: ['openFile'],
                          filters: [{ name: 'Minecraft modpack', extensions: ['mrpack', 'zip'] }],
                        })
                        .then((result) => {
                          if (!result.canceled && result.filePaths[0]) {
                            setPreview(undefined)
                            setArchive(result.filePaths[0])
                            setError('')
                          }
                        })
                        .catch(() => setError('react.create.chooseError'))
                    }}
                  >
                    <FolderOpen size={18} aria-hidden="true" />
                  </button>
                </div>
                </>}
                {archive && (
                  <ImportPreview
                    key={`${archive}:${attempt}`}
                    path={archive}
                    attempt={attempt}
                    onReady={setPreview}
                    onName={suggestName}
                  />
                )}
                <p className="form-help">{t('react.create.importHelp')}</p>
              </>
            )}
            {createdPath && (
              <p className="form-help" role="status">
                {t('react.create.retained')}
              </p>
            )}
            {createdPath && mode === 'import' && (
              <InstallationStatus path={createdPath} onComplete={setInstallationComplete} />
            )}
            {busy && (
              <p role="status">
                {t('react.create.working')}
                {currentTask?.progress && currentTask.progress.total > 0 && (
                  <progress
                    value={currentTask.progress.progress}
                    max={currentTask.progress.total}
                    aria-label={t('react.create.progress')}
                  />
                )}
              </p>
            )}
            {tasks.error && busy && <p role="status">{t('react.create.progressError')}</p>}
            {error && (
              <p ref={errorMessage} role="alert" className="form-error">
                {t(error)}
              </p>
            )}
            {!!failedLinks.length && <ul>{failedLinks.map(key => <li key={key}>{t(`react.create.link_${key}`)}</li>)}</ul>}
            {succeeded && (
              <p role="status">
                {t(
                  mode === 'import' && !installationComplete
                    ? 'react.create.checkPending'
                    : 'react.create.success',
                )}
              </p>
            )}
          </form>
          <footer className="dialog-actions">
            {busy && currentTask && (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  void tasks
                    .cancel(currentTask.id)
                    .catch(() => setError('react.create.cancelError'))
                }}
              >
                {t('react.create.cancelInstall')}
              </button>
            )}
            <button type="button" className="button secondary" disabled={busy} onClick={close}>
              {t(createdPath ? 'react.create.keepClose' : 'react.create.cancel')}
            </button>
            {succeeded ? (
              <button type="button" className="button primary" onClick={finish}>
                {t('react.create.open')}
              </button>
            ) : (
              <button
                type="submit"
                form="instance-creation"
                className="button primary"
                data-testid="instance-create-confirm"
                disabled={
                  busy ||
                  library?.status !== 'ready' ||
                  (mode === 'import' && !preview) ||
                  (mode === 'create' &&
                    (!minecraft ||
                      (loader !== 'Vanilla' &&
                        (!loaderVersion || (loaderLoading && !availableLoaders.length)))))
                }
              >
                {t(
                  busy
                    ? 'react.create.working'
                    : createdPath
                      ? 'react.create.retry'
                      : mode === 'import'
                        ? 'react.create.importConfirm'
                        : 'react.create.confirm',
                )}
              </button>
            )}
          </footer>
          <button
            type="button"
            className="icon-button dialog-close"
            disabled={busy}
            aria-label={t('react.create.close')}
            onClick={close}
          >
            <X size={19} />
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
