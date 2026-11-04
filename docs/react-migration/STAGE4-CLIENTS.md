# Etapa 4 parcial — clientes importados aislados

Código `ba7c769ce1ddb81b0a025dbfa33ac88a93e46ca5`, 2026-10-25. K03 incorpora clientes modificados y alias locales de Vanilla y Prism standalone completo. Etapa 4 y sus tres gates siguen pendientes. Este bloque amplía STAGE4-VANILLA y STAGE4-PRISM; sus límites históricos sobre clientes modificados quedan sustituidos por los descritos aquí. Vue continúa predeterminado y producción no cambia.

## Comportamiento y conservación de datos

`ResolvedVersion.clientJar` es una referencia opcional al ID del cliente. El parser la obtiene del campo `jar` del JSON y rechaza rutas, controles, dispositivos Windows e identificadores inválidos. La versión Minecraft conserva su identidad para Java, loaders y diagnóstico; los argumentos existentes mantienen su significado. Sin referencia explícita se conserva la ubicación anterior. Las rutas del servidor permanecen iguales.

Al confirmar una importación, el cliente se publica en `versions/.client-<hash>/.client-<hash>.jar`. Los bytes locales usan un identificador derivado de SHA-256; los clientes remotos sin caché usan el SHA-1 declarado. Estos directorios solo contienen el JAR y el filtro existente de versiones ignora los nombres que empiezan por punto. Dos clientes locales iguales reutilizan su ubicación; un destino con bytes distintos bloquea la publicación. No se sobrescribe el cliente Vanilla instalado.

La revisión sigue sin escribir archivos. Se recorren los alias dentro del origen elegido, con comprobaciones de ruta/enlaces, ciclos y límites de metadatos. Al confirmar se repite la inspección y se comprueba la huella que incluye el cliente. Los hashes/tamaños declarados se verifican contra la copia local. La definición de la versión importada apunta a esa caché privada; los JSON de herencia conservan sus IDs aislados. Prism también puede localizar el cliente cacheado en su raíz de versiones o bibliotecas, sin incorporar comandos, cuentas ni Java personal del launcher de origen.

Lanzamiento, prechequeo, diagnóstico/reparación y lectura de avances/recursos usan la referencia aislada. El instalador conserva verificación de hash y ZIP: un cliente válido ya cacheado no necesita descarga. Un cliente exclusivamente local se guarda con URL vacía y sin alternativas remotas; perder esa caché requiere volver a importar el origen. No se reemplaza por el cliente oficial. Si existe una URL declarada, la reparación tiene como destino el cliente aislado.

Se reutilizan `readImportFile`, `writeImmutableImportFiles` y `persistMmcStandaloneVersion`, sin dependencias nuevas ni cambios globales de compilación/lint. Las anotaciones de lint de tres guards documentan su rechazo deliberado de caracteres de control; no eliminan esa validación. Se mantienen los límites anteriores del grafo Vanilla y Prism y la publicación exclusiva que conserva archivos distintos.

## Validación

- 394 pruebas unitarias en 42 archivos, 12,69 s: conjunto ampliado con resolución de alias, classpath, integridad, cliente local sin URL, reparación/servidor, importación y lectura de avances. El instalador ejecuta un manifiesto sobre un ZIP sintético válido y verifica que no descarga de nuevo el cliente.
- Regresión final: 31 escenarios Electron React, uno Strict Mode y dos Vue: **34 escenarios distintos** sobre los ejecutables empaquetados. Los cinco del área, un recorrido de lanzamiento aislado y dos repeticiones posteriores con foco explícito son escenarios solapados, no adicionales.
- Spec 17 importa Vanilla y Prism con un JAR modificado y un cliente oficial ya presente. Verifica bytes originales intactos, cliente privado, hash, Minecraft resuelto, persistencia tras recarga y generación nativa de argumentos con el JAR correcto. No se ejecuta el sustituto de Java ni el JAR de prueba. Los orígenes y mundos usados son temporales.
- Dos ejecuciones iniciales de la suite terminaron con 30 aprobados/1 fallo: timeout de actionability al pulsar la instancia lateral en spec 12. El recorrido aislado pasó. Se añadió registro del foco previo y restauración/verificación explícita del foco nativo y del renderer antes de ese clic, sin `force`, quitar aserciones ni ampliar timeouts. La regresión final pasó. Los registros iniciales se conservan; no se afirma una causa raíz demostrada. El registro final de foco previo ya mostraba ambos focos activos.
- `pnpm check`, `pnpm lint` sin avisos/errores, nueve pruebas del harness y comprobación de integridad. Builds de renderer y host Windows React/Vue; `dist` termina en Vue. Workflow ampliado, todavía no ejecutado en GitHub.
- Las pantallas existentes conservan sus comprobaciones claro/oscuro en 1200×720 y 800×400. Las capturas nuevas muestran la confirmación sin alterar la distribución aprobada. Los resultados Axe y sus incompletos se registran en STAGE4-CLIENTS.json; no equivalen a certificación manual AA/RTL. No se conectó DevTools CLI/CDP.

Comandos desde `launcher`: conjunto Vitest de `.github/workflows/react-migration.yml`, `pnpm check`, `pnpm lint`, `LAUNCHER_RENDERER=react pnpm build:renderer` y `pnpm --prefix xmcl-electron-app build`; specs 01/02/05/06/07/09/10/11/12/13/14/15/16/17 con `XMCL_E2E_EXECUTABLE` apuntando al paquete React y locale es-ES. Spec 04 con `XMCL_REACT_CLIENT_HARNESS=1`. Build renderer/host Vue y specs 03/08 sobre su EXE. Desde raíz: `node --test launcher/scripts/react-migration.test.mjs` y `node launcher/scripts/react-migration.mjs check`.

STAGE4-CLIENTS.json identifica el commit, los SHA-256 de sus 20 archivos Git y los artefactos ignorados. Incluye logs, resultados de accesibilidad, registro de foco, capturas propias y trazas de los fallos iniciales. Las nuevas capturas están conservadas en `launcher/e2e/artifacts/client-verified/visual`.

## Límites y siguiente acción

K03 continúa parcial: falta Prism con metadatos base incompletos y comprobar el resto de su paridad. Este bloque no reconstruye padres personalizados ausentes ni convierte cualquier parche incompleto en una versión ejecutable. Después siguen K02/K04: editar, duplicar, agrupar, ordenar, exportar y eliminar con confirmación; además de los restantes criterios de etapa 4. No se vuelve a implementar lo ya cubierto por Vanilla/herencia ni el aislamiento de clientes.

No se probaron descarga real de Java/cliente, partida Minecraft/loaders, instalador NSIS, actualización/delta aislada, firma, publicación ni rendimiento de 60 s. La publicación exclusiva se ha validado en Windows/NTFS; otras plataformas/sistemas de archivos no. Una creación posterior fallida puede dejar caché reutilizable: no hay rollback destructivo. Cerrar el diálogo ignora respuestas obsoletas pero no cancela lecturas nativas iniciadas. El control de foco añade evidencia y una preparación explícita del entorno de prueba; los dos fallos iniciales quedan documentados como límite de estabilidad.

Microsoft sigue pospuesto; datos, identidades técnicas, proxy y diseño Grimo/cobre se conservan. `ANALISIS_ARQUITECTURA.md` permanece intacto.
