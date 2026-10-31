# Etapa 5 — información y grupos de packs

Fuente `c3f317a4d05acccb6bbcd3f99a7c8fddd90eeec8`. Añade estas dos funciones a React; no completa K09 ni la etapa5.

## Comportamiento

Los nombres de packs locales abren una ficha en la misma página: archivo, formato declarado, versión orientativa disponible, tamaño, SHA-1 y origen público registrado. Muestra los metadatos actuales del recurso observado; abrirla no instala, activa, navega a servicios ni modifica archivos. Escape/cerrar devuelve foco al disparador o a búsqueda si desapareció. Cambiar instancia desmonta la ficha. Las entradas internas de Minecraft sin archivo no reciben información inventada.

Las descripciones se muestran mediante texto React. Admite cadenas, listas y componentes text/extra; conserva literalmente la clave translate sin resolverla ni interpolar with. Descarta acciones, eventos y estilos de Minecraft, sin HTML ni enlaces ejecutables. Limita profundidad32,2048 visitas y32768 caracteres, con indicación si se abrevia. Solo formatos enteros seguros no negativos llegan a la tabla; objetos y claves de prototipo se muestran como desconocidos. La tabla compartida existente es incompleta para versiones recientes: un formato34 puede quedar sin rango. No se inventa compatibilidad con una partida.

El hook existente useContentGroups recibe el tipo de contenido. Packs usa resourcepacks-groups.json y su estado separado por tipo/instancia; mods conserva el valor por defecto y su migración legacy. Abrir packs no migra ni borra modsGrouping. Reutiliza el editor y el guardado Native con comparación de la revisión anterior: crear/renombrar/color/asignar/quitar asignación/disolver grupos; filtro en activados/disponibles y etiquetas por archivo. Disolver conserva el contenido y no cambia options.txt. Una lectura inválida bloquea gestionar grupos, conserva el archivo y ofrece el reintento existente Volver a leer; un guardado concurrente conserva formulario y datos externos. Esto no activa todavía la gestión de carpetas compartidas ni las actualizaciones de packs.

## Validación

- **824 unitarias/87 archivos,17,13s**, suite del workflow que ya incluye todo xmcl-react-ui/src. Tres nuevas regresiones: formatos no confiables, descripción de texto y límites/ciclos. Tipos raíz y lint aprobados. El primer chequeo detectó que la ficha pedía Resource mutable; corregido a StateData<ResourceState> de solo lectura. E2Etsc conserva56 diagnósticos previos, ninguno en47/helper.
- **18 escenarios Native distintos**: React32/43/44/47=16 y Vue03/33=2. Primera tanda React15 aprobados/1 fallido: el test leía el JSON inmediatamente tras pulsar guardar, antes de confirmar el cierre del formulario. Se añadió la espera del resultado de UI; no se retiró la comprobación del archivo. Tanda final React43/47:7 aprobados,24,1s. Vue:2 aprobados,13,7s. Los demás nueve React ya habían pasado y no se repitieron sin cambios que los afectaran.
- ZIP sintéticos reales y lectura/observación/JSON Native: descripción con HTML y clickEvent permanece texto, foco/recarga/aislamiento A→B, formatos objeto/prototipo no rompen la lista/ficha. Grupos persisten tras recarga, filtran ambas prioridades, conservan selección/options.txt, archivos de grupos mods/shaders y almacenamiento legacy. Lectura corrupta y edición externa se conservan y recuperan sin sobrescribir.
- Último cambio visual: etiqueta Versiones orientativas, seguida de reconstrucción y repetición del escenario visual de47:1 aprobado,6s, solapado con los18 anteriores. **Ocho informes Axe actuales:0 violaciones/8 incomplete;12PNG**, claro/oscuro1200×720 y800×400. Foco, Escape/retorno, scroll por teclado de descripción, acciones del formulario y ausencia de desbordamiento horizontal comprobados. Capturas mínimas de información en ambos temas y formulario revisadas; no AA manual exhaustiva.
- Renderer/host React reconstruidos. Vue se prueba con el paquete b7ec02c anterior, cuyo grafo no cambia en este bloque; dist recompilado Vue y selector predeterminado conservados. Harness check y nueve regresiones pasan. El CI40827795644 del bloque anterior tiene Vue aprobado y React en curso al guardar; esta fuente requiere CI propio tras push.

Comandos desde launcher: lista vitest de `.github/workflows/react-migration.yml`, `pnpm check`, `pnpm lint`, `pnpm --dir e2e exec tsc --noEmit`; renderer/host build con LAUNCHER_RENDERER=react, compile con Vue para restaurar dist; Playwright32/43/44/47 React y03/33 Vue con EXE específico y es-ES;47 visual tras la etiqueta. Desde raíz: harness check y node --test launcher/scripts/react-migration.test.mjs.

Manifiesto ignorado `launcher/e2e/artifacts/stage5-pack-info-groups-artifact-manifest.json`, SHA-256 `5a85abef0a0196acb545f109d4ad5e5f46d740a0a99d49dd4908af3a246d601f`:10 blobs Git canónicos y205 archivos de evidencia, incluidos fallos iniciales, aprobados, capturas e hashes EXE/asar de ambos outputs mutables.

## Siguiente acción y límites

Continuar gestión de compartidos y actualizaciones de packs; después shaders, mundos, ajustes de instancia y consola, luego6–9. No reimplementar información/grupos ni repetir mods por rutina. K08/K09 y las tres gates5 siguen pending hasta su aceptación completa.

No certifica traducción de descripciones desde assets del juego, compatibilidad real de packs, consultas públicas nuevas, Java/partida, NSIS/delta, AA manual ni presupuestos finales. Mantener proxy, credenciales, datos y garantías del actualizador. Producción/proxy intactos, Microsoft pospuesto, versión beta.2 y PR4 en borrador. No DevTools/CDP, ANALISIS_ARQUITECTURA.md ni limpiezas denegadas.
