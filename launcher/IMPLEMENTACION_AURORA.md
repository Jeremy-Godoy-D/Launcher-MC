# Aurora Glass — implementación y cierre de validación

## Publicación

Versión publicada: `0.2.0-beta.1`, código integrado en `main`. El usuario autorizó publicar `v0.2.0-beta.1` en GitHub el 22 de octubre de 2026, posponiendo Microsoft. La transición desde beta.3 se distribuye como instalador completo y ZIP, sin assets ASAR públicos; así el cliente anterior elige descarga manual y evita su mecanismo de reemplazo sin verificación nueva.

Última pasada del 22 de octubre de 2026: once de once pruebas de Electron aprobadas sobre la compilación final, incluidos fallos/reintento del catálogo, onboarding con detección de unidades en Windows y ajustes sin el configurador antiguo. La comprobación adicional del foco visible en Ajustes a 800×400 también pasó. Instalador, ZIP y ASAR regenerados; coinciden sus SHA-256 y el contenido del `.gz` expandido. La publicación requiere el workflow de release aprobado y la comprobación de los assets públicos antes de darla por completada.

## Implementado

- Shell con barra de 48 px, dock, Inicio de lanzamiento, Biblioteca con Jugar y menús, rutas explícitas de instancia y redirecciones antiguas.
- Catálogo con fuentes junto a la búsqueda, filtros bajo demanda y ficha modal por ruta que conserva los resultados. Cada proveedor muestra su error y permite reintentar sin ocultar los resultados disponibles; las búsquedas omiten fuentes desactivadas. Ajustes con búsqueda y selector de categorías en ventana mínima. Onboarding de tres etapas.
- Isla de tareas desde la barra y consola inferior. Se conservan acciones rápidas, audio, cuentas, tutoriales, mando, importación por arrastre y servicios de dominio.
- Tokens Aurora esmeralda y migración selectiva del tema oscuro antiguo; se conservan colores personalizados, temas claros e imágenes/videos. El modo rendimiento se guarda fuera del tema exportable.
- Burbujas fusionadas en Canvas, máximo 30 fps, color de icono local, fallback esmeralda y pausa por actividad nativa de Electron, movimiento reducido, rendimiento y juegos en cualquier instancia.
- Proxy CurseForge con secreto servidor, rutas y parámetros permitidos, cuerpos/respuestas acotados, caché y limitadores. Tanto renderer como servicios de instalación, resolución y metadatos usan el proxy. La app no compila la clave de CurseForge ni el token de actualizaciones.
- HTML y SVG externos saneados con DOMPurify. Descarga ASAR con origen GitHub restringido, SHA-256 del archivo expandido, staging y rechazo de contenido alterado. En Windows se verifica de nuevo antes de aplicar, se espera únicamente al PID del launcher y se reemplaza el archivo conservando `.previous`; el helper usa argumentos codificados y no registra parámetros de arranque.
- Workflow de release crea borradores y comprueba la búsqueda real del proxy antes de compilar/publicar artefactos; no sustituye assets de una versión pública existente.

## Evidencia reproducible

```powershell
pnpm check
pnpm lint
pnpm exec vitest run xmcl-keystone-ui/src/util/auroraTheme.test.ts xmcl-keystone-ui/src/util/theme.v1.test.ts xmcl-runtime/app/pluginApiFallback.test.ts xmcl-runtime/app/curseforgeProxy.test.ts xmcl-electron-app/main/utils/verifyUpdate.test.ts xmcl-electron-app/main/utils/windowsUpdate.test.ts xmcl-electron-app/main/ServerService.test.ts packages/curseforge/index.test.ts xmcl-keystone-ui/src/util/sanitizeHtml.test.ts xmcl-keystone-ui/src/composables/markdown.test.ts
node --test ../services/curseforge-proxy/worker.test.mjs
pnpm build:renderer
pnpm --prefix=xmcl-electron-app compile
pnpm build:all
pnpm --prefix=e2e exec playwright test specs/aurora specs/release
```

La integración real de CurseForge es optativa fuera del release: ejecutar la última orden con `XMCL_LIVE_CURSEFORGE=1` para descargar AppleSkin desde la CDN en un perfil temporal y comprobar su integridad y persistencia. El workflow de release activa esa prueba después de comprobar el proxy público.

