# Matriz de alcance y paridad

Referencia: beta.2, commit `7671c6f1bdc471d42816241920a262a18aca5a44`. Alcance corregido por el usuario: SCOPE.md. Las filas siguen pendientes hasta aceptar sus flujos completos; los fundamentos transversales verificados en la etapa 3 constan en STAGE3.md.

`keep`: conservar comportamiento del núcleo. `remove`: retirada autorizada; no migrar UI ni iniciar el extra. `deferred`: conservar datos y compatibilidad, sin activar/configurar en esta entrega. Las rutas son relativas al renderer antiguo salvo indicación. Las pruebas mencionadas son criterios futuros, no resultados ya obtenidos.

## Núcleo conservado

| ID | Función / entrada anterior | Contratos o fuentes existentes | Destino / aceptación | Estado React |
| --- | --- | --- | --- | --- |
| K01 | Inicio `/`, LaunchCenter.vue | instances.ts, instanceLaunchCoordinator.ts, LaunchService | Última válida, Jugar explícito, no lanzar al montar; nueva destacada no guarda selección por tick. | complete |
| K02 | Biblioteca `/me`, LauncherLibrary.vue | InstanceService, instances.ts, instanceGroup.ts | Buscar/filtrar/ordenar/agrupar, selección persistida, cuadrícula/lista. | complete |
| K03 | Crear/importar, AppAddInstanceDialog/AppImportUrlDialog | instanceCreation.ts, InstanceService, InstanceIOService, ModpackService | Vanilla/loaders/ZIP o formatos admitidos; errores conservan campos. No importar temas/launchers/blueprints como funciones nuevas. | pending |
| K04 | Editar/duplicar/exportar/eliminar, instanceContextMenu.ts | InstanceService, InstanceIOService, ModpackService | Exportación local sí; borrado confirmado y diferenciado de retirar registro. | complete |
| K05 | Versiones/loaders Java, BaseSettingVersions | version*, instanceVersionInstall*, JavaService | Usar resolución/instalación actual; conservar diagnosticar/reparar. | pending |
| K06 | Lanzar/estado/salida/error | LaunchService, launchTask, launchException, instanceLaunch | Instancia/usuario capturados, estado proceso, no doble lanzamiento por Strict Mode. | pending |
| K07 | Resumen `/instance`, Home.vue | InstanceService/VersionService, instanceJavaDiagnose | Runtime/última partida/acciones del núcleo y diagnóstico. | pass |
| K08 | Mods `/instance/mods`, Mod.vue y acciones | InstanceModsService/InstanceModsGroupService, instanceMods, modUpgrade | Activar/instalar/actualizar/retirar/buscar/agrupar según funciones actuales. | pending |
| K09 | Packs `/instance/resourcepacks` | InstanceResourcePacksService, instanceResourcePack | Instalar/activar/ordenar/retirar y metadatos públicos. | pending |
| K10 | Shaders `/instance/shaderpacks` | InstanceShaderPacksService, instanceShaderPack | Compatibilidad, instalar/activar/retirar/actualizar. | pending |
| K11 | Mundos `/instance/save`, Save.vue | InstanceSavesService, instanceSave*, savesSearch | Operaciones locales, datapacks, importar/exportar/clonar/borrar y todas las herramientas locales: mapa, progreso, dimensiones, regiones y editar/copiar/pegar/eliminar chunks; revisión y backups de cambios. Confirmado por el usuario 2026-10-31. Compartir P2P se retira. | pending |
| K12 | Ajustes `/instance/base-setting` | InstanceOptionsService/InstanceService, instanceOptions, instanceEdit | Java/RAM/args/resolución/heredar/restablecer/null, guardar/salir con cambios. Sin SSH ni editor de temas. | pass |
| K13 | Entrar a servidor normal desde Minecraft | InstanceServerInfoService, BaseSettingServer, Instance.server | Conservar destino de servidor al lanzar Java; no confundir con host/SSH/P2P. | pass |
| K14 | Catálogo `/store` | Store.vue, curseforgeSearch/modrinthSearch y clientes | Búsqueda/filtros/proveedores públicos, paginación, offline y fallo independiente. | pending |
| K15 | Fichas `/store/{curseforge,modrinth}/:id` | StoreProject*, clientes existentes, DOMPurify | Información/galería/versiones/destino; conservar scroll/history/foco; ningún HTML ejecutable. | pending |
| K16 | Instalación/actualización de contenido/modpacks | curseforgeInstaller/modrinthInstaller, ModpackService, InstanceInstallService | Dependencias/progreso/error/cancelar y confirmación del servicio; CF exclusivamente proxy. | pending |
| K17 | Cuentas locales `/accounts`, SetupAccount | UserService/OfficialUserService, user.ts, LauncherAccounts | Crear/seleccionar/editar/eliminar local, preservar perfiles y selección. | complete |
| K18 | Ajustes globales `/setting` | BaseService/JavaService, SettingGeneral/Global/Network/Advanced | Persistir idioma/directorios/Java/RAM/red/descargas y opciones núcleo; quitar categorías de extras. | pending |
| K19 | Actualizaciones y notas | BaseService, SettingUpdate/SettingUpdateInfoDialog, ReleaseFile | url pública, apiUrl solo interno, operación manual, integridad, 800×400 y errores. | pending |
| K20 | Tareas/notificaciones | taskMonitor, taskManager, dialog/notifier, AppTaskDialog | Un poll activo sin solapamiento, cancelar/limpiar, errores en área afectada. | pending |
| K21 | Consola integrada / logger.html | InstanceLogService, gameMonitor, windows/logger | Logs/filtros/copiar/exportar/scroll/abrir ventana; sin IA diagnóstica remota. | pass |
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

Bloque posterior `0b3c713`: onboarding principal de K22 conectado, carpeta validada/confirmada en main, perfil local opcional y recarga sin repetir wizard; compatibilidad Vue probada. Evidencia STAGE4-ONBOARDING.md/JSON. Aún faltan migración auxiliar y las acciones reales Crear/Importar del final del recorrido, además de edición de K17; no cierra las filas ni etapa4. La pausa/reanudación e interrupciones del vídeo de K24 tienen regresión nativa adicional; datos de instancias todavía de ejemplo.

Bloque `7783a81`: K01/K02/K24/K25 parcialmente conectadas a InstanceState real: Inicio/Biblioteca muestran Java, sincronizan mutaciones, filtran loaders actuales y conservan selectedInstancePath literal entre recargas/ventanas. La destacada es independiente y una selección ausente no se reemplaza silenciosamente. Carga/error/Reintentar/vacío y texto largo probados en Electron. Evidencia STAGE4-LIBRARY.md/JSON:72 unitarias,12 Electron React incluido Strict Mode,2 Vue,9 harness. Inicio/Biblioteca ya no usan fixtures de instancias en producto; catálogo sí. Falta crear/importar/operar/lanzar desde React, validar disponibilidad física/diagnósticos, galerías/caché/pausa al jugar y presupuesto medido. Las tres gates de etapa4 y estas filas conservan pending; Microsoft permanece deferred.

Bloque `0fed2fc`: K03 y final de K22 parcialmente conectados: creación Java/Vanilla/loaders e importación mrpack/ZIP local desde Biblioteca/vacíos/onboarding. Guardado nativo, revisión previa, filtros de configuración/rutas y reintento sobre carpeta retenida verificados;151 unitarias y19 recorridos Electron incluyendo Strict/Vue,9 harness. Evidencia STAGE4-CREATION.md/JSON. Los metadatos de proveedores son fixtures en los nuevos E2E; no se verificó instalación/ejecución real de Minecraft/loaders. Faltan URL/carpeta/avanzadas/enlaces de K03, recuperación tras destruir ventana, lanzamiento/diagnósticos/procesos de K06, edición/apariencia K17 y demás criterios. Las tres gates siguen pendientes; no promover filas completas ni Microsoft.

Bloque 734b006: K06/K18 parcialmente conectadas a preparación/lanzamiento Java, perfil y ruta capturados, diagnóstico, RAM, recuperación de manifiesto tras recarga, procesos y Java automático con alternativa oficial/redetección. K24 pausa con partida activa y vuelve a reproducir el MP4 con foco nativo. Evidencia STAGE4-LAUNCH.md/JSON: 263 unitarias, 23 Electron incluyendo Strict/Vue, 9 harness; 33 informes Axe sin violaciones, 46 incompletos. El usuario añadió Java automático a SCOPE el 2026-10-25. En los nuevos E2E instalación/descubrimiento Java y procesos son sintéticos: no se verificaron descarga real de Java, partida Minecraft/loaders ni terminación real de procesos. No se cierran filas completas ni gates; faltan K03 URL/carpeta/avanzadas, operaciones, selector Java completo, perfiles, galerías/caché/rendimiento y demás criterios. Microsoft sigue deferred y no se publicó producción.

