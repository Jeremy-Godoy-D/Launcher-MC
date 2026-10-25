# Matriz de alcance y paridad

Referencia: beta.2, commit `7671c6f1bdc471d42816241920a262a18aca5a44`. Alcance corregido por el usuario: SCOPE.md. Las filas siguen pendientes hasta aceptar sus flujos completos; los fundamentos transversales verificados en la etapa 3 constan en STAGE3.md.

`keep`: conservar comportamiento del núcleo. `remove`: retirada autorizada; no migrar UI ni iniciar el extra. `deferred`: conservar datos y compatibilidad, sin activar/configurar en esta entrega. Las rutas son relativas al renderer antiguo salvo indicación. Las pruebas mencionadas son criterios futuros, no resultados ya obtenidos.

## Núcleo conservado

| ID | Función / entrada anterior | Contratos o fuentes existentes | Destino / aceptación | Estado React |
| --- | --- | --- | --- | --- |
| K01 | Inicio `/`, LaunchCenter.vue | instances.ts, instanceLaunchCoordinator.ts, LaunchService | Última válida, Jugar explícito, no lanzar al montar; nueva destacada no guarda selección por tick. | pending |
| K02 | Biblioteca `/me`, LauncherLibrary.vue | InstanceService, instances.ts, instanceGroup.ts | Buscar/filtrar/ordenar/agrupar, selección persistida, cuadrícula/lista. | pending |
| K03 | Crear/importar, AppAddInstanceDialog/AppImportUrlDialog | instanceCreation.ts, InstanceService, InstanceIOService, ModpackService | Vanilla/loaders/ZIP o formatos admitidos; errores conservan campos. No importar temas/launchers/blueprints como funciones nuevas. | pending |
| K04 | Editar/duplicar/exportar/eliminar, instanceContextMenu.ts | InstanceService, InstanceIOService, ModpackService | Exportación local sí; borrado confirmado y diferenciado de retirar registro. | pending |
| K05 | Versiones/loaders Java, BaseSettingVersions | version*, instanceVersionInstall*, JavaService | Usar resolución/instalación actual; conservar diagnosticar/reparar. | pending |
| K06 | Lanzar/estado/salida/error | LaunchService, launchTask, launchException, instanceLaunch | Instancia/usuario capturados, estado proceso, no doble lanzamiento por Strict Mode. | pending |
| K07 | Resumen `/instance`, Home.vue | InstanceService/VersionService, instanceJavaDiagnose | Runtime/última partida/acciones del núcleo y diagnóstico. | pending |
| K08 | Mods `/instance/mods`, Mod.vue y acciones | InstanceModsService/InstanceModsGroupService, instanceMods, modUpgrade | Activar/instalar/actualizar/retirar/buscar/agrupar según funciones actuales. | pending |
| K09 | Packs `/instance/resourcepacks` | InstanceResourcePacksService, instanceResourcePack | Instalar/activar/ordenar/retirar y metadatos públicos. | pending |
| K10 | Shaders `/instance/shaderpacks` | InstanceShaderPacksService, instanceShaderPack | Compatibilidad, instalar/activar/retirar/actualizar. | pending |
| K11 | Mundos `/instance/save`, Save.vue | InstanceSavesService, instanceSave*, savesSearch | Operaciones locales, datapacks, importar/exportar/clonar/borrar; hashes conservados. Compartir P2P se retira. | pending |
| K12 | Ajustes `/instance/base-setting` | InstanceOptionsService/InstanceService, instanceOptions, instanceEdit | Java/RAM/args/resolución/heredar/restablecer/null, guardar/salir con cambios. Sin SSH ni editor de temas. | pending |
| K13 | Entrar a servidor normal desde Minecraft | InstanceServerInfoService, BaseSettingServer, Instance.server | Conservar destino de servidor al lanzar Java; no confundir con host/SSH/P2P. | pending |
| K14 | Catálogo `/store` | Store.vue, curseforgeSearch/modrinthSearch y clientes | Búsqueda/filtros/proveedores públicos, paginación, offline y fallo independiente. | pending |
| K15 | Fichas `/store/{curseforge,modrinth}/:id` | StoreProject*, clientes existentes, DOMPurify | Información/galería/versiones/destino; conservar scroll/history/foco; ningún HTML ejecutable. | pending |
| K16 | Instalación/actualización de contenido/modpacks | curseforgeInstaller/modrinthInstaller, ModpackService, InstanceInstallService | Dependencias/progreso/error/cancelar y confirmación del servicio; CF exclusivamente proxy. | pending |
| K17 | Cuentas locales `/accounts`, SetupAccount | UserService/OfficialUserService, user.ts, LauncherAccounts | Crear/seleccionar/editar/eliminar local, preservar perfiles y selección. | pending |
| K18 | Ajustes globales `/setting` | BaseService/JavaService, SettingGeneral/Global/Network/Advanced | Persistir idioma/directorios/Java/RAM/red/descargas y opciones núcleo; quitar categorías de extras. | pending |
| K19 | Actualizaciones y notas | BaseService, SettingUpdate/SettingUpdateInfoDialog, ReleaseFile | url pública, apiUrl solo interno, operación manual, integridad, 800×400 y errores. | pending |
| K20 | Tareas/notificaciones | taskMonitor, taskManager, dialog/notifier, AppTaskDialog | Un poll activo sin solapamiento, cancelar/limpiar, errores en área afectada. | pending |
| K21 | Consola integrada / logger.html | InstanceLogService, gameMonitor, windows/logger | Logs/filtros/copiar/exportar/scroll/abrir ventana; sin IA diagnóstica remota. | pending |
| K22 | Onboarding/bootstrap y migration.html | bootstrap/migration preload, Setup, windows/migration | Perfil/ruta seguros, tres etapas, progreso/error, no tocar raíz habitual. | pending |
| K23 | Barra de ventana/teclado/diálogos/arrastre | windowController, dropHandler, dialog, quick commands | Arrastre de archivos núcleo, minimizar/maximizar/cerrar, navegación/foco/accesibilidad. Sin invocar extras. | pending |
| K24 | Apariencia nueva y medios | Nuevo resolvedor; identidad/upstream y galerías públicas existentes | Claro/oscuro/sistema, vídeo/poster/rotación/pausa/rendimiento y fallbacks del plan. | pending |
| K25 | Preferencias y datos anteriores | selectedInstancePath, claves literales en inventory.json, servicios persistentes | Idempotencia, no vaciar storage, soportar datos de extras inertes. | pending |
| K26 | Ayuda/diagnóstico local/licencias | Errores/runtime logs, LICENSE, NOTICE | Mensajes útiles/logs sin secretos; conservar atribución MIT. Sin telemetría a XMCL. | pending |

