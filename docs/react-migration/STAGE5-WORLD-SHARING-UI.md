# Cierre de Mundos y de la etapa 5

Aplicación React `2f9c9e8`, pruebas adicionales de protección `bdda898`. Este bloque conecta la interfaz a los servicios existentes; no modifica el backend de mundos. Producción beta.2 y proxy intactos.

## Funciones y aceptación K11

| Requisito | Evidencia conservada o nueva |
| --- | --- |
| Lectura, iconos, errores y aislamiento | STAGE5-WORLD-METADATA-READERS, STAGE5-WORLD-IDENTITIES; specs61/88. |
| Copiar/exportar/retirar/importar/editar y respaldos | STAGE5-WORLD-OPERATIONS, WORLD-IMPORT, WORLD-METADATA, WORLD-TRANSFERS; specs62/64/65/85. |
| Datapacks locales y proveedores | STAGE5-WORLD-DATAPACKS, WORLD-MARKET, DATAPACK-READERS; specs66/86/87. Catálogo de descubrimiento pertenece a6. |
| Progreso, mapa, dimensiones, regiones y editar/copiar/pegar/eliminar chunks | STAGE5-WORLD-TOOLS, CHUNK-REVIEW, CHUNK-SAFETY, PROGRESS-READERS y SESSION-LOCK; specs67/70/71/72/73. |
| Compartir/activar y carpeta común desde React | Nuevo spec92: seis acciones reales con confirmación, colisiones, accesos, copias, origen/respaldo y desconexión sin borrar el depósito. Incluye retirada común con nombre escrito. |
| Migración anterior y borrado de instancia | WORLD-INITIALIZATION, INSTANCE-REMOVAL y WORLD-RECOVERY; specs89/90/91. |
| Sesiones externas y falta de protección Native | SESSION-LOCK/spec73; nuevo92 retiene un mundo con una sesión Java externa y permite reintentar. Dos tests nuevos verifican rechazo antes de publicar y bytes de región intactos si no hay guarda disponible. |
| Teclado, confirmaciones, claro/oscuro y ambos tamaños | Nuevo92: cancelación, retorno de foco, nombre largo, cuatro Axe sin violaciones/ocho incomplete y captura clara mínima revisada. Scroll real, acciones visibles y sin scroll horizontal. No AA manual global. |

La biblioteca común es local a este equipo; no reactiva P2P. Usar la carpeta común afecta a instancias conectadas; separarla crea una carpeta local vacía y conserva el depósito. Los textos explican el destino y los efectos antes de confirmar. Los servicios mantienen sus revisiones internas, sesiones, autoridad y respaldos. El diálogo captura la instancia y no retargetea una operación al navegar.

## Validación acotada al cambio

- **163 pruebas React /17 archivos** y **29 pruebas de archivos/chunks /2 archivos**, incluidas las dos guardas de publicación nuevas. Se conserva el resultado completo1372/134 del bloque anterior: no se repite una suite completa por cambios de UI y pruebas sin cambios del backend. El nuevo CI ejecutará1374; no se afirma que ese total haya pasado localmente.
- **Cinco Native React**, specs91/92,17,1s, un worker/cero reintentos: recuperación heredada y los tres escenarios nuevos de compartir. Incluye los seis flujos, hashes de mundos locales y ocupados, enlaces, carpeta compartida/separada, eliminación confirmada, sesión externa y accesibilidad.
- Tipos React aprobados y E2E56 diagnósticos base; lint sin errores/un aviso previo. Registro de129 IDs React generado. Vue del host restaurado con su renderer existente; no se repitió la suite Vue porque no cambió su interfaz ni el backend. La compatibilidad anterior ya está confirmada por CI84b44b7:1372 unitarias y41 Native Vue/2skip.
- Los tests adicionales comprueban ausencia de publicación y conservación de bytes; entrar en el helper que revisa la operación no equivale a haber escrito. No se cambia código de producto para satisfacer esa comprobación.

Comandos desde launcher: `pnpm exec vitest run xmcl-react-ui/src --maxWorkers=4 --reporter=dot`; focal InstanceSavesService.files/chunks; check React,lint,E2E tsc; gen:testids con rendererReact; build:renderer y build Electron React; Playwright91/92 con EXE propio,es-ES,workers1,retries0,max-failures1. Para restaurar hostVue se reutiliza su dist válido y solo se empaqueta el host. No se ejecutó partida Minecraft ni instalador/actualización; permanecen en9.

K11 se acepta con la evidencia acumulada anterior y estas funciones restantes. K12/K21 ya estaban aceptados. Etapa5 completa; siguiente6: catálogo real, fichas e instalación/actualización pública con los clientes y servicios existentes. La revisión global de seguridad/distribución, extras, rendimiento final y publicación permanecen en sus gates7–9. Microsoft pospuesto; DOMPurify WIP se revisará en6; ANALISIS_ARQUITECTURA preservado.

Manifest ignorado `stage5-world-sharing-ui-manifest.json`, SHA-256 `48cdb78814b68358a444f66202e6d6c208393f513a82d40b727060d04e10dfed`; 10 fuentes/47 artefactos.
