# Etapa 4 — primer bloque: perfiles locales

Código: `cd6b9aeb006761115c031a9b9247e7fb694c8112`, validado en Windows el 2026-10-24. **Etapa 4 sigue activa; ninguno de sus criterios se declara completo.** Esta evidencia cubre crear, seleccionar y eliminar perfiles, no todo el onboarding ni la paridad de cuentas.

## Cambios

La ruta `/accounts` y el botón del avatar leen el UserState real. Crear usa UserService.login con autoridad local; seleccionar y eliminar usan los servicios existentes. No hay login de Microsoft ni captura de credenciales. Las cuentas externas guardadas se muestran y conservan su selección anterior sin sustituirla silenciosamente. Sus acciones de autenticación permanecen pospuestas.

La selección conserva la clave y el formato de `selectedUserId`, sincroniza ventanas, se recupera al volver a montar y permite uso temporal si el almacenamiento falla. No se vacía localStorage. No se crean cuentas al montar. El borrado requiere confirmación, mantiene el diálogo ante error y devuelve el foco al disparador o al formulario si el disparador desaparece. El texto distingue retirar el perfil de borrar instancias/mundos. Los nombres inválidos o duplicados conservan el formulario y muestran recuperación.

Seguridad/datos: UserService.selectUserGameProfile ahora usa la cuenta actual del backend y comprueba que el perfil exista. Una copia antigua enviada por la interfaz no puede sobrescribir los demás perfiles. La eliminación de perfiles de juego queda restringida en backend a cuentas locales, como establece su contrato. El validador de nombres locales se comparte entre UI/runtime y rechaza espacios, caracteres no permitidos y saltos de línea finales. Los datos antiguos no se reescriben como migración.

## Validación

Comandos desde `launcher`, salvo harness desde la raíz:

- `pnpm exec vitest run scripts/renderer.test.ts xmcl-react-ui/src packages/renderer-client xmcl-runtime/service/ServiceStateContainer.test.ts xmcl-runtime/service/ServiceStateManager.test.ts xmcl-runtime/user/UserService.persistence.test.ts`: **63 aprobadas en 12 archivos**, 2,94 s. Incluye pruebas anteriores y el caso de selección con snapshot antiguo/campos falsificados.
- `pnpm check` y `pnpm lint`: aprobados, cero warnings/errores de lint en la ejecución final.
- `LAUNCHER_RENDERER=react pnpm build:renderer` y build Electron: paquete Windows actualizado.
- Ejecutable React, specs propias 01/02/05/06: **6 aprobadas, 28,5 s**, regresión de interfaz, medios, ventanas y preferencias, más perfiles reales.
- Spec 06 ampliada, sobre el mismo paquete: **2 aprobadas, 10,8 s**. Cuatro vistas de cuentas claro/oscuro en 1200×720 y 800×400; cero violaciones Axe detectadas, cuatro entradas incomplete agregadas. Se inspeccionaron capturas y no se observó scroll horizontal o controles superpuestos.
- La spec 06 comprueba crear dos perfiles, rechazar nombre inválido/duplicado, seleccionar y recargar, cancelar borrado y restaurar foco, confirmar borrado, leer user.json tras la persistencia diferida, retirar el último perfil y conservar un archivo de mundo de prueba. Otro caso conserva una cuenta externa sintética y su selección al eliminar un perfil local.
- Vue por defecto con host recompilado, spec 03: **1 aprobada, 6,2 s**. Se mantienen la mutación de instancias y la selección de un perfil usando una copia anterior a la creación de otro; el selector Vue refleja el perfil correcto.
- `node --test launcher/scripts/react-migration.test.mjs`: **9 aprobadas**. El check de integridad también pasa.
- Detector mecánico de Impeccable sobre los nuevos componentes/estilos: sin hallazgos. No sustituye la revisión visual ni la auditoría manual de accesibilidad.

La primera prueba nativa leyó user.json antes de la escritura diferida y falló con ENOENT. Se mantuvo la comprobación en disco y se corrigió la espera para reintentar la ausencia temporal del archivo. La ejecución final comprueba tanto los perfiles restantes como el marcador vacío persistido.

## Límites y siguiente bloque

Los recorridos usan perfiles temporales, no la instalación habitual ni un instalador; no inician Minecraft. No se publicó, no hubo push/PR, no se modificaron el proxy/actualizador ni ANALISIS_ARQUITECTURA.md. El workflow se amplió con estas pruebas, pero todavía no se ejecutó en GitHub.

Pendientes de la etapa 4: onboarding real con ruta validada, edición/apariencia de perfiles locales, integración completa de Inicio/Biblioteca/selección de instancia y crear/importar/lanzar con todas sus comprobaciones. Inicio/catálogo/instancia siguen usando fixtures identificadas; `/accounts` ya muestra datos reales. No inferir paridad K17/K22 ni cerrar `onboarding-accounts` a partir de este bloque.

Siguiente: conectar `bootstrap.preset`/`bootstrap.bootstrap` al inicio guiado de tres pasos. Revisar la validación y confirmación nativa de la ruta antes de guardar; conservar campos/reintentos, elección de perfil y ningún lanzamiento automático. No ejecutar llamadas de instalación/lanzamiento desde efectos. Después sustituir los fixtures de Inicio/Biblioteca por servicios reales, conservando el diseño aprobado y recursos propios de packs.
