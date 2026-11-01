# Ajustes: herencia resuelta, contraste y ciclo de cierre

Fuentes `b59dedf79ff2ee28d0acf32d19ab2b69e72d40d2` y `4cae7eef4b29df95f3b76d2db0a0f4c7646a613d`. Continúa STAGE5-SETTINGS-DRAFTS. Etapa5 activa; K12 tiene sus criterios locales cubiertos y espera CI nuevo sin depender de reintentos. K11/K21 siguen pendientes; no habilita6–9 ni publicación.

## Integración y correcciones

Nueve pruebas conectan el borrador real, normalización null→undefined de InstanceState y LaunchStore hasta las opciones enviadas a LaunchService.launch. Cubren valores globales no predeterminados que cambian después de inspeccionar y antes de confirmar: heredar Java/flags/argumentos/resolución, false y listas vacías propios, RAM auto o sin asignación, 0 distinto de herencia y cada límite heredado por separado. Un mínimo propio superior al máximo global resuelto bloquea el lanzamiento, conservando ambos valores. Se reutilizan el coordinador y los modelos existentes; no se agrega un camino alternativo al producto.

La comprobación de contraste con luminancia ambiental extrema reprodujo **4,3178:1** en el estado secundario de ajustes sobre imagen blanca en modo oscuro. El velo oscuro pasa de#0e1117ba a#0e1117c4, conservando RGB, paisaje, cristal y distribución. En la fixture se compone el color del velo real sobre blanco/negro y se sustituye poster+velo por ese color opaco equivalente, para que readTextContrast pueda medir exactamente los ancestros. Cincuenta elementos de ajustes por tema, incluidos etiquetas, campos, textos y acciones, dan mínimos **4,9751:1 oscuro /4,9266:1 claro**. No se usa la aproximación de ancestros sobre una imagen sin contabilizarla ni se afirma AA de toda la aplicación.

Se amplió la comprobación de los4 incomplete aria-hidden-focus del diálogo: Tab y Shift+Tab cíclicos, intento programático de enfocar la navegación que vuelve al diálogo, Escape, retiro de aria-hidden del root y retorno al disparador. Axe mantiene su diagnóstico incomplete; las comprobaciones de comportamiento se registran sin ocultar esa salida.

[CI41294264006 /827e792](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/41294264006) terminó success en ambos jobs, pero **no fue una pasada limpia**:209 main aprobados,1 flaky en74 al recargar,2 omitidos de proveedores opt-in,1 Strict y8 Vue aprobados. El fallo fue Page.handleJavaScriptDialog/No dialog is showing seguido de recarga interrumpida. La regresión local confirmó que existía un listener beforeunload incluso con el formulario limpio. Se registra ahora solo durante edición u operación pendiente y se retira mediante useLayoutEffect en el mismo commit visual que muestra éxito. La nueva prueba confirma cero listeners limpios y tres ciclos guardar→recargar con persistencia; antes fallaba0esperado/1real. No se silencian diálogos globalmente ni se amplían tiempos/reintentos para aceptar74. El manejo específico de la notificación Electron al cancelar un cierre real permanece en su fixture.

## Validación

Manifiesto ignorado `launcher/e2e/artifacts/stage5-settings-inheritance-manifest.json`, SHA-256 `d27ada6e6d679d1655c3555283a41f2e87b8fb8989ff7adcd0255dac6b9d12aa`: **5 fuentes canónicas y54 artefactos**, con main/ASAR/EXE y capturas propios. Logs/medios/binarios permanecen ignorados.

- Focal del coordinador:23/23, nueve casos nuevos. Suite completa del workflow: **1.139 pruebas /114 archivos**,24,29s, independiente de builds/Electron. El último cambio de ciclo UI no modifica ese código puro y se valida con el paquete final abajo.
- Tipos y lint React aprobados; un aviso previo no-control-regex, sin nuevos. E2E mantiene exactamente56 diagnósticos base, normalizados por coordenadas y sin cambios. No se alteran compiladores/configuración/dependencias.
- Paquete React final, specs09/68/74/75, es-ES, `--retries=0 --reporter=line`: **17/17**,1,1min. Incluye recargas de74 sin handler que silencie su fallo, ausencia de listener limpio, guardado/reintento con bloqueo real de archivo Windows, Java real, herencia/persistencia, conflictos entre ventanas y salida protegida. El recorrido anterior de16 se solapa; no se suma como escenarios distintos.
- Matriz real de claro/oscuro y1200×720/800×400: **16 Axe sin violaciones /20 incomplete**(16contraste,4aria-hidden-focus). Contraste extremo50elementos/tema, trap/retorno y capturas aportan la revisión adicional descrita; no certifica manualmente todas las pantallas/idiomas. Se mantienen fondo/material aprobados.
- Detector sobre styles.css:40 avisos de radios/tamaños/colores en líneas no modificadas; ninguno sobre el token cambiado. No se reparó DESIGN/sidecar como efecto secundario. Registro de test IDs regenerado tras el cambio de línea del formulario.
- Vue renderer y main compartido restaurados. No se repite Native Vue: CSS React y el efecto de su componente no cambian el backend ni el VueEXE ya probado03/63 en el bloque anterior. Nueve tests del harness aprobados; check posterior al informe fuera del manifiesto para evitar circularidad.

Comandos: lista Vitest del workflow y focal store.test.ts; check/lint de xmcl-react-ui; E2E tsc y comparación base; builds React renderer/host; Playwright con EXE React y specs/opciones indicados; detector de fuente; gen:testids; build renderer Vue y compile de xmcl-electron-app para restaurar dist; tests/check del harness. Mantener las llamadas pnpm en launcher. Los procesos y respuestas de lanzamiento del unitario son controlados: comprueba opciones resueltas, no inicia Minecraft.

## Siguiente trabajo

K12 queda pending únicamente por verificar el CI del SHA nuevo sin aceptar el flaky anterior. Sus borradores/herencia/rangos/argv/recuperación y pruebas locales no deben reimplementarse. Comprobar el resultado exacto mientras se avanza K21, sin reiniciar una ejecución viva. K21 necesita streaming aislado entre dos procesos, fragmentos, lotes, virtualización, autoscroll al revisar y errores de copiar/exportar. K11 conserva aceptación integral/IPC legacy/escritores noNIO. Todas las herramientas locales de Mundos y chunks permanecen.

Etapa5 activa;6–9 pendientes;PR4borrador;producción beta.2/proxy intactos,Microsoft pospuesto. Sin nuevos ensayos NSIS/delta aislados, partida real ni presupuestos60s. DOMPurify package.json/lock WIP y ANALISIS_ARQUITECTURA.md siguen fuera de los commits.