Bloque ab03193: marca definitiva Grimo Launcher, iconos cobre y horizontales por tema, con originales preservados. Cambio visible y empaquetado compatible con identidades LauncherMC/appId/protocolo/repositorio anteriores. K24/K25 y onboarding se mantienen con 269 unitarias y 25 Electron, tipos/lint/builds React/Vue; evidencia STAGE4-BRANDING.md/JSON. Cambiar nombre no cierra ninguna fila/gate, no ejecuta instalador/actualización ni publica. Retomar K03 y el resto del plan, Microsoft deferred.

Bloque f3ab9be: K03 añade revisión HTTPS explícita, importación de carpetas estándar Vanilla/Prism/Modrinth/CurseForge y opciones avanzadas Java/RAM/enlaces. Copia de mundos independiente del origen, perfiles externos filtrados y reintento sobre identidad retenida. STAGE4-IMPORTS.md/JSON: 301 unitarias, 29 escenarios Electron distintos (26 React/1 Strict/2 Vue), cuatro repetidos tras ajuste visual y nueve harness; tipos/lint/builds aprobados. K03 conserva pending por versiones personalizadas/standalone y paridad completa; los patches Prism se rechazan explícitamente. No cerrar K02/K04/K06/K17/K18/K22/K24/K25 ni gates: operaciones, perfiles, medios y restantes etapas siguen pendientes. Sin pruebas de Java/juego reales ni publicación; Microsoft deferred.

Bloque 4ab24c7: K03 conserva versiones Prism standalone con base completa, bibliotecas locales, compatibilidad Java y argumentos intrínsecos de parches, sin comandos/Java personales del origen. Revisión sin escrituras, huella verificada al confirmar y publicación que conserva destinos distintos. Evidencia STAGE4-PRISM.md/JSON:349 unitarias/36 archivos,30 escenarios Electron distintos, cinco del área repetidos al final;tipos/lint/builds y nueve harness. K03/gates siguen pending por Vanilla personalizada, Prism parcial/alias jar y demás paridad; pendientes también operaciones K02/K04 y restantes etapas. No se probó juego/Java real, instalador, actualización aislada ni publicación; Microsoft deferred.

Bloque 9cfd14c: K03 añade Vanilla local con herencia, cliente/bibliotecas referenciados, JSON con IDs aislados, huella al confirmar y publicación sin reemplazar destinos distintos. Raíz de versiones separada de gameDir, perfiles latest-release/snapshot concretados y versión desconocida sin metadatos bloqueada. Evidencia STAGE4-VANILLA.md/JSON:362 unitarias/37 archivos,32 escenarios Electron distintos, dos repetidos al final, nueve harness y tipos/lint/builds. K03/gates mantienen pending por Prism parcial/clientes modificados/alias y paridad restante. Sin juego/Java/cliente reales, instalador/actualización aislada, rendimiento ni publicación; Microsoft deferred.

Bloque ba7c769: K03 conserva clientes modificados/alias Vanilla y Prism standalone completo en caché privada .client-*, sin reemplazar el cliente oficial. clientJar opcional se aplica a classpath, prechequeo, instalación/diagnóstico y avances; Minecraft/Java/loaders y servidor conservan identidad/rutas. STAGE4-CLIENTS.md/JSON:394 unitarias/42 archivos,34 escenarios Electron finales, dos suites iniciales con un timeout de actionability documentado y test con foco explícito, nueve harness, tipos/lint/builds. K03/gates siguen pending por Prism con base incompleta y demás paridad; después K02/K04 operaciones. Cliente local sin URL exige reimportación si falta caché. Sin juego/Java/cliente reales, instalador/actualización aislada, rendimiento ni publicación; Microsoft deferred.

Bloque 7ea3348: K03 completa la base Minecraft ausente/incompleta de Prism desde origen/caché o JSON oficial con HTTPS/origen/hash/tamaño/timeout verificados. Composición en runtime conserva argumentos/bibliotecas/Java/logging y revalida la base al confirmar. STAGE4-PRISM-BASE.md/JSON:409 unitarias/44 archivos,36 escenarios Electron distintos, cinco del área solapados, nueve harness, tipos/lint/builds; smoke de dos JSON Mojang reales sin descargar JAR. K03/gates siguen pending por paridad restante y componentes adicionales sin parche explícitamente bloqueados. Continuar K02/K04 operaciones, sin repetir base Minecraft ni clientes aislados. Sin juego/Java/cliente reales, instalador/actualización aislada, rendimiento ni publicación; Microsoft deferred.

Bloque 72fec14: K02/K04 conectan edición de nombre/descripción/autor, copia, retirada y borrado confirmado, grupos, filtros y orden. CAS nativo/colas atómicas, carpetas persistidas estables al renombrar, raíz/hermanos/junctions protegidos y bloqueo si falla conservar mundos. STAGE4-OPERATIONS.md/JSON:442 unitarias/49 archivos,39 escenarios Electron distintos incluido reinicio del EXE, tres del área solapados, nueve harness y tipos/lint/builds. K02/K04 siguen pending: exportación local (incluir clientJar en ZIP offline), gestión completa de grupos, biblioteca extensa y tareas de copia. K03 conserva auditoría pendiente; tres gates abiertas. Sin juego/Java reales, instalador/actualización aislada, rendimiento ni publicación; Microsoft deferred.

Bloque 4ea5436: K04 añade exportación local revisada, selección/formatos, staging sin sobrescritura y recuperación de clientes aislados. Modrinth/CurseForge se reimportan nativamente; ZIP de runtime se extrae y recupera por carpeta Vanilla, con assets potencialmente descargados de nuevo y Java separado. STAGE4-EXPORT.md/JSON:460 unitarias/51 archivos,43 escenarios Electron distintos, siete del área solapados y nueve harness; tipos/lint/builds. Se corrigieron errores IPC y foco tras recrear tarjetas. K02/K03/K04 y tres gates siguen pending: grupos existentes, tareas/recuperación de copia, bibliotecas extensas, exportación de enlaces compartidos y demás paridad. Sin juego/Java reales, NSIS/actualización aislada, rendimiento ni producción; Microsoft deferred, Vue predeterminado.

Bloque 1e231a4: K02 añade gestión de grupos existentes desde Biblioteca, incluso vacía: renombrar, conflicto nativo/revisión y disolver conservando miembros/orden/color y datos de otras ediciones. STAGE4-GROUPS.md/JSON: 466 unitarias/51 archivos y 45 escenarios Electron, dos del área solapados, nueve harness; tipos/lint/builds. Se corrigen aserciones de rutas relativas persistidas y URL canónica 8.3 detectada por el primer CI de PR4, aún pendiente de verificar de nuevo. K02/K03/K04 y tres gates conservan pending por tareas/recuperación de copia, virtualización, enlaces compartidos de exportación y demás paridad. Microsoft deferred; Vue predeterminado, sin publicación de producción.

Bloque d161d36: prerrequisito de K04, duplicador espera escrituras iniciadas al abortar/fallar y no informa éxito tras cancelar el último archivo. Conserva contratos/errores/enlaces/mundos. STAGE4-COPY-CANCEL.md/JSON: 471 unitarias/51 archivos, tres Electron afectados, dos Vue y nueve harness; tipos/lint/builds. La regresión completa de45 escenarios es la previa de STAGE4-GROUPS. CI segundo intento pasó466 unitarias y9 harness, falló por baseline ausente en shallow checkout; fetch-depth0 corregido, nuevo resultado remoto pendiente. K02/K03/K04/tres gates siguen pending: UX/recuperación de copia, virtualización, enlaces de exportación y demás paridad. Sin producción/Java/juego/NSIS/rendimiento; Microsoft deferred, Vue predeterminado.


Bloque4c49a74: K04 añade progreso y cancelación de copia, diario SHA-256, recuperación explícita en mismo destino tras cancelar/reiniciar el EXE, archivos independientes y bloqueo nativo de lanzamiento/exportación mientras esté pendiente o inválida. Test de junction reprodujo creación prematura de directorios externos y verifica su corrección. STAGE4-COPY-RESUME.md/JSON:493 unitarias/53 archivos,48 escenarios distintos (45React/1Strict/2Vue), seis del área solapados,9 harness, tipos/lint/builds;61 Axe0violaciones/114incompletos. CI anterior40277370887 pasó React/Vue sobre fb2fee1, nuevo bloque pendiente remoto. K02/K03/K04/tres gates siguen pending por virtualización, enlaces compartidos, cancelación del escaneo, auditoría K03 y demás criterios. Sin certificar kill/corte de energía durante copia, juego/Java reales, NSIS/actualización aislada, rendimiento ni AA manual. Microsoft deferred, Vue predeterminado, sin producción.