## Retiradas autorizadas

| ID | Función | Puntos de entrada / acoplamiento observado | Trabajo de retirada | Estado |
| --- | --- | --- | --- | --- |
| R01 | IA/agente/chat | App.vue importa/inicializa useAgent aunque AppOmniDialog recibe agent-enabled=false; composables/agent; AgentService; dependencias pi-ai/pi-agent-core | No portar chat/providers/settings/tools; desconectar arranque/IPC y dependencias exclusivas. Retener utilidades compartidas solo con evidencia. | pending |
| R02 | Bedrock | edition en Instance, BedrockService, BaseSettingBedrockVersions, ramas en HomeActions/instances | UI Java solamente, excluir startup instaladores/servicios Bedrock; datos antiguos no se borran ni reinterpretan como Java. | pending |
| R03 | Amigos/P2P/voz/grupos | Context.ts inicia useTogetherMultiplayer, PeerService, peers, AppMinecraftFriends/AppShareInstance | No conectar RTC/diagnósticos sociales/voz, acciones ni red de XMCL. Distinguir de Minecraft online normal. | pending |
| R04 | Administración SSH/servidor remoto | remoteServer.ts, RemoteServerService, BaseSettingServerManage, exportadores SSH | Quitar credenciales/administración/despliegue/UI/arranque del extra. Conservar formato/exportación local y servidor normal. | pending |
| R05 | Autor/publicación Modrinth | App.vue lazy dialogs create/bind/publish; BaseSettingModrinthProject; modrinthAuthenticatedAPI/ProjectEditor | No migrar autor/login comunitario/publicación. Separar metadatos y descarga públicos, que permanecen. | pending |
| R06 | Navegador de launchers/aplicaciones | browser.html, windows/browser, appsHost preload, createBrowseWindow | Retirar entrada/acciones y desconectar consumidor del build/controlador cuando ya no se use. No portar host descargable. | pending |
| R07 | Mando/Big Picture | AppGamepadPrompt, AppBigPictureView, bigPicture y useGamepad* | No portar navegación/controladores/avisos específicos. Teclado y accesibilidad permanecen. | pending |
| R08 | Blueprints/colecciones/fuentes extra | /instance/blueprints y /store/ftb ya redirigen en router; Context.ts mantiene proveedor blueprint | No reactivarlos; retirar arranque/imports y diálogos exclusivos. Conservar redirecciones documentadas. | pending |
| R09 | Temas/CSS/burbujas antiguos | theme.ts, InstanceThemeService, customCss, AppBackground y AppMood* | No aplicar CSS/media previa; datos inertes. Nuevo sistema de fondos no importa este motor. | pending |
| R10 | Audio de temas | AppAudioPlayer consume currentTheme.backgroundMusic; UI superior | No portar reproductor ni migrar playlist a un extra nuevo; conservar archivos sin autoplay. Vídeos sin audio. | pending |
| R11 | Telemetría de XMCL | telemetry.ts/rendererAction, preload telemetry, instrumentación runtime | Mapear emisores y transporte; conservar errores locales/trazas necesarias sin exportación a servicios heredados. | pending |

