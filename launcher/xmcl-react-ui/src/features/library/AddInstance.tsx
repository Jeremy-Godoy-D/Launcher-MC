import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FolderOpen, X } from 'lucide-react'
import { InstanceServiceKey } from '@xmcl/runtime-api/src/services/InstanceService'
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
} from './creation'
import { InstanceDataSchema } from '../../../../packages/instance/instance'
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
}: {
  path: string
  onReady: (data: ModpackState | undefined) => void
  onName: (name: string) => void
}) {
  const { t } = useI18n()
  const state = useSharedState({
    key: `modpack:${path}`,
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
  const installs = useService(InstanceInstallServiceKey)
  const metadata = useService(VersionMetadataServiceKey)
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
  const [preview, setPreview] = useState<ModpackState>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [createdPath, setCreatedPath] = useState('')
  const [succeeded, setSucceeded] = useState(false)
  const [installationComplete, setInstallationComplete] = useState(false)
  const session = useRef<CreationSession | null>(null)
  const operation = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const versionRequest = useRef<Promise<MinecraftVersions> | undefined>(undefined)
  const loaderRequests = useRef(new Map<string, Promise<string[]>>())
  const tasks = useTasks()

  useEffect(() => {
    if (open && !session.current?.path) setMode(initialMode)
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
    operation.current = true
    setBusy(true)
    setError('')
    try {
      const options =
        mode === 'import'
          ? importedOptions(preview!.config, effectiveName)
          : creationOptions(effectiveName, minecraft, loader, loaderVersion)
      const controller = (session.current ??= new CreationSession(instances, installs))
      // Publish the retained identity even when installation fails after native creation.
      try {
        await controller.run(
          options,
          mode === 'import' ? structuredClone(preview!.files) : [],
          setCreatedPath,
        )
      } finally {
        setCreatedPath(controller.path)
      }
      setSucceeded(true)
    } catch {
      setError('react.create.actionError')
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
    setPreview(undefined)
    setCreatedPath('')
    setSucceeded(false)
    setSubmitted(false)
    setError('')
    session.current = null
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
              </>
            ) : (
              <>
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
                {archive && (
                  <ImportPreview
                    key={archive}
                    path={archive}
                    onReady={setPreview}
                    onName={(suggested) => setName((current) => current || suggested)}
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
              <p role="alert" className="form-error">
                {t(error)}
              </p>
            )}
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