Bloques0e0aad8/14c0399: K02 avanza con biblioteca virtualizada sobre1000 instancias nativas de fixture, filtros/cantidad, selección y teclado entre tarjetas no montadas; foco/visibilidad conservados con scroll/redimensión. Se remiden filas al terminar scroll para retirar alturas estimadas desfasadas. STAGE4-VIRTUAL-LIBRARY.md/JSON:493 unitarias/53 archivos,49 escenarios distintos (46React/1Strict/2Vue), siete afectados solapados tras ajustes finales,9 harness, tipos/lint/builds. Matriz8 capturas/temas/vistas/tamaños,69 Axe sin violaciones/122incompletos en regresión y17/0/22 del área final (solapados). CI40284702907 aprobó Vue y44React; fixture de foco/navegación de vídeo corregida, nuevo run pendiente. K02/K03/K04/tres gates siguen pending por cancelación de escaneo, enlaces compartidos, auditoría K03 y demás criterios. Sin reposo60s,100000 instancias,AA/RTL manual,juego/Java reales,NSIS/actualización aislada ni producción. Microsoft deferred; Vue predeterminado.


Bloque70c70d8: K04 conserva carpetas compartidas nativas al copiar/exportar, valida en main solo enlaces superiores a carpetas globales exactas y rechaza enlaces alterados/anidados. Cancelación de revisión cierra streams y no crea destino ni archivo parcial; privacidad, hashes, archivos independientes y recuperación conservados. STAGE4-SHARED-CONTENT.md/JSON:514 unitarias/53 archivos,53 escenarios distintos (50React/1Strict/2Vue),8 afectados finales solapados,9 harness, tipos/lint/builds, seis capturas revisadas. CI previo40287929295 pasó React/Vue sobre e4a60c0; nuevo código pendiente remoto. K02/K03/K04 y tres gates siguen pending por auditoría/resto de etapa4 (perfiles,medios/caché/rendimiento). Sin juego/Java reales,NSIS/actualización aislada,60s ni AA/RTL manual exhaustiva. Microsoft deferred,Vue predeterminado,producción sin cambios.

Bloque fa9fff5: K17 y onboarding-accounts completos para gestión local: alta/selección/eliminación, apariencia skin/capa/modelo/reset y errores, foco, persistencia y reinicio reales. Login y carga usan la misma cuenta local canónica; equivalencia exacta de OFFLINE en React sin interpretar x: como URL de navegador, con UUID de juego y perfiles previos conservados al crear otro. PNG locales acotados, bytes independientes incluso sobre enlaces duros antiguos y mutaciones concurrentes protegidas. STAGE4-PROFILE-APPEARANCE.md/JSON:523 unitarias/56 archivos,55 escenarios distintos (52React/1Strict/2Vue),4 afectados finales solapados,9 harness, tipos/lint/builds y6 capturas.79 Axe0violaciones/142incompletos; área final8/0/12. Dos gates restantes de etapa4 pendientes por auditoría de biblioteca/importaciones y medios/caché/tres clips/rendimiento. CI previo40327122067 pasó58c78ab; nuevo código pendiente remoto. Apariencia dentro de Minecraft, juego/Java reales, NSIS/actualización aislada y AA/RTL manual exhaustiva no certificados. Microsoft deferred,Vue predeterminado,producción sin cambios.

Bloque a41a322: K04 añade elegir/previsualizar/restablecer iconos locales, sin cambiar selección, identidad ni mundos. Se reproducen y corrigen enlaces duros que modificaban originales; nuevos assets por hash/atomicidad y8MiB acotados. Rutas especiales funcionan en protocolo real; metadata await y exclusión específica de temporales corrigen carreras observadas. STAGE4-INSTANCE-ICONS.md/JSON:543 unitarias/58 archivos,57 escenarios distintos (54React/1Strict/2Vue),9 harness, tipos/lint/builds,5 capturas revisadas,83 Axe0violaciones/150incompletos. K02/K03/K04/gates Inicio y Biblioteca siguen pending hasta cruce de paridad restante y medios/caché/tres clips/rendimiento. Actualización de contenido y ajustes completos siguen en5–7. CI anterior40332397490 falló; correcciones locales comprobadas y nuevo CI pendiente tras push. Microsoft deferred,Vue predeterminado,producción sin cambios; juego/Java reales,NSIS/actualización aislada,60s yAA/RTL manual no certificados.

## Avance de medios y hallazgo de paridad — 2026-10-26

Fuente80c8f3b; STAGE4-PROVIDER-MEDIA.md/JSON. K24 ahora tiene galerías propias Modrinth/CurseForge por ID y caché privada50MiB, probadas con proveedores reales y fixtures; sigue pendiente por clips/precarga/vídeo genérico etiquetado/rendimiento. API de limpiar caché lista, entrada de Ajustes en K18/etapa7. Regresión569 unitarias y63 escenarios distintos; Vue conserva la predeterminada. No se cierra etapa4.

K02 tiene una diferencia concreta: Vue busca nombre/Minecraft/loader+versión con trim; React solo nombre. Corregirla con regresión antes de marcar paridad. K04/K08: cruzar la copia anterior de modsGrouping con duplicación/reanudación, sin destruir datos. K03 conserva la cobertura de formatos/loaders ya registrada; argumentos/resolución/servidor pertenecen a K12/etapa5 y la actualización de contenido/acción desde Biblioteca a K16/etapa6. No convertir esos pendientes en aprobación global ni repetir los bloques ya verificados.

## Búsqueda y duplicación — 2026-10-26

Fuente89bd5d8; STAGE4-LIBRARY-PARITY.md/JSON. K04 completo en su alcance de metadatos/icono/duplicación-reanudación/exportación local/retirar o borrar con confirmación, acreditado por informes anteriores y61React de regresión. Incluye grupos nativos y legado, fallo de preferencias sin repetir copia ni sobrescribir el destino. K16 conserva la instalación/actualización pública en etapa6.

K02 recupera búsqueda por nombre/Minecraft/loader+versión y trim; falta comprobar su orden reciente con Inicio frente a últimas partidas. No repetir esos arreglos ni el bloque de galerías/caché. Consumo/migración de grupos heredados en Mods pertenece a etapa5; no borrar el legado antes de confirmar persistencia ni reemplazar datos nativos actuales. Etapa4 sigue parcial.579 unidades/64 escenarios distintos; juego/Java reales y publicación permanecen pendientes.

Bloque93321cf: K02 completo con orden manual/nombre/Última partida y persistencia, sumado a búsqueda/filtros/grupos/vistas/virtualización anteriores. Inicio prioriza seleccionada y después partidas; conserva identidad al reordenar/retirar y rotar no escribe selección/metadatos. STAGE4-RECENT-ORDER:589 unitarias,67 escenarios distintos,9harness;91Axe/0violaciones/162incompletos. Historia E2E sintética, no juego. K01/K03/K06 y dos gates de4 siguen pendientes de medios/rendimiento e instalación/Java/juego reales. No publicar todavía.

Bloque505ea2d/fixturebfd19c6: K01/K24 avanzan con3clips locales autorizados,precarga siguiente imagen,portada propia de pack junto a ambiente genérico identificado,liberación de src y pausa por región. STAGE4-AMBIENT-MEDIA:591unitarias/69escenarios distintos,91Axe/0violaciones/162incompletos y9harness;4capturas congeladas revisadas. Consumo60s/comparación beta.2/arranque pendientes; no cerrar gate Home ni etapa4. Cabecera de instancia en5; fuentes originales ignoradas,no imágenes IA.

Bloque6f31960: K24 con medición parcial Windows:5ventanas60s,póster/vídeo/rotación/minimizado/rendimiento;renderer vídeo1,767% núcleo y23,982fps,pausas60s. STAGE4-PERFORMANCE-PRELIMINARY. GPU física/VRAM,memoria vs beta.2/arranque5 y cargas restantes aún pendientes;no cerrar K24/gate4. Harness permite desactivar grabador solo en benchmark y conserva default. E2Eglobal56diagnósticos en otras fuentes,nuevas3fuentes0;sin cambios de producto/publicación.

