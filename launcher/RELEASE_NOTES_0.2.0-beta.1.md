# Launcher MC v0.2.0-beta.1 — Aurora Glass

Rediseño completo de la interfaz: cristal esmeralda, centro de lanzamiento, dock inferior, biblioteca de instancias y navegación de contenido por instancia. Catálogo con filtros bajo demanda y fichas sobre los resultados; Ajustes con búsqueda y onboarding de tres pasos.

El fondo de burbujas se limita a 30 fps y se pausa al perder foco, minimizar, jugar o activar movimiento reducido/modo rendimiento. Se conservan los datos de instancias, cuentas locales, mundos y temas personalizados.

CurseForge está activo mediante un proxy de Cloudflare; su clave permanece en el servidor. Se verificaron búsqueda, ficha e instalación real de AppleSkin. El contenido HTML/SVG remoto se sanea y el nuevo actualizador verifica SHA-256 antes de aplicar paquetes ASAR.

## Actualizar desde beta.3

Esta transición requiere el **instalador completo `.exe` o el ZIP**. No se publica un paquete ASAR para que beta.3 omita su antiguo mecanismo de reemplazo automático.

1. Cierra Launcher MC.
2. Descarga `LauncherMC-0.2.0-beta.1-win-x64.exe` y ejecútalo en la ubicación del programa actual. Si usas el ZIP, reemplaza la carpeta del programa con todo su contenido.
3. Conserva tu carpeta de datos, instancias y mundos. No la borres al reemplazar el programa.

Los archivos `.sha256` permiten comprobar la integridad de las descargas. Los binarios **no tienen firma Authenticode**; Windows puede mostrar un aviso de editor desconocido.

## Validación y límites

Tipos y lint aprobados; 59 pruebas unitarias, 12 del proxy y 11 de Electron sobre la candidata local. Se comprobó la interfaz en 1200×720 y 800×400, incluida accesibilidad automatizada, persistencia y fallos de red. La prueba adicional con el ZIP público de beta.3 comprueba la selección de actualización manual y la conservación de una cuenta local, una instancia y un archivo de mundo de prueba al abrir la versión nueva.

Microsoft está pospuesto y no está configurado en esta entrega; utiliza un perfil local. Siguen pendientes la partida real, la ejecución completa de NSIS en Windows aislado y una revisión manual exhaustiva de accesibilidad/temas personalizados. Esta publicación conserva la etiqueta beta. El detalle técnico está en [IMPLEMENTACION_AURORA.md](IMPLEMENTACION_AURORA.md).
