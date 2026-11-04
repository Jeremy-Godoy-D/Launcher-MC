# Etapa 5 — conservación al retirar y eliminar instancias

K11 permanece pendiente. Fuentes de aplicación: `8c5391a559eaf0d0ab8d044749ab02cc866a3116`; fixtures corregidas y ambos paquetes finales: `c97d57f` (SHA completo en el manifest y las identidades). No cambia la producción `v0.2.0-beta.2` ni se prepara una publicación.

## Comportamiento

- La eliminación de una instancia Java administrada reutiliza las operaciones verificadas de Mundos. Las copias del depósito son independientes; se respetan nombres ocupados y se conserva el árbol original completo. Notas y carpetas que no contienen `level.dat` permanecen en el respaldo, sin tratarlas como mundos jugables.
- Antes de eliminar la instancia se aparta su carpeta `.backups` completa a `.backups/instance-removal-*/previous` del directorio de datos. Incluye los originales conservados al compartir mundos y los respaldos anteriores. No se borran copias para simular una reversión.
- Se comprueban registro Java, raíz administrada canónica e identidad del directorio antes de escribir y después de los handlers de retirada. Se conservan la cancelación de instalaciones pendientes y el orden de adquisición del mutex de instancia.
- La guarda del servicio de Mundos es una capacidad Symbol del backend; no tiene método RPC de cadena. El antiguo `moveSavesToShared` se elimina, evitando un acceso sin sus comprobaciones. Los archivos de instancias externas y de ediciones retiradas se conservan al desregistrarlas; se retira el desinstalador PowerShell de Bedrock.
- El mutex global se intenta adquirir sin esperar bajo el mutex de instancia. Si otro escritor está activo, la operación falla antes de mutar con `WorldOperationBusyError`, evitando una espera circular. Se mantienen los controles de partidas y sesiones Java externas, también al retirar sin borrar archivos.
- Los observadores propios de mundos y datapacks se pausan antes de renombrar o eliminar. Tras el éxito vacían su estado y se cierran; ante un fallo se restablecen. EBUSY/EPERM/EACCES/EIO no se confunden con una eliminación terminada. ENOENT solo permite retirar el registro si se confirma que la raíz ya no existe.
- React conserva la confirmación ante un fallo y ofrece un mensaje fijo de espera/reintento cuando hay contención. No muestra el error remoto crudo. No se modificaron estilos ni la distribución aprobada.

Una eliminación parcial del resto de archivos puede fallar: en ese caso se conserva el registro en la sesión y los mundos ya están fuera del árbol eliminado. La prueba verifica el reintento en esa misma sesión; no acredita recuperar toda la instancia parcialmente borrada después de reiniciar. Los respaldos y las copias necesitan espacio adicional.

## Validación

- **1.365 unitarias / 133 archivos**, ejecución final independiente con cuatro workers, 36,73 s. Incluye 85 focales del borrado, operaciones, carrera de instalación, guardas y API heredada. Tipos Runtime, React y DeskGap aprobados; lint sin errores y un aviso previo de expresiones regulares.
- E2E tsc conserva exactamente **56 diagnósticos base**, comparados normalizando posiciones; no se declara tsc verde. Nueve pruebas del harness aprobadas.
- Paquete React final c97d57f: **16 escenarios** de 80/85/90, 48,4 s. Paquete Vue del mismo commit: **16 aprobados y uno omitido**, 54,9 s, de 03/80/85/90. La omisión es exclusivamente el diálogo React; las cuatro operaciones Native nuevas se prueban con ambos renderers. Un worker y cero reintentos.
- Se comprobaron colisiones, copias con inodes distintos, notas y carpetas adicionales, respaldos previos, observadores activos, sesiones NIO externas, enlaces ajenos, métodos RPC retirados, un archivo abierto con bloqueo real de Windows y recuperación después de liberarlo. El test 80 compila y ejecuta únicamente una clase Java propia para verificar sus pipes; no es una partida de Minecraft.
- **Cuatro evaluaciones Axe, cero violaciones y ocho incomplete**: claro/oscuro y 1200×720/800×400. Se comprueban mensaje, confirmación visible, ausencia de scroll horizontal, conservación del registro y reintento. Inspección manual de la captura clara mínima: acciones accesibles y cuerpo desplazable. No constituye una revisión AA manual global.
- Build DeskGap de producción aprobado; no se hizo un recorrido funcional DeskGap. Vue permanece como renderer del host y los paquetes están separados; se verifican hashes de EXE, ASAR y HTML. Los avisos GPU al cerrar, Buffer y errores esperados de pruebas negativas quedan en los logs; no se declara una consola global sin errores.

Comandos desde `launcher`: Vitest con los selectores de `.github/workflows/react-migration.yml` y `--maxWorkers=4 --reporter=dot`; checks Runtime/React/DeskGap; `pnpm lint`; E2E `tsc --noEmit` y comparación normalizada. Para **cada renderer**, `LAUNCHER_RENDERER=react|vue pnpm build:renderer` precede a `pnpm --prefix xmcl-electron-app build`. Playwright usa el EXE correspondiente, `XMCL_E2E_LOCALES=es-ES`, los specs anteriores y `--workers=1 --retries=0 --max-failures=1 --reporter=line`. DeskGap usa `NODE_ENV=production` y renderer Vue. Native, builds y suite final se ejecutaron secuencialmente. Desde raíz: pruebas y check del harness.

## Fallos encontrados durante esta validación

La fixture inicial lanzaba un Error desde el handler IPC en vez de devolver el sobre `{ error }` que utiliza el servicio. Se corrigió y se añadió una comprobación explícita del nombre recibido por el renderer. No se alteró el contrato del producto para satisfacerla.

El primer empaquetado reutilizó el renderer compilado anterior: el nuevo backend pasaba sus pruebas, pero faltaba el nuevo mensaje visual. Ese ejecutable no se usa como cierre de UI. Se recompilaron renderer y paquete, se registraron sus nuevas identidades y la suite final pasó conservando sus aserciones. La evidencia incluye también esos fallos, sin contarlos como aceptación.

CI `41388102938` / `0645052` terminó en failure: Vue pasó 35 escenarios y falló al compilar la clase propia de 80; React fue cancelado por fail-fast de la matriz. El log no identifica señal ni código del compilador. La preparación ahora compila antes de abrir Electron, mantiene los 15 s y añade diagnóstico acotado de código/señal/stderr. Pasó localmente en ambos paquetes; falta confirmar el nuevo CI. No se afirma una causa de timeout demostrada ni se aumenta el límite.

## Pendientes

Aviso y reintento visibles de la migración heredada bloqueada; aceptación integral/noNIO y paridad de compartir/activar mundos desde React, incluidos los mensajes de sesiones compartidas. Todas las herramientas locales y los chunks permanecen en alcance. K12/K21 pass; etapa 5 activa; 6–9 pendientes. Microsoft pospuesto.

Instalador y actualización aislados, partida real, rendimiento final, revisión integral de seguridad y accesibilidad siguen pendientes antes de publicar `v0.3.0-beta.1`. DOMPurify WIP y `ANALISIS_ARQUITECTURA.md` se conservaron y excluyeron de los commits. Manifest y evidencia permanecen en artefactos ignorados; su identidad se registra en `state.json` y en el punto de reanudación.

Manifest: `launcher/e2e/artifacts/stage5-instance-removal-manifest.json`, SHA-256 `4916e9cb8b183a50fc2cf94784ea9e2c5d3da9d16eca6f974da4daed5c2d77cc`; 11 fuentes y 132 artefactos.
