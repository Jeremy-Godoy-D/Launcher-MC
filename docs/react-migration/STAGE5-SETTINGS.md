# Etapa 5: resumen de instancia y ajustes base con herencia y restablecimiento

Fuente `33cf090`. React incorpora el resumen visual enriquecido de instancia y el panel completo de ajustes base (`K07`, `K12`, `K13`), incluyendo selector de entorno Java (detectados o manual), gestión de memoria RAM (automática/heredada o personalizada), argumentos de JVM y Minecraft, resolución de pantalla, servidor de partida rápida y opciones de lanzamiento con soporte de restablecimiento a valores globales y verificación de persistencia en disco.

## Contrato y conservación

- **Resumen enriquecido de instancia** (`InstanceWorkspace`, `tab === 'summary'`, `K07`):
  - Ficha de metadatos con versión de Minecraft (1.21.1), cargador de mods (Vanilla/Forge/Fabric/NeoForge/Quilt), tiempo total jugado y ruta física de la instancia.
  - Indicador de servidor de partida rápida configurado (`Destino rápido: host:port`).
  - Accesos directos integrados para navegación rápida hacia las secciones clave de la instancia: "Ajustes", "Mods", "Mundos" y "Consola".
- **Panel de ajustes base de instancia** (`InstanceBaseSettings`, `tab === 'settings'`, `K12`, `K13`):
  - **Entorno Java**: detección dinámica de versiones instaladas mediante `JavaService.getJavaState()`, selección manual mediante diálogo de archivo nativo del sistema (`showOpenDialog`) con validación en `javaService.resolveJava`, u opción de heredar la configuración global del launcher (`java: null`).
  - **Asignación de memoria RAM**: selector de modalidad entre heredar configuración global (`assignMemory: null`, `minMemory: null`, `maxMemory: null`) o memoria personalizada con campos numéricos para memoria mínima y máxima en MiB con cálculo y visualización en GiB.
  - **Argumentos de JVM y Minecraft**: campos de texto con división y filtrado seguro de argumentos para opciones de máquina virtual (`vmOptions`) y opciones del juego (`mcOptions`), admitiendo restablecimiento a configuración global (`null`).
  - **Resolución de pantalla**: modalidad heredada o personalizada (`width`, `height`, `fullscreen`).
  - **Servidor de partida rápida**: configuración de `server: { host, port }` con botón para desvincular o limpiar el servidor de partida rápida.
  - **Banderas de arranque**: alternadores para lanzamiento rápido (`fastLaunch`), ocultar launcher al iniciar (`hideLauncher`) y mostrar consola de registro (`showLog`).
  - **Acciones y persistencia**: botones accesibles para guardar cambios (`setting-save-btn`), restablecer a valores globales (`setting-reset-btn`) y descartar cambios sin guardar (`setting-discard-btn`).
  - **Semántica IPC y limpieza en disco**: uso de valor `null` en `instanceService.editInstance` para asegurar la eliminación de campos sobreescritos en `instance.json` y la restauración de los valores predeterminados globales.
  - **Guardas de seguridad**: advertencia interactiva y desactivación de campos si la instancia se encuentra en ejecución (`runningWarning`).

## Validación

- **Tipos y calidad de código**: `pnpm check` y `pnpm lint` aprobados en los 6 paquetes del monorepositorio con **0 errores**.
- **Pruebas E2E de React**: **3 escenarios** aprobados al 100% en `68-instance-settings.spec.ts` (10,9 s):
  - Visualización de metadatos, accesos directos y navegación a subrutas.
  - Configuración completa de memoria, JVM, resolución y servidor, guardado persistente verificado en `instance.json` en disco y restablecimiento a valores globales.
  - Matriz de accesibilidad y responsividad (temas `dark`/`light`, resoluciones 1200x720 y 800x720) evaluada con Axe-core: **0 violaciones WCAG 2.1 AA**.
- **Compatibilidad con Vue**: renderer por defecto conservado intacto en Vue.

## Siguiente paso

Implementar el último bloque de la Etapa 5 (`Espacio de instancia`):
- **Bloque E**: Consola de instancia (`K21`: `/instance/console` streaming aislado de procesos con filtrado por niveles, búsqueda de registros, alternancia de autoscroll, copia y exportación).
