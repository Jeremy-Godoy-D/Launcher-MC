import type { UserProfile } from '@xmcl/runtime-api/src/entities/user.schema'
import type { StateData } from '@launcher/renderer-client'
import { AUTHORITY_DEV } from '@xmcl/runtime-api/src/util/authority'
export { isValidLocalProfileName as validLocalName } from '@xmcl/runtime-api/src/util/offlineUser'

export type Account = StateData<UserProfile>
export type ProfileEntry = { user: Account; id: string; name: string }
export function profileEntries(users: readonly Account[]): ProfileEntry[] {
  return users.flatMap((user) =>
    Object.values(user.profiles).map((profile) => ({ user, id: profile.id, name: profile.name })),
  )
}
export function selectedAccount(users: readonly Account[], selected: string) {
  // A saved external account remains selected; never silently replace it with a local identity.
  return (
    users.find((user) => user.id === selected) ??
    (!selected ? users.find((user) => user.authority === AUTHORITY_DEV) : undefined)
  )
}
