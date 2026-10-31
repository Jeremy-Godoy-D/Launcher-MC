import type { RefObject } from 'react'
import { Link } from 'react-router'
import * as Dialog from '@radix-ui/react-dialog'
import { Square, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useTasks } from '../../runtime'
import type { useLaunch } from './context'
import './launch.css'

export function LaunchDialog({
  launch,
  returnFocus,
}: {
  launch: NonNullable<ReturnType<typeof useLaunch>>
  returnFocus: RefObject<HTMLElement | null>
}) {
  const { t } = useI18n()
  const tasks = useTasks()
  const busy = launch.phase === 'preparing'
  const games = launch.running.filter((process) => process.path === launch.request?.path)
  const active = tasks.tasks.filter((task) => task.state === 0)
  const request = launch.request
  return (
    <Dialog.Root
      open={launch.dialog}
      onOpenChange={(open) => {
        if (!open) launch.store.close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content
          className="dialog launch-dialog"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault()
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (returnFocus.current?.isConnected) returnFocus.current.focus()
          }}
        >
          <Dialog.Title title={request?.name}>
            {t('react.launch.title', { name: request?.name ?? '' })}
          </Dialog.Title>
          <Dialog.Description>{t('react.launch.description')}</Dialog.Description>
          <div className="launch-body">
            {request?.profile?.name && (
              <p>{t('react.launch.profile', { name: request.profile.name })}</p>
            )}
            {(launch.phase === 'checking' || busy) && (
              <p role="status">{t(busy ? 'react.launch.preparing' : 'react.launch.checking')}</p>
            )}
            {launch.phase === 'ready' && (
              <>
                <p role="status">
                  {t(launch.needsInstall ? 'react.launch.needsInstall' : 'react.launch.ready')}
                </p>
                <p>
                  {launch.javaMajor
                    ? t('react.launch.java', { version: launch.javaMajor })
                    : t('react.launch.javaAfterInstall')}
                </p>
                <p className="form-help">{t('react.launch.autoJava')}</p>
                {launch.javaFallback && (
                  <p className="form-help">{t('react.launch.javaFallback')}</p>
                )}
              </>
            )}
            {(launch.phase === 'error' || launch.phase === 'blocked') && (
              <p role="alert" className="form-error">
                {t(`react.launch.reason_${launch.reason ?? 'network'}`)}
              </p>
            )}
            {launch.reason === 'java' && (
              <>
                {launch.javaMajor && <p>{t('react.launch.java', { version: launch.javaMajor })}</p>}
                <a
                  className="button secondary"
                  href={`https://adoptium.net/temurin/releases/${[8, 11, 17, 21, 25].includes(launch.javaMajor ?? 0) ? `?version=${launch.javaMajor}&os=windows&arch=x64` : ''}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('react.launch.javaWebsite')}
                </a>
                <p className="form-help">{t('react.launch.javaManualHelp')}</p>
                <button
                  className="button secondary"
                  onClick={() => {
                    void launch.store.redetectJava()
                  }}
                >
                  {t('react.launch.javaRedetect')}
                </button>
              </>
            )}
            {launch.installingJava && (
              <p role="status">
                {t('react.launch.javaInstalling', { version: launch.javaMajor ?? '' })}
              </p>
            )}
            {launch.reason === 'profile' && (
              <Link
                className="button secondary"
                to="/accounts"
                onClick={() => launch.store.close()}
              >
                {t('react.launch.chooseProfile')}
              </Link>
            )}
            {launch.reason === 'path' && (
              <Link className="button secondary" to="/me" onClick={() => launch.store.close()}>
                {t('react.launch.library')}
              </Link>
            )}
            {games.map((process) => (
              <div className="launch-process" key={process.pid}>
                <p role="status">
                  {t('react.launch.running')} · PID {process.pid}
                </p>
                <button
                  className="button secondary"
                  disabled={launch.stopping.includes(process.pid)}
                  onClick={() => {
                    void launch.store.stop(process.pid)
                  }}
                >
                  <Square size={16} aria-hidden="true" />
                  {t('react.launch.stop')}
                </button>
              </div>
            ))}
            {launch.phase === 'idle' && <p role="status">{t('react.launch.finished')}</p>}
            {busy && (
              <>
                <p className="form-help">{t('react.launch.cancelHelp')}</p>
                <p role="status">{t('react.launch.tasks', { count: active.length })}</p>
                {tasks.error && <p>{t('react.launch.progressError')}</p>}
              </>
            )}
          </div>
          <footer className="dialog-actions">
            {busy ? (
              <button className="button secondary" onClick={launch.store.cancel}>
                {t('react.launch.cancel')}
              </button>
            ) : (
              <button className="button secondary" onClick={launch.store.close}>
                {t('react.launch.close')}
              </button>
            )}
            {(launch.phase === 'ready' || busy) && !games.length && (
              <button
                className="button primary"
                data-testid="launch-confirm"
                disabled={busy}
                onClick={() => {
                  void launch.store.run()
                }}
              >
                {t(
                  busy
                    ? 'react.launch.preparing'
                    : launch.needsInstall
                      ? 'react.launch.installPlay'
                      : 'react.launch.play',
                )}
              </button>
            )}
            {!busy &&
              launch.phase !== 'checking' &&
              launch.phase !== 'ready' &&
              !games.length &&
              request && (
                <button
                  className="button primary"
                  onClick={() => launch.store.open(request.path, request.name, request.profile)}
                >
                  {t('react.launch.retry')}
                </button>
              )}
          </footer>
          <button
            className="icon-button dialog-close"
            disabled={busy}
            aria-label={t('react.launch.close')}
            onClick={launch.store.close}
          >
            <X size={19} />
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
