# Etapa 5 parcial — información local de mods

Aplicación y pruebas `c6d7430`, 2026-10-27. Complementa LOCAL-FILES/GROUPS/WORKSPACE/AUTHORITY; no cierra ninguna gate5 ni K08.

## Resultado

Pulsar el nombre de un mod abre información dentro de su instancia: archivo, versión, loaders, autoría disponible, tamaño, SHA-1, origen, descripción y dependencias declaradas. El panel sigue los metadatos actuales y se cierra si desaparece el archivo; cambiar de instancia no arrastra información anterior. Escape/cierre devuelve el foco al nombre o al buscador si el archivo ya no existe. La descripción tiene scroll por teclado y se muestra como texto, sin interpretar HTML ni activar enlaces de metadatos.

Las utilidades existentes mod/modDependencies/modCompatible pasan a runtime-api sin Vue. Los adaptadores Vue conservan markRaw del modelo, arrays y metadatos anteriores; las pruebas comparan el JSON y los objetos raw. React normaliza una copia privada del snapshot congelado. No se reescribieron los algoritmos de loader, proporciona/dependencias o rangos. El API declara @xmcl/semver como dependencia del workspace existente:3 líneas nuevas en lockfile, sin nuevas versiones externas ni cambios de compilador global.

## Validación

- **627 unitarias /71 archivos**,7 nuevas y2 casos de loader existentes añadidos a la selección CI. Snapshot congelado, Fabric/híbridos/Forge/NeoForge/Quilt/LiteLoader, autores, provides, rangos y cierre transitivo de activación/desactivación; paridad JSON/raw de Vue. Tipos y lint raíz aprobados. E2E global conserva56 diagnósticos previos, ninguno en35/helper. Detector:0; harness:9.
- **87 React +1 StrictMode +3 Vue =91 escenarios distintos**. Primera focal9/9 en27,1s; no se suma otra vez al total. Vue recompilado desde los nuevos adaptadores y dist/default restaurados.
- Nuevo recorrido nativo: metadatos desde un JAR real de fixture, descripción HTML literal sin elementos/script, hash contrastado con bytes, actualización del archivo, cierre tras desactivación, aislamientoA/B, Escape/Tab/Shift+Tab/End, claro/oscuro y1200×720/800×400.
- **107 auditorías Axe,0 violaciones y182 incomplete**,152 PNG de React por test. Revisadas la parte superior oscura1200 y dependencias claras800. Scroll entre campos y dependencias accesible; no certificación manual AA.

Preparación: se completó instalación frozen tras faltar un tarball ya fijado en caché offline; un test nuevo se ajustó al comportamiento semántico legacy real, sin cambiar el algoritmo. Las fixtures incorporan File/RuntimeVersions completos para pasar tipos, sin relajar configuración. Las pruebas funcionales focales y la regresión completa finalizaron aprobadas. Comandos, blobs Git, binarios al capturar y artefactos ignorados propios de cada run: STAGE5-MOD-INFO.json. El CI anterior40504806956(61f86c7) pasó; el nuevo push requiere su ejecución.

## Pendiente

Esta pantalla muestra dependencias declaradas y no afirma compatibilidad integral. El helper histórico enumera dependencias Fabric/Forge/NeoForge; las de Quilt/LiteLoader y sus límites requieren revisión al conectar diagnósticos. Faltan también diagnósticos completos, revisión de dependencias al activar/desactivar, actualización con manifests/proveedores, reglas compartidas de grupos, packs/shaders,mundos/ajustes/consola y etapas6–9. Java/juego/NSIS/delta, seguridad/accesibilidad final y calibración de la versión final no certificados. Microsoft pospuesto y producción intacta.
