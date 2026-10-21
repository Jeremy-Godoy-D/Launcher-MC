# SKlauncher Java clásico: análisis estático de instalaciones locales

Fecha de verificación: 20 de octubre de 2026. Este documento describe los JAR Java presentes en este equipo. **La evidencia aquí procede de ZIP, SHA-256 y `javap`; no es salida de REA.** La instalación Electron 4.0.39 debe analizarse por separado: no se debe atribuir a esa aplicación el funcionamiento interno de los JAR 3.2.18.

## Alcance y trazabilidad

Se leyeron los binarios y sus recursos públicos de programa. No se ejecutó SKlauncher, no se modificó su instalación, no se iniciaron descargas ni sesiones de Minecraft. No se abrieron los archivos de cuentas, tokens ni perfiles del usuario.

Se contrastó la auditoría existente en `C:\Users\jerez\Documents\Codex\2026-10-20\qui\work\java-audit` con los JAR actuales. Coinciden los tres SHA-256, tamaños y manifiestos. Además, se volvió a ejecutar `javap -p -c -constants` sobre 13 clases y se contrastó su salida, ignorando únicamente líneas vacías. **Advertencia de procedencia:** el `LauncherSettings.javap.txt` anterior corresponde al build 602 de `.minecraft`; no al build 601 de `.sklauncher`. Se comprobó contra el binario correcto.

Registro comprobable: [java-static-evidence.json](</C:/Users/jerez/Documents/ChatGPT/Launcher MC/analysis/java-static-evidence.json>). Herramientas: Python 3.12 estándar y `javap` del JDK Eclipse Adoptium 17.0.20.101 instalado. Se ejecutó el analizador `javap`, no las clases analizadas.

## Versiones exactas

| Binario | Versión declarada | Tamaño | Entradas `.class` |
|---|---|---:|---:|
| `C:\Users\jerez\AppData\Roaming\sklauncher\SKlauncher.jar` | 3.2.18; constante interna `3.2.18+build.0` | 1.401.788 bytes | 599 |
| `C:\Users\jerez\AppData\Roaming\.sklauncher\sklauncher-fx.jar` | 3.2.18, build 601, timestamp `2026-07-19T23:30:07+0000` | 17.223.929 bytes | 6.225 |
| `C:\Users\jerez\AppData\Roaming\.minecraft\sklauncher-fx.jar` | 3.2.18, build 602, timestamp `2026-08-04T15:52:35+0000` | 17.226.853 bytes | 6.226 |

SHA-256, en el mismo orden:

```text
25a73e3770a1d8d14bce53e8920e2e893aacc3c715d0fb22f878ef2090d03863
07d93bd540ccdc9ef1779a5362e04abb0c22cd3bc1f1ead5a1495b8cc922fda0
c6b0f9be0176c14bd224475c7c36903feda68e2cdedc9404a03181790caee404
```

La comparación SHA-256 individual de las clases de los builds 601 y 602 muestra una clase añadida, `net.minecraft.launcher.util.platform.MacOsUtils`, ninguna eliminada y tres modificadas: `JavaFXUserInterface`, `JavaFXUserInterface$1` y `LauncherSettings`. Esto delimita las diferencias de bytecode; no implica que todos los recursos no ejecutables sean idénticos.

## Dos etapas Java, con una JVM para el launcher

1. El manifiesto del JAR pequeño apunta a `pl.skmedix.bootstrap.Main`. El bootstrap prepara directorios, registros, interfaz Swing, configuración, comprobación de archivos y dependencias JavaFX.
2. El bootstrap carga el JAR grande mediante `URLClassLoader` e invoca por reflexión un constructor de `net.minecraft.launcher.Launcher`. Ese constructor recibe directorio de trabajo, proxy, parámetros y versión del bootstrap. Al terminar oculta la ventana del bootstrap.

La segunda etapa se carga **dentro de la JVM del bootstrap**; en el camino comprobado no se crea otro proceso para abrir la interfaz principal. El proceso separado es posteriormente el juego, mediante su fábrica de procesos.