Capturas y trazas: `e2e/artifacts/`, excluidos de Git. Las pruebas usan perfiles temporales y los eliminan al cerrar; el lanzamiento de Java se sustituye por el hook existente de E2E. Esto comprueba el ciclo IPC y la pausa del fondo, no una partida real.

El CLI de DevTools fue rechazado por la política automática de ejecución al conectar al launcher. Se usaron las fixtures de Playwright del repositorio para validar Electron y el paquete ASAR, como alternativa explícita. No se debe presentar esa prueba como una sesión del CLI de DevTools.

Chequeos completados: tipos y lint sin errores, 59 pruebas unitarias en diez archivos, 12 pruebas del Worker y once pruebas de Electron (distribución, onboarding, rendimiento, catálogo, accesibilidad, teclado/persistencia, fallos de proveedores, creación de cuenta local e instancia, instalación real de CurseForge y arranque del paquete). Axe no detectó infracciones en las 24 combinaciones de ruta, tema y tamaño revisadas; conserva resultados incompletos para revisión manual. Las capturas cubren 1200×720 y 800×400; se corrigieron el pie de onboarding fuera de ventana, el contraste de la consola, el scroll de Ajustes y la galería sin imágenes. Compilados `.exe`, `.zip` y ASAR; sus SHA-256 coinciden. El escaneo de 153 archivos de texto empaquetados no encontró patrones de tokens GitHub; no había claves o tokens locales no vacíos en los `.env` revisados para comparar sus valores. Este escaneo tiene un alcance definido; no prueba la ausencia de cualquier secreto posible. Evidencia de la pasada completa: `e2e/artifacts/aurora-final-run.log`, `aurora-final-results.json` y `aurora-artifact-audit.json`.

La medición de referencia inicial duró 60,059 segundos en Windows 11 / Intel Core i5-12400F: 26,84 fps y 0,45 % de CPU media del renderer. En la compilación final con CurseForge activo: 60,059 segundos, 26,82 fps y 0,47 % de CPU media del renderer. Las pruebas también comprueban pausa nativa por foco/minimizado y ciclo de juego simulado mediante IPC.

El instalador generado tiene estado Authenticode **NotSigned**. Los checksums no sustituyen una firma del editor ni evitan avisos de Windows.

### Aplicación de actualizaciones en Windows

Las pruebas del helper ejecutan PowerShell real sobre archivos temporales. Cubren reemplazo válido y consecutivo con backup, rechazo de bytes alterados, reemplazo denegado que conserva el archivo anterior, y relanzamiento con argumentos vacíos, comillas, acentos y metacaracteres. El proceso relanzado en estas pruebas es un stub de Node; no sustituye la prueba del instalador ni el reinicio del launcher con elevación.

La protección nueva se ejecuta desde esta candidata; no cambia el actualizador de binarios ya instalados. El código anterior consultaba el SHA-256 para reutilizar una descarga existente, pero no verificaba después de descargar ni antes del `copy /Y` de Windows. Por ello, esta publicación omite `app-*.asar`, `.gz` y sus checksums: beta.3 detecta el release, pero usa la descarga manual del instalador completo/ZIP. Las garantías nuevas se aplican desde la candidata y no se atribuyen al cliente anterior.

Una limpieza explícita de la carpeta temporal `C:\Users\jerez\AppData\Local\Temp\launcher-update-6nFkM2` fue rechazada por la revisión automática de ejecución, sin un motivo concreto adicional; queda pendiente de eliminar manualmente. Las ejecuciones posteriores limpiaron sus propios perfiles de prueba.

### Revisión adicional de accesibilidad y persistencia

