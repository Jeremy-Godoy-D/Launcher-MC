# Etapa 7 — superficies restantes completas

La interfaz React del núcleo dispone de ajustes, tareas, notificaciones, ayuda local, actualizador, ventanas auxiliares, arrastre y navegación por teclado. Se conservan los servicios existentes. La publicación y la retirada del arranque de extras siguen en las etapas 8–9.

Candidata final de este bloque: `8d3b919` (commit completo en STAGE7-CLOSURE.json). Los informes STAGE7-SETTINGS.md y STAGE7-ACTIVITY-UPDATER.md conservan los ajustes atómicos, caché, borradores al cerrar, tareas y transferencia autenticada ya aceptados. No se repitieron las etapas 0–6.

## Traslado de datos y ventana auxiliar

- BaseService revisa el destino en main: ruta absoluta, resolución canónica, carpeta vacía/nueva, separación del origen, permisos y ausencia de partidas/tareas activas. Vuelve a revisar al confirmar; expectedSource impide aplicar una revisión de otra raíz. No toma el origen de parámetros del renderer.
- El diálogo separa elegir de revisar. Muestra origen/destino confirmados; las acciones permanecen fuera del scroll, incluidas en 800×400. Cambiar destino conserva el campo y devuelve el foco.
- La transferencia nativa no sigue enlaces. Conserva los originales si falla recrear un enlace; en Windows recrea enlaces de directorio como junctions en la rama entre volúmenes. Las copias usan COPYFILE_EXCL y comprueban que el origen no cambió antes de retirarlo.
- El journal registra cada movimiento terminado, incluidos archivos dentro de un directorio parcialmente transferido. La recuperación recorre el journal en orden inverso. El puntero root se escribe atómicamente al terminar; un fallo cosmético de la ventana no revierte una transferencia ya confirmada.
- Progreso/error/recuperación/final llegan a migration.html mediante el preload. Se retiran listeners al desmontar; la ventana fallida se conserva para consultar ambas rutas. Se distingue restauración completa de incompleta y no se aconseja borrar una carpeta.
- El selector de instancia administrada se remapea de forma idempotente a partir del contexto nativo de la ventana principal. Las instancias externas se conservan. Query parameters arbitrarios no autorizan esa modificación.

## Arrastre y accesibilidad

- El puente nativo resuelve los File de Chromium; no se inventan rutas a partir del nombre. Se acota el lote a 256 y se aceptan rutas nativas o handles opacos de DeskGap, que su transporte resuelve en main.
- Biblioteca abre el importador de ZIP/MRPACK existente. Mods, packs y shaders muestran una revisión de instancia/tipo/archivos y reutilizan sus instaladores; Mundos abre el revisor de archivos existente. No se sustituyeron los backends ni se activa contenido automáticamente.
- Se bloquea el arrastre mientras hay un diálogo. La confirmación rechaza cambios de instancia/contexto o un destino ocupado. Las comprobaciones de partida/archivos del instalador permanecen; se conservaron originales y una segunda instancia en las pruebas.
- Se completó Adelante junto al control Atrás existente, Alt+flechas y el enlace Saltar al contenido. Se comprobaron foco/retorno, Escape, minimizar/maximizar/restaurar, movimiento reducido y geometría RTL. No se agregó un idioma inexistente.

## Evidencia

| Comprobación | Resultado |
| --- | --- |
| Suite seleccionada de .github/workflows/react-migration.yml | 1.520 pruebas, 154 archivos, sin fallos. |
| Tipos runtime/API/Electron/preload/Vue/cliente/React | pnpm check: exit 0; React se comprobó también tras los ajustes visuales. |
| Lint | exit 0; avisos preexistentes conservados. |
| Tipos E2E | Los mismos 56 diagnósticos normalizados de referencia; ninguno nuevo. |
| Compilación | React renderer/Electron, Vue Electron y DeskGap con NODE_ENV=production: exit 0. |
| Nuevos recorridos Native React | 8 distintos: 100, 102 (2), 103, 104 (3) y 105. |
| Regresión Vue empaquetada | 03 y 08: 2 aprobados en 11,2 s; hash del host igual al dist Vue. |
| Axe de los flujos nuevos | 9 informes elegidos, 0 violaciones, 12 incomplete. Capturas y teclado revisados; incomplete no equivale a conformidad automática. |
| Anclas | 199 IDs React regenerados. |