Cierre4,6e3b83d:K01 completo para selección/Jugar explícito/no auto/rotación independiente,sumado a K02/K04/K17. STAGE4-CLOSURE:591unitarias,69escenarios funcionales,4benchmarks candidata/1referencia,9harness;Home3recientes corrige1000DOM yURLvacía evita excepciones. CPU/memoria/arranque/GPUcumplen los presupuestos de integración en referencia. Gates4passed y5activa conforme PLAN5.4 «vía servicios»;K03/K05/K06 conservan pendiente su aceptación física/end-to-end,ninguna partida/Java/instalador certificada. TareasInicio7,cabecera/contenido5,catálogo6,retirada8 yrelease9 pendientes. No cambian PLAN/SCOPE.

Bloques etapa5 `862c9d6`/`c6d7430`: archivos locales de mods (copia sin reemplazo yretirada confirmada porhash) einformación nativa conectados yverificados en LOCAL-FILES/MOD-INFO. El modelo de metadatos/dependencias/compatibilidad es compartido sin Vue ylos adaptadores conservan su contrato legacy. K08 sigue pending: información de dependencias declaradas no equivale a diagnósticos/actualización completos; packs/shaders yreglas compartidas aún pendientes. Ninguna gate5 se cierra por estos avances.

Bloque etapa5 `590217d`, DIAGNOSTICS: diagnóstico de metadatos y cambios protegidos por inventario/configuración + SHA-1 seleccionados. Reglas Quilt/NeoForge/Java preservadas; desconocidos explícitos; datos aún en lectura no producen un resultado limpio prematuro. 669 unitarias y94 escenarios funcionales distintos pasan. K08 permanece pending por propuestas/revisión de dependencias y actualizaciones; el diagnóstico no certifica una partida real. Packs/shaders y demás gates5 pendientes; no reintroducir extras.

Bloque etapa5 `f6e78e5`, MOD-CHANGES: propuestas transitivas y revisión explícita de dependencias al activar/desactivar; preserva proveedores ambiguos, compartidas y selección ante datos incompletos. Confirmación valida revisión/huella/hashes; cancelar no modifica bytes. 678 unitarias y97 escenarios funcionales distintos pasan localmente. K08 sigue pending por actualización de contenido; packs/shaders y otras gates5 no se cierran. CI previo40610051490 falló la sincronización de foco del test de medios; fuente f6e78e5 conserva las aserciones y espera el retorno de foco, pendiente CI nuevo.

Bloque etapa5 `cf2b77d`, INSTALL-STATE: publicación de perfiles/locks mediante temporal exclusivo aleatorio, conserva archivos ajenos ante hardlinks plantados y el estado anterior ante fallos. 683 unitarias y11 escenarios empaquetados focales pasan; no se repitieron los97 de UI sin cambios (CI40612683266 verde en f6e78e5/0d3ae7e). K08/gates5 pendientes: autorizar/validar instalador antes de updates, preservar desactivados y conectar actualización de contenido; luego resto5/6–9.

Bloque etapa5 `33ef2a3`, INSTALL-AUTHORITY: instalador limitado a Java registrado/raíz directa y sin proceso activo para aplicar; revalidación bajo locks y helpers privados fuera de RPC.694unitarias y14recorridos empaquetados focales pasan, ambos renderers/hosts recompilados. CI previo40615348161 sobrefdce3bc/cf2b77d verde; nuevo pendiente. K08/gates5 siguen pending: validar workspace/backup/profile yancestros, conservar.disabled yconectar actualización; luego packs/shaders/mundos/ajustes/consola y6–9.

Bloque etapa5 `f25aab4`, INSTALL-PATHS: estructura yancestros privados de perfiles/workspace/backup validados;legacy externo conservado con preparación privada nueva;.backups reservado.701unitarias y17recorridos Native focales pasan,ambos renderers/hosts reconstruidos. CI40617567629 falló2timeouts funcionales,solo esos límites ampliados a15000ms; nuevoCI requerido. K08/gates5 pending: hijos de destino/staging/backup,updates conservando.disabled,packs/shaders yresto5/6–9.

Bloque etapa 5 `9d6ad2b`, INSTALL-TARGETS: valida destinos y archivos privados por operación, conserva shared links autorizados y recursos hardlinked al rehacer staging. Registro temprano conserva orden de solicitudes y descargas paralelas; una colisión surgida después conserva otros archivos listos. 709 unitarias y 19 recorridos Native focales pasan. CI anterior 40717537004 verde sobre 1da8953/f25aab4; nuevo requerido. K08/gates5 pendientes: updates con .disabled/revisión/guardas vigentes, packs/shaders y resto 5/6–9.

Bloque etapa 5 `0ae267c`, UPGRADE-MANIFEST: constructor API compartido con wrapper Vue; conserva mods .disabled, identidad de proveedores y planes de entrada. 717 unitarias/79 archivos y 19 recorridos Native focales pasan. CI 40721432762 aprobó ambos renderers para el bloque anterior 9d6ad2b/f27c286; nuevo source requiere CI. K08/gates5 pendientes: consultas y revisión de updates React con hashes/configuración vigentes, cola/reanudación y packs/shaders/resto 5/6–9.

Bloque etapa5 `5bddad9`, REVIEWED-UPGRADES: revisión exacta Native con hashes/configuración antes/durante aplicación y guardas persistidas; reanudación reconoce publicación propia y preserva cambios ajenos. Preview/aplicación comparten supersession.727unitarias/79archivos y23recorridos empaquetados focales pasan; tipos/lint aprobados. CI40723599113 verde para690eaae/0ae267c; nuevoCI requerido. K08/gates5 pending: conectar consultas/revisión React y recuperación/progreso, packs/shaders/resto5/6–9. No certifica descarga pública,Java,juego,NSIS/delta ni transacción FS.

Bloque etapa5 `98c7604`, MOD-UPDATES: consultas/selección/revisión React conectadas con guardas Native y reanudación por operación. getModSources evita la carrera de IDs agrupados500ms; overrides de planes revisados se rechazan antes de cualquier trabajo.747unitarias/80archivos,tipos/lint y39escenarios distintos empaquetados (34React+2LIVE+3Vue),más4UIrepetidos pasan. LIVE actualiza ModMenu11.0.4→11.0.5 por ambos proveedores con hash/desactivado/archivo mundo intactos;no juego. K08/gates5 pending por recuperación/revisión parcial/cancelación y packs/shaders/resto5/6–9. CI40732582108 verde para9b0c117/5bddad9; nuevoCI requerido. Ver MOD-UPDATES para comandos/hashes/límites; sin cambios en producción/proxy.

### Recuperación de actualizaciones revisadas (dbc4473)

STAGE5-MOD-RECOVERY.md: vista previa Native de solo lectura, confirmación fresca, cancelación/reintento y aislamiento A→B; conserva backups/otra cola/mundo. Fix Windows de alias por mayúsculas con archivo editado.770unitarias/81archivos y15escenarios empaquetados distintos;E2Eglobal56previos/0en39/40/42. K08/etapa5 pendientes para comprobación completa. Siguiente:packs/shaders,mundos/ajustes/consola.

### Selección y prioridad de resource packs (d63be84)

STAGE5-RESOURCE-PACK-SELECTION.md: lista/búsqueda/activación/prioridad en React, entradas Minecraft/legacy/carpetas conservadas y guardado Native con snapshot, límites y guardas de procesos. Ajustes compartidos advertidos y conservados.792unitarias/83archivos y9escenarios empaquetados distintos; K09/gates5 pendientes de importación/retirada, información/grupos/compartidos/updates y aceptación completa. Shaders/mundos/ajustes/consola y6–9 pendientes. No equivale a etapa5 terminada.

### Archivos locales de packs (f34855e)

STAGE5-RESOURCE-PACK-FILES.md: importar ZIP/carpetas+assets sin reemplazo, revisión/retirada hacia backups, fuentes/opciones/mundos/otro manifiesto preservados y recuperación de archivo ilegible.809unitarias/85archivos y10escenarios empaquetados distintos. K09 pendiente de coordinación con arranque compartido (shortcut explícito), información/grupos/compartidos/updates y cierre completo; etapa5/K08 también pendientes. No publicar con ese criterio abierto.

### Packs durante arranque y salida (b7ec02c)

STAGE5-RESOURCE-PACK-STARTUP.md: lock compartido e instancia cubren preparativos y registro cliente/servidor; el proceso permanece registrado hasta salida real. Elimina volcados de opciones con entorno/argumentos.821unitarias/86archivos y18escenarios empaquetados distintos; tipos/lint aprobados. Resuelve la carrera declarada en FILES;K08/K09/gates5 siguen pending. Proximo:informacion/grupos/compartidos/updates de packs,shaders,mundos,ajustes,consola y6-9. No acredita Java/juego/NSIS/delta reales ni publicacion.