Hallazgo relevante: los dos manifiestos `sklauncher-fx.jar` declaran `net.minecraft.launcher.MainFX` como `Main-Class`, pero **esa clase no existe en ninguno de ambos ZIP**. El arranque por constructor desde el bootstrap sí está presente. Por ello el manifiesto del JAR secundario no basta para reconstruir el arranque ni para afirmar que ejecutarlo directamente funcionaría.

Evidencia: [LauncherStartTask, línea 19](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/pl.skmedix.bootstrap.task.impl.LauncherStartTask.javap.txt:19>), especialmente preparación JavaFX, carga de clases e invocación del constructor. La presencia/ausencia de clases se registra en el JSON de evidencia.

## Bootstrap y actualización

`Bootstrap.initialize()` construye un `TaskContext` compartido y un `TaskExecutor`. Orden observado:

1. `CleanupTask`.
2. `MirrorDiscoveryTask`.
3. `ConfigurationTask`.
4. `VersionCheckTask`.
5. `FileValidationTask`.
6. Cuando `needsUpdate` está activo: `PatchTask`, `FileUpdateTask` y `DependencyTask`.

La inicialización es asíncrona mediante `CompletableFuture`; incluye cancelación y rutas de error. Los ejecutores de descarga y E/S se mantienen separados. El arranque de la segunda etapa se produce después de esa inicialización.

`BootstrapConstants` contiene cuatro orígenes de descubrimiento `servers.json`: `files.skmedix.pl` y `s1`, `s2`, `s3.skmedix.pl`. Son cadenas incrustadas; no se comprobó su disponibilidad actual. `ConfigurationTask` ofrece caché local de configuración. `VersionCheckTask` exige formato de manifiesto 2 y una versión, y puede mostrar la necesidad de actualizar el bootstrap.

`FileValidationTask` compara archivos locales con metadatos; `FileUpdateTask` descarga y comprueba hashes de archivos recibidos y descomprimidos. `PatchTask` añade una vía de parche diferencial. El helper `Checksum` utiliza SHA-1. Que exista comprobación de hash no demuestra por sí solo autenticidad criptográfica del manifiesto, actualización atómica o resistencia a una interrupción: esos atributos no se verificaron de extremo a extremo.

`DependencyTask` prepara JavaFX cuando Java es 9 o superior; para Java 8 omite esa descarga. El launcher principal contiene su propia validación de Java: en este binario de producción admite Java 8 con build al menos 200, y las versiones 21, 22 y 25. El bytecode de entrada y de `Launcher` tiene major 52, pero ello no sustituye la restricción adicional del programa ni los requisitos de cada versión del juego.

Evidencia: [Bootstrap, línea 517](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/pl.skmedix.bootstrap.Bootstrap.javap.txt:517>), [BootstrapConstants, línea 30](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/pl.skmedix.bootstrap.BootstrapConstants.javap.txt:30>), [VersionCheckTask, línea 14](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/pl.skmedix.bootstrap.task.impl.VersionCheckTask.javap.txt:14>), [Checksum, línea 99](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/pl.skmedix.bootstrap.utils.Checksum.javap.txt:99>) y [Launcher, línea 504](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/net.minecraft.launcher.Launcher.javap.txt:504>).

## Mapa de módulos del JAR principal

El build 601 incluye 309 clases bajo `net.minecraft.launcher`, 47 bajo `com.mojang.launcher` y 90 bajo `com.sklauncher.injector`. Es un artefacto que incorpora numerosas dependencias: sus 6.225 clases no son todas código de producto propio. Los nombres `com.mojang.launcher` describen compatibilidad/estructura presente; por sí solos no prueban autoría o licencia de esas clases.

