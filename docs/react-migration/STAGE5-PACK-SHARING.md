# Etapa 5 — carpetas de packs compartidas y privadas

Fuente `46b6230722996354e3148c5d5242b17a38152735`. Completa este bloque de gestión de carpetas; K09/etapa5 siguen pendientes de actualizaciones y aceptación completa.

## Comportamiento y datos

Compartir packs abre una revisión Native de solo lectura: cantidades locales/comunes, archivos/bytes que se copiarán y conflictos. Confirmar copia entradas nuevas sin reemplazo, reutiliza duplicados idénticos y conserva la carpeta local anterior en .backups/resourcepacks-share-UUID/previous antes de publicar el vínculo. Un nombre en conflicto, incluidas diferencias de mayúsculas, impide confirmar; no renombra packs ni rompe referencias de options.txt. Se conservan también archivos no reconocidos y carpetas vacías.

Crear copia privada revisa y copia todos los archivos comunes a una carpeta independiente, cambia únicamente el vínculo de esta instancia y conserva los archivos comunes. La selección de Minecraft, los grupos y los mundos no se modifican. Los grupos siguen en el JSON propio de cada instancia. Los métodos legacy linkShared/unlinkShared usan el mismo motor protegido: desvincular conserva ahora una copia privada en lugar de dejar una carpeta vacía. Los contratos void y las operaciones idempotentes permanecen.

La revisión SHA-256 vincula raíces/identidades, contenido y decisión. Aplicar recalcula y rechaza revisiones obsoletas. Rechaza enlaces internos/raíces no autorizadas o solapadas, raíz de volumen, nombres ambiguos y huellas ausentes o inválidas. Recorre hasta100000 entradas y64 niveles por raíz, conserva directorios vacíos y copia archivos con destino exclusivo, verificando su SHA-256. No necesita una descripción válida de pack.mcmeta para conservar un archivo.

El servicio comprueba Java registrado antes/después de los locks de opciones e instancia. Bloquea partidas propias y las que usan la carpeta común incluso cuando la instancia que solicita compartir todavía es privada. Comparte la exclusión de arranque/salida de RESOURCE-PACK-STARTUP. La observación de packs también valida el origen y coordina su preparación con esos locks; ya no elimina por migración automática un vínculo ajeno.

Windows retenía un handle de la carpeta mientras se observaba un pack desempaquetado: las primeras pruebas quedaban esperando al moverla después de copiar/verificar. El recurso observado ahora permite pausar/cerrar su watcher y reanudarlo sobre la nueva ubicación, conservando estado, cola y consumidores. El servicio lo hace dentro de los locks y vuelve a validar la lista; finally restaura la observación incluso ante fallo de cierre o aplicación. Native48 comprueba que aparece un pack nuevo en la carpeta común sin reiniciar ni pulsar Volver a leer.

Los fallos pueden dejar copias nuevas parciales en la carpeta común. Si falla publicar el vínculo/copia se intenta restaurar únicamente una ruta ausente, sin reemplazar datos de otro escritor. Si esa restauración falla también, las copias quedan en el respaldo privado. La UI explica el estado parcial y permite abrir respaldos después de cerrar la revisión. No hay transacción total ante escritores externos o corte eléctrico.

## Validación

- **841 unitarias/88 archivos,17,03s**, suite del workflow;17 nuevas sobre824. Helpers con FS real y guardas del servicio: duplicados/conflictos, copia independiente, carpetas vacías, revisiones cambiadas, vínculos/raíz de volumen, huella no disponible, fallos de copia/publicación, restauración y watcher. Las excepciones de copia, rename y checksum se inyectan; no se afirma haber simulado todos los fallos del sistema operativo.
- Tipos raíz/lint aprobados; tipos runtime y lint repetidos tras la última corrección de finally. E2Etsc conserva56 diagnósticos anteriores, ninguno en48/helper nuevo. Ambos hosts y renderer React reconstruidos; dist/default Vue conservados. No cambia versión ni publica.
- **22 escenarios empaquetados distintos**:18 React(24/43/44/46/47/48) y4Vue(03/08/33/45). Regresiones React24/43/44/46/47:15 aprobadas,46,2s. Tanda final48:3 aprobadas,11,4s; Vue4 aprobadas,20,3s. Tras cubrir el fallo de cierre del watcher en finally se reconstruyeron ambos hosts y se repitió el flujo48 de carpetas:1 aprobado,4,6s, solapado con22. Las regresiones preceden a las dos últimas guardas de huella/raíz, cubiertas por unitarias y48 final.
- Native48 usa ZIP y carpetas sintéticos reales: cancelar sin cambios, respaldo original, archivos comunes/privados con inodes independientes, directorios vacíos, selección/CRLF/grupos/mundo preservados, otra instancia vinculada y observación posterior al cambio. Los conflictos y una edición después de revisar no publican archivos ni cambian el vínculo. No se inicia Minecraft.
- Primer48:1 aprobado/2 fallidos. Se corrigió la espera de Windows pausando el watcher, y el foco perdido al cerrar un diálogo mientras el botón seguía ocupado. No se retiraron esas aserciones. Instrumentación temporal confirmó el punto del movimiento; se retiró del código final y sus logs permanecen ignorados.
- **Ocho informes Axe actuales:0 violaciones/16 incomplete,8PNG**; ambos sentidos, claro/oscuro1200×720 y800×400. Título/cuerpo/pie/foco/Escape y retorno accesibles, sin desbordamiento horizontal de ventana. Capturas mínimas revisadas, incluido el texto neutral para un solo archivo. No AA manual exhaustiva.
- Harness check y nueve regresiones pasan. CI40830063540 aprobó React/Vue sobre765c6be/c3f317a+217a623: también confirma la corrección previa de foco en Windows hospedado. Este source requiere CI propio tras push.

Comandos desde launcher: suite vitest del workflow; pnpm check/lint y check runtime final; pnpm --dir e2e exec tsc --noEmit; renderer/host build por LAUNCHER_RENDERER y hosts finales React/Vue. Playwright48 y24/43/44/46/47 React,03/08/33/45 Vue con EXE específico, es-ES y outputs separados. Desde raíz: harness check y node --test launcher/scripts/react-migration.test.mjs.

Manifiesto ignorado `launcher/e2e/artifacts/stage5-pack-sharing-artifact-manifest.json`, SHA-256 `60e6a96995852eefd1546d060f21da7cd824e1d7e19e1ff7286c0cee6eed5ba0`:12 blobs Git canónicos y359 archivos de evidencia, incluidos fallos/aprobados, instrumentación retirada, capturas y hashes EXE/asar de outputs mutables.

## Continuidad y límites

Siguiente: actualizaciones de packs reutilizando clientes públicos y el instalador revisado; conservar activación/prioridad, originales, compartidos y guardas vigentes. Después shaders, mundos, ajustes, consola y6–9. No volver a los métodos heredados del padre que mueven/renombran sin esta revisión ni reimplementar gestión local/información/grupos/compartidos ya verificados.

K08/K09 y las tres gates5 permanecen pending. No certifica dos unidades físicas, cambios externos arbitrarios, recuperación automática tras corte eléctrico, Java/partida reales, NSIS/delta, AA manual ni presupuestos finales. Producción/proxy intactos, Microsoft pospuesto, beta.2 y PR4 en borrador. No DevTools/CDP, ANALISIS_ARQUITECTURA.md ni limpiezas denegadas.