### Informacion y grupos de packs (c3f317a)

STAGE5-PACK-INFORMATION-GROUPS.md: ficha local de texto seguro, limites/formato validado y foco; grupos Native resourcepacks separados, filtro/asignacion/edicion revisada sin migrar legacy mods.824unitarias/87archivos,tipos/lint y18escenarios distintos(16React+2Vue),mas1visual repetido,8Axe0violaciones/8incomplete. K08/K09/gates5 pendientes:gestion de compartidos/updates de packs,shaders,mundos,ajustes,consola y6-9. No acredita compatibilidad de partida,Java/juego/NSIS/delta reales ni publicacion.

Seguimiento CI-WINDOW-FOCUS/217a623:CI40827795644 Vue aprobado,React119/120;12-launch espera estabilidad de raton. Fixture verifica foco Native y activacion Enter conservando pausas/reproduccion,1focal aprobado y56diagnosticos E2E identicos. CI nuevo completo requerido; gates sin cambios.

### Carpetas compartidas y copias privadas de packs (46b6230)

STAGE5-PACK-SHARING.md: revision Native con SHA-256/conflictos, copias independientes y respaldo previo; guards de juegos/arranque y observacion preservada al sustituir carpeta en Windows. Metodos legacy usan el mismo motor; desvincular conserva archivos.841unitarias/88archivos,tipos/lint y22escenarios distintos(18React+4Vue),mas1focal solapado,8Axe0violaciones/16incomplete. CI40830063540 aprobo el bloque anterior765c6be/c3f317a+217a623. K08/K09/gates5 siguen pending por updates de packs y aceptacion completa;shaders,mundos,ajustes,consola y6-9 despues. No certifica Java/juego/NSIS/delta reales ni publicacion.

Seguimiento b375a9c/CI-SHARING-FAILURES:CI40874755065 termino839/841,Vue cancelado;dos fixtures no inyectaban el fallo esperado. Ahora interceptan fs-extra.move y verifican fallo/restauracion;11focales y841unitarias locales aprobadas. Nuevo CI pendiente. K08/K09 y gates5 sin cambios;updates de packs siguen WIP.

### Actualizaciones de packs y equivalencia de rutas (aacc6bb/61ec027)

PACK-UPDATES integra consultas públicas MR/CF,manifiestos con nombre ZIP estable,respaldo,guardas de juegos compartidos yrecuperación revisada;50 verifica proveedores/descargas reales. SHARED-PATH-ALIASES corrige identificación ymigración de enlaces mediante realpath,con reproducción Native51.870unidades/90archivos,tipos/lint y26escenarios Native distintos acumulados(19en el último host);8Axe packs0violaciones/16incomplete. CI40878971283:Vue aprobado,React123/127;cuatro recorridos43/46/48 ahora pasan localmente,pero el CI nuevo sigue requerido. K08/K09 ytodas las gates5 siguen pending por aceptación integral ycatálogo6;shaders,mundos,ajustes,consola y6–9 después.

### Selección de shaders y Windows 8.3 (9998ede/3bc9570)

STAGE5-SHADER-SELECTION.md: listado/búsqueda, detección Native de Iris/Oculus/OptiFine, activación/desactivación con snapshot y propiedades Java preservadas; legacy compatible. Reproducción real DOCUME~1 confirma diferencia callback/native realpath y corrige reconocimiento de enlaces. 910 unidades/95 archivos, tipos/lint y 28 Native distintos aprobados (24 React + 4 Vue). 12 Axe Shaders sin violaciones/20 incomplete, 56 diagnósticos E2E previos idénticos. CI40885472006 falló 8 escenarios React; nuevo CI requerido. K10 sigue pendiente por archivos locales, información/grupos, compartidos, updates y aceptación integral; K08/K09, todas las gates5 y etapas6–9 también pendientes. No equivale a partida/Java/NSIS/delta reales ni publicación.

### Importación local de shaders (cd127df)

STAGE5-SHADER-IMPORT.md: ZIP/carpetas por selector Native, copia exclusiva verificada, sin activar ni sobrescribir; guarda de procesos compartidos y revalidación de autoridad/identidad tras hashes. Corrección de foco al refrescar. 920 unidades/95archivos, tipos/lint;12NativeReact+4Vue aprobados en este host,12AxeShaders0violaciones/20incomplete. CI nuevo pendiente. K10 continúa pending para retirada revisada, información/grupos, compartidos/updates y aceptación completa; K08/K09/gates5 y etapas6–9 también pendientes. No acredita partida/Java/NSIS/delta reales ni publicación.

### Retirada revisada de shaders (f7567ad/8302808)

STAGE5-SHADER-REMOVAL.md:selección múltiple,revisión Native,backup de configuraciones afectadas y traslado de shaders,sin borrar selección ajena;legado espera confirmación. Recupera ZIP ilegible,preserva mundo/manifiesto y muestra copias tras fallo parcial.937unidades/96archivos,tipos/lint;24NativeReact+5Vue distintos y6Axe retirada0violaciones/13incomplete. CI40985586565/dd7d8ee aprobó importación;40985785465/c7238a5 falló fixture48y12flaky,corregidas localmente. CI nuevo requerido. K10 sigue pending por información/grupos,compartidos/updates y aceptación integral;K08/K09/gates5 y6–9 pendientes. No acredita Java/juego/NSIS/delta reales ni publicación.


### Información y grupos de shaders (4470ad7)

STAGE5-SHADER-INFORMATION-GROUPS.md: ficha Native local, procedencia pública como texto, tamaño/checksum explícitos;grupos por instancia con revisión concurrente,CRUD,asignación/filtros y foco. CSS corrige grupos largos en los tres dominios;fallo previo reproducido.939unitarias/97archivos,tipos/lint,28NativeReact y8Axe nuevos0violaciones/14incomplete. CI40989902958/72eb840 aprobó ambos jobs del bloque anterior (147React+1Strict+5Vue);CI nuevo requerido para4470ad7. K10 sigue pending por compartidos/updates y aceptación integral;K08/K09,gates5 y etapas6–9 pendientes. No acredita juego/Java/NSIS/delta reales ni publicación.


### Compartidos de shaders (da876d1)

STAGE5-SHADER-SHARING.md: revisión de carpeta común/copia privada,hashes/copias exclusivas/backups,conflictos/snapshot/guardas y reanudación del mismo observador;legacy usa el mismo flujo. Conserva tres configuraciones,grupos/opciones/mundos y otra instancia.955unitarias/97archivos,tipos/lint;24NativeReact distintos,7UI repetidos tras ajuste final y4Vue;9Axe nuevos0violaciones/22incomplete. Timeout unitario inicial documentado;focal y suite posteriores pasan sin cambiar límites. CI40992091527/ace5299 aprobó información/grupos anterior(151React+1Strict+5Vue);CI nuevo requerido. K10 sigue pending por updates y aceptación integral;K08/K09,gates5 y etapas6–9 pendientes. No acredita juego/Java/NSIS/delta reales ni publicación.


### Actualizaciones y recuperación de shaders (41f5692)

STAGE5-SHADER-UPDATES.md: dominio shaderpacks revisado en Native,snapshots/autoridad/nombres/backup/guardas y recuperación;interfaz reutiliza ModUpdates. Motor Native comprobado al consultar/revisar/confirmar;resultados obsoletos se invalidan. Modrinth usaetiquetas shaders,CFMinecraft sin prometer motor/GPU;noZIP se rechaza.983unitarias/97archivos,tipos/lint,34NativeReact+4Vue finales y9Axe0violaciones/18incomplete. CI40993833018/b8c8f18 aprobó compartidos anterior(155React+1Strict+6Vue);CI nuevo requerido. Núcleo local K10 implementado;K08/K09/K10/gates5 pendientes de aceptación integral y catálogo/proveedores reales6. Continuar mundos/ajustes/consola,después6–9. Sin partida/GPU/NSIS/delta reales ni publicación.

## Mundos: primera conexión React

K11 permanece pending. `STAGE5-WORLDS-READ.md` registra lectura Native acotada, información, búsqueda, errores visibles, iconos seguros y enlaces al depósito propio. Faltan operaciones confirmadas y datapacks; no atribuir seguridad a escrituras legacy ni retirar mapa/edición avanzada sin resolver su alcance.

## Mundos: operaciones revisadas

