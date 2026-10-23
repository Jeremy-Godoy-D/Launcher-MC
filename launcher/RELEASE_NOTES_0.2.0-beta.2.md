# Launcher MC v0.2.0-beta.2 — corrección de descargas

Corrige el botón **Descargar instalador (.exe)**: ahora abre el archivo público de GitHub aunque haya un token configurado. El endpoint de la API queda reservado para las descargas internas autenticadas, de modo que el navegador no muestra el JSON del archivo.

[**Descargar directamente el instalador v0.2.0-beta.2**](https://github.com/Jeremy-Godoy-D/Launcher-MC/releases/download/v0.2.0-beta.2/LauncherMC-0.2.0-beta.2-win-x64.exe). Usa este enlace si el botón de tu versión anterior muestra JSON.

Los indicadores de carga de actualización tienen nombres accesibles para lectores de pantalla.

El diálogo mantiene visibles los botones en 1200×720 y 800×400, con scroll independiente para notas largas. Las actualizaciones manuales muestran **Ver actualización** y no abren el navegador automáticamente.

## Actualizar

Cierra el launcher y ejecuta el instalador completo de esta versión. Si el botón de tu versión anterior abre JSON, descarga el EXE directamente desde los archivos de este release. Conserva tu carpeta de datos, instancias y mundos. El ZIP también está disponible.

Se mantiene Aurora Glass y CurseForge mediante su proxy. La distribución usa paquetes completos para evitar el actualizador ASAR antiguo de beta.3. Los archivos SHA-256 permiten comprobar la integridad; el instalador no tiene firma Authenticode.

La regresión reproduce el enlace incorrecto en el paquete beta.1 y comprueba el clic completo con un token de prueba, la URL pública y el diálogo en ambos tamaños. Microsoft continúa pospuesto; siguen pendientes la partida real y ejecutar NSIS en Windows aislado.
