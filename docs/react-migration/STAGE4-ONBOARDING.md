# Etapa 4 — inicio guiado y confirmación nativa

Código: `0b3c7137f463da852ccd88e89753b3d5b5093c1d`, validado en Windows el 2026-10-24. **La etapa 4 sigue activa y sus tres criterios pendientes**: faltan instancias reales y operaciones del recorrido principal; el criterio de cuentas también conserva edición/apariencia pendiente. Este bloque amplía STAGE4-ACCOUNTS sin sustituir sus evidencias históricas.

## Comportamiento conectado

El parámetro `bootstrap` abre un inicio guiado real de tres pasos: ubicación, perfil local y revisión. Reutiliza LocalProfileForm/AccountsProvider y los puentes existentes. Preset se consulta una vez incluso en Strict Mode; una carga fallida se puede reintentar. La validación de carpeta ocurre al confirmar una acción, sin escribir/pruebas de permisos en cada pulsación. Se conservan campos ante error, se solicita confirmación para carpetas no vacías y se permite seguir sin perfil. Terminar registra la ubicación, retira el parámetro y abre Biblioteca; no llama a instalar/lanzar Minecraft. La biblioteca aún es la vista previa hasta el siguiente bloque.

El paisaje Vanilla empaquetado llena la ventana. El panel usa el cristal/tokens existentes, fallback opaco y rendimiento sin blur. Hay una etapa a la vez, foco en su título, contenido desplazable y acciones fuera del scroll. Se probaron 1200×720 y 800×400, claro/oscuro. Textos nuevos en español/inglés; Microsoft permanece pospuesto.

## Frontera de seguridad del bootstrap

- Electron exige su ventana principal, frame superior y el origen/ruta exactos del documento incorporado. Se rechazan otra ventana, subframes y orígenes que solo comparten un prefijo con el host.
- Main valida tipo, longitud, caracteres de control y ruta absoluta; normaliza la ruta y usa el validador nativo existente. En Windows impide ubicaciones bajo Windows o el ejecutable, sin depender de mayúsculas/minúsculas.
- La sesión deduplica solicitudes idénticas y rechaza otra ruta mientras hay una operación o después de confirmar. Errores de validación o preparación permiten reintentar. Un fallo después de activar la raíz deja la sesión cerrada a reemplazos y puede requerir reinicio.
- La preparación crea la carpeta aceptada y escribe `root` de forma atómica. La promesa solo se resuelve después de registrar los directorios del runtime. El onboarding nuevo no recibe un éxito anticipado ni un fallback silencioso a otra carpeta. Se mantiene el comportamiento previo de recuperación para raíces ya existentes; su revisión integral no se declara terminada aquí.
- No hay IPC genérico nuevo, credenciales en renderer o cambios en el proxy/actualizador. El contrato y sus garantías también se probaron con el onboarding Vue.

## Validación ejecutada

Desde `launcher`, salvo harness desde raíz:

| Comando / recorrido | Resultado |
| --- | --- |
| `pnpm exec vitest run scripts/renderer.test.ts xmcl-react-ui/src packages/renderer-client xmcl-runtime/service/ServiceStateContainer.test.ts xmcl-runtime/service/ServiceStateManager.test.ts xmcl-runtime/user/UserService.persistence.test.ts xmcl-runtime/setup/bootstrapSession.test.ts xmcl-electron-app/main/utils/bootstrapSender.test.ts` | **69 aprobadas en 14 archivos**, 2,19 s. Incluye reintento, concurrencia, espera de activación, cierre tras fallo, raíz Windows/exe, sender/documento y errores de reproducción. |
| `pnpm check` / `pnpm lint` | Aprobados; cero warnings/errores de lint en la ejecución final. |
| Renderer React y build Electron | Paquete Windows x64 actualizado. |
| Ejecutable React, specs 01/02/05/06/07 | **9 aprobadas, 34,7 s**. Regresión visual/medios, ventanas, preferencias, cuentas e inicio nuevo. |
| Host Vue recompilado, specs 03/08 | **2 aprobadas, 10,1 s**. Instancias/perfiles y onboarding anterior completo mediante el nuevo contrato. |
| DeskGap tipos y build producción con renderer React | Aprobados; no se ejecutó el host nativo. |
| `node --test launcher/scripts/react-migration.test.mjs` | **9 aprobadas**; el check de integridad también pasa. |

La spec 07 comprueba un bootstrap relativo rechazado desde el frame válido, otro rechazado desde una ventana auxiliar, corrección de ruta, rechazo de archivo como carpeta sin modificarlo, consentimiento para carpeta con archivos y conservación de su marcador. Crea un perfil local antes de terminar, conserva su selección al volver atrás, confirma el archivo `root`, verifica cero procesos de juego y que recargar no repita el wizard. Otros casos terminan sin perfil y fuerzan un fallo del preset en el proceso de la fixture para comprobar Reintentar; esa simulación no existe en el producto.

Cuatro informes Axe del inicio guiado: cero violaciones detectadas y cuatro entradas incomplete agregadas. Se revisaron capturas finales de ubicación/perfil, ambos tamaños y variantes; no equivale a la auditoría manual AA/RTL completa. El detector mecánico señaló tres tamaños fuera de DESIGN.md; se cambiaron a 40/26 px y se volvió a renderizar/probar.

## Reproducción y fallos encontrados

Varias regresiones ampliadas fallaron al exigir reproducción inmediatamente después de restaurar. La comprobación de foco no bastó: el diagnóstico de estados mostró foco/visibilidad activos y `hovered=true`, sin error del vídeo. Windows había restaurado la ventana bajo el puntero físico; la pausa por interacción era correcta. La prueba ahora restablece el puntero fuera de la tarjeta y comprueba esa precondición, sin desactivar la política.

Se detectó además que la cancelación de un `play()` pendiente podía marcar el vídeo como fallido para siempre. Se ignoran `AbortError` y resultados de efectos obsoletos; fallos reales de permisos/códec mantienen poster/fallback. Una prueba nativa provoca una interrupción de reproducción, reactiva mediante preferencias y comprueba reproducción efectiva; también confirma pausa al minimizar y recuperación al restaurar con foco y sin interacción. Los atributos de diagnóstico contienen únicamente booleanos de actividad, sin datos personales.

Los fallos anteriores se conservan en artefactos ignorados; la ejecución final completa pasó. Los logs de rechazo de bootstrap/preset son esperados por los casos negativos y no se ocultan como errores de renderer.

## Continuación y límites

No hubo push, PR, publicación ni instalador; solo fixtures temporales y ejecutable empaquetado. No se probó una partida real, OAuth Microsoft, host DeskGap nativo, ni se midió rendimiento60s. ANALISIS_ARQUITECTURA.md permanece intacto. La seguridad descrita es la del bootstrap; no una certificación de toda la app ni de sus servicios antiguos.

Siguiente: Inicio/Biblioteca con InstanceState real, selección persistida por ruta, carrusel independiente de esa selección, recursos propios de packs y estados vacíos/carga/error. Luego crear/importar/instalar/lanzar mediante los contratos actuales, capturando instancia/cuenta y conservando Java, versión, reparación, memoria y estado de procesos. No presentar éxito ni seleccionar otra instancia silenciosamente. No volver a implementar el onboarding ni pedir otra aprobación del diseño. La edición/apariencia de perfiles y la elección final Crear/Importar aún requieren completar sus flujos antes de cerrar el criterio de cuentas.
