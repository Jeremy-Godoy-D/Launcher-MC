# Registro de análisis con REA

Fecha: 20 de octubre de 2026. CLI existente: `rea-agents` 6.7.0, ejecutada con Node 24.20.0 en Windows x64. Skill consultada: `reverse-engineer-anything`, versión de instrucciones 42, repositorio [morluto/rea](https://github.com/morluto/rea).

## Operaciones realizadas

| Operación | Objetivo | Evidence ID |
| --- | --- | --- |
| `analyze_javascript_application` | ASAR completo 4.0.39 | `ev_81914d28e04e8ef922631494b24f0c97464167d73dad25da350edbe245b4b7c2` |
| `analyze_javascript_application` | Los 17 archivos del producto más el módulo de preload del toolkit | `ev_f9cc2aefecd0107c38859293a389670b24338659df5b2be0b96a6095d36a206e` |
| `inspect_electron_fuses` | Ejecutable Electron x64 | `ev_6a0bc2888555c95426123908e8f993f1778e37bf16b3e19d43aa5d75b433351d` |
| `inspect_artifact` | Bootstrap Java 3.2.18 | `ev_81b1e1f44ae78011c7e312527c18900c682d5ecd54d6e6a920b3dd2820c53e85` |
| `inspect_artifact` | JavaFX build 601 | `ev_db38620277c8157f332e9297b0129af336069ed9f306c77482e5cfa6d6a31883` |
| `inspect_artifact` | JavaFX build 602 | `ev_1426d174dbc197e95e7fca606d8cf84c88a97526522dc93339be71e8f5733722` |

Las seis operaciones finalizaron con código de salida 0 y generaron JSON completo en disco. Esto confirma que finalizaron las operaciones, **no que la cobertura de sus grafos sea completa**. [rea-summary.json](rea-summary.json) es una proyección hecha con Python; conserva los IDs de sus padres y no se presenta como un nuevo registro Evidence de REA.

## Qué devolvió el análisis JavaScript

| Métrica | Todo el ASAR | Selección enfocada |
| --- | ---: | ---: |
| JavaScript parseados | 3.797 | 15 |
| Bytes de texto leídos | 31.322.525 | 2.685.093 |
| Nodos del grafo de aplicación | 32.579 | 16.052 |
| Relaciones del grafo de aplicación | 43.487 | 17.464 |
| Nodos semánticos retenidos | 54.520 | 100.000 |
| Relaciones semánticas retenidas | 33.649 | 63.175 |
| Fallos de parseo informados | 1 | 0 |
| Cobertura del grafo | Parcial | Parcial |

La pasada global cubrió el inventario y las observaciones estáticas disponibles de todo el paquete. La expansión de miles de dependencias agotó el presupuesto de resultados y dejó, entre otras cosas, la semántica de varios archivos del producto sin comenzar. Se conservó esa salida y se cambió la entrada a una selección explícita para responder la pregunta pendiente sobre el núcleo y su interfaz.

La selección contiene `package.json`, los tres JS de main, preload, los diez JS del renderer, sus dos HTML y `node_modules/@electron-toolkit/preload/dist/index.cjs`. Sus rutas exactas están en `focused_application.source_selection` y `parameters`. Mantiene la identidad del inventario del ASAR completo; **5.071 archivos relevantes quedan fuera de su análisis de fuentes**. La semántica también es parcial: alcanzó límites de nodos/unknowns y no prueba ejecución. No se elevaron límites indefinidamente ni se interpretó una ausencia de observación como ausencia de función.

La salida global informa dos ventanas, 229 canales literales y operaciones IPC de varios tipos. La enfocada informa 228 canales literales y 199 transmisiones emparejadas. Esos conteos no tienen el mismo universo que los 196 handlers asíncronos propios del inventario manual. Las expresiones dinámicas se mantienen sin resolver.

`preload_entrypoints: 0` y `exposed_api_members: 0` son límites de resolución del grafo automático para estas expresiones minificadas; **no indican que la aplicación carezca de preload o API**. Sus archivos, exposiciones y llamadas se siguieron por inspección complementaria del AST. Tampoco `sender_validation_observations: 0` demuestra que toda validación esté ausente.

Los JAR se reconocieron como ZIP y REA inventarió sus entradas. Su estado `complete-within-substeps` se refiere a ese inventario, no al análisis semántico de JVM. Los flujos Java descritos proceden de `javap` y se etiquetan como tales.

## Evidencia original y reproducción

Las salidas originales están en `.analysis/rea-application.json`, `rea-firstparty.json`, `rea-fuses.json`, `rea-bootstrap.json`, `rea-java601.json` y `rea-java602.json`; el directorio está excluido de Git. Los dos primeros ocupan unos 249 y 278 MB decimales, respectivamente. Se conservaron también los mensajes de progreso en `*.stderr.txt`.

El punto de entrada CLI utilizado es:

```powershell
& 'C:\Users\jerez\Documents\Codex\2026-10-20\qui\work\rea-tool\node_modules\.bin\rea.cmd' analyze-javascript-application 'C:\Users\jerez\AppData\Local\Programs\sklauncher\resources\app.asar' --format json
```

Para la selección se agregaron pares `--source-path` con las rutas registradas. Para cada JAR se usó `inspect-artifact RUTA --format json`; para fuses, `inspect-electron-fuses RUTA_EXE --format json`. Estas operaciones analizan bytes; no ejecutan el programa objetivo. El inventario complementario puede regenerarse con `python -X utf8 analysis/inspect_local.py`; contiene aserciones de identidad y de supresión de valores privados.

El diagnóstico de REA encontró registro MCP ausente y motores nativos no configurados. Se usó el CLI existente, como admite la skill; no se cambió configuración, no se instaló un motor ni se reinició Codex.

La inspección de fuses y del preflight de REA explica por qué no se intentó el escenario activo. [rea-runtime.md](rea-runtime.md) distingue esa incompatibilidad de una hipotética observación pasiva por CDP, que sigue sin verificar. No se ejecutaron pruebas de login, instalación, actualización o juego.

## Verificación final

Se recalcularon los hashes de los cinco binarios principales: permanecen idénticos al inventario inicial. Se validó el formato de los seis JSON publicados, seis IDs Evidence y 78 enlaces locales, incluidos sus números de línea. Las aserciones de supresión de valores privados y la comprobación de esquemas pasaron. Las salidas grandes originales ocupan 545.356.199 bytes y están excluidas de Git. No hay código de un launcher nuevo ni tests de producto en esta fase; se verificaron los instrumentos y documentos de la investigación.
