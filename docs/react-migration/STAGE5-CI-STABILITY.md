# Etapa 5: foco, apertura de diálogos y sincronización de revisiones

Fuentes `a72caba` y `20a0944ab8ea331592ec7788960411865fbcf613`. Se corrigieron problemas detectados en CI y reproducidos en Electron local. La etapa 5 sigue activa; no se afirma estabilidad remota hasta verificar el siguiente CI.

## Cambios

- Shaders: la devolución de foco pendiente se consume en el siguiente commit de layout libre. Antes dependía solo de una transición de `busy`; cancelar rápido podía completar el ciclo en un lote y dejar el botón sin foco.
- El diálogo de actualizaciones puede abrirse mientras se lee la selección de fondo. Conserva el bloqueo durante operaciones/grupos; la búsqueda y confirmación siguen leyendo/verificando snapshots y metadatos Native. No se retiró ninguna guarda de escritura.
- Prueba nueva con lectura `getSelection` retenida: el ejecutable anterior falla porque deshabilita el acceso al diálogo; el actual lo abre y consulta al liberar la lectura. Se usa un gate explícito, sin esperas arbitrarias.
- Los casos de cambio posterior a la revisión de packs y mundos esperan ahora la revisión visible y habilitada antes de modificar el archivo de fixture. Antes podían editarlo durante el primer cálculo y comprobar una revisión fresca o interrumpirla.
- El recorrido de lanzamiento usa activación real de teclado donde el runner bloqueó la espera de estabilidad del puntero. `activateLauncherControl` conserva ventana Native visible/con foco, documento activo, control visible/habilitado/con foco y límites completos con clipping de ancestros; no usa `force` ni eventos DOM simulados. Los clics iniciales y la comprobación de doble lanzamiento permanecen.
- La prueba de selector de shaders incluye pérdida de foco Native controlada y verifica que el botón correcto recupere el foco; el helper no elige el destino DOM. La revisión visual de mundos espera un control realmente habilitado antes de activarlo.

## Evidencia

- CI **41179439218 / aa5cc27**: success con tres intermitencias (12/44/53). Se conservaron logs, contextos y trazas de esas tres.
- CI **41180899154 / 04e9ed0**, anterior a estas correcciones: Vue success, React failure (**3 failed / 2 flaky / 162 passed / 2 skipped**). Fallos persistentes en 59 y 62; trazas y contextos revisados. No atribuir verde a esa entrega.
- Línea base local: 3 escenarios ×3, **9/9**, no reprodujo inicialmente. La primera calibración sí reprodujo **2 fallos / 7 aprobados** (cancelar shaders y navegación). El primer ajuste dejó **1 fallo / 14 aprobados**, por otra petición de foco Native hecha una sola vez. Se consolidó la activación Native con comprobación en cada intento.
- Finalmente los 3 escenarios originales pasaron **5 veces cada uno: 15/15**, sin reintentos, 44,0 s. Regresión de shaders 52/53/54/56/57: **22/22**, 1,1 min, con el arreglo de foco.
- Tras el fallo remoto 41180899154 se añadió el caso de lectura retenida: **falló en el binario previo**, en la comprobación de botón habilitado; luego 59/62 pasó **10/10**, 41,6 s. Los cuatro casos críticos de esos archivos pasaron **3 veces cada uno: 12/12**, 39,8 s. No sumar repeticiones como escenarios nuevos.
- Suite del workflow: **999 unidades / 100 archivos**, 21,72 s, sin build/Electron simultáneos. `pnpm check` y `pnpm lint` completos aprobados; lint React repetido tras el último cambio. Conserva un aviso previo de regexp. E2E tsc: mismos **56 diagnósticos** previos, ninguno nuevo; se corrigió un error transitorio del helper `open`.
- Vue 03 pasó antes y después del último build (último 5,6 s). Host/dist Vue restaurados; paquetes React/Vue independientes. Las matrices existentes con Axe y capturas en claro/oscuro y 1200×720/800×400 pasaron; no constituye certificación AA manual.

Comandos desde `launcher`: suite `pnpm exec vitest run` del workflow, `pnpm check`, `pnpm lint`, check/lint React, `pnpm --dir e2e exec tsc --noEmit`; builds React `gen:testids`, `build:renderer`, `build` y Vue `build`. Playwright usa EXE propio y `--retries=0`; grep focal de 12/44/53 con repeticiones 3/5; regresión 52/53/54/56/57; 59/62 completos y repetición de cuatro casos; Vue03.

Manifiesto ignorado `launcher/e2e/artifacts/stage5-ci-intermittent-manifest.json`, SHA-256 `2835b70a3741b2af3668f1e6c09dff51ca8bb1e785b64948d46b0a2b6da64e90`: 8 blobs Git canónicos y 663 artefactos propios. Recorrido limitado a carpetas explícitas y contextos/trazas seleccionados de CI; no se siguieron rutas protegidas.

## Alcance confirmado y pendiente

El usuario confirmó el 2026-10-31: **«Todas las herramientas locales, incluido editar chunks»**. Se registra en SCOPE, decisión del harness y K11: conservar mapa, progreso, dimensiones, regiones y consultar/copiar/pegar/eliminar/editar chunks, con aislamiento, confirmación y respaldo. No volver a preguntar ni retirarlas como extras.

Verificar el nuevo CI; continuar importar/editar mundos, datapacks y todas esas herramientas locales; después ajustes/consola y etapas 6–9. K11/gates5 pendientes. No se probaron partida real, NSIS/actualización aislada, rendimiento final ni todos los recorridos de mapas/chunks. Producción/proxy intactos, Microsoft pospuesto y PR4 borrador.
