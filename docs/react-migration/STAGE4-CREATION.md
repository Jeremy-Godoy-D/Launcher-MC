# Etapa 4 — crear instancias e importar modpacks locales

Código: `0fed2fca9238dc7a77036391ce41d1f4d7433a33`, Windows, 2026-10-25. **Bloque verificado, etapa 4 todavía parcial y sus tres criterios abiertos.** Se conectan las acciones de creación desde Biblioteca, sus vacíos y el final del onboarding. No se cambia Vue como renderer predeterminado ni se publica una versión.

## Qué funciona

Añadir instancia abre un diálogo con Nueva instancia e Importar modpack. La creación manual permite elegir Minecraft Java y Vanilla, Fabric, Forge, NeoForge, Quilt, OptiFine o LabyMod. Los metadatos pasan por VersionMetadataService, con comprobación de compatibilidad, exclusión inicial de snapshots/versiones antiguas, reintento explícito y versiones locales como alternativa cuando existen. No hay versiones remotas inventadas en producto. Los nombres se normalizan, validan y comprueban contra las instancias existentes; los campos se conservan al cancelar o fallar. Crear guarda la configuración mediante InstanceService: no instala automáticamente el runtime ni inicia Minecraft.

La importación elige un .mrpack/.zip mediante el selector nativo y consume el ModpackState real de openModpack. Muestra nombre, Minecraft y archivos antes de confirmar. La confirmación crea una instancia nueva y prepara/aplica sus archivos mediante InstanceInstallService. No se pasa una instancia existente como destino. Se guarda el manifiesto pendiente antes de aplicar; el controlador conserva la ruta confirmada y, si falla, reanuda antes de volver a aplicar. No crea otra carpeta al reintentar desde ese formulario. Conservar y cerrar mantiene archivos y sesión del formulario durante la vida de la ventana. El estado, progreso y cancelación disponible pasan por los stores/servicios existentes.

Ver instancia selecciona la ruta confirmada y abre su área. La selección ahora consulta el snapshot actual del store, evitando una copia React anterior a la mutación recién confirmada. El carrusel no cambia esa selección y se pausa durante el diálogo. La capa de estado sigue usando snapshots compartidos, sin nuevo IPC desde componentes.

La última etapa del onboarding ofrece Biblioteca, Crear o Importar. Primero se valida/confirma la raíz nativa; solo después se abre la acción elegida. El parámetro temporal de ruta se consume una vez. Por defecto conserva Ir a la biblioteca y no crea ni lanza nada al montar.

## Seguridad y conservación

- Las opciones importadas usan un esquema existente y una lista de campos permitidos: identidad Java/runtime/versión, autor/descripción y upstream público CurseForge/Modrinth cuando existe. No copia ruta de destino, Java ejecutable, comandos previos, argumentos JVM/juego, entorno, flags de autenticación ni ajustes arbitrarios del archivo xmcl.json.
- Identificadores de versión y nombres no aceptan rutas, controles ni nombres reservados. Los archivos rechazan traversal, rutas absolutas/UNC, controles, destinos de instalación internos, instance.json y colisiones de mayúsculas/minúsculas antes de crear. El motor nativo mantiene sus propias comprobaciones, hashes, backups, manifestación y contención de rutas; no se sustituyen por validación de UI.
- Los metadatos del archivo se normalizan antes de renderizarlos; un objeto o campo malformado no se imprime como un nodo React. Un archivo corrupto, no Java o con destinos peligrosos bloquea la confirmación.
- La operación impide doble envío y cierre accidental mientras trabaja. Un error conserva la ruta ya confirmada; nunca elimina archivos para ocultar el fallo. Los imports crean una carpeta nueva, sin aplicar preferencias de enlaces compartidos de creación manual.
- Los servicios y puentes permanecen tipados. No se añade un secreto, credencial, bypass del proxy ni cambio del actualizador. Microsoft sigue pospuesto; no se migran funciones de autor, Bedrock ni extras.

## Diseño y accesibilidad

Se reutilizan el diálogo Radix, botones/tokens y cristal aprobados. Cabecera y acciones quedan fuera del cuerpo desplazable, también en 800×400. El margen del cuerpo permite ver el anillo de foco completo. El foco inicia en el nombre o una acción habilitada al retomar una importación, queda confinado y vuelve al disparador o al título del destino. Escape cancela cuando no hay trabajo activo. Las etiquetas, validación y mensajes de estado están disponibles en español/inglés; las acciones vacías ya son funcionales.

Inspección visual de capturas: creación oscuro1200/claro800 y opción Importar del onboarding800. Conservan el fondo global/cristal, botones alcanzables y desplazamiento; no se detectó scroll horizontal en las comprobaciones. El detector de diseño de AddInstance/creation.css/Onboarding no devolvió hallazgos. La auditoría AA/RTL manual completa sigue pendiente.

## Validación ejecutada

Comandos desde launcher salvo harness desde raíz. STAGE4-CREATION.json fija hashes de los blobs Git del código y de los artefactos ignorados.

