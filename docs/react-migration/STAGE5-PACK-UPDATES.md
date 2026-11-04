# Actualizaciones revisadas de resource packs

Fuente `aacc6bb22bd629987860d01b2bbf2045b803fb56`. Integra consultas públicas, selección, revisión, instalación con respaldo y recuperación. No cierra toda la etapa 5 ni la migración. El ajuste posterior de rutas compartidas se registra en STAGE5-SHARED-PATH-ALIASES.md.

## Comportamiento y protección de datos

Packs reutiliza el diálogo,las tareas,los clientes públicos y el instalador revisado de mods. Mantiene filtros de proveedor,versiones estables y exclusión por Minecraft en las claves legacy resourcepacksUpgrade*. Los planes antiguos sin domain conservan el significado mods;la lista de recuperación se filtra por dominio. No se mezclan planes entre pantallas ni se cambian contratos de los callers Vue.

Se actualizan ZIP identificados,con nombre estable. El manifiesto conserva SHA/version/IDs nuevos pero mantiene la ruta anterior:la selección,la prioridad y los grupos,incluidas otras instancias vinculadas,no dependen del nombre nuevo del proveedor. Cada sustitución se calcula como backup-add;el motor existente conserva el anterior y no sobrescribe respaldos al reintentar. No se escribe options.txt ni resourcepacks-groups.json. Las carpetas y los archivos sin origen no se actualizan automáticamente.

