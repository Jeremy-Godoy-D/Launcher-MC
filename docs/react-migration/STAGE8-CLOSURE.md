# Etapa 8 — React predeterminado y recorte distribuido

El ejecutable construido desde `36d93e9f5c51fc6ef583855116946e494742c4b3` arranca React desde `xmcl.runtime`. El selector usa React en desarrollo y distribución, con el puerto 3000 y salida `build/output`. Vue queda disponible como referencia de código. La producción sigue en `v0.2.0-beta.2`.

Electron y DeskGap comparten el registro de 31 servicios del núcleo. El arranque usa la aplicación incluida. Se desconectaron el host descargable, la ventana browser, los puentes de RTC, Bedrock, la IA, los grupos y amigos de XMCL, SSH, autor de Modrinth, blueprints y el motor antiguo de temas. Se retiraron también reexportaciones que aún incorporaban implementaciones inactivas. La exportación local, los perfiles y las skins locales, los mundos comunes y el catálogo público conservan sus servicios. Las peticiones a servicios antiguos de XMCL fallan localmente y CurseForge conserva el proxy.

El arranque lee solo la preferencia clara, oscura o sistema de temas antiguos. Las rutas conocidas de contenido conservan consulta y fragmento al pasar a `/instance`. FTB, blueprints, multijugador XMCL y la ruta antigua de autor redirigen a Biblioteca.

## Evidencia

| Comprobación | Resultado |
| --- | --- |
| `pnpm build:renderer`, `pnpm --prefix=xmcl-electron-app build` | Compilaciones predeterminadas aprobadas. |
| `NODE_ENV=production`, `pnpm --prefix=deskgap-app build` | Compilación aprobada, incluido el control ASCII existente. |
| `node scripts/check-core-graph.mjs` y `--deskgap` | 1960 entradas nativas Electron, 1848 DeskGap, 464 React. Cero coincidencias de implementaciones retiradas, SDK exclusivos o Vue en bytes emitidos. Incluye metadatos de main, preloads Electron, workers y renderer. |
| Inventario ASAR | `renderer/index.html`, `logger.html` y `migration.html`. Sin browser, preloads sociales, metadatos de análisis ni dependencias Vue/SSH/Azure en las entradas inspeccionadas. |
| `pnpm check`, `pnpm lint`, `tsc --noEmit --project tsconfig.json` en DeskGap | Exit 0. En E2E permanecen los mismos 56 diagnósticos normalizados, sin cambios respecto a la etapa 7. |
| Vitest focal | 18 pruebas en 7 archivos. Incluye migración de rutas, recorte de red, tema y Yggdrasil local. |
| `pnpm gen:testids` | 199 anclas React en el registro principal. 297 Vue en el registro histórico. |

El recorrido 106 pasó sobre el ejecutable reconstruido con un perfil temporal. Conservó byte a byte la configuración de apps, CSS, medios, tema y registro Bedrock sembrados. Mostró la instancia Java y la apariencia clara, sin mostrar Bedrock. El servidor señuelo recibió cero solicitudes. Trece claves retiradas devolvieron `ServiceNotFoundError`. El login de autor quedó indisponible, el indicador de token quedó en falso y no aparecieron puentes retirados ni ventanas adicionales. Se verificaron los enlaces de Mods y FTB. El recorrido 100 de actualizaciones también pasó en esa compilación.

La prueba 01 ahora usa la ventana principal empaquetada. Pasaron ambos casos de apariencia, dimensiones, teclado, navegación y vídeo. Axe produjo 12 informes con cero violaciones y 16 comprobaciones incompletas. El recorrido beta.3 ejecutó el ZIP público verificado, descubrió una actualización manual sin token y abrió React con el mismo perfil. Conservó cuenta, instancia y hash del mundo. Esta prueba reemplaza el paquete portable. La prueba NSIS queda para Windows desechable en la etapa 9.

El primer recorrido de paquete 02 aprobó las tres entradas y decodificó el vídeo antes del ajuste de rutas. Su ventana auxiliar sintética produjo el aviso esperado de handler de migración ausente. El recorrido nativo de migración de la etapa 7 cubre el handler real. Las dos primeras ejecuciones de 01 fallaron porque abrían un segundo renderer fuera del frame autorizado. La prueba corregida conserva la política IPC.

CI `41571802554` mostró seis fallos por comparar rutas temporales de Windows con su forma canónica. Las tres fixtures afectadas ahora crean sus directorios bajo la raíz canónica. Pasaron las 11 pruebas afectadas. El workflow de migración construye React por defecto, comprueba ambos grafos y ejecuta la matriz de recorridos React. El workflow de distribución usa el paquete React y los recorridos de compatibilidad. El resultado integral del nuevo CI se registra en la etapa 9.

Identidad de la candidata local, SHA-256:

- EXE `45aaeceae966d05382b9a39a849cc13d82ba7d9e59432f327a4231aed5885c9b`.
- ASAR `caf6a9c7da2b6b11742e78d099f80dee570133fe4f4788f487613d37681f2619`.
- HTML principal `245754247777c86f00defd0ece2a89afd495260110a28c69bfaca5a8c928e4d2`.
- ZIP beta.3 `47590518b18273811bb1118a02562d2d37b62d6a0b28efff903ae8a4fa75d301`.

Los logs, capturas y grafos permanecen en `launcher/e2e/artifacts` con prefijo `stage8-`. El paquete local conserva el número de versión anterior y sirve para validar la sustitución. La etapa 9 exige candidata con la versión definitiva, juego y loaders reales, NSIS limpio y sobre beta.2, actualización e integridad, rendimiento y revisión de seguridad antes de publicar.
