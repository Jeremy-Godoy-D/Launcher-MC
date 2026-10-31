export interface InstanceCreationLinkPreferences {
  version: number
  saves: boolean
  resourcepacks: boolean
  shaderpacks: boolean
  options: boolean
  servers: boolean
}
export const DEFAULT_LINK_PREFERENCES: InstanceCreationLinkPreferences = {
  version: 1, saves: false, resourcepacks: false, shaderpacks: false, options: false, servers: false,
}
export interface InstanceLinkOperations {
  linkSaves: (path: string) => Promise<void>
  linkResourcePacks: (path: string) => Promise<void>
  linkShaderPacks: (path: string) => Promise<void>
  linkOptions: (path: string) => Promise<void>
  linkServers: (path: string) => Promise<void>
}
export async function applyInstanceLinkPreferences(path: string, preferences: Omit<InstanceCreationLinkPreferences, 'version'>, operations: InstanceLinkOperations) {
  const failed: string[] = []
  for (const [key, run] of [
    ['saves', operations.linkSaves], ['resourcepacks', operations.linkResourcePacks], ['shaderpacks', operations.linkShaderPacks], ['options', operations.linkOptions], ['servers', operations.linkServers],
  ] as const) {
    if (preferences[key]) try { await run(path) } catch { failed.push(key) }
  }
  return failed
}
