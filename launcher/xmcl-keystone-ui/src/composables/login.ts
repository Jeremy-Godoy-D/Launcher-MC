import {
  AUTHORITY_DEV,
  AUTHORITY_MICROSOFT,
  AUTHORITY_MOJANG,
  AuthorityMetadata,
  YggdrasilApi,
} from '@xmcl/runtime-api'
import { Ref } from 'vue'
import { DialogKey } from './dialog'
import { useLocalStorage } from '@vueuse/core'

export function useAccountSystemHistory() {
  const authority = useLocalStorage(
    'loginLastAuthAuthority',
    AUTHORITY_MICROSOFT as string,
    { writeDefaults: false },
  )
  const allHistoryRaw = useLocalStorage(
    'loginAuthorityHistory',
    () => [] as { name: string; authority: string }[],
  )
  const history = computed({
    get: () =>
      allHistoryRaw.value.filter((v) => v.authority === authority.value).map((v) => v.name),
    set: (v) => {
      allHistoryRaw.value = [
        ...allHistoryRaw.value.filter((v) => v.authority !== authority.value),
        ...v.map((x) => ({ name: x, authority: authority.value })),
      ]
    },
  })
  return {
    authority,
    history,
  }
}
export interface AuthorityItem {
  icon: string
  text: string
  value: string
}

export function useAllowThirdparty() {
  return computed(() => true)
}

export function useAuthorityItems(authorities: Ref<AuthorityMetadata[] | undefined>) {
  const { t } = useI18n()
  const thirdParty = useAllowThirdparty()
  const items: Ref<AuthorityItem[]> = computed(() => {
    if (!authorities.value) return []
    const result = [] as AuthorityItem[]
    for (const v of authorities.value) {
      if (v.authority !== AUTHORITY_MICROSOFT && v.authority !== AUTHORITY_DEV) continue
      if (!thirdParty.value && v.authority !== AUTHORITY_MICROSOFT) continue
      if (v.authority === AUTHORITY_MICROSOFT) {
        result.push({
          value: AUTHORITY_MICROSOFT,
          text: t('userServices.microsoft.name'),
          icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMSAyMSI+PHJlY3QgeD0iMSIgeT0iMSIgd2lkdGg9IjkiIGhlaWdodD0iOSIgZmlsbD0iI2YyNTAyMiIvPjxyZWN0IHg9IjExIiB5PSIxIiB3aWR0aD0iOSIgaGVpZ2h0PSI5IiBmaWxsPSIjN2ZiYTAwIi8+PHJlY3QgeD0iMSIgeT0iMTEiIHdpZHRoPSI5IiBoZWlnaHQ9IjkiIGZpbGw9IiMwMGE0ZWYiLz48cmVjdCB4PSIxMSIgeT0iMTEiIHdpZHRoPSI5IiBoZWlnaHQ9IjkiIGZpbGw9IiNmZmI5MDAiLz48L3N2Zz4=',
        })
      } else if (v.authority === AUTHORITY_DEV) {
        result.push({
          value: AUTHORITY_DEV,
          text: t('userServices.offline.name'),
          icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzg4OCIgZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bTAgM2MxLjY2IDAgMyAxLjM0IDMgM3MtMS4zNCAzLTMgMy0zLTEuMzQtMy0zIDEuMzQtMyAzLTN6bTAgMTQuMmMtMi41IDAtNC43MS0xLjI4LTYtMy4yMi4wMy0xLjk5IDQtMy4wOCA2LTMuMDggMS45OSAwIDUuOTcgMS4wOSA2IDMuMDgtMS4yOSAxLjk0LTMuNSAzLjIyLTYgMy4yMnoiLz48L3N2Zz4=',
        })
      }
    }
    return result
  })

  return items
}

export const LoginDialog: DialogKey<{ username?: string; service?: string; error?: string }> =
  'login'
