# Etapa 4 parcial — Grimo Launcher

Código `ab031939d0caf7d63d4fe6a5c555a5af48ddaea5`, 2026-10-25. Nombre definitivo y recursos entregados por el usuario; corrección posterior: adaptar el color del logo a la aplicación y aprovechar las versiones para sus distintos usos. SCOPE registra ambas instrucciones. Las tres gates de etapa 4 siguen pendientes.

## Marca y recursos

La interfaz React, onboarding, títulos principal/logger/migración, mensajes y host Windows utilizan Grimo Launcher. También se actualizaron los nombres visibles de Vue y el manifiesto DeskGap; no se migran funciones adicionales ni se cambia el renderer predeterminado. Los recursos verdes originales se conservan intactos en `launcher/branding`, con hashes y dimensiones.

Los derivados de `branding/copper` usan cobre, crema y obsidiana. Se editaron el icono de aplicación y el horizontal con la herramienta integrada image_gen. Hay una variante horizontal con letras claras y otra con letras oscuras; la aplicación elige su versión por tema, sin invertir imágenes con CSS. El icono se usa en Windows, barra, navegación, favicon y auxiliares; el horizontal, en el onboarding amplio. En altura mínima se reserva el espacio para los controles. Principal e isotipo originales permanecen disponibles, sin introducir todas las versiones en una sola pantalla. Los prompts, procedencia y hashes están documentados junto a los archivos. La edición del logo no autoriza arte IA para los paisajes ni reemplazar recursos de packs.

Se generaron tamaños técnicos PNG y un ICO con siete resoluciones a partir del icono editado. La comprobación de recursos PE del EXE encuentra exactamente esos siete PNG y sus hashes coinciden con las fuentes; la extracción nativa de Windows muestra el icono cobre. En este equipo app.getFileIcon de Electron devolvía un icono genérico y no se usó para certificar el recurso: no confundir esa observación con una ausencia de iconos en el EXE. Hay evidencia independiente de recursos y extracción.

## Compatibilidad

Cambian producto/ventana/acceso directo y nombres de futuros EXE/ZIP a `GrimoLauncher-*`. Se adaptan los callers del workflow y la ruta de la candidata en la prueba de migración de release. Los enlaces públicos de beta.3 conservan sus nombres reales; no se reescriben recursos históricos.

Permanecen la carpeta de datos y secretos `LauncherMC`, appId/AUMID `local.launchermc.desktop`, esquema `launchermc`, nombre técnico del paquete y repositorio GitHub. Los recorridos confirman el directorio de datos anterior, selección persistida y raíz; las pruebas de perfiles/instancias/recuperación siguen pasando. No se renombró el repositorio remoto ni se tocaron datos habituales. La identidad estable del instalador no sustituye ejecutar su actualización en un entorno aislado.

## Comprobación

- 269 unitarias en 29 archivos y nueve pruebas del harness. Branding comprueba integridad de originales/derivados, formato/dimensiones PNG/ICO, nombres públicos e identificadores que deben permanecer; se mantienen los tests del actualizador y el conjunto Java/lanzamiento.
- 22 recorridos Electron React, uno Strict Mode y dos Vue: 25 aprobados. Ambos renderers se construyeron y empaquetaron con el nuevo nombre. El paquete React arranca sus auxiliares; el de Vue conserva su recorrido principal y onboarding.
- Tipos completos y lint sin avisos/errores. Detector de las fuentes de onboarding sin incidencias. Los informes Axe de la regresión y sus incompletos quedan contados en STAGE4-BRANDING.json; no certifican AA manual completa.
- Revisión visual en 1200×720 y 800×400, claro/oscuro, incluyendo logo del lateral dentro de sus límites, wordmark correcto por tema y cuerpo/controles de onboarding. Originales y variantes tienen manifiestos de hashes. Los screenshots, JSON y logs están en artefactos ignorados; el informe versionado identifica el commit y hashes.

Comandos: `pnpm gen:testids`, el conjunto Vitest de `.github/workflows/react-migration.yml`, `pnpm check`, `pnpm lint`, `LAUNCHER_RENDERER=react pnpm build:renderer`, build del host Windows, Playwright specs 01/02/05/06/07/09/10/11/12/13 y 04 en Strict Mode. Después `LAUNCHER_RENDERER=vue pnpm build:renderer`, build del host y specs 03/08 sobre su EXE empaquetado. Se analizaron como YAML los workflows de migración y release; no se ejecutaron en GitHub. Se ejecutaron `node --test scripts/react-migration.test.mjs` y el check del harness.

## Límites y continuidad

No se ejecutó NSIS, actualización/delta desde beta.3, firma Authenticode ni publicación; los nombres de paquetes completos se verifican en configuración y callers, no como instalador ejecutado. DeskGap nativo, Appx y plataformas no Windows no se validaron aquí. Las pruebas de lanzamiento mantienen XMCL_E2E_NO_LAUNCH; no se probó Java/Minecraft real. El presupuesto de rendimiento 60s sigue pendiente.

Retomar K03 URL/carpeta/opciones avanzadas/enlaces y operaciones de instancia. Conservar la marca Grimo y sus variantes, sin rehacer el diseño. Perfiles, galerías/caché, ajustes completos, tareas/consola y demás criterios siguen en el plan original. Microsoft permanece pospuesto, la versión pública no cambia y ANALISIS_ARQUITECTURA.md permanece intacto.
