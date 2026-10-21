# SKlauncher 4.0.39: núcleo Electron, servicios y lanzamiento

Fecha: 20 de octubre de 2026. Alcance: análisis estático complementario realizado por shell, Node.js, `@electron/asar` y el AST de `@babel/parser`. **Este documento no presenta sus búsquedas como resultados de REA**; el informe principal puede vincularlas con la evidencia independiente de REA.

## Evidencia y límites

El objetivo es `C:\Users\jerez\AppData\Local\Programs\sklauncher\resources\app.asar`. Se reutilizó la extracción en `C:\Users\jerez\Documents\Codex\2026-10-20\qui\work\electron\extracted` después de comparar los bytes extraídos directamente del ASAR y su SHA-256. Coinciden `package.json`, los tres JS de `out/main`, `out/preload/index.js` y la dependencia de preload inspeccionada. Las comparaciones incluyen una aserción; la inspección del AST también comprueba que toda llamada IPC del puente tiene un receptor literal en main.

| Archivo del paquete | Bytes | SHA-256 |
|---|---:|---|
| `package.json` | 1.097 | `ff86073c9bf66017438954261977295639fef50c12eaad2038a5e7eca2c19de3` |
| `out/main/index.js` | 443.010 | `3a3603acfc591310232e7c6223f69539bfd3a15ca0d1d8b2e6ccb3a60bd55b38` |
| `out/main/LibraryPatchProvider-BIKzo3nB.js` | 7.529 | `dca1d045d95171cb4b3e9da1e4741c03db4e759402e393214dcec27fc4b1cc9c` |
| `out/main/patchesEnabled-Di6gFtiD.js` | 117 | `62bebf608d9f89f547295824c37b2dee70e534ad674e25312e50ea57577ed441` |
| `out/preload/index.js` | 18.086 | `f97a06fa0b4fe6f9c215d53da8e495e77002a67e4e9a976c2e0d0b714fcba5f7` |

La evidencia completa de hashes y canales está en [electron-core-evidence.json](</C:/Users/jerez/Documents/ChatGPT/Launcher MC/analysis/electron-core-evidence.json>). Los offsets de este informe son posiciones de caracteres, base cero, en el JS UTF-8 leído como texto. El bundle está minificado y varias secciones comparten una sola línea: se indican símbolo y offset para permitir su búsqueda sin inventar números de línea de un original inexistente.

**Observado** significa visible en los bytes del paquete; **inferencia** significa una consecuencia probable del código; **desconocido** significa que requiere observar ejecución o un servicio externo. No se ejecutó el launcher, ningún instalador, Java ni un JAR. No se leyeron cuentas, tokens, perfiles, mundos, logs ni configuración del usuario. Tampoco se llamaron los servicios enumerados.

## Estructura observada

El manifiesto declara `sklauncher`, autor `skmedix`, versión `4.0.39`, entrada `./out/main/index.js` y motor Node `>=24.18.0`. La versión real de Electron no queda establecida por el campo `engines`; se necesita inspeccionar el ejecutable o su metadato. Las dependencias declaradas incluyen `electron-updater`, `electron-log`, `yauzl`, `tar`, `chokidar`, `semver`, `prismarine-nbt`, Discord RPC y bibliotecas de presentación.

El proceso main contiene los gestores de cuentas, versiones, Java, instancias, contenido, instalaciones, ejecución, quickplay, actualizaciones, almacenamiento y presencia. Un registro de servicios perezosos permite obtener esos gestores por nombre. El renderer solicita trabajo mediante preload; main conserva el acceso a archivos, red, sistema operativo y subprocesos. Los nombres de clases del bundle están abreviados, pero métodos y mensajes permiten asignar responsabilidades con alta confianza.

Fuente: [package.json](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/package.json:1>), [main](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:1>), offsets 0–2.900.

## Arranque, ventanas e IPC

En `whenReady` se registran handlers, migraciones, servicios, updater, ventana, bandeja, Discord, cuentas y quickplay. Existe un bloqueo de instancia única. Los argumentos `--launch-instance` permiten arrancar una instancia al inicio o al recibir un segundo proceso. Al salir se detienen los juegos y los observadores. Main conserva el estado y posición de ventana; hay otra ventana de consola por instancia.

Las ventanas principal y de consola usan `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`, pero `sandbox: false`. Se deniega la apertura de nuevas ventanas y se restringe la navegación. La función de apertura externa admite HTTP/HTTPS. El protocolo `starship-screenshot` resuelve capturas dentro del directorio de una instancia, valida el nombre de imagen y comprueba contención de ruta.

