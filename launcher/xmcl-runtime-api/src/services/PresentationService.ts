import type { ServiceKey } from './Service'

export interface InstancePresentation {
  image: string
  sourceUrl: string
  projectUrl: string
  provider: 'modrinth' | 'curseforge'
}

export interface PresentationService {
  resolveInstanceMedia(instancePath: string): Promise<InstancePresentation | undefined>
  /** Removes only this launcher's disposable presentation images. */
  clearCache(): Promise<void>
}

export const PresentationServiceKey: ServiceKey<PresentationService> = 'PresentationService'
