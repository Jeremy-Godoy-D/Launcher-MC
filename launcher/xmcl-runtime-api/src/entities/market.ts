type ModrinthVersionIdentifier = {
  versionId: string
  projectId?: string
  filename?: string
  icon?: string
}

export type InstallMarketOptionsModrinth = {
  market: MarketType.Modrinth

  version: ModrinthVersionIdentifier | ModrinthVersionIdentifier[]
}

type CurseforgeFileIdentifier = {
  fileId: number
  projectId?: number
  icon?: string
}

export type InstallMarketOptionsCurseforge = {
  market: MarketType.CurseForge

  file: CurseforgeFileIdentifier | CurseforgeFileIdentifier[]
}

export type InstallMarketOptions = InstallMarketOptionsModrinth | InstallMarketOptionsCurseforge

export type InstallMarketOptionWithInstance = InstallMarketOptions & {
  instancePath: string
  id?: string
}

export enum MarketType {
  Modrinth,
  CurseForge,
}
