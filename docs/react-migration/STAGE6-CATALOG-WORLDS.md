# Mundos desde el catálogo con importación confirmada

Aplicación `969f7b7`, fixtures/workflow `e10e1ff`. Etapa6 sigue activa y K15/K16/catalog-install pendientes. Se conserva el trabajo aceptado de contenido y no se modifican runtime, Vue, instalador, datos habituales, proxy ni producción beta.2.

La versión CF de un mundo captura la instancia elegida y comprueba compatibilidad. Reutiliza la descarga nativa verificada, cancelable y privada del catálogo. Solo después de obtener el archivo cierra la ficha y entrega su origen a WorldFilesDialog. No usa installFromMarket para importar inmediatamente y no se crea una instancia nueva.

El importador existente muestra nombre y destino, permite corregirlos y exige previewWorldFiles/applyWorldFiles antes de publicar. Colisiones, revisión de bytes, locks, copias independientes y conservación del origen siguen en los servicios actuales. El nombre inicial elimina caracteres de rutas; el servicio mantiene su validación definitiva. Elegir otro ZIP/carpeta local elimina la referencia CF del archivo anterior para no atribuirle una procedencia falsa. Modrinth conserva el aviso de que este catálogo no ofrece mundos.

Se reutiliza el mismo traspaso de foco/scroll entre ficha e importador. Nunca se superponen dos diálogos; Escape devuelve el foco y cerrar el importador deja los mundos intactos. La cancelación conserva la ficha para reintentar y un fallo de checksum impide abrir el importador. Los textos de progreso/error compartidos ahora describen archivos de catálogo.

| Validación | Resultado |
| --- | --- |
| Unitarias afectadas | 12/1archivo; incluye mundo CF, fuente inválida, propietario y extensión |
| Evidencia de suite completa conservada | 1460/143/e974e30; no se afirma una nueva suite completa1461 |
| pnpm check completo y pnpm lint | pasan,0errores; advertencias anteriores |
| E2E tsc | mantiene exactamente56 diagnósticos base, ninguno nuevo |
| React empaquetado969f7b7 | tres casos96/9,1s más13regresiones64/94/29,6s, sin reintentos |
| Superficie nueva | cuatro Axe,0violaciones/8incomplete, claro/oscuro y1200×720/800×400; captura compacta revisada |
| Host habitual | Vue restaurado/verificado con compile y dist existente; no se reconstruye ni repite Vue/DeskGap sin cambios |

Los tres casos96 verifican destino y bytes reales, nombre, colisión sin sobrescritura, .curseforge, proxy y ausencia de key/autorización/capacidad remotas, doble clic, una sola superficie, foco, cancelación HTTP/reintento, integridad y cambio a origen local sin identidad ajena. Las regresiones64 y94 conservan la importación local de mundos y la creación/importación de packs nuevos, incluidas sus comprobaciones anteriores. No se sustituyó fetch ni se utilizó DevTools/CDP.

Comandos desde launcher: check React y pnpm check; pnpm lint; Vitest modpack.test.ts con cuatro workers; E2E tsc/comparación; gen:testids; build:renderer y build Electron con LAUNCHER_RENDERER=react; Native96 y después64/94, workers1/retries0/max-failures1, EXE propio/es-ES. Para restaurar: LAUNCHER_RENDERER=vue y compile de Electron, comparando hashes del HTML con el dist Vue ya validado. La referencia Vue/DeskGap de STAGE6-CATALOG-CONTENT se conserva porque ningún archivo de esos consumidores/runtime cambió.

EXE/ASAR/HTML identificados en stage6-world-catalog-react-identity.json; restauración en stage6-world-catalog-vue-restored.json. Manifest ignorado stage6-world-catalog-manifest.json: **6e84cd849fd35c1b01d635273a2eb31dc529705e44a4664c1aee56eb120d537e**,10fuentes/39artefactos. Spec96 está añadido a CI. Run41443432293/9a64eb6: Vue success, React en curso al registrar; no reiniciar ese run.

Faltan actualizar modpacks existentes desde ficha/Biblioteca, estados de instalación por versión y dependencias de otra clase. Al implementar actualizaciones, openModpack.config incluye xmclCache: no copiar esa configuración entera ni sus argumentos; preservar la whitelist ya usada por creación. Seguir con7–9 y publicar0.3.0-beta.1 solo tras todos los gates. No se repitieron pruebas funcionales de Vue/DeskGap ni se ejecutaron partida, instalador, presupuesto de rendimiento o publicación; esas validaciones permanecen pendientes. Los incomplete de Axe siguen requiriendo revisión humana.