| Responsabilidad | Clases o paquetes observados | Qué permite concluir |
|---|---|---|
| Coordinación | `Launcher` | Mantiene interfaz, configuración, perfiles, cuentas y `GameLaunchDispatcher`; construye el gestor de versiones. |
| Interfaz | `JavaFXUserInterface`, `ui.javafx.v1` | Interfaz principal JavaFX; ventana del bootstrap Swing. |
| Perfiles | `Profile`, `ProfileManager`, `LauncherVisibilityRule` | Configuración por perfil: juego, Java, memoria, argumentos, resolución, icono y visibilidad. |
| Cuentas | `AccountsManager`, `AuthenticationDatabase`, `LauncherAccount` | Selección, persistencia, cambio de usuario y estado de sesión. |
| Versiones | `LauncherVersionManager`, `LocalVersionList`, `RemoteVersionList`, `RemoteVersionSourceCache` | Catálogos locales/remotos, carga diferida, sincronización y caché. |
| Instalación | `VersionDownloadJobs`, `PreHashedDownloadable`, `RuntimeDownloadable`, `ChunkedAssetDownloadable` | Descarga de versión, bibliotecas, runtime y recursos. |
| Forge | `ForgeDownloadable`, `updater.forge.installer` | Detección y lectura de formatos de instalador, coordenadas Maven y ejecución de procesadores. |
| Modpacks | `modpack.v2.CurseManager`, `ModrinthManager` y modelos de manifiestos | Dos integraciones de búsqueda/instalación reconocibles en el binario. Su funcionamiento remoto no se probó. |
| Ejecución | `GameLaunchDispatcher`, `MinecraftGameRunner`, `GameProcessBuilder` | Preparación y lanzamiento de Minecraft, salida, fin de proceso y errores. |
| Transporte | `CentralizedHttpClient`, `PersistentCookieStore` | Cliente HTTP Apache central y persistencia de cookies; no se leyeron sus datos guardados. |
| Integración con juego | `com.sklauncher.injector` | Agente Java, transformación de clases, adaptación de conexiones, texturas y presencia Discord. |

Evidencia de composición: [listado de clases, línea 221](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/sklauncher-fx-classes.txt:221>), [Launcher, línea 3](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/net.minecraft.launcher.Launcher.javap.txt:3>) y [cliente HTTP, línea 2](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/net.minecraft.launcher.util.CentralizedHttpClient.javap.txt:2>). Se contrastaron también las firmas actuales de `AccountsManager`, `ProfileManager` y `LauncherVersionManager` con `javap -p`.

## Superficie funcional de la interfaz

Hay 113 clases en el paquete UI y recursos CSS para estilos claro, oscuro y temas adicionales. La interfaz se monta desde clases JavaFX; en el inventario del JAR no aparecen archivos FXML. Se observan:

- Acceso de usuario, lista de usuarios, progreso y errores de autenticación.
- Ventana principal con panel lateral, perfil seleccionado y botón de jugar.
- Editores de perfil para ruta del juego, Java, argumentos JVM, memoria, resolución, icono, versión, skin y regla de visibilidad.
- Gestor de perfiles y buscador de proyectos/modpacks con vista de detalles.
- Configuración, información, registro de cambios, consola, salida del juego y reportes de cierre inesperado.

La existencia de una pantalla o clase es evidencia de capacidad programada, no confirmación de que todos sus caminos estén habilitados actualmente. `LauncherUpdates.getUpdates()` lee `/launcher_updates.json` empacado: representa datos de novedades, por lo que no debe confundirse con el mecanismo que sustituye archivos del programa.

Evidencia: [clases UI, línea 20](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/sklauncher-fx-classes.txt:20>), [LauncherUpdates, línea 9](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/net.minecraft.launcher.LauncherUpdates.javap.txt:9>).

## Flujo de instalación y lanzamiento

El núcleo reúne perfil seleccionado, versión local/remota, runtime, bibliotecas, recursos y cuenta. `LauncherVersionManager` ofrece sincronización, descarga de runtime/recursos/versión, instalación y desinstalación. En `MinecraftGameRunner`, la preparación hereda de `AbstractGameRunner`; el lanzamiento desempaqueta bibliotecas nativas, reconstruye recursos cuando corresponde, prepara classpath, propiedades y argumentos de la versión y entrega el proceso a `GameProcessFactory` mediante `GameProcessBuilder`.

