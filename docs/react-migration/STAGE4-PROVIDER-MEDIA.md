# Etapa4 — galerías propias y caché de presentación

Fuente: `80c8f3b3489d96995953b52153b91d73df7aa90e`. Etapa4 continúa activa; este bloque no publica una versión.

Inicio y el fondo de la ventana resuelven las imágenes desde el ID/upstream de la instancia Java registrada. Modrinth prioriza la imagen original destacada, su alternativa optimizada y la galería; CurseForge usa las capturas del proyecto correcto, juego432/clase4471. El icono local conserva su papel de identidad. No se buscaron imágenes de packs fuera de sus metadatos ni se añadieron recursos de packs a los assets distribuidos.

El nuevo servicio nativo reutiliza los clientes existentes. Las consultas públicas de Modrinth no adquieren cuentas; CurseForge sigue exclusivamente a través del Worker, sin claves ni credenciales en el renderer. La presentación pide solo el fondo actual, sin descargar las galerías de las1000 instancias de la prueba de virtualización. Las respuestas atrasadas se descartan sin escribir la selección del carrusel.

## Caché y límites comprobados

`presentation-cache-v1`, dentro del appData técnico existente: máximo50MiB con expulsión LRU, incluidos archivos propios de metadatos y temporales atómicos reconocidos. Imágenes de8MiB máximo y metadatos de2MiB, lectura acotada tanto de red como de disco, plazo de red15s y hasta3 candidatos. Solo HTTPS y los CDN exactos admitidos; se validan también las redirecciones. MIME, firma y SHA-256 del contenido protegen la lectura de entradas; se conserva la última portada válida sin conexión.

Los pósteres ambientales son PNG/JPEG/WebP estáticos; GIF y WebP animado no eluden las pausas de movimiento mediante el fondo. Una firma válida no equivale a una decodificación completa: la prueba del PNG truncado comprueba el fallback en Chromium y su etiqueta Vanilla. Los fallos de permisos/cuota/metadatos no bloquean los controles de Inicio. La API de limpieza conserva un archivo ajeno colocado en la carpeta y no recibe rutas de instancias/mods/mundos para borrar. Su botón de Ajustes pertenece a etapa7.

## Evidencia ejecutada

- 569 pruebas unitarias/60 archivos, incluidas26 nuevas de medios;13,61s en el cierre.
- 57 escenarios React empaquetados en3,4min;1 de StrictMode en4,4s;2 Vue en9,9s;3 de proveedores públicos en6,6s:63 distintos. Los recorridos de diagnóstico y la repetición de6 casos se solapan y no aumentan esa cifra.
- Tipos/lint de raíz y chequeos finales afectados aprobados; DeskGap pasa tipos y bundle de producción, sin afirmar ejecución física.9 pruebas del harness y comprobación de integridad aprobadas.
- 87 informes Axe:0 violaciones y154 incompletos; no certificación manual AA. Cuatro capturas revisadas en ambos temas y1200×720/800×400. Detector de fuentes UI sin hallazgos.
- React y Vue reconstruidos de forma secuencial por salida; el `dist` compartido final corresponde a Vue. Los hashes de ejecutables/ASAR, fuentes y artefactos ignorados están en [el informe JSON](STAGE4-PROVIDER-MEDIA.json).

Las pruebas públicas usan galerías reales del proyecto Modrinth `1KVo5zza` y CurseForge `925200`, sin instalar sus modpacks ni abrir cuentas. Modrinth entrega el PNG original de2363264bytes; CurseForge, una captura de1065103bytes. El primer intento había supuesto incorrectamente que `285109` tenía galería: su respuesta200 tiene0 capturas. Se conservó como caso de fallback y se añadió un proyecto con capturas propias; los tres casos finales pasan. No se debilitó el resolvedor para convertir esa ausencia en una imagen del pack.

El CI del bloque anterior, [40339662076](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/40339662076), pasó React y Vue. Este código requiere comprobar su propio CI tras el push.

## Criterios pendientes y siguiente trabajo concreto

No cerrar las gates de Inicio/Biblioteca. Falta completar los tres clips autorizados Overworld/Nether/End, precargar solo el siguiente póster, presentar vídeo Vanilla genérico junto a la portada propia con etiqueta correcta y medir60s de CPU/GPU/memoria/arranque. No hay evidencia aquí de juego/Java reales, instalador/actualización aislados o revisión AA/RTL completa; etapas5–9 siguen pendientes y Microsoft pospuesto.

El cruce con Vue encontró una diferencia verificable de K02: `LauncherLibrary.vue` busca nombre, Minecraft y loader/versión después de trim, mientras `App.tsx` solo busca nombre. Corregir esa búsqueda con una regresión reproducible, sin rehacer iconos/cuentas/copia/virtualización/caché. Después revisar la copia de `modsGrouping` del menú anterior al duplicar/reanudar; actualizar contenido corresponde a K16/etapa6 y los argumentos/resolución/servidor a K12/etapa5. Mantener sus datos existentes.
