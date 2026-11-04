# Etapa 5: copia, exportación y retirada revisadas de mundos

Fuente `9d7efebbcd673ad2a7fc73dba46444aa807681b0`. React ya copia mundos dentro de la misma instancia o hacia otra, exporta un ZIP y retira mundos conservando una copia privada. Todas requieren revisión Native y confirmación. K11 y la etapa 5 permanecen pendientes.

## Contrato y conservación

- `previewWorldFiles` / `applyWorldFiles` aceptan operaciones discriminadas y recomputan el plan al confirmar. Los contadores o avisos enviados por el renderer no autorizan destinos ni omiten controles.
- Registro Java de origen/destino comprobado antes y después de los locks. Lock global de recursos/lanzamiento seguido de locks de instancia ordenados. Revalidación de juegos antes/después del trabajo; compartidos bloquean de forma conservadora mientras haya alguna partida abierta. Retirar solo un enlace conserva el destino y no bloquea partidas ajenas por compartir archivos.
- Se reutiliza el lector de árbol de compartidos, ahora exportado como `readFolderSnapshot`, sin cambiar su comportamiento. Acota profundidad 64 y 100000 entradas, rechaza enlaces anidados y nombres ambiguos, verifica SHA-256 y cambios durante la lectura.
- Copia exclusiva sin reemplazar destinos. Conserva archivos ocultos y carpetas vacías; escribe `level.dat` al final. Si falla, conserva origen y destino parcial, muestra aviso y permite abrirlo para inspección. No se afirma reanudación automática.
- Retirada mediante rename a `.backups/world-UUID`, conservando los bytes. Un enlace individual se mueve como enlace, sin tocar el mundo común. Un mundo en la carpeta completa compartida muestra advertencia sobre las demás instancias. El respaldo debe estar en la misma unidad: ante EXDEV falla sin borrar el origen; la UI explica esta limitación.
- ZIP desde una copia temporal verificada, publicación exclusiva por enlace duro y sin sobrescritura. Exportación fuera de datos del launcher y de todas las instancias registradas. Se revalida identidad de origen/destino; la limpieza comprueba ruta única e inode del temporal propio. Una carpeta reubicada se conserva y no se limpia otra que la sustituya.
- Diálogos con Escape/devolución de foco, formularios conservados al volver de revisión, errores al inicio y resumen visible al revisar. La zona con scroll admite teclado; 800×400 conserva acciones accesibles. Singular de mundos/archivos corregido.

## Evidencia y correcciones

- Suite del workflow: **999 pruebas / 100 archivos**, 20,45 s, sin build/Electron simultáneos. Incluye siete casos de operaciones, tres del servicio y las regresiones de compartidos existentes.
- `pnpm check` y `pnpm lint` completos aprobados tras corregir tipos. Runtime y React repetidos después de los últimos ajustes; runtime lint cero avisos, React conserva un aviso previo de regexp. E2E tsc mantiene exactamente **56 diagnósticos previos**, sin nuevos.
- React empaquetado: **10 escenarios distintos** (57/61/62), 32,1 s. Tras simplificar la revisión se repitieron los **3 de 62**, 12,2 s. Vue empaquetado: **3 escenarios** (03/58/63), 8,8 s. No sumar las repeticiones como escenarios nuevos.
- Doce estados nuevos de Axe: copia/ZIP/retirada, claro/oscuro, 1200×720 y 800×400: **0 violaciones / 24 incompletos**. Capturas finales revisadas: copia oscuro 800, ZIP claro 800, retirada oscuro 1200. No equivale a certificación AA manual.
- El primer lote Native fue 9/10: Axe detectó `scrollable-region-focusable` en la revisión a 800; se añadió región accesible por teclado. El lote final pasó. La prueba de rebinding del destino encontró un ENOENT genérico: se normalizó a cambio de archivos; pasó luego la suite 999. Dos errores TypeScript iniciales (mock y cierre) y uno del spec (shadowing `open`) se corrigieron, sin relajar comprobaciones.
- CI anterior **41179439218 / aa5cc27**: ambos jobs success, 989 unidades por job, 7 Vue y React **161 passed / 3 flaky / 2 skipped**, más un recorrido Strict. Intermitencias pendientes de triage: 12-launch:69, 44-pack-files:72 y 53-shader-import:40. Éxito tras reintentos no prueba estabilidad; no cerrar publicación con esto sin revisar.

Comandos desde `launcher`: lista `pnpm exec vitest run` del workflow; `pnpm check`; `pnpm lint`; `pnpm --dir e2e exec tsc --noEmit`; checks/lint scoped posteriores. `LAUNCHER_RENDERER=react`: `gen:testids`, `build:renderer`, `build`; EXE React 57/61/62, repetición 62. `LAUNCHER_RENDERER=vue pnpm build`; EXE Vue 03/58/63. Tras el último build React se restauró de nuevo el host/dist Vue; renderer Vue previo reutilizado.

Manifiesto ignorado `launcher/e2e/artifacts/stage5-world-operations-manifest.json`, SHA-256 `ac6a5a430486ff3ab91cf0a0ace657b05404c5dc32e79cfbde387b1179bd7d72`: 15 blobs Git canónicos y 230 artefactos. Logs/capturas de fallos y finales conservados solo en carpetas propias explícitas; no se siguieron rutas protegidas.

## Pendiente

Resolver las tres intermitencias de CI, importar mundos desde ZIP/carpeta, editar metadatos, datapacks y completar los recorridos locales conservados; después ajustes/consola y etapas 6–9. No retirar mapa/progreso/regiones por suposición: SCOPE conserva operaciones locales existentes y la aclaración opcional no tiene respuesta.

Los métodos de escritura legacy no se conectan a la nueva UI y todavía necesitan tratamiento en la retirada/auditoría de IPC de etapa 8; este bloque no certifica todo `InstanceSavesService`. Sin partida real, cancelación/progreso global de estas operaciones, NSIS/actualización aislada, medición de rendimiento ni publicación. Señales GPU/deprecación observadas en el host no se contabilizan como errores de página; los recorridos visuales finales no tuvieron pageerror. Producción/proxy intactos, PR4 borrador y Microsoft pospuesto.
