# Etapa 5 parcial — archivos locales de mods

Aplicación y validación final `862c9d6`, 2026-10-27. Commits `93c55ef` (operaciones), `7aaad89` (bloqueo común), `2b7a357` (guardas/espera) y `862c9d6` (singular/plural). No cierra etapa5 ni K08; complementa STAGE5-GROUPS/WORKSPACE/AUTHORITY.

## Comportamiento

React permite añadir varios archivos desde el selector nativo, conservando los originales y sin reemplazar ningún destino existente. La cancelación no muestra éxito ni vacía la selección. Se admiten archivos regulares jar/zip/litemod; la API también conserva archivos desactivados. Se validan todos los destinos antes de copiar; la copia exclusiva rechaza una colisión creada después de revisar.

Retirar exige seleccionar y confirmar la lista exacta. El texto informa que es eliminación permanente, sin papelera; no toca mundos ni originales externos. El hash revisado bloquea archivos cambiados después de abrir la confirmación. Ante error, permanece abierta; cancelar/Escape devuelve el foco y el éxito vuelve al buscador. El destino queda capturado aunque se navegue A→B mientras se ejecuta.

Main valida instancia Java registrada, carpeta/archivos regulares y contención directa. La activación, desactivación, importación y retirada usan el mismo bloqueo de instalación/borrado de instancia; al adquirirlo comprueban de nuevo registro y procesos de juego seguidos por el launcher. El helper de copia conserva originales sin hardlinks. Los fallos llegan a React, sin éxito optimista. No se modificó el instalador de manifests ni se aplicaron cambios pendientes ajenos.

## Validación

- **618 unitarias / 68 archivos**, incluidas10 nuevas: copia/colisiones/enlaces/contención/hashes y guardas nativas al esperar el bloqueo. Tipos y lint raíz aprobados. E2E global conserva56 diagnósticos anteriores, ninguno en la nueva spec34/helper. Detector de fuentes:0; harness:9 aprobadas.
- **84 React +1 StrictMode +3 Vue =88 escenarios distintos**, ejecutables empaquetados, ventanas secuenciales. Vue recompilado y dist/default restaurados. No se suman repeticiones a ese total.
- Nuevos recorridos: añadir varios archivos, cancelar selector, cancelar/confirmar retirada, foco/Escape, colisión sin escrituras previas, archivo cambiado tras revisión, importación pendiente A→B y rechazo nativo de rutas no registradas/carpetas enlazadas.
- **103 auditorías Axe,0 violaciones,178 incomplete**;144 PNG de React conservados por test. Claro/oscuro,1200×720/800×400; título y acciones de confirmación en viewport. Revisión visual inicial oscura1200/clara800 y final clara800. No certificación manual AA.
- Primera focal17/18: el test leía antes de que existiera el archivo de una importación demorada; ahora reintenta solo ENOENT sin retirar las aserciones de contenido/aislamiento. La primera ejecución Strict omitió habilitar su servidor de harness; corregir la invocación produjo1/1 sin cambiar código. Una prueba unitaria previa dependía de20ms para cancelar un lock: ahora usa señales explícitas, conservando sus aserciones. Las ejecuciones fallidas se conservan, no se contabilizan como aprobadas.

`STAGE5-LOCAL-FILES.json` fija blobs Git, comandos, hashes de paquetes al capturar y artefactos ignorados propios de cada ejecución. El CI anterior40502027721(1a355a2) pasó; el siguiente push necesita su propia corrida.

## Límites y siguiente trabajo

La revisión/hash y el bloqueo coordinan los servicios del launcher; no son transacciones atómicas frente a procesos externos ni certificación de cortes de energía. Un fallo de E/S a mitad de lote puede dejar cambios anteriores aplicados: se propaga el error y se pide volver a leer. Las pruebas reales de enlaces en este Windows usaron junctions porque crear symlinks de archivo requiere privilegios; no se solicitó elevación.

La API anterior de Vue puede omitir hashes; conserva guardas de ruta/archivo y ahora propaga errores. El método legacy de instancia servidor conserva su implementación heredada, no tiene UI React y debe desconectarse en etapa8. Packs/shaders heredados requieren su propia revisión; este bloque no los certifica.

Siguiente: información de mods, diagnósticos/dependencias y actualización reutilizando utilidades existentes; luego packs/shaders,mundos/ajustes/consola. Reglas compartidas de grupos sin UI React siguen pendientes. Etapas6–9, seguridad/accesibilidad final, Java/juego/NSIS/delta reales permanecen necesarias. Microsoft pospuesto; producción intacta.
