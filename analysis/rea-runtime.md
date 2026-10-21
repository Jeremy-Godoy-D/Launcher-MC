# REA 6.7.0: viabilidad de observación Electron

Revisión estática: 20 de octubre de 2026. Objetivo local identificado por el investigador principal: SKlauncher 4.0.39, Electron. No se inició el launcher ni se modificó su configuración.

## Conclusión y evidencia

La vía activa **`capture-electron-scenario` es incompatible con este ejecutable**. REA verifica el fuse `EnableNodeCliInspectArguments` (índice 3); si está `disabled` o `removed`, devuelve `AnalysisUnsupportedTargetError` antes de lanzar un hijo. La evidencia de fuses comunicada por el investigador principal es `ev_6a0bc2888555c95426123908e8f993f1778e37bf16b3e19d43aa5d75b433351d`. Copiar el mismo ejecutable conserva este impedimento. [Preflight instalado, línea 70](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/rea-tool/node_modules/rea-agents/dist/browser/PlaywrightElectronActiveFuses.js:70>).

Esto no demuestra que toda observación dinámica sea imposible. **La observación pasiva del renderer mediante CDP es una posibilidad no verificada**: depende de que el objetivo exponga un endpoint utilizable. El investigador principal decidió no lanzar la aplicación real porque su actualizador podría descargar cambios y alterar la versión examinada.

La fuente consultada es el paquete instalado `rea-agents` **6.7.0**, no una promesa basada en documentación `main`. [Versión](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/rea-tool/node_modules/rea-agents/package.json:4>).

## Schema activo y entorno

El schema estricto admite únicamente `executable_path`, `application_path`, `application_root` opcional, `args` y `actions`; las rutas son absolutas. Las acciones son `click`, `wait`, `renderer-reload`, `renderer-crash` y `deep-link`. No acepta `env`, screenshot, accesibilidad ni timeout general. [Schema instalado](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/rea-tool/node_modules/rea-agents/dist/domain/javascript/electronActiveObservation.js:58>).

El proveedor usa Playwright `_electron.launch`, antepone `-r` con su hook y obtiene el entorno desde el proceso REA mediante una lista permitida. `HOME`, `APPDATA`, `LOCALAPPDATA`, `USERPROFILE`, `TEMP` y `TMP` están admitidas. Por tanto, redirigir esos valores requeriría un proceso REA separado con ese entorno ya establecido; no se configura en el JSON. No se hizo ese cambio. [Lanzamiento](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/rea-tool/node_modules/rea-agents/dist/browser/PlaywrightElectronActiveProvider.js:102>), [entorno](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/rea-tool/node_modules/rea-agents/dist/browser/PlaywrightElectronActiveProvider.js:252>).

El resultado activo contiene metadatos de ventanas y procesos, IPC, timeline, cobertura y límites. El “snapshot” interno es estado de instrumentación, **no una imagen ni un árbol de accesibilidad**. Una copia de instalación y carpetas desechables reducen cambios en datos habituales, pero no son un sandbox ni prueban que se supriman todas las descargas del actualizador.

## Vía pasiva potencial

Si una ejecución controlada futura expusiera renderer CDP, el request de `list_electron_targets` sería:

```json
{"cdp_endpoint":"http://127.0.0.1:9223"}
```

El puerto es un ejemplo, no un endpoint observado. Después se sustituiría `ID_DEVUELTO` por el identificador real para `inspect_electron_page`:

```json
{
  "cdp_endpoint":"http://127.0.0.1:9223",
  "target_id":"ID_DEVUELTO",
  "observation_ms":1000,
  "include_script_sources":false
}
```

Estos tools aceptan páginas locales `file://` y devuelven estructura DOM, frames, scripts, recursos y workers; no lanzan ni terminan el objetivo. El DOM no conserva valores de texto ni atributos. No ofrecen screenshot ni AX. [Schema pasivo](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/rea-tool/node_modules/rea-agents/dist/domain/javascript/electronObservation.js:11>).

Los tools genéricos `capture_web_screenshot` e `inspect_web_page` no sustituyen directamente esta vía: su autorizador requiere páginas HTTP(S) y rechaza `file://`. [Autorizador](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/rea-tool/node_modules/rea-agents/dist/browser/CdpAuthorizedTarget.js:12>).

## Lifecycle y Windows

- Arranque activo: límite de 60 segundos. Clicks, reload y espera de ventana no tienen deadline propio; dependen de cancelación. La lectura final admite una gracia de cancelación de 5 segundos. [Proveedor](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/rea-tool/node_modules/rea-agents/dist/browser/PlaywrightElectronActiveProvider.js:21>), [acciones](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/rea-tool/node_modules/rea-agents/dist/browser/PlaywrightElectronActiveActions.js:102>).
- El cierre intenta `application.close()` con espera de 5 segundos y luego verifica la liberación de procesos. Las fallas conservan evidencia parcial e incertidumbre de cleanup. [Cierre](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/rea-tool/node_modules/rea-agents/dist/browser/ElectronCaptureCleanup.js:19>).
- Hay ramas Windows, pero el lector de procesos usado por este proveedor devuelve `[]` para `win32`; sin lineage verificado, el cleanup evita señalizar el árbol Windows. No se acredita limpieza completa de helpers a partir de estas rutas ni se probó su funcionamiento extremo a extremo. [Lector Windows](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/rea-tool/node_modules/rea-agents/dist/process/ProcessOwnershipObservation.js:182>), [cleanup Windows](</C:/Users/jerez/Documents/Codex/2026-10-20/qui/work/rea-tool/node_modules/rea-agents/dist/browser/ElectronProcessCleanup.js:18>).

Límite final: se verificaron contratos y preflight por lectura del código instalado. No se verificaron renderer CDP, interfaz en ejecución, screenshots, comportamiento del actualizador ni limpieza real de procesos. No se creó un plan de proyecto.
