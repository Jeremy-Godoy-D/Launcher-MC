# Rutas equivalentes de carpetas compartidas

Fuente `61ec027bcc0ceb1ee91355812c2d344c09ab861b`. Seguimiento de PACK-UPDATES/aacc6bb y del CI40878971283. Mantiene la etapa 5 activa.

El CI anterior terminó con Vue aprobado y React 123/127: cuatro fallos en43,46 y48 relacionados con carpetas u opciones compartidas. Las unidades y tipos/lint habían pasado; los fallos de inyección de errores de la fixture quedaron resueltos. Los recorridos nuevos de packs requieren además validar el resultado remoto propio.

## Corrección y reproducción

isLinkTo comparaba literalmente el destino de readlink y el destino configurado después de retirar el prefijo Windows. Dos rutas que pasan por un alias de carpeta padre pueden llegar al mismo directorio físico y seguir siendo distintas como texto. La migración de AbstractInstanceDomainService repetía esa comparación: podía sustituir el enlace legítimo por una carpeta privada vacía, dejando los packs en la carpeta común. La identificación incorrecta también afecta a las guardas que preguntan si una carpeta está compartida.

La nueva prueba Native51 arranca el ejecutable empaquetado con un gameData configurado mediante una junction de carpeta padre, en un perfil temporal propio. Sobre el EXE de aacc6bb reproduce el fallo:isLinked devuelve false después de compartir. Esa es la observación anterior al arreglo; la prueba se detiene ahí y no acredita haber observado una retirada posterior por la migración. El código de esa rama se inspeccionó directamente.

La comparación ahora conserva su vía rápida literal y, si difiere, compara realpath del enlace y del destino. Los directorios privados no se convierten en enlaces y se conservan los contratos de enlaces pendientes. La migración usa el mismo helper, evitando otra interpretación de identidad. Se revisaron los callers en AbstractInstanceDomainService,InstanceSavesService y pluginLaunchPrecheck. Los controles de instancia/destino de los servicios siguen vigentes.

## Evidencia

- Cuatro unidades con FS real:destino por alias,carpeta privada,enlace a otro destino y junction intencional pendiente. Suite completa del workflow:870 pruebas en 90 archivos,19,13s. Se añade la prueba al workflow.
- Runtime tsc y pnpm lint aprobados. E2E tsc conserva los mismos 56 diagnósticos anteriores,normalizando posiciones;ninguno nuevo en la fixture o51.
- React empaquetado actual:13 escenarios de43/46/48/49/51 aprobados en 47,4 s. Incluye los cuatro recorridos fallidos del CI anterior y la nueva reproducción por alias.51 conserva el enlace al observar/recargar,los packs comunes y locales,options.txt y la copia privada independiente.
- Vue empaquetado actual:03/08/33/45,4 aprobados en 20,0 s. Se conservan los consumidores legacy y el onboarding.
-50 sobre el host actual:Modrinth y CurseForge reales,2 aprobados en 8,8 s,con el mismo resultado de pack/SHA descrito en PACK-UPDATES. Son repeticiones de esos mismos escenarios,no funciones ni casos adicionales.
- Bloque de trabajo acumulado:26 escenarios Native distintos (22 React + 4 Vue);19 de ellos se repitieron sobre este último host. El resto pertenece a los recorridos de mods anteriores cuyos límites figuran en PACK-UPDATES. Hace falta el CI completo propio;los resultados locales no lo reemplazan.
- No cambia el renderer visual de aacc6bb.49 vuelve a ejecutar sus ocho análisis Axe sin violaciones;la evidencia visual y las 16 comprobaciones incomplete se explican en PACK-UPDATES. No se afirma AA manual.
- Ambos hosts reconstruidos,dist compartido y selector en Vue. Harness check y 9 pruebas aprobados;comprobar de nuevo los documentos registrados. Microsoft pospuesto,proxy y producción sin cambios.

Comandos desde launcher:pnpm exec vitest run con la lista del workflow;pnpm --prefix=xmcl-runtime check;pnpm lint;pnpm --dir e2e exec tsc --noEmit. Build del host con LAUNCHER_RENDERER=react y después vue. Playwright51 contra el EXE anterior(repro fallida);después43/46/48/49/51 contra el nuevo React,03/08/33/45 contra Vue y50 con XMCL_REACT_LIVE_PROVIDERS=1. Cada lote tiene output/log stage5-pack-shared-alias-* propio.

Manifiesto ignorado launcher/e2e/artifacts/stage5-pack-shared-alias-manifest.json,SHA-256 `ee1fd944ab0dc0b3d15c1c30033db82da2197e809bc3df8dafec301a249544f6`:6 blobs Git canónicos y146artefactos, incluidos ambos EXE/ASAR,la traza de reproducción y el manifiesto del bloque de packs. No se recorre la junction protegida sharing-temp-alias.

## Continuación

Verificar el nuevo CI después del push. La equivalencia por alias está reproducida y corregida localmente;su relación con todos los fallos del runner anterior debe confirmarse remotamente. No declarar el CI aprobado ni publicar una candidata hasta comprobarlo.

Continuar shaders,mundos,ajustes y consola de instancia;luego 6–9. K08/K09 y las gates de la etapa 5 permanecen pendientes por la aceptación completa y las conexiones con catálogo. No certifica Minecraft/Java reales,NSIS/delta aislados,AA manual ni presupuestos finales. No reintentar DevTools/CDP ni las limpiezas denegadas;conservar sharing-temp-alias sin seguirlo y ANALISIS_ARQUITECTURA.md sin editar.

## Expectativa del inventario sobre rutas físicas

CI40883524807 terminó:Vue869/870 unidades y React cancelado antes de smoke. La aserción nueva del inventario comparaba la raíz física devuelta por resourcePackLocation con una ruta TEMP que contenía RUNNER~1. El método devolvía correctamente la ruta resuelta;la expectativa debe compararla con realpath(common). La prueba mantiene la ruta lógica del archivo en entries,la diferencia de autoridad y la verificación de carpeta compartida.

Fuente de prueba `13f6cf2271e6bffe55216fe6c4e1af263aea7b09`. Cambio exclusivo de expectativa,7/7 focales locales aprobadas. No se recompila ni se repite Electron por esta corrección. Manifiesto ignorado stage5-pack-snapshot-path-manifest.json,SHA-256 `b3045ea75af68e404dc98935c682e593d8aa0b9b2593ef0b9dad2b73b2002508`,con el blob canónico y2logs. Hace falta el CI nuevo;no se han vuelto a ejecutar los E2E del runner después de61ec027.

Shaders está en desarrollo en el worktree:contratos,parser de propiedades y selección Native sin validar integralmente. No se añade al commit de esta corrección ni se declara implementada su interfaz.
