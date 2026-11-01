# Ajustes: argumentos exactos y lista vacía explícita

Fuente `f2220b530af38c6baeb88808571e3327e18e5c24`. Etapa 5 activa; K12 sigue pendiente por los demás criterios de ajustes. Este bloque corrige la pérdida de límites de argumentos al editar o guardar una instancia.

## Comportamiento

El formulario conservaba vmOptions/mcOptions como un texto unido por espacios y luego lo dividía por espacios al guardar. Una ruta como `C:\Games with spaces\Java`, una comilla literal, un salto de línea o un argumento vacío cambiaban incluso al guardar otro ajuste. La regresión se reprodujo con el EXE anterior y comprobación del JSON Native.

React mantiene ahora arrays y ofrece un campo por argumento, con añadir, retirar, subir/bajar y foco explícito en el campo correspondiente. Las cadenas se guardan literalmente: no se aplica trim, tokenización, interpretación de comillas ni ejecución mediante shell por el editor. Los campos admiten valores multilínea y señalan visualmente un argumento vacío. El modo global envía el marcador null existente por IPC; el modo propio con cero filas guarda `[]`. Ambos modos permanecen distintos tras recargar y consultar instance.json.

LaunchService conserva también los elementos vacíos al preparar el lanzamiento del cliente; copia los arrays para que añadir argumentos internos no modifique la entrada del usuario. El servidor ya construía una lista nueva conservando los elementos. Dos regresiones verifican límites, espacios, comillas, vacíos e identidad independiente de las listas en ambos lados. No se cambia el contrato de preExecuteCommand/prependCommand ni se habilitan nuevas funciones de comandos.

El editor reutiliza controles, Lucide y tokens existentes, sin otra superficie de cristal ni dependencias nuevas. Se acortaron los textos visibles y se retiraron nombres de propiedades internas de las etiquetas, conservando nombres accesibles específicos por grupo/fila. El placeholder utiliza el texto secundario del tema con opacidad completa. Se mantiene la distribución aprobada y el scroll de Ajustes.

## Evidencia

Manifiesto ignorado `launcher/e2e/artifacts/stage5-argument-boundaries-manifest.json`, SHA-256 `802546984ebbd7824ab52349e669f899979e5ebc809b8d103d3050abf2e6f1ed`: 11 fuentes canónicas y42 artefactos, incluidos ASAR/main React/Vue, ocho capturas propias e informes Axe.

- Antes: la regresión unitaria del cliente fallaba porque se eliminaba el elemento vacío. La regresión Native fallaba al comparar los arrays después de guardar el servidor: la ruta se convertía en varias cadenas y también cambiaban comillas/saltos/vacíos. Los originales temporales se recuperaron mediante finally; no se usaron mundos ni cuentas habituales.
- Focal de lanzamiento: **35 pruebas /3 archivos**. Línea unitaria completa del workflow, independiente de builds/Electron, tras el último cambio funcional: **1.101 pruebas /111 archivos**, 23,36s. Después del ajuste de textos, **145 pruebas /15 archivos** de React/lanzamiento aprobadas. No se repitió toda la suite por cambios de copia/CSS; el paquete final sí se reconstruyó y recorrió.
- `pnpm check` aprobado en los seis paquetes, más check final React; lint sin errores y un aviso previo de no-control-regex. E2E tsc conserva exactamente **56 diagnósticos base**, sin nuevos ni retirados al normalizar coordenadas. Registro de test IDs regenerado; las anclas de argumentos ahora identifican cada editor completo.
- React empaquetado, specs68/74, locale es-ES y `--retries=0 --reporter=line`: **5/5**, 15,3s. Incluye guardar otro ajuste sin alterar arrays, recarga, añadir/reordenar/retirar con foco, preservación en disco, lista vacía explícita y retorno a herencia. Las pruebas anteriores de RAM/resolución/servidor/restablecimiento siguen activas; no se retiraron sus comprobaciones para aceptar el editor.
- Matriz de ajustes y editor con datos, claro/oscuro y ventanas Native1200×720/800×400: **8 informes Axe sin violaciones /8 incompletos de contraste**. Capturas finales revisadas, campos/acciones alcanzables mediante scroll, foco y sin desbordamiento horizontal de página. No es certificación manual AA completa. Detector de fuentes de ArgumentEditor: cero hallazgos; un primer comando usó la opción reservada a páginas y no ejecutó análisis. Se corrigió a la ruta de fuente como argumento; no se abrió una conexión CDP.
- Vue renderer/host reconstruidos y dist compartido restaurado Vue; specs03/63 con su EXE: **2/2**, 7,2s. Nueve tests del harness aprobados; el check posterior se registra en `stage5-argument-boundaries-harness-check.log`, fuera del manifiesto para evitar circularidad.

Comandos: Vitest del workflow; focal LaunchService.resources/commands-instance-launch/core-clientJar y React/lanzamiento final; `pnpm check`, check React, `pnpm lint`, E2E `tsc --noEmit`, `LAUNCHER_RENDERER=react pnpm gen:testids`; builds React/Vue; Playwright empaquetado con los specs y opciones indicados; detector sobre fuente; tests/check del harness. Logs y copias de capturas/binarios permanecen ignorados.

## CI y siguiente trabajo

El [CI41287115212 /cfa9bfc](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/41287115212), del bloque Native y la corrección de teclado anteriores, terminó **success en Vue y React**: 200 escenarios principales,1 Strict Mode y8 Vue aprobados, sin flaky indicado. Dos casos de proveedores públicos de packs permanecieron omitidos por el opt-in XMCL_REACT_LIVE_PROVIDERS. Esto cierra el seguimiento del fallo36/72 de41285066451, conservando su historial. Verificar el CI del nuevo SHA al subir; el verde previo no certifica automáticamente los cambios de argumentos.

K12 no se cierra: faltan herencia completa de flags y modos de memoria, borradores ante eventos externos/cambio de instancia/navegación, conflictos de guardado y validación Native específica. El useEffect actual de InstanceBaseSettings depende de toda la instancia y puede pisar cambios sin guardar al recibir otra mutación. El reset de flags todavía fuerza false; no se presenta como herencia. Revisar también la conservación de resolution.monitor y server.name al guardar otro ajuste.

InstanceService.editInstance solo serializa la ruta expectedMetadata; antes de extender protección, revisar los callers que ya poseen locks para evitar interbloqueos. null viaja como restablecimiento y computeInstanceEditChanges lo normaliza; no cambiar esta compatibilidad al añadir una comparación de estado esperado. La selección en LibraryProvider puede cambiar la instancia sin cambiar la ruta, y InstanceBaseSettings remonta por path: un bloqueo exclusivo del router no basta para conservar un borrador.

Siguen pendientes K11 aceptación integral/auditoría IPC legacy/escritores sin NIO, K21 streaming/virtualización y etapas6–9. La prueba de lanzamiento usa el límite Native/core con procesos controlados; no acredita una partida real ni la validez de cualquier combinación arbitraria de argumentos para Java/Minecraft. Sin NSIS/delta aislados ni nuevos presupuestos de60s. PR4 borrador, producción/proxy sin cambios, Microsoft pospuesto y DOMPurify WIP fuera de commits.
