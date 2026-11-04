# Etapa 4 — Inicio y Biblioteca con instancias guardadas

Código: `7783a81158ce47eaae94fbe0bf58ab7ad36b79cc`, validado en Windows el 2026-10-25. **Etapa 4 parcial; sus tres criterios siguen pendientes.** Este bloque reemplaza las instancias de ejemplo de Inicio/Biblioteca y la identidad del área de instancia. El catálogo sigue con fixtures identificadas. No se cambia la versión pública ni el renderer predeterminado Vue.

## Comportamiento conectado

LibraryProvider consume InstanceState mediante el cliente independiente, con snapshots inmutables compartidos y liberación de referencias. Arranca después del onboarding nativo. La interfaz muestra las instancias Java actuales: nombre, versión, loaders y descripción. Bedrock permanece en los datos y queda fuera de esta biblioteca. Los filtros se derivan de los loaders existentes, incluyendo combinaciones. Las mutaciones del servicio actualizan las tarjetas sin recargar.

`selectedInstancePath` conserva su cadena literal anterior, sin JSON ni cambios en el archivo de instancia. Se restaura la selección guardada; solo cuando no existe una selección se elige la de mayor lastAccessDate. Una ruta guardada ausente no se sustituye silenciosamente: aparece Sin instancia seleccionada y se ofrece elegir otra. Seleccionar y administrar capturan la ruta del elemento pulsado; la sincronización entre ventanas usa el almacenamiento existente. La destacada se identifica por ruta y es independiente de esa selección; el carrusel no escribe instancias ni fechas.

Estados explícitos de carga, biblioteca vacía, fallo recuperable con Reintentar y fallo al guardar selección. Sin puente nativo se solicita abrir Launcher MC. El área de instancia deja de asumir que siempre existe un elemento seleccionado. Nombres/descripciones largos tienen ajuste de texto; las tarjetas conservan el truncado y la identidad completa en su acción accesible.

Se conserva el paisaje global y glass aprobado, con apariencia clara/oscura y rendimiento sin blur. Los packs usan su icono guardado como portada provisional; **la resolución de galerías por upstream todavía está pendiente**. No se asignan packs por nombre ni se buscan imágenes de packs en internet. Vanilla mantiene los medios licenciados empaquetados; el ambiente se identifica como tal. Las imágenes guardadas aceptan HTTPS sin credenciales y las rutas locales de imagen/media ya servidas por el runtime, con fallback empaquetado. No se añade descarga arbitraria de vídeos. Cambiar los medios de una instancia reinicia su componente ambiental para no conservar un error/reproductor obsoleto.

Se retira «Lista para jugar»: se muestra «Guardada en este equipo». Jugar todavía informa que el lanzamiento está pendiente en React; no llama a Minecraft. Crear, importar, editar, duplicar, agrupar, exportar y eliminar desde la UI siguen pendientes. Las mutaciones usadas por las pruebas se ejecutan únicamente sobre fixtures nativas temporales, no representan botones terminados.

## Validación ejecutada

Comandos desde `launcher`, salvo los del harness desde raíz. Logs/capturas ignorados y sus hashes figuran en STAGE4-LIBRARY.json.

| Comando / recorrido | Resultado |
| --- | --- |
| `pnpm check` / `pnpm lint` | Aprobados; cero errores/avisos de lint. |
| `pnpm exec vitest run scripts/renderer.test.ts xmcl-react-ui/src packages/renderer-client xmcl-runtime/service/ServiceStateContainer.test.ts xmcl-runtime/service/ServiceStateManager.test.ts xmcl-runtime/user/UserService.persistence.test.ts xmcl-runtime/setup/bootstrapSession.test.ts xmcl-electron-app/main/utils/bootstrapSender.test.ts` | **72 pruebas en 15 archivos**, 2,73 s. Incluye selección/restauración/ausencia, exclusión Bedrock, loaders y URLs de imagen. |
| `LAUNCHER_RENDERER=react pnpm build:renderer` y build Electron | Aprobados; paquete Windows x64 React local actualizado, sin publicación. |
| Ejecutable React, specs 01/02/05/06/07/09 | **11 aprobadas, 37,8 s**. Tamaños 1200×720 y 800×400, claro/oscuro, teclado/foco, vídeo real/pausas, preferencias, cuentas, onboarding y biblioteca. |
| Ejecutable React + Vite de desarrollo, spec 04 | **1 aprobada, 4,2 s**. Strict Mode mantiene snapshots idénticos entre consumidores/alias y libera suscripciones/tareas. useSharedState conserva su contrato de identidad; useSharedStateStore permite reintentar sin reemplazarlo. |
| Host Vue recompilado, specs 03/08 | **2 aprobadas, 9,7 s**. Recorrido anterior de instancias/perfiles y onboarding. |
| `node --test launcher/scripts/react-migration.test.mjs` / `node launcher/scripts/react-migration.mjs check` | **9 aprobadas** e integridad correcta. |
| Workflow de migración | YAML parseado correctamente; spec 09 añadida a Windows React. No ejecutado en GitHub. |