| Comando / recorrido | Resultado |
| --- | --- |
| `pnpm check`, check React final y `pnpm lint` | Aprobados; cero avisos/errores de lint. |
| `pnpm exec vitest run scripts/renderer.test.ts xmcl-react-ui/src packages/renderer-client xmcl-runtime/service/ServiceStateContainer.test.ts xmcl-runtime/service/ServiceStateManager.test.ts xmcl-runtime/user/UserService.persistence.test.ts xmcl-runtime/setup/bootstrapSession.test.ts xmcl-electron-app/main/utils/bootstrapSender.test.ts xmcl-keystone-ui/src/util/instanceName.test.ts packages/instance/files_handler.test.ts xmcl-runtime/instanceIO/InstanceInstallService.progressive.test.ts xmcl-runtime/instanceIO/InstanceInstallService.concurrent.test.ts` | **151 aprobadas, 20 archivos, 12,19 s**. Incluye reutilización del validador, filtro de configuración, identificadores/rutas, doble envío, staging/reanudación, integridad y concurrencia del motor. |
| Renderer y paquete Windows x64 React | Aprobados. Paquete local propio; no publicación ni instalador sobre el perfil habitual. |
| Ejecutable React, specs01/02/05/06/07/09/10/11 | **16 aprobadas, 44,1 s**. La ejecución final usa `--output=artifacts/react-creation-confirmed` para conservar sus reportes al ejecutar otras suites. |
| Harness de desarrollo Strict Mode, spec04 | **1 aprobada, 4,1 s**. 12 efectos/12 limpiezas; snapshots idénticos;0 suscripciones/listeners/polls activos al acabar; máximo1 poll simultáneo. |
| Host Vue recompilado, specs03/08 | **2 aprobadas, 9,4 s**. Compatibilidad de instancias/perfiles y onboarding anterior. |
| Harness de migración y su check | **9 pruebas aprobadas**, integridad correcta. |
| Workflow Windows de migración | Nuevas specs y pruebas de dominio añadidas; YAML válido. No ejecutado en GitHub. |

La spec10 fuerza un fallo de metadatos, valida/corrige un nombre, comprueba cuatro combinaciones de tamaño/apariencia y crea siete instancias a través de la UI. Comprueba su runtime/edición en disco, persistencia tras recargar y siete llamadas nativas incluso con doble clic. Sus metadatos de proveedores son **sintéticos en el proceso de pruebas**; la creación/persistencia es nativa. No equivale a instalar o ejecutar cada loader desde sus servidores.

Otra prueba genera un archivo mrpack real con un override y configuración de arranque no confiable; lo revisa sin crear nada y confirma después. Interrumpe apply antes del trabajo nativo, comprueba el manifiesto pendiente, cierra/reabre el formulario y reintenta sobre una única carpeta. El override termina con los bytes esperados, el marcador exterior se conserva y los comandos/Java/argumentos del pack no se aplican. Un tercer caso rechaza ZIP corrupto y un manifiesto con traversal antes de cualquier createInstance. Los errores inyectados se esperan en el log; no hay pageerror inesperado en los recorridos que los registran.

La spec11 comprueba las dos alternativas nuevas del onboarding en el mínimo: raíz confirmada antes de abrir el diálogo, Crear solo tras otra confirmación explícita, Importar sin archivo bloqueado, foco al cancelar y cero procesos de juego. Las regresiones restantes cubren biblioteca, cuentas, preferencias, pausas de vídeo, consola de renderer y superficies anteriores.

Los reportes Axe retenidos suman **28 comprobaciones,0 violaciones y36 entradas incomplete**; las cuatro comprobaciones nuevas de creación aportan12 incomplete. No son una certificación manual AA. La primera ejecución falló por contraste del control activo; se reutilizaron los botones primarios existentes y se verificó la apariencia real mediante ajustes, con movimiento reducido para la auditoría. Otra expectativa de fixture omitía el sufijo de versión que añade el parser antiguo: ahora la prueba elige explícitamente el nombre antes de confirmar. La segunda ejecución pasó los tres casos nuevos; después se verificó la ejecución final completa con las correcciones de foco/identificadores/onboarding.

## Lo que sigue pendiente

Conectar el lanzamiento completo: disponibilidad física, perfil capturado, Java/RAM, resolución de versión/diagnósticos, instalación/reparación, generateLaunchOptionsWithGlobal y seguimiento de procesos. Incluir recuperación de manifiestos pendientes después de reiniciar la ventana; la sesión de formulario actual conserva su identidad al cerrar/reabrir el diálogo, no tras destruir la ventana. Mostrar pendientes/errores sin afirmar listo para jugar.

K03 aún requiere importación por URL/carpeta y opciones avanzadas, incluidas las preferencias antiguas de enlaces compartidos para creación manual. Al retirar Vue en etapa8, extraer el helper puro instanceName actualmente reutilizado desde su carpeta; no lleva Vue a React. La galería/identidad visual completa del pack, caché, pausa al jugar y rendimiento60s continúan pendientes. No se descargaron/ejecutaron Minecraft o loaders, ni se ejecutaron instalador/delta en Windows aislado o DeskGap nativo. Edición/apariencia de perfiles y los demás criterios del plan permanecen abiertos.
