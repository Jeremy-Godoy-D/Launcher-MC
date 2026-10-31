# Etapa 4 — búsqueda y grupos al duplicar

Fuente: `89bd5d809b26954fc40f378b4df714332ea669f4`. La etapa continúa activa; producción conserva Vue.

Se reprodujeron dos fallos en el ejecutable anterior antes de editar: buscar `1.21.1` o `Fabric 0.16.0` no encontraba las instancias y duplicar no copiaba la entrada heredada de `modsGrouping`. Ahora la búsqueda normaliza espacios/caso y contempla nombre, Minecraft/versión personalizada y los seis loaders con sus versiones. Las tarjetas y el estado sin resultados comparten la misma lista; limpiar filtros mantiene la selección. El campo explica qué se puede buscar.

La duplicación conserva los grupos nativos de `mod-groups.json` mediante su copia de archivos existente y copia la entrada heredada exacta tras terminar el servicio. La fuente queda capturada también al reanudar. No se sobrescribe un destino con datos propios ni se elimina información ajena/corrupta. Si falla el almacenamiento de preferencias, la instancia nativa ya copiada permanece: el diálogo lo explica y reintenta solo los grupos, sin crear otra instancia. No se afirma persistencia de ese reintento tras cerrar el diálogo; el consumo/migración del legado corresponde a etapa 5 y debe respetar primero los archivos nativos ya existentes.

## Validación

- 579 pruebas unitarias / 60 archivos, incluidas 10 nuevas; 12,50 s en el cierre.
- 61 escenarios React empaquetados en 3,5 min; 1 StrictMode en 4,1 s; 2 Vue en 10,6 s: 64 distintos. Los recorridos afectados repetidos se solapan.
- Tipos/lint de raíz y comprobación React final aprobados; 9 pruebas del harness. Detector de las fuentes UI sin hallazgos; el escaneo adicional del CSS existente tiene 0 primarios y 40 avisos.
- 91 informes Axe: 0 violaciones, 162 incompletos. Cuatro capturas finales revisadas en ambos temas y tamaños admitidos; error y reintento completamente visibles, región interna operable por teclado. No certificación AA manual.
- Renderer/host React y host Vue reconstruidos; `dist` final Vue. Fuentes, comandos, hashes de paquetes y artefactos ignorados: [informe JSON](STAGE4-LIBRARY-PARITY.json).

Durante la validación se corrigieron dos regresiones: el estado vacío había quedado conectado al filtro anterior y una transición entre los colores de los temas producía contraste 4,38:1. Se eliminó la interpolación compartida de texto/superficie; no se desactivó el movimiento para pasar Axe. También se aislaron dos fixtures JAR que escribían en los mismos archivos de `launcher/temp` durante las unidades paralelas. Conservan todas sus comprobaciones de integridad y ahora usan directorios propios; no cambió el runtime ni la política global de pruebas.

K04 queda acreditado por las pruebas anteriores de edición/iconos/exportación/borrado y las nuevas de copia/grupos/reanudación. K02 mantiene pendiente la comprobación explícita de orden reciente junto a Inicio: el fallback/orden actual usa `lastAccessDate`; contrastar con últimas partidas y la seleccionada sin escribir selección por rotación. Las tres pruebas públicas del backend de medios anterior siguen en STAGE4-PROVIDER-MEDIA; no se cuentan de nuevo aquí.

## Siguiente bloque y límites

Completar orden de Inicio/recientes, los tres clips autorizados, precarga del siguiente póster, vídeo genérico etiquetado para packs y rendimiento de 60 s. No repetir iconos, perfiles, copia reanudable, galerías/caché ni los fallos corregidos aquí. Siguen pendientes las funciones de etapas 5–9, juego/Java reales, NSIS/delta en Windows desechable y revisión manual completa AA/RTL; Microsoft pospuesto. No publicar todavía.

El [CI 40386061680](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/40386061680) pasó React/Vue para el código anterior. Comprobar el CI propio de este avance después del push.