La spec 09 crea tres instancias sintéticas mediante InstanceService, conserva la selección al recargar y la comparte entre ventanas sin mover la destacada. Cambia nombre, loader y un icono local propio de la fixture, comprueba sus píxeles y excluye una cuarta instancia Bedrock sin borrarla. Comprueba filtros y cuatro combinaciones de tamaño/apariencia con Axe, sin violaciones detectadas. Después usa nombre sin espacios y descripción extensos, verifica ausencia de desbordamiento horizontal, retira registros con deleteData=false y comprueba que el archivo de mundo sintético sigue dentro de la carpeta conservada por el servicio. El archivo se conserva en la carpeta oculta que ya usa el runtime para esa operación. Se comprueba cero procesos de juego y una clave de almacenamiento ajena intacta.

Otro caso introduce un fallo temporal del IPC exclusivamente en el proceso de pruebas: observa carga, error sin tarjetas inventadas y recuperación mediante Reintentar, conservando la ruta guardada ausente. Los logs incluyen errores esperados de esta inyección y de los negativos del bootstrap; no son errores de consola inesperados del renderer. Las specs 01/02 ahora crean fixtures por el servicio real en vez de depender de una biblioteca simulada dentro del producto. Las suites canónicas no se modificaron.

Inspección visual de capturas de Inicio oscuro1200, Biblioteca oscuro1200/claro800 y biblioteca vacía800: fondo global, cristal y scroll conservados. Los controles inferiores de las tarjetas quedan dentro del scroll, sin scroll horizontal detectado. Axe y estas capturas no certifican accesibilidad AA manual exhaustiva. El detector de diseño emitió 39 avisos de escala/color/radios en estilos preexistentes; no modifican la aprobación visual ni justifican rehacer el diseño/sidecar durante este bloque.

Las dos primeras ejecuciones de la nueva spec fallaron por una fixture que enviaba un icono como ruta absoluta/file URL, formatos que no acepta ese método del servicio. Se corrigió la fixture para usar el contrato local existente http://launcher/media; no se relajó el servicio. Una ejecución intermedia aprobó los dos casos nuevos. Las cifras anteriores corresponden a la ejecución final sobre el código indicado, incluidos los cambios posteriores de texto largo/medios. Logs de investigación conservados; reportes por-test de Playwright son transitorios al ejecutar otra suite, mientras logs de bloque y capturas del helper permanecen identificados.

## Siguiente bloque y límites

Conectar creación/importación desde Biblioteca/onboarding. Antes de lanzar, conservar diagnósticos de versión, instalación, Java, RAM/perfil y generateLaunchOptionsWithGlobal, capturar la ruta y seguir procesos/errores. No basta con que la ruta figure en InstanceState: falta comprobar su disponibilidad física en el flujo de lanzamiento. No portar ramas Bedrock/P2P/voz/telemetría del coordinador anterior. Completar galerías públicas por identidad upstream, sus fallbacks/caché y pausa con proceso de juego. Conservar datos, proxy y actualizador.

Faltan edición/apariencia de perfiles, operaciones completas de instancia, catálogos reales, consola/tareas y los demás criterios del plan. No se ejecutó una partida, el instalador/actualización aislados, DeskGap nativo ni la medición CPU/GPU60s de React en este bloque. Microsoft sigue pospuesto. No afirmar que etapa4 o la migración estén completas.