- Axe recorre seis rutas en 1200×720 y 800×400, tanto en modo oscuro como claro, y las tres etapas de onboarding en ambos tamaños. Se corrigieron etiquetas de botones, imágenes decorativas, controles de memoria y color, agrupaciones ARIA y controles anidados del catálogo.
- El panel de filtros tiene cierre visible y activador enlazado al diálogo. Se comprueba apertura con teclado, confinamiento del foco, Escape y devolución del foco al botón.
- La prueba de tema claro comprueba su guardado por el servicio y su conservación tras recargar. Detectó y corrigió la pérdida del guardado diferido al salir rápidamente de Ajustes.
- La medición adicional de textos de Inicio detectó tres contrastes insuficientes en claro. Se separó la tinta del acento decorativo y se oscureció el texto secundario, sin alterar los colores exportados del tema. Sobre las superficies sólidas medidas, el mínimo es 6,18:1 en oscuro y 5,03:1 en claro. El helper no mide fotografías, gradientes, overlays de Vuetify ni burbujas móviles; se conserva esa limitación en el código y sigue pendiente la revisión completa de fondos personalizados.
- El selector de categorías de Ajustes ocupa ahora su propia fila fuera del scroll. La prueba enfoca el selector de tema a 800×400 y comprueba que queda debajo de ese encabezado.
- Al recargar una página de contenido, la consulta de grupos espera a tener una ruta de instancia válida; se evita el error transitorio `Cannot get group state on empty path`. La integración real comprueba también que no aparece en el log.
- La prueba de fallos de catálogo simula un proveedor caído con resultados del otro, recuperación por reintento, fuente desactivada sin nuevas consultas y error de la fuente restante. También comprueba el texto de error y Reintentar en claro; se corrigió su contraste y se retiró la cruz que tapaba el nombre de una fuente omitida.
- Se retiró de Ajustes el configurador de la barra lateral antigua, cuyos controles ya no correspondían al dock Aurora. Sus preferencias almacenadas se conservan para compatibilidad.
- Los helpers de onboarding y creación de instancias usan las nuevas etapas. Se comprobó el recorrido completo con una cuenta local temporal y una instancia Vanilla 1.20.4.
- Windows consulta las unidades mediante el proveedor de archivos de PowerShell, sin intentar ejecutar WMIC ni mostrar una consola auxiliar. El onboarding comprueba que recibe unidades con espacio disponible.
- Los resultados `incomplete` de Axe se conservan en el informe: las superposiciones y transparencias impiden resolver automáticamente parte del contraste. No equivalen a una certificación WCAG AA; la revisión manual sigue pendiente. El detector de estilos señaló una línea de 3 px heredada en las notas de versión, sin detectar un fallo funcional.

## CurseForge: activación y validación real

Worker: https://launcher-mc-curseforge.launcher-mc-curseforge-proxy.workers.dev

La URL pública está configurada en la variable de repositorio `CURSEFORGE_PROXY_URL` y en el `.env` local ignorado. Cloudflare confirma `CURSEFORGE_API_KEY` como `secret_text`; el valor no se exporta al launcher.

