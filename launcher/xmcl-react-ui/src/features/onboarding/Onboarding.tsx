import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Maximize2, Minus, X } from 'lucide-react'
import brandIcon from '../../../../branding/copper/app-64.png'
import wordmarkDark from '../../../../branding/copper/wordmark-dark.png'
import wordmarkLight from '../../../../branding/copper/wordmark-light.png'
import type { Bootstrap } from '@xmcl/runtime-api/src/bootstrap'
import { BaseServiceKey } from '@xmcl/runtime-api/src/services/BaseService'
import { useService } from '../../runtime'
import { localeStore, useI18n } from '../../i18n'
import { usePreferences } from '../../preferences-context'
import { LocalProfileForm } from '../accounts/Accounts'
import { useAccounts } from '../accounts/context'
import scene from '../../assets/ambient/vanilla-shaders.webp'
import './onboarding.css'

declare global {
  interface Window {
    bootstrap?: Bootstrap
  }
}
let preset: ReturnType<Bootstrap['preset']> | undefined
function loadPreset() {
  if (!window.bootstrap) return Promise.reject(new Error('Bootstrap bridge unavailable'))
  return (preset ??= window.bootstrap.preset().catch((error) => {
    preset = undefined
    throw error
  }))
}

export function Onboarding({ onFinished }: { onFinished: (choice: 'library' | 'create' | 'import') => void }) {
  const { t } = useI18n()
  const accounts = useAccounts()
  const base = useService(BaseServiceKey)
  const { preferences } = usePreferences()
  const [step, setStep] = useState(1)
  const [choice, setChoice] = useState<'library' | 'create' | 'import'>('library')
  const [path, setPath] = useState('')
  const [loading, setLoading] = useState(true)
  const [presetError, setPresetError] = useState(false)
  const [pathError, setPathError] = useState(false)
  const [existing, setExisting] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const operation = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const [restoredLocale] = useState(() => {
    try {
      return localStorage.getItem('locale')
    } catch {
      return null
    }
  })

  async function readPreset() {
    setLoading(true)
    setPresetError(false)
    try {
      const data = await loadPreset()
      setPath((current) => current || data.defaultPath)
      if (!restoredLocale) void localeStore.setLocale(data.locale)
    } catch {
      setPresetError(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    let active = true
    void loadPreset()
      .then((data) => {
        if (active) {
          setPath((current) => current || data.defaultPath)
          if (!restoredLocale) void localeStore.setLocale(data.locale)
        }
      })
      .catch(() => {
        if (active) setPresetError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme =
      preferences.appearance === 'system' ? (systemDark ? 'dark' : 'light') : preferences.appearance
    document.documentElement.dataset.performance = String(preferences.performanceMode)
  }, [preferences, systemDark])
  useEffect(() => {
    heading.current?.focus()
  }, [step])

  async function next() {
    if (operation.current || loading || presetError) return
    operation.current = true
    setBusy(true)
    setFailed(false)
    setPathError(false)
    try {
      if (step === 1 || step === 3) {
        const invalid =
          !path ||
          path.length > 32767 ||
          !/^(?:[a-zA-Z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(path) ||
          Array.from(path).some((char) => char.charCodeAt(0) < 32)
        if (invalid) {
          setPathError(true)
          if (step === 3) setStep(1)
          input.current?.focus()
          return
        }
        const code = await base.validateDataDictionary(path)
        if (code && code !== 'exists') {
          setPathError(true)
          if (step === 3) setStep(1)
          input.current?.focus()
          return
        }
        if (code === 'exists' && !acknowledged) {
          setExisting(true)
          if (step === 3) setStep(1)
          return
        }
      }
      if (step < 3) {
        setStep(step + 1)
        return
      }
      await window.bootstrap!.bootstrap(path)
      onFinished(choice)
    } catch {
      setFailed(true)
    } finally {
      operation.current = false
      setBusy(false)
    }
  }
  const steps = [t('react.setup.location'), t('react.setup.profile'), t('react.setup.ready')]
  return (
    <div className="onboarding" data-testid="setup-root">
      <div
        className="app-backdrop"
        style={{ backgroundImage: `url(${scene})` }}
        aria-hidden="true"
      />
      <header className="titlebar">
        <div className="titlebar-left">
          <img className="titlebar-logo" src={brandIcon} alt="" />
          <span>Grimo Launcher</span>
        </div>
        <div className="window-controls">
          <button
            aria-label={t('react.setup.minimize')}
            onClick={() => window.windowController?.minimize()}
          >
            <Minus size={15} />
          </button>
          <button
            aria-label={t('react.setup.maximize')}
            onClick={() => window.windowController?.maximize()}
          >
            <Maximize2 size={15} />
          </button>
          <button
            aria-label={t('react.accounts.close')}
            onClick={() => window.windowController?.close()}
          >
            <X size={17} />
          </button>
        </div>
      </header>
      <main className="onboarding-layout">
        <aside className="onboarding-intro">
          <div className="setup-brand">
            <img className="setup-wordmark brand-wordmark-dark" src={wordmarkDark} alt="Grimo Launcher" />
            <img className="setup-wordmark brand-wordmark-light" src={wordmarkLight} alt="Grimo Launcher" />
          </div>
          <h1>{t('react.setup.welcome')}</h1>
          <p>{t('react.setup.intro')}</p>
          <ol aria-label={t('react.setup.progress')}>
            {steps.map((label, index) => (
              <li key={index} aria-current={step === index + 1 ? 'step' : undefined}>
                <span>{index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        </aside>
        <section className="onboarding-pane" aria-labelledby="setup-heading">
          <h2 ref={heading} tabIndex={-1} id="setup-heading">
            {steps[step - 1]}
          </h2>
          <div className="onboarding-content" aria-busy={busy || loading}>
            {loading ? (
              <p role="status">{t('react.setup.loading')}</p>
            ) : presetError ? (
              <>
                <p role="alert" className="form-error">
                  {t('react.setup.loadError')}
                </p>
                <button
                  className="button secondary"
                  onClick={() => {
                    void readPreset()
                  }}
                >
                  {t('react.setup.retry')}
                </button>
              </>
            ) : (
              <>
                {step === 1 && (
                  <>
                    <p>{t('react.setup.pathDescription')}</p>
                    <label htmlFor="setup-path">{t('react.setup.folder')}</label>
                    <div className="profile-input-row">
                      <input
                        ref={input}
                        id="setup-path"
                        data-testid="setup-path"
                        value={path}
                        disabled={busy}
                        aria-invalid={pathError}
                        aria-describedby="setup-path-help"
                        onChange={(event) => {
                          setPath(event.target.value)
                          setPathError(false)
                          setExisting(false)
                          setAcknowledged(false)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void next()
                          }
                        }}
                      />
                      <button
                        className="button secondary"
                        disabled={busy || !window.windowController?.showOpenDialog}
                        aria-label={t('react.setup.chooseFolder')}
                        onClick={async () => {
                          try {
                            const result = await window.windowController!.showOpenDialog!({
                              properties: ['openDirectory', 'createDirectory'],
                              defaultPath: path,
                            })
                            if (!result.canceled && result.filePaths[0]) {
                              setPath(result.filePaths[0])
                              setPathError(false)
                              setExisting(false)
                              setAcknowledged(false)
                            }
                          } catch {
                            setFailed(true)
                          }
                        }}
                      >
                        <FolderOpen size={18} aria-hidden="true" />
                      </button>
                    </div>
                    <p
                      id="setup-path-help"
                      className={pathError ? 'form-error' : 'form-help'}
                      role={pathError ? 'alert' : undefined}
                    >
                      {t(pathError ? 'react.setup.pathError' : 'react.setup.pathHelp')}
                    </p>
                    {existing && (
                      <label className="existing-folder">
                        <input
                          type="checkbox"
                          checked={acknowledged}
                          onChange={(event) => setAcknowledged(event.target.checked)}
                        />
                        {t('react.setup.existing')}
                      </label>
                    )}
                  </>
                )}
                {step === 2 && (
                  <>
                    <p>{t('react.setup.profileDescription')}</p>
                    {accounts?.status === 'loading' && (
                      <p role="status">{t('react.accounts.loading')}</p>
                    )}
                    {accounts?.profile && (
                      <p role="status">
                        {t('react.setup.selected', { name: accounts.profile.name })}
                      </p>
                    )}
                    <LocalProfileForm />
                  </>
                )}
                {step === 3 && (
                  <>
                    <p>{t('react.setup.readyDescription')}</p>
                    <dl>
                      <dt>{t('react.setup.folder')}</dt>
                      <dd>{path}</dd>
                      <dt>{t('react.setup.profile')}</dt>
                      <dd>{accounts?.profile?.name ?? t('react.accounts.noneSelected')}</dd>
                    </dl>
                    <p className="form-help">{t('react.setup.noLaunch')}</p>
                    <fieldset className="setup-choice">
                      <legend>{t('react.setup.nextAction')}</legend>
                      {(['library', 'create', 'import'] as const).map(value => <label key={value}><input type="radio" name="setup-next-action" value={value} checked={choice === value} onChange={() => setChoice(value)} />{t(`react.setup.choice_${value}`)}</label>)}
                    </fieldset>
                  </>
                )}
              </>
            )}
            {failed && (
              <p role="alert" className="form-error">
                {t('react.setup.actionError')}
              </p>
            )}
          </div>
          <footer className="onboarding-actions">
            <button
              className="button secondary"
              disabled={step === 1 || busy || accounts?.busy}
              onClick={() => {
                setStep(step - 1)
                setFailed(false)
              }}
            >
              {t('react.setup.back')}
            </button>
            <button
              className="button primary"
              data-testid="setup-next"
              disabled={loading || presetError || busy || accounts?.busy}
              onClick={() => {
                void next()
              }}
            >
              {busy
                ? t('react.setup.saving')
                : step === 3
                  ? t(choice === 'library' ? 'react.setup.finish' : 'react.setup.next')
                  : step === 2 && !accounts?.profile
                    ? t('react.setup.skipProfile')
                    : t('react.setup.next')}
            </button>
          </footer>
        </section>
      </main>
    </div>
  )
}