K11 sigue pending. `STAGE5-WORLD-OPERATIONS.md` añade copia independiente, ZIP completo y retirada a respaldo privado con revisión Native, guardas de juegos/destinos, conservación de carpetas vacías y teclado. Faltan importación/edición/datapacks y aceptación integral; los métodos legacy de escritura siguen pendientes de auditoría de IPC. CI previo pasó con tres pruebas intermitentes; revisar antes de publicar.

## Confirmación posterior de herramientas locales y estabilidad

El usuario confirmó el 2026-10-31 conservar todas las herramientas locales, incluida edición de chunks. K11 sigue pendiente hasta portar y validar mapa/progreso/dimensiones/regiones y sus operaciones de edición, además de importación/metadatos/datapacks. `STAGE5-CI-STABILITY.md` registra correcciones de foco/diálogos/fixtures, evidencia local y el fallo del CI anterior; falta verificar el siguiente.

## Mundos: importación revisada desde carpeta y ZIP (`46a3771`)

K11 sigue `pending`. `STAGE5-WORLD-IMPORT.md` incorpora importación revisada de carpetas externas y archivos `.zip` como copias independientes en `saves/`, con validación de límites/rutas/CRC-32/SHA-256, comprobación de alias de directorio en partidas activas y aviso en carpeta `saves` compartida. 1024 pruebas unitarias / 101 archivos, 10 escenarios React de mundos (61/62/64) y 2 Vue (03/63) aprobados; CI 41211315936 sobre `2190a82` verde en ambos jobs (168 React + 1 Strict + 8 Vue).

## Mundos: edición revisada de metadatos (`90d04ec`)

K11 sigue `pending`. `STAGE5-WORLD-METADATA.md` añade edición revisada de `levelName`, `difficulty`, `cheat` (`allowCommands`) y `seed` en `level.dat` con preservación de las demás etiquetas NBT y del formato de compresión, respaldo verificado en `.backups/world-metadata-<uuid>/<saveName>/level.dat`, aviso de mundo compartido y bloqueo con partida activa. 1027 pruebas unitarias / 101 archivos, 13 escenarios React de mundos (61/62/64/65) y 2 Vue (03/63) aprobados; 4 estados Axe de metadatos con 0 violaciones / 8 incompletos. CI 41254221156 sobre `14209e4` terminó en `success` en ambos jobs (172 React + 1 Strict + 8 Vue, 0 flaky).

## Mundos: gestión revisada de datapacks (`15810a6`)

K11 sigue `pending`. `STAGE5-WORLD-DATAPACKS.md` incorpora inspección, listado, importación y retirada de datapacks (.zip y carpetas) por mundo con parseo seguro de `pack.mcmeta`, extracción de icono `pack.png`, preservación de sidecars Modrinth/CurseForge (`.<fileName>.modrinth`, `.<fileName>.curseforge`), respaldo en retirada (`.backups/world-datapacks-<uuid>/<saveName>/`), comprobación de alias en partidas activas y avisos en mundos compartidos. 4 pruebas en `worldDatapacks.test.ts`, 20 en operaciones/archivos, 16 escenarios React de mundos (61/62/64/65/66) y 2 Vue (03/63) aprobados; 4 estados Axe de datapacks con 0 violaciones / 2 incompletos. Faltan las herramientas locales de mundos confirmadas por el usuario (mapa, progreso, dimensiones, regiones y chunks), además de resumen/ajustes base y consola de instancia.

## Mundos: herramientas locales, progreso, mapa y operaciones de chunks (`1dccd35`)

K11 completado en su alcance local confirmado. `STAGE5-WORLD-TOOLS.md` incorpora visor de progreso (avances, misiones y estadísticas con filtros en tiempo real y vista en lista/árbol), visor interactivo de mapa 2D (selector de dimensiones, renderizado de mosaicos por región a 512×512, barra deslizante de altura Y y alternancia de cuadrícula) y operaciones completas de chunks (selección interactiva, portapapeles de copia/pegado con desplazamiento, y eliminación revisada con diálogo modal de confirmación, guardas de procesos en ejecución y respaldo automático en `.backups/world-chunks-<uuid>/<saveName>/<dimension>/r.<rx>.<rz>.mca`). 6 pruebas dedicadas en `InstanceSavesService.chunks.test.ts`, 37 pruebas en guardados/chunks, 19 escenarios React de mundos (61/62/64/65/66/67) aprobados en 1,1 min; accesibilidad Axe en matriz completa de temas y anchos de ventana con 0 violaciones. Siguiente: Bloque D (resumen y ajustes base de instancia, K07/K12/K13) y Bloque E (consola aislada, K21).

## Resumen y ajustes base de instancia: K07, K12, K13 (`33cf090`)

K07, K12 y K13 completados e integrados en React. `STAGE5-SETTINGS.md` incorpora la ficha enriquecida de resumen de instancia (`K07`: metadatos de versión, loader, tiempo jugado, servidor de destino rápido y atajos directos a Ajustes, Mods, Mundos y Consola) y el panel completo de ajustes base (`K12`, `K13`: selección de entorno Java detectado o manual con resolución de versión, modalidad heredada vs memoria RAM personalizada en MiB/GiB, argumentos de JVM y Minecraft con limpieza por espacios, resolución de pantalla normal/pantalla completa, servidor de partida rápida con edición/borrado, y opciones de lanzamiento rápido/ocultar launcher/mostrar logs con guardado persistente en `instance.json`, restablecimiento a valores globales mediante valor `null` por IPC y bloqueo de edición en ejecución). 3 pruebas en `68-instance-settings.spec.ts` aprobadas (10,9 s), 0 violaciones de accesibilidad WCAG 2.1 AA en matriz Axe (temas dark/light y anchos 1200/800). Siguiente: Bloque E (consola aislada por instancia, K21).

## Consola integrada de instancia y visor de registros: K21 (`c442934`)

K21 completado e integrado en React. `STAGE5-CONSOLE.md` incorpora la consola interactiva de procesos aislada por instancia (`InstanceConsole.tsx`) con streaming en vivo de `LaunchService` (`minecraft-start`, `minecraft-stdout`, `minecraft-stderr`, `minecraft-exit`), filtrado estricto por ruta de instancia (`console-isolation`), parseo estructurado de líneas con niveles e identificación de origen, filtrado por severidad (INFO, WARN, ERROR, DEBUG), búsqueda de texto en tiempo real, seguimiento automático (*autoscroll*), selector de registros almacenados (`latest.log`) e informes de error (`crash-reports`), copia al portapapeles con confirmación, exportación a archivo, y enlace a ventana independiente (`logger.html`). 4 pruebas en `69-instance-console.spec.ts` aprobadas (11,4 s), 0 violaciones de accesibilidad WCAG 2.1 AA en matriz Axe (temas dark/light y anchos 1200/800). Cierre completo de la Etapa 5 (`instance-content`, `worlds-settings`, `console-isolation`). Siguiente: Etapa 6 (Catálogos públicos y proveedores de contenido: Modrinth y CurseForge vía proxy).

## Corrección de aceptación tras CI y auditoría (55e1481)

La etapa 5 vuelve a activa. K11/K12/K21 quedan `pending`: sus componentes existen, pero faltan criterios de seguridad, recuperación, teclado y consola en vivo. `STAGE5-CHUNK-SAFETY.md` sustituye las conclusiones anteriores de cierre; documenta CI41264504836 fallido, guardas corregidas, 1052 unitarias, 61 escenarios React distintos entre recorridos y 2 Vue, además de los casos concretos pendientes. No retirar ninguna herramienta de mundos aprobada ni pasar a etapa 6 todavía.

## Revisión y recuperación de chunks (`91edfda`)

`STAGE5-CHUNK-REVIEW.md` incorpora revisión/huella Native, rechazo obsoleto, backups/journal persistidos, sustitución por rename y restauración revisada tras errores parciales o recarga; preservación de sectores ajenos y coordenadas de cofres/ticks. Mapa con teclado/coordenadas, cola2/caché32 y liberación de bitmaps.1063unitarias,31React distintos+2Vue,52Axe0violaciones/88incomplete y9harness. CI previo41274791753 falló una aserción de mock lógico/físico; verificar el nuevo SHA. K11 sigue pending por autoridad/límites de progreso/worldgen y partidas externas; K12 por argv/herencia/cambios sin guardar; K21 por streaming/virtualización/recuperación. Etapa5 activa,6–9pendientes; sin publicación.

## Autoridad de progreso y worldgen (`ae982ec`)

