import { useState, useEffect } from 'react'
import {
  Cpu,
  HardDrive,
  Monitor,
  Server,
  Play,
  RotateCcw,
  Save,
  Undo2,
  Check,
  AlertTriangle,
  FolderOpen,
} from 'lucide-react'
import { InstanceServiceKey } from '@xmcl/runtime-api/src/services/InstanceService'
import { JavaServiceKey, JavaState } from '@xmcl/runtime-api/src/services/JavaService'
import { useService, useSharedState } from '../../runtime'
import { useI18n } from '../../i18n'
import type { SavedInstance } from '../library/model'

interface Props {
  instance: SavedInstance
  running: boolean
}

export function InstanceBaseSettings({ instance, running }: Props) {
  const { t, n } = useI18n()
  const instanceService = useService(InstanceServiceKey)
  const javaService = useService(JavaServiceKey)
  const javaState = useSharedState({
    key: 'java',
    Type: JavaState,
    load: (client) => client.service(JavaServiceKey).getJavaState(),
  })

  // Java state
  const [java, setJava] = useState(instance.java || '')

  // Memory state
  const hasCustomMemory = (instance.minMemory !== undefined && instance.minMemory !== null) || (instance.maxMemory !== undefined && instance.maxMemory !== null) || instance.assignMemory === true
  const [memoryMode, setMemoryMode] = useState<'inherit' | 'manual'>(hasCustomMemory ? 'manual' : 'inherit')
  const [minMemory, setMinMemory] = useState<number>(instance.minMemory ?? 1024)
  const [maxMemory, setMaxMemory] = useState<number>(instance.maxMemory ?? 4096)

  // JVM & MC options
  const [vmOptions, setVmOptions] = useState<string>((instance.vmOptions || []).join(' '))
  const [mcOptions, setMcOptions] = useState<string>((instance.mcOptions || []).join(' '))

  // Resolution state
  const hasCustomRes = instance.resolution !== undefined && instance.resolution !== null
  const [resolutionMode, setResolutionMode] = useState<'inherit' | 'custom'>(hasCustomRes ? 'custom' : 'inherit')
  const [resolutionWidth, setResolutionWidth] = useState<number>(instance.resolution?.width ?? 854)
  const [resolutionHeight, setResolutionHeight] = useState<number>(instance.resolution?.height ?? 480)
  const [resolutionFullscreen, setResolutionFullscreen] = useState<boolean>(instance.resolution?.fullscreen ?? false)

  // Quick play server
  const [serverEnabled, setServerEnabled] = useState<boolean>(Boolean(instance.server?.host))
  const [serverHost, setServerHost] = useState<string>(instance.server?.host || '')
  const [serverPort, setServerPort] = useState<number>(instance.server?.port ?? 25565)

  // Flags
  const [fastLaunch, setFastLaunch] = useState<boolean>(Boolean(instance.fastLaunch))
  const [hideLauncher, setHideLauncher] = useState<boolean>(Boolean(instance.hideLauncher))
  const [showLog, setShowLog] = useState<boolean>(Boolean(instance.showLog))

  // UI state
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Sync state if instance updates externally
  useEffect(() => {
    setJava(instance.java || '')
    const customMem = (instance.minMemory !== undefined && instance.minMemory !== null) || (instance.maxMemory !== undefined && instance.maxMemory !== null) || instance.assignMemory === true
    setMemoryMode(customMem ? 'manual' : 'inherit')
    setMinMemory(instance.minMemory ?? 1024)
    setMaxMemory(instance.maxMemory ?? 4096)
    setVmOptions((instance.vmOptions || []).join(' '))
    setMcOptions((instance.mcOptions || []).join(' '))
    const customRes = instance.resolution !== undefined && instance.resolution !== null
    setResolutionMode(customRes ? 'custom' : 'inherit')
    setResolutionWidth(instance.resolution?.width ?? 854)
    setResolutionHeight(instance.resolution?.height ?? 480)
    setResolutionFullscreen(instance.resolution?.fullscreen ?? false)
    setServerEnabled(Boolean(instance.server?.host))
    setServerHost(instance.server?.host || '')
    setServerPort(instance.server?.port ?? 25565)
    setFastLaunch(Boolean(instance.fastLaunch))
    setHideLauncher(Boolean(instance.hideLauncher))
    setShowLog(Boolean(instance.showLog))
  }, [instance])

  // Browse Java executable
  const handleBrowseJava = async () => {
    if (running) return
    try {
      const picker = window.windowController?.showOpenDialog
      if (!picker) return
      const result = await picker({
        title: t('react.instanceSettings.javaManual'),
        properties: ['openFile'],
        filters: [{ name: 'Java', extensions: ['exe', ''] }],
      })
      if (result && !result.canceled && result.filePaths?.[0]) {
        const filePath = result.filePaths[0]
        const resolved = await javaService.resolveJava(filePath)
        if (resolved) {
          setJava(filePath)
        } else {
          setErrorMessage(t('react.instanceSettings.javaNotFound'))
        }
      }
    } catch {
      setErrorMessage(t('react.instanceSettings.javaNotFound'))
    }
  }

  // Save changes
  const handleSave = async () => {
    if (running || saving) return
    setSaving(true)
    setErrorMessage(null)
    setStatusMessage(null)

    const vmArr = vmOptions.trim() ? vmOptions.trim().split(/\s+/).filter(Boolean) : null
    const mcArr = mcOptions.trim() ? mcOptions.trim().split(/\s+/).filter(Boolean) : null

    try {
      await instanceService.editInstance({
        instancePath: instance.path,
        java: java ? java : null,
        assignMemory: memoryMode === 'manual' ? true : null,
        minMemory: memoryMode === 'manual' ? Number(minMemory) : null,
        maxMemory: memoryMode === 'manual' ? Number(maxMemory) : null,
        vmOptions: vmArr,
        mcOptions: mcArr,
        resolution:
          resolutionMode === 'custom'
            ? {
                width: Number(resolutionWidth),
                height: Number(resolutionHeight),
                fullscreen: Boolean(resolutionFullscreen),
              }
            : null,
        server:
          serverEnabled && serverHost.trim()
            ? {
                host: serverHost.trim(),
                port: Number(serverPort) || 25565,
              }
            : null,
        fastLaunch: Boolean(fastLaunch),
        hideLauncher: Boolean(hideLauncher),
        showLog: Boolean(showLog),
      } as any)
      setStatusMessage(t('react.instanceSettings.saveSuccess'))
      setTimeout(() => setStatusMessage(null), 4000)
    } catch {
      setErrorMessage(t('react.instanceSettings.saveError'))
    } finally {
      setSaving(false)
    }
  }

  // Reset to global defaults
  const handleResetDefaults = async () => {
    if (running || saving) return
    setSaving(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      await instanceService.editInstance({
        instancePath: instance.path,
        java: null,
        assignMemory: null,
        minMemory: null,
        maxMemory: null,
        vmOptions: null,
        mcOptions: null,
        resolution: null,
        server: null,
        fastLaunch: false,
        hideLauncher: false,
        showLog: false,
      } as any)
      setJava('')
      setMemoryMode('inherit')
      setMinMemory(1024)
      setMaxMemory(4096)
      setVmOptions('')
      setMcOptions('')
      setResolutionMode('inherit')
      setResolutionWidth(854)
      setResolutionHeight(480)
      setResolutionFullscreen(false)
      setServerEnabled(false)
      setServerHost('')
      setServerPort(25565)
      setFastLaunch(false)
      setHideLauncher(false)
      setShowLog(false)
      setStatusMessage(t('react.instanceSettings.resetSuccess'))
      setTimeout(() => setStatusMessage(null), 4000)
    } catch {
      setErrorMessage(t('react.instanceSettings.saveError'))
    } finally {
      setSaving(false)
    }
  }

  // Discard local changes
  const handleDiscard = () => {
    setJava(instance.java || '')
    const customMem = (instance.minMemory !== undefined && instance.minMemory !== null) || (instance.maxMemory !== undefined && instance.maxMemory !== null) || instance.assignMemory === true
    setMemoryMode(customMem ? 'manual' : 'inherit')
    setMinMemory(instance.minMemory ?? 1024)
    setMaxMemory(instance.maxMemory ?? 4096)
    setVmOptions((instance.vmOptions || []).join(' '))
    setMcOptions((instance.mcOptions || []).join(' '))
    const customRes = instance.resolution !== undefined && instance.resolution !== null
    setResolutionMode(customRes ? 'custom' : 'inherit')
    setResolutionWidth(instance.resolution?.width ?? 854)
    setResolutionHeight(instance.resolution?.height ?? 480)
    setResolutionFullscreen(instance.resolution?.fullscreen ?? false)
    setServerEnabled(Boolean(instance.server?.host))
    setServerHost(instance.server?.host || '')
    setServerPort(instance.server?.port ?? 25565)
    setFastLaunch(Boolean(instance.fastLaunch))
    setHideLauncher(Boolean(instance.hideLauncher))
    setShowLog(Boolean(instance.showLog))
    setErrorMessage(null)
  }

  const validJavas = (javaState.data?.all || []).filter((j) => j.valid)

  return (
    <section
      data-testid="instance-base-setting"
      aria-labelledby="base-setting-title"
      style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '16px 0' }}
    >
      <div className="section-heading">
        <div>
          <h2 id="base-setting-title">{t('react.instanceSettings.title')}</h2>
          <p className="text-muted" style={{ margin: '4px 0 0 0', fontSize: '0.875rem' }}>
            {t('react.instanceSettings.subtitle')}
          </p>
        </div>
      </div>

      {running && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 8,
            background: 'rgba(234, 179, 8, 0.15)',
            border: '1px solid rgba(234, 179, 8, 0.35)',
            color: '#fef08a',
          }}
        >
          <AlertTriangle size={20} />
          <span>{t('react.instanceSettings.runningWarning')}</span>
        </div>
      )}

      {errorMessage && (
        <p className="form-error" role="alert" style={{ margin: 0 }}>
          {errorMessage}
        </p>
      )}

      {statusMessage && (
        <p className="badge-success" role="status" style={{ padding: '8px 14px', borderRadius: 8, margin: 0 }}>
          <Check size={16} style={{ display: 'inline', marginRight: 6 }} />
          {statusMessage}
        </p>
      )}

      {/* Java Setting */}
      <fieldset
        style={{
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: 16,
          background: 'var(--glass-elevated)',
        }}
      >
        <legend style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
          <Cpu size={18} />
          {t('react.instanceSettings.javaTitle')}
        </legend>
        <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: 12 }}>
          {t('react.instanceSettings.javaDesc')}
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="setting-java-select" style={{ display: 'none' }}>
            {t('react.instanceSettings.javaTitle')}
          </label>
          <select
            id="setting-java-select"
            data-testid="setting-java-select"
            aria-label={t('react.instanceSettings.javaTitle')}
            value={java}
            onChange={(e) => setJava(e.target.value)}
            disabled={running || saving}
            style={{ flex: 1, minWidth: 260 }}
          >
            <option value="">{t('react.instanceSettings.javaInherit')}</option>
            {validJavas.map((j) => (
              <option key={j.path} value={j.path}>
                Java {j.majorVersion} ({j.version}) · {j.path}
              </option>
            ))}
            {java && !validJavas.some((j) => j.path === java) && (
              <option value={java}>Java ({java})</option>
            )}
          </select>

          <button
            type="button"
            className="button secondary"
            data-testid="setting-java-browse"
            aria-label={t('react.instanceSettings.javaManual')}
            onClick={handleBrowseJava}
            disabled={running || saving}
          >
            <FolderOpen size={16} />
            {t('react.instanceSettings.javaManual')}
          </button>
        </div>
      </fieldset>

      {/* Memory Setting */}
      <fieldset
        style={{
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: 16,
          background: 'var(--glass-elevated)',
        }}
      >
        <legend style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
          <HardDrive size={18} />
          {t('react.instanceSettings.memoryTitle')}
        </legend>
        <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: 12 }}>
          {t('react.instanceSettings.memoryDesc')}
        </p>

        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="radio"
              name="memory-mode"
              data-testid="setting-memory-mode-inherit"
              aria-label={t('react.instanceSettings.memoryInherit')}
              checked={memoryMode === 'inherit'}
              onChange={() => setMemoryMode('inherit')}
              disabled={running || saving}
            />
            {t('react.instanceSettings.memoryInherit')}
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="radio"
              name="memory-mode"
              data-testid="setting-memory-mode-custom"
              aria-label={t('react.instanceSettings.memoryCustom')}
              checked={memoryMode === 'manual'}
              onChange={() => setMemoryMode('manual')}
              disabled={running || saving}
            />
            {t('react.instanceSettings.memoryCustom')}
          </label>
        </div>

        {memoryMode === 'manual' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <label htmlFor="setting-memory-min" style={{ display: 'block', fontSize: '0.875rem', marginBottom: 6 }}>
                {t('react.instanceSettings.memoryMin')}
              </label>
              <input
                id="setting-memory-min"
                data-testid="setting-memory-min"
                aria-label={t('react.instanceSettings.memoryMin')}
                type="number"
                min={256}
                max={65536}
                step={256}
                value={minMemory}
                onChange={(e) => setMinMemory(Number(e.target.value))}
                disabled={running || saving}
                style={{ width: '100%' }}
              />
              <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', marginTop: 4 }}>
                ≈ {(minMemory / 1024).toFixed(1)} GiB
              </span>
            </div>

            <div>
              <label htmlFor="setting-memory-max" style={{ display: 'block', fontSize: '0.875rem', marginBottom: 6 }}>
                {t('react.instanceSettings.memoryMax')}
              </label>
              <input
                id="setting-memory-max"
                data-testid="setting-memory-max"
                aria-label={t('react.instanceSettings.memoryMax')}
                type="number"
                min={512}
                max={65536}
                step={256}
                value={maxMemory}
                onChange={(e) => setMaxMemory(Number(e.target.value))}
                disabled={running || saving}
                style={{ width: '100%' }}
              />
              <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', marginTop: 4 }}>
                ≈ {(maxMemory / 1024).toFixed(1)} GiB
              </span>
            </div>
          </div>
        )}
      </fieldset>

      {/* JVM & Minecraft Options */}
      <fieldset
        style={{
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: 16,
          background: 'var(--glass-elevated)',
        }}
      >
        <legend style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
          <Cpu size={18} />
          {t('react.instanceSettings.jvmTitle')}
        </legend>
        <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: 12 }}>
          {t('react.instanceSettings.jvmDesc')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label htmlFor="setting-vm-options" style={{ display: 'block', fontSize: '0.875rem', marginBottom: 6 }}>
              {t('react.instanceSettings.jvmOptions')}
            </label>
            <input
              id="setting-vm-options"
              data-testid="setting-vm-options"
              aria-label={t('react.instanceSettings.jvmOptions')}
              type="text"
              placeholder={t('react.instanceSettings.jvmPlaceholder')}
              value={vmOptions}
              onChange={(e) => setVmOptions(e.target.value)}
              disabled={running || saving}
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
          </div>

          <div>
            <label htmlFor="setting-mc-options" style={{ display: 'block', fontSize: '0.875rem', marginBottom: 6 }}>
              {t('react.instanceSettings.mcOptions')}
            </label>
            <input
              id="setting-mc-options"
              data-testid="setting-mc-options"
              aria-label={t('react.instanceSettings.mcOptions')}
              type="text"
              placeholder={t('react.instanceSettings.mcPlaceholder')}
              value={mcOptions}
              onChange={(e) => setMcOptions(e.target.value)}
              disabled={running || saving}
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
          </div>
        </div>
      </fieldset>

      {/* Screen Resolution */}
      <fieldset
        style={{
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: 16,
          background: 'var(--glass-elevated)',
        }}
      >
        <legend style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
          <Monitor size={18} />
          {t('react.instanceSettings.resolutionTitle')}
        </legend>
        <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: 12 }}>
          {t('react.instanceSettings.resolutionDesc')}
        </p>

        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="radio"
              name="resolution-mode"
              data-testid="setting-resolution-mode-inherit"
              aria-label={t('react.instanceSettings.resolutionInherit')}
              checked={resolutionMode === 'inherit'}
              onChange={() => setResolutionMode('inherit')}
              disabled={running || saving}
            />
            {t('react.instanceSettings.resolutionInherit')}
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="radio"
              name="resolution-mode"
              data-testid="setting-resolution-mode-custom"
              aria-label={t('react.instanceSettings.resolutionCustom')}
              checked={resolutionMode === 'custom'}
              onChange={() => setResolutionMode('custom')}
              disabled={running || saving}
            />
            {t('react.instanceSettings.resolutionCustom')}
          </label>
        </div>

        {resolutionMode === 'custom' && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <label htmlFor="setting-resolution-width" style={{ display: 'block', fontSize: '0.875rem', marginBottom: 6 }}>
                {t('react.instanceSettings.resolutionWidth')}
              </label>
              <input
                id="setting-resolution-width"
                data-testid="setting-resolution-width"
                aria-label={t('react.instanceSettings.resolutionWidth')}
                type="number"
                min={320}
                max={7680}
                value={resolutionWidth}
                onChange={(e) => setResolutionWidth(Number(e.target.value))}
                disabled={running || saving}
                style={{ width: 140 }}
              />
            </div>

            <div>
              <label htmlFor="setting-resolution-height" style={{ display: 'block', fontSize: '0.875rem', marginBottom: 6 }}>
                {t('react.instanceSettings.resolutionHeight')}
              </label>
              <input
                id="setting-resolution-height"
                data-testid="setting-resolution-height"
                aria-label={t('react.instanceSettings.resolutionHeight')}
                type="number"
                min={240}
                max={4320}
                value={resolutionHeight}
                onChange={(e) => setResolutionHeight(Number(e.target.value))}
                disabled={running || saving}
                style={{ width: 140 }}
              />
            </div>

            <div style={{ alignSelf: 'flex-end', paddingBottom: 6 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  data-testid="setting-resolution-fullscreen"
                  aria-label={t('react.instanceSettings.resolutionFullscreen')}
                  checked={resolutionFullscreen}
                  onChange={(e) => setResolutionFullscreen(e.target.checked)}
                  disabled={running || saving}
                />
                {t('react.instanceSettings.resolutionFullscreen')}
              </label>
            </div>
          </div>
        )}
      </fieldset>

      {/* Quick Play Server (K13) */}
      <fieldset
        style={{
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: 16,
          background: 'var(--glass-elevated)',
        }}
      >
        <legend style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
          <Server size={18} />
          {t('react.instanceSettings.serverTitle')}
        </legend>
        <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: 12 }}>
          {t('react.instanceSettings.serverDesc')}
        </p>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label htmlFor="setting-server-host" style={{ display: 'block', fontSize: '0.875rem', marginBottom: 6 }}>
              {t('react.instanceSettings.serverHost')}
            </label>
            <input
              id="setting-server-host"
              data-testid="setting-server-host"
              aria-label={t('react.instanceSettings.serverHost')}
              type="text"
              placeholder="mc.example.com"
              value={serverHost}
              onChange={(e) => {
                setServerHost(e.target.value)
                if (e.target.value.trim()) setServerEnabled(true)
              }}
              disabled={running || saving}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 100 }}>
            <label htmlFor="setting-server-port" style={{ display: 'block', fontSize: '0.875rem', marginBottom: 6 }}>
              {t('react.instanceSettings.serverPort')}
            </label>
            <input
              id="setting-server-port"
              data-testid="setting-server-port"
              aria-label={t('react.instanceSettings.serverPort')}
              type="number"
              min={1}
              max={65535}
              value={serverPort}
              onChange={(e) => setServerPort(Number(e.target.value))}
              disabled={running || saving}
              style={{ width: '100%' }}
            />
          </div>

          {serverHost && (
            <button
              type="button"
              className="button secondary"
              data-testid="setting-server-clear"
              aria-label={t('react.instanceSettings.serverClear')}
              onClick={() => {
                setServerHost('')
                setServerEnabled(false)
              }}
              disabled={running || saving}
              style={{ alignSelf: 'flex-end', marginBottom: 2 }}
            >
              {t('react.instanceSettings.serverClear')}
            </button>
          )}
        </div>
      </fieldset>

      {/* Launch Behavior */}
      <fieldset
        style={{
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: 16,
          background: 'var(--glass-elevated)',
        }}
      >
        <legend style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
          <Play size={18} />
          {t('react.instanceSettings.launchTitle')}
        </legend>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              data-testid="setting-fast-launch"
              aria-label={t('react.instanceSettings.fastLaunch')}
              checked={fastLaunch}
              onChange={(e) => setFastLaunch(e.target.checked)}
              disabled={running || saving}
            />
            {t('react.instanceSettings.fastLaunch')}
          </label>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              data-testid="setting-hide-launcher"
              aria-label={t('react.instanceSettings.hideLauncher')}
              checked={hideLauncher}
              onChange={(e) => setHideLauncher(e.target.checked)}
              disabled={running || saving}
            />
            {t('react.instanceSettings.hideLauncher')}
          </label>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              data-testid="setting-show-log"
              aria-label={t('react.instanceSettings.showLog')}
              checked={showLog}
              onChange={(e) => setShowLog(e.target.checked)}
              disabled={running || saving}
            />
            {t('react.instanceSettings.showLog')}
          </label>
        </div>
      </fieldset>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap', paddingTop: 8 }}>
        <button
          type="button"
          className="button secondary"
          data-testid="setting-reset-btn"
          aria-label={t('react.instanceSettings.resetDefaults')}
          onClick={handleResetDefaults}
          disabled={running || saving}
        >
          <RotateCcw size={16} />
          {t('react.instanceSettings.resetDefaults')}
        </button>

        <button
          type="button"
          className="button secondary"
          data-testid="setting-discard-btn"
          aria-label={t('react.instanceSettings.discardChanges')}
          onClick={handleDiscard}
          disabled={running || saving}
        >
          <Undo2 size={16} />
          {t('react.instanceSettings.discardChanges')}
        </button>

        <button
          type="button"
          className="button primary"
          data-testid="setting-save-btn"
          aria-label={t('react.instanceSettings.saveChanges')}
          onClick={handleSave}
          disabled={running || saving}
        >
          <Save size={16} />
          {t('react.instanceSettings.saveChanges')}
        </button>
      </div>
    </section>
  )
}
