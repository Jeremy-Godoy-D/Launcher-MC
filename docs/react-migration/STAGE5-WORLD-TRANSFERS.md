# Etapa 5 — importación y exportación legacy de Mundos

K11 sigue pendiente. `0ce2170015b307d50f1ddee29838397a9185f9bc` sustituye el extractor ZIP y las copias/exportaciones antiguas de importSave/exportSave por el protocolo revisado existente. No hay UI nueva ni dependencias nuevas.

Los ZIP reutilizan límites, validación de rutas/entradas/CRC, revisión de huella y conservación ante fallos del importador Native. Las carpetas externas se copian de forma independiente; se conservan nombres con puntos y se elige un sufijo ante colisiones, hasta 1000 intentos. Un nombre explícito inválido se rechaza en vez de sanear traversal silenciosamente. La copia parcial se conserva con su origen cuando falla, como en el flujo Native anterior.

Al habilitar un mundo directamente dentro del depósito propio se conserva el enlace, sujeto a identidad, instancia Java, sesiones y snapshots. La publicación como enlace es una opción interna del helper y del método privado; argumentos adicionales a applyWorldFiles desde renderer no la habilitan. Se rechazan fuentes enlazadas/ajenas y enlaces anidados al depósito. Una carpeta con prefijo textual parecido a saves se copia, nunca se considera compartida por startsWith. No se modifica metadata de proveedor al habilitar un mundo global.

Los IDs CurseForge de una importación se validan y entran en la huella revisada. Su sidecar se publica dentro del destino nuevo, con las guardas/locks existentes y reemplazo de hoja atómico; el ZIP/carpeta original no cambia. Se elimina la escritura posterior sin guardas. La actualización inmediata del estado legacy usa metadata acotada. Sus lecturas/watchers históricos aún necesitan auditoría, incluida la presentación de iconos/proveedor; no se presenta ese estado como la interfaz React, que usa getInstanceSaves.

La exportación lee instance/saves/nombre, corrigiendo la ruta antigua que omitía saves. Conserva ZIP y carpeta, vacíos y archivos ocultos, con archivos independientes. La carpeta usa el mismo snapshot/guardas de exportación; ante interrupción retiene el destino parcial. No mezcla ni reemplaza destinos ocupados, aun vacíos; el padre debe existir, estar fuera de datos/instancias y ZIP debe acabar en .zip. No se debilita la publicación exclusiva del ZIP ni se elimina contenido del usuario.

## Validación y límites

- Nueve regresiones nuevas entre servicio/helper. Grupo focal final: **71/6 archivos, 3,40 s**, cuatro workers; no se ejecuta una suite unitaria completa nueva. Incluye IDs inválidos/alterados tras revisar, importación con colisiones y prefijos parecidos, enlace propio, rechazo del flag por argumentos públicos, exportación real de saves y fallo de una escritura que ignora la revisión, con origen/destino parcial conservados.
- Tipos de Runtime, React y DeskGap aprobados; lint cero errores/mismo aviso previo de queryModUpdates. E2E mantiene **exactamente56 diagnósticos base, sin nuevos**. Una primera fixture introdujo22 al importar paquetes/backend directamente: se corrigió usando createRequire desde xmcl-runtime y pipeline Node como las fixtures existentes; no se cambia tsconfig ni se suprimen diagnósticos.
- React empaquetado, specs61/62/65/66/85: **19/19, 50,6 s**, un worker/cero reintentos. Cubre API revisada y legacy, metadatos/datapacks, ZIP/carpeta, nombres ocupados, validaciones y activación de mundo compartido con una **sesión real de la fixture Java NIO**. Después de liberar se habilita y retirar el enlace conserva el mundo del depósito. No Minecraft.
- **24 reportes Axe, cero violaciones/44 incomplete**, matrices en ambos tamaños/temas; no AA manual global. Capturas guardadas en el prefijo propio. Hay Buffer deprecated y avisos GPU state invalid al cerrar en los logs; no se afirma consola global limpia ni causa definitiva resuelta.
- Vue empaquetado, specs03/63/85: **9/9, 20,7 s**. Compilaciones Electron por host y DeskGap producción aprobadas; identidades main/ASAR/EXE conservadas. Ningún build junto a Native; dist queda Vue con paquetes independientes. DeskGap tiene tipos/build, no recorrido funcional Native. Nueve tests del harness aprobados y check al cerrar.

Comandos desde launcher: pnpm exec vitest run con los seis selectors afectados y --maxWorkers=4; checks por paquete; pnpm lint; E2E tsc comparado con la base de STAGE5-CONSOLE-ACTIONS; LAUNCHER_RENDERER=react|vue pnpm --prefix xmcl-electron-app build; Playwright con EXE del paquete, locale es-ES, --workers=1 --retries=0 --max-failures=1; NODE_ENV=production pnpm --prefix deskgap-app build. Harness desde raíz. Sin DevTools/CDP ni interceptación de spawn.

Manifest ignorado launcher/e2e/artifacts/stage5-world-transfer-manifest.json, SHA-256 `dabe5a9ffd124ce7aedf6fb0b53bf22e557fb0817bfee624a608af10abe831ae`: 6 fuentes Git canónicas y 130 artefactos propios, incluidos logs, Axe, capturas e identidades. Reparse points y salidas posteriores de PR/check excluidos.

CI41341682892/c2d3a55 terminó success; confirma el primer bloque de cinco writers legacy, no el nuevo código0ce2170. El CI nuevo queda pendiente tras push.

## Próximo trabajo

K11 conserva shareSave/linkSharedSave/unlinkSharedSave e instalación de datapacks de mercados, lectores/watchers/IPC legacy y aceptación integral/noNIO. Preservar linkSharedSave usado por creación React y sus preferencias. Reutilizar primitivas de guardas/snapshot/backup; evitar mutex reentrantes. El helper sharedResourcePacks solo admite resourcepacks/shaderpacks: no ampliarlo a saves sin resolver sus diferencias de sesiones, enlaces por mundo y contrato de desconexión (legacy deja carpeta local vacía). Las partidas y datos del depósito no se deben mover ni borrar al quitar un enlace.

K12/K21 pass; etapa5 activa y6–9 pendientes. Microsoft pospuesto, PR4 borrador, producción beta.2/proxy intactos. Juego real, seguridad/AA manual integral, rendimiento final e instalador/delta aislados pendientes antes de publicar. DOMPurify WIP y ANALISIS_ARQUITECTURA.md excluidos; restricciones de RESUME vigentes.
