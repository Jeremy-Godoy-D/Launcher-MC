# Harness de migración React

1. Leer PLAN.md, SCOPE.md, RESUME.md y PARITY.md. SCOPE registra el recorte posterior del usuario.
2. `node launcher/scripts/react-migration.mjs status` desde raíz muestra etapa y siguiente tarea.
3. `node launcher/scripts/react-migration.mjs check` comprueba hashes, orden de etapas, criterios/evidencias y archivos protegidos. Código de salida distinto de cero indica inconsistencia.
4. `node --test launcher/scripts/react-migration.test.mjs` prueba las garantías del harness.
5. `node launcher/scripts/react-migration.mjs inventory` regenera el inventario estático desde fuentes del checkout. Es una operación de escritura explícita; comparar el diff antes de aceptar una referencia nueva.

## Cerrar un criterio o una etapa

- Ejecutar la comprobación real y conservar su resultado. Resumir comando, referencia Git/paquete, perfil y limitaciones en un informe versionado; logs/capturas quedan en e2e/artifacts ignorados.
- En state.json, un criterio passed necesita evidence con rutas relativas y SHA-256 de archivos existentes. Una evidencia cambiada, ausente o fuera del repositorio falla.
- El hash asegura integridad del archivo, **no demuestra** que una prueba pasó ni que una captura fue revisada. No inventar evidencias o aprobaciones.
- La revisión visual de etapa 1 necesita además approval.source=user y una referencia textual a la respuesta real; los tests no la sustituyen.
- No quitar criterios para completar antes. El script verifica los diez grupos de criterios y su orden.
- Cuando todos los criterios de una etapa pasen, marcarla complete, activar la siguiente, actualizar currentStage, nextAction y RESUME. No declarar completa la migración por haber creado el harness.
- Si el usuario cambia el plan/alcance: documentar la decisión, revisar su impacto, actualizar deliberadamente los hashes de PLAN/SCOPE y sus referencias dependientes. El script no renueva hashes automáticamente para ocultar modificaciones.

## Preservación

Rama inicial codex/react-migration; referencia beta.2. El script verifica que ANALISIS_ARQUITECTURA.md conserva sus bytes y que las suites canónicas protegidas no cambian. No instala, publica ni elimina datos. El build público permanece Vue hasta etapa 8; al introducir el selector en etapa 2 actualizar el guard concreto del script y probar que Vue sigue siendo el default.

La preservación del archivo no versionado es obligatoria en el checkout original, identificado mediante un hash de su ruta. Un clon nuevo que no contiene ese archivo no falla por su ausencia; si está presente se verifica. No se copia el contenido privado al repositorio. Tras cerrar etapa 0, inventory rechaza sobrescribir el inventario de referencia.
