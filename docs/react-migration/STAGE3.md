# Etapa 3 — cliente, estados y preferencias

Código: `086a281e9d90970e241e835d30a23bf8c8298002`, rama `codex/react-migration`, validado en Windows el 2026-10-24. Referencia pública sin cambios: v0.2.0-beta.2. Objetivo de la migración: v0.3.0-beta.1. El usuario ya aprobó el diseño; no solicitar otra aprobación del prototipo.

## Implementación

- `packages/renderer-client`: proxy tipado sin React/Vue, eventos con limpieza explícita, registro de estados por ventana/identidad y monitor de tareas. Conserva argumentos, null, undefined, datos binarios/ciclos y resultados de dominio en las llamadas, sin serializarlos indiscriminadamente a JSON.
- Snapshots estables, clonados y congelados para los registros/arrays de los estados existentes. Cada mutación se aplica sobre una copia privada, manteniendo snapshots anteriores; conserva métodos heredados y muestra errores sin perder los últimos datos válidos. Lecturas tardías, alias y desmontajes de Strict Mode comparten o liberan recursos explícitamente.
- Electron y DeskGap comparten el transporte: cola inicial antes de que exista el consumidor, revisiones ordenadas/deduplicadas y epoch para distinguir recursos recreados. Main comprueba que la ventana haya adquirido el estado antes de aceptar commit/revalidate y rechaza generaciones antiguas. Se mantiene compatibilidad con el protocolo anterior. No se cambian formatos de cuentas/instancias.
- Se corrigió la decoración de estados de main para no modificar el prototipo compartido de sus clases. Los helpers viven en cada instancia; las mutaciones heredadas funcionan en varios contenedores. Las pruebas anteriores de ciclo de vida siguen presentes.
- React incorpora `RuntimeProvider`, `useService`, `useSharedState`, `useServiceEvent` y `useTasks`. Un descriptor incluye sus parámetros de recurso en la clave. Las operaciones de juego/datos requieren una acción explícita; el montaje solo consulta estados.
- Tareas: una suscripción por ventana, consultas de 250 ms mientras hay actividad, sin solapamiento, lectura final, cancelación/limpieza tras confirmación y recuperación de errores. No se portó todavía su superficie completa de producto.
- Intlify 11.4.0 sin Vue, reutilizando los 29 YAML. Un plugin acotado a React precompila los mensajes a AST; producción elimina el compilador de cadenas. Pruebas de parámetros/listas/plurales/enlaces/fallback/números/fechas y comparación con Vue. Carga diferida con deduplicación y descarte de resultados obsoletos; sincronización mediante Settings y RTL en el documento. Los textos nuevos iniciales están en español/inglés; la traducción del resto del prototipo se completará al migrar sus funciones.
- `launcher.react.preferences`, versión 1: apariencia sistema/clara/oscura, rendimiento, vídeo, carrusel y biblioteca grid/list. Migra solo la elección válida de apariencia y `aurora.performanceMode`; no ejecuta ni aplica CSS/media del tema antiguo. Conserva sus datos y todas las claves ajenas. Lee ThemeService únicamente para recuperar `settings.dark`, sin importar el motor visual de Vue. Evita pisar cambios hechos durante una lectura tardía, sincroniza ventanas y conserva registros de versiones futuras. Fallos de lectura/cuota no bloquean la sesión.
- El workflow Windows incluye los nuevos checks; permisos read-only y sin publicación. Las opciones de decoradores necesarias para el grafo de tipos del API se limitaron a los dos paquetes nuevos. El override existente de js-yaml permanece intacto.

## Evidencia ejecutada

Comandos desde `launcher`, salvo el harness desde la raíz. Los comandos con variables indican la selección usada; no cambian el default Vue del repositorio.