## Pospuesto

| ID | Función | Decisión | Estado |
| --- | --- | --- | --- |
| D01 | Configuración y login real Microsoft | No solicitar claves, no configurar OAuth ni afirmar pruebas de login. Preservar datos/contratos para futura implementación. | deferred |

## Contratos transversales y límites del inventario

- `inventory.json` registra 901 archivos de UI/locales/API/preloads y referencias literales de imports, ServiceKeys, almacenamiento y test IDs. Incluye código muerto y no resuelve nombres dinámicos: no demuestra por sí solo acceso real ni alcanza todas las dependencias main/runtime.
- Rutas contrastadas directamente con windows/main/router.ts. /mods, /resourcepacks, /shaderpacks, /save, /base-setting conservan redirección a /instance; /multiplayer, blueprints y FTB no se reactivan.
- Main/logger/migration son keep; browser es remove. Usar mínimos propios de auxiliares.
- ServiceChannels/SharedState tienen cola, métodos heredados y liberación de referencias. Las pruebas de snapshot/suscripción son obligatorias antes de migrar pantallas.
- Separar interfaz de edición de temas retirada de archivos/servidor de assets usados por iconos y contenido; no borrar un servicio compartido por su nombre.
- Conservar corrección pública de descarga beta.2 y proxy CurseForge. Sin ASAR públicos antiguos.
- Pruebas canónicas ci/showcase protegidas. Evidencias propias en specs/react-migration y artifacts ignorados.
- La fase de retirada exige comprobar bootstrap/import graph/red además de ausencia de botones. Esta tabla no afirma que los extras ya estén desactivados en beta.2.

## Regla para actualizar esta matriz

Cambiar pending a implemented solo con archivos React y contrato conectado; cambiar a verified únicamente con referencia a prueba/recorrido sobre el commit pertinente. Cada fila remove requiere evidencia de desconexión antes del cierre de etapa 8. Cambios de alcance requieren instrucción del usuario en SCOPE, no una preferencia de la IA.

Etapa 3: cliente/estados/tareas/eventos, Intlify y preferencias verificados en `086a281` (STAGE3.md/JSON). Apariencia/rendimiento/vídeo/carrusel/vista ya persisten y se sincronizan; aún no se marca K18/K24/K25 completa porque quedan sus flujos de dominio y compatibilidad integral. La nueva UI principal conserva fixtures hasta la etapa 4; las retiradas del runtime siguen pendientes de la etapa 8.

Etapa 4 parcial, `cd6b9ae`: K17 crear/seleccionar/eliminar perfiles locales está conectado y probado, conservando cuentas externas y datos de mundos. Evidencia STAGE4-ACCOUNTS.md/JSON; edición/apariencia y onboarding pendientes, por eso K17/K22 y el criterio onboarding-accounts no se declaran completos. Inicio/catálogo/instancia conservan fixtures identificadas.
