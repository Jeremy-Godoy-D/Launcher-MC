# Fuentes oficiales y límites metodológicos

Consulta documental: 20 de octubre de 2026, zona America/Bogota.

Este registro complementa la inspección local. No es un plan de implementación ni una auditoría independiente de seguridad. En esta subinvestigación no se instalaron herramientas ni se ejecutó el launcher.

## Identidad del objetivo

El investigador principal confirmó localmente **SKlauncher 4.0.39 basado en Electron**. Esa es la versión objeto del análisis; esta afirmación procede de la inspección local del investigador principal, no de las páginas siguientes.

La web oficial de descargas anuncia actualmente **estable 3.2.18** y **beta 4.0.54**, mientras el changelog visible llega a 4.0.52. Las funciones actuales y sus correcciones no prueban qué existía o funcionaba en la instalación local 4.0.39. [Descargas](https://next.skmedix.pl/downloads), [changelog](https://next.skmedix.pl/changelog).

## SKlauncher: hechos documentados

| Tema | Evidencia y alcance |
|---|---|
| Dos generaciones | 4.0 es una reescritura centrada en instancias, mods y modpacks; sigue etiquetada como beta. 3.2 es la rama estable. [Introducción 4.0](https://docs.skmedix.pl/4.0/) |
| Runtime 3.x | Java/JavaFX. La documentación admite Java 8 con JavaFX o Java 17 y posteriores; descarta Java 9–16. El `.exe` portable usa Exe4j. Es contexto histórico, no la arquitectura del objetivo Electron. [Instalación 3.x](https://docs.skmedix.pl/getting-started/install), [formatos](https://docs.skmedix.pl/getting-started/downloads) |
| Runtime 4.0 | El launcher dejó de ejecutarse sobre Java; descarga el runtime del juego por instancia. La documentación revisada no identifica por sí sola el framework: Electron se confirma con evidencia local. [Instalación 4.0](https://docs.skmedix.pl/4.0/getting-started/install) |
| Almacenamiento 3.x | Setup guarda el JAR y Java en `%APPDATA%\sklauncher`; juego y perfiles usan normalmente `%APPDATA%\.minecraft`. Admite `--workDir`; Game Directory separa archivos por instalación. [FAQ](https://docs.skmedix.pl/faq/launcher-related) |
| Almacenamiento 4.0 | Instancias por defecto en `%APPDATA%\.sklauncher\instances`. Migrar desde 3.2 copia archivos, conserva originales y no transfiere cuentas. La ubicación puede cambiar en ajustes. [Migración](https://docs.skmedix.pl/4.0/getting-started/migrating) |
| Cuentas | Microsoft y modo offline; cuenta SKlauncher opcional para personalización propia. La existencia de estos modos no establece los contratos concretos de autenticación del cliente local. [Login](https://docs.skmedix.pl/getting-started/login), [registro](https://docs.skmedix.pl/getting-started/register) |
| Contenido 4.0 | La documentación actual anuncia instalación y actualización desde Modrinth y CurseForge de mods, modpacks, recursos, shaders, datapacks y mundos; integración de varios loaders; importación de otros launchers; Java automático; explorador, galería, servidores Xyrios y amigos. Cada capacidad requiere comprobación en 4.0.39. [Funciones](https://docs.skmedix.pl/4.0/) |
| Configuración y operación | El anuncio inicial 4.0 documenta rutas Java, RAM, argumentos JVM, variables de entorno, scripts antes/después del juego, Quick Play, múltiples cuentas y resolución de dependencias/conflictos. Son afirmaciones del fabricante. [Anuncio del 1 de junio de 2026](https://next.skmedix.pl/blog/update-4-0) |

El changelog contiene una entrada específica **4.0.39, del 20 de julio de 2026**, que anuncia correcciones de instalación de Forge y NeoForge. La versión exacta de sus paquetes, código y servicios debe deducirse de los artefactos locales. [Changelog oficial](https://next.skmedix.pl/changelog).

## Código y distribución pública

La FAQ de 3.x declara que el launcher no es de código abierto y que su código actual no está ofuscado y puede descompilarse e inspeccionarse. Esa declaración referida al cliente Java no demuestra la condición de todos los bundles de 4.0. El mismo apartado distingue inspección de simple clonación del producto. [FAQ sobre código fuente](https://docs.skmedix.pl/faq/launcher-related#is-sklauncher-open-source).

El instalador Windows 3.x sí tiene repositorio público y usa Inno Setup 6. `inno.iss` define 3.2.18, instalación por usuario, x64, JavaFX 22.0.2 y JRE 21 Azul/Temurin; Windows antiguos usan una variante Zulu 8 con JavaFX. Descarga módulos desde `maven.skmedix.pl/org/openjfx/`. Esto describe el instalador público 3.x, no el instalador local Electron. [Repositorio](https://github.com/sklauncher/installer), [script](https://github.com/sklauncher/installer/blob/master/inno.iss).

## Integraciones y privacidad

Las fuentes públicas identifican Microsoft/Mojang, Modrinth, CurseForge y Xyrios. No se encontró una especificación pública oficial completa de la API interna de SKlauncher; los endpoints recuperados del cliente son evidencia del artefacto, no contratos públicos estables. [Introducción 4.0](https://docs.skmedix.pl/4.0/).

La documentación 3.x advierte que logs de depuración pueden contener tokens, identificadores de sesión, IP y conexiones. Las evidencias compartidas deben excluir o censurar valores de sesión. Sus declaraciones sobre datos almacenados y seguridad son afirmaciones del fabricante y no se aceptan como prueba de ausencia de otros comportamientos. [Logs y debug](https://docs.skmedix.pl/faq/launcher-related#where-are-the-logs-located), [documentación sobre datos](https://docs.skmedix.pl/virus).

## REA: procedencia y flujo aplicable

El repositorio oficial consultado es [morluto/rea](https://github.com/morluto/rea); remite a `rea.tools` y al paquete npm `rea-agents`. Ofrece CLI y MCP. Exige Node.js 22.x ≥22.19, 24.x ≥24.11 o 26+, más npm. El análisis estático JavaScript/Electron no necesita Hopper, Ghidra ni IDA. No se instaló ni ejecutó REA durante esta investigación documental. [README oficial](https://github.com/morluto/rea).

La guía documenta este comando para una carpeta local o un ASAR; se reproduce únicamente como referencia:

```powershell
rea analyze-javascript-application "C:/ruta/al/objetivo/app.asar" --json
```

REA inventaría bytes y hashes, analiza JavaScript como texto inerte y recupera imports, entradas, preload, rutas, endpoints y relaciones IPC. Verifica integridad ASAR; compañeros `.asar.unpacked` ausentes quedan desconocidos. La política predeterminada rechaza contradicciones. `--source-path` permite selección exacta, pero la cobertura sigue siendo parcial si quedan fuentes sin analizar. El estado de cobertura y los límites de recursos forman parte de la evidencia; una ejecución exitosa no garantiza análisis completo. [Reconstrucción JavaScript](https://github.com/morluto/rea/blob/main/docs/javascript-artifact-reconstruction.md).

`trace-application-feature` y `trace-javascript-semantics` siguen relaciones de la evidencia ya obtenida; `inspect-analysis-view` permite consultar vistas. Las relaciones estáticas no demuestran que una ruta se ejecutó ni que dos programas sean equivalentes. Un proceso CLI posterior necesita el registro completo guardado; las referencias retenidas MCP pertenecen a una conexión. [Flujos JavaScript](https://github.com/morluto/rea/blob/main/docs/javascript-application-workflows.md).

## Límites REA en Windows

| Capacidad | Límite documentado |
|---|---|
| JavaScript/Electron estático | El README incluye rutas Windows y la guía documenta controles del proceso analizador en Windows. Esto no acredita una ejecución satisfactoria en esta máquina. [README](https://github.com/morluto/rea), [reconstrucción](https://github.com/morluto/rea/blob/main/docs/javascript-artifact-reconstruction.md) |
| Importar código histórico | `import-reference-source` devuelve `unsupported_host` en Windows nativo; la guía indica Linux dentro de WSL u otro host admitido. [CLI](https://github.com/morluto/rea/blob/main/docs/cli.md) |
| Captura genérica de procesos | `capture-process` requiere Linux/macOS con PTY; Windows nativo no está admitido. Capturar comandos Linux dentro de WSL no prueba el árbol de procesos de una aplicación Windows. Comparar capturas previas sí es posible sin lanzar el objetivo. [Captura de procesos](https://github.com/morluto/rea/blob/main/docs/process-capture.md) |
| Ghidra | Soporte Windows x64 experimental para un conjunto de operaciones de lectura, NTFS local y proveedores/JDK instalados por el operador. No implica paridad con otros hosts ni es necesario para analizar JavaScript; los límites de arquitectura dependen de la versión publicada. [Windows Ghidra P0](https://github.com/morluto/rea/blob/main/docs/windows-ghidra-p0.md) |
| Resultados CLI | Código de salida 0 puede acompañar evidencia parcial, avisos o preguntas sin resolver. Evaluar cobertura y diagnósticos, no solo el estado del proceso. La documentación `main` puede describir cambios posteriores al paquete instalado. [CLI](https://github.com/morluto/rea/blob/main/docs/cli.md), [guía Windows](https://github.com/morluto/rea/blob/main/docs/windows-ghidra-p0.md) |

## Regla de interpretación

Clasificar cada conclusión como hecho de artefacto local, comportamiento observado, declaración del fabricante o inferencia. Las fuentes actuales describen versiones diferentes; no sustituyen la evidencia del binario 4.0.39. Una búsqueda sin coincidencias, una página agotada o una salida parcial no prueban ausencia de función. El backend remoto y el comportamiento no ejercitado permanecen sin verificar.

No se creó un plan de proyecto. No se verificaron ejecución de REA, servidores internos ni equivalencia funcional completa; el principal riesgo documental es trasladar a 4.0.39 características de 3.x o de una beta posterior.
