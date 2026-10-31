# Etapa 5 parcial — revisión de cambios de dependencias

Aplicación y pruebas `f6e78e5`, 2026-10-27. Continúa DIAGNOSTICS; no cierra K08 ni gates5.

## Comportamiento

Al activar un mod, la propuesta incluye dependencias obligatorias instaladas/desactivadas cuando existe un único proveedor compatible. Recorre dependencias transitivas y ciclos sin repetir archivos, conserva alternativas/condiciones Quilt y no selecciona recomendaciones, exenciones ni proveedores ambiguos. No añade un proveedor que introduzca duplicados o incompatibilidades declaradas nuevas. Los requisitos aún sin resolver permanecen visibles para revisión; no se promete que el juego pueda arrancar.

Al desactivar, propone dependientes que perderían un requisito antes satisfecho y dependencias que no necesita ningún mod restante. Conserva dependencias compartidas y no propaga requisitos que ya estaban incumplidos. Si faltan metadatos o hay archivos/directorios sin interpretar, limita la propuesta a la selección explícita y lo explica.

Los cambios adicionales, avisos y requisitos desconocidos abren un diálogo con lista solicitada y lista de dependencias. Cancelar/Escape conserva bytes y devuelve foco. Abrirlo no instala, descarga, activa ni elimina archivos. Confirmar vuelve a comprobar proceso, revisión del store, huella nativa del inventario/configuración y SHA-1 de todos los archivos que cambiarían. Una revisión obsoleta deja el diálogo abierto con un error recuperable. Las operaciones simples sin cambios adicionales ni avisos conservan la acción directa.

El motor es puro y no cambia los modelos. La UI captura la instancia original e ignora resultados tras desmontarse; la operación nativa pendiente conserva esa ruta. Se reconocen errores locales y objetos de error serializados por su nombre, preservando el contrato de transporte existente. La retirada permanente continúa limitada a los archivos explícitamente confirmados y no elimina dependientes automáticamente.

## Validación

- **678 unitarias /76 archivos**,9 casos nuevos del planificador: transitividad/ciclos, proveedores ambiguos, versiones, incompatibilidades, requisitos opcionales, dependencias compartidas/huérfanas, condiciones Quilt y selección explícita ante datos incompletos. Tipos raíz y lint pasan; E2E conserva56 diagnósticos globales anteriores, ninguno en37.
- **93 React +1 Strict Mode +3 Vue =97 escenarios distintos**, con recompilación de ambos renderers y dist/default Vue restaurados. Focal15/15 en57,2s; no se suman las repeticiones al total. React5,0min; Strict4,1s; Vue18,4s. 115 auditorías Axe sin violaciones y194 incomplete;176 PNG React por test y210 incluyendo la focal. Fuentes y hashes en el JSON adjunto.
- JAR reales de fixtures por parser/servicio nativo: cancelar sin cambios, activar y desactivar un cierre transitivo, mantener bytes, rechazar cambios posteriores de archivos o loader y conservar la revisión ante error. La navegación Atrás permite desmontar el área durante una operación nativa pendiente sin afectar a la instancia siguiente.
- Claro/oscuro,1200×720/800×400, nombres de archivo largos, scroll con teclado, Escape/retorno de foco y acciones visibles. Revisadas las capturas oscura1200 y clara800. Axe no equivale a certificación manual AA.

La primera focal13/15 detectó un intento del test de navegar detrás de un diálogo ocupado y el manejo incorrecto de un error Native serializado como objeto. Se adaptó la navegación Atrás real y se corrigió la lectura del nombre de error. La repetición focal y la suite completa pasan sin quitar las comprobaciones de archivos.

## Hallazgo CI anterior

CI40610051490 sobre `c5f9df9` terminó con Vue aprobado y React89/90: el caso de medios comprobaba reanudación antes de terminar el retorno de foco de Radix. Los snapshots inicial y de reintento muestran activo «Opciones de Mi mundo», para el que la política exige pausa; el vídeo permanecía pausado correctamente. El test ahora espera cierre y retorno de foco antes de moverlo a la barra lateral. Conserva todas las aserciones de reproducción, scroll, diálogo, minimizar/restaurar y rendimiento. Tres repeticiones locales pasan en11,5s; se exige CI nuevo del siguiente push y se conserva la evidencia del fallo anterior.

## Pendiente

Actualización de contenido con proveedores/manifiestos, packs/shaders, mundos, ajustes/consola y etapas6–9. Las propuestas evalúan metadatos de archivos instalados; Java efectivo, contenido extenso, juego real, fallos de instalación, NSIS/delta, seguridad/accesibilidad finales y presupuestos de rendimiento aún requieren sus recorridos. La huella estadística/configuración y los hashes seleccionados no constituyen una transacción de todo el lote frente a fallos IO, procesos externos o pérdida de energía; un fallo parcial exige volver a leer y revisar el estado. Microsoft pospuesto; datos, proxy, secretos y producción conservados.

CI posterior40612683266 sobre0d3ae7e aprobó ambos renderers, incluida la sincronización de foco corregida. Este resultado corresponde a fuente f6e78e5; los cambios siguientes requieren su propia validación.
