# Importación local de shaders

Fuente `cd127dffc263991cd3d2ac5a598c4f4144c5bf18`. Continuación de STAGE5-SHADER-SELECTION.md; K10 y etapa 5 permanecen pendientes.

## Cambio

Añadir archivos ZIP o una carpeta de shaders desde el selector nativo. Se copian mediante el instalador verificado existente, sin activar shaders ni cambiar sus configuraciones. La carpeta debe contener archivos bajo shaders/. Se conserva el comportamiento por defecto de resource packs; no se añadió una dependencia ni otro motor de copia.

El servicio exige una instancia Java registrada y autorización del destino. Comparte el lock global/instancia del arranque, bloquea el juego propio y la escritura común mientras otra partida usa esa carpeta. Una partida en una carpeta privada distinta no impide importar. Abrir la carpeta también valida la instancia y el origen autorizado en Native.

Las copias son exclusivas, con hashes SHA-256, límites de selección/entradas y preflight de colisiones. Rechazan enlaces ajenos, enlaces internos de la carpeta fuente y nombres conflictivos. Los originales conservan sus bytes e inodos independientes. Un error de I/O durante la copia puede dejar una parte de un lote nuevo; el mensaje pide revisar y volver a leer, no promete rollback. Nunca se reemplaza silenciosamente el archivo que ya estaba instalado.

## Correcciones comprobadas

La primera prueba de importación detectó pérdida de foco: el refresco de configuración deshabilitaba otra vez Añadir después de devolverle el foco. Ahora sus acciones dependen del estado de archivos/copia y de procesos; leer la selección no impide importar. Se conserva el bloqueo de acciones que sí necesitan una selección actual.

La comprobación de seguridad reproduce un destino sustituido por una junction ajena mientras se calcula el hash de la fuente. Antes del arreglo, las dos variantes resourcepacks/shaderpacks resolvían la importación; la prueba fallaba. Ahora, antes de cada archivo/carpeta del lote, se revalida la autorización e identidad del destino; ambas pruebas rechazan la operación y la carpeta ajena conserva sus bytes y no recibe el ZIP. Esto reduce la ventana entre validación y copia; no certifica aislamiento frente a toda modificación arbitraria del sistema de archivos por otro proceso del mismo usuario.

## Validación

- **920 unitarias en 95 archivos**, aprobadas en 21,63 s. 41 focales de instalador/servicios aprobadas, incluidas las dos reproducciones de sustitución de destino.
- pnpm check y pnpm lint completos aprobados. Después de las correcciones: checks/lint de React y runtime aprobados, 0 avisos de lint. E2E tsc mantiene los mismos 56 diagnósticos anteriores, sin nuevos en 53 ni en los archivos afectados.
- React empaquetado: **12 escenarios distintos aprobados**. 53 importa ZIP/carpeta, verifica independencia de fuente, configuración intacta, ausencia de activación automática, activación posterior y persistencia, mundo/otra instancia, colisión, cancelación y retorno de foco. 52 repite sus 7 casos de selección/motores; 44 repite los 3 de archivos de resource packs. Tras corregir el foco, 53:2/2 en 7,4 s; 52+44:10/10 en 31,4 s. El primer lote 11/12 queda conservado como diagnóstico, no como aceptación.
- Vue empaquetado actual: 03/08/33/45, **4/4 en 20,4 s**. El último host y dist compartido quedan en Vue. El renderer Vue ya construido no cambió; se recompiló su host con el runtime nuevo.
- Shaders: **12 Axe, 0 violaciones, 20 incomplete** en ambos temas/tamaños y tres estados de motor. Se comprobaron las capturas actuales y las cuatro acciones de importación son alcanzables con foco/scroll en 800×400. Incomplete requiere revisión de contraste sobre fondos superpuestos; no se declara AA manual completo.
- ZIP/JAR y texto shader son fixtures sintéticas; no se ejecutaron shaders ni Minecraft. No se usó la instalación habitual.

Comandos desde launcher: pnpm exec vitest run con la lista del workflow; pnpm check; pnpm lint; pnpm --dir e2e exec tsc --noEmit; pnpm gen:testids con LAUNCHER_RENDERER=react. Renderer React y ambos hosts construidos por los scripts existentes. Playwright contra los EXE propios con XMCL_E2E_LOCALES=es-ES:53, después52/44; Vue03/08/33/45. Logs stage5-shader-import-* conservan cada intento, resultado y build. El build intermedio focus previo a aplicar la corrección no es el host final; el último React es react-authority-build.

Manifiesto ignorado launcher/e2e/artifacts/stage5-shader-import-manifest.json, SHA-256 `446fc3cfecff26c7286623b5f99b88a0ea856dfa3d012861b30db80d80834621`: 10 blobs Git canónicos y 188 artefactos, incluidos ambos EXE/ASAR. No recorre las junctions protegidas.

## Continuación

Retirada revisada con backups, información/grupos, compartidos y actualizaciones de shaders; después mundos, ajustes y consola, y etapas6–9. K08/K09/K10 y todas las gates5 siguen pendientes. CI40983888898 sobre eee6361 seguía activo al comprobarlo: Vue aprobado y React en ejecución; hace falta conocer su resultado y el CI del nuevo push. No se publica todavía; producción/proxy intactos y Microsoft pospuesto. Siguen pendientes Java/juego reales, NSIS/delta aislados y validación final. Conservar las restricciones de archivos y limpiezas de AGENTS.md.