Recorridos Native sobre ejecutables empaquetados y perfiles desechables:

- 102: rechazo de carpeta ocupada/anidada, picker nativo, revisión/cancelación/foco y capturas 1200×720/800×400. El otro caso ejecutó realmente --migrate al arrancar sobre una raíz con alias; verificó bytes de saves/jre, puntero root, contexto nativo y archivo de perfil conservado.
- 103: preload migration real, error de lectura/reintento, progreso, rollback incompleto, final y recarga; 600×400, oscuro/claro y acción de cierre alcanzable. Los estados de fallo se inyectan en IPC dentro del proceso de prueba; no simulan un fallo físico de disco.
- 104: File de input nativo trasladado a DataTransfer, importación revisada de mods, rechazo de destino cambiado y de segundo drop modal, originales/segunda instancia, packs/shaders sin activar, mundo exportado/importado y preview de modpack sin creación automática.
- 105: salto de navegación, atrás/adelante por teclado/botón y controles Native; geometría RTL forzada en ambas dimensiones y temas con movimiento reducido.
- 100: transferencia API con credencial ficticia, 503, cancelar desde tareas, SHA incorrecto, reintento, archivos temporales/pending y confirmación sin aplicar. Tras corregir la selección compacta y esperar al formulario, pasó en 800×400 en 4,4 s.

Proveniencia por flujo: 104 modpack fue aceptado en 23013c2; 102 arranque, 103, 104 mods y 105 en 8d873e2; 104 packs/shaders/mundos se volvió a comprobar en cafede0 (4,2 s); 102 con todas las acciones fuera del scroll en 8d3b919 (4,0 s). Las diferencias posteriores a cada recorrido se limitaron a los consumidores afectados y se repitieron esos consumidores. No se afirma una ejecución integral de todas las pruebas Native sobre el último commit: esa ejecución queda en CI/etapa 9.

CI 41474917961 de 5561253: Vue aprobada; React 307 aprobadas, 2 omitidas y un fallo en 100 por pulsar la categoría oculta antes de esperar al formulario. El helper compartido ahora espera el formulario y elige selector o columna visible; el recorrido compacto local pasó. La regresión 35 que había fallado en la CI anterior pasó en esta ejecución. No se reintentó la CI antigua.

Los logs, capturas, ejecutables y sus identidades SHA permanecen ignorados. STAGE7-CLOSURE.json enlaza el manifiesto local, que enumera los archivos fuente y los artefactos con SHA-256. Este informe conserva comandos, alcance y límites en el repositorio.

## Límites y siguiente etapa

Se aceptan K18/K19/K22/K23 y los tres gates de la etapa 7 por sus funciones de interfaz e integración. K20 y K21 conservan su aceptación previa. La descarga pública sin token, aplicación real de ASAR/instalador y actualización desde beta.2 pertenecen a la etapa 9; los bytes sintéticos del fixture no son un instalador ni una prueba de aplicación real. K03/K05/K06 mantienen los criterios físicos finales pendientes.

La rama entre volúmenes se ejercitó mediante operaciones reales de archivos e inyección de EXDEV, no con un segundo disco físico. El journal es de memoria; no se simuló un corte de energía. DeskGap compila, sin afirmar ejecución física en ese host. La revisión exhaustiva final de accesibilidad/rendimiento/seguridad sigue pendiente.

Etapa 8: hacer React predeterminado y usar su puerto habitual, desconectar Vue/extras del grafo distribuido y arranque, retirar browser.html y mensajes de implementación, y comprobar datos antiguos inertes y todos los consumidores. Conservar herramientas locales de Mundos, datos, identificadores de compatibilidad, proxy y actualizador. Microsoft permanece pospuesto. Producción beta.2 y PR4 en borrador se mantienen hasta pasar la etapa 9.