La revisión Native enlaza configuración,inventario y autoridad física de la carpeta mediante SHA-256;se comprueban nombres exactos y hashes de archivos anteriores. Solo rutas directas resourcepacks/*.zip;sin cambios de nombre ni enlaces no autorizados. La autoridad guardada procede del inventario que se revisó,no de una lectura posterior. Un cambio de carpeta durante la descarga bloquea la publicación y exige nueva revisión de recuperación. Esa revisión muestra el cambio de destino/configuración y el efecto en instancias compartidas.

El instalador coordina sus secciones de mutación con resource-pack-options y después con el mutex de instancia,como lanzamiento/selección/compartidos. Las descargas no mantienen ese mutex. Revalida registro Java,destinos y procesos antes de publicar cada archivo. Tanto instalaciones revisadas como no revisadas de packs compartidos se bloquean cuando otra partida usa la carpeta común;una carpeta privada permanece independiente. La cancelación conserva progreso/plan;la revisión de recuperación respalda ediciones posteriores del usuario.

Inventario y fuentes Native limitados a 10000 entradas;las revisiones mantienen límite de 2000 operaciones. Árboles compartidos ajenos,enlaces internos y raíces que no son directorios se rechazan. Las credenciales siguen fuera del renderer;se reutiliza el proxy CurseForge sin modificarlo.

## Contratos de proveedores comprobados

Modrinth usa loaders:[minecraft] para resource packs,aun en instancias Vanilla,y exige la versión Minecraft,proyecto,hash y fecha compatibles. CurseForge omite modLoaderType para packs,conservando filtro Minecraft y validación del proyecto/archivo/hash/fecha. Cachés separadas por dominio;fallos parciales,rate limit,abort y política de proveedor conservan el flujo existente.

Fuentes oficiales consultadas:[actualizaciones por hashes de Modrinth](https://docs.modrinth.com/api/operations/getlatestversionsfromhashes/) y [Get Mod Files de CurseForge](https://docs.curseforge.com/rest-api/). La primera identifica minecraft para packs;la segunda declara modLoaderType opcional. No se usa la ausencia de un loader de mods para bloquear Vanilla.

## Validación

- Suite completa del workflow:866 pruebas en 89 archivos, 17,71 s,tras el ajuste final de autoridad. Incluye snapshots con FS real,fuentes/registro/limites,respaldos,carpetas compartidas/juegos,cambio de autoridad,recuperación,manifiestos y filtros/cache por dominio.
- pnpm check de todos los paquetes aprobado. Primer intento detectó que la fixture de inventario omitía defaults del runtime;ahora usa RuntimeVersionsSchema. Tras el ajuste final Native,pnpm --prefix=xmcl-runtime check y pnpm lint aprobados. E2Etsc conserva exactamente56 diagnósticos previos al normalizar posiciones;ninguno nuevo en49/50.
- React:18 escenarios distintos en40/42/43/48/49 aprobados,1,2min.49 añade5:ambos proveedores sintéticos con instalación Native real desde archivo de fixture,edición tras revisión sin sobrescritura,descarga HTTP local cancelada/recuperada y visuales. Primera ejecución49:5 aprobados en 25,2 s. Tras ajuste final de autoridad y reconstrucción de ambos hosts:49+50,7 aprobados en 32,2 s. Estas repeticiones no se suman como escenarios nuevos.
- Proveedores reales50:2 escenarios aprobados en 10,2 s,y repetidos en el lote final. Perfil Vanilla aislado,Fast Better Grass Modrinth dspVZXKP/versión1lpmCieT y CurseForge819030/archivo5416060. Ambos actualizan a contenido identificado públicamente como Modrinth U9zNcnWW/26.2,10928 bytes,SHA-1 3a344f8e36a2e748f11dce1c246b5c6ce91141f1. Se verifica SHA-512,ZIP con nombre personalizado idéntico,options/grupos/mundo conservados y copia original. No hay respuestas o instalación simuladas en50. El pack se descarga solo para QA temporal,no se incorpora al producto.
- Vue empaquetado:03/08/33/45,4 escenarios distintos aprobados (2 en 11,3 s y 2 en 9,7 s) antes del último ajuste de autoridad. Ambos hosts se reconstruyeron después;Vue45 repetido sobre ese último EXE:1 aprobado en 2,5 s,sin sumarlo como escenario nuevo. React 20 + Vue 4 = 24 escenarios distintos;no confundir con el total de ejecuciones.
-49 visual:8 informes Axe, 0 violaciones y 16 incomplete;8 capturas revisadas,claro/oscuro,1200×720 y800×400. Título,región desplazable,acciones y foco accesibles,sin desbordamiento horizontal. Las capturas de50 añaden4 vistas de consulta/instalación real. No certifica AA manual.
- Renderer React y ambos EXE/ASAR compilados. Dist compartido y selector vuelven a Vue. Harness check y9pruebas aprobados antes de registrar este informe;repetir check con documentos actualizados. No se cambió la versión del paquete ni se publicó.

Comandos desde launcher:el pnpm exec vitest run completo de .github/workflows/react-migration.yml;pnpm check;pnpm lint;pnpm --prefix=xmcl-runtime check;LAUNCHER_RENDERER=react pnpm build:renderer;pnpm --prefix=xmcl-electron-app build para cada renderer. Playwright con XMCL_E2E_EXECUTABLE apuntando al EXE correspondiente,XMCL_E2E_LOCALES=es-ES,especificaciones40/42/43/48/49,Vue03/08/33/45 y50 con XMCL_REACT_LIVE_PROVIDERS=1. Outputs y logs propios stage5-pack-updates-*.

Manifiesto ignorado launcher/e2e/artifacts/stage5-pack-updates-artifact-manifest.json,SHA-256 `a62f5a84b894b7c006f65af066e1ee0fe55d078c4cc7520400522f2689b9cc23`:22 blobs Git canónicos y 242 artefactos(incluidos EXE/ASAR). No recorre sharing-temp-alias. Los logs/capturas no se versionan.

## Estado y límites

CI de la corrección de aliases cd4d06a/91b025b,run40878971283:ver instantánea incluida en manifiesto;Vue aprobado y React123/127,4 fallos en43/46/48 sobre opciones/carpetas compartidas. Las 842 unidades del commit anterior,tipo/lint y las 12 pruebas de publicación simulada ya pasan en el runner;los nuevos fallos son de recorrido Native. Se investiga la comparación literal de destinos frente a aliases de Windows en isLinkTo y la migración legacy. No afirmar su causa en el runner como verificada hasta contrastar trazas/CI. Comprobar el CI nuevo después del arreglo.

Siguiente:aceptación restante de packs/mods y shaders,mundos,ajustes de instancia/consola;luego catálogo 6,superficies 7,retirada 8 y validación/publicación 9. K08/K09 y las tres gates5 continúan pendientes,especialmente las conexiones con catálogo. Archivo ZIP no identificado/corrupto puede impedir terminar la lectura de metadatos hasta corregirlo;no anunciar que todo está actualizado con una lectura incompleta. No se prueba aquí Minecraft/Java reales,NSIS/delta aislados,pérdida de alimentación,AA manual ni presupuestos finales. Producción/proxy intactos,Microsoft pospuesto,PR4 borrador y v0.3.0-beta.1 sin publicar.

La limpieza de launcher/e2e/artifacts/sharing-temp-alias fue rechazada por revisión automática. Conservar el enlace sin reintentar borrarlo ni seguirlo al reunir artefactos. Tampoco reintentar DevTools/CDP,limpiezas protegidas anteriores ni tocar ANALISIS_ARQUITECTURA.md.