El preload expone `window.api` por grupos y también `window.electron` de `@electron-toolkit/preload`. Esta segunda exposición incluye IPC genérico y una copia de variables de entorno; el conjunto de capacidades accesibles desde renderer es, por tanto, mayor que los métodos de `api`.

| Grupo | Canales `handle` en main | Funciones principales |
|---|---:|---|
| Cuentas, aspecto y amigos | 32 | Login, selección, refresh, skins/capas/biblioteca, presencia y relaciones |
| Versiones y Java | 17 | Catálogos, runtime, instalación y verificación |
| Instancias | 30 | Crear, duplicar, importar, archivos, mods y capturas |
| Contenido e instalaciones | 54 | Catálogos, dependencias, manifiestos, updates, modpacks y trabajos |
| Juego y quickplay | 22 | Instalar/reparar/lanzar/detener, estado, log y accesos recientes |
| Updater | 6 | Estado, comprobar, descargar, instalar y canal |
| Otros | 35 | Ajustes, sistema, almacenamiento, ventanas, diálogos, noticias y servidores |

Total: **196 handlers asíncronos**. El preload contiene 197 llamadas `invoke` a **196 canales distintos**, dos `sendSync` para estado inicial de updater/migración y 29 suscripciones a eventos. Hay una llamada duplicada al mismo canal de comprobación de modpack. Todos los canales solicitados tienen receptor literal observado. Esto comprueba correspondencia de nombres, no validez de todos los argumentos ni ausencia de fallos en ejecución.

El [inventario IPC completo](</C:/Users/jerez/Documents/ChatGPT/Launcher MC/analysis/electron-ipc-inventory.json>) contiene las **232 entradas declaradas en 29 grupos** de `api`, su ruta pública, cada receptor y las suscripciones/broadcasts. Se identificó un único envío `webContents.send` centralizado en el helper `L`: sus 38 usos producen 28 nombres de evento. `updater:error` está expuesto en preload, pero no se observó un broadcast correspondiente en main; los errores del updater sí se incluyen en `updater:status`.

Fuentes: [preload, línea 1](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/preload/index.js:1>), [API toolkit](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/node_modules/@electron-toolkit/preload/dist/index.cjs:5>), [main, línea 157](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:157>), offsets 427.034–443.004.

## Persistencia y separación de datos

En Windows la raíz se calcula desde `APPDATA/.sklauncher`. Se distinguen una raíz estable de configuración y una raíz de datos seleccionable por `location.json`. Se observan nombres para `settings.json`, `accounts.json`, `instances.json`, `window-state.json`, `updater-state.json`, `analytics.json`, manifiestos, biblioteca de skins, iconos y logs. En la raíz de datos se ubican instancias, bibliotecas, assets, versiones, runtime y caché. Electron usa `raíz/bin` como `userData`.

El helper `Xe` escribe JSON mediante archivo temporal, `fsync`, copia de seguridad del JSON previo válido y renombrado. El almacenamiento de cuentas recupera `.bak` cuando la copia principal no se puede leer. No todos los ficheros del programa utilizan este helper; por ejemplo el estado de updater tiene escritura directa.

**Aislamiento para una futura observación:** no se encontró una bandera de perfil propia. Sobrescribir solo `--user-data-dir` no basta porque main redefine `userData` y calcula sus JSON por separado. `APPDATA` de prueba redirige la raíz principal de Windows, pero todavía existen búsquedas por `os.homedir`, rutas del launcher oficial, `LOCALAPPDATA`, temporales, autoarranque y servicios externos. No se ha demostrado aislamiento total mediante una sola variable.

Fuente: [main, línea 1](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:1>), `Xe`, `ad`, `id`, offsets 2.900–5.900; [main, línea 157](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:157>), offsets 435.196–435.511.

## Cuentas y autenticación

La ruta Microsoft observada es: navegador externo y callback HTTP → código OAuth → token Microsoft → Xbox Live → XSTS → token Minecraft → comprobación de derechos Java → perfil. `checkGameOwnership` comprueba entitlements `game_minecraft` o `product_minecraft`. El callback intenta varios puertos y tiene cancelación y tiempo límite. El refresh renueva la cadena de tokens y perfil; el gestor evita duplicar refrescos concurrentes y guarda el refresh token rotado.

