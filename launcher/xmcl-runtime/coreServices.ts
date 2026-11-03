import { PresentationService } from './presentation/PresentationService'
import { ExternalCredentialService } from './credential/ExternalCredentialService'
import { BaseService } from './app/BaseService'
import { AuthlibInjectorService } from './authlibInjector/AuthlibInjectorService'
import { ElyByService } from './elyby/ElyByService'
import { VersionMetadataService } from './install/VersionMetadataService'
import { VersionInstallService } from './install/InstallService'
import { ProjectMappingService } from './moddb/ProjectMappingService'
import { ModMetadataService } from './moddb/ModMetadataService'
import { InstanceIOService } from './instanceIO/InstanceIOService'
import { InstanceInstallService } from './instanceIO/InstanceInstallService'
import { InstanceManifestService } from './instanceIO/InstanceManifestService'
import { InstanceLogService } from './instance/InstanceLogService'
import { InstanceModsService } from './instance/InstanceModsService'
import { InstanceModsGroupService } from './instance/InstanceModsGroupService'
import { InstanceOptionsService } from './instance/InstanceOptionsService'
import { InstanceResourcePackService } from './instance/InstanceResourcePacksService'
import { InstanceSavesService } from './instance/InstanceSavesService'
import { InstanceService } from './instance/InstanceService'
import { InstanceScreenshotService } from './instance/InstanceScreenshotService'
import { InstanceShaderPacksService } from './instance/InstanceShaderPacksService'
import { InstanceServerInfoService } from './instance/InstanceServerInfoService'
import { JavaService } from './java/JavaService'
import { LaunchService } from './launch/LaunchService'
import { ModpackService } from './modpack/ModpackService'
import { ResourcePackPreviewService } from './resourcePack/ResourcePackPreviewService'
import { ServerStatusService } from './serverStatus/ServerStatusService'
import { OfficialUserService } from './user/OfficialUserService'
import { UserService } from './user/UserService'
import { LocalSkinService } from './user/LocalSkinService'
import { VersionService } from './launch/VersionService'

// Credential access remains main-only because ExternalCredentialService has no service key.
export const coreServices = [
  PresentationService,
  ExternalCredentialService,
  BaseService,
  AuthlibInjectorService,
  ElyByService,
  VersionMetadataService,
  VersionInstallService,
  ProjectMappingService,
  ModMetadataService,
  InstanceIOService,
  InstanceInstallService,
  InstanceManifestService,
  InstanceLogService,
  InstanceModsService,
  InstanceModsGroupService,
  InstanceOptionsService,
  InstanceResourcePackService,
  InstanceSavesService,
  InstanceService,
  InstanceScreenshotService,
  InstanceShaderPacksService,
  InstanceServerInfoService,
  JavaService,
  LaunchService,
  ModpackService,
  ResourcePackPreviewService,
  ServerStatusService,
  OfficialUserService,
  UserService,
  LocalSkinService,
  VersionService,
]