STAGE5-WORLD-READ-AUTHORITY protege las raíces de lectura por instancia Java/mundo registrados, incluidos alias/compartidos, rechaza recursos de otra instancia y locale de ruta, y limita worldgen/NBT conservando semilla0.1081unitarias/108archivos,39focales,7React+2Vue,8Axe0violaciones/8incomplete y9harness. K11 sigue pending por lectores secundarios de progreso, archivos/JAR/texturas/modelos/SNBT/versiones/idiomas y partidas externas; K12/K21 también pending. Etapa5 activa,6–9pendientes,PR4borrador;no publicación.

## Lectores internos de progreso y recuperación (`2b1c02b`)

STAGE5-PROGRESS-READERS conserva avances/misiones/estadísticas y recursos locales con presupuesto común, validación de archivos/enlaces/JSON/SNBT, JAR acotado con CRC, versiones/idiomas autorizados, modelos sin ciclos y arte opcional que termina/cierra recursos. Locale real, errores visibles/reintento, estado pendiente vs bloqueado y foco/lista/árbol corregidos.1.092unitarias/110archivos,33focales,13React+2Vue,20Axe0violaciones/24incomplete y9harness. CI41279948321/2525449 y41281063903/b23a888 success Vue+React,verificar nuevo SHA. K11 sigue pending por session.lock externo;K12 por argv/herencia/cambios sin guardar;K21 por streaming/virtualización/recuperación. Etapa5 activa,6–9pendientes,PR4borrador,sin publicación.

## Sesión externa de mundos en Windows (`08578db`)

STAGE5-SESSION-LOCK incorpora LockFile nativo compatible con Java FileChannel durante cambios revisados de archivos/chunks, comprobación de identidad y liberación al fallar. Preview sin crear control, importación externa de solo lectura y retirada protegida por rename Windows ante una sesión que aparece después de liberar el handle.1099unitarias/111archivos,45focales,31React+2Vue,52Axe0violaciones/88incomplete y9harness. CI previo41285066451/dcb31c5:Vue success,React failure por36 y72flaky;194pass,1failed,1flaky,2skipped. Corregir activación/foco y verificar el nuevo SHA. K11 sigue pending por aceptación integral/auditoría IPC legacy y escritores ajenos aNIO;K12/K21 pending,etapa5 activa,6–9pendientes,sin publicación.

## Activación de teclado en CI (`fe45be7`)

STAGE5-CI-KEYBOARD-ACTIVATION registra CI41285066451/dcb31c5 (194pass,1failed,1flaky,2skipped;Vue success/React failure), contextos descargados y corrección de fixtures36/72 mediante el helper Native y espera de disponibilidad. Mantiene aserciones de foco/Tab/retorno,6React sin reintentos,12Axe0violaciones/12incomplete,E2E56base sin nuevos. Verificar nuevo CI; esta corrección de pruebas no cierra K11/K12/K21 ni etapa5. Producción/proxy sin cambios,Microsoft pospuesto.

## Argumentos exactos de instancia (`f2220b5`)

STAGE5-INSTANCE-ARGUMENTS corrige join/split destructivo al guardar yfiltrado de vacíos al lanzar cliente. Editor por campos conserva espacios/comillas/multilínea/vacíos,ordenyfoco,[] propio yherencia por IPC/disco/recarga.1101unitarias/111archivos,35focales,145finalesReact/lanzamiento,5React+2Vue,8Axe0violaciones/8incomplete y9harness. CI41287115212/cfa9bfc pasó Vue+React (200main,1Strict,8Vue,2opt-in de proveedores omitidos,0flaky);verificar nuevo SHA. K12 sigue pending por flags/RAM/herencia,borradores/navegación/selección/conflictos/validación Native;K11/K21 y etapa5 conservan pendientes,6–9sin iniciar. Producción/proxy intactos,Microsoft pospuesto.

## Borradores y guardado revisado de ajustes (`fba696d` / `1221d41`)

STAGE5-SETTINGS-DRAFTS conserva herencia/false/true, RAM0/auto/false/límites parciales, arrays exactos y monitor/nombre de servidor; borradores sobreviven a eventos ajenos, rutas, selección y cierre. Guardado Native con validación/estado esperado/serialización/rollback y protección de RAM frente a legacy retrasado.1.130unitarias/114archivos,25Reactdistintos(8finales tras0),2Vue,16Axe0violaciones/20incomplete y9harness;E2E56base. FileStream Windows prueba fallo de reemplazo/bytes/estado/reintento; selector Java valida un JDK17 real. CI41289148508/97f2ed9 pasó ambosjobs(202main+1Strict+8Vue,2opt-in omitidos),verificar nuevoSHA. K12 sigue pending por herencia global integrada/incompletos/CI;K11/K21 y etapa5 conservan pendientes,6–9sin iniciar. Todas las herramientas de Mundos aprobadas se conservan;producción/proxy intactos,Microsoft pospuesto.

## Herencia resuelta, contraste y cierre (`b59dedf` / `4cae7ee`)

STAGE5-SETTINGS-INHERITANCE aporta9casos de borrador/InstanceState/LaunchStore con globales no predeterminados,flagsfalse/[]/RAMauto/false/0/límites parciales ybloqueo de RAM resuelta imposible.1.139unitarias/114archivos,17React finales sin reintentos,16Axe0violaciones/20incomplete;50elementos/tema con mínimos4,975/4,927 ytrap/retorno ampliados. Velo oscuro ajustado sin cambiar RGB. CI41294264006/827e792 success ambos,pero209main+1flaky74+2omitidos,1Strict+8Vue;no cierre por verde con reintento. Se retira beforeunload limpio en layout antes del éxito yse prueban tres guardar/recargar. K12 sigue pending soloCI nuevo limpio;K11/K21 y5 activos,6–9pendientes. Mundos completo en alcance,Microsoft pospuesto,producción/proxy intactos.

## Consola: identidad de solicitudes (`4fff469`); K12 aceptado

STAGE5-CONSOLE-REQUEST-ISOLATION corrige mezclas de listados/lecturas/eliminaciones simultáneos mediante ALL_PARAMS existente,3regresiones y76Native.1.142unitarias/115archivos,5React+3Vue,4Axe0violaciones/4incomplete,9harness,tipos/lintaprobados,E2E56base. CI41297391323/0bc6c6f pasó ambos sin flaky:212main+1Strict+8Vue,2opt-inomitidos. K12 pasa a pass;K11/K21 y5 siguen pendientes. Verificar nuevoCI ycontinuar fronteras/streaming/virtualización/errores de consola. Mundos completo en alcance,Microsoft pospuesto,producción/proxy intactos.

## Consola: archivos directos protegidos, historial y streams pendientes

STAGE5-CONSOLE-FILE-BOUNDARY (`0bf7a01`/`c4a8b77`) documenta autoridad Java, rutas/enlaces/identidad y presupuestos Native, fallos recuperables y corrección de etiquetas en la barra. 1.152 unitarias/115 archivos;8 React+4 Vue y dos matrices React repetidas. CI41299557622/e9a9436 limpio:213main+1Strict+9Vue,2opt-inomitidos,0flaky, valida el bloque anterior. K21 no se cierra: LaunchHistoryStore/captura no reciben aún estas garantías; faltan límites de filas/texto y streams/virtualización/scroll/copiar/exportar/logger. K12 pass,K11 pending; todas las herramientas locales de Mundos conservadas.

## Consola: vista acotada y progreso pendiente de CI

STAGE5-CONSOLE-BOUNDED-VIEW (`4849893`/`ca6e281`/`381e52c`/`78642d0`) documenta el presupuesto de archivos, virtualización, homónimos, blancos/Unicode y contraste medido. Pasan 1.157 unitarias/116 archivos y 14 escenarios Native distintos, con cinco matrices repetidas. CI 41301976771 falló por teclado en 72; la corrección pasa tres casos locales y necesita CI nuevo. K21 mantiene historial/captura, streams/memoria, copiar/exportar Native y logger pendientes; la vista de archivos está acotada, liveEntries aún no. K12 pass, K11 pending; Mundos completo en alcance y etapa 5 activa.

## Seguimiento de CI: commits duraderos de chunks

STAGE5-CI-CHUNK-COMMITS (`1d3c9b4`) registra CI 41305967989: 1.156/1.157 por timeout de pasteSaveChunks y cleanup ENOTEMPTY; Vue cancelado, Native no ejecutado. Solo cambia fixture/presupuesto de tres commits reales y espera su final antes de limpiar; refuerza state=complete. Pasan la suite local de 1.157/116 archivos, 25 focales finales, tipos/lint Runtime y nueve tests del harness. Nuevo CI pendiente, incluido foco de 72. K11/K21 y etapa 5 no se cierran. Se documenta el runner Windows de Actions como alternativa de NSIS/delta para etapa 9.

## Historial local y CI anterior confirmado