El runner también recoge la salida del juego, identifica errores y gestiona el fin del proceso. La visibilidad del launcher pertenece al perfil. Existen rutinas de compatibilidad para versiones antiguas, limpieza de recursos/bibliotecas/nativos/versiones y tratamiento de mods incompatibles. Estas rutinas pueden tocar instalaciones del juego cuando la aplicación se ejecuta; en este análisis solo se inspeccionaron sus nombres y bytecode.

Evidencia: [MinecraftGameRunner, línea 126](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/net.minecraft.launcher.game.MinecraftGameRunner.javap.txt:126>), [constructor del proceso, línea 419](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/net.minecraft.launcher.game.MinecraftGameRunner.javap.txt:419>), [classpath, línea 2243](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/net.minecraft.launcher.game.MinecraftGameRunner.javap.txt:2243>) y [fin de proceso, línea 2302](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/net.minecraft.launcher.game.MinecraftGameRunner.javap.txt:2302>).

## Autenticación, datos y agente Java

El flujo Microsoft observado es OAuth en navegador con retorno local, intercambio de autorización o renovación, Xbox Live, XSTS, autenticación de Minecraft Services y consulta del perfil. `MicrosoftLogin` incluye cancelación, estados de progreso, tiempo máximo y manejo de errores. La evidencia es la secuencia de métodos y dominios incrustados; no se inició sesión ni se comprobó la respuesta actual de servicios externos.

`AccountsManager` contiene rutas para `accounts.bin`, compatibilidad con `accounts.json` y migración de formato. Sus firmas incluyen compresión y ofuscación; no se debe interpretar esto automáticamente como almacenamiento seguro de secretos. No se extrajeron claves ni datos de cuentas. `ProfileManager` trabaja con `launcher_profiles.json`, temporales, copias de respaldo y recuperación. `LauncherSettings` utiliza `sklauncher.json`. Estos nombres del programa Java no deben confundirse con los JSON de la instalación Electron que comparte parte del árbol de datos.

El manifiesto declara `Premain-Class` y `Agent-Class` como `com.sklauncher.injector.javaagent.Premain`, además de permitir redefinición y retransformation de clases. El paquete contiene adaptación de conexiones, DNS, texturas y transformadores. Es un componente de integración durante la ejecución del juego; sus capacidades no equivalen a que todos los filtros se apliquen en todas las versiones. No se documentan recetas para alterar autenticación ni controles de acceso.

Evidencia: [MicrosoftLogin, línea 94](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/net.minecraft.launcher.auth.MicrosoftLogin.javap.txt:94>), [secuencia de servicios, línea 132](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/net.minecraft.launcher.auth.MicrosoftLogin.javap.txt:132>), [clases del agente, línea 1854](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/java-audit/sklauncher-fx-classes.txt:1854>) y manifiestos verificados en el JSON adjunto.

## Conclusiones y límites para la siguiente fase

La arquitectura Java consta de bootstrap con actualización y dependencias, coordinador del launcher, UI JavaFX, gestores separados de perfiles/cuentas/versiones, motor de descargas, integraciones de modpacks e instalación, y ejecución de Minecraft como proceso hijo. Su separación de responsabilidades es observable y sirve como inventario de capacidades; no se propone copiar su implementación propietaria.

Queda sin comprobar: qué acceso directo o wrapper eligió el usuario en su última sesión, qué build Java usa realmente ese arranque, funcionamiento real de la interfaz, vigencia de APIs, descargas, actualizaciones completas, credenciales y lanzamiento de una partida. No hay prueba de que los JAR sean la aplicación que se usa actualmente; la instalación Electron requiere su propia evidencia. Tampoco se verificaron exhaustivamente cada una de las miles de clases ni la seguridad completa del agente o persistencia. Las conclusiones de comportamiento se limitan al flujo estático descrito y deben mantenerse separadas de la evidencia de REA.
