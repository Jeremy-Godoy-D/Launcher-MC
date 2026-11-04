# Instalación revisada de mods, packs y shaders

Etapa6 sigue activa; K15/K16/catalog-install permanecen pendientes. Este bloque integra contenido en una instancia capturada, reutilizando los servicios, el instalador, sus revisiones y la recuperación existentes. No cambia producción beta.2, el proxy ni Microsoft pospuesto.

## Cambio y límites

Aplicación final `e974e30`; flujos principales `5a91e41`, inicialmente `8fc355c`. La ficha resuelve dependencias requeridas, ofrece opcionales y presenta proyectos y cambios antes de confirmar. Abrir una versión o preparar su revisión no descarga archivos de contenido ni lanza el juego. Destino, runtime y versión quedan capturados; la operación no cambia silenciosamente a otra instancia.

El resolvedor MR/CF conserva una dependencia compatible instalada, detecta duplicados, ciclos, versiones contradictorias e incompatibilidades; reactiva dependencias requeridas deshabilitadas y no instala opcionales sin selección. Comprueba identidad, propietario, juego y compatibilidad; limita proyectos a128 y aristas por versión a256. Sustituye y retira el DFS MR preliminar que no tenía consumidor.

Mods pueden cambiar de nombre mediante el instalador existente. Packs/shaders mantienen su nombre al reemplazarse, y sus altas/dependencias ahora se admiten sin quitar snapshots, hashes, autoridad de directorio, bloqueos ni backups. Un archivo ajeno con el mismo nombre bloquea la preparación. Los shaders exigen un motor reconocido; se mantiene un observador de mods durante la operación y se vuelve a comprobar su configuración antes de instalar.

La revisión espera a que el parser publique los archivos correspondientes al inventario físico; no interpreta un estado batched todavía vacío como ausencia de instalaciones. Las referencias null de la base de datos se normalizan a opcionales antes de construir el manifiesto tipado. No se relaja su esquema nativo.

La preparación y la instalación tienen cancelación, progreso y errores. Las operaciones parciales conservan su plan nativo; se listan los operationId persistidos, distintos del ID de tarea solicitado por el renderer, y su recuperación exige otra revisión. No se declara éxito mientras exista un plan pendiente del dominio. Un rechazo anterior a publicar un plan permite reintentar sin inventar una recuperación.

La tarea nativa resolveMarketFiles cancela la resolución por lote y limita su duración a30s. El protocolo público añade cancelación para POST de lectura MR version_files/version_files/update y CF mods/files; no habilita endpoints mutantes, credenciales, otros puertos ni orígenes. La capacidad de cancelación sigue retirada antes del salto remoto. CurseForge conserva exclusivamente el cliente/proxy actual y ninguna key se añade al renderer.

Permanecen pendientes los mundos desde el catálogo, las actualizaciones de modpacks existentes y su acción de Biblioteca, y los estados por versión antes de abrir la revisión. Las dependencias de otra clase se rechazan de forma explícita; falta ofrecer una resolución o instalación previa guiada, especialmente para requisitos de motor de shaders. Archivos sin SHA-1 ofrecen la web/importación local: este flujo no rebaja la integridad exigida por las revisiones existentes.

## Evidencia ejecutada

| Comprobación | Resultado |
| --- | --- |
| Selección Vitest del workflow, independiente, cuatro workers | **1460 pruebas/143 archivos/28,62s** |
| pnpm check completo | runtime-api/runtime/Electron main+preload/Vue/renderer-client/React pasan |
| pnpm lint y check DeskGap | pasan; cero errores, advertencias anteriores conservadas |
| E2E tsc | exit2; exactamente56 diagnósticos preexistentes normalizados, ninguno añadido o retirado |
| React empaquetado | **26 escenarios distintos aceptados**,11 nuevos95 y15 de regresión93/94; worker1/retries0 |
| Candidata e974e30 | cuatro recorridos finales/18,0s de instalación+actualización MR/CF de mods/packs; mismo código de los demás flujos probados en5a91e41 |
| Vue empaquetado e974e30 | tres escenarios/10,1s:03 y ambos proveedores86 |
| Panel nuevo y Axe | cuatro informes,0 violaciones/8 incomplete, claro/oscuro y1200×720/800×400; capturas compactas revisadas |
| DeskGap producción | build0 con NODE_ENV=production y Vue; guard ASCII conservado, sin afirmar validación funcional |

Spec95 comprueba archivos descargados y sus bytes reales, destino correcto, ausencia de lanzamiento o descarga prematura, doble clic, opcionales y requeridas, estados instalados, cambio de versión, nombres y backups, options.txt conservado, Iris ausente/presente, cancelación nativa MR/CF y reintento, instalación parcial recuperada, colisiones y cambio de runtime. La red de main se dirige a HTTP propio; clientes/protocolo/proxy y servicios nativos siguen funcionando. Un observador registra únicamente resultados RPC de esas operaciones del perfil aislado. No se sustituyó fetch ni se usó DevTools/CDP.

Comandos desde launcher: selección Vitest de `.github/workflows/react-migration.yml` con --maxWorkers=4; pnpm check; pnpm lint; E2E tsc y comparación normalizada; check DeskGap; build:renderer seguido del build Electron con LAUNCHER_RENDERER=react|vue; Playwright sobre los EXE empaquetados, locales es-ES, workers1/retries0/max-failures1. DeskGap con NODE_ENV=production. El workflow ahora incluye95. No se repiten áreas0–5 ajenas al cambio.

Identidades EXE/ASAR/HTML: stage6-content-engine-react-identity.json, stage6-content-final-react-identity.json y stage6-content-vue-identity.json. Se restauró/verificó el host Vue; React sigue opt-in hasta8. Manifest ignorado stage6-content-manifest.json: **eb44ff7bedfed8b080276baaefed2001e3681f3d647cc69ce06b1c8b38b110e1**,30 fuentes/126 artefactos. Acredita además los cuatro módulos de flujo sin cambios entre5a91e41 y la candidata final. No incluye documentos/checks posteriores para evitar circularidad.

## Fallos resueltos y ejecuciones conservadas

Las primeras fixtures confundían directorio y ruta de archivo al crear ZIPs; se corrigió su uso. Un doble clic real reemplazaba Confirmar por Detener en la misma posición y cancelaba el primer clic: durante la instalación se conserva el botón Confirmar deshabilitado en su posición. Otro fallo real fue preparar actualizaciones antes de la publicación del inventario; se corrigió con suscripción cancelable, sin sleeps. La base de datos devolvía null para el proveedor ausente, rechazado correctamente por Zod; se normaliza en el consumidor común y hay una regresión con el esquema real.

Las fixtures también asumían el primer directorio de backup y un plan pendiente tras un rechazo previo a publicar. Ahora identifican el backup creado por la actualización y comprueban que no hay plan ni archivos tras cambiar el runtime. Se conserva la evidencia válida de los casos anteriores y solo se repiten los fallidos o afectados. No se ampliaron timeouts ni reintentos ni se relajaron las garantías de los datos.

CI41431957014 de0b8f2ce terminó success en React y Vue; el siguiente push deberá validar este bloque. PR4 sigue en borrador. No se han ejecutado partida real, presupuesto de GPU/CPU/arranque, NSIS/actualización aislada ni publicación. Axe incomplete requiere revisión humana; las fixtures no certifican cuota/secreto del Worker real. Siguen7–9 y la publicación completa0.3.0-beta.1.