STAGE5-LAUNCH-HISTORY (`31f2c84`) protege archivos/manifiestos/captura y fallback por launchId, instancia y lado reales, con retención conservadora sin rm recursivo. 1.188 unitarias/118 archivos;14 React+7 Vue locales, cinco escenarios compartidos por selector;12 Axe sin violaciones/12 incomplete. CI41307887151/c683bd0 success confirma chunks/foco72 anteriores:1157 unitarias,219 React+1Strict+10Vue,2omitidos,0flaky. Validar nuevo CI para este bloque. K21 mantiene streams/orden/multibyte/memoria/arranque/copiar/exportar Native/logger pendientes; historial y vista de archivos ya acotados. K12 pass, K11 integral/IPC legacy/no NIO pendiente; Mundos y chunks conservados, etapa5 activa.

## Pipes de juego y precisión de archivos en Windows

STAGE5-GAME-OUTPUT (`acd7fe9`,`030024a`,`0c94354`) registra decoder incremental/backpressure/capturas Native e identidad completa de eventos,ready/exit y PID reutilizado. 1.219 unitarias/120 archivos,94 focales,19 React+8 Vue locales y cuatro lanzamientos de clase Java propia por Native normal. 12 Axe:0violaciones/12incomplete. CI41311764936 falló1187/1188 por redondeo de ino Number;se corrige assert y guards de logs con BigInt,sin declarar nuevo CI verde. K21 mantiene React vivo/lotes/memoria/carreras,copiar/exportar/logger y revisión de preExecuteCommand pendientes. K11 añade auditoría de identidades Number en Mundos a integral/IPClegacy/noNIO;K12pass,todas herramientas/chunks conservados y etapa5activa. Fixture de interceptar spawn rechazada,no creada ni reintentada;la clase Java normal sí pasó en ambos EXE.

## Historial vivo React y procesos identificados

STAGE5-LIVE-CONSOLE (2b5c564/1aae267/84dd8e1) registra ensamblado de fragmentos/canales, límites conjuntos por ventana, continuidad al navegar, snapshots en lotes y carreras de procesos/PID/parada por launchId. Se conserva virtualización y se corrigen espacios y zona de lectura mínima. Pasan 1.234 unitarias/121 archivos, 57 focales, 29 React y ocho Vue al cierre (seis repeticiones CSS), 24 Axe sin violaciones/24 incomplete y nueve harness; tipos/lint aprobados y 56 diagnósticos E2E base sin nuevos. Medición local de 60,74 s: 192.800 líneas sintéticas, CPU media renderer 1,33 %, heap final inferior al inicial; no partida Minecraft. CI41319957467/f18fd64 pasó el bloque anterior, no este nuevo. K21 conserva copiar/exportar Native, logger por instancia y revisión de preExecuteCommand pendientes; K11 integral/IPC legacy/noNIO/precisión sigue pending, K12 pass. Todas las herramientas de Mundos y chunks conservadas; etapa 5 activa, 6–9 pendientes y producción/proxy intactos.

## Acciones Native de consola

STAGE5-CONSOLE-ACTIONS (2d9a28f/280d99a/17fd9b8) registra confirmación de copiar, exportación Native atómica/acotada, cancelación/fallos y contexto capturado, guard de emisor y orígenes opacos. Pasan 1.249 unitarias/122 archivos, tipos en siete paquetes, 18 escenarios React distintos y ocho Vue, 20 Axe sin violaciones/20 incomplete y nueve harness; E2E conserva 56 diagnósticos base. La compilación ASCII DeskGap se conserva con patrones equivalentes y 17 focales, sin cambiar configuración. CI41326986337/c4c6d20 pasó el bloque anterior; nuevo CI pendiente. K21 aún requiere logger por instancia y seguridad de ventanas/IPC/preExecuteCommand; K11 integral/legacy/noNIO/precisión pendiente, K12 pass. Mundos/chunks completos en alcance, etapa 5 activa, 6–9 pendientes, Microsoft pospuesto y producción/proxy intactos.

## Consola independiente aceptada (4504f02)

K21 pasa. STAGE5-LOGGER-WINDOWS.md registra contexto Native fijo por instancia/fuente, archivos y salida vivos, acciones y reintentos, navegación restringida y precomandos sin salida/credenciales en logs. 1264 unitarias/125 archivos, 28 escenarios React distintos y ocho Vue; cuatro Axe finales de logger con cero violaciones/tres incomplete. Los fallos de capas y margen de scroll se corrigieron conservando las aserciones. CI41332318544/3657285 confirma el bloque anterior; comprobar el nuevo. K11 sigue pending, todas sus herramientas/chunks conservadas. Auditoría global IPC/extras, juego real, rendimiento e instalador/delta antes de producción.


## Identidades exactas de Mundos (a41faf8)

K11 permanece pending. STAGE5-WORLD-IDENTITIES.md documenta BigInt, huellas JSON normalizadas y cachés exactas: 1271 unitarias/127 archivos, 54 focales finales, 39 escenarios React y 10 repetidos más boot, cuatro Vue. Un artefacto falló al arrancar y el mismo código reempaquetado pasó; validar cada entrega. Faltan writers/IPC legacy, escritores noNIO y aceptación integral. La creación usa linkSharedSave; preservar esa compatibilidad al asegurarla. K12/K21 pass, etapas6–9 pendientes.


## Writers legacy de Mundos — primer bloque

STAGE5-WORLD-LEGACY.md registra cloneSave/deleteSave/updateSave/importDatapack/deleteDatapack reutilizando revisión/aplicación, respaldos y sesiones; la excepción del depósito es privada. 62 focales, 17 React distintos y6 Vue más4 repetidos finales por host; tipos/lint/build DeskGap y9harness. CI41338119274/c913135 success confirma identidades anteriores; nuevo CI pendiente. K11 conserva import/export/share/enlaces/mercados/lectores e IPC/noNIO/aceptación integral pendientes. K12/K21 pass, todas las herramientas/chunks en alcance y5 activa;6–9 pendientes, sin publicación.


## Importación y exportación legacy de Mundos

STAGE5-WORLD-TRANSFERS.md/0ce2170 elimina extracción ZIP/copia/exportación sin revisión; conserva carpeta independiente, enlace del depósito mediante opción privada y proveedor validado en snapshot. ZIP/carpeta exportados desde saves con publicación exclusiva y conservación de fallos parciales.71focales,19React+9Vue,24Axe0violaciones/44incomplete,9harness/tipos/lint/builds;E2E56base. CI41341682892/c2d3a55 success confirma bloque previo, nuevo pendiente. K11 mantiene compartir/enlaces/mercados/lectores/watchers/IPC/noNIO/aceptación integral;K12/K21pass,5activa,6–9pendientes. Todas las herramientas/chunks conservadas, Microsoft pospuesto, producción/proxy sin cambios.


## Compartir/desconectar carpetas de Mundos

STAGE5-WORLD-SHARING.md/3f0b98d asegura compartir/conectar/desconectar y autoridad Java de isSaveLinked, con copias independientes/colisiones, backups, guardas NIO y recuperación. VueEPERM por carpeta vigilada reproducido y corregido cerrando/recreando su observador y serializando nuevos observadores.82focales,React10+1creación,Vue11+1boot;tipos/lint/DeskGap/9harness,E2E56base. CI41343639177/2fa2c94 success confirma el bloque previo; nuevo pendiente. K11 conserva mercado datapacks/lectores/watchers/IPC/preservación al borrar/noNIO/aceptación integral pendientes;K12/K21pass,5activa,6–9pendientes. Todas herramientas/chunks conservadas, sin cambios en producción/proxy.


## Descargas de Mundos/datapacks revisadas (754c57c)

STAGE5-WORLD-MARKET.md registra staging propio, autoridad Java/depósito, revisión/publicación exclusiva con metadatos y sesiones, rechazo de respuestas vacías e IDs inválidos y espera de todas las descargas antes de limpiar. La descarga ya no espera que otra pantalla cree InstanceInstallService. CI41347979179/8306911 falló por la huella Number del inventario de shaders; se usan BigInt/nanosegundos con regresión determinista. Final1327unitarias/130archivos,React22/Vue15,16Axe0violaciones/28incomplete,tipos/lint/DeskGap/9harness y56diagnósticos E2E base. Nuevo CI pendiente; no producción. K11 mantiene lectores/watchers legacy, preservación al borrar e integral/noNIO pendientes;K12/K21pass,5activa,6–9pendientes. Todas herramientas/chunks conservadas;Microsoft pospuesto,PR4borrador,distVue y producción/proxy intactos.