Las cuentas se cifran antes de persistir. En Windows se utiliza Electron `safeStorage`; si no está disponible, el código rechaza guardar/descifrar tokens. Hay fallback AES-256-GCM ligado a identidad de máquina y usuario para Linux sin keyring. Una cuenta ilegible o sin UUID se descarta al cargar. `toSafeAccount` devuelve al renderer ID, tipo, nombre, UUID y perfil, omitiendo access/refresh tokens. También existe un tipo de cuenta local/offline; su presencia no demuestra acceso a servidores o servicios que exijan una licencia.

Al lanzar, el gestor requiere cuenta activa y refresca una cuenta Microsoft expirada. Se observa refresco periódico; no se probó el comportamiento con revocación, MFA, menores, límites de API ni cortes de red.

Fuentes: [main, línea 1](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:1>), `Fd`, `xd`, `Jd`, `Lf`, offsets 17.296–21.677 y 33.205–42.911; [main, línea 122](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:122>), `eh`, offsets 48.525–54.186; [main, línea 140](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:140>), `prepareAccount`, offsets 345.231–345.833.

## Resolución de versiones y loaders

Se consulta el manifiesto vanilla de Mojang y se mantiene caché de manifiestos y JSON de versiones. Hay catálogo local. La resolución sigue `inheritsFrom`, detecta ciclos, combina argumentos antiguos y modernos, bibliotecas, assets, Java, logging y processors. Aplica reglas por sistema, arquitectura y features; transforma coordenadas Maven en rutas y separa bibliotecas del classpath de las usadas durante instalación.

Fabric, Legacy Fabric, Quilt y Babric consumen metadatos/perfiles de sus respectivos servicios. Forge y NeoForge usan catálogos/promociones o metadatos Maven e instaladores JAR. El parser reconoce formatos 1 y 2 de instalador, extrae bibliotecas incorporadas, resuelve datos y ejecuta processors Java del lado cliente. Existe importación/instalación de OptiFine y aplicación de jar mods.

Para macOS ARM64 se observa un proveedor de parches de bibliotecas con caché, catálogo remoto y fallback incorporado para LWJGL y puente Objective-C. Que exista una rama multiplataforma no prueba que funcione en todas las combinaciones.

Fuentes: [main, línea 122](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:122>), offsets 95.648–109.114 y `op` 115.857–120.368; [main, línea 145](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:145>), offsets 376.041–381.351; [processors, línea 146](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:146>), `Y0`, offsets 400.094–402.592; [proveedor de parches](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/LibraryPatchProvider-BIKzo3nB.js:1>).

## Descargas, instalación y reparación

La unidad de descarga registra URL, destino, tamaño, hash esperado, algoritmo, fallbacks e intentos. Comprueba lo ya descargado, escribe `.tmp`, puede reanudar con HTTP Range cuando hay hash y verifica antes de renombrar al destino. Hay timeout de inactividad, señal de cancelación, velocidad y progreso. Los trabajos reparten archivos entre workers y reencolan fallos hasta el máximo configurado.

La instalación recopila cliente, mappings, bibliotecas, nativos, índice de assets, assets, logging y Java. Luego descarga, extrae nativos y aplica jar mods si existen. El coordinador mantiene cola de instalaciones, trabajos activos y abort controllers, notifica etapas y registra `installComplete` para impedir lanzamientos incompletos. La reparación puede restaurar el estado previo de una instancia ya instalada si falla un intento forzado; esto es una marca lógica, no una transacción completa de todos los archivos.

**Límite observado:** un archivo existente sin checksum se considera presente; las descargas sin hash verifican tamaño/no vacío. Por tanto, no todos los recursos tienen garantía criptográfica solo por pasar por el descargador.

Fuentes: [main, línea 122](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:122>), `ut`, `Jt`, offsets 88.239–92.508 y 126.898–130.611; [main, línea 145](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:145>), `An`, offsets 371.136–376.040; [main, línea 157](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:157>), `nI`, offsets 405.980–421.629.

## Java

`JavaManager` identifica plataforma/componentes, localiza ejecutables, instala, elimina y verifica runtimes. Usa manifiestos Mojang y Foojay Disco, con candidatos Temurin/Zulu y JRE/JDK. Puede aprovechar archivos del launcher oficial solo después de contrastar tamaño/hash. Un proveedor de terceros descarga y extrae en staging, mueve la instalación anterior a `.old` y restaura si falla el cambio.

Antes del juego se instala Java faltante y se verifica/repara el runtime gestionado. Se permite Java personalizado por instancia; esa elección omite la gestión automática de instalación/verificación. Hay cachés y manifiestos de verificación. Si una actualización de runtime de terceros falla, puede mantenerse la versión ya instalada.

