# Etapa 5 parcial — diagnóstico de mods y protección de revisiones

Fuente y pruebas `590217d`, 2026-10-27. Complementa MOD-INFO/LOCAL-FILES/GROUPS/WORKSPACE/AUTHORITY. Ninguna gate5 ni K08 se cierra con este bloque.

## Resultado

«Revisar mods» abre un panel de la instancia con dependencias ausentes, versiones incompatibles, incompatibilidades declaradas, duplicados y requisitos sin verificar. Las reglas compartidas conservan alternativas y condiciones de Quilt, dependencias recomendadas/negativas de Fabric, tipos y lados de Forge/NeoForge y requisitos de LiteLoader. Los valores desconocidos no se convierten en compatibilidad confirmada. El panel de información muestra también estas declaraciones, como texto.

Java solo se considera conocido si el ejecutable configurado explícitamente coincide con un registro válido del servicio. La selección automática/heredada y las versiones desconocidas de cargadores de lenguaje quedan sin verificar. Se preservan los requisitos Java/entorno de los TOML; no se deduce la versión de JavaFML de la versión de NeoForge. Esto no sustituye una partida real ni implementa todavía las restricciones de mods en la selección automática de Java.

El inventario nativo captura identidades de archivos y configuración Minecraft/loader/Java/versión. Activar/desactivar desde React envía esa huella y los SHA-1 de los archivos seleccionados. Main verifica registro Java, proceso activo, rutas regulares y revisión bajo el lock de instancia; rechaza revisiones obsoletas sin cambiar los archivos de los casos probados. También precomprueba todos los nombres de destino para evitar cambios parciales por colisiones ya existentes. El inventario no vuelve a calcular hashes de todo el pack: no se afirma atomicidad frente a procesos externos o pérdida de energía.

Al abrir el diagnóstico se relee el inventario. Los archivos detectados cuyos metadatos actuales aún no llegaron aparecen pendientes y no producen un resultado limpio prematuro. Las acciones de información y cierre conservan foco, navegación y aislamiento entre instancias; los cambios locales actualizan el diagnóstico. No se activan, descargan ni eliminan dependencias por abrirlo.

Se corrigieron componentes numéricos semver que aceptaban prefijos/NaN, la clasificación Maven fuera de rango y dependencias opcionales ausentes. Quilt conserva sus estructuras y nombres de autores. Los adaptadores Vue mantienen objetos raw y referencias tipadas para no expandir recursivamente los nuevos metadatos; no se modificó configuración global de TypeScript.

## Validación

- **669 unitarias /75 archivos**: 24 casos nuevos y18 existentes de Forge añadidos a CI. Rangos, Quilt/NeoForge/Java, proveedores reservados, duplicados, metadatos inválidos, TOML de features, huellas estables, cambios de configuración y colisiones múltiples. Tipos raíz y lint aprobados; E2E conserva56 diagnósticos globales previos y ninguno en36.
- **90 React +1 Strict Mode +3 Vue =94 escenarios distintos**. React4,8min; Strict4,0s; Vue18,5s. La repetición focal3/3 en13,7s no se suma al total. Vue recompilado y dist/default devueltos a Vue.
- JAR Fabric real de fixture por el parser/servicio nativo: dependencias ausentes, incompatibilidades, Java desconocido, actualización del diagnóstico y bytes intactos durante lectura. Rechazo nativo de huellas antiguas tras añadir otro archivo o cambiar el loader, y de raíces no registradas.
- Claro/oscuro,1200×720/800×400, movimiento reducido, Tab/Escape, foco/retorno, scroll y revisión de capturas superior oscura1200 y acciones claras800. 111 auditorías Axe, cero violaciones y186 incomplete;172 PNG preservados de React. El JSON adjunto registra sus hashes; no se afirma certificación manual AA.

La primera ejecución focal terminó11/12: el test intentaba recorrer acciones antes de que llegara el inventario inicial. Se corrigió el estado pendiente y la preparación de la lectura; la repetición final y la suite completa pasan. Las salidas fallidas originales permanecen en sus carpetas ignoradas. Los cambios de tipos también detectaron expansión recursiva de Vue y se corrigieron con adaptadores locales, sin relajar el compilador.

Comandos, blobs Git, hashes de ejecutables/ASAR al capturar y manifiesto de logs/capturas por ejecución: `STAGE5-DIAGNOSTICS.json`. Los directorios de build son mutables; el hash identifica esta captura. El CI previo40508508568(b585c49) pasó; el nuevo push requiere su propia ejecución.

Referencias de las reglas: [Fabric](https://docs.fabricmc.net/develop/loader/fabric-mod-json), [Quilt RFC](https://github.com/QuiltMC/rfcs/blob/main/specification/0002-quilt.mod.json.md), [Forge](https://docs.minecraftforge.net/en/1.20.1/gettingstarted/modfiles/) y [NeoForge](https://docs.neoforged.net/docs/1.20.4/gettingstarted/modfiles/). No se importó código remoto ni una dependencia nueva para implementar el diagnóstico.

## Pendiente

Revisión y propuesta de dependencias antes de cambiar archivos, actualizaciones de mods, packs/shaders y reglas compartidas, mundos, ajustes, consola y etapas6–9. Los tests unitarios cubren varios formatos; las nuevas pruebas nativas de diagnóstico usan Fabric, no todos los modpacks publicados. Quedan la calibración de contenido extenso y las pruebas finales de seguridad/accesibilidad/Java/juego/NSIS/delta. Los hints legacy de descarga Quilt aún no resuelven grupos de alternativas; el catálogo React debe usar reglas con contexto de instancia. Microsoft pospuesto; credenciales/proxy y producción intactos.
