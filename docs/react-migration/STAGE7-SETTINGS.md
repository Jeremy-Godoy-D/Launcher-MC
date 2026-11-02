# Etapa 7 — ajustes globales y superficie del actualizador

Bloque aceptado sobre aplicación `faa9c94`, anclas `8cc3b8b`, aislamiento de pruebas `826a9d8` y candidata final `8537d80`. La etapa 7 sigue activa; K18/K19/K20/K22/K23 conservan `pending`. Este informe no cierra sus criterios restantes ni autoriza saltar las etapas 8–9.

## Cambios

- `/setting` reutiliza la apariencia aprobada y añade búsqueda, cinco categorías, navegación lateral y selector en ventana mínima. Conserva los borradores al cambiar de categoría y protege la navegación con guardar/descartar/seguir aquí.
- General ofrece idioma persistido, ubicación actual, abrir carpeta, perfiles y ayuda local. Juego permite Java automático o un ejecutable validado, modos/límites de memoria, listas literales de argumentos, resolución y comportamiento de lanzamiento. Red permite fuente, proxy HTTP(S) y límites de conexiones. Se conservan comandos, variables, indicadores de autenticación y datos antiguos.
- `BaseService.editSettings` recibe exclusivamente cambios de preferencias del núcleo y sus valores revisados. El proceso principal valida campos, límites, proxy y grupos relacionados; serializa las escrituras y comprueba conflictos. Escribe mediante `atomically` antes de aplicar el cambio al estado. Un fallo de disco conserva el estado y el borrador; una mutación heredada durante la escritura provoca restauración y nueva revisión.
- El escritor automático heredado comparte la cola y usa escritura atómica. Sus fallos continúan registrándose sin rechazo no controlado. Las pruebas históricas de ajustes se incorporan a la selección CI y se alinean con los valores de producto ya existentes: español, Discord desactivado y telemetría desactivada.
- Actualizaciones muestra preferencias, versión instalada, notas saneadas y enlaces públicos verificados del repositorio/versión correspondiente. `apiUrl` nunca se abre como descarga. La UI conecta buscar/descargar/cancelar y confirmación de reinicio a los servicios existentes; impide instalar mientras hay partida/preparación o ajustes sin guardar. La revisión puede cancelarse y devuelve el foco. La transferencia e instalación completas aún requieren los recorridos siguientes.
- Las fixtures de Electron desactivan la consulta automática de inicio; las consultas explícitas permanecen disponibles. Fuera de E2E, un fallo de la consulta de inicio se captura. Se corrigió el nombre accesible del control de instancia vacía en la barra lateral compacta.

## Validación

| Comprobación | Resultado |
| --- | --- |
| Selección completa del workflow de migración, independiente, cuatro workers | **1.503 pruebas / 148 archivos / 29,86 s** |
| Pruebas afectadas | 36 aprobadas; 23 de persistencia/actualizador repetidas después del cambio de inicio |
| `pnpm check` completo | runtime-api, runtime, Electron/preload, Vue, renderer-client y React aprobados |
| `pnpm lint` | 0 errores; advertencias anteriores |
| Tipos E2E | Exactamente 56 diagnósticos base normalizados; ninguno añadido o retirado |
| React empaquetado | **4 casos nuevos / 19,1 s**, más 3 regresiones de preferencias/argumentos / 10,1 s |
| Vue empaquetado | **2 recorridos / 10,4 s**: shell/cuentas/instancias y onboarding |
| Axe nuevo | **8 informes, 0 violaciones automáticas y 8 comprobaciones incompletas** |
| DeskGap | Tipos y build con `NODE_ENV=production` aprobados; sin recorrido nativo DeskGap |
| Registro React | 176 anclas |

Los nuevos recorridos prueban selección de un Java real de Windows, selección inválida, vuelta a automático, RAM, argumentos con espacios/comillas/saltos y argumento vacío, persistencia en disco y recarga, proxy inválido, conflictos, idioma, navegación protegida y reintento tras bloquear la escritura de `setting.json`. La fixture del fallo solo transforma temporalmente ese archivo dentro de su perfil desechable y restaura el original. No toca la instalación habitual.

La prueba visual recorre General/Juego/Red/Actualizaciones en 1200×720 oscuro y 800×400 claro, movimiento reducido, notas maliciosas, URLs públicas y foco de confirmación. Se inspeccionaron capturas de Juego estándar y General/Actualizaciones mínimo. Las comprobaciones `incomplete` de Axe siguen requiriendo revisión; cero violaciones automáticas no certifica toda la accesibilidad.

Comandos desde `launcher`: Vitest con la selección de `.github/workflows/react-migration.yml`/`--maxWorkers=4`; `pnpm check`; `pnpm lint`; E2E `tsc --noEmit --project tsconfig.json` y comparación normalizada; `gen:testids` con `LAUNCHER_RENDERER=react`; build renderer seguido de build Electron; Playwright `99-global-settings`, `05-preferences-i18n` y `74-instance-arguments` sobre el EXE React, y `03-vue-compatibility`/`08-vue-onboarding` sobre el EXE Vue. Native siempre secuencial, workers 1, retries 0, max-failures 1. Las primeras pruebas detectaron problemas de fixture y el botón sin nombre; el recorrido final de 99 pasa completo sobre `8537d80`.

Logs, capturas y manifiesto permanecen ignorados. `stage7-settings-manifest.json`: **4a8d6fa0d917e9bcfb73eda6b9a39fd60d534a1a93a1ef00afab91f21cc92a35**, 20 fuentes y 35 artefactos. Identidades: `stage7-settings-a11y-react-identity.json` y `stage7-settings-vue-identity.json`. El host vuelve a Vue y su HTML coincide con el dist Vue previamente aceptado; la candidata React es independiente.

## Siguiente trabajo

1. Completar ubicación/migración de datos y limpieza de caché de medios. Antes de exponer la migración heredada, proteger destino vacío/relación entre rutas, enlaces y recuperación parcial: `app/migrate.ts` todavía puede sobrescribir destinos y no registra los movimientos parciales del último directorio fallido. Conservar ambas carpetas ante cualquier fallo; no probar sobre el perfil habitual.
2. Conectar `migration.html` al contrato existente de progreso/error/final, con sus 600×400 reales y suscripciones que puedan retirarse. Reutilizar logger/onboarding aceptados.
3. Probar el actualizador mediante servidor HTTP propio y redirecciones de solicitudes **del proceso principal**, sin sustituir `fetch`: consulta/error, descarga/verificación, cancelación y recuperación. No instalar en el perfil habitual. El instalador/actualización completos corresponden al Windows desechable de la etapa 9.
4. Completar caché/ayuda/tareas/notificaciones y controles globales, protección al cerrar la ventana con un borrador, revisión AA/teclado/RTL y arrastre. Corregir el borde/padding duplicado del buscador al integrar estos controles, sin rehacer la distribución.

Después: React predeterminado y retirada efectiva de extras/Vue del grafo distribuido (8); partida, Java/loaders reales, rendimiento/seguridad, instalador/actualización aislados, assets y publicación `v0.3.0-beta.1` (9). Microsoft sigue pospuesto. Producción `v0.2.0-beta.2`, proxy y credenciales permanecen intactos.