Fuentes: [main, líneas 124–132](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:124>), offsets 224.386–247.214; [main, línea 137](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:137>), `Qv`, `Zv`, offsets 328.506–329.906.

## Instancias y contenido

Las instancias guardan identidad, directorio, versión de juego/loader, runtime, memoria, resolución, argumentos y estadísticas. La inicialización reconcilia tipos/versiones, migra campos y garantiza instancias predeterminadas. Crear una instancia la registra y comienza instalación en segundo plano. Se pueden duplicar, borrar, cambiar versión y generar accesos directos. El borrado puede eliminar recursivamente el directorio de la instancia; las predeterminadas tienen restricciones adicionales.

Los proveedores Modrinth y CurseForge implementan búsqueda, metadatos, versiones, changelog, categorías y detección de actualizaciones. Hay búsquedas por hashes/fingerprints. El servicio de contenido resuelve dependencias requeridas de forma transitiva y registra incompatibles/no resolubles; modifica manifiestos bajo exclusión por instancia. Gestiona mods, resourcepacks, shaders, datapacks y mundos según el contexto. Verifica SHA-512 cuando está disponible, repara desde el proveedor, reconcilia archivos no gestionados y aplica updates.

Los instaladores admiten modpacks e importaciones, overrides y preservación de estado desactivado. Las restricciones de distribución producen errores o solicitudes de descarga manual: no se debe asumir que todo proyecto del catálogo puede descargarse automáticamente. Los formatos/importadores concretos son objeto del inventario de interfaz y de una revisión más detallada de importación.

Fuentes: [main, línea 132](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:132>), `Ew`, `Mw`, offsets 250.425–271.764; [main, línea 122](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:122>), `kp`, offsets 133.801–155.443; [main, línea 123](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:123>), `hg`, offsets 175.674–182.744; [main, línea 145](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:145>), offsets 381.898–399.792.

## Lanzamiento y ciclo de vida del juego

La secuencia observada es: validar instancia/cuenta → escanear mods → resolver y verificar versión → obtener mappings/agente si corresponde → instalar/verificar Java → preparar nativos y assets heredados → construir comando → ejecutar → observar salida y archivos → registrar salida y limpiar.

El constructor de comando combina límites de RAM, argumentos JVM, propiedades, classpath, logging, clase principal, credenciales y argumentos del juego. Puede añadir `sklauncher-fx.jar` como javaagent para funciones del launcher, salvo modo de compatibilidad; el análisis de ese JAR descargable no queda establecido por este bundle. Se observan opciones DNS/LAN, GPU dedicada, quickplay, comandos pre/post y wrapper de proceso. El entorno hereda variables del launcher y admite ajustes de instancia.

Se usa `spawn` con ejecutable y argumentos; algunas configuraciones explícitas de wrapper usan shell. El monitor normaliza salida de texto/XML, conserva una cola de log, publica estado y detecta indicios de crash. Existen observadores de crash reports y capturas. Al terminar se actualiza tiempo de juego, se procesan quickplay recientes, se restauran ventanas, se limpian nativos y se informa al updater cuando ya no quedan juegos.

Fuentes: [main, línea 132](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:132>), `Vl`, `av`, offsets 286.904–296.332; [main, líneas 137–140](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:137>), offsets 324.102–355.708.

## Servicios externos observados

Estas son referencias estáticas a proveedores, no conexiones verificadas en esta sesión.

| Familia | Destinos principales | Uso observado |
|---|---|---|
| Autenticación/juego | `login.live.com`, Xbox Live/XSTS, `api.minecraftservices.com` | OAuth, sesión, licencia, perfil, aspecto y relaciones |
| Mojang | `piston-meta.mojang.com`, `launchermeta.mojang.com`, `resources.download.minecraft.net`, `libraries.minecraft.net` | Versiones, runtimes, assets y bibliotecas |
| Mods/loaders | APIs Modrinth/CurseForge; Fabric, Legacy Fabric, Quilt, Babric; Maven Forge/NeoForge | Catálogos, versiones, dependencias e instalación |
| Java alternativo | `api.foojay.io/disco/v3.0` | Selección de paquetes, metadatos y checksum |
| SKmedix | `meta.skmedix.pl`, `sessionserver.skmedix.pl`, `updates.skmedix.pl`, `files.skmedix.pl`, `s2.skmedix.pl`, `beta.skmedix.pl` | Configuración, parches, aspecto/agente, noticias y actualizaciones |
| Servidores | `cdn.xyrios.com`, `xyrios.com` | Lista, detalle y registro de copia de IP |
| Soporte | `api.mclo.gs` | Compartir logs y crash reports por acción de interfaz |
| Analítica | `www.google-analytics.com/mp/collect` | Eventos con versión/plataforma/sesión; `track` exige consentimiento elegido y analítica habilitada |
| Presencia | Discord RPC y API de amigos | Actividad de juego, launcher y relaciones |

