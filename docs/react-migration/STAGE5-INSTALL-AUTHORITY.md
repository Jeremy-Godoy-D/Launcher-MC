# Etapa 5 parcial — autorización del instalador de archivos

Fuente: `33ef2a3023560fc94f162933fb5d522f4918bb4a`. Etapa5 y K08 siguen pendientes. Este bloque protege el acceso al instalador antes de conectar actualizaciones de contenido a React.

`InstanceInstallService` exige una instancia Java registrada, ruta absoluta y raíz de directorio real. Instalar, aplicar y reanudar rechazan procesos activos; se vuelve a comprobar registro, identidad del directorio y proceso después de esperas y antes de publicar. Una partida iniciada durante la preparación impide publicar el mod y conserva el perfil para reanudar al terminar. El guard no abre un juego para probarlo: el test del proceso usa el servicio con procesos controlados.

Los métodos de manifiesto y descarte revalidan dentro del lock de instancia, manteniendo el orden manifiesto→instancia. Preparar o descartar metadatos mientras se juega sigue permitido; aplicar archivos no. Las escrituras reutilizan el temporal exclusivo del bloque INSTALL-STATE y el descarte parcial preserva JSON inválido en vez de borrarlo silenciosamente. Los cinco lectores/reanudadores internos pasan a campos privados reales, inaccesibles mediante RPC genérico; getLegacyLock sigue público porque ModpackService lo usa.

Preview, instalación, manifiestos, overrides y deltas validan esquema y rutas relativas antes de leer los destinos. Se reserva instance.json y su temporal con sufijo real de16hex, además del temporal propio del instalador. Un primer intento reservaba cualquier sufijo y rompió la conservación de instance.json.tmp-custom: la regresión detectó el problema, se restringió la regla y se mantuvo el test original. No se borran archivos de usuario. Los callers de importación crean primero la instancia; sus recorridos nativos siguen pasando. Las fixtures concurrentes/progresivas ahora incluyen registro Java y LaunchService válidos.

## Validación

- 694 unitarias en77archivos, incluidas11 nuevas:7 de autorización y4 rutas reservadas. Focales58/3archivos. Tipos raíz y lint pasan.
- Ambos renderers y hosts recompilados. React empaquetado:11 escenarios en24,5s (imports14, shared24 y nuevas guardas38); Vue:3 en18,8s (03/08/33). Dist y selección predeterminada quedan Vue.
- Nuevo spec38 recorre el puente real: carpetas ajenas, raíz sustituida por junction, helpers privados inaccesibles, rutas de configuración rechazadas y manifiesto plantado como hardlink sin alterar el original.
- 10 auditorías Axe de los recorridos existentes:0violaciones/24incomplete;19capturas conservadas. No equivale a AA manual completo. El chequeo global e2e conserva56errores previos, ninguno en38.
- Harness9pruebas. CI40615348161 pasó ambos renderers sobre fdce3bc/cf2b77d; pertenece al bloque anterior. Este commit requiere su propio CI tras push.

Comandos, hashes de blobs Git, binarios al capturarlos y manifiesto de artefactos ignorados: STAGE5-INSTALL-AUTHORITY.json. Se conservan logs del fallo inicial, advertencias previas del build, dos avisos GPU de Chromium y la deprecación Buffer de Vue; los recorridos finalizaron aprobados.

## Siguiente acción y límites

Antes de updates, validar estado persistido: workspace/backup/profile no pueden autorizar rutas externas por estar en un JSON; rechazar .install enlazado antes de ensureDir y evitar mover/borrar un workspace legacy externo solo por su prefijo. Validar ancestros de destino sin romper los enlaces compartidos intencionales de packs/shaders/mundos. No anidar el lock de InstanceModsService alrededor de installInstanceFiles: el instalador toma ese mismo lock. Después conservar .disabled en el manifiesto de actualización, integrar proveedores/revisión/cola y continuar packs/shaders, mundos, ajustes, consola y etapas6–9.

Sin transacción completa ni garantía frente a corte eléctrico. Sin nueva calibración de rendimiento ni prueba real de Java/juego/NSIS/delta. Microsoft pospuesto; producción/proxy/secretos intactos y PR4 en borrador. No cerrar gates con estas evidencias parciales.
