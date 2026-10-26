import { useId, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, UserRound, X } from 'lucide-react'
import { AUTHORITY_DEV } from '@xmcl/runtime-api/src/util/authority'
import { useI18n } from '../../i18n'
import { useAccounts } from './context'
import { validLocalName, type ProfileEntry } from './model'
import './accounts.css'
import { ProfileAppearance } from './ProfileAppearance'

export function LocalProfileForm({ onCreated }: { onCreated?: () => void }) {
  const accounts = useAccounts()
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const duplicate =
    accounts?.entries.some(
      (entry) =>
        entry.user.authority === AUTHORITY_DEV && entry.name.toLowerCase() === name.toLowerCase(),
    ) ?? false
  const valid = validLocalName(name) && !duplicate
  return (
    <form
      className="local-profile-form"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault()
        setSubmitted(true)
        if (!accounts || !valid) {
          input.current?.focus()
          return
        }
        try {
          await accounts.add(name)
          setName('')
          setSubmitted(false)
          onCreated?.()
        } catch {
          /* The provider displays an actionable error without logging profile data. */
        }
      }}
    >
      <label htmlFor={id}>{t('react.accounts.playerName')}</label>
      <div className="profile-input-row">
        <input
          ref={input}
          id={id}
          data-testid="local-profile-name"
          value={name}
          autoComplete="off"
          maxLength={16}
          aria-invalid={submitted && !valid}
          aria-describedby={`${id}-help`}
          disabled={accounts?.busy}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          className="button primary"
          type="submit"
          disabled={!accounts || accounts.busy || accounts.status !== 'ready'}
        >
          {accounts?.busy ? t('react.accounts.saving') : t('react.accounts.create')}
        </button>
      </div>
      <p id={`${id}-help`} className={submitted && !valid ? 'form-error' : 'form-help'}>
        {t(duplicate ? 'react.accounts.duplicate' : 'react.accounts.nameHelp')}
      </p>
      {accounts?.actionError && (
        <p role="alert" className="form-error">
          {t('react.accounts.actionError')}
        </p>
      )}
    </form>
  )
}

export function Accounts() {
  const accounts = useAccounts()
  const { t } = useI18n()
  const [removing, setRemoving] = useState<ProfileEntry | null>(null)
  const [editing, setEditing] = useState<ProfileEntry | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  return (
    <section className="accounts-page" data-testid="accounts-page">
      <div className="page-heading">
        <div>
          <h1>{t('react.accounts.title')}</h1>
          <p>{t('react.accounts.description')}</p>
        </div>
      </div>
      {!accounts ? (
        <p role="status">{t('react.accounts.runtimeRequired')}</p>
      ) : (
        <>
          {accounts.status === 'loading' && <p role="status">{t('react.accounts.loading')}</p>}
          {accounts.status === 'error' && (
            <p role="alert" className="form-error">
              {t('react.accounts.loadError')}
            </p>
          )}
          {accounts.storageError && <p role="status">{t('react.accounts.storageError')}</p>}
          <ul className="account-list" aria-label={t('react.accounts.title')}>
            {accounts.entries.map((entry) => {
              const active =
                accounts.selected?.id === entry.user.id && accounts.profile?.id === entry.id
              const local = entry.user.authority === AUTHORITY_DEV
              return (
                <li className="account-row" key={`${entry.user.id}:${entry.id}`}>
                  <UserRound size={24} aria-hidden="true" />
                  <div className="account-row-identity">
                    <strong>{entry.name}</strong>
                    <span>{local ? t('react.accounts.local') : t('react.accounts.external')}</span>
                  </div>
                  {active ? (
                    <span className="active-profile">
                      <Check size={16} aria-hidden="true" />
                      {t('react.accounts.active')}
                    </span>
                  ) : (
                    <button
                      className="button secondary"
                      disabled={accounts.busy || !local}
                      aria-label={t('react.accounts.useName', { name: entry.name })}
                      onClick={() => {
                        void accounts.select(entry).catch(() => undefined)
                      }}
                    >
                      {t('react.accounts.use')}
                    </button>
                  )}
                  {local && (
                    <button className="button secondary" disabled={accounts.busy} aria-label={t('react.accounts.appearanceName', { name: entry.name })} onClick={event => { trigger.current = event.currentTarget; setEditing(entry) }}>{t('react.accounts.appearance')}</button>
                  )}
                  {local && (
                    <button
                      className="button secondary"
                      disabled={accounts.busy}
                      aria-label={t('react.accounts.removeName', { name: entry.name })}
                      onClick={(event) => {
                        trigger.current = event.currentTarget
                        setRemoving(entry)
                      }}
                    >
                      {t('react.accounts.remove')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {accounts.status === 'ready' && !accounts.entries.length && (
            <p className="form-help">{t('react.accounts.empty')}</p>
          )}
          <div className="settings-group">
            <h2>{t('react.accounts.addTitle')}</h2>
            <LocalProfileForm />
          </div>
          <p className="form-help">{t('react.accounts.microsoftDeferred')}</p>
        </>
      )}
      {editing && <ProfileAppearance entry={editing} onClose={() => setEditing(null)} returnFocus={trigger} />}
      <Dialog.Root
        open={!!removing}
        onOpenChange={(open) => {
          if (!open && !accounts?.busy) setRemoving(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-backdrop" />
          <Dialog.Content
            className="dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              if (trigger.current?.isConnected) trigger.current.focus()
              else
                document
                  .querySelector<HTMLInputElement>('[data-testid="local-profile-name"]')
                  ?.focus()
            }}
            onEscapeKeyDown={(event) => {
              if (accounts?.busy) event.preventDefault()
            }}
            onPointerDownOutside={(event) => {
              if (accounts?.busy) event.preventDefault()
            }}
          >
            <Dialog.Title>
              {t('react.accounts.removeTitle', { name: removing?.name ?? '' })}
            </Dialog.Title>
            <Dialog.Description>{t('react.accounts.removeDescription')}</Dialog.Description>
            {accounts?.actionError && (
              <p role="alert" className="form-error">
                {t('react.accounts.actionError')}
              </p>
            )}
            <div className="dialog-actions">
              <button
                className="button secondary"
                disabled={accounts?.busy}
                onClick={() => setRemoving(null)}
              >
                {t('react.accounts.cancel')}
              </button>
              <button
                className="button primary"
                disabled={accounts?.busy}
                onClick={async () => {
                  if (!removing || !accounts) return
                  try {
                    await accounts.remove(removing)
                    setRemoving(null)
                  } catch {
                    /* Keep confirmation open for retry. */
                  }
                }}
              >
                {t('react.accounts.confirmRemove')}
              </button>
            </div>
            <Dialog.Close
              className="dialog-close"
              aria-label={t('react.accounts.close')}
              disabled={accounts?.busy}
            >
              <X size={20} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
