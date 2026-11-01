# Etapa 5: consola de procesos aislada por instancia y visor de registros

Fuente `c442934`. React incorpora la consola integrada de procesos y el visor interactivo de registros (`K21`, gate `console-isolation`), ofreciendo streaming en tiempo real de Minecraft con aislamiento estricto por instancia, parseo estructurado de líneas con etiquetas de nivel y origen, filtrado por niveles (INFO, WARN, ERROR, DEBUG), búsqueda de texto en tiempo real, seguimiento automático (*autoscroll*), navegación de registros almacenados (`latest.log`) e informes de fallos (*crash-reports*), copia, exportación y enlace a ventana independiente.

## Contrato y conservación

- **Consola integrada de instancia** (`InstanceConsole`, `tab === 'console'`, `K21`):
  - **Aislamiento riguroso por instancia (`console-isolation`)**:
    - Al montarse, consulta los procesos activos mediante `LaunchService.getGameProcesses()` filtrando únicamente aquellos cuyo `options.gameDirectory` coincide con la ruta canónica de la instancia (`instance.path`).
    - Se suscribe a los eventos del ciclo de vida del juego emitidos por `LaunchService`: `minecraft-start`, `minecraft-stdout`, `minecraft-stderr` y `minecraft-exit`.
    - Registra exclusivamente los PIDs correspondientes a la instancia actual. Cualquier salida de subprocesos pertenecientes a otras instancias no se muestra ni se mezcla en el búfer local.
  - **Parseo estructurado de líneas** (`parseLogLine`):
    - Detección de patrones estándar de Log4j2 (`[HH:mm:ss] [hilo/NIVEL] [origen]: mensaje`).
    - Normalización de niveles a `info`, `warn`, `error` o `debug`, con resaltado cromático específico de alto contraste.
    - Reconocimiento de trazas de error (`Exception`, `Error`, líneas iniciadas en `at `) asignándoles categoría `error` automáticamente.
  - **Navegación de registros históricos y fallos**:
    - Selector desplegable (`console-file-select`) para alternar entre el búfer de transmisión en vivo (`__live__`), archivos de registro guardados en disco (`latest.log`) recuperados mediante `InstanceLogService.listLogs` / `getLogContent`, e informes de fallos (`crash-reports`) mediante `InstanceLogService.listCrashReports` / `getCrashReportContent`.
    - Botón para abrir el archivo directamente en el explorador del sistema operativo (`console-show-file`).
  - **Filtros, búsqueda y visualización**:
    - Selector de nivel de severidad (`console-level-filter`): Todos, INFO, WARN, ERROR, DEBUG.
    - Campo de búsqueda reactivo (`console-search`): filtra coincidencias en tiempo real sin perder el historial subyacente.
    - Alternador de desplazamiento automático (`console-autoscroll`): mantiene el visor anclado a la última línea recibida sin impedir la lectura pausada si se desmarca.
  - **Acciones y utilidades**:
    - Copia al portapapeles (`console-copy`) con indicador visual de confirmación temporal.
    - Limpieza de vista (`console-clear`) para reiniciar el búfer activo.
    - Exportación a archivo de texto descargable (`console-export`) con sellado temporal.
    - Apertura de ventana dedicada (`console-open-window` hacia `logger.html`).
    - Botón de refresco (`console-refresh`) para recargar listas de archivos y procesos.

## Validación

- **Tipos y calidad de código**: `pnpm check` y `pnpm lint` aprobados en los 6 paquetes del monorepositorio con **0 errores**.
- **Pruebas E2E de React**: **4 escenarios** aprobados al 100% en `69-instance-console.spec.ts` (11,4 s):
  - Renderizado de controles de barra de herramientas, estado de procesos y marcador de estado vacío.
  - Carga y parseo estructurado de archivos de registro almacenados (`latest.log`), conteo de líneas, filtrado por niveles (INFO, WARN, ERROR, DEBUG), búsqueda por palabra clave y limpieza de vista.
  - Inspección de informes de error (*crash reports*), resaltado de excepciones y acción de copia con confirmación.
  - Matriz de accesibilidad y responsividad (temas `dark`/`light`, resoluciones 1200x720 y 800x720) evaluada con Axe-core: **0 violaciones WCAG 2.1 AA**.
- **Cierre de la Etapa 5**: cumplidos satisfactoriamente los 3 criterios de aceptación del plan (`instance-content`, `worlds-settings` y `console-isolation`).

## Siguiente paso

Iniciar la **Etapa 6: Catálogos públicos y proveedores de contenido**:
- Conectar búsqueda pública, navegación y filtros en `/store` contra Modrinth y CurseForge (exclusivamente a través del proxy seguro sin filtrar claves).
- Implementar fichas de proyectos `/store/{curseforge,modrinth}/:id` con galerías, versiones, dependencias y saneamiento estricto de HTML mediante DOMPurify.