La credencial anterior procedía de **API Tokens de autor**, API de subidas diferente de la API REST del catálogo. Tras la solicitud para aplicaciones de terceros de la [documentación oficial](https://docs.curseforge.com/rest-api/#getting-started), el usuario confirmó que renovó la clave compartida y guardó la nueva directamente en el secreto del Worker. Su valor no se ha copiado a archivos ni comandos.

Comprobación posterior al despliegue del secreto: HTTP 200 en búsqueda, ficha, listado de archivos, archivo individual y POST de resolución de archivos. La prueba real de Electron descubrió que el cliente de instalación en main saltaba el interceptor del renderer y consultaba directamente la API sin clave. Se corrigió mediante un cliente de proxy compartido, con validación del origen, eliminación de credenciales y fallo local 503 si falta configuración. La clave continúa únicamente en Cloudflare.

Caso real comprobado: AppleSkin, proyecto `248787`, archivo `4953893`, Minecraft 1.20.4 / Fabric. Descarga de 1.077.002 bytes, SHA-1 `d8c8f47cadf0bec89b0539f44e3c67df73d8e048`, reconocimiento en Mods y persistencia al recargar. Capturas de búsqueda/ficha en 1200×720 y 800×400. Los metadatos pasan por el Worker; el JAR público se descarga directamente de la CDN sin credenciales. El perfil de prueba se elimina al finalizar. Esto no prueba una partida real ni todas las clases de contenido de CurseForge.

## Alcance pendiente de validación

- Partida real de Minecraft y recorridos de todas las clases de contenido. Microsoft se pospuso expresamente por indicación del usuario; no se presenta como validado ni configurado.
- Instalación NSIS en un entorno Windows aislado y actualización completa desde beta.3, incluida aplicación/reinicio y conservación de datos. La compilación y el arranque desde ASAR no sustituyen esa prueba. Este equipo no tiene Windows Sandbox disponible y el usuario confirmó que tampoco dispone de otra VM o equipo de pruebas.
- Revisión exhaustiva de contraste AA, teclado, todos los estados de error y temas personalizados, más allá de las rutas cubiertas por las pruebas automatizadas.

SHA-256 comprueba integridad; no es una firma del editor. El proxy es público y sus rate limits son aproximados por ubicación. Mantener Workers Free; el código no contrata ni cambia planes de pago.

## Transición de publicación desde beta.3

Se descargó el ZIP público de beta.3 y se verificó SHA-256 `47590518b18273811bb1118a02562d2d37b62d6a0b28efff903ae8a4fa75d301`. La prueba `e2e/specs/release/01-beta3-migration.spec.ts` arranca ese binario y la candidata con un mismo perfil temporal: comprueba la operación manual para metadatos de release sin ASAR, conservación de cuenta local, instancia y bytes de un archivo de mundo de prueba. Los metadatos de la actualización se simulan; el test no ejecuta NSIS ni el antiguo reemplazo ASAR. El workflow descarga y verifica esta misma referencia antes de publicar el borrador.

La prueba adicional de migración pasó localmente (11,4 s): beta.3 seleccionó `manual` para el release sin ASAR; Aurora recuperó la cuenta y la instancia, y el SHA-256 del archivo de mundo permaneció idéntico. Esto añade una prueba a las once anteriores; no ejecuta NSIS ni una partida.

### Verificación del paquete distribuido

El primer workflow informó éxito global aunque la suite Aurora falló al arrancar el Electron de `node_modules`: el último comando de PowerShell (pruebas del paquete) ocultaba el código de salida anterior. El release se devolvió temporalmente a borrador. Se separaron las suites en pasos independientes, se añadieron comprobaciones de salida a tipos y pruebas unitarias, y Aurora pasó a usar el ejecutable empaquetado real. El modo de validación descarga el ZIP existente y verifica su SHA-256 sin reconstruir ni reemplazar assets. Las diez pruebas de Aurora sobre el ZIP de GitHub pasaron localmente en 2,5 minutos, incluida la instalación real de CurseForge.

Los paquetes verificados de GitHub tienen SHA-256 `2c9d1414ae8c8ae8e696b47d65d84dab5b802796eb15c062b37c7f4ab3eb4aea` (EXE) y `af379d8654cb464e75444f3fb716efde3a1004983bb90ee5c0b96c9da8552e49` (ZIP). Se confirmó `NotSigned`. El workflow excluye ASAR por defecto: antes de volver a distribuir deltas hay que cambiar sus nombres para que los clientes antiguos no puedan seleccionar ese mecanismo sin verificación.

Cierre: el [workflow corregido 39888228387](https://github.com/Jeremy-Godoy-D/Launcher-MC/actions/runs/39888228387) terminó con éxito. La lectura de sus logs confirma diez pruebas Aurora y dos de arranque/migración aprobadas, sin fallos ni reintentos. Se conservaron los binarios del borrador y sus hashes originales; la corrección solo afecta a CI, fixtures y documentación. Release público: [v0.2.0-beta.1](https://github.com/Jeremy-Godoy-D/Launcher-MC/releases/tag/v0.2.0-beta.1), beta pública mediante instalador completo y ZIP.

## Parche v0.2.0-beta.2 — descarga manual

El usuario reprodujo un fallo del botón de descarga: con un token de GitHub, se abría `api.github.com/.../releases/assets/...` y el navegador mostraba JSON. `ReleaseFile.url` conserva ahora `browser_download_url`; el endpoint autenticado pasa a `apiUrl` y se usa solo en las descargas internas, incluida la verificación SHA-256. No se cambian ni se eliminan tokens de usuario.

La regresión falló como se esperaba sobre el ZIP público beta.1 (recibió la URL API) y pasó sobre el paquete corregido beta.2 (7,4 s). Comprueba metadatos con un token ficticio, ausencia de aperturas automáticas, clic que llega a `shell.openExternal` con la URL pública, notas con scroll y botón dentro de la ventana en 1200×720 y 800×400. Capturas revisadas visualmente. Tipos y lint sin errores; cuatro pruebas unitarias del verificador/mapeo aprobadas. El control de actualización manual muestra Ver actualización y el diálogo explica el uso del instalador completo. El release beta.1 se mantiene inmutable; el parche se publica como beta.2 tras CI.
