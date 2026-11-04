# Etapa 5 parcial — rutas persistidas de instalación

Fuente `f25aab41d18b3edb6261317f01631ec61a27dc87`. No cierra etapa5 ni K08.

Los perfiles pendientes solo admiten workspace bajo `.install/<operación>/files`, backup bajo `.backups/<carpeta>` y el perfil dentro de `.install` o el archivo legacy conocido. Se comprueban los ancestros existentes y el archivo de perfil sin seguir enlaces, antes de leer/preparar y en cada recarga/publicación/limpieza. Un cambio de rutas durante la operación falla. `.backups` queda reservada frente a manifiestos/importación, como el resto del estado privado del instalador.

La recuperación legacy no mueve ni borra la carpeta externa por coincidir con un prefijo guardado en JSON: conserva sus archivos, cambia a staging privado y vuelve a preparar lo que falta. También conserva los workspaces externos cuando otro plan los sustituye. Los archivos ya publicados y válidos se pueden reutilizar; un perfil externo desconocido se rechaza sin reescribirlo. Los tests mantienen las instalaciones concurrentes, el progreso parcial y la conservación de modificaciones.

Validación:701unitarias/77archivos,7nuevas;44focales. Tipos raíz y lint pasan. Ambos renderers/hosts reconstruidos;14React empaquetados en35,2s y3Vue en21,7s pasan.10auditorías Axe:0violaciones/24incomplete,19PNG. E2E types conserva56errores previos, ninguno en38. Harness9pruebas; dist/defaultVue restaurados.

CI40617567629 del bloque anterior falló dos pruebas de archivos al superar5000ms; React fue cancelado por fail-fast. Se ampliaron solo esas dos a15000ms con todas sus aserciones intactas. No cambia el timeout global ni una política de rendimiento. El primer test legacy nuevo partía de un target ya publicado; se corrigió la fixture para exigir recuperación real de un archivo ausente, manteniendo la comprobación de descarga y conservación del original. Logs fallidos y advertencias quedan conservados.

Comandos, fuentes Git, hashes de paquetes al capturarlos y artefactos ignorados están en STAGE5-INSTALL-PATHS.json. Requiere CI nuevo después del push. Sin prueba real de Java/juego/NSIS/delta ni nueva calibración. Microsoft pospuesto y producción/proxy intactos.

Siguiente: comprobar enlaces dentro de cada ruta de destino, staging y backup antes de lectura o publicación, conservando los shared links propios de packs/shaders/mundos. Los preflights lstat no son una transacción del FS. Después preservar.disabled en el manifiesto compartido y conectar actualización/revisión/proveedores/cola, packs/shaders,mundos/ajustes/consola y6–9. No anidar LockKey.instance alrededor del instalador ni reclamar rollback total.
