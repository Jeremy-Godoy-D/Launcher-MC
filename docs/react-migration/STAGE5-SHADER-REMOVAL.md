# Retirada revisada de shaders

Producto `f7567ad1dac91e738fa81324029c7620aab37ed8`; correcciones de fixtures `830280852d768a38c1d848714a15d6a67a0b67b0`. Continuación de selección/importación. Etapa5 y K10 siguen pendientes.

## Comportamiento

La selección múltiple abre una revisión Native con archivos, bytes/entradas, alcance de la carpeta compartida y selecciones afectadas de OptiFine/Iris/Oculus. Confirmar guarda las configuraciones afectadas antes de desactivarlas y mueve los shaders a una copia privada. No necesita tener instalado un motor para recuperar un archivo roto. El diálogo conserva título/acciones y desplaza archivos, advertencias, errores y ruta de copias dentro de su cuerpo.

La copia usa el árbol .backups/shaderpacks-UUID:shaderpacks/nombre para archivos y carpetas; config/iris.properties,config/oculus.properties u optionsshaders.txt para las configuraciones originales. Se guardan sus bytes completos mediante archivo exclusivo y sync. Los nombres de carpetas shader no colisionan con las copias de configuración. No se borran estas copias al reintentar.

Native revalida instancia Java, snapshot SHA-256, archivos/carpetas, identidad y autoridad del origen, y las tres configuraciones. Las rutas/identificadores, selección y entradas tienen límites. Rechaza enlaces ajenos, entradas enlazadas, .backups enlazado, configuraciones afectadas compartidas por hardlink y hashes ilegibles. Antes de cada traslado vuelve a inspeccionar el archivo y su carpeta después de los hashes, incluso si un destino sustituido contiene el mismo archivo por hardlink. Comparte locks de arranque; bloquea el juego propio y otros juegos que usan el directorio común.

Solo desactiva selecciones que nombran archivos elegidos; conserva comentarios, escapes, campos desconocidos, otras opciones, mundos, otros motores y configuraciones de otras instancias. Una carpeta común se advierte explícitamente: sus archivos sí desaparecen de todas las instancias vinculadas. Un fallo parcial conserva los datos en su origen o en las copias, muestra la ruta y exige una revisión nueva; no promete rollback. No garantiza aislamiento transaccional frente a toda modificación hostil del mismo usuario durante syscalls, ni recuperación de un fallo físico del disco.

El contrato legacy uninstall acepta nombres o rutas directas de shaderpacks y mantiene el vacío como no-op. Pasa por revisión/backups en Native. Vue espera el resultado y vuelve a leer la selección; deja de borrarla por adelantado o de desactivar un shader distinto cuando se retira otro archivo. La lectura/hash de archivos se comparte con resource packs, cuyo comportamiento se volvió a probar.

## Validación

- **937 unitarias/96 archivos**, aprobadas en22,50s;45 focales aprobadas. Cubren archivo/carpeta/configuración obsoletos, fuente común, error parcial y reintento, nombres de respaldo, hardlinks, destinos sustituidos y guardas del servicio. Un contador de mocks se limpió entre casos para que la comprobación de cero traslados pertenezca a su propia fixture.
- pnpm check y pnpm lint completos aprobados; tras ajustar el cuerpo del diálogo, check/lint React aprobados. Lint0avisos/0errores. E2E tsc mantiene exactamente los56diagnósticos anteriores, sin nuevos en12/48/52/54/55 ni otros archivos afectados.
- React empaquetado final: **24 escenarios distintos**,12/44/48/52/53/54,aprobados en1,4min.54 añade5:revisión/cancelación/retirada y copias completas,configuración externa obsoleta,ZIP ilegible,failure injection de rename y recuperación,y alcance común. La inyección verifica que falló exactamente una escritura Native,retiene las configuraciones originales y permite confirmar una revisión nueva sin perder la primera copia.
- Vue empaquetado:03/08/33/45/55,**5 aprobados en29,6s**.55 verifica el contrato Native legacy y sus copias en el host Vue; no se afirma haber recorrido toda la antigua pantalla de shaders. Ambos renderers y hosts se construyeron;dist/default quedan en Vue.
- **6 Axe de la retirada,0violaciones/13incomplete**:revisión claro/oscuro en1200×720 y800×400,advertencia común y error con ruta larga en800×400. Se inspeccionaron capturas y se verificaron título,acciones,copias y scroll alcanzables. Los incomplete no equivalen a aprobación AA manual.52 repite además su matriz de selección.
- Fixtures ZIP/JAR/shaders sintéticos; sin Java/Minecraft ni shaders ejecutados. No se tocó la instalación habitual. Backups y .install-manifest no relacionado permanecen intactos en el recorrido de retirada.

Comandos desde launcher:pnpm exec vitest run con la lista del workflow;pnpm check;pnpm lint;pnpm --dir e2e exec tsc --noEmit;gen:testids para React/Vue. Builds por scripts con LAUNCHER_RENDERER=react y después vue. Playwright contra EXE propio,XMCL_E2E_LOCALES=es-ES:54 inicial5/5;final12/44/48/52/53/54;Vue03/08/33/45/55.48 focal volvió a pasar en4,7s tras añadir la comprobación de cierre. No cuenta como escenario adicional.

## Seguimiento CI y fixtures

CI40985586565/dd7d8ee aprobó ambos jobs para importación cd127df. CI40985785465/c7238a5 terminó con React140aprobados,1fallido,1flaky y2omitidos; no se declara verde por tener otro run aprobado.

48 podía escribir el ZIP antes de que la segunda revisión estuviera disponible. Ahora espera el cierre de la primera y una confirmación habilitada en la segunda antes de editar el archivo. Mantiene las expectativas de rechazo y de ausencia de publicación.12 se detuvo253s en la comprobación de viewport después de comprobar foco Native/DOM. La fuente Playwright instalada usa IntersectionObserver y requestAnimationFrame para esa operación. Solo ese control pasa ahora una comprobación síncrona de límites de viewport y ancestros con clipping; conserva visibilidad,foco,habilitación,activación Enter y todos los asserts de pausa/proceso. Los demás recorridos siguen usando sus asserts originales. El lote final y la focal48 pasan localmente; hace falta confirmar el CI nuevo.

Manifiesto ignorado launcher/e2e/artifacts/stage5-shader-removal-manifest.json,SHA-256 `72bf18eb0518680dcc58d22b9d1d8414a1fcb9734f6f21b231ac3b723735940e`:20blobs Git canónicos y169artefactos,incluidos ambos EXE/ASAR,logs,Axe,capturas y trazas CI de12/48. Solo se recorrieron estos directorios explícitos;no se sigue sharing-temp-alias.

## Próximo bloque

Información/grupos y gestión segura de compartidos/updates de shaders;después mundos,ajustes y consola,y etapas6–9. K08/K09/K10 y las tres gates5 siguen pendientes. Mantener Microsoft pospuesto,proxy/producción intactos y PR4 borrador. No publicar aún: faltan funciones y validación integral,Java/juego reales,NSIS/delta aislados y presupuestos finales. Conservar restricciones de AGENTS.md.