| Comando / recorrido | Resultado |
| --- | --- |
| `pnpm exec vitest run scripts/renderer.test.ts xmcl-react-ui/src packages/renderer-client xmcl-runtime/service/ServiceStateContainer.test.ts xmcl-runtime/service/ServiceStateManager.test.ts` | **54 aprobadas en 10 archivos**, 2,17 s. Incluye las pruebas previas de lifecycle. |
| `pnpm check` y `pnpm lint` | Tipos de API/runtime/Electron/Vue/cliente/React y lint aprobados; cero warnings de lint en la ejecución final. |
| `node --test launcher/scripts/react-migration.test.mjs` | **9 aprobadas**, sin omitir controles del harness. |
| `LAUNCHER_RENDERER=react pnpm build:renderer` y build Electron | Renderer y paquete Windows x64 compilados; tres entradas y MP4 presentes. Se verificó que el ASAR excluye el harness de desarrollo y browser.html. |
| Ejecutable React, specs 01/02/05 | **4 aprobadas, 22,3 s**: doce vistas claro/oscuro en 1200×720 y 800×400, navegación/foco/vídeo/pausas, tres entradas reales, preferencias persistentes y sincronización. Context isolation/sandbox activos, Node/webview desactivados en main. |
| Ejecutable React + Vite gestionado por Playwright, spec 04 | **1 aprobada, 6,4 s**, React de desarrollo con Strict Mode. Dos consumidores + alias comparten un handler; una instancia creada en el directorio temporal actualiza los tres. Snapshot inicial conserva su instancia original. Al terminar: 12 efectos/12 limpiezas, cero suscripciones de estado/tareas, dos unref y máximo un poll simultáneo. |
| Vue por defecto, host recompilado, spec 03 | **1 aprobada, 7,9 s**. Además del arranque, una instancia sintética creada mediante su servicio aparece inmediatamente en la biblioteca Vue. |
| `node xmcl-keystone-ui/scripts/verify-bundle.mjs xmcl-keystone-ui/dist/assets` | Cero helpers huérfanos en 98 chunks. |
| `LAUNCHER_RENDERER=react NODE_ENV=production pnpm --prefix deskgap-app build` y `check` | Compilación/tipos aprobados; host nativo no ejecutado. |
| Workflow YAML | Parseado y comprobados matrix vue/react y permisos de lectura. No ejecutado aún en GitHub. |

La spec 05 comprueba migración sin aplicar CSS antiguo, conservación de claves, reinicio, cambio de esquema de Windows, ventanas con el mismo origen de producción y cambios en ambas direcciones. En 800×400 se alcanzan los controles inferiores y se abre/cierra Créditos. Los idiomas en/enlace de fallback, árabe/RTL y español se cambian desde el Settings real mediante una ventana de control aislada; ambas vistas reaccionan.

Axe produjo doce informes sin violaciones detectadas; quedan doce entradas `incomplete` agregadas que no equivalen a una certificación AA manual. Se inspeccionaron capturas de Inicio mínimo, Biblioteca clara y Ajustes mínimo. La auditoría manual completa de accesibilidad/RTL y los flujos finales siguen en las etapas 7/9.

Durante la preparación, un primer harness usó una ruta de preload no válida: se corrigió a la ruta compilada explícita, conservando sus aserciones. Una ejecución DeskGap se inició antes de que terminara el renderer y rechazó esa precondición; la repetición secuencial y la compilación final React pasaron. No se ocultaron fallos ni se modificaron las suites ci/showcase protegidas.

## Límites y continuación

Las seis pruebas Electron usan fixtures temporales; no inician Minecraft ni ejecutan un instalador. Los artefactos locales ignorados se identifican por hash en STAGE3.json. No hubo push, PR ni publicación. Microsoft sigue pospuesto; no se modificaron credenciales, proxy CurseForge, actualizador o el archivo del usuario ANALISIS_ARQUITECTURA.md.

La interfaz principal conserva instancias/proyectos de ejemplo y acciones explicadas como vista previa. Las auxiliares logger/migration siguen como entradas de infraestructura. El cliente ya sirve para conectar dominio; no implica paridad de todas las pantallas ni retirada de extras del bootstrap. El congelado cubre los registros/arrays actuales; JavaScript no congela el contenido de vistas binarias. Las operaciones nativas pendientes no se abortan: se ignoran resultados obsoletos y se liberan al resolver o destruirse la ventana.

Pendientes globales: funciones de las etapas 4–8, traducción completa de sus textos, juego real, host nativo DeskGap, revisión de seguridad/CSP completa, mediciones de rendimiento 60 s, instalador/actualización en Windows desechable y publicación de la etapa 9. El fallo ASCII del build DeskGap de desarrollo documentado en STAGE2 no se revalidó ni se declaró corregido.

Etapa 4: onboarding/perfil local, Inicio/carrusel y Biblioteca/crear/importar/lanzar con servicios reales. Conservar imágenes propias de los packs, paisaje Vanilla con shaders, fondo global/glass, datos existentes y operaciones explícitas, sin reintroducir extras.