El cliente HTTP común clasifica errores, respeta Retry-After, combina timeout/cancelación y reintenta errores transitorios. El servicio de amigos mantiene caché y estados, y necesita sesión autorizada. La presencia no demuestra que el servidor remoto esté disponible actualmente.

Fuente: [main, línea 1](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:1>), constantes offsets 21.708–23.631, HTTP 6.832–10.514 y amigos 25.641–32.411; [main, línea 122](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:122>), analítica `Ah`, offsets 68.098–69.916.

## Actualización automática

Se observan canales stable/beta/nightly, manifiestos de política y `electron-updater`. Los binarios stable/beta se consultan en releases GitHub `sklauncher/binaries`; nightly tiene feed genérico. La configuración activa descarga automática. Los estados incluyen búsqueda, disponible, descarga, descargado, actualizado y error, con progreso por IPC.

La política puede bloquear la interfaz por versión inferior al mínimo soportado, falta de verificación inicial o verificación demasiado antigua. El código contiene periodo de gracia de siete días y umbral de veintiocho días desde verificación. La política efectiva depende de reloj, estado persistido y manifiesto remoto; no se comprobó en ejecución. No se documentan técnicas para eludirla.

Al terminar una descarga, puede instalar/reiniciar automáticamente según el flujo y estado. Si hay juego en curso, difiere el reinicio hasta quedar inactivo. Hay protección ante intentos previos fallidos y finalización de sesión del sistema operativo. Abrir una copia real para observarla puede activar descargas o instalador; una futura captura necesita un entorno desechable que controle esas escrituras.

Fuente: [main, línea 135](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:135>), `kv`, manifiestos y `Uv`, offsets 304.579–321.390.

## Riesgos concretos y desconocidos

1. **Posible token en log local.** Observado: `Vl.buildSubstitutionMap` incorpora el access token en argumentos; `m0.spawnGame` imprime el comando con todos sus argumentos. Inferencia: una versión que use esa sustitución puede dejar el token en el log local. No se inspeccionó ningún log ni se recuperó un token. El flujo de compartir logs sí aplica redacción de credenciales, usuario, home y UUID, lo cual reduce exposición en esa ruta, pero no demuestra que el archivo local se redacte al escribir.
2. **Escaneo que modifica mods antes de jugar.** Observado: `su`/`vv` eliminan archivos por nombres incompatibles, hashes maliciosos o firmas específicas; el lanzamiento llama al escaneo. Esto no es un escáner antivirus general y no se probó su tasa de falsos positivos. Una observación dinámica debe usar instancias desechables.
3. **Puente privilegiado amplio.** Observado: IPC genérico, variables de entorno y muchas operaciones de sistema están expuestos a renderer mediante toolkit/API. No se estableció una cadena de explotación ni se hizo auditoría completa de validación de cada handler. Para un proyecto nuevo conviene diseñar permisos y validación explícitos desde el inicio.
4. **Dependencia de recursos remotos.** Catálogos, política de updater, agente descargable y contenido externo pueden cambiar sin que cambie este ASAR. El análisis no reproduce el código de los servidores ni confirma su disponibilidad.
5. **Compatibilidad sin ejecutar.** Las ramas para Windows/macOS/Linux y distintas generaciones de Minecraft son observables. Éxito real, rendimiento, memoria, latencia, soporte GPU, actualizaciones, cancelación y recuperación tras corte de energía permanecen desconocidos.

Fuentes del punto 1: [main, línea 132](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:132>), offsets 287.088–288.285; [main, línea 140](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:140>), offsets 348.794–351.293; redacción `Xn` [línea 135](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/electron/extracted/out/main/index.js:135>), offsets 323.547–324.098. Punto 2: `su`, `vv`, offsets 302.559–304.313, línea 135.

No se modificó la instalación ni se ejecutó software del objetivo; este informe no valida comportamiento real ni constituye una reproducción del producto. El alcance estático permite preparar requisitos y delimitar módulos para un proyecto independiente, pero deja pendientes las pruebas de ejecución aisladas.
