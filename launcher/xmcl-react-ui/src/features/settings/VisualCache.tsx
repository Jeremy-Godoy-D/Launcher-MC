import { useRef, useState } from 'react'
import { PresentationServiceKey } from '@xmcl/runtime-api/src/services/PresentationService'
import { useService } from '../../runtime'
import { useI18n } from '../../i18n'

export function VisualCache() {
  const service = useService(PresentationServiceKey), { t } = useI18n(), pending = useRef(false)
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  async function clear() {
    if (pending.current) return
    pending.current = true; setState('working')
    try { await service.clearCache(); setState('done') } catch { setState('error') }
    finally { pending.current = false }
  }
  return <section className="settings-group visual-cache"><h2>{t('react.globalSettings.cacheTitle')}</h2><div className="setting-row"><p>{t('react.globalSettings.cacheHelp')}</p><button type="button" className="button secondary" data-testid="global-cache-clear" disabled={state === 'working'} onClick={() => void clear()}>{t(`react.globalSettings.${state === 'working' ? 'cacheClearing' : 'cacheClear'}`)}</button></div>
    {state === 'done' && <p role="status" data-testid="global-cache-result">{t('react.globalSettings.cacheCleared')}</p>}{state === 'error' && <p role="alert">{t('react.globalSettings.cacheError')}</p>}
  </section>
}
